// Verzekeringen: de kaart onder de muis (of met focus) wordt breed en toont de uitleg
(() => {
  const kaarten = [...document.querySelectorAll('.soort')];
  const zet = k => kaarten.forEach(o => o.classList.toggle('is-actief', o === k));
  kaarten.forEach(k => { k.addEventListener('mouseenter', () => zet(k)); k.addEventListener('focus', () => zet(k)); k.addEventListener('click', () => zet(k)); });
})();
