import type { APIRoute } from 'astro';
import { ingelogd } from '../../../lib/beheer';
import { heatmap, overzicht, statistiekBeschikbaar } from '../../../lib/statistiek';

export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export const GET: APIRoute = async ({ url, cookies }) => {
  if (!ingelogd(cookies)) return json({ ok: false, fout: 'Niet ingelogd' }, 401);
  if (!statistiekBeschikbaar()) return json({ ok: false, fout: 'Statistieken zijn nog niet ingesteld. Koppel in Vercel een Upstash Redis-database.' }, 503);
  try {
    const pad = url.searchParams.get('heatmap');
    if (pad) {
      const apparaat = ['mobiel', 'tablet', 'desktop'].includes(url.searchParams.get('apparaat') ?? '') ? url.searchParams.get('apparaat')! : 'desktop';
      return json({ ok: true, cellen: await heatmap(pad.slice(0, 120), apparaat, Math.min(Number(url.searchParams.get('maanden')) || 3, 12)) });
    }
    const dagen = Math.min(Math.max(Number(url.searchParams.get('dagen')) || 30, 1), 365);
    return json({ ok: true, ...(await overzicht(dagen)) });
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'Kon de statistieken niet laden' }, 500);
  }
};
