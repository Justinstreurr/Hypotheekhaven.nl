// Inhoudsopgave: markeer de sectie die nu in beeld is
(() => {
  const links = [...document.querySelectorAll('.toc ol a')];
  const secties = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (!secties.length) return;
  const update = () => {
    const lijn = window.innerHeight * 0.3;
    let actief = secties[0];
    secties.forEach(s => { if (s.getBoundingClientRect().top <= lijn) actief = s; });
    // Onderaan de pagina: laatste sectie actief, ook als die kort is
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) actief = secties[secties.length - 1];
    links.forEach(a => a.classList.toggle('is-actief', a.getAttribute('href') === '#' + actief.id));
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
