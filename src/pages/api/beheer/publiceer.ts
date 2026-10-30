import type { APIRoute } from 'astro';
import { bestandPad, ingelogd, leesBestand, schoneHtml, schoneTekst, schrijfBestanden, zelfdeHerkomst } from '../../../lib/beheer';
import type { Inhoud } from '../../../lib/content';

export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

interface Wijziging {
  bestand: string;
  soort: 'tekst' | 'attr' | 'beeld' | 'meta';
  sleutel: string;
  waarde: string | { upload?: string; alt?: string };
}
interface Upload { id: string; naam: string; data: string }

const SOORTEN: Record<string, string> = { '/9j/': 'jpg', iVBORw0KGgo: 'png', UklGR: 'webp' };
const MAX_BEELD = 3 * 1024 * 1024;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!zelfdeHerkomst(request)) return json({ ok: false, fout: 'Niet toegestaan' }, 403);
  if (!ingelogd(cookies)) return json({ ok: false, fout: 'Je bent uitgelogd. Log opnieuw in via /beheer.' }, 401);

  let body: { wijzigingen?: Wijziging[]; uploads?: Upload[] };
  try { body = await request.json(); } catch { return json({ ok: false, fout: 'Ongeldig verzoek' }, 400); }
  const wijzigingen = body.wijzigingen ?? [];
  if (!wijzigingen.length) return json({ ok: false, fout: 'Er is niets gewijzigd' }, 400);

  try {
    // Foto's: controleren en een vaste bestandsnaam geven
    const stempel = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const uploads = new Map<string, { pad: string; src: string; data: Buffer }>();
    for (const u of body.uploads ?? []) {
      const ext = Object.entries(SOORTEN).find(([begin]) => u.data.startsWith(begin))?.[1];
      if (!ext) return json({ ok: false, fout: 'Alleen JPG, PNG of WebP-foto\'s zijn toegestaan' }, 400);
      const data = Buffer.from(u.data, 'base64');
      if (data.length > MAX_BEELD) return json({ ok: false, fout: 'Een foto is te groot (max. 3 MB)' }, 400);
      const slug = u.naam.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto';
      const src = `uploads/${stempel}-${slug}-${uploads.size + 1}.${ext}`;
      uploads.set(u.id, { pad: `src/assets/img/${src}`, src, data });
    }

    // Contentbestanden laden en wijzigingen toepassen
    const bestanden = new Map<string, Inhoud>();
    for (const w of wijzigingen) {
      if (!bestanden.has(w.bestand)) bestanden.set(w.bestand, JSON.parse(await leesBestand(bestandPad(w.bestand))));
      const inhoud = bestanden.get(w.bestand)!;
      if (w.soort === 'tekst' || w.soort === 'attr') {
        if (!(w.sleutel in inhoud.t)) throw new Error(`Onbekende tekst ${w.bestand}:${w.sleutel}`);
        inhoud.t[w.sleutel] = w.soort === 'tekst' ? schoneHtml(String(w.waarde)) : schoneTekst(String(w.waarde));
      } else if (w.soort === 'beeld') {
        const huidig = inhoud.i[w.sleutel];
        if (!huidig) throw new Error(`Onbekende foto ${w.bestand}:${w.sleutel}`);
        const v = w.waarde as { upload?: string; alt?: string };
        if (v.upload) {
          const u = uploads.get(v.upload);
          if (!u) throw new Error('Foto ontbreekt in het verzoek');
          huidig.src = u.src;
        }
        if (typeof v.alt === 'string') huidig.alt = schoneTekst(v.alt);
      } else if (w.soort === 'meta') {
        if (!inhoud.meta || !['title', 'description'].includes(w.sleutel)) throw new Error('Onbekend pagina-veld');
        inhoud.meta[w.sleutel as 'title' | 'description'] = schoneTekst(String(w.waarde));
      }
    }

    const teSchrijven = [
      ...[...uploads.values()].map(u => ({ pad: u.pad, inhoud: u.data })),
      ...[...bestanden.entries()].map(([naam, inhoud]) => ({ pad: bestandPad(naam), inhoud: JSON.stringify(inhoud, null, 2) + '\n' })),
    ];
    const paginas = [...bestanden.keys()].join(', ');
    const res = await schrijfBestanden(teSchrijven, `Inhoud bijgewerkt via de website (${paginas})`);
    return json({ ok: true, commit: res.commit });
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: e instanceof Error && e.message.startsWith('Onbekend') ? e.message : 'Publiceren is mislukt. Probeer het opnieuw.' }, 500);
  }
};
