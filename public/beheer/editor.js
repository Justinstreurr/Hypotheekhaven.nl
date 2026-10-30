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
  const STATUSSEN = { concept: 'Concept (alleen zichtbaar voor jou)', gepubliceerd: 'Gepubliceerd', binnenkort: 'Binnenkort (alleen de kaart, nog geen artikel)' };
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
    if (!sessie.ingelogd) { document.cookie = 'hh_edit=; Max-Age=0; path=/'; return; }
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
    });
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
    const balk = $('div', { class: 'hh-balk', role: 'toolbar', 'aria-label': 'Bewerkmodus' }, [
      $('span', { class: 'hh-label', text: lokaal ? 'Bewerkmodus (lokaal)' : 'Bewerkmodus' }),
      status === 'concept' && $('span', { class: 'hh-concept', text: 'Concept: nog niet zichtbaar in het blog' }),
      schakel,
      PAGINA === 'blog' && $('button', { class: 'hh-knop', type: 'button', onclick: nieuwArtikel, text: '+ Nieuw artikel' }),
      artikel && bron[artikel] && $('button', { class: 'hh-knop', type: 'button', onclick: () => artikelPaneel(artikel), text: 'Artikel' }),
      $('button', { class: 'hh-knop', type: 'button', onclick: fotoPaneel, text: 'Achtergrondfoto\'s' }),
      $('button', { class: 'hh-knop', type: 'button', onclick: paginaPaneel, text: 'Google & menu' }),
      $('button', { class: 'hh-knop', type: 'button', onclick: geschiedenisPaneel, text: 'Geschiedenis' }),
      $('span', { class: 'hh-ruimte' }),
      teller,
      terugKnop,
      publiceerKnop,
      $('button', { class: 'hh-knop hh-knop--stil', type: 'button', onclick: uitloggen, text: 'Uitloggen' }),
    ]);
    document.body.append(balk);
  }

  function telBij() {
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
    if (w) return w.waarde;
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

  function bereidLijstenVoor() {
    document.querySelectorAll('[data-el]').forEach(houder => {
      houder.hidden = false;
      if (wijzigingen.has(sleutelVan('lijst', houder.dataset.el)) || !items(houder).length) tekenLijst(houder);
    });
  }

  function nieuwItem(houder) {
    const item = {};
    sjabloon(houder).querySelectorAll('[data-e]').forEach(veld => { const naam = veldVan(veld); item[naam] = NIEUW[naam] || 'Nieuwe tekst'; });
    for (const [naam, opties] of Object.entries(JSON.parse(houder.dataset.keuzes || '{}'))) item[naam] = opties[0];
    return item;
  }

  function voegToe(houder, na) {
    stopBewerken(true);
    stap();
    const lijst = huidigeWaarde('lijst', houder.dataset.el);
    lijst.splice(na + 1, 0, nieuwItem(houder));
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
    zetLijst(houder.dataset.el, lijst);
    tekenLijst(houder);
    verbergItemKnoppen();
  }

  function verwijder(houder, n) {
    stap();
    const lijst = huidigeWaarde('lijst', houder.dataset.el);
    lijst.splice(n, 1);
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
    const huidig = huidigeWaarde('beeld', ref);
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

  const huidigeAchtergrond = el => {
    const s = el.style;
    const v = el.dataset.foto ? `url(${el.dataset.foto})` : s.getPropertyValue('--foto') || s.getPropertyValue('--bg-l');
    return (v.match(/url\(['"]?([^'")]+)/) || [])[1] || '';
  };

  function toonFoto(el, soort, url) {
    el.removeAttribute('data-foto');
    if (soort === 'img') { el.removeAttribute('srcset'); el.src = url; }
    else if (soort === 'foto') el.style.setProperty('--foto', `url("${url}")`);
    else { el.style.setProperty('--bg-l', `url("${url}")`); el.style.setProperty('--bg-m', `url("${url}")`); }
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
      ...veld('Datum', huidig('artikel', ref, 'datum', a.artikel.datum), { type: 'date' }, zet(ref, 'artikel', 'datum', a.artikel.datum)),
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
    if (!eigen) knoppen.push($('button', { type: 'button', class: 'hh-knop hh-knop--gevaar', onclick: () => verwijderArtikel(ref), text: 'Artikel verwijderen' }));
    if (!eigen && a.artikel.status !== 'binnenkort' && ref !== PAGINA) knoppen.unshift($('a', { class: 'hh-knop', href: '/' + ref, text: 'Artikel openen' }));
    inhoud.push($('div', { class: 'hh-knoppenrij' }, knoppen));
    paneel('Artikel', inhoud, () => { opslaan(); telBij(); melding('Aangepast. Publiceer om het live te zetten.', 'ok', 4000); });
  }

  function nieuwArtikel() {
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
  function herstelReserve(reserve) {
    try {
      if (reserve?.concept) localStorage.setItem(CONCEPT, reserve.concept);
      if (reserve?.stappen) sessionStorage.setItem(STAPPEN, reserve.stappen);
    } catch { /* geen opslag */ }
  }

  // ---------- paneel ----------
  function paneel(titel, inhoud, opslaan, knopTekst = 'Toepassen') {
    sluitPaneel();
    const knoppen = opslaan
      ? [$('button', { type: 'button', class: 'hh-knop', onclick: sluitPaneel, text: 'Annuleren' }),
         $('button', { type: 'button', class: 'hh-knop hh-knop--hoofd', onclick: () => { opslaan(); sluitPaneel(); }, text: knopTekst })]
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
      return false;
    };
    c.w.filter(w => !alLive(w)).forEach(w => {
      const ref = w.bestand + ':' + w.sleutel;
      wijzigingen.set(sleutelVan(w.soort, ref), w);
      if (w.soort === 'tekst') document.querySelectorAll(`[data-e="${CSS.escape(ref)}"]`).forEach(el => { el.innerHTML = w.waarde; el.classList.add('hh-gewijzigd'); });
      if (w.soort === 'attr') document.querySelectorAll('[data-ea]').forEach(el => { if (el.dataset.ea.endsWith('|' + ref)) { el.setAttribute(el.dataset.ea.split('|')[0], w.waarde); el.classList.add('hh-gewijzigd'); } });
      if (w.soort === 'beeld' && w.waarde.upload && uploads.has(w.waarde.upload)) {
        const url = 'data:image/' + (uploads.get(w.waarde.upload).data.startsWith('iVBOR') ? 'png' : 'jpeg') + ';base64,' + uploads.get(w.waarde.upload).data;
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
    const gebruikt = new Set([...wijzigingen.values()].map(w => w.waarde?.upload).filter(Boolean));
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
    try { localStorage.removeItem(CONCEPT); sessionStorage.removeItem(STAPPEN); } catch { /* geen opslag */ }
    location.reload();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
