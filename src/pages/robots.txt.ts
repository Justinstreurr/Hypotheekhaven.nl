import type { APIRoute } from 'astro';
import { isProductie, siteUrl } from '../lib/site';

// Productie: alles open, ook voor AI-zoekmachines (GEO). Preview-omgevingen: niets indexeren.
export const GET: APIRoute = () => new Response(
  isProductie
    ? `User-agent: *
Allow: /
Disallow: /beheer
Disallow: /api/

Sitemap: ${siteUrl}/sitemap-index.xml
`
    : `User-agent: *
Disallow: /
`,
  { headers: { 'content-type': 'text/plain; charset=utf-8' } },
);
