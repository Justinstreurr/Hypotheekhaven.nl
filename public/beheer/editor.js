/* Bewerkmodus van Hypotheekhaven.
   Wordt alleen geladen als je bent ingelogd (cookie hh_edit, zie Base.astro).
   Klik op een tekst of foto om hem aan te passen; "Publiceren" zet alles in één keer live.
   Elke publicatie is een versie: via "Geschiedenis" zet je een eerdere versie terug. */
(() => {
  const PAGINA = document.body.dataset.pagina;
  if (!PAGINA || window.__hhEditor) return;
  window.__hhEditor = true;

  const CONCEPT = 'hh-concept';
  const STAPPEN = 'hh-stappen';
  const SCROLL = 'hh-scroll';
  const bron = {};                 // { bestand: inhoud } zoals op de server
  const wijzigingen = new Map();   // "soort|bestand:sleutel" -> { bestand, soort, sleutel, waarde }
  const uploads = new Map();       // id -> { id, naam, data }
  let stappen = [];                // eerdere toestanden van `wijzigingen`, voor Ongedaan maken
  let bewaard = true;              // staat het concept veilig in de browser?
  let modus = 'bewerk';
  let actief = null;               // element dat nu bewerkt wordt
  let actiefOrigineel = '';
  let lokaal = false;

  const CATEGORIEEN = { 'huis-kopen': 'Een huis kopen', 'huidige-hypotheek': 'Je huidige hypotheek', verzekeringen: 'Verzekeringen', ondernemers: 'Ondernemers' };
  const STATUSSEN = { concept: 'Concept (alleen zichtbaar voor jou)', gepubliceerd: 'Gepubliceerd', ingepland: 'Ingepland (gaat op de datum vanzelf live)', binnenkort: 'Binnenkort (alleen de kaart, nog geen artikel)' };
  const vandaag = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const datumKort = iso => new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  const datumLang = iso => new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const NIEUW = { vraag: 'Nieuwe vraag', antwoord: 'Schrijf hier het antwoord.', tekst: '“Schrijf hier de review.”', naam: 'Naam' };

  const $ = (tag, attrs = {}, kids = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    [].concat(kids).forEach(k => k && el.append(k));
    return el;
  };
  const splits = ref => { const i = ref.indexOf(':'); return [ref.slice(0, i), ref.slice(i + 1)]; };
  const sleutelVan = (soort, ref) => soort + '|' + ref;
  const kopie = v => JSON.parse(JSON.stringify(v));
  const api = async (url, data) => {
    const r = await fetch(url, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const d = await r.json().catch(() => ({ ok: false }));
    if (!d.ok) throw new Error(d.fout || 'Er ging iets mis');
    return d;
  };

  // ---------- opstarten ----------
  async function start() {
    let sessie;
    try { sessie = await (await fetch('/api/beheer/sessie', { cache: 'no-store' })).json(); } catch { return; }
    if (!sessie.ingelogd) { document.cookie = 'hh_edit=; Max-Age=0; path=/'; try { sessionStorage.removeItem('hh_bewerk'); } catch { /* geen opslag */ } return; }
    lokaal = sessie.lokaal;
    document.head.append($('link', { rel: 'stylesheet', href: '/beheer/editor.css' }));
    // Alle contentbestanden waar deze pagina uit bestaat (ook blogartikelen in het overzicht)
    const bestanden = new Set(['site', PAGINA]);
    document.querySelectorAll('[data-e],[data-ei],[data-el],[data-eb],[data-ef],[data-artikel]').forEach(el => {
      const ref = el.dataset.e || el.dataset.ei || el.dataset.el || el.dataset.eb || el.dataset.ef || el.dataset.artikel;
      bestanden.add(ref.includes(':') ? splits(ref)[0] : ref);
    });
    document.querySelectorAll('[data-ea]').forEach(el => bestanden.add(splits(el.dataset.ea.split('|')[1])[0]));
    try {
      Object.assign(bron, (await api('/api/beheer/inhoud?bestanden=' + [...bestanden].map(encodeURIComponent).join(','))).inhoud);
    } catch (e) { return melding(e.message, 'fout'); }
    document.documentElement.classList.add('hh-bewerk');
    document.querySelectorAll('details').forEach(el => { el.open = true; });
    document.execCommand('defaultParagraphSeparator', false, 'p');
    try { stappen = JSON.parse(sessionStorage.getItem(STAPPEN) || '[]'); } catch { stappen = []; }
    bouwBalk();
    herstelConcept();
    bereidLijstenVoor();
    document.addEventListener('click', klik, true);
    document.addEventListener('mouseover', toonItemKnoppen);
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !actief && !e.target.closest('input, textarea')) { e.preventDefault(); ongedaan(); }
    });
    window.addEventListener('beforeunload', e => {
      stopBewerken(true);
      if (wijzigingen.size && !bewaard) { e.preventDefault(); e.returnValue = ''; }
      else weg = true;
    });
    // Lokaal herlaadt de ontwikkelserver de pagina zodra er bestanden zijn opgeslagen; dat breekt
    // een lopend verzoek af. Dat is dan geen mislukte publicatie.
    window.addEventListener('pagehide', () => { weg = true; });
    if (localStorage.getItem('hh-zij') !== 'dicht') zijbalk(true);
    const scroll = sessionStorage.getItem(SCROLL);
    if (scroll) { sessionStorage.removeItem(SCROLL); requestAnimationFrame(() => scrollTo(0, Number(scroll))); }
  }

  // ---------- werkbalk ----------
  let teller, publiceerKnop, terugKnop;
  function bouwBalk() {
    const schakel = $('button', { class: 'hh-schakel is-aan', type: 'button', 'aria-pressed': 'true', onclick: () => {
      modus = modus === 'bewerk' ? 'bekijk' : 'bewerk';
      if (modus === 'bekijk') { stopBewerken(true); verbergItemKnoppen(); }
      schakel.classList.toggle('is-aan', modus === 'bewerk');
      schakel.setAttribute('aria-pressed', String(modus === 'bewerk'));
      schakel.lastChild.textContent = modus === 'bewerk' ? 'Klikken = bewerken' : 'Klikken = website gebruiken';
      document.documentElement.classList.toggle('hh-bekijk', modus === 'bekijk');
    } }, [$('span', { class: 'hh-schakel-bol' }), $('span', { text: 'Klikken = bewerken' })]);
    teller = $('span', { class: 'hh-teller', text: 'Geen wijzigingen' });
    publiceerKnop = $('button', { class: 'hh-knop hh-knop--hoofd', type: 'button', disabled: true, onclick: publiceer, text: 'Publiceren' });
    terugKnop = $('button', { class: 'hh-knop', type: 'button', disabled: true, onclick: ongedaan, title: 'Laatste wijziging ongedaan maken (Ctrl+Z)', text: '↶ Ongedaan maken' });
    const artikel = PAGINA.startsWith('blog/') ? PAGINA : PAGINA.startsWith('blog-') ? 'blog/' + PAGINA.slice(5) : null;
    const status = artikel && bron[artikel]?.artikel?.status;
    const datum = artikel && bron[artikel]?.artikel?.datum;
    const balk = $('div', { class: 'hh-balk', role: 'toolbar', 'aria-label': 'Bewerkmodus' }, [
      $('button', { class: 'hh-knop hh-knop--menu', type: 'button', onclick: () => zijbalk(!document.querySelector('.hh-zij')), title: 'Alle pagina\'s', text: '☰ Pagina\'s' }),
      $('span', { class: 'hh-label', text: lokaal ? 'Bewerkmodus (lokaal)' : 'Bewerkmodus' }),
      status === 'concept' && $('span', { class: 'hh-concept', text: 'Concept: nog niet zichtbaar in het blog' }),
      status === 'ingepland' && datum > vandaag() && $('span', { class: 'hh-concept hh-concept--gepland', text: `Ingepland: gaat ${datumLang(datum)} vanzelf live` }),
      schakel,
      PAGINA === 'blog' && $('button', { class: 'hh-knop', type: 'button', onclick: nieuwArtikel, text: '+ Nieuw artikel' }),
      (PAGINA === 'blog' || artikel) && $('button', { class: 'hh-knop', type: 'button', onclick: planningPaneel, text: 'Blogplanning' }),
      artikel && bron[artikel] && $('button', { class: 'hh-knop', type: 'button', onclick: () => artikelPaneel(artikel), text: 'Artikel' }),
      PAGINA === 'contact' && $('button', { class: 'hh-knop', type: 'button', onclick: formulierPaneel, text: 'Formulier' }),
      $('button', { class: 'hh-knop', type: 'button', onclick: fotoPaneel, text: 'Achtergrondfoto\'s' }),
      $('button', { class: 'hh-knop', type: 'button', onclick: paginaPaneel, text: 'Google & menu' }),
      $('button', { class: 'hh-knop', type: 'button', onclick: bedrijfPaneel, text: 'Bedrijfsgegevens' }),
      $('button', { class: 'hh-knop', type: 'button', onclick: geschiedenisPaneel, text: 'Geschiedenis' }),
      $('a', { class: 'hh-knop hh-knop--link', href: '/beheer/statistieken', text: 'Statistieken' }),
      $('span', { class: 'hh-ruimte' }),
      teller,
      terugKnop,
      publiceerKnop,
    ]);
    document.body.append(balk);
  }

  // ---------- menu links: alle pagina's en de onderdelen van deze pagina ----------
  let paginaLijst = null;
  async function zijbalk(open) {
    document.querySelector('.hh-zij')?.remove();
    document.documentElement.classList.toggle('hh-zij-open', open);
    try { localStorage.setItem('hh-zij', open ? 'open' : 'dicht'); } catch { /* geen opslag */ }
    if (!open) return;
    const zij = $('aside', { class: 'hh-zij', 'aria-label': 'Pagina\'s van de website' });
    document.body.append(zij);
    if (!paginaLijst) {
      try { paginaLijst = (await api('/api/beheer/paginas')).groepen; } catch (e) { zij.append($('p', { class: 'hh-zij-leeg', text: e.message })); return; }
    }
    vulZijbalk(zij);
  }

  function vulZijbalk(zij) {
    const gewijzigd = new Set([...wijzigingen.values()].map(w => w.bestand));
    const zoek = $('input', { type: 'search', class: 'hh-zij-zoek', placeholder: 'Zoek een pagina…', 'aria-label': 'Zoek een pagina' });
    const STATUS = { concept: 'Concept', binnenkort: 'Binnenkort', ingepland: 'Gepland' };
    // Standaard staat alleen "Pagina's" open; daarna onthoudt het menu wat je open- of dichtklapt
    let stand = {};
    try { stand = JSON.parse(localStorage.getItem('hh-zij-stand') || '{}'); } catch { /* geen opslag */ }
    const isOpen = titel => stand[titel] ?? titel === 'Pagina\'s';
    const onthoud = (titel, open) => {
      stand[titel] = open;
      try { localStorage.setItem('hh-zij-stand', JSON.stringify(stand)); } catch { /* geen opslag */ }
    };
    const link = p => {
      const huidig = p.bestand === PAGINA;
      const anders = gewijzigd.has(p.bestand) || (p.artikel && gewijzigd.has(p.artikel));
      return $('li', { 'data-zoek': p.titel.toLowerCase() }, $('a', {
        href: p.pad, class: huidig ? 'is-huidig' : undefined, 'aria-current': huidig ? 'page' : undefined,
        title: anders ? 'Hier staan wijzigingen die nog niet live zijn' : p.titel,
      }, [
        $('span', { class: 'hh-zij-naam', text: p.titel }),
        p.status && STATUS[p.status] && $('em', { class: 'hh-zij-status hh-zij-status--' + p.status, text: p.status === 'ingepland' && p.datum ? datumKort(p.datum) : STATUS[p.status], title: p.status === 'ingepland' && p.datum ? 'Gaat live op ' + datumLang(p.datum) : undefined }),
        anders && $('i', { class: 'hh-zij-stip', 'aria-label': 'niet gepubliceerde wijzigingen' }),
      ]));
    };
    const groep = (titel, kinderen, aantal) => {
      const d = $('details', { class: 'hh-zij-groep', open: isOpen(titel) }, [
        $('summary', {}, [$('span', { text: titel }), aantal !== undefined && $('small', { text: String(aantal) })]),
        ...kinderen,
      ]);
      d.addEventListener('toggle', () => { if (!zoek.value.trim()) onthoud(titel, d.open); }); // zoeken klapt tijdelijk alles open
      return d;
    };
    const groepen = paginaLijst.flatMap(g => {
      const paginas = g.paginas.filter(p => !p.artikel);
      const artikelen = g.paginas.filter(p => p.artikel);
      return [
        groep(g.titel, [$('ul', {}, paginas.map(link))], paginas.length),
        artikelen.length && groep('Blogartikelen', [$('ul', { class: 'hh-zij-artikelen' }, artikelen.map(link))], artikelen.length),
      ];
    });
    zoek.addEventListener('input', () => {
      const q = zoek.value.trim().toLowerCase();
      zij.querySelectorAll('li[data-zoek]').forEach(li => { li.hidden = !!q && !li.dataset.zoek.includes(q); });
      if (q) zij.querySelectorAll('.hh-zij-groep').forEach(d => { d.open = true; });
    });
    // Onderdelen van deze pagina: elk blok met een kop
    const onderdelen = [...document.querySelectorAll('body > header, body > main > *, body > section, body > footer, main > section, main > article')]
      .filter((el, n, alle) => alle.indexOf(el) === n && !el.closest('.hh-zij'))
      .map(el => ({ el, kop: el.querySelector('h1, h2')?.innerText.replace(/\s+/g, ' ').trim() }))
      .filter(o => o.kop);
    zij.replaceChildren(
      $('div', { class: 'hh-zij-kop' }, [
        $('div', {}, [$('strong', { text: 'Website bewerken' }), $('span', { text: 'Kies een pagina om aan te passen' })]),
        $('button', { type: 'button', class: 'hh-zij-dicht', title: 'Menu sluiten', 'aria-label': 'Menu sluiten', onclick: () => zijbalk(false), text: '✕' }),
      ]),
      $('div', { class: 'hh-zij-zoekvak' }, zoek),
      $('nav', { class: 'hh-zij-lijsten' }, [
        ...groepen,
        onderdelen.length && groep('Op deze pagina', [$('ol', { class: 'hh-zij-onderdelen' }, onderdelen.map(o => $('li', {}, $('a', {
          href: '#', title: o.kop, onclick: e => { e.preventDefault(); o.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        }, $('span', { class: 'hh-zij-naam', text: o.kop })))))]),
      ]),
      $('div', { class: 'hh-zij-voet' }, [
        $('div', { class: 'hh-zij-beheer' }, [
          $('a', { href: '/beheer', text: 'Overzicht' }),
          $('a', { href: '/beheer/aanvragen', text: 'Aanvragen' }),
          $('a', { href: '/beheer/statistieken', text: 'Statistieken' }),
        ]),
        $('button', { type: 'button', class: 'hh-zij-uit', onclick: uitloggen, text: 'Uitloggen' }),
      ]),
    );
  }
  const verversZijbalk = () => { const zij = document.querySelector('.hh-zij'); if (zij && paginaLijst) vulZijbalk(zij); };

  function telBij() {
    verversZijbalk();
    const n = wijzigingen.size;
    const paginas = new Set([...wijzigingen.values()].map(w => w.bestand).filter(b => b !== 'site' && b !== PAGINA)).size;
    teller.textContent = n
      ? n + (n === 1 ? ' wijziging' : ' wijzigingen') + ' nog niet live' + (paginas ? ` (ook op ${paginas} andere pagina${paginas === 1 ? '' : '\'s'})` : '')
      : 'Geen wijzigingen';
    publiceerKnop.disabled = !n;
    terugKnop.disabled = !stappen.length;
    // Het concept geldt voor de hele site: je kunt vrij naar een andere pagina en daar verder
    try {
      localStorage.setItem(CONCEPT, JSON.stringify({ w: [...wijzigingen.values()], u: [...uploads.values()] }));
      sessionStorage.setItem(STAPPEN, JSON.stringify(stappen.slice(-30)));
      bewaard = true;
    } catch { bewaard = false; /* te groot of geen opslag: dan waarschuwen bij weggaan */ }
  }

  // Vóór elke wijziging de huidige toestand bewaren, zodat "Ongedaan maken" één stap terug kan
  const stap = () => { stappen.push([...wijzigingen.values()].map(kopie)); if (stappen.length > 30) stappen.shift(); };

  function ongedaan() {
    stopBewerken(true);
    if (!stappen.length) return;
    const vorige = stappen.pop();
    wijzigingen.clear();
    vorige.forEach(w => wijzigingen.set(sleutelVan(w.soort, w.bestand + ':' + w.sleutel), w));
    telBij();
    // Opnieuw laden en het concept terugzetten is de betrouwbaarste manier om alles goed te tonen
    sessionStorage.setItem(SCROLL, String(scrollY));
    location.reload();
  }

  function melding(tekst, soort = 'ok', ms = 6000) {
    document.querySelector('.hh-melding')?.remove();
    const m = $('div', { class: 'hh-melding hh-melding--' + soort, role: 'status', text: tekst });
    document.body.append(m);
    if (ms) setTimeout(() => m.remove(), ms);
  }

  // ---------- klikken ----------
  const DOELEN = '[data-e], [data-ei], [data-ea], [data-eb], [data-ef]';
  function klik(e) {
    if (modus !== 'bewerk') return;
    if (e.target.closest('.hh-balk, .hh-paneel, .hh-mini, .hh-melding, .hh-item, .hh-lijst-leeg')) return;
    if (actief && actief.contains(e.target)) return; // cursor verplaatsen binnen de tekst
    // Ligt er een decoratief laagje over een foto of tekst? Zoek dan wat eronder ligt.
    const doel = e.target.closest(DOELEN)
      || document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest(DOELEN)).find(Boolean);
    if (!doel) { stopBewerken(true); return; }
    e.preventDefault();
    e.stopPropagation();
    stopBewerken(true);
    if (doel.dataset.e) bewerkTekst(doel, e);
    else if (doel.dataset.ei) fotoDialoog({ el: doel, ref: doel.dataset.ei, soort: 'img' });
    else if (doel.dataset.ea) attrDialoog(doel);
    else fotoDialoog({ el: doel, ref: doel.dataset.eb || doel.dataset.ef, soort: doel.dataset.eb ? 'bg' : 'foto' });
  }

  // Tekst binnen een lijst-item: "bestand:lijst.N.veld"
  const lijstPlek = el => {
    const houder = el.closest('[data-el]');
    if (!houder) return null;
    const m = splits(el.dataset.e)[1].match(/\.(\d+)\.([\w-]+)$/);
    return m ? { houder, ref: houder.dataset.el, n: Number(m[1]), veld: m[2] } : null;
  };

  const huidigeWaarde = (soort, ref) => {
    const w = wijzigingen.get(sleutelVan(soort, ref));
    if (w) return soort === 'lijst' ? kopie(w.waarde) : w.waarde;
    const [bestand, sleutel] = splits(ref);
    if (soort === 'beeld') return { ...(bron[bestand]?.i?.[sleutel] || {}) };
    if (soort === 'lijst') return kopie(bron[bestand]?.l?.[sleutel] || []);
    return bron[bestand]?.t?.[sleutel] ?? '';
  };

  // ---------- teksten ----------
  let mini;
  function bewerkTekst(el, e) {
    actief = el;
    actiefOrigineel = el.innerHTML;
    const plek = lijstPlek(el);
    el.innerHTML = plek ? (huidigeWaarde('lijst', plek.ref)[plek.n]?.[plek.veld] ?? '') : huidigeWaarde('tekst', el.dataset.e);
    el.querySelectorAll('*').forEach(k => { if (!k.textContent.trim() && k.tagName !== 'BR') k.contentEditable = 'false'; });
    el.contentEditable = 'true';
    el.spellcheck = true;
    el.classList.add('hh-actief');
    el.addEventListener('keydown', toets);
    el.addEventListener('paste', plak);
    el.focus();
    const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (r && el.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    toonMini(el);
  }

  function toonMini(el) {
    mini?.remove();
    const knop = (tekst, titel, fn) => $('button', { type: 'button', class: 'hh-mini-knop', title: titel, onmousedown: ev => ev.preventDefault(), onclick: fn }, tekst);
    const rijk = el.hasAttribute('data-rijk');
    mini = $('div', { class: 'hh-mini' }, [
      knop($('b', { text: 'B' }), 'Vet (Ctrl+B)', () => document.execCommand('bold')),
      rijk && knop('Tussenkop', 'Van deze regel een tussenkop maken', () => document.execCommand('formatBlock', false, 'h2')),
      rijk && knop('Kleine kop', 'Van deze regel een kleine kop maken', () => document.execCommand('formatBlock', false, 'h3')),
      rijk && knop('Alinea', 'Gewone tekst', () => document.execCommand('formatBlock', false, 'p')),
      rijk && knop('• Opsomming', 'Opsomming aan of uit', () => document.execCommand('insertUnorderedList')),
      !rijk && knop('↵', 'Nieuwe regel (Enter)', () => document.execCommand('insertLineBreak')),
      knop('Link', 'Link toevoegen of aanpassen', maakLink),
      knop('Klaar', 'Klaar (klik ernaast)', () => stopBewerken(true)),
      knop('Annuleer', 'Annuleren (Esc)', () => stopBewerken(false)),
    ]);
    document.body.append(mini);
    const r = el.getBoundingClientRect();
    const top = r.top + scrollY - mini.offsetHeight - 10;
    mini.style.top = Math.max(scrollY + 8, top < scrollY + 8 ? r.bottom + scrollY + 10 : top) + 'px';
    mini.style.left = Math.max(8, Math.min(r.left + scrollX, scrollX + innerWidth - mini.offsetWidth - 8)) + 'px';
  }

  function maakLink() {
    const huidige = getSelection().anchorNode?.parentElement?.closest('a');
    const url = prompt('Adres van de link (bijv. /contact of https://...)', huidige?.getAttribute('href') || '');
    if (url === null) return;
    if (!url) { document.execCommand('unlink'); return; }
    if (!/^(https?:|mailto:|tel:|\/|#)/.test(url)) return melding('Een link begint met /, https://, mailto: of tel:', 'fout');
    document.execCommand('createLink', false, url);
  }

  function toets(e) {
    if (e.key === 'Escape') { e.preventDefault(); stopBewerken(false); }
    else if (e.key === 'Enter' && !actief?.hasAttribute('data-rijk')) { e.preventDefault(); document.execCommand('insertLineBreak'); }
    // In een FAQ-vraag (<summary>) klapt een spatie de vraag open en dicht in plaats van te typen
    else if (e.key === ' ' && actief?.closest('summary, button')) { e.preventDefault(); document.execCommand('insertText', false, ' '); }
  }

  function plak(e) {
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  }

  function opgeschoond(el) {
    const kloon = el.cloneNode(true);
    kloon.querySelectorAll('[contenteditable]').forEach(k => k.removeAttribute('contenteditable'));
    kloon.querySelectorAll('[style]').forEach(k => k.removeAttribute('style'));
    let html = kloon.innerHTML.replace(/&nbsp;/g, ' ');
    for (let vorige = ''; vorige !== html;) { vorige = html; html = html.replace(/(\s*<br>\s*)+((<\/[a-z]+>)*)$/, '$2'); }
    return html.trim();
  }

  function stopBewerken(bewaren) {
    if (!actief) return;
    const el = actief;
    actief = null;
    mini?.remove();
    el.removeEventListener('keydown', toets);
    el.removeEventListener('paste', plak);
    el.removeAttribute('contenteditable');
    el.classList.remove('hh-actief');
    if (!bewaren) { el.innerHTML = actiefOrigineel; return; }
    const html = opgeschoond(el);
    const plek = lijstPlek(el);
    if (plek) {
      const lijst = huidigeWaarde('lijst', plek.ref);
      if ((lijst[plek.n]?.[plek.veld] ?? '') !== html) {
        stap();
        lijst[plek.n][plek.veld] = html;
        zetLijst(plek.ref, lijst);
      }
      tekenLijst(plek.houder);
      return;
    }
    const ref = el.dataset.e;
    const [bestand, sleutel] = splits(ref);
    if (html !== huidigeWaarde('tekst', ref)) {
      stap();
      if (html === (bron[bestand]?.t?.[sleutel] ?? '')) wijzigingen.delete(sleutelVan('tekst', ref));
      else wijzigingen.set(sleutelVan('tekst', ref), { bestand, soort: 'tekst', sleutel, waarde: html });
    }
    // dezelfde tekst kan vaker op de pagina staan
    document.querySelectorAll(`[data-e="${CSS.escape(ref)}"]`).forEach(ander => {
      ander.innerHTML = html;
      ander.classList.toggle('hh-gewijzigd', wijzigingen.has(sleutelVan('tekst', ref)));
    });
    telBij();
  }

  // ---------- lijsten (FAQ, reviews): toevoegen, verwijderen, verplaatsen ----------
  function zetLijst(ref, lijst) {
    const [bestand, sleutel] = splits(ref);
    if (JSON.stringify(lijst) === JSON.stringify(bron[bestand]?.l?.[sleutel] || [])) wijzigingen.delete(sleutelVan('lijst', ref));
    else wijzigingen.set(sleutelVan('lijst', ref), { bestand, soort: 'lijst', sleutel, waarde: lijst });
    telBij();
  }

  const items = houder => [...houder.querySelectorAll(':scope > [data-item]')];
  const sjabloon = houder => houder.querySelector(':scope > template[data-sjabloon]')?.content.firstElementChild || items(houder)[0];
  const veldVan = el => splits(el.dataset.e)[1].match(/\.([\w-]+)$/)[1];

  // Toon de lijst zoals hij in het concept staat
  function tekenLijst(houder) {
    const ref = houder.dataset.el;
    const lijst = huidigeWaarde('lijst', ref);
    let huidig = items(houder);
    const model = sjabloon(houder);
    while (huidig.length < lijst.length) {
      const nieuw = model.cloneNode(true);
      const na = huidig[huidig.length - 1];
      if (na) na.after(nieuw); else (houder.querySelector(':scope > template') ? houder.querySelector(':scope > template').before(nieuw) : houder.append(nieuw));
      huidig = items(houder);
    }
    huidig.slice(lijst.length).forEach(el => el.remove());
    items(houder).forEach((item, n) => {
      item.querySelectorAll('[data-e]').forEach(veld => {
        const naam = veldVan(veld);
        veld.dataset.e = `${ref}.${n}.${naam}`;
        veld.innerHTML = lijst[n][naam] ?? '';
      });
      item.querySelectorAll('[data-ei]').forEach(img => {
        const naam = splits(img.dataset.ei)[1].match(/\.([\w-]+)$/)[1];
        img.dataset.ei = `${ref}.${n}.${naam}`;
        const foto = lijst[n][naam];
        if (foto?.upload && uploads.has(foto.upload)) toonFoto(img, 'img', uploadUrl(foto.upload));
        else if (foto?.src && img.dataset.bron !== foto.src) {
          // de juiste foto staat al ergens in deze lijst: neem die over
          const zelfde = [...houder.querySelectorAll('img[data-bron]')].find(i => i.dataset.bron === foto.src);
          if (zelfde) ['src', 'srcset', 'sizes'].forEach(a => zelfde.hasAttribute(a) ? img.setAttribute(a, zelfde.getAttribute(a)) : img.removeAttribute(a));
          img.dataset.bron = foto.src;
        }
        if (foto) img.alt = foto.alt ?? '';
      });
      linkElementen(item).forEach(a => { if (lijst[n][a.dataset.link]) a.setAttribute('href', lijst[n][a.dataset.link]); });
      const avatar = item.querySelector('.review-avatar');
      if (avatar && lijst[n].naam) {
        const woorden = lijst[n].naam.replace(/<[^>]+>/g, '').trim().split(/\s+/);
        avatar.textContent = ((woorden[0]?.[0] || '') + (woorden.slice(1).find(w => /^\p{Lu}/u.test(w))?.[0] || '')).toUpperCase();
      }
      if (item.tagName === 'DETAILS') item.open = true;
    });
    houder.classList.toggle('hh-gewijzigd', wijzigingen.has(sleutelVan('lijst', ref)));
    houder.querySelector(':scope > .hh-lijst-leeg')?.remove();
    if (!lijst.length) houder.append($('button', { type: 'button', class: 'hh-lijst-leeg', onclick: () => voegToe(houder, -1), text: '+ Eerste item toevoegen' }));
  }

  const linkElementen = item => [item, ...item.querySelectorAll('[data-link]')].filter(e => e.dataset.link);

  function bereidLijstenVoor() {
    document.querySelectorAll('[data-el]').forEach(houder => {
      houder.hidden = false;
      // welke foto staat waar (zoals op de server), zodat foto's mee kunnen schuiven
      const [bestand, sleutel] = splits(houder.dataset.el);
      const origineel = bron[bestand]?.l?.[sleutel] || [];
      items(houder).forEach((item, n) => item.querySelectorAll('img[data-ei]').forEach(img => {
        const naam = splits(img.dataset.ei)[1].match(/\.([\w-]+)$/)[1];
        if (origineel[n]?.[naam]?.src) img.dataset.bron = origineel[n][naam].src;
      }));
      if (wijzigingen.has(sleutelVan('lijst', houder.dataset.el)) || !items(houder).length) tekenLijst(houder);
    });
  }

  // Een nieuw item lijkt op het item erboven: zelfde foto, link en opmaak, maar met lege teksten
  const PLAATSHOUDERS = { h2: 'Nieuwe titel', h3: 'Nieuwe titel', h4: 'Nieuwe titel', p: 'Schrijf hier de tekst.', li: 'Nieuw punt', strong: 'Titel', blockquote: 'Nieuwe tekst' };
  // "li2" is de tweede li in een item; "h3" is gewoon een kop
  const NIEUW_VELD = naam => NIEUW[naam] ?? PLAATSHOUDERS[naam] ?? PLAATSHOUDERS[naam.replace(/\d+$/, '')] ?? 'Nieuwe tekst';
  function nieuwItem(houder, na) {
    const lijst = huidigeWaarde('lijst', houder.dataset.el);
    const basis = lijst[Math.max(0, na)];
    const keuzes = JSON.parse(houder.dataset.keuzes || '{}');
    if (!basis) {
      const item = {};
      sjabloon(houder).querySelectorAll('[data-e]').forEach(veld => { const naam = veldVan(veld); item[naam] = NIEUW_VELD(naam); });
      for (const [naam, opties] of Object.entries(keuzes)) item[naam] = opties[0];
      return item;
    }
    const item = kopie(basis);
    for (const [naam, waarde] of Object.entries(item)) {
      if (typeof waarde !== 'string' || keuzes[naam] || /^link\d*$/.test(naam)) continue;
      if (/^anker\d*$/.test(naam)) item[naam] = `${waarde}-${Date.now().toString(36).slice(-4)}`;
      else if (!/^(span|strong|link-tekst)\d*$/.test(naam)) item[naam] = NIEUW_VELD(naam);
    }
    return item;
  }

  function linkDialoog(houder, n) {
    const lijst = huidigeWaarde('lijst', houder.dataset.el);
    const velden = [...new Set(linkElementen(items(houder)[n]).map(a => a.dataset.link))];
    const invoer = velden.map(v => $('input', { type: 'text', class: 'hh-veld', value: lijst[n][v] ?? '' }));
    paneel('Link', [
      $('p', { class: 'hh-uitleg', text: 'Waar gaat dit item naartoe? Bijvoorbeeld /contact, /diensten#oversluiten of een volledig adres met https://.' }),
      ...invoer.flatMap((veld, i) => [velden.length > 1 && $('label', { class: 'hh-veldlabel', text: `Link ${i + 1}` }), veld]),
    ], () => {
      const fout = invoer.find(v => !/^(https?:|mailto:|tel:|\/|#)/.test(v.value.trim()));
      if (fout) return melding('Een link begint met /, https://, mailto: of tel:', 'fout');
      if (velden.every((v, i) => invoer[i].value.trim() === lijst[n][v])) return;
      stap();
      velden.forEach((v, i) => { lijst[n][v] = invoer[i].value.trim(); });
      zetLijst(houder.dataset.el, lijst);
      tekenLijst(houder);
    });
  }

  function voegToe(houder, na) {
    stopBewerken(true);
    stap();
    const lijst = huidigeWaarde('lijst', houder.dataset.el);
    lijst.splice(na + 1, 0, nieuwItem(houder, na));
    const dom = items(houder);
    const kloon = (dom[Math.max(0, na)] || sjabloon(houder)).cloneNode(true);
    if (dom[na]) dom[na].after(kloon);
    else if (dom[0]) dom[0].before(kloon);
    else (houder.querySelector(':scope > template') ? houder.querySelector(':scope > template').before(kloon) : houder.append(kloon));
    zetLijst(houder.dataset.el, lijst);
    tekenLijst(houder);
    verbergItemKnoppen();
    items(houder)[na + 1]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function verplaats(houder, n, richting) {
    const lijst = huidigeWaarde('lijst', houder.dataset.el);
    const doel = n + richting;
    if (doel < 0 || doel >= lijst.length) return;
    stap();
    [lijst[n], lijst[doel]] = [lijst[doel], lijst[n]];
    const dom = items(houder);
    if (richting < 0) dom[doel].before(dom[n]); else dom[doel].after(dom[n]);
    zetLijst(houder.dataset.el, lijst);
    tekenLijst(houder);
    verbergItemKnoppen();
  }

  function verwijder(houder, n) {
    stap();
    const lijst = huidigeWaarde('lijst', houder.dataset.el);
    lijst.splice(n, 1);
    items(houder)[n]?.remove();
    zetLijst(houder.dataset.el, lijst);
    tekenLijst(houder);
    verbergItemKnoppen();
    melding('Verwijderd. Per ongeluk? Klik op "Ongedaan maken".', 'ok', 5000);
  }

  function kies(houder, n, veld, waarde) {
    stap();
    const lijst = huidigeWaarde('lijst', houder.dataset.el);
    lijst[n][veld] = waarde;
    zetLijst(houder.dataset.el, lijst);
    tekenLijst(houder);
    melding('Aangepast. Je ziet het verschil na het publiceren.', 'ok', 4000);
  }

  let itemBalk = null, itemVan = null;
  const verbergItemKnoppen = () => { itemBalk?.remove(); itemBalk = null; itemVan = null; };
  function toonItemKnoppen(e) {
    if (modus !== 'bewerk' || e.target.closest('.hh-item')) return;
    const item = e.target.closest('[data-el] > [data-item]');
    const kaart = !item && e.target.closest('[data-artikel]');
    const doel = item || kaart;
    if (!doel) return;
    if (doel === itemVan) return;
    verbergItemKnoppen();
    itemVan = doel;
    const knop = (tekst, titel, fn) => $('button', { type: 'button', class: 'hh-mini-knop', title: titel, onclick: ev => { ev.stopPropagation(); fn(); } }, tekst);
    if (item) {
      const houder = item.parentElement;
      const n = items(houder).indexOf(item);
      const keuzes = JSON.parse(houder.dataset.keuzes || '{}');
      const lijst = huidigeWaarde('lijst', houder.dataset.el);
      itemBalk = $('div', { class: 'hh-item' }, [
        knop('↑', 'Omhoog', () => verplaats(houder, n, -1)),
        knop('↓', 'Omlaag', () => verplaats(houder, n, 1)),
        knop('+ Nieuw', 'Nieuw item hieronder', () => voegToe(houder, n)),
        linkElementen(item).length > 0 && knop('Link', 'Waar dit item naartoe linkt', () => linkDialoog(houder, n)),
        ...Object.entries(keuzes).map(([veld, opties]) => {
          const s = $('select', { class: 'hh-keuze', title: veld, onchange: () => kies(houder, n, veld, s.value) }, opties.map(o => $('option', { value: o, text: o[0].toUpperCase() + o.slice(1), selected: lijst[n]?.[veld] === o })));
          return s;
        }),
        knop('✕ Verwijderen', 'Dit item verwijderen', () => verwijder(houder, n)),
      ]);
    } else {
      itemBalk = $('div', { class: 'hh-item' }, [knop('Artikel-instellingen', 'Status, onderwerp en datum', () => artikelPaneel(kaart.dataset.artikel))]);
    }
    document.body.append(itemBalk);
    const r = doel.getBoundingClientRect();
    itemBalk.style.top = Math.max(scrollY + 4, r.top + scrollY - itemBalk.offsetHeight - 4) + 'px';
    itemBalk.style.left = Math.max(8, Math.min(r.right + scrollX - itemBalk.offsetWidth, scrollX + innerWidth - itemBalk.offsetWidth - 8)) + 'px';
  }

  // ---------- teksten in een attribuut (bijv. het draaiende wiel) ----------
  function attrDialoog(el) {
    const [attr, ref] = [el.dataset.ea.slice(0, el.dataset.ea.indexOf('|')), el.dataset.ea.slice(el.dataset.ea.indexOf('|') + 1)];
    const veld = $('textarea', { rows: '4', class: 'hh-veld' });
    veld.value = huidigeWaarde('attr', ref);
    paneel('Uitlegtekst', [
      $('p', { class: 'hh-uitleg', text: 'Deze tekst verschijnt als je dit punt aanklikt.' }),
      veld,
    ], () => {
      const [bestand, sleutel] = splits(ref);
      const waarde = veld.value.trim();
      if (waarde === huidigeWaarde('attr', ref)) return;
      stap();
      el.setAttribute(attr, waarde);
      if (waarde === bron[bestand]?.t?.[sleutel]) wijzigingen.delete(sleutelVan('attr', ref));
      else wijzigingen.set(sleutelVan('attr', ref), { bestand, soort: 'attr', sleutel, waarde });
      el.classList.toggle('hh-gewijzigd', wijzigingen.has(sleutelVan('attr', ref)));
      telBij();
    });
    veld.focus();
  }

  // ---------- foto's ----------
  function fotoDialoog({ el, ref, soort }) {
    const lijstHouder = el.closest?.('[data-el]');
    const lijstPlekFoto = lijstHouder && splits(ref)[1].match(/\.(\d+)\.([\w-]+)$/);
    const huidig = lijstPlekFoto ? (huidigeWaarde('lijst', lijstHouder.dataset.el)[lijstPlekFoto[1]]?.[lijstPlekFoto[2]] || {}) : huidigeWaarde('beeld', ref);
    let nieuw = null;
    const voorbeeld = $('div', { class: 'hh-voorbeeld' });
    const zetVoorbeeld = url => { voorbeeld.style.backgroundImage = `url("${url}")`; };
    zetVoorbeeld(soort === 'img' ? (el.currentSrc || el.src) : huidigeAchtergrond(el));
    const bestandVeld = $('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'hh-verborgen' });
    const alt = $('input', { type: 'text', class: 'hh-veld', value: huidig.alt || '' });
    bestandVeld.addEventListener('change', async () => {
      const f = bestandVeld.files[0];
      if (!f) return;
      try { nieuw = await verklein(f); zetVoorbeeld(nieuw.url); } catch { melding('Deze foto kon niet worden gelezen', 'fout'); }
    });
    const inhoud = [
      voorbeeld,
      $('button', { type: 'button', class: 'hh-knop', onclick: () => bestandVeld.click(), text: 'Andere foto kiezen' }),
      bestandVeld,
    ];
    if (soort === 'img') inhoud.push($('label', { class: 'hh-veldlabel', text: 'Omschrijving voor slechtzienden en Google (laat leeg bij een sfeerfoto)' }), alt);
    paneel('Foto aanpassen', inhoud, () => {
      // Foto in een lijst-item (bijv. een dienstkaart): hoort bij de lijst
      const houder = el.closest?.('[data-el]');
      const plek = houder && splits(ref)[1].match(/\.(\d+)\.([\w-]+)$/);
      if (plek) {
        const lijst = huidigeWaarde('lijst', houder.dataset.el);
        const foto = { ...lijst[plek[1]][plek[2]] };
        if (!nieuw && alt.value === (foto.alt ?? '')) return;
        stap();
        if (nieuw) {
          const id = 'u' + Date.now();
          uploads.set(id, { id, naam: nieuw.naam, data: nieuw.url.split(',')[1] });
          foto.upload = id;
        }
        foto.alt = alt.value;
        lijst[plek[1]][plek[2]] = foto;
        zetLijst(houder.dataset.el, lijst);
        tekenLijst(houder);
        return;
      }
      const [bestand, sleutel] = splits(ref);
      const waarde = { ...(wijzigingen.get(sleutelVan('beeld', ref))?.waarde || {}) };
      const altAnders = soort === 'img' && alt.value !== (bron[bestand]?.i?.[sleutel]?.alt ?? '');
      if (!nieuw && !altAnders) return;
      stap();
      if (nieuw) {
        const id = 'u' + Date.now();
        uploads.set(id, { id, naam: nieuw.naam, data: nieuw.url.split(',')[1] });
        waarde.upload = id;
        if (el.isConnected) toonFoto(el, soort, nieuw.url);
      }
      if (altAnders) { waarde.alt = alt.value; el.alt = alt.value; }
      wijzigingen.set(sleutelVan('beeld', ref), { bestand, soort: 'beeld', sleutel, waarde });
      el.classList.add('hh-gewijzigd');
      telBij();
    });
  }

  const uploadUrl = id => 'data:image/' + (uploads.get(id).data.startsWith('iVBOR') ? 'png' : 'jpeg') + ';base64,' + uploads.get(id).data;

  const huidigeAchtergrond = el => {
    const s = el.style;
    const v = el.dataset.foto ? `url(${el.dataset.foto})` : s.getPropertyValue('--foto') || s.getPropertyValue('--bg-l');
    return (v.match(/url\(['"]?([^'")]+)/) || [])[1] || '';
  };

  function toonFoto(el, soort, url) {
    el.removeAttribute('data-foto');
    if (soort === 'img') { el.removeAttribute('srcset'); el.src = url; }
    else if (soort === 'foto') el.style.setProperty('--foto', `url("${url}")`);
    else {
      el.style.setProperty('--bg-l', `url("${url}")`); el.style.setProperty('--bg-m', `url("${url}")`);
      el.style.removeProperty('--bg-la'); el.style.removeProperty('--bg-ma'); // AVIF-versie van de oude foto (herofoto)
    }
  }

  // Foto verkleinen in de browser: snel uploaden, de site maakt er daarna zelf de juiste formaten van
  function verklein(bestand) {
    return new Promise((klaar, mis) => {
      const img = new Image();
      img.onload = () => {
        const max = 2400;
        const schaal = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * schaal);
        c.height = Math.round(img.height * schaal);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const png = bestand.type === 'image/png';
        klaar({ url: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86), naam: bestand.name });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = mis;
      img.src = URL.createObjectURL(bestand);
    });
  }

  function fotoPaneel() {
    const lijst = $('div', { class: 'hh-fotolijst' });
    document.querySelectorAll('[data-eb], [data-ef]').forEach(el => {
      const url = huidigeAchtergrond(el);
      lijst.append($('button', { type: 'button', class: 'hh-foto', style: `background-image:url("${url}")`, onclick: () => {
        sluitPaneel();
        fotoDialoog({ el, ref: el.dataset.eb || el.dataset.ef, soort: el.dataset.eb ? 'bg' : 'foto' });
      } }));
    });
    paneel('Achtergrondfoto\'s op deze pagina', [
      $('p', { class: 'hh-uitleg', text: 'Kies de foto die je wilt vervangen.' }),
      lijst,
    ]);
  }

  // ---------- velden in panelen ----------
  function veldMaker() {
    const opslaanLijst = [];
    const veld = (label, waarde, { max = 0, rijen = 1, type = 'text', opties = null } = {}, opslaan) => {
      const v = opties
        ? $('select', { class: 'hh-veld' }, Object.entries(opties).map(([k, t]) => $('option', { value: k, text: t, selected: k === waarde })))
        : rijen > 1 ? $('textarea', { rows: String(rijen), class: 'hh-veld' }) : $('input', { type, class: 'hh-veld' });
      if (!opties) v.value = waarde;
      const tel = $('span', { class: 'hh-tel' });
      const update = () => { tel.textContent = max ? `${v.value.length} / ${max} tekens` : ''; tel.classList.toggle('is-lang', !!max && v.value.length > max); };
      v.addEventListener('input', update); update();
      opslaanLijst.push(() => opslaan(v.value.trim()));
      return [$('label', { class: 'hh-veldlabel', text: label }), v, tel];
    };
    return { veld, opslaan: () => opslaanLijst.forEach(f => f()) };
  }
  const zet = (bestand, soort, sleutel, oud) => waarde => {
    const k = sleutelVan(soort, bestand + ':' + sleutel);
    if (waarde === (wijzigingen.get(k)?.waarde ?? oud)) return;
    stap();
    if (waarde === oud) wijzigingen.delete(k);
    else wijzigingen.set(k, { bestand, soort, sleutel, waarde });
  };
  const huidig = (soort, bestand, sleutel, oud) => wijzigingen.get(sleutelVan(soort, bestand + ':' + sleutel))?.waarde ?? oud;

  // ---------- Google-teksten en verborgen teksten ----------
  function paginaPaneel() {
    const meta = bron[PAGINA]?.meta;
    const { veld, opslaan } = veldMaker();
    const inhoud = [$('p', { class: 'hh-uitleg', text: 'Zo verschijnt deze pagina in Google. Houd de titel kort en de omschrijving uitnodigend.' })];
    if (meta) {
      inhoud.push(...veld('Titel in Google', huidig('meta', PAGINA, 'title', meta.title), { max: 60 }, zet(PAGINA, 'meta', 'title', meta.title)));
      inhoud.push(...veld('Omschrijving in Google', huidig('meta', PAGINA, 'description', meta.description), { max: 155, rijen: 3 }, zet(PAGINA, 'meta', 'description', meta.description)));
    }
    const bel = bron.site?.t?.['menu.bel'];
    if (bel !== undefined) inhoud.push(...veld('Belregel onderin het menu op de telefoon', huidig('tekst', 'site', 'menu.bel', bel), {}, zet('site', 'tekst', 'menu.bel', bel)));
    paneel('Google & menu', inhoud, () => { opslaan(); telBij(); });
  }

  // ---------- blog ----------
  function artikelPaneel(ref) {
    const a = bron[ref];
    if (!a) return melding('Dit artikel kon niet worden geladen', 'fout');
    const { veld, opslaan } = veldMaker();
    const eigen = a.artikel.eigenPagina;
    const inhoud = [
      $('p', { class: 'hh-uitleg', text: 'Titel, samenvatting en tekst pas je aan door erop te klikken. Hier regel je de rest.' }),
      ...(eigen ? [] : veld('Status', huidig('artikel', ref, 'status', a.artikel.status), { opties: STATUSSEN }, zet(ref, 'artikel', 'status', a.artikel.status))),
      ...veld('Onderwerp', huidig('artikel', ref, 'categorie', a.artikel.categorie), { opties: CATEGORIEEN }, zet(ref, 'artikel', 'categorie', a.artikel.categorie)),
      ...veld('Datum (bij Ingepland: de dag waarop het artikel live gaat)', huidig('artikel', ref, 'datum', a.artikel.datum), { type: 'date' }, zet(ref, 'artikel', 'datum', a.artikel.datum)),
    ];
    if (ref !== PAGINA && a.meta) {
      inhoud.push(...veld('Titel in Google', huidig('meta', ref, 'title', a.meta.title), { max: 60 }, zet(ref, 'meta', 'title', a.meta.title)));
      inhoud.push(...veld('Omschrijving in Google', huidig('meta', ref, 'description', a.meta.description), { max: 155, rijen: 3 }, zet(ref, 'meta', 'description', a.meta.description)));
    }
    const knoppen = [$('button', { type: 'button', class: 'hh-knop', onclick: () => {
      sluitPaneel();
      const img = $('img');
      fotoDialoog({ el: img, ref: ref + ':kaart', soort: 'img' });
    }, text: 'Foto in het blogoverzicht' })];
    if (!eigen) knoppen.push($('button', { type: 'button', class: 'hh-knop', onclick: () => importPaneel(ref), text: 'Tekst vervangen uit document' }));
    if (!eigen) knoppen.push($('button', { type: 'button', class: 'hh-knop hh-knop--gevaar', onclick: () => verwijderArtikel(ref), text: 'Artikel verwijderen' }));
    if (!eigen && a.artikel.status !== 'binnenkort' && ref !== PAGINA) knoppen.unshift($('a', { class: 'hh-knop', href: '/' + ref, text: 'Artikel openen' }));
    inhoud.push($('div', { class: 'hh-knoppenrij' }, knoppen));
    paneel('Artikel', inhoud, () => { opslaan(); telBij(); melding('Aangepast. Publiceer om het live te zetten.', 'ok', 4000); });
  }

  // Nieuw artikel: uit een document (Word of Google Docs) of leeg beginnen
  function nieuwArtikel() {
    paneel('Nieuw artikel', [
      $('p', { class: 'hh-uitleg', text: 'Heb je het artikel al geschreven in Word of Google Docs? Dan zet de website het in één keer goed: titel, inleiding, tussenkoppen en veelgestelde vragen komen vanzelf op de juiste plek.' }),
      $('div', { class: 'hh-keuzes' }, [
        $('button', { type: 'button', class: 'hh-keuzekaart is-aanrader', onclick: () => importPaneel() }, [
          $('strong', { text: 'Uit een document' }), $('span', { text: 'Word-bestand uploaden of tekst uit Google Docs plakken' }),
        ]),
        $('button', { type: 'button', class: 'hh-keuzekaart', onclick: leegArtikel }, [
          $('strong', { text: 'Leeg beginnen' }), $('span', { text: 'Typ het artikel zelf op de pagina' }),
        ]),
      ]),
    ]);
  }

  function leegArtikel() {
    const titel = $('input', { type: 'text', class: 'hh-veld', placeholder: 'Bijvoorbeeld: Wat kost een hypotheekadviseur?' });
    const onderwerp = $('select', { class: 'hh-veld' }, Object.entries(CATEGORIEEN).map(([k, t]) => $('option', { value: k, text: t })));
    paneel('Nieuw artikel', [
      $('p', { class: 'hh-uitleg', text: 'Het artikel begint als concept: alleen jij ziet het. Schrijf het op de pagina zelf en zet de status op "Gepubliceerd" als het klaar is.' }),
      $('label', { class: 'hh-veldlabel', text: 'Titel' }), titel,
      $('label', { class: 'hh-veldlabel', text: 'Onderwerp' }), onderwerp,
    ], async () => {
      try {
        const d = await api('/api/beheer/blog', { actie: 'nieuw', titel: titel.value, categorie: onderwerp.value });
        naarArtikel(d.slug, 'Artikel aangemaakt.');
      } catch (e) { melding(e.message, 'fout', 0); }
    }, 'Aanmaken');
    titel.focus();
  }

  // Online duurt het even voordat een nieuwe pagina bestaat: wachten tot hij er is
  async function naarArtikel(slug, tekst) {
    if (lokaal) { location.href = '/blog/' + slug; return; }
    melding(tekst + ' De pagina wordt nu gebouwd; over ongeveer een minuut ga je er automatisch heen.', 'ok', 0);
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 8000));
      const r = await fetch('/blog/' + slug, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
      if (r?.ok) { location.href = '/blog/' + slug; return; }
    }
    melding('Het duurt langer dan verwacht. Kijk over een paar minuten op /blog/' + slug, 'fout', 0);
  }

  async function verwijderArtikel(ref) {
    const titel = (bron[ref]?.t?.titel || '').replace(/<[^>]+>/g, '');
    if (!confirm(`"${titel}" verwijderen? Je kunt het later terugzetten via Geschiedenis.`)) return;
    try {
      await api('/api/beheer/blog', { actie: 'verwijder', slug: ref.slice(5) });
      sluitPaneel();
      melding(lokaal ? 'Verwijderd.' : 'Verwijderd. Over ongeveer een minuut is het ook online weg.', 'ok', 6000);
      setTimeout(() => { location.href = '/blog'; }, lokaal ? 800 : 2500);
    } catch (e) { melding(e.message, 'fout', 0); }
  }

  // ---------- blog uit een document (Word of Google Docs) ----------
  let documentLaden = null;
  const laadDocument = () => documentLaden ||= new Promise((ok, mis) => {
    if (window.hhDocument) return ok(window.hhDocument);
    const s = $('script', { src: '/beheer/document.js' });
    s.onload = () => ok(window.hhDocument);
    s.onerror = () => { documentLaden = null; mis(new Error('Het inlezen kon niet starten. Probeer het opnieuw.')); };
    document.head.append(s);
  });

  // doel: leeg = nieuw artikel; "blog/<slug>" = de tekst van dat artikel vervangen
  function importPaneel(doel) {
    const bestandVeld = $('input', { type: 'file', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', class: 'hh-verborgen' });
    const status = $('p', { class: 'hh-import-status', role: 'status' });
    const plak = $('div', { class: 'hh-plakvak', contenteditable: 'true', 'data-leeg': 'Of plak hier de tekst uit Google Docs (in je document: Ctrl+A, Ctrl+C; hier: Ctrl+V)' });
    const verwerk = async (lees, wat) => {
      status.textContent = 'Bezig met inlezen…';
      status.className = 'hh-import-status';
      try {
        const doc = await laadDocument();
        const r = await lees(doc);
        if (!r.inhoud && !r.faq.length) throw new Error('Er is geen tekst gevonden in ' + wat + '.');
        voorbeeldPaneel(r, doel);
      } catch (e) { status.textContent = e.message; status.className = 'hh-import-status is-fout'; }
    };
    bestandVeld.addEventListener('change', () => { const f = bestandVeld.files[0]; if (f) verwerk(d => d.leesBestand(f), 'dit bestand'); });
    plak.addEventListener('paste', e => {
      e.preventDefault();
      const cd = e.clipboardData;
      verwerk(d => d.leesKlembord(cd.getData('text/html'), cd.getData('text/plain')), 'de geplakte tekst');
    });
    const sleep = $('div', { class: 'hh-sleepvak' }, [
      $('strong', { text: 'Sleep je Word-bestand hierheen' }),
      $('span', { text: 'of' }),
      $('button', { type: 'button', class: 'hh-knop hh-knop--hoofd', onclick: () => bestandVeld.click(), text: 'Kies een bestand (.docx)' }),
    ]);
    sleep.addEventListener('dragover', e => { e.preventDefault(); sleep.classList.add('is-erboven'); });
    sleep.addEventListener('dragleave', () => sleep.classList.remove('is-erboven'));
    sleep.addEventListener('drop', e => {
      e.preventDefault(); sleep.classList.remove('is-erboven');
      const f = e.dataTransfer.files[0];
      if (f) verwerk(d => d.leesBestand(f), 'dit bestand');
    });
    paneel(doel ? 'Tekst vervangen uit document' : 'Artikel uit een document', [
      $('p', { class: 'hh-uitleg', text: doel
        ? 'De titel, inleiding, tekst en veelgestelde vragen van dit artikel worden vervangen door die uit het document. Je ziet eerst wat er gevonden is.'
        : 'Upload je Word-bestand, of plak de tekst uit Google Docs. Je ziet eerst wat er gevonden is voordat het artikel wordt aangemaakt.' }),
      sleep, bestandVeld, plak, status,
      $('details', { class: 'hh-tips' }, [
        $('summary', { text: 'Zo wordt je document ingedeeld' }),
        $('ul', {}, [
          ['Titel', 'de bovenste kop (stijl "Titel" of "Kop 1")'],
          ['Inleiding', 'de eerste alinea onder de titel'],
          ['Tussenkoppen', 'koppen met stijl "Kop 2" (of korte, vetgedrukte regels); kleinere koppen worden een kleine kop'],
          ['Veelgestelde vragen', 'alles onder een kop "Veelgestelde vragen": elke vraag vetgedrukt of als kop, het antwoord eronder'],
          ['Foto', 'de eerste foto in het document komt bovenaan het artikel'],
          ['Extra (mag)', 'losse regels zoals "Titel voor Google: …", "Omschrijving voor Google: …", "Samenvatting: …", "Onderwerp: …" of "Datum: 15 januari 2027"'],
        ].map(([k, t]) => $('li', {}, [$('strong', { text: k + ': ' }), t]))),
      ]),
    ]);
    plak.focus();
  }

  async function geplandeDatums() {
    try { return (await api('/api/beheer/blog')).artikelen.filter(a => a.status === 'ingepland' && a.datum > vandaag()); } catch { return []; }
  }

  async function voorbeeldPaneel(r, doel) {
    const { veld } = veldMaker();
    const velden = {};
    const maakVeld = (naam, label, waarde, opties) => { const [l, v, t] = veld(label, waarde, opties, () => {}); velden[naam] = v; return [l, v, t]; };
    const morgen = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
    const standaardStatus = r.datum && r.datum > vandaag() ? 'ingepland' : 'concept';
    const gevonden = $('ul', { class: 'hh-gevonden' }, [
      ['Titel', r.titel || '—'],
      ['Inleiding', r.inleiding ? r.inleiding.replace(/<[^>]+>/g, '').slice(0, 90) + '…' : '—'],
      ['Tussenkoppen', String(r.tussenkoppen)],
      ['Veelgestelde vragen', String(r.faq.length)],
      ['Lengte', `${r.woorden} woorden (${r.leestijd})`],
    ].map(([k, v]) => $('li', {}, [$('span', { text: k }), $('strong', { text: v })])));
    let fotoAan = !!r.foto;
    const fotoBlok = r.foto && $('label', { class: 'hh-importfoto' }, [
      $('img', { src: r.foto.url, alt: '' }),
      $('span', {}, [
        $('input', { type: 'checkbox', checked: true, onchange: e => { fotoAan = e.target.checked; } }),
        ' Deze foto bovenaan het artikel en in het blogoverzicht gebruiken',
      ]),
    ]);
    const inhoud = [
      $('p', { class: 'hh-uitleg', text: 'Dit is gevonden in je document. Controleer de gegevens hieronder; de tekst zelf pas je daarna gewoon op de pagina aan.' }),
      gevonden,
      ...r.waarschuwingen.map(w => $('p', { class: 'hh-waarschuwing', text: w })),
      fotoBlok,
      ...maakVeld('titel', 'Titel', r.titel, { max: 90 }),
    ];
    if (!doel) {
      const datumRij = $('div', { class: 'hh-datumrij' });
      const statusVeld = maakVeld('status', 'Wanneer moet het online?', standaardStatus, { opties: {
        concept: 'Nog niet: eerst zelf nakijken (concept)',
        ingepland: 'Inplannen op een datum',
        gepubliceerd: 'Direct online zetten',
      } });
      const [dl, dv] = maakVeld('datum', 'Datum waarop het live gaat', r.datum && r.datum > vandaag() ? r.datum : morgen, { type: 'date' });
      dv.min = morgen;
      const gepland = $('p', { class: 'hh-tel' });
      geplandeDatums().then(lijst => {
        if (lijst.length) gepland.textContent = 'Al ingepland: ' + lijst.sort((a, b) => a.datum.localeCompare(b.datum)).map(a => datumKort(a.datum)).join(', ');
      });
      datumRij.append(dl, dv, gepland);
      const toon = () => { datumRij.hidden = velden.status.value !== 'ingepland'; };
      velden.status.addEventListener('change', toon); toon();
      inhoud.push(...statusVeld, datumRij, ...maakVeld('categorie', 'Onderwerp', r.categorie, { opties: CATEGORIEEN }));
    }
    inhoud.push(
      ...maakVeld('metaTitel', 'Titel in Google', r.meta.title, { max: 60 }),
      ...maakVeld('metaOmschrijving', 'Omschrijving in Google', r.meta.description, { max: 155, rijen: 3 }),
      ...maakVeld('samenvatting', 'Samenvatting op de kaart in het blogoverzicht', r.samenvatting, { rijen: 3 }),
    );

    paneel(doel ? 'Tekst vervangen: controleren' : 'Artikel controleren', inhoud, async () => {
      const w = k => velden[k]?.value.trim() ?? '';
      if (!w('titel')) { melding('Geef het artikel een titel', 'fout'); return false; }
      let foto = null;
      if (fotoAan && r.foto) {
        try {
          const klein = await verklein(await (await fetch(r.foto.url)).blob());
          foto = { data: klein.url.split(',')[1], alt: r.foto.alt, url: klein.url };
        } catch { melding('De foto uit het document kon niet worden gebruikt; het artikel krijgt de standaardfoto.', 'fout'); }
      }
      if (doel) return vervangArtikel(doel, r, w, foto);
      const status = w('status');
      const datum = status === 'ingepland' ? w('datum') : vandaag();
      if (status === 'ingepland' && !(datum > vandaag())) { melding('Kies een datum in de toekomst om in te plannen', 'fout'); return false; }
      melding('Artikel wordt aangemaakt…', 'ok', 0);
      try {
        const d = await api('/api/beheer/blog', {
          actie: 'importeer', titel: w('titel'), categorie: w('categorie'), status, datum,
          inleiding: r.inleiding, inhoud: r.inhoud, faq: r.faq, samenvatting: w('samenvatting'), leestijd: r.leestijd,
          meta: { title: w('metaTitel'), description: w('metaOmschrijving') },
          foto: foto && { data: foto.data, alt: foto.alt },
        });
        const wat = status === 'ingepland' ? `Ingepland voor ${datumLang(datum)}.` : status === 'gepubliceerd' ? 'Artikel staat online.' : 'Concept aangemaakt.';
        naarArtikel(d.slug, wat);
      } catch (e) { melding(e.message, 'fout', 0); return false; }
    }, doel ? 'Tekst vervangen' : 'Artikel aanmaken');
  }

  // Bestaand artikel: alles als gewone wijzigingen klaarzetten; met Publiceren gaat het live
  function vervangArtikel(ref, r, w, foto) {
    const a = bron[ref];
    if (!a) { melding('Dit artikel kon niet worden geladen', 'fout'); return; }
    stap();
    const tekst = (sleutel, waarde) => {
      const k = sleutelVan('tekst', ref + ':' + sleutel);
      if (waarde === (a.t?.[sleutel] ?? '')) wijzigingen.delete(k);
      else wijzigingen.set(k, { bestand: ref, soort: 'tekst', sleutel, waarde });
    };
    tekst('titel', w('titel'));
    if (r.inleiding) tekst('inleiding', r.inleiding);
    tekst('inhoud', r.inhoud);
    tekst('samenvatting', w('samenvatting'));
    tekst('leestijd', r.leestijd);
    wijzigingen.set(sleutelVan('lijst', ref + ':faq'), { bestand: ref, soort: 'lijst', sleutel: 'faq', waarde: r.faq });
    for (const [sleutel, veld] of [['title', 'metaTitel'], ['description', 'metaOmschrijving']]) {
      if (w(veld) && w(veld) !== a.meta?.[sleutel]) wijzigingen.set(sleutelVan('meta', ref + ':' + sleutel), { bestand: ref, soort: 'meta', sleutel, waarde: w(veld) });
    }
    if (foto) {
      const id = 'u' + Date.now();
      uploads.set(id, { id, naam: 'foto-uit-document.jpg', data: foto.data });
      for (const sleutel of ['hero.foto1', 'kaart']) if (a.i?.[sleutel]) wijzigingen.set(sleutelVan('beeld', ref + ':' + sleutel), { bestand: ref, soort: 'beeld', sleutel, waarde: { upload: id, alt: foto.alt } });
    }
    telBij();
    if (ref === PAGINA) {
      melding('Tekst vervangen. Kijk het artikel na en klik op Publiceren.');
      sessionStorage.setItem(SCROLL, '0');
      setTimeout(() => location.reload(), 800);
    } else melding('Tekst vervangen. Open het artikel om het na te kijken en klik op Publiceren.', 'ok', 8000);
  }

  // ---------- blogplanning: agenda met alle artikelen ----------
  async function planningPaneel() {
    const lijst = $('div', { class: 'hh-planning' }, $('p', { class: 'hh-uitleg', text: 'Laden…' }));
    paneel('Blogplanning', [
      $('p', { class: 'hh-uitleg', text: 'Plan artikelen vooruit: een ingepland artikel gaat op de gekozen dag \'s ochtends vroeg vanzelf live. Tot die dag is het alleen voor jou zichtbaar.' }),
      $('div', { class: 'hh-knoppenrij' }, [$('button', { type: 'button', class: 'hh-knop hh-knop--hoofd', onclick: () => importPaneel(), text: '+ Nieuw artikel uit document' })]),
      lijst,
    ]);
    document.querySelector('.hh-paneel-doos')?.classList.add('is-breed');
    let artikelen;
    try { artikelen = (await api('/api/beheer/blog')).artikelen; } catch (e) { lijst.replaceChildren($('p', { class: 'hh-waarschuwing', text: e.message })); return; }
    // Niet-gepubliceerde wijzigingen (bijv. net een datum aangepast) meetellen
    artikelen = artikelen.map(a => ({ ...a, opgeslagen: { status: a.status, datum: a.datum }, status: huidig('artikel', a.ref, 'status', a.status), datum: huidig('artikel', a.ref, 'datum', a.datum) }));
    const dag = vandaag();
    const gepland = artikelen.filter(a => a.status === 'ingepland' && a.datum > dag).sort((x, y) => x.datum.localeCompare(y.datum));
    const concepten = artikelen.filter(a => a.status === 'concept').sort((x, y) => y.datum.localeCompare(x.datum));
    const live = artikelen.filter(a => a.status === 'gepubliceerd' || (a.status === 'ingepland' && a.datum <= dag)).sort((x, y) => y.datum.localeCompare(x.datum));

    const inplannen = (a, rij) => {
      const morgen = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
      const datum = $('input', { type: 'date', class: 'hh-veld hh-veld--klein', value: a.datum > dag ? a.datum : morgen, min: morgen });
      rij.querySelector('.hh-rij-acties').replaceChildren(datum,
        $('button', { type: 'button', class: 'hh-knop hh-knop--hoofd', text: 'Opslaan', onclick: () => {
          if (!(datum.value > dag)) return melding('Kies een datum in de toekomst', 'fout');
          zet(a.ref, 'artikel', 'status', a.opgeslagen.status)('ingepland');
          zet(a.ref, 'artikel', 'datum', a.opgeslagen.datum)(datum.value);
          telBij();
          melding(`Ingepland voor ${datumLang(datum.value)}. Klik op Publiceren om de planning op te slaan.`, 'ok', 8000);
          planningPaneel();
        } }));
      datum.focus();
    };
    const naarConcept = a => {
      zet(a.ref, 'artikel', 'status', a.opgeslagen.status)('concept');
      telBij();
      melding('Weer een concept. Klik op Publiceren om dit op te slaan.', 'ok', 6000);
      planningPaneel();
    };
    const rij = (a, soort) => {
      const r = $('li', { class: 'hh-rij' }, [
        $('time', { datetime: a.datum, text: datumKort(a.datum) }),
        $('span', { class: 'hh-rij-titel', text: a.titel }),
        $('span', { class: 'hh-rij-acties' }, [
          $('a', { class: 'hh-knop', href: '/' + a.ref, text: 'Openen' }),
          soort !== 'live' && !a.eigenPagina && $('button', { type: 'button', class: 'hh-knop', text: soort === 'gepland' ? 'Andere datum' : 'Inplannen', onclick: () => inplannen(a, r) }),
          soort === 'gepland' && $('button', { type: 'button', class: 'hh-knop hh-knop--stil', text: 'Niet inplannen', onclick: () => naarConcept(a) }),
        ]),
      ]);
      return r;
    };
    const groep = (titel, items, soort, leeg) => [
      $('h3', { class: 'hh-planning-kop', text: `${titel} (${items.length})` }),
      items.length ? $('ul', { class: 'hh-rijen' }, items.map(a => rij(a, soort))) : $('p', { class: 'hh-tel', text: leeg }),
    ];
    lijst.replaceChildren(
      kalender(gepland, live),
      ...groep('Ingepland', gepland, 'gepland', 'Nog niets ingepland. Kies bij een concept "Inplannen".'),
      ...groep('Concepten', concepten, 'concept', 'Geen concepten.'),
      ...groep('Online', live.slice(0, 8), 'live', 'Nog geen artikelen online.'),
    );
  }

  // Drie maanden vooruit; dagen met een artikel zijn gemarkeerd
  function kalender(gepland, live) {
    const opDag = {};
    [...gepland, ...live].forEach(a => { (opDag[a.datum] ||= []).push(a); });
    const nu = new Date(vandaag() + 'T12:00:00');
    const maanden = [0, 1, 2].map(n => {
      const eerste = new Date(nu.getFullYear(), nu.getMonth() + n, 1, 12);
      const dagen = new Date(eerste.getFullYear(), eerste.getMonth() + 1, 0).getDate();
      const leeg = (eerste.getDay() + 6) % 7; // maandag eerst
      const cellen = [...Array(leeg)].map(() => $('span'));
      for (let d = 1; d <= dagen; d++) {
        const iso = `${eerste.getFullYear()}-${String(eerste.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const items = opDag[iso];
        const klasse = ['hh-dag', iso === vandaag() && 'is-vandaag', items && (iso > vandaag() ? 'is-gepland' : 'is-live')].filter(Boolean).join(' ');
        cellen.push(items
          ? $('a', { class: klasse, href: '/' + items[0].ref, title: items.map(a => a.titel).join('\n'), text: String(d) })
          : $('span', { class: klasse, text: String(d) }));
      }
      return $('div', { class: 'hh-maand' }, [
        $('strong', { text: eerste.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }) }),
        $('div', { class: 'hh-dagen' }, [...['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(t => $('i', { text: t })), ...cellen]),
      ]);
    });
    return $('div', { class: 'hh-kalender' }, [
      ...maanden,
      $('p', { class: 'hh-kalender-uitleg' }, [$('i', { class: 'hh-stip is-gepland' }), ' ingepland ', $('i', { class: 'hh-stip is-live' }), ' online']),
    ]);
  }

  // ---------- bedrijfsgegevens ----------
  const BEDRIJF_VELDEN = [
    ['telefoon', 'Mobiel nummer (bel- en WhatsApp-knoppen)'],
    ['telefoonVast', 'Vast nummer'],
    ['email', 'E-mailadres'],
    ['kvk', 'KvK-nummer'],
    ['afm', 'AFM-vergunningnummer'],
    ['plaats', 'Plaats'],
    ['regio', 'Provincie of regio'],
    ['werkgebied', 'Werkgebied (plaatsen, gescheiden door komma\'s)', { rijen: 3 }],
    ['omschrijving', 'Korte omschrijving van het bedrijf (voor Google)', { rijen: 3, max: 300 }],
    ['googleProfiel', 'Link naar je Google-bedrijfsprofiel'],
    ['linkedin', 'Link naar LinkedIn'],
    ['trustoo', 'Link naar Trustoo'],
  ];
  function bedrijfWeergave(k, v) {
    if (Array.isArray(v)) return v.join(', ');
    if ((k === 'telefoon' || k === 'telefoonVast') && typeof v === 'string') {
      const m = v.match(/^\+31(6)(\d{2})(\d{2})(\d{2})(\d{2})$/) || v.match(/^\+31(\d{2})(\d{3})(\d{4})$/);
      if (m && m[1] === '6') return `06 ${m[2]} ${m[3]} ${m[4]} ${m[5]}`;
      if (m) return `0${m[1]} ${m[2]} ${m[3]}`;
    }
    return v ?? '';
  }
  function bedrijfPaneel() {
    const b = bron.site?.bedrijf;
    if (!b) return melding('De bedrijfsgegevens konden niet worden geladen', 'fout');
    const { veld, opslaan } = veldMaker();
    paneel('Bedrijfsgegevens', [
      $('p', { class: 'hh-uitleg', text: 'Deze gegevens zitten achter de bel-, WhatsApp- en mailknoppen op de hele site en in de informatie die Google over je bedrijf leest. De zichtbare teksten, zoals "Bel 06 …", pas je aan door er op de pagina op te klikken.' }),
      ...BEDRIJF_VELDEN.flatMap(([k, label, opties = {}]) => {
        const oud = bedrijfWeergave(k, b[k]);
        return veld(label, huidig('bedrijf', 'site', k, oud), opties, zet('site', 'bedrijf', k, oud));
      }),
    ], () => { opslaan(); telBij(); melding('Aangepast. Klik op Publiceren om het live te zetten.', 'ok', 5000); });
  }

  // ---------- contactformulier: onderwerpen ----------
  function formulierPaneel() {
    const ref = 'contact:onderwerpen';
    const onderwerpen = huidigeWaarde('lijst', ref);
    const kies = bron.contact?.t?.['formulier.kies'] ?? '';
    const groepen = [];
    onderwerpen.forEach(o => { let g = groepen.find(x => x.naam === o.groep); if (!g) groepen.push(g = { naam: o.groep, items: [] }); g.items.push(o.tekst); });
    const vakken = $('div', { class: 'hh-groepen' });
    const voegGroepToe = (naam = '', items = []) => {
      const naamVeld = $('input', { type: 'text', class: 'hh-veld', value: naam, placeholder: 'Naam van de groep, bijv. Hypotheek' });
      const itemsVeld = $('textarea', { class: 'hh-veld', rows: String(Math.max(3, items.length + 1)), placeholder: 'Eén onderwerp per regel' });
      itemsVeld.value = items.map(t => t.replace(/&amp;/g, '&')).join('\n');
      const vak = $('div', { class: 'hh-groep' }, [
        $('label', { class: 'hh-veldlabel', text: 'Groep' }), naamVeld,
        $('label', { class: 'hh-veldlabel', text: 'Onderwerpen (één per regel)' }), itemsVeld,
        $('button', { type: 'button', class: 'hh-knop hh-knop--stil', text: 'Groep verwijderen', onclick: () => vak.remove() }),
      ]);
      vak._lees = () => ({ naam: naamVeld.value.trim(), items: itemsVeld.value.split('\n').map(s => s.trim()).filter(Boolean) });
      vakken.append(vak);
    };
    groepen.forEach(g => voegGroepToe(g.naam, g.items));
    const kiesVeld = $('input', { type: 'text', class: 'hh-veld', value: huidig('tekst', 'contact', 'formulier.kies', kies) });
    paneel('Onderwerpen in het contactformulier', [
      $('p', { class: 'hh-uitleg', text: 'Dit zijn de keuzes bij "Waar gaat je vraag over?". Je ziet het verschil na het publiceren.' }),
      $('label', { class: 'hh-veldlabel', text: 'Eerste regel in de keuzelijst' }), kiesVeld,
      vakken,
      $('button', { type: 'button', class: 'hh-knop', text: '+ Groep toevoegen', onclick: () => voegGroepToe() }),
    ], () => {
      const lijst = [...vakken.children].map(v => v._lees()).filter(g => g.naam && g.items.length)
        .flatMap(g => g.items.map(tekst => ({ groep: g.naam, tekst })));
      if (!lijst.length) { melding('Er moet minstens één onderwerp overblijven', 'fout'); return false; }
      if (JSON.stringify(lijst) !== JSON.stringify(huidigeWaarde('lijst', ref))) { stap(); zetLijst(ref, lijst); }
      zet('contact', 'tekst', 'formulier.kies', kies)(kiesVeld.value.trim());
      telBij();
      melding('Aangepast. Klik op Publiceren om het live te zetten.', 'ok', 5000);
    });
  }

  // ---------- geschiedenis: elke publicatie is een back-up ----------
  async function geschiedenisPaneel() {
    const lijst = $('ol', { class: 'hh-versies' }, $('li', { text: 'Laden…' }));
    paneel('Geschiedenis', [
      $('p', { class: 'hh-uitleg', text: 'Elke keer dat je publiceert, wordt een versie bewaard. Zet je een oudere versie terug, dan wordt dat zelf ook weer een versie: je kunt dus altijd terug.' }),
      wijzigingen.size > 0 && $('div', { class: 'hh-knoppenrij' }, [$('button', { type: 'button', class: 'hh-knop hh-knop--gevaar', onclick: allesTerug, text: `Mijn ${wijzigingen.size} niet-gepubliceerde wijziging${wijzigingen.size === 1 ? '' : 'en'} weggooien` })]),
      lijst,
    ]);
    try {
      const { versies } = await api('/api/beheer/geschiedenis');
      lijst.replaceChildren(...versies.map((v, n) => {
        const datum = new Date(v.datum).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        return $('li', {}, [
          $('div', {}, [$('strong', { text: datum }), $('span', { text: v.bericht })]),
          n === 0 ? $('em', { text: 'Huidige versie' }) : $('button', { type: 'button', class: 'hh-knop', onclick: () => zetTerug(v, datum), text: 'Terugzetten' }),
        ]);
      }));
      if (!versies.length) lijst.replaceChildren($('li', { text: 'Nog geen versies.' }));
    } catch (e) { lijst.replaceChildren($('li', { text: e.message })); }
  }

  async function zetTerug(versie, datum) {
    const extra = wijzigingen.size ? ' Je wijzigingen die nog niet live staan, vervallen dan ook.' : '';
    if (!confirm(`De hele website terugzetten naar hoe hij was op ${datum}?${extra}`)) return;
    const reserve = veiligstellen();
    try {
      await api('/api/beheer/geschiedenis', { id: versie.id, omschrijving: datum });
      wijzigingen.clear();
      stappen = [];
      telBij();
      sluitPaneel();
      if (lokaal) { melding('Teruggezet. De pagina wordt ververst.'); setTimeout(() => location.reload(), 900); }
      else melding('Teruggezet. Over ongeveer een minuut staat de oude versie weer live.', 'ok', 10000);
    } catch (e) {
      herstelReserve(reserve);
      melding(e.message, 'fout', 0);
    }
  }

  // Het concept gaat pas weg als publiceren of terugzetten is gelukt. Tijdens het verzoek staat het
  // alleen in deze reservekopie, zodat een tussentijds herladen het niet ten onrechte terugzet.
  function veiligstellen() {
    let reserve = null;
    try {
      reserve = { concept: localStorage.getItem(CONCEPT), stappen: sessionStorage.getItem(STAPPEN) };
      localStorage.removeItem(CONCEPT);
      sessionStorage.removeItem(STAPPEN);
    } catch { /* geen opslag */ }
    return reserve;
  }
  let weg = false;
  function herstelReserve(reserve) {
    if (weg) return;
    try {
      if (reserve?.concept) localStorage.setItem(CONCEPT, reserve.concept);
      if (reserve?.stappen) sessionStorage.setItem(STAPPEN, reserve.stappen);
    } catch { /* geen opslag */ }
  }

  // ---------- paneel ----------
  function paneel(titel, inhoud, opslaan, knopTekst = 'Toepassen') {
    sluitPaneel();
    // opslaan mag async zijn; geeft hij false terug, dan blijft het paneel open (bijv. bij een fout)
    const knoppen = opslaan
      ? [$('button', { type: 'button', class: 'hh-knop', onclick: sluitPaneel, text: 'Annuleren' }),
         $('button', { type: 'button', class: 'hh-knop hh-knop--hoofd', onclick: async e => {
           const knop = e.currentTarget;
           knop.disabled = true;
           try { if (await opslaan() === false) return; sluitPaneel(); } finally { knop.disabled = false; }
         }, text: knopTekst })]
      : [$('button', { type: 'button', class: 'hh-knop', onclick: sluitPaneel, text: 'Sluiten' })];
    const p = $('div', { class: 'hh-paneel', role: 'dialog', 'aria-modal': 'true', 'aria-label': titel }, [
      $('div', { class: 'hh-paneel-doos' }, [$('h2', { text: titel }), ...inhoud, $('div', { class: 'hh-paneel-knoppen' }, knoppen)]),
    ]);
    p.addEventListener('click', e => { if (e.target === p) sluitPaneel(); });
    p.addEventListener('keydown', e => { if (e.key === 'Escape') sluitPaneel(); });
    document.body.append(p);
  }
  const sluitPaneel = () => document.querySelector('.hh-paneel')?.remove();

  // ---------- concept, publiceren, uitloggen ----------
  function herstelConcept() {
    let c;
    try { c = JSON.parse(localStorage.getItem(CONCEPT) || 'null'); } catch { c = null; }
    if (!c) { telBij(); return; }
    c.u.forEach(u => uploads.set(u.id, u));
    // Wat inmiddels al live staat (of nergens meer bestaat) hoort niet meer in het concept
    const alLive = w => {
      const b = bron[w.bestand];
      if (!b) return false; // bestand van een andere pagina: niet geladen, dus bewaren
      if (w.soort === 'tekst' || w.soort === 'attr') return b.t?.[w.sleutel] === w.waarde || !(w.sleutel in (b.t || {}));
      if (w.soort === 'lijst') return JSON.stringify(b.l?.[w.sleutel]) === JSON.stringify(w.waarde);
      if (w.soort === 'meta') return b.meta?.[w.sleutel] === w.waarde;
      if (w.soort === 'artikel') return b.artikel?.[w.sleutel] === w.waarde;
      if (w.soort === 'bedrijf') return bedrijfWeergave(w.sleutel, b.bedrijf?.[w.sleutel]) === w.waarde;
      return false;
    };
    c.w.filter(w => !alLive(w)).forEach(w => {
      const ref = w.bestand + ':' + w.sleutel;
      wijzigingen.set(sleutelVan(w.soort, ref), w);
      if (w.soort === 'tekst') document.querySelectorAll(`[data-e="${CSS.escape(ref)}"]`).forEach(el => { el.innerHTML = w.waarde; el.classList.add('hh-gewijzigd'); });
      if (w.soort === 'attr') document.querySelectorAll('[data-ea]').forEach(el => { if (el.dataset.ea.endsWith('|' + ref)) { el.setAttribute(el.dataset.ea.split('|')[0], w.waarde); el.classList.add('hh-gewijzigd'); } });
      if (w.soort === 'beeld' && w.waarde.upload && uploads.has(w.waarde.upload)) {
        const url = uploadUrl(w.waarde.upload);
        document.querySelectorAll(`[data-ei="${CSS.escape(ref)}"]`).forEach(el => { toonFoto(el, 'img', url); el.classList.add('hh-gewijzigd'); });
        document.querySelectorAll(`[data-eb="${CSS.escape(ref)}"]`).forEach(el => toonFoto(el, 'bg', url));
        document.querySelectorAll(`[data-ef="${CSS.escape(ref)}"]`).forEach(el => toonFoto(el, 'foto', url));
      }
    });
    telBij();
  }

  async function publiceer() {
    stopBewerken(true);
    if (!wijzigingen.size) return;
    // ook foto's in lijst-items tellen mee
    const gebruikt = new Set([...JSON.stringify([...wijzigingen.values()]).matchAll(/"upload":"([^"]+)"/g)].map(m => m[1]));
    const body = { wijzigingen: [...wijzigingen.values()], uploads: [...uploads.values()].filter(u => gebruikt.has(u.id)) };
    if (JSON.stringify(body).length > 4_000_000) return melding('Te veel nieuwe foto\'s tegelijk. Publiceer eerst een deel en daarna de rest.', 'fout', 0);
    publiceerKnop.disabled = true;
    publiceerKnop.textContent = 'Bezig…';
    const reserve = veiligstellen();
    try {
      await api('/api/beheer/publiceer', body);
      wijzigingen.clear();
      uploads.clear();
      stappen = [];
      document.querySelectorAll('.hh-gewijzigd').forEach(el => el.classList.remove('hh-gewijzigd'));
      telBij();
      if (lokaal) { melding('Opgeslagen. De pagina wordt ververst.'); sessionStorage.setItem(SCROLL, String(scrollY)); setTimeout(() => location.reload(), 900); }
      else melding('Gepubliceerd! De website wordt nu bijgewerkt; over ongeveer een minuut staat alles live.', 'ok', 10000);
    } catch (e) {
      herstelReserve(reserve);
      melding(e.message || 'Publiceren is mislukt', 'fout', 0);
      publiceerKnop.disabled = false;
    }
    publiceerKnop.textContent = 'Publiceren';
    // bron bijwerken zodat vergelijken weer klopt
    try { Object.assign(bron, (await api('/api/beheer/inhoud?bestanden=' + Object.keys(bron).map(encodeURIComponent).join(','))).inhoud); } catch { /* volgende keer */ }
  }

  function allesTerug() {
    if (!wijzigingen.size || !confirm('Alle wijzigingen die nog niet live staan weggooien?')) return;
    wijzigingen.clear();
    try { localStorage.removeItem(CONCEPT); sessionStorage.removeItem(STAPPEN); } catch { /* geen opslag */ }
    location.reload();
  }

  async function uitloggen() {
    if (wijzigingen.size && !confirm('Je hebt wijzigingen die nog niet live staan. Toch uitloggen?')) return;
    await fetch('/api/beheer/login', { method: 'DELETE' });
    wijzigingen.clear();
    try { localStorage.removeItem(CONCEPT); sessionStorage.removeItem(STAPPEN); sessionStorage.removeItem('hh_bewerk'); } catch { /* geen opslag */ }
    location.reload();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
