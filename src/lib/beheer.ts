// Serverkant van de bewerkmodus: inloggen, opschonen, wegschrijven, geschiedenis en terugzetten.
// Online maakt elke publicatie één commit op GitHub (dat is meteen de back-up), waarna Vercel de
// site opnieuw bouwt. Lokaal (npm run dev, zonder GITHUB_TOKEN) schrijft hij naar src/ en maakt
// hij een commit in de lokale git-repository.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AstroCookies } from 'astro';
import { parse, type HTMLElement, type Node } from 'node-html-parser';

const env = (k: string) => process.env[k] ?? (import.meta.env[k] as string | undefined);
const SESSIE = 'hh_sessie';
const UUR = 60 * 60;
const CONTENT = 'src/content/';

function geheim() {
  const g = env('SESSIE_GEHEIM');
  if (!g || g.length < 32) throw new Error('SESSIE_GEHEIM ontbreekt of is korter dan 32 tekens');
  return g;
}

const teken = (data: string) => createHmac('sha256', geheim()).update(data).digest('base64url');

export function wachtwoordKlopt(invoer: string) {
  const goed = env('BEHEER_WACHTWOORD');
  if (!goed) throw new Error('BEHEER_WACHTWOORD ontbreekt');
  const a = createHmac('sha256', 'vergelijk').update(invoer).digest();
  const b = createHmac('sha256', 'vergelijk').update(goed).digest();
  return timingSafeEqual(a, b);
}

export function zetSessie(cookies: AstroCookies, secure: boolean) {
  const tot = Math.floor(Date.now() / 1000) + 12 * UUR;
  const waarde = `${tot}.${teken(String(tot))}`;
  cookies.set(SESSIE, waarde, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 12 * UUR });
  // Niet-geheime vlag: laat de pagina weten dat de editor geladen moet worden
  cookies.set('hh_edit', '1', { httpOnly: false, secure, sameSite: 'strict', path: '/', maxAge: 12 * UUR });
}

export function wisSessie(cookies: AstroCookies) {
  cookies.delete(SESSIE, { path: '/' });
  cookies.delete('hh_edit', { path: '/' });
}

export function ingelogd(cookies: AstroCookies) {
  const [tot, sig] = (cookies.get(SESSIE)?.value ?? '').split('.');
  if (!tot || !sig || Number(tot) < Date.now() / 1000) return false;
  const verwacht = Buffer.from(teken(tot));
  const gekregen = Buffer.from(sig);
  return verwacht.length === gekregen.length && timingSafeEqual(verwacht, gekregen);
}

