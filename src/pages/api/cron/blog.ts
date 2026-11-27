import type { APIRoute } from 'astro';
import { leesBestand, lijstBestanden, schrijfBestanden } from '../../../lib/beheer';
import { vandaag, type Artikel } from '../../../lib/content';

export const prerender = false;

// Ingeplande blogartikelen live zetten. Vercel roept dit elke ochtend aan (zie "crons" in vercel.json).
// Staat er een artikel op "ingepland" met een datum van vandaag of eerder, dan wordt de status "gepubliceerd".
// Dat is een gewone commit op GitHub, zodat Vercel de site opnieuw bouwt en het artikel verschijnt; in de
// geschiedenis van de bewerkmodus staat het als eigen versie. Vaker aanroepen kan geen kwaad: wat al live
// staat, blijft ongemoeid.
const env = (k: string) => process.env[k] ?? (import.meta.env[k] as string | undefined);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const GET: APIRoute = async ({ request }) => {
  // Vercel stuurt CRON_SECRET mee als die is ingesteld
  const geheim = env('CRON_SECRET');
  if (geheim && request.headers.get('authorization') !== `Bearer ${geheim}`) return json({ ok: false }, 401);

  try {
    const dag = vandaag();
    const paden = (await lijstBestanden('src/content/blog')).filter(p => p.endsWith('.json'));
    const klaar: { pad: string; inhoud: string; titel: string }[] = [];
    for (const pad of paden) {
      const a = JSON.parse(await leesBestand(pad)) as Artikel;
      if (a.artikel.status !== 'ingepland' || a.artikel.datum > dag) continue;
      a.artikel.status = 'gepubliceerd';
      klaar.push({ pad, inhoud: JSON.stringify(a, null, 2) + '\n', titel: a.t.titel.replace(/<[^>]+>/g, '') });
    }
    if (!klaar.length) return json({ ok: true, gepubliceerd: [] });
    const bericht = klaar.length === 1 ? `Ingepland artikel live: ${klaar[0].titel}` : `${klaar.length} ingeplande artikelen live: ${klaar.map(k => k.titel).join(', ')}`;
    await schrijfBestanden(klaar.map(k => ({ pad: k.pad, inhoud: k.inhoud })), bericht);
    return json({ ok: true, gepubliceerd: klaar.map(k => k.titel) });
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'Inplannen controleren is mislukt' }, 500);
  }
};
