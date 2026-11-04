// Anonieme statistieken (zie src/lib/statistiek.ts): paginabezoek, tijd, scrollen, klikken,
// aanvragen en feedback. Geen cookies, geen opslag in de browser en geen persoonsgegevens. Verstuurd met sendBeacon.
const metenAan = !/(^|; )hh_edit=1/.test(document.cookie) && !navigator.webdriver && !location.search.includes('hh-heatmap');

const pad = location.pathname.replace(/\/$/, '') || '/';
const apparaat = innerWidth < 768 ? 'mobiel' : innerWidth <= 1024 ? 'tablet' : 'desktop';
let wachtrij = [];
const stuur = () => {
  if (!wachtrij.length || !metenAan) return;
  navigator.sendBeacon('/api/m', JSON.stringify(wachtrij));
  wachtrij = [];
};
const meet = e => { if (metenAan) wachtrij.push({ p: pad, a: apparaat, ...e }); };

// paginabezoek, herkomst en campagne. "Binnenkomst" = eerste pagina van een bezoek (geen verwijzing vanaf deze site).
const verwijzer = (() => { try { return new URL(document.referrer).host; } catch { return ''; } })();
const extern = verwijzer && verwijzer !== location.host ? verwijzer.replace(/^(www|m|l|lm)\./, '') : '';
const binnenkomst = verwijzer !== location.host;
const zoek = new URLSearchParams(location.search);
// de 404-pagina telt apart, zodat kapotte links opvallen zonder de paginalijst te vervuilen
const nietGevonden = document.body.dataset.pagina === 'niet-gevonden';
const paginaweergave = () => {
  meet({ t: nietGevonden ? '404' : 'pv', r: extern, b: zoek.get('utm_source') || '', c: zoek.get('utm_campaign') || '', i: binnenkomst ? 1 : 0 });
  stuur();
};
paginaweergave();

// tijd op de pagina (alleen zichtbare tijd) en hoe ver er gescrold is.
// Het eerste "eind" telt als leesbeurt; komt de bezoeker terug naar het tabblad, dan telt alleen de extra tijd (v).
let zichtbaar = document.visibilityState === 'visible' ? performance.now() : 0;
let tijd = 0, verst = 0, eindVerstuurd = false, verder = false;
const meetScroll = () => {
  const hoogte = document.documentElement.scrollHeight - innerHeight;
  verst = Math.max(verst, hoogte > 0 ? Math.round(scrollY / hoogte * 100) : 100);
};
addEventListener('scroll', meetScroll, { passive: true });
meetScroll();
const afsluiten = () => {
  if (zichtbaar) { tijd += performance.now() - zichtbaar; zichtbaar = 0; }
  if (tijd > 500 && !nietGevonden) {
    meet(eindVerstuurd ? { t: 'eind', d: Math.round(tijd / 1000), v: 1 } : { t: 'eind', d: Math.round(tijd / 1000), s: verst });
    eindVerstuurd = true; tijd = 0;
  }
  stuur();
  // Nog steeds in beeld (bijv. een tel:-link die beforeunload gaf maar de pagina liet staan): verder meten
  if (document.visibilityState === 'visible') zichtbaar = performance.now();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') afsluiten();
  else zichtbaar = performance.now();
});
// beforeunload komt in sommige browsers betrouwbaarder door dan pagehide; afsluiten() telt maar één keer
addEventListener('beforeunload', afsluiten);
addEventListener('pagehide', afsluiten);
// Terug via de vorige-knop uit de back/forward-cache: telt als nieuwe weergave
addEventListener('pageshow', e => {
  if (!e.persisted) return;
  eindVerstuurd = false; verder = false; tijd = 0; verst = 0; zichtbaar = performance.now();
  meetScroll(); paginaweergave();
});

