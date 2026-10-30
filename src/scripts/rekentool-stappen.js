/* REKENTOOLS: GEDEELDE STAPPEN
   Genummerde stappen die na invullen inklappen tot een samenvatting.
   Gebruikt door rentevast.js en checklist.js. De tool zelf houdt de antwoorden bij in een object
   en geeft via opties door wat er moet gebeuren.

   Opmaak in de HTML:
   - .rt-blok[data-blok="naam"] met .rt-blok-kop, [data-samenvatting], [data-wijzig] en .rt-blok-inhoud
   - invulveld: input[data-veld="sleutel"][data-soort="euro|pct|getal"]
   - één keuze: .rt-keuze[data-kies="sleutel"][data-waarde="..."]
   - meerdere keuzes: .rt-keuze[data-meer="sleutel"][data-waarde="..."]
   - knop naar de volgende stap: [data-verder]
   - alleen tonen bij een bepaalde situatie: [data-voor="waarde"] (vergeleken met antwoord.situatie) */
window.HH_Stappen = function (tool, a, opties) {
  const euro = (n) => Math.round(n).toLocaleString('nl-NL');
  const blokken = [...tool.querySelectorAll('.rt-blok')];
  const blok = (naam) => blokken.find((b) => b.dataset.blok === naam);
  const velden = [...tool.querySelectorAll('[data-veld]')];

  const lees = (el) => {
    const v = el.value.trim();
    if (!v) return NaN;
    return el.dataset.soort === 'pct'
      ? parseFloat(v.replace(/\s/g, '').replace(',', '.'))
      : parseFloat(v.replace(/[^\d,]/g, '').replace(',', '.'));
  };
  const toon = (el, v) => {
    if (v == null || !Number.isFinite(v)) { el.value = ''; return; }
    el.value = el.dataset.soort === 'pct' ? v.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
      : el.dataset.soort === 'getal' ? String(Math.round(v)) : euro(v);
  };
  const begrens = (el, v) => {
    const min = parseFloat(el.dataset.min ?? '-Infinity'), max = parseFloat(el.dataset.max ?? 'Infinity');
    return Math.min(max, Math.max(min, v));
  };

  // Velden en keuzes laten zien wat er in de antwoorden staat
  function vul() {
    velden.forEach((el) => { if (document.activeElement !== el) toon(el, a[el.dataset.veld]); });
    tool.querySelectorAll('.rt-keuze[data-kies]').forEach((k) => {
      const aan = a[k.dataset.kies] != null && String(a[k.dataset.kies]) === k.dataset.waarde;
      k.classList.toggle('is-gekozen', aan); k.setAttribute('aria-checked', String(aan));
    });
    tool.querySelectorAll('.rt-keuze[data-meer]').forEach((k) => {
      const aan = (a[k.dataset.meer] || []).includes(k.dataset.waarde);
      k.classList.toggle('is-gekozen', aan); k.setAttribute('aria-checked', String(aan));
    });
    tool.querySelectorAll('[data-voor]').forEach((el) => { el.hidden = !el.dataset.voor.split(' ').includes(a.situatie || opties.standaardSituatie); });
    opties.naVullen?.();
  }

  function samenvattingen() {
    blokken.forEach((b) => { const s = b.querySelector('[data-samenvatting]'); if (s) s.textContent = opties.samenvatting(b.dataset.blok) || ''; });
  }

  function open(naam, scroll) {
    blokken.forEach((b) => b.classList.toggle('is-open', b.dataset.blok === naam));
    tool.classList.remove('is-klaar');
    vul();
    const b = blok(naam);
    if (scroll) {
      const top = b.getBoundingClientRect().top;
      if (top < 80 || top > window.innerHeight * .6) window.scrollTo({ top: window.scrollY + top - 120, behavior: 'smooth' });
      const veld = b.querySelector('.rt-blok-inhoud input:not([type="checkbox"])');
      if (veld) setTimeout(() => veld.focus({ preventScroll: true }), 250);
    }
  }

  // Zichtbare velden van een stap bewaren; false als iets niet klopt
  function bewaar(naam) {
    const b = blok(naam);
    let goed = true;
    b.querySelectorAll('[data-veld]').forEach((el) => {
      if (el.closest('[hidden]')) return;
      const v = lees(el);
      if (!Number.isFinite(v)) {
        if (el.dataset.optioneel !== undefined) { a[el.dataset.veld] = null; return; }
        goed = false; el.closest('.rt-invoer').classList.add('is-fout'); return;
      }
      a[el.dataset.veld] = begrens(el, v);
    });
    if (goed && opties.controleer) goed = opties.controleer(naam) !== false;
    return goed;
  }

  function rondAf(naam) {
    const b = blok(naam);
    b.classList.add('is-klaar');
    b.classList.remove('is-open');
    samenvattingen();
    opties.naStap?.(naam);
    const volgende = blokken.slice(blokken.indexOf(b) + 1).find((x) => !x.classList.contains('is-klaar'));
    if (volgende) open(volgende.dataset.blok, true);
    else {
      blokken.forEach((x) => x.classList.remove('is-open'));
      tool.classList.add('is-klaar');
      opties.klaar?.();
    }
  }

  /* Knoppen en velden */
  tool.querySelectorAll('.rt-keuze[data-kies]').forEach((knop) => knop.addEventListener('click', () => {
    const k = knop.dataset.kies;
    const v = knop.dataset.getal !== undefined ? parseFloat(knop.dataset.waarde) : knop.dataset.waarde;
    const blokNu = knop.closest('.rt-blok');
    // Andere keuze in een stap die de rest bepaalt (zoals de situatie): de stappen erna opnieuw doorlopen
    if (blokNu.dataset.direct !== undefined && a[k] != null && a[k] !== v) {
      blokken.slice(blokken.indexOf(blokNu) + 1).forEach((b) => b.classList.remove('is-klaar'));
      opties.opnieuw?.();
    }
    a[k] = v;
    vul(); samenvattingen(); opties.wijziging?.();
    // Een keuze die de hele stap is (zoals de situatie) gaat meteen door
    if (knop.closest('.rt-blok').dataset.direct !== undefined) setTimeout(() => rondAf(knop.closest('.rt-blok').dataset.blok), 200);
  }));
  tool.querySelectorAll('.rt-keuze[data-meer]').forEach((knop) => knop.addEventListener('click', () => {
    const k = knop.dataset.meer, v = knop.dataset.waarde;
    const lijst = new Set(a[k] || []);
    lijst.has(v) ? lijst.delete(v) : lijst.add(v);
    // "Geen van deze" sluit de rest uit en andersom
    if (v === 'geen' && lijst.has('geen')) lijst.forEach((x) => { if (x !== 'geen') lijst.delete(x); });
    else lijst.delete('geen');
    a[k] = [...lijst];
    vul(); samenvattingen(); opties.wijziging?.();
  }));
  tool.querySelectorAll('[data-verder]').forEach((knop) => knop.addEventListener('click', () => {
    const naam = knop.closest('.rt-blok').dataset.blok;
    if (bewaar(naam)) rondAf(naam);
  }));
  tool.querySelectorAll('[data-wijzig]').forEach((knop) => knop.addEventListener('click', () => open(knop.closest('.rt-blok').dataset.blok, true)));
  tool.querySelectorAll('.rt-blok-kop').forEach((kop) => kop.addEventListener('click', (e) => {
    const b = kop.closest('.rt-blok');
    if (e.target.closest('[data-wijzig]') || !b.classList.contains('is-klaar') || b.classList.contains('is-open')) return;
    open(b.dataset.blok, true);
  }));
  velden.forEach((el) => {
    el.addEventListener('input', () => {
      el.closest('.rt-invoer').classList.remove('is-fout');
      const v = lees(el);
      if (Number.isFinite(v)) a[el.dataset.veld] = begrens(el, v);
      else if (el.dataset.optioneel !== undefined && !el.value.trim()) a[el.dataset.veld] = null;
      samenvattingen(); opties.wijziging?.();
    });
    el.addEventListener('blur', () => { const v = lees(el); if (Number.isFinite(v)) toon(el, begrens(el, v)); });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      el.closest('.rt-blok').querySelector('[data-verder]')?.click();
    });
  });

  return { open, vul, samenvattingen, euro, rondAf };
};
