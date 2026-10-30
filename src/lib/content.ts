import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import site from '../content/site.json';

// Alle teksten en foto's staan in src/content/. De bewerkmodus (/beheer) past deze bestanden aan.
// Op de site heeft elk bewerkbaar element een verwijzing "<bestand>:<sleutel>":
//   data-e    tekst          data-ei   foto (<img>)        data-lijst  lijst met items (FAQ, reviews)
//   data-ea   tekst in een attribuut     data-eb / data-ef  achtergrondfoto
// <bestand> is "site", de naam van een pagina in content/pages, of "blog/<slug>" voor een artikel.

export interface LijstFoto { src: string; alt: string; positie?: string }
export type LijstItem = Record<string, any>; // tekst (html), link of foto (LijstFoto)

export interface Inhoud {
  meta?: { title: string; description: string; ogImage?: string };
  t: Record<string, string>;
  i: Record<string, { src: string; alt: string; positie?: string }>;
  l?: Record<string, LijstItem[]>;
}

export type ArtikelStatus = 'gepubliceerd' | 'concept' | 'binnenkort';

export interface Artikel extends Inhoud {
  meta: { title: string; description: string };
  artikel: {
    status: ArtikelStatus;
    categorie: string;
    datum: string;          // JJJJ-MM-DD
    eigenPagina?: boolean;  // heeft een eigen .astro-bestand in plaats van het standaardsjabloon
    gerelateerd?: string[]; // slugs voor "Lees ook"; anders de nieuwste andere artikelen
  };
}

export interface Beeld {
  key: string;
  src: ImageMetadata;
  alt: string;
  positie?: string;
}

export const CATEGORIEEN: Record<string, string> = {
  'huis-kopen': 'Een huis kopen',
  'huidige-hypotheek': 'Je huidige hypotheek',
  verzekeringen: 'Verzekeringen',
  ondernemers: 'Ondernemers',
};

const paginas = import.meta.glob<Inhoud>('../content/pages/*.json', { eager: true, import: 'default' });
const artikelBestanden = import.meta.glob<Artikel>('../content/blog/*.json', { eager: true, import: 'default' });
const beelden = import.meta.glob<ImageMetadata>('../assets/img/**/*.{jpg,jpeg,png,webp,svg}', { eager: true, import: 'default' });

export function beeldBestand(src: string): ImageMetadata {
  const meta = beelden[`../assets/img/${src}`];
  if (!meta) throw new Error(`Afbeelding ontbreekt: src/assets/img/${src}`);
  return meta;
}

/** Alle artikelen, nieuwste eerst */
export function artikelen() {
  return Object.entries(artikelBestanden)
    .map(([pad, inhoud]) => ({ slug: pad.replace(/^.*\/(.+)\.json$/, '$1'), ...inhoud }))
    .sort((a, b) => b.artikel.datum.localeCompare(a.artikel.datum));
}

export function inhoudVan(naam: string): Inhoud {
  if (naam === 'site') return site as Inhoud;
  const inhoud = naam.startsWith('blog/')
    ? artikelBestanden[`../content/${naam}.json`]
    : paginas[`../content/pages/${naam}.json`];
  if (!inhoud) throw new Error(`Content ontbreekt: ${naam}`);
  return inhoud;
}

const BREED = 2000;
const SMAL = 800;

async function achtergrond(meta: ImageMetadata, breedte: number) {
  if (meta.format === 'svg') return meta.src;
  const r = await getImage({ src: meta, width: Math.min(breedte, meta.width), format: 'webp', quality: 68 });
  return r.src;
}

export async function laad(naam: string) {
  const inhoud = inhoudVan(naam);
  // Achtergrondfoto's (sleutels met "foto") vooraf optimaliseren: groot voor desktop, smal voor telefoon
  const achtergronden: Record<string, { breed: string; smal: string }> = {};
  await Promise.all(Object.entries(inhoud.i).filter(([k]) => /(^|\.)foto\d*$/.test(k)).map(async ([k, v]) => {
    const meta = beeldBestand(v.src);
    achtergronden[k] = { breed: await achtergrond(meta, BREED), smal: await achtergrond(meta, SMAL) };
  }));

  const t = (k: string): string => {
    const v = inhoud.t[k];
    if (v === undefined) throw new Error(`Tekst ontbreekt: ${naam}:${k}`);
    return v;
  };
  const img = (k: string): Beeld => {
    const v = inhoud.i[k];
    if (!v) throw new Error(`Afbeelding ontbreekt: ${naam}:${k}`);
    return { key: `${naam}:${k}`, src: beeldBestand(v.src), alt: v.alt, positie: v.positie };
  };
  const lijst = (k: string): LijstItem[] => {
    const v = inhoud.l?.[k];
    if (!v) throw new Error(`Lijst ontbreekt: ${naam}:${k}`);
    return v;
  };
  // Achtergrond als inline style. background-image leest --bg, dat per schermbreedte
  // in basis.css wordt gekozen uit --bg-l en --bg-m. --foto wordt door de CSS zelf gebruikt.
  // Alleen de hero laadt direct; de rest zet script.js pas vlak voordat het in beeld komt
  // (data-foto), zodat die foto's niet concurreren met de eerste foto bovenaan.
  const bg = (k: string, prop: string, rest = '') => {
    const a = achtergronden[k];
    if (!a) throw new Error(`Achtergrond ontbreekt: ${naam}:${k}`);
    const extra = rest ? (rest.endsWith(';') ? rest : rest + ';') : '';
    const direct = k.startsWith('hero.');
    if (prop === '--foto') {
      return direct
        ? { style: `--foto: url('${a.breed}'); ${extra}`.trim(), 'data-ef': `${naam}:${k}` }
        : { style: `--foto: none; ${extra}`.trim(), 'data-ef': `${naam}:${k}`, 'data-foto': a.breed };
    }
    return direct
      ? { style: `--bg-l: url('${a.breed}'); --bg-m: url('${a.smal}'); background-image: var(--bg); ${extra}`.trim(), 'data-eb': `${naam}:${k}` }
      : { style: `--bg-l: none; --bg-m: none; background-image: var(--bg); ${extra}`.trim(), 'data-eb': `${naam}:${k}`, 'data-foto': a.breed, 'data-foto-m': a.smal };
  };
  return { t, img, bg, lijst, meta: inhoud.meta, achtergronden };
}

export async function laadPagina(naam: string) {
  return laad(naam);
}

/** Foto uit een lijst-item, klaar voor <Img> */
export const lijstBeeld = (foto: LijstFoto, key: string): Beeld => ({ key, src: beeldBestand(foto.src), alt: foto.alt, positie: foto.positie });

/** Voorletters voor de avatar bij een review: eerste letter + de volgende hoofdletter ("Ton Van Bedaf" → TV) */
export function initialen(html: string) {
  const woorden = html.replace(/<[^>]+>/g, '').trim().split(/\s+/);
  const tweede = woorden.slice(1).find(w => /^\p{Lu}/u.test(w));
  return ((woorden[0]?.[0] ?? '') + (tweede?.[0] ?? '')).toUpperCase();
}

/** Datum als "11 oktober 2026" */
export const datumTekst = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
