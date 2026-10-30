// Cookietoestemming voor Microsoft Clarity. De keuze staat in localStorage (geen cookie nodig)
// en is te wijzigen via "Cookie-instellingen" in de footer.
// Niet in de heatmap-weergave van het dashboard
const banner = location.search.includes('hh-heatmap') ? null : document.querySelector('.cookiebanner');
if (banner) {
  const SLEUTEL = 'hh-toestemming';
  const lees = () => { try { return localStorage.getItem(SLEUTEL); } catch { return null; } };
  const laadClarity = () => {
    if (window.clarity || /(^|; )hh_edit=1/.test(document.cookie) || location.search.includes('hh-heatmap')) return;
    window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.clarity.ms/tag/' + banner.dataset.clarity;
    document.head.append(s);
    window.clarity('consent');
  };
  const toon = open => { banner.hidden = !open; };

  if (lees() === 'ja') laadClarity();
  else if (!lees()) toon(true);

  banner.querySelectorAll('[data-toestemming]').forEach(knop => knop.addEventListener('click', () => {
    const ja = knop.dataset.toestemming === 'ja';
    const was = lees();
    try { localStorage.setItem(SLEUTEL, ja ? 'ja' : 'nee'); } catch { /* geen opslag: dan vragen we het volgende keer opnieuw */ }
    toon(false);
    if (ja) laadClarity();
    else if (was === 'ja') { window.clarity?.('consent', false); location.reload(); } // al geladen: met een schone pagina verder
  }));
  document.querySelectorAll('[data-cookie-instellingen]').forEach(knop => {
    knop.hidden = false;
    knop.addEventListener('click', () => { toon(true); banner.querySelector('button')?.focus(); });
  });
}
