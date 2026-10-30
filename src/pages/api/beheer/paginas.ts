import type { APIRoute } from 'astro';
import { ingelogd } from '../../../lib/beheer';
import { artikelen, inhoudVan } from '../../../lib/content';
import { alleSeo } from '../../../lib/seo';

export const prerender = false;

// Overzicht van alle pagina's voor het menu in de bewerkmodus
const GROEPEN: [string, string[]][] = [
  ['Pagina\'s', ['home', 'diensten', 'werkwijze', 'verzekeringen', 'kredieten', 'over-sabrina', 'contact']],
  ['Rekentools', ['maandlasten', 'rentevast', 'checklist']],
  ['Blog', ['blog']],
  ['Overig', ['juridisch', 'niet-gevonden']],
];

const kaal = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s*\|.*$/, '').trim();

export const GET: APIRoute = ({ cookies }) => {
  if (!ingelogd(cookies)) return new Response(JSON.stringify({ ok: false, fout: 'Niet ingelogd' }), { status: 401 });
  const seo = alleSeo();
  const groepen = GROEPEN.map(([titel, namen]) => ({
    titel,
    paginas: namen.filter(n => seo[n]).map(n => ({
      bestand: n,
      pad: seo[n].pad,
      // dezelfde korte naam als in het kruimelpad
      titel: n === 'home' ? 'Home' : n === 'blog' ? 'Blog (overzicht)' : seo[n].kruimel.at(-1) ?? kaal(inhoudVan(n).meta?.title ?? n),
    })),
  }));
  // Blogartikelen onder het blogoverzicht, nieuwste eerst
  const blog = groepen.find(g => g.titel === 'Blog')!;
  const volgorde = { gepubliceerd: 0, concept: 1, binnenkort: 2 };
  for (const a of artikelen().sort((x, y) => volgorde[x.artikel.status] - volgorde[y.artikel.status])) {
    blog.paginas.push({
      bestand: a.artikel.eigenPagina ? `blog-${a.slug}` : `blog/${a.slug}`,
      pad: a.artikel.status === 'binnenkort' ? '/blog' : `/blog/${a.slug}`,
      titel: kaal(a.t.titel),
      status: a.artikel.status,
      artikel: `blog/${a.slug}`,
    } as never);
  }
  return new Response(JSON.stringify({ ok: true, groepen }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
};
