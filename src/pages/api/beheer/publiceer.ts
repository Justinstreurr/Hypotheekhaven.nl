import type { APIRoute } from 'astro';
import { bestandPad, ingelogd, leesBestand, schoneHtml, schoneTekst, schrijfBestanden, zelfdeHerkomst, type Bestand } from '../../../lib/beheer';
import { CATEGORIEEN, type Artikel, type Inhoud } from '../../../lib/content';

export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

type Waarde = string | { upload?: string; alt?: string } | Record<string, unknown>[];
interface Wijziging {
  bestand: string;
  soort: 'tekst' | 'attr' | 'beeld' | 'meta' | 'lijst' | 'artikel';
  sleutel: string;
  waarde: Waarde;
}
interface Upload { id: string; naam: string; data: string }

const SOORTEN: Record<string, string> = { '/9j/': 'jpg', iVBORw0KGgo: 'png', UklGR: 'webp' };
const MAX_BEELD = 3 * 1024 * 1024;
const KEUZES: Record<string, string[]> = { bron: ['google', 'trustoo'] };
const STATUSSEN = ['gepubliceerd', 'concept', 'binnenkort'];

class Fout extends Error {}

type Uploads = Map<string, { src: string }>;

// Een lijst-item bestaat uit teksten (html), keuzes, links/ankers (platte tekst) en foto's
function schoneLijst(huidig: Record<string, unknown>[] | undefined, waarde: Waarde, uploads: Uploads) {
  if (!Array.isArray(waarde) || waarde.length > 100) throw new Fout('Ongeldige lijst');
  const velden = huidig?.[0] ? Object.keys(huidig[0]) : null;
  return waarde.map(item => {
    if (typeof item !== 'object' || item === null) throw new Fout('Ongeldige lijst');
    const schoon: Record<string, unknown> = {};
    for (const [veld, v] of Object.entries(item as Record<string, unknown>)) {
      if (velden && !velden.includes(veld)) continue;
      if (KEUZES[veld]) {
        if (!KEUZES[veld].includes(String(v))) throw new Fout(`Ongeldige keuze voor ${veld}`);
        schoon[veld] = String(v);
      } else if (v && typeof v === 'object') {
        const f = v as { src?: string; alt?: string; positie?: string; upload?: string };
        const src = f.upload ? uploads.get(f.upload)?.src : f.src;
        if (!src || !/^[\w/.-]+\.(jpe?g|png|webp|svg)$/i.test(src)) throw new Fout('Ongeldige foto in een lijst');
        schoon[veld] = { src, alt: schoneTekst(f.alt ?? ''), ...(f.positie ? { positie: schoneTekst(f.positie) } : {}) };
      } else if (/^link\d*$/.test(veld)) {
        const link = String(v).trim();
        if (!/^(https?:|mailto:|tel:|\/|#)/i.test(link)) throw new Fout('Een link begint met /, https://, mailto: of tel:');
        schoon[veld] = link;
      } else if (/^anker\d*$/.test(veld)) {
        schoon[veld] = String(v).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'item';
      } else schoon[veld] = schoneHtml(String(v));
    }
    return schoon;
  });
}

function beschrijving(wijzigingen: Wijziging[], uploads: number) {
  const tel = (soorten: string[]) => wijzigingen.filter(w => soorten.includes(w.soort)).length;
  const delen = [
    [tel(['tekst', 'attr']), 'tekst', 'teksten'], [uploads, 'nieuwe foto', 'nieuwe foto\'s'],
    [tel(['lijst']), 'lijst', 'lijsten'], [tel(['meta']), 'Google-tekst', 'Google-teksten'], [tel(['artikel']), 'artikelinstelling', 'artikelinstellingen'],
  ].filter(([n]) => n).map(([n, een, meer]) => `${n} ${n === 1 ? een : meer}`);
  const plekken = [...new Set(wijzigingen.map(w => w.bestand))].join(', ');
  return `Website bijgewerkt: ${delen.join(', ') || 'wijzigingen'} (${plekken})`;
}

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
        if (!(w.sleutel in inhoud.t)) throw new Fout(`Onbekende tekst ${w.bestand}:${w.sleutel}`);
        const rijk = w.bestand.startsWith('blog/') && w.sleutel === 'inhoud';
        inhoud.t[w.sleutel] = w.soort === 'tekst' ? schoneHtml(String(w.waarde), rijk) : schoneTekst(String(w.waarde));
      } else if (w.soort === 'beeld') {
        const huidig = inhoud.i[w.sleutel];
        if (!huidig) throw new Fout(`Onbekende foto ${w.bestand}:${w.sleutel}`);
        const v = w.waarde as { upload?: string; alt?: string };
        if (v.upload) {
          const u = uploads.get(v.upload);
          if (!u) throw new Fout('Foto ontbreekt in het verzoek');
          huidig.src = u.src;
        }
        if (typeof v.alt === 'string') huidig.alt = schoneTekst(v.alt);
      } else if (w.soort === 'meta') {
        if (!inhoud.meta || !['title', 'description'].includes(w.sleutel)) throw new Fout('Onbekend pagina-veld');
        inhoud.meta[w.sleutel as 'title' | 'description'] = schoneTekst(String(w.waarde));
      } else if (w.soort === 'lijst') {
        if (!inhoud.l || !(w.sleutel in inhoud.l)) throw new Fout(`Onbekende lijst ${w.bestand}:${w.sleutel}`);
        inhoud.l[w.sleutel] = schoneLijst(inhoud.l[w.sleutel], w.waarde, uploads);
      } else if (w.soort === 'artikel') {
        const a = (inhoud as Artikel).artikel;
        const v = String(w.waarde);
        if (!a) throw new Fout('Dit is geen artikel');
        if (w.sleutel === 'status' && STATUSSEN.includes(v)) a.status = v as Artikel['artikel']['status'];
        else if (w.sleutel === 'categorie' && v in CATEGORIEEN) a.categorie = v;
        else if (w.sleutel === 'datum' && /^\d{4}-\d{2}-\d{2}$/.test(v)) a.datum = v;
        else throw new Fout('Ongeldige artikelinstelling');
        if (a.eigenPagina && w.sleutel === 'status' && v !== 'gepubliceerd') throw new Fout('Dit artikel heeft een eigen pagina en blijft gepubliceerd');
      } else throw new Fout('Onbekende wijziging');
    }

    const teSchrijven: Bestand[] = [
      ...[...uploads.values()].map(u => ({ pad: u.pad, inhoud: u.data })),
      ...[...bestanden.entries()].map(([naam, inhoud]) => ({ pad: bestandPad(naam), inhoud: JSON.stringify(inhoud, null, 2) + '\n' })),
    ];
    const res = await schrijfBestanden(teSchrijven, beschrijving(wijzigingen, uploads.size));
    return json({ ok: true, commit: res.commit });
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: e instanceof Fout ? e.message : 'Publiceren is mislukt. Probeer het opnieuw.' }, e instanceof Fout ? 400 : 500);
  }
};
