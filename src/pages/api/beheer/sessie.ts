import type { APIRoute } from 'astro';
import { ingelogd, opslagBeschikbaar } from '../../../lib/beheer';

export const prerender = false;

export const GET: APIRoute = ({ cookies }) => new Response(
  JSON.stringify({ ingelogd: ingelogd(cookies), lokaal: import.meta.env.DEV, opslag: opslagBeschikbaar() }),
  { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
);
