import type { APIRoute } from 'astro';
import { teVeelPogingen, wachtwoordKlopt, wisSessie, zelfdeHerkomst, zetSessie } from '../../../lib/beheer';

export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, cookies, clientAddress, url }) => {
  if (!zelfdeHerkomst(request)) return json({ ok: false, fout: 'Niet toegestaan' }, 403);
  if (teVeelPogingen(clientAddress)) return json({ ok: false, fout: 'Te veel pogingen. Probeer het over een kwartier opnieuw.' }, 429);
  const { wachtwoord } = await request.json().catch(() => ({ wachtwoord: '' }));
  try {
    if (typeof wachtwoord !== 'string' || !wachtwoordKlopt(wachtwoord)) {
      await new Promise(r => setTimeout(r, 600));
      return json({ ok: false, fout: 'Dit wachtwoord klopt niet.' }, 401);
    }
    zetSessie(cookies, url.protocol === 'https:');
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'De bewerkmodus is nog niet ingesteld.' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!zelfdeHerkomst(request)) return json({ ok: false }, 403);
  wisSessie(cookies);
  return json({ ok: true });
};
