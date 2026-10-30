// Anonieme statistieken (zie src/lib/statistiek.ts): paginabezoek, tijd, scrollen, klikken,
// aanvragen en feedback. Geen cookies en geen persoonsgegevens. Verstuurd met sendBeacon.
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

// paginabezoek en herkomst
const extern = document.referrer && new URL(document.referrer).host !== location.host ? new URL(document.referrer).host.replace(/^www\./, '') : '';
meet({ t: 'pv', r: extern, b: new URLSearchParams(location.search).get('utm_source') || '' });
stuur();

// tijd op de pagina (alleen zichtbare tijd) en hoe ver er gescrold is
let zichtbaar = document.visibilityState === 'visible' ? performance.now() : 0;
let tijd = 0, verst = 0;
const meetScroll = () => {
  const hoogte = document.documentElement.scrollHeight - innerHeight;
  verst = Math.max(verst, hoogte > 0 ? Math.round(scrollY / hoogte * 100) : 100);
};
addEventListener('scroll', meetScroll, { passive: true });
meetScroll();
const afsluiten = () => {
  if (zichtbaar) { tijd += performance.now() - zichtbaar; zichtbaar = 0; }
  if (tijd > 500) { meet({ t: 'eind', d: Math.round(tijd / 1000), s: verst }); tijd = 0; }
  stuur();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') afsluiten();
  else zichtbaar = performance.now();
});
addEventListener('pagehide', afsluiten);

// klikken: waarop (voor de toplijst) en waar (voor de heatmap)
const DOELEN = [
  [a => /^tel:/.test(a), 'bellen'], [a => /wa\.me/.test(a), 'whatsapp'], [a => /^mailto:/.test(a), 'mail'],
  [a => /\/contact#formulier$/.test(a), 'kennismaking'],
];
document.addEventListener('click', e => {
  const doel = e.target.closest('a, button, summary, input[type=submit], label');
  const href = doel?.getAttribute('href') || '';
  const label = doel ? (doel.getAttribute('aria-label') || doel.innerText || doel.textContent || href).replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  // Een klik op iets dat vast in beeld staat (de menubalk) hoort in de heatmap bovenaan de pagina
  let vast = false;
  for (let el = e.target; el instanceof Element && !vast; el = el.parentElement) vast = /fixed|sticky/.test(getComputedStyle(el).position);
  meet({ t: 'klik', k: label, x: e.pageX / document.documentElement.scrollWidth * 100, y: vast ? e.clientY : e.pageY });
  const soort = DOELEN.find(([test]) => test(href))?.[1];
  if (soort) { meet({ t: 'doel', g: soort }); stuur(); }
  // Naar een andere pagina van de site: nu al versturen, tijdens het wegnavigeren kan het verloren gaan
  const link = doel?.closest('a[href]');
  if (link && link.origin === location.origin && link.pathname !== location.pathname && link.target !== '_blank' && !e.ctrlKey && !e.metaKey && !e.shiftKey) afsluiten();
}, { capture: true, passive: true });
setInterval(stuur, 15000);

// andere scripts melden een behaald doel met: dispatchEvent(new CustomEvent('hh:doel', { detail: 'formulier' }))
let rekentoolGeteld = false;
addEventListener('hh:doel', e => { meet({ t: 'doel', g: e.detail }); stuur(); });
document.addEventListener('input', e => {
  if (rekentoolGeteld || !e.target.closest('.rekentool')) return;
  rekentoolGeteld = true;
  meet({ t: 'doel', g: pad.includes('checklist') ? 'checklist' : 'rekentool' });
}, { passive: true });

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
