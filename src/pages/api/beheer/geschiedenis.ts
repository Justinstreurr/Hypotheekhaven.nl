import type { APIRoute } from 'astro';
import { geschiedenis, ingelogd, zelfdeHerkomst, zetTerug } from '../../../lib/beheer';

export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// Elke publicatie is een versie. Hier de lijst van versies, en een eerdere versie terugzetten.
export const GET: APIRoute = async ({ cookies }) => {
  if (!ingelogd(cookies)) return json({ ok: false, fout: 'Niet ingelogd' }, 401);
  try {
    return json({ ok: true, versies: await geschiedenis() });
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'Kon de geschiedenis niet laden' }, 500);
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!zelfdeHerkomst(request)) return json({ ok: false, fout: 'Niet toegestaan' }, 403);
  if (!ingelogd(cookies)) return json({ ok: false, fout: 'Je bent uitgelogd. Log opnieuw in via /beheer.' }, 401);
  const { id, omschrijving } = await request.json().catch(() => ({}));
  try {
    const datum = typeof omschrijving === 'string' ? omschrijving.slice(0, 80).replace(/[\r\n]/g, ' ') : String(id).slice(0, 7);
    await zetTerug(String(id), `Teruggezet naar de versie van ${datum}`);
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'Terugzetten is mislukt. Probeer het opnieuw.' }, 500);
  }
};
