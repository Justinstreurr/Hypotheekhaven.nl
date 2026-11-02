/* REKENTOOL RENTEVASTE PERIODE LOOPT AF
   Twee situaties:
   1. Rente loopt binnen een jaar af: vergelijk het rentevoorstel van je eigen bank met een andere
      geldverstrekker. Geen boeterente; wel kosten bij oversluiten. Uitkomst: verschil per maand,
      terugverdientijd en wat het scheelt over de nieuwe rentevaste periode.
   2. Rente staat nog jaren vast: tussentijds oversluiten. Boeterente volgens de uitgangspunten van de AFM:
      - boetevrij deel (meestal 10% van het oorspronkelijke bedrag) gaat eraf,
      - per maand het renteverschil (contractrente min vergelijkingsrente) over de schuld volgens het aflosschema,
      - contant gemaakt tegen de vergelijkingsrente, resterende periode naar beneden afgerond op hele maanden.
      Boeterente is bij oversluiten meestal aftrekbaar; we tonen ook het bedrag na aftrek (maximaal tarief).
   Alle maandlasten zijn bruto (rente + aflossing). Normen in normen.js. */
(function () {
  const N = window.HH_NORMEN;
  const tool = document.querySelector('.rekentool');
  if (!N || !tool || !window.HH_Stappen) return;

  const euro = (n) => Math.round(n).toLocaleString('nl-NL');
  const procent = (f, dec = 2) => (f * 100).toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
  const pct = (v) => v.toLocaleString('nl-NL', { maximumFractionDigits: 2 }) + '%';
  const duur = (maanden) => {
    if (maanden < 12) return `${Math.max(1, Math.round(maanden))} ${Math.round(maanden) === 1 ? 'maand' : 'maanden'}`;
    const j = maanden / 12;
    return `${j.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} jaar`;
  };

  const a = {
    situatie: null, schuld: 250000, rente: 3.2, looptijd: 22, vorm: 'annuitair',
    rentevastRest: 5, oorspronkelijk: null,
    renteBank: 4.6, renteNieuw: 4.2, renteVgl: null, periode: 10,
    kosten: N.oversluitKosten
  };

  /* ---------- Rekenen ---------- */
  // Maandbedragen voor een schuld vanaf nu: rente en aflossing per maand, voor de eerste 'maanden' maanden
  function schema(P, rentePct, jaren, vorm, maanden) {
    const n = Math.round(jaren * 12), r = rentePct / 100 / 12;
    const annuiteit = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
    let schuld = P;
    const uit = [];
    for (let m = 0; m < Math.min(maanden, n) && schuld > 0.005; m++) {
      const rente = schuld * r;
      const aflossing = vorm === 'lineair' ? Math.min(P / n, schuld) : Math.min(annuiteit - rente, schuld);
      uit.push({ schuld, rente, aflossing, bedrag: rente + aflossing });
      schuld -= aflossing;
    }
    return uit;
  }
  const maandlast = (P, rentePct, jaren, vorm) => schema(P, rentePct, jaren, vorm, 1)[0]?.bedrag || 0;
  // Totaal verschil in betalingen over een aantal maanden tussen twee rentes (zelfde schuld en looptijd)
  const verschilOver = (P, oud, nieuw, jaren, vorm, maanden) => {
    const s1 = schema(P, oud, jaren, vorm, maanden), s2 = schema(P, nieuw, jaren, vorm, maanden);
    return s1.reduce((som, x, i) => som + x.bedrag - (s2[i]?.bedrag || 0), 0);
  };

  // Boeterente volgens de AFM-uitgangspunten (zie kop)
  function boeterente() {
    const vgl = a.renteVgl ?? a.renteNieuw;
    if (a.rente <= vgl) return 0;
    const boetevrij = N.boetevrijPct * (a.oorspronkelijk || a.schuld);
    const basis = Math.max(0, a.schuld - boetevrij);
    const maanden = Math.floor(a.rentevastRest * 12);
    const rv = vgl / 100 / 12, verschil = (a.rente - vgl) / 100 / 12;
    // Schuld boven het boetevrije deel loopt af volgens het eigen aflosschema
    return schema(basis, a.rente, a.looptijd, a.vorm, maanden)
      .reduce((som, x, i) => som + (x.schuld * verschil) / Math.pow(1 + rv, i + 1), 0);
  }

  function bereken() {
    const huidig = maandlast(a.schuld, a.rente, a.looptijd, a.vorm);
    if (a.situatie === 'tussentijds') {
      const maanden = Math.floor(a.rentevastRest * 12);
      const nieuw = maandlast(a.schuld, a.renteNieuw, a.looptijd, a.vorm);
      const boete = boeterente();
      const boeteNetto = boete * (1 - N.maxAftrekTarief);
      const besparing = verschilOver(a.schuld, a.rente, a.renteNieuw, a.looptijd, a.vorm, maanden);
      const kosten = boeteNetto + a.kosten;
      return { soort: 'tussentijds', huidig, nieuw, perMaand: huidig - nieuw, boete, boeteNetto, besparing, kosten, saldo: besparing - kosten, maanden };
    }
    const verlengen = maandlast(a.schuld, a.renteBank, a.looptijd, a.vorm);
    const elders = maandlast(a.schuld, a.renteNieuw, a.looptijd, a.vorm);
    const maanden = Math.min(a.periode, a.looptijd) * 12;
    const besparing = verschilOver(a.schuld, a.renteBank, a.renteNieuw, a.looptijd, a.vorm, maanden);
    const perMaand = verlengen - elders;
    return { soort: 'aflopen', huidig, verlengen, elders, perMaand, besparing, saldo: besparing - a.kosten, terug: perMaand > 0 ? a.kosten / perMaand : Infinity, maanden };
  }

  /* ---------- Tonen ---------- */
  const uit = (naam, html) => tool.querySelectorAll(`[data-uit="${naam}"]`).forEach((el) => { el.innerHTML = html; });
  let gereed = false;
  let laatste = null;

  function werkBij() {
    tool.querySelector('[data-leeg]').hidden = gereed;
    tool.querySelector('[data-cijfers]').hidden = !gereed;
    tool.querySelector('[data-verloop]').hidden = !gereed;
    if (!gereed) return;
    const u = bereken();
    laatste = u;
    const rij = (label, waarde, klasse = '') => `<div class="${klasse}"><dt>${label}</dt><dd>${waarde}</dd></div>`;

    if (u.soort === 'aflopen') {
      const goedkoper = u.perMaand > 0.5;
      uit('hoofdLabel', goedkoper ? 'Per maand minder bij oversluiten' : 'Per maand meer bij oversluiten');
      uit('hoofd', euro(Math.abs(u.perMaand)));
      uit('oordeel', !goedkoper
        ? 'Verlengen bij je eigen bank is in dit voorbeeld voordeliger.'
        : u.saldo > 0
          ? `Oversluiten lijkt de moeite waard: de kosten heb je in ongeveer ${duur(u.terug)} terugverdiend.`
          : `De kosten verdien je binnen ${a.periode} jaar niet terug. Verlengen lijkt hier slimmer.`);
      tool.querySelector('[data-rijen]').innerHTML =
        rij('Je huidige maandlast', `€ ${euro(u.huidig)}`) +
        rij(`Verlengen bij je bank (${pct(a.renteBank)})`, `€ ${euro(u.verlengen)}`) +
        rij(`Oversluiten (${pct(a.renteNieuw)})`, `€ ${euro(u.elders)}`) +
        rij('Kosten van oversluiten', `€ ${euro(a.kosten)}`) +
        rij(`Over ${a.periode} jaar, na kosten`, `${u.saldo >= 0 ? '+' : '−'} € ${euro(Math.abs(u.saldo))}`, u.saldo >= 0 ? 'is-plus' : 'is-min');
      uit('balkenTitel', 'Je maandlast per <b>keuze</b>');
      tekenBalken([
        { label: 'Nu', waarde: u.huidig },
        { label: 'Verlengen bij je bank', waarde: u.verlengen },
        { label: 'Oversluiten', waarde: u.elders, accent: true }
      ]);
      uit('balkenTekst', `Bruto maandlasten in de eerste maand, bij een schuld van € ${euro(a.schuld)} en nog ${a.looptijd} jaar looptijd.`);
    } else {
      const loont = u.saldo > 0;
      uit('hoofdLabel', loont ? 'Voordeel tot einde rentevaste periode' : 'Nadeel tot einde rentevaste periode');
      uit('hoofd', euro(Math.abs(u.saldo)));
      uit('oordeel', u.boete < 1
        ? 'Je huidige rente is niet hoger dan de actuele rente, dus je betaalt waarschijnlijk geen boeterente.'
        : loont ? 'Na boeterente en kosten houd je in dit voorbeeld iets over. Laat de echte boete wel narekenen.'
          : 'De boeterente en kosten zijn hoger dan wat je bespaart. Wachten tot je rente afloopt lijkt slimmer.');
      tool.querySelector('[data-rijen]').innerHTML =
        rij('Boeterente (indicatie)', `€ ${euro(u.boete)}`) +
        rij(`Na belastingaftrek (${procent(N.maxAftrekTarief)})`, `€ ${euro(u.boeteNetto)}`) +
        rij('Kosten van oversluiten', `€ ${euro(a.kosten)}`) +
        rij(`Maandlast nu (${pct(a.rente)})`, `€ ${euro(u.huidig)}`) +
        rij(`Maandlast na oversluiten (${pct(a.renteNieuw)})`, `€ ${euro(u.nieuw)}`) +
        rij(`Besparing in ${duur(u.maanden)}`, `€ ${euro(u.besparing)}`, 'is-plus');
      uit('balkenTitel', 'Wat het kost, <b>wat het oplevert</b>');
      tekenBalken([
        { label: 'Boeterente na aftrek + kosten', waarde: u.kosten },
        { label: `Besparing tot einde rentevaste periode`, waarde: Math.max(0, u.besparing), accent: true }
      ]);
      uit('balkenTekst', 'Na het einde van je huidige rentevaste periode had je sowieso een nieuwe rente gekregen. Daarom tel ik alleen de besparing tot dat moment.');
    }
  }

  // Horizontale balken op inkt: rustig, met het bedrag erachter
  function tekenBalken(rijen) {
    const max = Math.max(...rijen.map((r) => r.waarde), 1);
    tool.querySelector('[data-balken]').innerHTML = rijen.map((r) => `
      <div class="rt-balk-rij${r.accent ? ' is-accent' : ''}">
        <span class="rt-balk-label">${r.label}</span>
        <div class="rt-balk-spoor"><span style="width:${Math.max(2, (r.waarde / max) * 100)}%"></span></div>
        <strong>€ ${euro(r.waarde)}</strong>
      </div>`).join('');
  }

  /* ---------- Stappen ---------- */
  const stappen = window.HH_Stappen(tool, a, {
    standaardSituatie: 'aflopen',
    samenvatting(naam) {
      if (naam === 'situatie') return a.situatie === 'tussentijds' ? 'Mijn rente staat nog een paar jaar vast' : a.situatie ? 'Mijn rente loopt binnen een jaar af' : '';
      if (naam === 'hypotheek') return `€ ${euro(a.schuld)} · ${pct(a.rente)} · nog ${a.looptijd} jaar` + (a.situatie === 'tussentijds' ? ` · rente nog ${a.rentevastRest.toLocaleString('nl-NL')} jaar vast` : '');
      if (naam === 'nieuw') return a.situatie === 'tussentijds' ? `Oversluiten tegen ${pct(a.renteNieuw)}` : `Bank ${pct(a.renteBank)} · elders ${pct(a.renteNieuw)} · ${a.periode} jaar vast`;
      if (naam === 'kosten') return `€ ${euro(a.kosten)}`;
      return '';
    },
    controleer(naam) {
      if (naam === 'hypotheek' && a.situatie === 'tussentijds' && a.rentevastRest > a.looptijd) a.rentevastRest = a.looptijd;
      return true;
    },
    naStap(naam) {
      if (naam === 'nieuw') gereed = true;
      werkBij();
    },
    wijziging: werkBij,
    opnieuw() { gereed = false; werkBij(); },
    klaar() {
      if (window.matchMedia('(max-width: 1024px)').matches) tool.querySelector('.rt-berekening').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Normen in de teksten
  const normen = { jaar: String(N.jaar), maxAftrekTarief: procent(N.maxAftrekTarief), boetevrijPct: procent(N.boetevrijPct, 0) };
  document.querySelectorAll('[data-norm]').forEach((el) => { if (normen[el.dataset.norm]) el.textContent = normen[el.dataset.norm]; });

  // Bespreek je uitkomst: samenvatting via sessionStorage naar het contactformulier (niet in de URL)
  tool.querySelector('.rt-bespreek').addEventListener('click', () => {
    if (!laatste) return;
    const u = laatste;
    const tekst = u.soort === 'aflopen'
      ? `Mijn rentevaste periode loopt binnenkort af en ik wil mijn opties bespreken.\n\nHypotheek € ${euro(a.schuld)}, nu ${pct(a.rente)}, nog ${a.looptijd} jaar.\nRentevoorstel eigen bank ${pct(a.renteBank)}, elders ${pct(a.renteNieuw)} (${a.periode} jaar vast).\nUitkomst: € ${euro(Math.abs(u.perMaand))} per maand ${u.perMaand > 0 ? 'minder' : 'meer'} bij oversluiten.`
      : `Ik overweeg mijn hypotheek tussentijds over te sluiten.\n\nHypotheek € ${euro(a.schuld)}, nu ${pct(a.rente)}, rente nog ${a.rentevastRest.toLocaleString('nl-NL')} jaar vast.\nNieuwe rente ${pct(a.renteNieuw)}. Indicatie boeterente € ${euro(u.boete)}.`;
    try { sessionStorage.setItem('hh-rekentool', tekst); } catch (e) { /* geen opslag: formulier blijft gewoon leeg */ }
  });

  stappen.open('situatie');
  werkBij();
})();