// klikken: waarop (voor de toplijst), waar (voor de heatmap) en welke klik een doel is
const nummer = /^https:\/\/wa\.me\/\d/;
const DOELEN = [
  [a => /^tel:/.test(a), 'bellen'], [a => nummer.test(a), 'whatsapp'], [a => /^mailto:[^?]/.test(a), 'mail'],
  [a => /\/contact#formulier$/.test(a), 'kennismaking'],
  [a => /^mailto:\?|wa\.me\/\?|linkedin\.com\/sharing|facebook\.com\/sharer|x\.com\/intent/.test(a), 'delen'],
  [a => /\.pdf(\?|#|$)/i.test(a), 'download'],
];
document.addEventListener('click', e => {
  const doel = e.target.closest('a, button, summary, input[type=submit], label');
  const href = doel?.getAttribute('href') || '';
  const label = doel ? (doel.getAttribute('aria-label') || doel.innerText || doel.textContent || href).replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  // Een klik op iets dat vast in beeld staat (de menubalk) hoort in de heatmap bovenaan de pagina
  let vast = false;
  for (let el = e.target; el instanceof Element && !vast; el = el.parentElement) vast = /fixed|sticky/.test(getComputedStyle(el).position);
  meet({ t: 'klik', k: label, x: e.pageX / document.documentElement.scrollWidth * 100, y: vast ? e.clientY : e.pageY });
  const soort = DOELEN.find(([test]) => test(href))?.[1] || (doel?.matches('[data-print]') ? 'print' : '');
  if (soort) meet({ t: 'doel', g: soort });
  // de rekentools en de checklist beginnen met keuzeknoppen, niet met typen
  if (e.target.closest('.rekentool [data-kies], .rekentool [data-meer]')) eenKeer(pad.includes('checklist') ? 'checklist' : 'rekentool');
  const link = doel?.closest('a[href]');
  // Naar een andere website: alleen de domeinnaam (Trustoo, Google-reviews, LinkedIn, ...). WhatsApp telt al als doel.
  if (link && /^https?:$/.test(link.protocol) && link.host !== location.host && !/wa\.me$/.test(link.host)) meet({ t: 'uit', h: link.host.replace(/^www\./, '') });
  if (soort || link) stuur();
  // Naar een andere pagina van de site: nu al versturen, tijdens het wegnavigeren kan het verloren gaan
  if (link && link.origin === location.origin && link.pathname !== location.pathname && link.target !== '_blank' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    // doorgeklikt vanaf de eerste pagina van het bezoek: wie dat niet doet, is "direct weer weg" (bounce)
    if (binnenkomst && !verder) meet({ t: 'verder' });
    verder = true;
    afsluiten();
  }
}, { capture: true, passive: true });
setInterval(stuur, 15000);

// andere scripts melden een behaald doel met: dispatchEvent(new CustomEvent('hh:doel', { detail: 'formulier' }))
addEventListener('hh:doel', e => { meet({ t: 'doel', g: e.detail }); stuur(); });
// eenmalig per pagina: eerste invoer in een rekentool / het contactformulier, en een rekentool tot het eind ingevuld
const eenmaal = new Set();
const eenKeer = g => { if (!eenmaal.has(g)) { eenmaal.add(g); meet({ t: 'doel', g }); stuur(); } };
document.addEventListener('input', e => {
  if (e.target.closest('.rekentool')) eenKeer(pad.includes('checklist') ? 'checklist' : 'rekentool');
  else if (e.target.closest('.contactformulier')) eenKeer('formulierstart');
}, { passive: true });
document.querySelectorAll('.rekentool').forEach(tool => new MutationObserver(() => {
  if (tool.classList.contains('is-klaar')) eenKeer(pad.includes('checklist') ? 'checklistklaar' : 'uitkomst');
}).observe(tool, { attributes: true, attributeFilter: ['class'] }));

// feedback: "Was deze pagina nuttig?"
const fb = document.querySelector('.feedback');
if (fb) {
  let nuttig = null;
  fb.querySelectorAll('[data-nuttig]').forEach(knop => knop.addEventListener('click', () => {
    nuttig = knop.dataset.nuttig === 'ja';
    fb.dataset.stap = 'opmerking';
    meet({ t: 'fb', n: nuttig });
    stuur();
    fb.querySelector('textarea')?.focus();
  }));
  fb.querySelector('form')?.addEventListener('submit', e => {
    e.preventDefault();
    const o = fb.querySelector('textarea').value.trim();
    if (o) { meet({ t: 'fb', n: nuttig, o }); stuur(); }
    fb.dataset.stap = 'bedankt';
  });
}
