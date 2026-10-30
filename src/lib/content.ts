import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import site from '../content/site.json';

// Alle teksten en foto's staan in src/content/*.json. De bewerkmodus (/beheer) past deze
// bestanden aan; elk element met data-e="<bestand>:<sleutel>" is op de site te bewerken.

export interface Inhoud {
  meta?: { title: string; description: string; ogImage?: string };
  t: Record<string, string>;
  i: Record<string, { src: string; alt: string }>;
}

export interface Beeld {
  key: string;
  src: ImageMetadata;
  alt: string;
}

const paginas = import.meta.glob<Inhoud>('../content/pages/*.json', { eager: true, import: 'default' });
const beelden = import.meta.glob<ImageMetadata>('../assets/img/**/*.{jpg,jpeg,png,webp,svg}', { eager: true, import: 'default' });

export function beeldBestand(src: string): ImageMetadata {
  const meta = beelden[`../assets/img/${src}`];
  if (!meta) throw new Error(`Afbeelding ontbreekt: src/assets/img/${src}`);
  return meta;
}

export function inhoudVan(naam: string): Inhoud {
  if (naam === 'site') return site as Inhoud;
  const inhoud = paginas[`../content/pages/${naam}.json`];
  if (!inhoud) throw new Error(`Content ontbreekt: src/content/pages/${naam}.json`);
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
  // Achtergrondfoto's vooraf optimaliseren: groot voor desktop, smal voor telefoon
  const achtergronden: Record<string, { breed: string; smal: string }> = {};
  await Promise.all(Object.entries(inhoud.i).map(async ([k, v]) => {
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
    return { key: `${naam}:${k}`, src: beeldBestand(v.src), alt: v.alt };
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
  return { t, img, bg, meta: inhoud.meta, achtergronden };
}

export async function laadPagina(naam: string) {
  return laad(naam);
}
