// Cookietoestemming. Twee situaties:
// 1. PUBLIC_COOKIEBOT_ID ingesteld: Cookiebot (zie components/Cookiebot.astro) vraagt toestemming. Na toestemming
//    voor "Statistieken" laden Google Analytics (ga.js) en Microsoft Clarity. "Cookie-instellingen" in de footer
//    opent Cookiebot opnieuw.
// 2. Geen Cookiebot: de eigen kleine banner, alleen voor Microsoft Clarity. De keuze staat in localStorage
//    (geen cookie nodig) en is te wijzigen via "Cookie-instellingen" in de footer. Google Analytics laadt dan nooit.
import { laadGa, gaGeladen } from './ga.js';

const COOKIEBOT = import.meta.env.PUBLIC_COOKIEBOT_ID;
const CLARITY = import.meta.env.PUBLIC_CLARITY_ID;

const laadClarity = id => {
  if (!id || window.clarity || /(^|; )hh_edit=1/.test(document.cookie) || location.search.includes('hh-heatmap')) return;
  window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.clarity.ms/tag/' + id;
  document.head.append(s);
  window.clarity('consent');
};

if (COOKIEBOT) {
  // Niet in de bewerkmodus of heatmap: daar laadt Cookiebot ook niet
  if (!/(^|; )hh_edit=1/.test(document.cookie) && !location.search.includes('hh-heatmap')) {
    let ingetrokken = false;
    const pasToe = () => {
      const cb = window.Cookiebot;
      if (!cb?.hasResponse) return;
      if (cb.consent?.statistics) {
        laadGa();
        if (window.clarity) window.clarity('consent'); else laadClarity(CLARITY);
      } else if ((window.clarity || gaGeladen()) && !ingetrokken) {
        // Toestemming ingetrokken terwijl GA/Clarity al draaiden: Cookiebot zet Consent Mode zelf op "denied";
        // Clarity apart laten weten en met een schone pagina verder
        ingetrokken = true;
        window.clarity?.('consent', false);
        location.reload();
      }
    };
    ['CookiebotOnConsentReady', 'CookiebotOnAccept', 'CookiebotOnDecline'].forEach(n => addEventListener(n, pasToe));
    pasToe(); // Cookiebot kan al geladen zijn voordat dit script draait
    document.querySelectorAll('[data-cookie-instellingen]').forEach(knop => {
      knop.hidden = false;
      knop.addEventListener('click', () => window.Cookiebot?.renew());
    });
  }
} else {
  // Niet in de heatmap-weergave van het dashboard
  const banner = location.search.includes('hh-heatmap') ? null : document.querySelector('.cookiebanner');
  if (banner) {
    const SLEUTEL = 'hh-toestemming';
    const lees = () => { try { return localStorage.getItem(SLEUTEL); } catch { return null; } };
    const toon = open => { banner.hidden = !open; };

    if (lees() === 'ja') laadClarity(banner.dataset.clarity);
    else if (!lees()) toon(true);

    banner.querySelectorAll('[data-toestemming]').forEach(knop => knop.addEventListener('click', () => {
      const ja = knop.dataset.toestemming === 'ja';
      const was = lees();
      try { localStorage.setItem(SLEUTEL, ja ? 'ja' : 'nee'); } catch { /* geen opslag: dan vragen we het volgende keer opnieuw */ }
      toon(false);
      if (ja) laadClarity(banner.dataset.clarity);
      else if (was === 'ja') { window.clarity?.('consent', false); location.reload(); } // al geladen: met een schone pagina verder
    }));
    document.querySelectorAll('[data-cookie-instellingen]').forEach(knop => {
      knop.hidden = false;
      knop.addEventListener('click', () => { toon(true); banner.querySelector('button')?.focus(); });
    });
  }
}