// Alleen verzoeken vanaf de eigen site (tegen CSRF, naast SameSite=Strict)
export function zelfdeHerkomst(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

// Rem op mislukte inlogpogingen per IP (per serverinstantie); een goede login wist de teller
const pogingen = new Map<string, { n: number; tot: number }>();
export function geblokkeerd(ip: string) {
  const p = pogingen.get(ip);
  return !!p && p.tot > Date.now() && p.n >= 10;
}
export function mislukt(ip: string) {
  const nu = Date.now();
  const p = pogingen.get(ip);
  if (!p || p.tot < nu) pogingen.set(ip, { n: 1, tot: nu + 15 * 60_000 });
  else p.n++;
}
export const gelukt = (ip: string) => pogingen.delete(ip);

// ---------- opschonen van ingevoerde HTML ----------
const TAGS = new Set(['b', 'strong', 'i', 'em', 'br', 'span', 'small', 'sup', 'sub', 'a', 'u', 'mark', 'abbr']);
// Extra voor artikeltekst: tussenkoppen, alinea's, opsommingen en citaten
const BLOKKEN = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote']);
const ATTRS = new Set(['class', 'href', 'target', 'rel', 'aria-hidden', 'aria-label', 'title']);

function schoon(node: Node, rijk: boolean) {
  for (const kind of [...node.childNodes]) {
    if (kind.nodeType === 3) continue;
    if (kind.nodeType !== 1) { kind.remove(); continue; }
    const el = kind as HTMLElement;
    const tag = el.rawTagName?.toLowerCase();
    if (!TAGS.has(tag) && !(rijk && BLOKKEN.has(tag))) {
      // onbekende tag: inhoud houden, tag weghalen (blokken worden een regelafbreking of alinea)
      schoon(el, rijk);
      const blok = ['div', 'p', 'li', 'h1', 'h2', 'h3', 'h4', 'section'].includes(tag);
      el.replaceWith(rijk && blok ? `<p>${el.innerHTML}</p>` : (blok ? '<br>' : '') + el.innerHTML);
      continue;
    }
    for (const naam of Object.keys(el.attributes)) {
      const waarde = el.getAttribute(naam) ?? '';
      // data-* stuurt effecten aan (bijv. data-woorden voor het inkleuren) en kan geen code uitvoeren
      if (!ATTRS.has(naam.toLowerCase()) && !/^data-[a-z][a-z-]*$/.test(naam)) el.removeAttribute(naam);
      else if (naam === 'href' && !/^(https?:|mailto:|tel:|\/|#)/i.test(waarde.trim())) el.removeAttribute(naam);
    }
    if (el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener');
    schoon(el, rijk);
  }
}

export function schoneHtml(invoer: string, rijk = false) {
  const root = parse(`<div>${invoer}</div>`, { comment: false, blockTextElements: {} });
  const div = root.firstChild as HTMLElement;
  schoon(div, rijk);
  if (rijk) {
    // losse tekst tussen blokken in een alinea zetten, lege alinea's weg
    return div.innerHTML.replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '').trim();
  }
  // Geen lege regels aan het begin of eind, ook niet net binnen een afsluitende tag
  let html = div.innerHTML.replace(/^(\s*<br>)+/, '');
  for (let vorige = ''; vorige !== html;) { vorige = html; html = html.replace(/(\s*<br>\s*)+((<\/[a-z]+>)*)$/, '$2'); }
  return html.trim();
}

export const schoneTekst = (s: string) => s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

// ---------- bestanden ----------
/** "site", "home", "blog-artikel" of "blog/<slug>" → pad in de repository */
export const bestandPad = (naam: string) => {
  if (naam === 'site') return `${CONTENT}site.json`;
  const blog = naam.match(/^blog\/([a-z0-9-]+)$/);
  if (blog) return `${CONTENT}blog/${blog[1]}.json`;
  if (!/^[a-z0-9-]+$/.test(naam)) throw new Error('Ongeldige pagina');
  return `${CONTENT}pages/${naam}.json`;
};

const github = () => {
  const token = env('GITHUB_TOKEN');
  const repo = env('GITHUB_REPO');
  return token && repo ? { token, repo, branch: env('GITHUB_BRANCH') || 'main' } : null;
};

export function opslagBeschikbaar() {
  return !!github() || import.meta.env.DEV;
}

async function gh(pad: string, init: RequestInit & { raw?: boolean } = {}) {
  const g = github()!;
  const res = await fetch(`https://api.github.com/repos/${g.repo}${pad}`, {
    ...init,
    headers: {
      authorization: `Bearer ${g.token}`,
      accept: init.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return init.raw ? res.text() : res.json();
}

const git = async (...args: string[]) => (await promisify(execFile)('git', args, { cwd: process.cwd(), maxBuffer: 10_000_000 })).stdout;
const lokaal = (relatief: string) => path.join(process.cwd(), relatief);

export async function leesBestand(relatief: string): Promise<string> {
  const g = github();
  if (g) return gh(`/contents/${relatief}?ref=${encodeURIComponent(g.branch)}`, { raw: true }) as Promise<string>;
  return fs.readFile(lokaal(relatief), 'utf8');
}

export async function bestaat(relatief: string) {
  try { await leesBestand(relatief); return true; } catch { return false; }
}

/** Alle contentbestanden van één soort, bijvoorbeeld de blogartikelen */
export async function lijstBestanden(map: string): Promise<string[]> {
  const g = github();
  if (g) {
    const items = await gh(`/contents/${map}?ref=${encodeURIComponent(g.branch)}`) as { path: string; type: string }[];
    return items.filter(i => i.type === 'file').map(i => i.path);
  }
  return (await fs.readdir(lokaal(map))).map(f => `${map}/${f}`);
}

export interface Bestand { pad: string; inhoud: string | Buffer | null } // null = verwijderen

async function lokaleCommit(paden: string[], bericht: string) {
  try {
    await git('add', '-A', '--', ...paden);
    await git('commit', '-q', '-m', bericht, '--', ...paden);
  } catch { /* geen git of niets te committen: de bestanden zijn wel opgeslagen */ }
}

export async function schrijfBestanden(bestanden: Bestand[], bericht: string) {
  const g = github();
  if (!g) {
    if (!import.meta.env.DEV) throw new Error('Publiceren is niet ingesteld (GITHUB_TOKEN en GITHUB_REPO ontbreken)');
    for (const b of bestanden) {
      if (b.inhoud === null) { await fs.rm(lokaal(b.pad), { force: true }); continue; }
      await fs.mkdir(path.dirname(lokaal(b.pad)), { recursive: true });
      await fs.writeFile(lokaal(b.pad), b.inhoud);
    }
    await lokaleCommit(bestanden.map(b => b.pad), bericht);
    return { commit: null };
  }
  // Eén commit met alle bestanden via de Git Data API
  for (let poging = 0; poging < 2; poging++) {
    const ref = await gh(`/git/ref/heads/${g.branch}`);
    const basis = await gh(`/git/commits/${ref.object.sha}`);
    const tree = await Promise.all(bestanden.map(async b => {
      if (b.inhoud === null) return { path: b.pad, mode: '100644', type: 'blob', sha: null };
      const blob = await gh('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: Buffer.from(b.inhoud).toString('base64'), encoding: 'base64' }),
      });
      return { path: b.pad, mode: '100644', type: 'blob', sha: blob.sha };
    }));
    const commit = await nieuweCommit(basis.tree.sha, tree, ref.object.sha, bericht);
    try {
      await gh(`/git/refs/heads/${g.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit, force: false }) });
      return { commit };
    } catch (e) {
      if (poging === 1) throw e; // tussendoor gewijzigd: nog één keer op de nieuwste versie
    }
  }
  return { commit: null };
}

async function nieuweCommit(basisTree: string, tree: unknown[], ouder: string, bericht: string) {
  const nieuweTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: basisTree, tree }) });
  const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: bericht, tree: nieuweTree.sha, parents: [ouder] }) });
  return commit.sha as string;
}

// ---------- geschiedenis en terugzetten ----------
export interface Versie { id: string; datum: string; bericht: string }

export async function geschiedenis(aantal = 40): Promise<Versie[]> {
  const g = github();
  if (g) {
    const commits = await gh(`/commits?sha=${encodeURIComponent(g.branch)}&path=${CONTENT}&per_page=${aantal}`) as
      { sha: string; commit: { message: string; committer: { date: string } } }[];
    return commits.map(c => ({ id: c.sha, datum: c.commit.committer.date, bericht: c.commit.message.split('\n')[0] }));
  }
  const uit = await git('log', `-n${aantal}`, '--format=%H%x1f%cI%x1f%s', '--', CONTENT);
  return uit.trim().split('\n').filter(Boolean).map(r => {
    const [id, datum, bericht] = r.split('\x1f');
    return { id, datum, bericht };
  });
}

/** Zet alle content terug naar hoe die was na versie `id`; dat wordt zelf weer een nieuwe versie */
export async function zetTerug(id: string, bericht: string) {
  if (!/^[0-9a-f]{7,40}$/.test(id)) throw new Error('Ongeldige versie');
  const g = github();
  if (!g) {
    if (!import.meta.env.DEV) throw new Error('Terugzetten is niet ingesteld');
    const toen = (await git('ls-tree', '-r', '--name-only', id, '--', CONTENT)).trim().split('\n').filter(Boolean);
    const nu = (await git('ls-files', '--', CONTENT)).trim().split('\n').filter(Boolean);
    for (const pad of nu) if (!toen.includes(pad)) await fs.rm(lokaal(pad), { force: true });
    await git('checkout', id, '--', CONTENT);
    await lokaleCommit([CONTENT], bericht);
    return;
  }
  const ref = await gh(`/git/ref/heads/${g.branch}`);
  const [huidig, doel] = await Promise.all([gh(`/git/commits/${ref.object.sha}`), gh(`/git/commits/${id}`)]);
  const boom = async (sha: string) => ((await gh(`/git/trees/${sha}?recursive=1`)).tree as { path: string; type: string; sha: string }[])
    .filter(e => e.type === 'blob' && e.path.startsWith(CONTENT));
  const [nu, toen] = await Promise.all([boom(huidig.tree.sha), boom(doel.tree.sha)]);
  const tree = [
    ...toen.map(e => ({ path: e.path, mode: '100644', type: 'blob', sha: e.sha })),
    ...nu.filter(e => !toen.some(t => t.path === e.path)).map(e => ({ path: e.path, mode: '100644', type: 'blob', sha: null })),
  ];
  const commit = await nieuweCommit(huidig.tree.sha, tree, ref.object.sha, bericht);
  await gh(`/git/refs/heads/${g.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit, force: false }) });
}
