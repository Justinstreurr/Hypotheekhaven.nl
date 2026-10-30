import type { APIRoute } from 'astro';
import { bestandPad, ingelogd, leesBestand } from '../../../lib/beheer';

export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// De actuele (bron)inhoud van een of meer contentbestanden, voor de editor
export const GET: APIRoute = async ({ url, cookies }) => {
  if (!ingelogd(cookies)) return json({ ok: false, fout: 'Niet ingelogd' }, 401);
  const namen = (url.searchParams.get('bestanden') ?? '').split(',').filter(Boolean).slice(0, 30);
  try {
    const inhoud = Object.fromEntries(await Promise.all(namen.map(async n => [n, JSON.parse(await leesBestand(bestandPad(n)))])));
    return json({ ok: true, inhoud });
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'Kon de inhoud niet laden' }, 500);
  }
};
