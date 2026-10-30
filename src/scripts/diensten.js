// Diensten: twee tabbladen; per tab wordt de kaart onder de muis (of met focus/klik) breed.
// Een anker in de url (#oversluiten, ook vanaf de homepage) kiest het juiste tabblad en de juiste kaart.
(() => {
  const knoppen = [...document.querySelectorAll('.tabs-knop')];
  const panelen = [...document.querySelectorAll('.tab-paneel')];
  const kiesTab = paneel => {
    panelen.forEach(p => p.classList.toggle('is-actief', p === paneel));
    knoppen.forEach(k => { const aan = k.getAttribute('aria-controls') === paneel.id; k.classList.toggle('is-actief', aan); k.setAttribute('aria-selected', aan); });
  };
  const kiesKaart = kaart => kaart.parentElement.querySelectorAll('.tab-kaart').forEach(k => k.classList.toggle('is-actief', k === kaart));
  knoppen.forEach(k => k.addEventListener('click', () => kiesTab(document.getElementById(k.getAttribute('aria-controls')))));
  // Kleine vertraging bij hover, zodat de kaarten niet heen en weer springen als je er snel overheen beweegt
  let hoverTimer;
  document.querySelectorAll('.tab-kaart').forEach(k => {
    k.addEventListener('mouseenter', () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => kiesKaart(k), 140); });
    k.addEventListener('mouseleave', () => clearTimeout(hoverTimer));
    ['focus', 'click'].forEach(e => k.addEventListener(e, () => { clearTimeout(hoverTimer); kiesKaart(k); }));
  });
  const openVanuitHash = () => {
    const kaart = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!kaart || !kaart.classList.contains('tab-kaart')) return;
    kiesTab(kaart.parentElement); kiesKaart(kaart);
    requestAnimationFrame(() => document.querySelector('.tabs').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  window.addEventListener('hashchange', openVanuitHash);
  openVanuitHash();
})();
