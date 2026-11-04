// Anonieme bezoekersstatistieken: geen cookies, geen IP-adressen, geen persoonsgegevens.
// Alles wordt per dag opgeteld. Een bezoeker telt één keer per dag via een hash van
// IP + browser + datum + geheim; die hash is de volgende dag niet meer te herleiden.
// Opslag: Upstash Redis (UPSTASH_REDIS_REST_URL / _TOKEN) of lokaal een bestand in .data/.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const env = (k: string) => process.env[k] ?? (import.meta.env[k] as string | undefined);
const BEWAAR = 60 * 60 * 24 * 400; // ruim een jaar

type Commando = (string | number)[];

// ---------- opslag ----------
async function redis(commandos: Commando[]): Promise<unknown[]> {
  const url = env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL');
  const token = env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN');
  if (url && token) {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(commandos),
    });
    if (!r.ok) throw new Error(`Redis ${r.status}`);
    return ((await r.json()) as { result: unknown }[]).map(x => x.result);
  }
  if (!import.meta.env.DEV) throw new Error('Statistieken zijn niet ingesteld (UPSTASH_REDIS_REST_URL ontbreekt)');
  return lokaal(commandos);
}

// Lokaal: dezelfde commando's op een JSON-bestand, zodat alles ook zonder database te testen is
// Alleen in dev: zo valt het pad (en dus .data/) weg uit de productiebundel en komt het bestand niet mee naar Vercel
const BESTAND = import.meta.env.DEV ? path.join(process.cwd(), '.data', 'statistiek.json') : '';
// Eén keer inlezen, ook als er meerdere verzoeken tegelijk binnenkomen
let geheugen: Promise<Record<string, Record<string, number> | string[]>> | null = null;
let schrijven: Promise<void> = Promise.resolve();
async function lokaal(commandos: Commando[]) {
  geheugen ??= fs.readFile(BESTAND, 'utf8').then(JSON.parse, () => ({}));
  const db = await geheugen;
  const hash = (k: string) => (db[k] ??= {}) as Record<string, number>;
  const lijst = (k: string) => (db[k] ??= []) as string[];
  let gewijzigd = false;
  const uit = commandos.map(([cmd, k, ...a]) => {
    if (['HINCRBY', 'PFADD', 'LPUSH', 'LTRIM', 'HSET', 'HDEL'].includes(String(cmd))) gewijzigd = true;
    const key = String(k);
    switch (cmd) {
      case 'HINCRBY': { const h = hash(key); h[String(a[0])] = (h[String(a[0])] ?? 0) + Number(a[1]); return h[String(a[0])]; }
      case 'HSET': { const h = hash(key) as unknown as Record<string, string>; h[String(a[0])] = String(a[1]); return 1; }
      case 'HGET': return ((db[key] ?? {}) as unknown as Record<string, string>)[String(a[0])] ?? null;
      case 'HDEL': { const h = hash(key); let n = 0; a.forEach(x => { if (String(x) in h) { delete h[String(x)]; n++; } }); return n; }
      case 'HGETALL': return Object.entries((db[key] ?? {}) as Record<string, number>).flat();
      case 'PFADD': { const h = hash(key); a.forEach(x => { h[String(x)] = 1; }); return 1; }
      case 'PFCOUNT': return Object.keys((db[key] ?? {}) as Record<string, number>).length;
      case 'LPUSH': lijst(key).unshift(...a.map(String)); return lijst(key).length;
      case 'LTRIM': db[key] = lijst(key).slice(Number(a[0]), Number(a[1]) + 1); return 'OK';
      case 'LRANGE': return ((db[key] ?? []) as string[]).slice(Number(a[0]), Number(a[1]) === -1 ? undefined : Number(a[1]) + 1);
      default: return null;
    }
  });
  if (gewijzigd) schrijven = schrijven.then(async () => {
    await fs.mkdir(path.dirname(BESTAND), { recursive: true });
    await fs.writeFile(BESTAND, JSON.stringify(db));
  });
  return uit;
}

// Dezelfde opslag, ook gebruikt voor de aanvragen van het contactformulier (zie lib/aanvragen.ts)
export const opslag = redis;

