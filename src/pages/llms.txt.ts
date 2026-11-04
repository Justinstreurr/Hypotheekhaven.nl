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
  // +31655767819 -> 06 55 76 78 19
  const telefoon = bedrijf.telefoon.replace(/^\+31(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/, '0$1 $2 $3 $4 $5');
  const tekst = `# ${bedrijf.naam}

> Onafhankelijk hypotheek- en verzekeringsadvies in ${bedrijf.plaats}, West-Friesland en ${bedrijf.regio}, door ${bedrijf.eigenaar}. Persoonlijke begeleiding van de eerste berekening tot aan de notaris en daarna, bij de klant thuis of online (geen bezoekadres). Het eerste gesprek is gratis en vrijblijvend.

- Telefoon: ${telefoon}
- Gevestigd in ${bedrijf.plaats}
- Werkgebied: ${bedrijf.werkgebied.join(', ')} en de rest van ${bedrijf.regio}
- Google-bedrijfsprofiel: ${bedrijf.googleProfiel}
- E-mail: ${bedrijf.email}
- KvK ${bedrijf.kvk} · AFM ${bedrijf.afm}
- Aangesloten instelling van NBG Hypotheken

## Pagina's

${regels.join('\n')}
`;
  return new Response(tekst, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
