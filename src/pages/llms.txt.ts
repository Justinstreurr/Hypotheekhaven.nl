import type { APIRoute } from 'astro';
import { inhoudVan } from '../lib/content';
import { alleSeo } from '../lib/seo';
import { absoluut, bedrijf } from '../lib/site';

// llms.txt: een korte, leesbare samenvatting van de site voor AI-assistenten (GEO)
export const GET: APIRoute = () => {
  const regels = Object.entries(alleSeo()).filter(([, seo]) => seo.index !== false).map(([naam, seo]) => {
    const meta = inhoudVan(naam).meta;
    return `- [${meta?.title.replace(/\s*\|.*$/, '') ?? naam}](${absoluut(seo.pad)}): ${meta?.description ?? ''}`;
  });
  const tekst = `# ${bedrijf.naam}

> Onafhankelijk hypotheek- en verzekeringsadvies in ${bedrijf.regio}, door ${bedrijf.eigenaar}. Persoonlijke begeleiding van de eerste berekening tot aan de notaris en daarna, online of bij de klant thuis. Het eerste gesprek is gratis en vrijblijvend.

- Telefoon: 06 55 76 78 19
- E-mail: ${bedrijf.email}
- KvK ${bedrijf.kvk} · AFM ${bedrijf.afm}
- Werkt onder de vergunning van NBG Hypotheken bij de AFM

## Pagina's

${regels.join('\n')}
`;
  return new Response(tekst, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