export const statistiekBeschikbaar = () => !!(env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL')) || import.meta.env.DEV;

// ---------- verzamelen ----------
export interface Gebeurtenis {
  t: 'pv' | '404' | 'eind' | 'klik' | 'doel' | 'uit' | 'verder' | 'fb';
  p: string;              // pad
  a?: string;             // apparaat: mobiel / tablet / desktop
  r?: string;             // verwijzende site
  b?: string;             // utm_source
  c?: string;             // utm_campaign
  i?: number;             // 1 = eerste pagina van het bezoek (binnenkomst)
  v?: number;             // 1 = extra tijd na terugkeer naar het tabblad (geen nieuwe leesbeurt)
  h?: string;             // uitgaande link: domeinnaam
  d?: number;             // seconden op de pagina
  s?: number;             // hoe ver gescrold (%)
  k?: string;             // waarop geklikt
  x?: number; y?: number; // klikpositie: x in % van de breedte, y in px vanaf boven
  g?: string;             // doel: formulier, bellen, whatsapp, ...
  n?: boolean;            // feedback: nuttig ja/nee
  o?: string;             // feedback: opmerking
}

const APPARATEN = ['mobiel', 'tablet', 'desktop'];
// Contact = echte aanvraag (telt mee in "Aanvragen" en de omzetting); de rest is interactie
export const CONTACT = ['formulier', 'formulier-mail', 'bellen', 'whatsapp', 'mail'];
const DOELEN = [...CONTACT, 'kennismaking', 'formulierstart', 'formulierfout', 'rekentool', 'uitkomst', 'checklist', 'checklistklaar', 'print', 'download', 'delen'];
const kort = (s: unknown, max: number) => String(s ?? '').replace(/[\r\n|]/g, ' ').trim().slice(0, max);
export const vandaag = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });

export async function verwerk(lijst: Gebeurtenis[], bezoeker: { ip: string; agent: string }) {
  const dag = vandaag();
  const maand = dag.slice(0, 7);
  const c: Commando[] = [];
  const hincr = (key: string, veld: string, n = 1) => { c.push(['HINCRBY', key, veld, n], ['EXPIRE', key, BEWAAR]); };
  for (const e of lijst.slice(0, 50)) {
    const p = kort(e.p, 120);
    if (!p.startsWith('/') || p.startsWith('/beheer') || p.startsWith('/api')) continue;
    const a = APPARATEN.includes(String(e.a)) ? String(e.a) : 'desktop';
    if (e.t === '404') {
      hincr(`s:${dag}:404`, `${p}|${kort(e.r, 60) || 'direct'}`);
    } else if (e.t === 'pv') {
      hincr(`s:${dag}:pv`, p);
      hincr(`s:${dag}:apparaat`, a);
      const bron = kort(e.b, 40).toLowerCase() || kort(e.r, 60) || 'direct';
      hincr(`s:${dag}:bron`, bron);
      const campagne = kort(e.c, 60);
      if (campagne) hincr(`s:${dag}:campagne`, `${bron}|${campagne}`);
      if (e.i) hincr(`s:${dag}:entree`, p);
      const id = createHash('sha256').update(`${bezoeker.ip}|${bezoeker.agent}|${dag}|${env('SESSIE_GEHEIM') ?? ''}`).digest('base64url').slice(0, 22);
      c.push(['PFADD', `s:${dag}:bez`, id], ['EXPIRE', `s:${dag}:bez`, BEWAAR]);
    } else if (e.t === 'eind') {
      const d = Math.min(Math.max(Math.round(Number(e.d) || 0), 0), 1800);
      const s = Math.min(Math.max(Math.round(Number(e.s) || 0), 0), 100);
      if (!d) continue;
      hincr(`s:${dag}:tijd`, p, d);
      if (e.v) continue; // terug in het tabblad: alleen de extra tijd
      hincr(`s:${dag}:scroll`, p, s);
      hincr(`s:${dag}:tijdn`, p);
      if (s >= 90) hincr(`s:${dag}:uitgelezen`, p);
    } else if (e.t === 'verder') {
      hincr(`s:${dag}:verder`, p);
    } else if (e.t === 'uit') {
      const h = kort(e.h, 60).toLowerCase();
      if (/^[a-z0-9.-]+$/.test(h)) hincr(`s:${dag}:uit`, `${p}|${h}`);
    } else if (e.t === 'klik') {
      const k = kort(e.k, 60);
      if (k) hincr(`s:${dag}:klik`, `${p}|${k}`);
      const x = Math.round(Math.min(Math.max(Number(e.x) || 0, 0), 100) / 2) * 2;
      const y = Math.round(Math.min(Math.max(Number(e.y) || 0, 0), 40000) / 20) * 20;
      if (Number.isFinite(x) && Number.isFinite(y)) hincr(`s:${maand}:heat:${a}:${p}`, `${x},${y}`);
    } else if (e.t === 'doel') {
      const g = String(e.g);
      if (!DOELEN.includes(g)) continue;
      hincr(`s:${dag}:doel`, g);
      hincr(`s:${dag}:doelpad`, `${g}|${p}`);
    } else if (e.t === 'fb') {
      // eerst de ja/nee-klik (telt mee), daarna eventueel een opmerking (komt in de lijst)
      const o = kort(e.o, 600);
      if (!o) hincr(`s:${dag}:fb`, `${p}|${e.n ? 'ja' : 'nee'}`);
      else c.push(['LPUSH', 's:feedback', JSON.stringify({ dag, pad: p, nuttig: e.n, opmerking: o, apparaat: a })], ['LTRIM', 's:feedback', 0, 499]);
    }
  }
  if (c.length) await redis(c);
}

