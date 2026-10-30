/* Bewerkmodus van Hypotheekhaven.
   Wordt alleen geladen als je bent ingelogd (cookie hh_edit, zie Base.astro).
   Klik op een tekst of foto om hem aan te passen; "Publiceren" zet alles in één keer live. */
(() => {
  const PAGINA = document.body.dataset.pagina;
  if (!PAGINA || window.__hhEditor) return;
  window.__hhEditor = true;

  const CONCEPT = 'hh-concept';
  let bewaard = true;               // staat het concept veilig in de browser?
  const bron = {};                 // { bestand: inhoud } zoals op de server
  const wijzigingen = new Map();   // "soort|bestand:sleutel" -> { bestand, soort, sleutel, waarde }
  const uploads = new Map();       // id -> { id, naam, data }
  let modus = 'bewerk';
  let actief = null;               // element dat nu bewerkt wordt
  let actiefOrigineel = '';
  let lokaal = false;

  const $ = (tag, attrs = {}, kids = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    [].concat(kids).forEach(k => k && el.append(k));
    return el;
  };
  const splits = ref => { const i = ref.indexOf(':'); return [ref.slice(0, i), ref.slice(i + 1)]; };
  const sleutelVan = (soort, ref) => soort + '|' + ref;

  // ---------- opstarten ----------
  async function start() {
    let sessie;
    try { sessie = await (await fetch('/api/beheer/sessie', { cache: 'no-store' })).json(); } catch { return; }
    if (!sessie.ingelogd) { document.cookie = 'hh_edit=; Max-Age=0; path=/'; return; }
    lokaal = sessie.lokaal;
    document.head.append($('link', { rel: 'stylesheet', href: '/beheer/editor.css' }));
    const r = await fetch('/api/beheer/inhoud?bestanden=site,' + encodeURIComponent(PAGINA), { cache: 'no-store' });
    const d = await r.json();
    if (!d.ok) return melding(d.fout || 'Kon de inhoud niet laden', 'fout');
    Object.assign(bron, d.inhoud);
    document.documentElement.classList.add('hh-bewerk');
    document.querySelectorAll('details').forEach(el => { el.open = true; });
    bouwBalk();
    herstelConcept();
    document.addEventListener('click', klik, true);
    window.addEventListener('beforeunload', e => {
      stopBewerken(true);
      if (wijzigingen.size && !bewaard) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---------- werkbalk ----------
  let teller, publiceerKnop;
  function bouwBalk() {
    const schakel = $('button', { class: 'hh-schakel is-aan', type: 'button', 'aria-pressed': 'true', onclick: () => {
      modus = modus === 'bewerk' ? 'bekijk' : 'bewerk';
      if (modus === 'bekijk') stopBewerken(true);
      schakel.classList.toggle('is-aan', modus === 'bewerk');
      schakel.setAttribute('aria-pressed', String(modus === 'bewerk'));
      schakel.lastChild.textContent = modus === 'bewerk' ? 'Klikken = bewerken' : 'Klikken = website gebruiken';
      document.documentElement.classList.toggle('hh-bekijk', modus === 'bekijk');
    } }, [$('span', { class: 'hh-schakel-bol' }), $('span', { text: 'Klikken = bewerken' })]);
    teller = $('span', { class: 'hh-teller', text: 'Geen wijzigingen' });
    publiceerKnop = $('button', { class: 'hh-knop hh-knop--hoofd', type: 'button', disabled: '', onclick: publiceer, text: 'Publiceren' });
    const balk = $('div', { class: 'hh-balk', role: 'toolbar', 'aria-label': 'Bewerkmodus' }, [
      $('span', { class: 'hh-label', text: lokaal ? 'Bewerkmodus (lokaal)' : 'Bewerkmodus' }),
      schakel,
      $('button', { class: 'hh-knop', type: 'button', onclick: fotoPaneel, text: 'Achtergrondfoto\'s' }),
      $('button', { class: 'hh-knop', type: 'button', onclick: paginaPaneel, text: 'Google & menu' }),
      $('span', { class: 'hh-ruimte' }),
      teller,
      $('button', { class: 'hh-knop', type: 'button', onclick: allesTerug, text: 'Alles terugdraaien' }),
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
    // Het concept geldt voor de hele site: je kunt vrij naar een andere pagina en daar verder
    try {
      localStorage.setItem(CONCEPT, JSON.stringify({ w: [...wijzigingen.values()], u: [...uploads.values()] }));
      bewaard = true;
    } catch { bewaard = false; /* te groot of geen opslag: dan waarschuwen bij weggaan */ }
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
    if (e.target.closest('.hh-balk, .hh-paneel, .hh-mini, .hh-melding')) return;
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

  const huidigeWaarde = (soort, ref) => {
    const w = wijzigingen.get(sleutelVan(soort, ref));
    if (w) return w.waarde;
    const [bestand, sleutel] = splits(ref);
    if (soort === 'beeld') return { ...(bron[bestand]?.i?.[sleutel] || {}) };
    return bron[bestand]?.t?.[sleutel] ?? '';
  };

  // ---------- teksten ----------
  let mini;
  function bewerkTekst(el, e) {
    actief = el;
    actiefOrigineel = el.innerHTML;
    el.innerHTML = huidigeWaarde('tekst', el.dataset.e);
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
    mini = $('div', { class: 'hh-mini' }, [
      knop($('b', { text: 'B' }), 'Vet (Ctrl+B)', () => document.execCommand('bold')),
      knop('↵', 'Nieuwe regel (Enter)', () => document.execCommand('insertLineBreak')),
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
    else if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
  }

  function plak(e) {
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  }

  function opgeschoond(el) {
    const kopie = el.cloneNode(true);
    kopie.querySelectorAll('[contenteditable]').forEach(k => k.removeAttribute('contenteditable'));
    let html = kopie.innerHTML.replace(/&nbsp;/g, ' ');
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
    const ref = el.dataset.e;
    if (!bewaren) { el.innerHTML = actiefOrigineel; return; }
    const html = opgeschoond(el);
    el.innerHTML = html;
    const [bestand, sleutel] = splits(ref);
    if (html === (bron[bestand]?.t?.[sleutel] ?? '')) wijzigingen.delete(sleutelVan('tekst', ref));
    else wijzigingen.set(sleutelVan('tekst', ref), { bestand, soort: 'tekst', sleutel, waarde: html });
    // dezelfde tekst kan vaker op de pagina staan
    document.querySelectorAll(`[data-e="${CSS.escape(ref)}"]`).forEach(ander => {
      if (ander !== el) ander.innerHTML = html;
      ander.classList.toggle('hh-gewijzigd', wijzigingen.has(sleutelVan('tekst', ref)));
    });
    telBij();
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
      if (nieuw) {
        const id = 'u' + Date.now();
        uploads.set(id, { id, naam: nieuw.naam, data: nieuw.url.split(',')[1] });
        waarde.upload = id;
        toonFoto(el, soort, nieuw.url);
      }
      if (soort === 'img' && alt.value !== (bron[bestand]?.i?.[sleutel]?.alt ?? '')) { waarde.alt = alt.value; el.alt = alt.value; }
      if (Object.keys(waarde).length) {
        wijzigingen.set(sleutelVan('beeld', ref), { bestand, soort: 'beeld', sleutel, waarde });
        el.classList.add('hh-gewijzigd');
      }
      telBij();
    });
  }

  const huidigeAchtergrond = el => {
    const s = el.style;
    const v = s.getPropertyValue('--foto') || s.getPropertyValue('--bg-l');
    return (v.match(/url\(['"]?([^'")]+)/) || [])[1] || '';
  };

  function toonFoto(el, soort, url) {
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

  // ---------- Google-teksten en verborgen teksten ----------
  function paginaPaneel() {
    const meta = bron[PAGINA]?.meta;
    const velden = [];
    const veld = (label, waarde, max, rijen, opslaan) => {
      const v = rijen > 1 ? $('textarea', { rows: String(rijen), class: 'hh-veld' }) : $('input', { type: 'text', class: 'hh-veld' });
      v.value = waarde;
      const tel = $('span', { class: 'hh-tel' });
      const update = () => { tel.textContent = max ? `${v.value.length} / ${max} tekens` : ''; tel.classList.toggle('is-lang', max && v.value.length > max); };
      v.addEventListener('input', update); update();
      velden.push(() => opslaan(v.value.trim()));
      return [$('label', { class: 'hh-veldlabel', text: label }), v, tel];
    };
    const zet = (bestand, soort, sleutel, oud) => waarde => {
      const k = sleutelVan(soort, bestand + ':' + sleutel);
      if (waarde === oud) wijzigingen.delete(k);
      else wijzigingen.set(k, { bestand, soort, sleutel, waarde });
    };
    const huidig = (soort, bestand, sleutel, oud) => wijzigingen.get(sleutelVan(soort, bestand + ':' + sleutel))?.waarde ?? oud;
    const inhoud = [$('p', { class: 'hh-uitleg', text: 'Zo verschijnt deze pagina in Google. Houd de titel kort en de omschrijving uitnodigend.' })];
    if (meta) {
      inhoud.push(...veld('Titel in Google', huidig('meta', PAGINA, 'title', meta.title), 60, 1, zet(PAGINA, 'meta', 'title', meta.title)));
      inhoud.push(...veld('Omschrijving in Google', huidig('meta', PAGINA, 'description', meta.description), 155, 3, zet(PAGINA, 'meta', 'description', meta.description)));
    }
    const bel = bron.site?.t?.['menu.bel'];
    if (bel !== undefined) inhoud.push(...veld('Belregel onderin het menu op de telefoon', huidig('tekst', 'site', 'menu.bel', bel), 0, 1, zet('site', 'tekst', 'menu.bel', bel)));
    paneel('Google & menu', inhoud, () => { velden.forEach(f => f()); telBij(); });
  }

  // ---------- paneel ----------
  function paneel(titel, inhoud, opslaan) {
    sluitPaneel();
    const knoppen = opslaan
      ? [$('button', { type: 'button', class: 'hh-knop', onclick: sluitPaneel, text: 'Annuleren' }),
         $('button', { type: 'button', class: 'hh-knop hh-knop--hoofd', onclick: () => { opslaan(); sluitPaneel(); }, text: 'Toepassen' })]
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
    if (!c) return;
    c.u.forEach(u => uploads.set(u.id, u));
    c.w.forEach(w => {
      const ref = w.bestand + ':' + w.sleutel;
      wijzigingen.set(sleutelVan(w.soort, ref), w);
      if (w.soort === 'tekst') document.querySelectorAll(`[data-e="${CSS.escape(ref)}"]`).forEach(el => { el.innerHTML = w.waarde; el.classList.add('hh-gewijzigd'); });
      if (w.soort === 'attr') document.querySelectorAll('[data-ea]').forEach(el => { if (el.dataset.ea.endsWith('|' + ref)) { el.setAttribute(el.dataset.ea.split('|')[0], w.waarde); el.classList.add('hh-gewijzigd'); } });
      if (w.soort === 'beeld' && w.waarde.upload && uploads.has(w.waarde.upload)) {
        const url = 'data:image/' + (uploads.get(w.waarde.upload).data.startsWith('iVBOR') ? 'png' : 'jpeg') + ';base64,' + uploads.get(w.waarde.upload).data;
        document.querySelectorAll(`[data-ei="${CSS.escape(ref)}"]`).forEach(el => toonFoto(el, 'img', url));
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
    const body = JSON.stringify({ wijzigingen: [...wijzigingen.values()], uploads: [...uploads.values()].filter(u => gebruikt.has(u.id)) });
    if (body.length > 4_000_000) return melding('Te veel nieuwe foto\'s tegelijk. Publiceer eerst een deel en daarna de rest.', 'fout', 0);
    publiceerKnop.disabled = true;
    publiceerKnop.textContent = 'Bezig…';
    try {
      const r = await fetch('/api/beheer/publiceer', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      const d = await r.json();
      if (!d.ok) throw new Error(d.fout);
      wijzigingen.clear();
      uploads.clear();
      try { localStorage.removeItem(CONCEPT); } catch { /* geen opslag */ }
      document.querySelectorAll('.hh-gewijzigd').forEach(el => el.classList.remove('hh-gewijzigd'));
      telBij();
      if (lokaal) { melding('Opgeslagen. De pagina wordt ververst.'); setTimeout(() => location.reload(), 900); }
      else melding('Gepubliceerd! De website wordt nu bijgewerkt; over ongeveer een minuut staat alles live.', 'ok', 10000);
      if (d.inhoud) Object.assign(bron, d.inhoud);
    } catch (e) {
      melding(e.message || 'Publiceren is mislukt', 'fout', 0);
      publiceerKnop.disabled = false;
    }
    publiceerKnop.textContent = 'Publiceren';
    // bron bijwerken zodat vergelijken weer klopt
    try { Object.assign(bron, (await (await fetch('/api/beheer/inhoud?bestanden=site,' + PAGINA, { cache: 'no-store' })).json()).inhoud); } catch { /* volgende keer */ }
  }

  function allesTerug() {
    if (!wijzigingen.size || !confirm('Alle wijzigingen die nog niet live staan weggooien?')) return;
    wijzigingen.clear();
    try { localStorage.removeItem(CONCEPT); } catch { /* geen opslag */ }
    location.reload();
  }

  async function uitloggen() {
    if (wijzigingen.size && !confirm('Je hebt wijzigingen die nog niet live staan. Toch uitloggen?')) return;
    await fetch('/api/beheer/login', { method: 'DELETE' });
    wijzigingen.clear();
    try { localStorage.removeItem(CONCEPT); } catch { /* geen opslag */ }
    location.reload();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
