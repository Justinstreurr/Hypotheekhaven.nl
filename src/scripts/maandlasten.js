/* REKENTOOL MAANDLASTEN
   Opzet: links de vragen als genummerde stappen die na invullen inklappen
   tot een samenvatting, rechts "Jouw berekening" die live meerekent, met grafiek en kennismaking.
   Alle fiscale cijfers komen uit normen.js (één keer per jaar bijwerken).

   Werkwijze berekening:
   - Bruto per maand = rente + aflossing. Rente per maand = openstaande schuld x (jaarrente / 12).
   - Annuïtair: vast bedrag P x r / (1 - (1 + r)^-n). Lineair: elke maand P / n aflossen.
   - Belastingvoordeel per jaar = (betaalde rente - eigenwoningforfait) x aftrektarief.
     Is het forfait hoger dan de rente (bijna afgelost), dan telt via de Wet Hillen
     nog maar een deel van het verschil mee als inkomen.
   - "Eerste maand" gebruikt de rente van maand 1; de grafiek toont per jaar het gemiddelde per maand. */
(function () {
  const N = window.HH_NORMEN;
  const tool = document.querySelector('.rekentool');
  if (!N || !tool || !tool.querySelector('.rt-stappen')) return;

  const euro = (n) => Math.round(n).toLocaleString('nl-NL');
  const procent = (f, dec = 2) => (f * 100).toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';

  /* ---------- Rekenen ---------- */
  function forfait(woz) {
    if (woz > N.villaGrens) return N.villaVastBedrag + (woz - N.villaGrens) * N.villaPct;
    let pct = 0;
    N.eigenwoningforfait.forEach((s) => { if (woz >= s.vanaf) pct = s.pct; });
    return woz * pct;
  }

  function belastingVoordeel(renteJaar, ewf, tarief) {
    if (renteJaar >= ewf) return (renteJaar - ewf) * tarief;
    // Wet Hillen: van het verschil telt maar een deel mee als inkomen
    return -(ewf - renteJaar) * (1 - N.hillenPct) * tarief;
  }

  function bereken(inv) {
    const n = Math.round(inv.looptijd * 12);
    const r = inv.rente / 100 / 12;
    const P = inv.bedrag;
    const annuiteit = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
    const ewf = forfait(inv.woz);
    const tarief = inv.inkomen > 0 && inv.inkomen <= N.grensSchijf1 ? N.tariefSchijf1 : N.maxAftrekTarief;

    let schuld = P, totaleRente = 0;
    const jaren = [];
    let eersteMaand = null;
    for (let jaar = 1; jaar <= inv.looptijd; jaar++) {
      let renteJaar = 0, brutoJaar = 0;
      for (let m = 0; m < 12 && schuld > 0.005; m++) {
        const rente = schuld * r;
        const aflossing = inv.vorm === 'lineair' ? Math.min(P / n, schuld) : Math.min(annuiteit - rente, schuld);
        if (!eersteMaand) eersteMaand = { rente, aflossing };
        schuld -= aflossing;
        renteJaar += rente;
        brutoJaar += rente + aflossing;
      }
      totaleRente += renteJaar;
      const aftrekbaar = jaar <= N.maxLooptijdAftrek;
      const voordeel = aftrekbaar ? belastingVoordeel(renteJaar, ewf, tarief) : 0;
      jaren.push({ jaar, bruto: brutoJaar / 12, netto: (brutoJaar - voordeel) / 12 });
    }

    const voordeelMaand1 = belastingVoordeel(eersteMaand.rente * 12, ewf, tarief) / 12;
    return {
      bruto: eersteMaand.rente + eersteMaand.aflossing,
      rente: eersteMaand.rente,
      aflossing: eersteMaand.aflossing,
      voordeel: voordeelMaand1,
      netto: eersteMaand.rente + eersteMaand.aflossing - voordeelMaand1,
      tarief, totaleRente, jaren
    };
  }

  /* ---------- Grafiek (inline SVG, geen bibliotheek) ---------- */
  const grafiekVak = tool.querySelector('[data-grafiek]');
  const B = 600, H = 200, L = 52, R = 12, T = 12, O = 26; // breedte, hoogte, marges
  function tekenGrafiek(jaren) {
    const waarden = jaren.flatMap((j) => [j.bruto, j.netto]);
    let max = Math.max(...waarden), min = Math.min(...waarden);
    const stap = Math.pow(10, Math.floor(Math.log10(Math.max(max - min, 100))));
    max = Math.ceil(max / stap) * stap;
    min = Math.max(0, Math.floor(min / stap) * stap - stap);
    const x = (i) => L + (jaren.length === 1 ? 0 : (i / (jaren.length - 1)) * (B - L - R));
    const y = (v) => T + (1 - (v - min) / (max - min || 1)) * (H - T - O);
    const lijn = (key) => jaren.map((j, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(j[key]).toFixed(1)).join(' ');
    const vlak = lijn('netto') + ` L${x(jaren.length - 1).toFixed(1)} ${H - O} L${L} ${H - O} Z`;

    // Y-as: drie hulplijnen. X-as: jaar 1, het midden en het laatste jaar
    const yLabels = [min, (min + max) / 2, max].map((v) =>
      `<line x1="${L}" x2="${B - R}" y1="${y(v)}" y2="${y(v)}" class="rt-g-hulp"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end">€ ${euro(v)}</text>`).join('');
    const xIdx = [...new Set([0, Math.round((jaren.length - 1) / 2), jaren.length - 1])];
    const xLabels = xIdx.map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === jaren.length - 1 ? 'end' : 'middle'}">jaar ${jaren[i].jaar}</text>`).join('');

    grafiekVak.innerHTML = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Verloop van je bruto en netto maandlast per jaar">
      ${yLabels}${xLabels}
      <path d="${vlak}" class="rt-g-vlak"/>
      <path d="${lijn('bruto')}" class="rt-g-bruto"/>
      <path d="${lijn('netto')}" class="rt-g-netto"/>
      <line class="rt-g-wijzer" y1="${T}" y2="${H - O}" x1="-10" x2="-10"/>
      <circle class="rt-g-punt rt-g-punt--bruto" r="4" cx="-10" cy="-10"/>
      <circle class="rt-g-punt" r="5" cx="-10" cy="-10"/>
    </svg><div class="rt-g-tip" hidden></div>`;

    // Meekijken met de muis of vinger: per jaar bruto en netto tonen
    const svg = grafiekVak.querySelector('svg');
    const tip = grafiekVak.querySelector('.rt-g-tip');
    const wijzer = svg.querySelector('.rt-g-wijzer');
    const [puntB, puntN] = svg.querySelectorAll('.rt-g-punt');
    const verberg = () => { grafiekVak.classList.remove('is-actief'); tip.hidden = true; wijzer.setAttribute('x1', -10); wijzer.setAttribute('x2', -10); puntB.setAttribute('cx', -10); puntN.setAttribute('cx', -10); };
    svg.addEventListener('pointermove', (e) => {
      const box = svg.getBoundingClientRect();
      const vx = ((e.clientX - box.left) / box.width) * B;
      const i = Math.max(0, Math.min(jaren.length - 1, Math.round(((vx - L) / (B - L - R)) * (jaren.length - 1))));
      const j = jaren[i];
      wijzer.setAttribute('x1', x(i)); wijzer.setAttribute('x2', x(i));
      puntB.setAttribute('cx', x(i)); puntB.setAttribute('cy', y(j.bruto));
      puntN.setAttribute('cx', x(i)); puntN.setAttribute('cy', y(j.netto));
      tip.innerHTML = `<strong>Jaar ${j.jaar}</strong><span>Netto € ${euro(j.netto)}</span><span>Bruto € ${euro(j.bruto)}</span>`;
      tip.hidden = false;
      grafiekVak.classList.add('is-actief');
      const links = (x(i) / B) * 100;
      tip.style.left = links + '%';
      tip.classList.toggle('is-rechts', links > 60);
    });
    svg.addEventListener('pointerleave', verberg);
  }

  /* ---------- Toestand: alle antwoorden op één plek ---------- */
  const a = {
    situatie: null, koopsom: 350000, inleg: 0, schuld: 250000, woz: 400000,
    rente: N.voorbeeldRente, looptijd: 30, vorm: 'annuitair', inkomen: null
  };
  const grens = { koopsom: [10000, 10000000], inleg: [0, 10000000], schuld: [10000, 10000000], woz: [10000, 10000000], rente: [0, 15], inkomen: [0, 10000000] };
  const leesGetal = (v, isRente) => {
    v = String(v).trim();
    if (!v) return NaN;
    return isRente ? parseFloat(v.replace(/\s/g, '').replace(',', '.')) : parseFloat(v.replace(/[^\d,]/g, '').replace(',', '.'));
  };
  const begrens = (k, v) => Math.min(grens[k][1], Math.max(grens[k][0], v));
  const renteTekst = (v) => v.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
  const invoer = () => ({
    bedrag: a.situatie === 'huidig' ? a.schuld : Math.max(10000, a.koopsom - a.inleg),
    woz: a.situatie === 'huidig' ? a.woz : a.koopsom,
    rente: a.rente, looptijd: a.looptijd, vorm: a.vorm, inkomen: a.inkomen || 0
  });

  /* ---------- Elementen ---------- */
  const blokken = [...tool.querySelectorAll('.rt-blok')];
  const blok = (naam) => blokken.find((b) => b.dataset.blok === naam);
  const uit = (naam, tekst) => tool.querySelectorAll(`[data-uit="${naam}"]`).forEach((el) => { el.textContent = tekst; });
  const velden = {};
  tool.querySelectorAll('[data-veld]').forEach((el) => { velden[el.dataset.veld] = el; });
  let laatste = null; // laatste berekening, voor de knop Bespreek je uitkomst
  let gereed = false; // stap 1 en 2 ingevuld: rechts mag meerekenen

  const normTekst = {
    jaar: String(N.jaar), maxAftrekTarief: procent(N.maxAftrekTarief), tariefSchijf1: procent(N.tariefSchijf1),
    grensSchijf1: euro(N.grensSchijf1), ewfPct: procent(N.eigenwoningforfait[N.eigenwoningforfait.length - 1].pct)
  };
  document.querySelectorAll('[data-norm]').forEach((el) => { el.textContent = normTekst[el.dataset.norm] || ''; });

  /* ---------- Stappen openen, afronden en wijzigen ---------- */
  function open(naam, scroll) {
    blokken.forEach((b) => b.classList.toggle('is-open', b.dataset.blok === naam));
    const b = blok(naam);
    vulVelden();
    toonPerSituatie();
    if (scroll) {
      const top = b.getBoundingClientRect().top;
      if (top < 80 || top > window.innerHeight * .6) window.scrollTo({ top: window.scrollY + top - 120, behavior: 'smooth' });
    }
    const veld = b.querySelector('.rt-blok-inhoud input');
    if (veld && scroll) setTimeout(() => veld.focus({ preventScroll: true }), 250);
  }
  function rondAf(naam) {
    const b = blok(naam);
    b.classList.add('is-klaar');
    b.classList.remove('is-open');
    werkSamenvattingBij();
    const volgende = blokken[blokken.indexOf(b) + 1];
    if (volgende && !volgende.classList.contains('is-klaar')) open(volgende.dataset.blok, true);
    else if (!volgende || blokken.every((x) => x.classList.contains('is-klaar'))) klaar();
  }
  // Alle stappen gedaan: niets meer open, uitkomst in beeld (op mobiel staat die onder de stappen)
  function klaar() {
    blokken.forEach((b) => b.classList.remove('is-open'));
    tool.classList.add('is-klaar');
    if (window.matchMedia('(max-width: 1024px)').matches) tool.querySelector('.rt-berekening').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function vulVelden() {
    Object.entries(velden).forEach(([k, el]) => {
      if (document.activeElement === el) return;
      if (k === 'rente') el.value = renteTekst(a.rente);
      else if (k === 'inkomen') el.value = a.inkomen ? euro(a.inkomen) : '';
      else el.value = euro(a[k]);
    });
    tool.querySelectorAll('.rt-keuze').forEach((k) => {
      const aan = a[k.dataset.kies] != null && String(a[k.dataset.kies]) === k.dataset.waarde;
      k.classList.toggle('is-gekozen', aan);
      k.setAttribute('aria-checked', String(aan));
    });
    tool.querySelector('[data-vorm-uitleg]').textContent = a.vorm === 'lineair'
      ? 'Elke maand hetzelfde bedrag aflossen. Je begint hoger, je maandlast daalt en je betaalt in totaal minder rente.'
      : 'Elke maand hetzelfde bruto bedrag. In het begin betaal je vooral rente. De meest gekozen vorm.';
  }
  // Teksten en velden die afhangen van kopen of al een hypotheek
  function toonPerSituatie() {
    const s = a.situatie || 'kopen';
    tool.querySelectorAll('[data-voor]').forEach((el) => { el.hidden = el.dataset.voor !== s; });
    const titel = blok('bedragen').querySelector('h3');
    titel.textContent = titel.dataset[s === 'huidig' ? 'titelHuidig' : 'titelKopen'];
    const lbl = tool.querySelector('#lbl-looptijd');
    lbl.textContent = lbl.dataset[s === 'huidig' ? 'labelHuidig' : 'labelKopen'];
  }

  function werkSamenvattingBij() {
    const zet = (naam, tekst) => { blok(naam).querySelector('[data-samenvatting]').textContent = tekst; };
    zet('situatie', a.situatie === 'huidig' ? 'Ik heb al een hypotheek' : 'Ik ga een huis kopen');
    zet('bedragen', a.situatie === 'huidig'
      ? `Hypotheek € ${euro(a.schuld)} · WOZ € ${euro(a.woz)}`
      : `Koopsom € ${euro(a.koopsom)} · eigen geld € ${euro(a.inleg)}`);
    zet('hypotheek', `${renteTekst(a.rente)}% · ${a.looptijd} jaar · ${a.vorm === 'lineair' ? 'lineair' : 'annuïtair'}`);
    zet('inkomen', a.inkomen ? `€ ${euro(a.inkomen)} per jaar` : 'Niet ingevuld');
  }

  // Waarden uit een stap overnemen; false als iets niet klopt
  function bewaar(naam) {
    const b = blok(naam);
    let goed = true;
    b.querySelectorAll('[data-veld]').forEach((el) => {
      if (el.closest('[hidden]')) return;
      const k = el.dataset.veld;
      const v = leesGetal(el.value, k === 'rente');
      if (k === 'inkomen') { a.inkomen = Number.isFinite(v) && v > 0 ? begrens(k, v) : null; return; }
      if (!Number.isFinite(v)) { goed = false; el.closest('.rt-invoer').classList.add('is-fout'); return; }
      a[k] = begrens(k, v);
    });
    if (naam === 'bedragen' && a.situatie === 'kopen' && a.inleg >= a.koopsom) {
      b.querySelector('[data-fout="inleg"]').hidden = false;
      velden.inleg.closest('.rt-invoer').classList.add('is-fout');
      goed = false;
    }
    return goed;
  }

  /* ---------- Rechts: live berekening ---------- */
  function werkBij() {
    tool.querySelector('[data-leeg]').hidden = gereed;
    tool.querySelector('[data-cijfers]').hidden = !gereed;
    tool.querySelector('[data-verloop]').hidden = !gereed;
    if (!gereed) return;
    const inv = invoer();
    const u = bereken(inv);
    laatste = { inv, u };
    uit('netto', euro(u.netto));
    uit('bruto', euro(u.bruto));
    uit('rente', euro(u.rente));
    uit('aflossing', euro(u.aflossing));
    uit('hypotheek', euro(inv.bedrag));
    const extra = u.voordeel < -0.5; // bijna geen rente meer: het forfait weegt zwaarder
    uit('voordeelLabel', extra ? 'Extra belasting' : 'Belastingvoordeel');
    uit('voordeelTeken', extra ? '+' : '−');
    uit('voordeel', euro(Math.abs(u.voordeel)));
    uit('tarief', procent(u.tarief));
    uit('totaleRente', euro(u.totaleRente));
    const peil = Math.min(10, Math.max(1, Math.round(inv.looptijd / 2)));
    const j = u.jaren[peil - 1];
    const verschil = j.netto - u.netto;
    uit('verloop', Math.abs(verschil) < 5
      ? `Na ${peil} jaar betaal je netto ongeveer hetzelfde: € ${euro(j.netto)} per maand.`
      : `Na ${peil} jaar betaal je netto ongeveer € ${euro(j.netto)} per maand, € ${euro(Math.abs(verschil))} ${verschil > 0 ? 'meer' : 'minder'} dan nu.`);
    tekenGrafiek(u.jaren);
  }

  /* ---------- Knoppen en velden ---------- */
  tool.querySelectorAll('.rt-keuze').forEach((knop) => knop.addEventListener('click', () => {
    const k = knop.dataset.kies;
    const v = k === 'looptijd' ? parseInt(knop.dataset.waarde, 10) : knop.dataset.waarde;
    // Andere situatie gekozen: de stappen erna opnieuw doorlopen en de oude uitkomst wissen (zoals bij rentevast)
    if (k === 'situatie' && a.situatie != null && a.situatie !== v) {
      const b = knop.closest('.rt-blok');
      blokken.slice(blokken.indexOf(b) + 1).forEach((x) => x.classList.remove('is-klaar'));
      tool.classList.remove('is-klaar');
      gereed = false; laatste = null;
    }
    a[k] = v;
    vulVelden();
    if (k === 'situatie') {
      toonPerSituatie();
      werkSamenvattingBij();
      werkBij();
      setTimeout(() => rondAf('situatie'), 200);
    } else {
      werkSamenvattingBij();
      werkBij();
    }
  }));
  tool.querySelectorAll('[data-verder]').forEach((knop) => knop.addEventListener('click', () => {
    const naam = knop.closest('.rt-blok').dataset.blok;
    if (!bewaar(naam)) return;
    if (naam === 'bedragen') gereed = true;
    werkBij();
    rondAf(naam);
  }));
  tool.querySelectorAll('[data-wijzig]').forEach((knop) => knop.addEventListener('click', () => {
    tool.classList.remove('is-klaar');
    open(knop.closest('.rt-blok').dataset.blok, true);
  }));
  // Een afgeronde stap kun je ook openen door op de kop te klikken
  tool.querySelectorAll('.rt-blok-kop').forEach((kop) => kop.addEventListener('click', (e) => {
    const b = kop.closest('.rt-blok');
    if (e.target.closest('[data-wijzig]') || !b.classList.contains('is-klaar') || b.classList.contains('is-open')) return;
    open(b.dataset.blok, true);
  }));
  Object.entries(velden).forEach(([k, el]) => {
    // Live meerekenen tijdens het typen (zodra stap 2 klaar is)
    el.addEventListener('input', () => {
      el.closest('.rt-invoer').classList.remove('is-fout');
      const fout = el.closest('.rt-blok').querySelector('[data-fout]'); if (fout) fout.hidden = true;
      const v = leesGetal(el.value, k === 'rente');
      if (k === 'inkomen') a.inkomen = Number.isFinite(v) && v > 0 ? begrens(k, v) : null;
      else if (Number.isFinite(v) && !(k === 'inleg' && v >= a.koopsom)) a[k] = begrens(k, v);
      werkSamenvattingBij();
      werkBij();
    });
    el.addEventListener('blur', () => {
      if (k === 'rente') { if (Number.isFinite(leesGetal(el.value, true))) el.value = renteTekst(a.rente); return; }
      const v = leesGetal(el.value);
      if (Number.isFinite(v)) el.value = euro(v);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      el.closest('.rt-blok').querySelector('[data-verder]')?.click();
    });
  });

  // Uitleg bij het belastingvoordeel
  const info = tool.querySelector('.rt-info');
  info.addEventListener('click', () => {
    const tekst = document.getElementById(info.getAttribute('aria-controls'));
    const isOpen = info.getAttribute('aria-expanded') !== 'true';
    info.setAttribute('aria-expanded', String(isOpen));
    tekst.hidden = !isOpen;
  });

  // Bespreek je uitkomst: samenvatting via sessionStorage naar het contactformulier (niet in de URL)
  tool.querySelector('.rt-bespreek').addEventListener('click', () => {
    if (!laatste) return;
    const { inv, u } = laatste;
    const tekst = `Ik heb mijn maandlasten berekend en wil die graag met je bespreken.\n\n` +
      (a.situatie === 'huidig' ? `Ik heb al een hypotheek: nog € ${euro(inv.bedrag)}` : `Ik wil een huis kopen: koopsom € ${euro(a.koopsom)}, eigen geld € ${euro(a.inleg)}, hypotheek € ${euro(inv.bedrag)}`) +
      `, ${inv.vorm === 'lineair' ? 'lineair' : 'annuïtair'}, ${inv.looptijd} jaar, rente ${renteTekst(inv.rente)}%.\n` +
      `Uitkomst: netto ongeveer € ${euro(u.netto)} per maand (bruto € ${euro(u.bruto)}).`;
    try { sessionStorage.setItem('hh-rekentool', tekst); } catch (e) { /* geen opslag: formulier blijft gewoon leeg */ }
  });

  // Start: stap 1 open
  open('situatie');
  werkBij();
})();
