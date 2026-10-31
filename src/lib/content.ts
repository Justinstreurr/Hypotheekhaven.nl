import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import site from '../content/site.json';
import normenBron from '../scripts/normen.js?raw';

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

async function achtergrond(meta: ImageMetadata, breedte: number, format: 'webp' | 'avif' = 'webp') {
  if (meta.format === 'svg') return meta.src;
  // AVIF (alleen voor de eerste herofoto, de LCP) is bij gelijke beeldkwaliteit ongeveer 45% kleiner dan WebP
  const r = await getImage({ src: meta, width: Math.min(breedte, meta.width), format, quality: format === 'avif' ? 50 : 68 });
  return r.src;
}

export interface Achtergrond { breed: string; smal: string; breedAvif?: string; smalAvif?: string }
const isEersteHero = (k: string) => k === 'hero.foto1' || k === 'hero.foto';

// Cijfers uit normen.js (<span data-norm="...">) al bij het bouwen invullen, zodat ze ook in de HTML en
// de gegevens voor Google staan. De rekentools vullen ze in de browser opnieuw in, met dezelfde opmaak.
const N = (() => { const w: any = {}; new Function('window', normenBron)(w); return w.HH_NORMEN; })();
const procent = (f: number, dec = 2) => (f * 100).toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
const NORMTEKST: Record<string, string> = {
  jaar: String(N.jaar), maxAftrekTarief: procent(N.maxAftrekTarief), tariefSchijf1: procent(N.tariefSchijf1),
  grensSchijf1: Math.round(N.grensSchijf1).toLocaleString('nl-NL'), boetevrijPct: procent(N.boetevrijPct, 0),
  ewfPct: procent(N.eigenwoningforfait[N.eigenwoningforfait.length - 1].pct),
};
export const vulNormen = (html: string) => html.includes('data-norm')
  ? html.replace(/(<span data-norm="([^"]+)">)[^<]*(<\/span>)/g, (m, open, k, dicht) => k in NORMTEKST ? open + NORMTEKST[k] + dicht : m)
  : html;

export async function laad(naam: string) {
  const inhoud = inhoudVan(naam);
  // Achtergrondfoto's (sleutels met "foto") vooraf optimaliseren: groot voor desktop, smal voor telefoon
  const achtergronden: Record<string, Achtergrond> = {};
  await Promise.all(Object.entries(inhoud.i).filter(([k]) => /(^|\.)foto\d*$/.test(k)).map(async ([k, v]) => {
    const meta = beeldBestand(v.src);
    achtergronden[k] = { breed: await achtergrond(meta, BREED), smal: await achtergrond(meta, SMAL) };
    if (isEersteHero(k) && meta.format !== 'svg') {
      achtergronden[k].breedAvif = await achtergrond(meta, BREED, 'avif');
      achtergronden[k].smalAvif = await achtergrond(meta, SMAL, 'avif');
    }
  }));

  const t = (k: string): string => {
    const v = inhoud.t[k];
    if (v === undefined) throw new Error(`Tekst ontbreekt: ${naam}:${k}`);
    return vulNormen(v);
  };
  const img = (k: string): Beeld => {
    const v = inhoud.i[k];
    if (!v) throw new Error(`Afbeelding ontbreekt: ${naam}:${k}`);
    return { key: `${naam}:${k}`, src: beeldBestand(v.src), alt: v.alt, positie: v.positie };
  };
  const lijst = (k: string): LijstItem[] => {
    const v = inhoud.l?.[k];
    if (!v) throw new Error(`Lijst ontbreekt: ${naam}:${k}`);
    return v.map(item => Object.fromEntries(Object.entries(item).map(([a, w]) => [a, typeof w === 'string' ? vulNormen(w) : w])));
  };
  // Achtergrond als inline style. background-image leest --bg, dat per schermbreedte
  // in basis.css wordt gekozen uit --bg-l en --bg-m (WebP). De eerste herofoto heeft daarnaast
  // --bg-la en --bg-ma (AVIF), die basis.css via image-set() kiest als de browser dat ondersteunt.
  // De bewerkmodus zet alleen --bg-l/--bg-m en haalt --bg-la/--bg-ma weg. --foto wordt door de CSS zelf gebruikt.
  // Alleen de eerste herofoto laadt direct; de rest zet script.js pas vlak voordat het in beeld komt
  // (data-foto), zodat die foto's niet concurreren met de eerste foto bovenaan. Volgende dia's van de
  // hero (hero.foto2, ...) staan al "in beeld" maar zijn onzichtbaar: die laden pas na het load-event
  // (data-foto-later), ruim voor de eerste wissel na 5 s.
  const bg = (k: string, prop: string, rest = '') => {
    const a = achtergronden[k];
    if (!a) throw new Error(`Achtergrond ontbreekt: ${naam}:${k}`);
    const extra = rest ? (rest.endsWith(';') ? rest : rest + ';') : '';
    const direct = isEersteHero(k);
    const later = !direct && k.startsWith('hero.') ? { 'data-foto-later': '' } : {};
    if (prop === '--foto') {
      return direct
        ? { style: `--foto: url('${a.breed}'); ${extra}`.trim(), 'data-ef': `${naam}:${k}` }
        : { style: `--foto: none; ${extra}`.trim(), 'data-ef': `${naam}:${k}`, 'data-foto': a.breed, ...later };
    }
    return direct
      ? { style: `--bg-l: url('${a.breed}'); --bg-m: url('${a.smal}'); ${a.breedAvif ? `--bg-la: url('${a.breedAvif}'); --bg-ma: url('${a.smalAvif}'); ` : ''}background-image: var(--bg); ${extra}`.trim(), 'data-eb': `${naam}:${k}` }
      : { style: `--bg-l: none; --bg-m: none; background-image: var(--bg); ${extra}`.trim(), 'data-eb': `${naam}:${k}`, 'data-foto': a.breed, 'data-foto-m': a.smal, ...later };
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
