import type { APIRoute } from 'astro';

export const prerender = false;

const env = (k: string) => process.env[k] ?? (import.meta.env[k] as string | undefined);
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const ONDERWERPEN_MAX = 120;
const pogingen = new Map<string, { n: number; tot: number }>();
const teVaak = (ip: string) => {
  const nu = Date.now();
  const p = pogingen.get(ip);
  if (!p || p.tot < nu) { pogingen.set(ip, { n: 1, tot: nu + 10 * 60_000 }); return false; }
  return ++p.n > 5;
};

const schoon = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const html = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false, fout: 'Niet toegestaan' }, 403);
  const d = await request.json().catch(() => null);
  if (!d) return json({ ok: false, fout: 'Ongeldig verzoek' }, 400);

  // Spamrobot vult het verborgen veld in: doe alsof het gelukt is
  if (schoon(d.website, 200)) return json({ ok: true });
  if (teVaak(clientAddress)) return json({ ok: false, fout: 'Je hebt al een paar berichten gestuurd. Bel of app gerust even.' }, 429);

  const v = {
    naam: schoon(d.naam, 100),
    email: schoon(d.email, 200),
    telefoon: schoon(d.telefoon, 40),
    onderwerp: schoon(d.onderwerp, ONDERWERPEN_MAX),
    voorkeur: schoon(d.voorkeur, 40) || 'Maakt niet uit',
    bericht: schoon(d.bericht, 5000),
  };
  if (!v.naam || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email) || !v.onderwerp || !v.bericht || d.akkoord !== true) {
    return json({ ok: false, fout: 'Niet alle verplichte velden zijn goed ingevuld.' }, 400);
  }

  const sleutel = env('RESEND_API_KEY');
  if (!sleutel) return json({ ok: false, fout: 'niet-ingesteld' }, 503);

  const regels: [string, string][] = [
    ['Naam', v.naam], ['E-mail', v.email], ['Telefoon', v.telefoon || '-'],
    ['Onderwerp', v.onderwerp], ['Voorkeur gesprek', v.voorkeur],
  ];
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${sleutel}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env('CONTACT_VAN') || 'Hypotheekhaven website <website@hypotheekhaven.nl>',
      to: [env('CONTACT_AAN') || 'info@hypotheekhaven.nl'],
      reply_to: v.email,
      subject: `Contactformulier: ${v.onderwerp} (${v.naam})`,
      text: regels.map(([k, w]) => `${k}: ${w}`).join('\n') + `\n\nBericht:\n${v.bericht}\n\nPrivacyverklaring gelezen: ja`,
      html: `<table>${regels.map(([k, w]) => `<tr><td><strong>${k}</strong></td><td>${html(w)}</td></tr>`).join('')}</table>`
        + `<p><strong>Bericht</strong><br>${html(v.bericht).replace(/\n/g, '<br>')}</p><p>Privacyverklaring gelezen: ja</p>`,
    }),
  });
  if (!res.ok) {
    console.error('Resend', res.status, await res.text());
    return json({ ok: false, fout: 'versturen-mislukt' }, 502);
  }
  return json({ ok: true });
};
