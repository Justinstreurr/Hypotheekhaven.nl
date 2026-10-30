// BLOG: kleine scripts voor de overzichtspagina en de artikelen (laad na script.js)

// Kaarten van artikelen die nog niet bestaan: niet klikbaar
document.querySelectorAll('a[aria-disabled="true"]').forEach(a => {
  a.addEventListener('click', e => e.preventDefault());
});

// Overzicht: filteren op categorie (data-categorie op de kaart, data-filter op de knop)
const blogFilter = document.querySelector('.blog-filter');
if (blogFilter) {
  const chips = [...blogFilter.querySelectorAll('.blog-chip')];
  const kaarten = [...document.querySelectorAll('.blog-raster .blog-kaart')];
  const raster = document.querySelector('.blog-raster');
  const teller = document.querySelector('.blog-filter-status');
  chips.forEach(chip => chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    chips.forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    let zichtbaar = 0;
    kaarten.forEach(k => {
      const toon = filter === 'alle' || k.dataset.categorie === filter;
      k.hidden = !toon;
      if (toon) zichtbaar++;
    });
    if (zichtbaar) raster.removeAttribute('data-leeg');
    else raster.dataset.leeg = 'Nog geen artikelen in deze categorie.';
    if (teller) teller.textContent = zichtbaar + (zichtbaar === 1 ? ' artikel' : ' artikelen') + ' getoond';
  }));
}

// Artikel: inhoudsopgave markeert de sectie die nu gelezen wordt
const toc = document.querySelector('.artikel-toc');
if (toc) {
  const links = [...toc.querySelectorAll('a[href^="#"]')];
  const secties = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  const markeer = () => {
    const lijn = window.innerHeight * .3;
    let actief = null;
    secties.forEach(s => { if (s.getBoundingClientRect().top <= lijn) actief = s; });
    links.forEach(a => {
      const aan = actief && a.getAttribute('href') === '#' + actief.id;
      a.classList.toggle('is-actief', !!aan);
      if (aan) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  };
  window.addEventListener('scroll', markeer, { passive: true });
  window.addEventListener('resize', markeer);
  markeer();
}

// Artikel: link kopiëren
document.querySelectorAll('[data-kopieer]').forEach(knop => {
  const label = knop.querySelector('span');
  const origineel = label.textContent;
  knop.addEventListener('click', async () => {
    const url = document.querySelector('link[rel="canonical"]')?.href || location.href;
    try {
      await navigator.clipboard.writeText(url);
      label.textContent = 'Link gekopieerd';
    } catch {
      window.prompt('Kopieer de link:', url);
      return;
    }
    knop.classList.add('is-gekopieerd');
    setTimeout(() => { label.textContent = origineel; knop.classList.remove('is-gekopieerd'); }, 2200);
  });
});
