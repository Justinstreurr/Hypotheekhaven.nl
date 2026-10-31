// Google Analytics 4. Laadt alleen als PUBLIC_COOKIEBOT_ID én PUBLIC_GA_ID zijn ingesteld, en pas nadat de bezoeker
// in Cookiebot toestemming gaf voor statistieken (laadGa wordt aangeroepen vanuit toestemming.js).
// Alleen op productie (PUBLIC_ENV=production), zodat previews en lokaal testen de cijfers niet vervuilen.
// Testen: open een pagina met ?ga-debug; dan laadt GA ook buiten productie, met debug_mode (zichtbaar in DebugView).
// Nooit in de bewerkmodus of de heatmap-weergave. Er gaan geen persoonsgegevens mee: geen formulierinhoud,
// geen telefoonnummers of e-mailadressen, alleen soorten acties.
const GA_ID = import.meta.env.PUBLIC_GA_ID;
const productie = import.meta.env.PUBLIC_ENV === 'production';
const debug = (() => {
  try {
    if (location.search.includes('ga-debug')) sessionStorage.setItem('hh-ga-debug', '1');
    return sessionStorage.getItem('hh-ga-debug') === '1';
  } catch { return location.search.includes('ga-debug'); }
})();
// Ook voor Clarity: alleen op productie, of buiten productie met ?ga-debug
export const meetOmgeving = productie || debug;
const uitgesloten = /(^|; )hh_edit=1/.test(document.cookie) || location.search.includes('hh-heatmap');
export const gaMogelijk = Boolean(GA_ID && import.meta.env.PUBLIC_COOKIEBOT_ID && (productie || debug) && !uitgesloten);

let actief = false;
export const gaGeladen = () => actief;

export function laadGa() {
  if (actief || !gaMogelijk || typeof window.gtag !== 'function') return; // gtag komt uit de Consent Mode-code in <head>
  actief = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
  document.head.append(s);
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, debug ? { debug_mode: true } : {});
}

const stuur = (naam, param = {}) => { if (actief) window.gtag('event', naam, param); };
const plek = el => el.closest('header, footer, nav, .menu, .feedback, .rekentool, main')?.tagName.toLowerCase() || 'pagina';

// Bellen, WhatsApp en e-mail (uitgaande links en scrollen meet GA zelf via "Enhanced measurement")
document.addEventListener('click', e => {
  if (!actief) return;
  const a = e.target.closest('a[href]');
  const href = a?.getAttribute('href') || '';
  if (/^tel:/.test(href)) stuur('bellen', { link_locatie: plek(a) });
  else if (/^https:\/\/wa\.me\/\d/.test(href)) stuur('whatsapp', { link_locatie: plek(a) });
  else if (/^mailto:[^?]/.test(href)) stuur('email', { link_locatie: plek(a) });
  else if (a?.matches('.rekentool .rt-bespreek')) stuur('rekentool_bespreken', { tool: tool() });
  const knop = e.target.closest('button');
  if (knop?.matches('.feedback [data-nuttig]')) stuur('feedback', { nuttig: knop.dataset.nuttig === 'ja' ? 'ja' : 'nee' });
  else if (knop?.matches('.rekentool [data-print]')) stuur('checklist_printen');
}, { capture: true, passive: true });

// Contactformulier: contact.js meldt het resultaat met het event 'hh:doel' (ook gebruikt door de eigen statistieken)
addEventListener('hh:doel', e => {
  if (e.detail === 'formulier') stuur('generate_lead', { lead_bron: 'contactformulier' });
  else if (e.detail === 'formulier-mail') stuur('contactformulier_mail'); // terugval: mailprogramma geopend, niet zeker verstuurd
});

// Rekentools en documentenchecklist: één keer per paginaweergave
const tool = () => (location.pathname.includes('checklist') ? 'documentenchecklist' : location.pathname.includes('rentevast') ? 'rentevast' : 'maandlasten');
const gehad = new Set();
const eenKeer = (naam, param) => { if (actief && !gehad.has(naam)) { gehad.add(naam); stuur(naam, param); } };
document.querySelectorAll('.rekentool').forEach(el => new MutationObserver(() => {
  if (!el.classList.contains('is-klaar')) return;
  if (tool() === 'documentenchecklist') eenKeer('checklist_ingevuld');
  else eenKeer('rekentool_gebruikt', { tool: tool() });
}).observe(el, { attributes: true, attributeFilter: ['class'] }));
document.addEventListener('change', e => {
  if (e.target.matches?.('.rekentool [data-doc]') && e.target.checked) eenKeer('checklist_afvinken');
}, { passive: true });