// ---------- uitlezen voor het dashboard ----------
const paren = (x: unknown) => {
  const a = (x ?? []) as (string | number)[];
  const uit: Record<string, number> = {};
  if (!Array.isArray(a)) return a as Record<string, number>; // Upstash kan ook een object geven
  for (let i = 0; i < a.length; i += 2) uit[String(a[i])] = Number(a[i + 1]);
  return uit;
};
const optellen = (doel: Record<string, number>, bron: Record<string, number>) => { for (const [k, v] of Object.entries(bron)) doel[k] = (doel[k] ?? 0) + v; };

export async function overzicht(aantalDagen: number) {
  const dagen = [...Array(aantalDagen)].map((_, n) => vandaag(new Date(Date.now() - (aantalDagen - 1 - n) * 864e5)));
  const SOORTEN = ['pv', 'apparaat', 'bron', 'tijd', 'scroll', 'tijdn', 'klik', 'doel', 'doelpad', 'fb', 'campagne', 'entree', 'verder', 'uitgelezen', 'uit', '404'];
  const c: Commando[] = [];
  for (const dag of dagen) {
    for (const s of SOORTEN) c.push(['HGETALL', `s:${dag}:${s}`]);
    c.push(['PFCOUNT', `s:${dag}:bez`]);
  }
  c.push(['LRANGE', 's:feedback', 0, 199]);
  const uit = await redis(c);
  const totaal: Record<string, Record<string, number>> = Object.fromEntries(SOORTEN.map(s => [s, {}]));
  const perDag = dagen.map((dag, n) => {
    const blok = uit.slice(n * (SOORTEN.length + 1), (n + 1) * (SOORTEN.length + 1));
    const pv = paren(blok[0]);
    SOORTEN.forEach((s, i) => optellen(totaal[s], paren(blok[i])));
    const doelen = Object.entries(paren(blok[7])).filter(([g]) => CONTACT.includes(g)).reduce((a, [, b]) => a + b, 0);
    return { dag, weergaven: Object.values(pv).reduce((a, b) => a + b, 0), bezoekers: Number(blok[SOORTEN.length]) || 0, doelen };
  });
  const feedback = ((uit.at(-1) ?? []) as string[]).map(r => { try { return JSON.parse(r); } catch { return null; } })
    .filter(f => f && dagen.includes(f.dag));
  return { dagen: perDag, totaal, feedback, contact: CONTACT };
}

export async function heatmap(pad: string, apparaat: string, maanden: number) {
  const nu = new Date();
  const lijst = [...Array(maanden)].map((_, n) => vandaag(new Date(nu.getFullYear(), nu.getMonth() - n, 15)).slice(0, 7));
  const uit = await redis(lijst.map(m => ['HGETALL', `s:${m}:heat:${apparaat}:${pad}`]));
  const cellen: Record<string, number> = {};
  uit.forEach(x => optellen(cellen, paren(x)));
  return cellen;
}
