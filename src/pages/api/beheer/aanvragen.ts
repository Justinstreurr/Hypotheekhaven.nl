import type { APIRoute } from 'astro';
import { ingelogd, zelfdeHerkomst } from '../../../lib/beheer';
import { aanvragenBeschikbaar, alleAanvragen, STATUSSEN, verwijderAanvraag, zetStatus, type Status } from '../../../lib/aanvragen';

export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const NIET_INGESTELD = 'Aanvragen bewaren is nog niet ingesteld. Koppel in Vercel een Upstash Redis-database.';
const geldigId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);

// Lijst van alle aanvragen (nieuwste eerst)
export const GET: APIRoute = async ({ cookies }) => {
  if (!ingelogd(cookies)) return json({ ok: false, fout: 'Niet ingelogd' }, 401);
  if (!aanvragenBeschikbaar()) return json({ ok: false, fout: NIET_INGESTELD }, 503);
  try {
    return json({ ok: true, aanvragen: await alleAanvragen() });
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'Kon de aanvragen niet laden' }, 500);
  }
};

// Status wijzigen: { id, status: 'nieuw' | 'gelezen' | 'afgehandeld' }
export const PATCH: APIRoute = async ({ request, cookies }) => {
  if (!ingelogd(cookies)) return json({ ok: false, fout: 'Niet ingelogd' }, 401);
  if (!zelfdeHerkomst(request)) return json({ ok: false, fout: 'Niet toegestaan' }, 403);
  const d = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  if (!d || !geldigId(d.id) || !STATUSSEN.includes(d.status as Status)) return json({ ok: false, fout: 'Ongeldig verzoek' }, 400);
  try {
    return (await zetStatus(d.id, d.status as Status)) ? json({ ok: true }) : json({ ok: false, fout: 'Aanvraag niet gevonden' }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'Opslaan mislukt' }, 500);
  }
};

// Verwijderen: ?id=...
export const DELETE: APIRoute = async ({ request, url, cookies }) => {
  if (!ingelogd(cookies)) return json({ ok: false, fout: 'Niet ingelogd' }, 401);
  if (!zelfdeHerkomst(request)) return json({ ok: false, fout: 'Niet toegestaan' }, 403);
  const id = url.searchParams.get('id');
  if (!geldigId(id)) return json({ ok: false, fout: 'Ongeldig verzoek' }, 400);
  try {
    return (await verwijderAanvraag(id)) ? json({ ok: true }) : json({ ok: false, fout: 'Aanvraag niet gevonden' }, 404);
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'Verwijderen mislukt' }, 500);
  }
};
