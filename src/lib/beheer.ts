// Serverkant van de bewerkmodus: inloggen, opschonen en wegschrijven van content.
// Lokaal (npm run dev, zonder GITHUB_TOKEN) schrijft hij direct naar src/; online maakt
// hij één commit op GitHub, waarna Vercel de site opnieuw bouwt.
import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AstroCookies } from 'astro';
import { parse, type HTMLElement, type Node } from 'node-html-parser';

const env = (k: string) => process.env[k] ?? (import.meta.env[k] as string | undefined);
const SESSIE = 'hh_sessie';
const UUR = 60 * 60;

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

// Eenvoudige rem op inlogpogingen per IP (per serverinstantie)
const pogingen = new Map<string, { n: number; tot: number }>();
export function teVeelPogingen(ip: string) {
  const nu = Date.now();
  const p = pogingen.get(ip);
  if (!p || p.tot < nu) { pogingen.set(ip, { n: 1, tot: nu + 15 * 60_000 }); return false; }
  p.n++;
  return p.n > 10;
}

// ---------- opschonen van ingevoerde HTML ----------
const TAGS = new Set(['b', 'strong', 'i', 'em', 'br', 'span', 'small', 'sup', 'sub', 'a', 'u', 'mark', 'abbr']);
const ATTRS = new Set(['class', 'href', 'target', 'rel', 'aria-hidden', 'aria-label', 'title']);

function schoon(node: Node) {
  for (const kind of [...node.childNodes]) {
    if (kind.nodeType === 3) continue;
    if (kind.nodeType !== 1) { kind.remove(); continue; }
    const el = kind as HTMLElement;
    const tag = el.rawTagName?.toLowerCase();
    if (!TAGS.has(tag)) {
      // onbekende tag: inhoud houden, tag weghalen (blokken worden een regelafbreking)
      schoon(el);
      const blok = ['div', 'p', 'li', 'h1', 'h2', 'h3', 'h4'].includes(tag);
      el.replaceWith((blok ? '<br>' : '') + el.innerHTML);
      continue;
    }
    for (const naam of Object.keys(el.attributes)) {
      const waarde = el.getAttribute(naam) ?? '';
      // data-* stuurt effecten aan (bijv. data-woorden voor het inkleuren) en kan geen code uitvoeren
      if (!ATTRS.has(naam.toLowerCase()) && !/^data-[a-z][a-z-]*$/.test(naam)) el.removeAttribute(naam);
      else if (naam === 'href' && !/^(https?:|mailto:|tel:|\/|#)/i.test(waarde.trim())) el.removeAttribute(naam);
    }
    if (el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener');
    schoon(el);
  }
}

export function schoneHtml(invoer: string) {
  const root = parse(`<div>${invoer}</div>`, { comment: false, blockTextElements: {} });
  const div = root.firstChild as HTMLElement;
  schoon(div);
  // Geen lege regels aan het begin of eind, ook niet net binnen een afsluitende tag
  let html = div.innerHTML.replace(/^(\s*<br>)+/, '');
  for (let vorige = ''; vorige !== html;) { vorige = html; html = html.replace(/(\s*<br>\s*)+((<\/[a-z]+>)*)$/, '$2'); }
  return html.trim();
}

export const schoneTekst = (s: string) => s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

// ---------- bestanden ----------
export const bestandPad = (naam: string) => {
  if (naam === 'site') return 'src/content/site.json';
  if (!/^[a-z0-9-]+$/.test(naam)) throw new Error('Ongeldige pagina');
  return `src/content/pages/${naam}.json`;
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

export async function leesBestand(relatief: string): Promise<string> {
  const g = github();
  if (g) return gh(`/contents/${relatief}?ref=${encodeURIComponent(g.branch)}`, { raw: true }) as Promise<string>;
  return fs.readFile(path.join(process.cwd(), relatief), 'utf8');
}

export async function schrijfBestanden(bestanden: { pad: string; inhoud: string | Buffer }[], bericht: string) {
  const g = github();
  if (!g) {
    if (!import.meta.env.DEV) throw new Error('Publiceren is niet ingesteld (GITHUB_TOKEN en GITHUB_REPO ontbreken)');
    for (const b of bestanden) {
      const doel = path.join(process.cwd(), b.pad);
      await fs.mkdir(path.dirname(doel), { recursive: true });
      await fs.writeFile(doel, b.inhoud);
    }
    return { commit: null };
  }
  // Eén commit met alle bestanden via de Git Data API
  for (let poging = 0; poging < 2; poging++) {
    const ref = await gh(`/git/ref/heads/${g.branch}`);
    const basis = await gh(`/git/commits/${ref.object.sha}`);
    const tree = await Promise.all(bestanden.map(async b => {
      const blob = await gh('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: Buffer.from(b.inhoud).toString('base64'), encoding: 'base64' }),
      });
      return { path: b.pad, mode: '100644', type: 'blob', sha: blob.sha };
    }));
    const nieuweTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: basis.tree.sha, tree }) });
    const commit = await gh('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message: bericht, tree: nieuweTree.sha, parents: [ref.object.sha] }),
    });
    try {
      await gh(`/git/refs/heads/${g.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
      return { commit: commit.sha as string };
    } catch (e) {
      if (poging === 1) throw e; // tussendoor gewijzigd: nog één keer op de nieuwste versie
    }
  }
  return { commit: null };
}
