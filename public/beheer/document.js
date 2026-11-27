/* Blogartikel uit een document (Word-bestand of tekst geplakt uit Google Docs).
   Wordt alleen geladen in de bewerkmodus, als je een artikel uit een document maakt.

   Zo wordt het document ingedeeld:
   - Titel: de kop met stijl "Titel" of "Kop 1" (anders de eerste kop of de eerste korte regel).
   - Inleiding: de eerste alinea na de titel, vóór de eerste tussenkop.
   - Tussenkoppen: de grootste kopstijl in het document wordt een tussenkop (en komt in de inhoudsopgave),
     kleinere koppen worden een kleine kop. Gebruikt het document geen kopstijlen, dan tellen korte
     regels die helemaal vetgedrukt zijn als tussenkop.
   - Veelgestelde vragen: alles onder een kop "Veelgestelde vragen" (of "FAQ"). Elke vraag is een kop,
     een vetgedrukte regel of (zonder opmaak) een regel die eindigt op een vraagteken; daaronder het antwoord.
   - Optionele regels, ergens in het document, die er zelf weer uit gaan:
       Titel voor Google: ...        Omschrijving voor Google: ...       Samenvatting: ...
       Onderwerp: Een huis kopen      Datum: 15 januari 2027
   - De eerste foto in het document wordt de foto bovenaan het artikel en in het blogoverzicht. */
(() => {
  const ONDERWERPEN = {
    'huis-kopen': ['een huis kopen', 'huis kopen', 'kopen'],
    'huidige-hypotheek': ['je huidige hypotheek', 'huidige hypotheek', 'oversluiten'],
    verzekeringen: ['verzekeringen', 'verzekering'],
    ondernemers: ['ondernemers', 'ondernemer', 'zzp'],
  };
  const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tekstVan = el => (el.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const kaal = html => html.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

  // ---------- Word (.docx) ----------
  let mammothLaden = null;
  const laadMammoth = () => mammothLaden ||= new Promise((ok, mis) => {
    if (window.mammoth) return ok(window.mammoth);
    const s = document.createElement('script');
    s.src = '/beheer/mammoth.min.js';
    s.onload = () => ok(window.mammoth);
    s.onerror = () => { mammothLaden = null; mis(new Error('Het Word-bestand kon niet worden gelezen. Probeer het opnieuw.')); };
    document.head.append(s);
  });

  async function leesBestand(bestand) {
    if (!/\.docx$/i.test(bestand.name)) {
      throw new Error(/\.doc$/i.test(bestand.name)
        ? 'Dit is een oud Word-bestand (.doc). Sla het in Word op als .docx en probeer het opnieuw.'
        : 'Kies een Word-bestand (.docx). In Google Docs: Bestand → Downloaden → Microsoft Word (.docx).');
    }
    const mammoth = await laadMammoth();
    const r = await mammoth.convertToHtml({ arrayBuffer: await bestand.arrayBuffer() }, {
      styleMap: [
        "p[style-name='Title'] => h1:fresh", "p[style-name='Titel'] => h1:fresh",
        "p[style-name='Subtitle'] => p:fresh", "p[style-name='Ondertitel'] => p:fresh",
        "p[style-name='Kop 1'] => h1:fresh", "p[style-name='Kop 2'] => h2:fresh", "p[style-name='Kop 3'] => h3:fresh", "p[style-name='Kop 4'] => h4:fresh",
      ],
    });
    return structureer(r.value);
  }

  // ---------- Geplakt uit Google Docs (of Word, of een webpagina) ----------
  function leesKlembord(html, tekst) {
    if (!html) {
      // Alleen platte tekst: elke regel een alinea
      return structureer(tekst.split(/\r?\n/).map(r => r.trim()).filter(Boolean).map(r => `<p>${esc(r)}</p>`).join(''));
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style, script, meta, link, title, o\\:p').forEach(el => el.remove());
    // Google Docs zet vet en cursief in style-attributen: omzetten naar <strong> en <em>
    [...doc.body.querySelectorAll('*')].reverse().forEach(el => {
      const st = (el.getAttribute('style') || '').toLowerCase();
      const tag = el.tagName;
      if (tag === 'B' && /font-weight:\s*(normal|[1-4]00)/.test(st)) { el.replaceWith(...el.childNodes); return; }
      if (tag === 'SPAN' || tag === 'FONT') {
        let inhoud = [...el.childNodes];
        const maak = (naam, kids) => { const n = doc.createElement(naam); n.append(...kids); return [n]; };
        if (/font-style:\s*italic/.test(st)) inhoud = maak('em', inhoud);
        if (/font-weight:\s*(bold|[6-9]00)/.test(st)) inhoud = maak('strong', inhoud);
        el.replaceWith(...inhoud);
      }
    });
    return structureer(doc.body.innerHTML);
  }

  // ---------- Indelen ----------
  function schoonLink(href) {
    if (!href || /^#/.test(href)) return null;
    let h = href.trim();
    const google = h.match(/^https?:\/\/(?:www\.)?google\.[a-z.]+\/url\?(?:.*&)?q=([^&]+)/i);
    if (google) h = decodeURIComponent(google[1]);
    const eigen = h.match(/^https?:\/\/(?:www\.)?hypotheekhaven\.nl(\/[^\s]*)?$/i);
    if (eigen) return eigen[1] || '/';
    return /^(https?:|mailto:|tel:)/i.test(h) ? h : null;
  }

  // Tekst binnen een blok: alleen vet, cursief, links en regelafbrekingen blijven over
  function inline(node) {
    let uit = '';
    for (const k of node.childNodes) {
      if (k.nodeType === 3) { uit += esc(k.textContent.replace(/ /g, ' ')); continue; }
      if (k.nodeType !== 1) continue;
      const tag = k.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol' || tag === 'img') continue;
      if (tag === 'br') { uit += '<br>'; continue; }
      const binnen = inline(k);
      if (!binnen.trim()) { uit += binnen; continue; }
      if (tag === 'strong' || tag === 'b') uit += `<strong>${binnen}</strong>`;
      else if (tag === 'em' || tag === 'i') uit += `<em>${binnen}</em>`;
      else if (tag === 'a') {
        const h = schoonLink(k.getAttribute('href'));
        uit += h ? `<a href="${esc(h)}"${/^https?:/i.test(h) ? ' target="_blank" rel="noopener"' : ''}>${binnen}</a>` : binnen;
      } else if (tag === 'p' || tag === 'div') uit += (uit.trim() ? '<br>' : '') + binnen;
      else uit += binnen;
    }
    return uit
      .replace(/\s+/g, ' ')
      .replace(/<\/strong>(\s*)<strong>/g, '$1').replace(/<\/em>(\s*)<em>/g, '$1')
      .replace(/<strong>(\s+)/g, '$1<strong>').replace(/(\s+)<\/strong>/g, '</strong>$1')
      .replace(/^(\s|<br>)+|(\s|<br>)+$/g, '');
  }

  const zonderVet = html => html.replace(/<\/?(strong|em)>/g, '');

  function isVet(el) {
    const t = tekstVan(el);
    if (!t || t.length > 140) return false;
    const vet = [...el.querySelectorAll('strong, b')].map(tekstVan).join('').replace(/\s/g, '');
    return vet.length >= t.replace(/\s/g, '').length - 1;
  }

  function lijstHtml(el) {
    const tag = el.tagName.toLowerCase();
    const regels = [];
    const loop = lijst => [...lijst.children].filter(li => li.tagName === 'LI').forEach(li => {
      const t = inline(li);
      if (t) regels.push(t);
      li.querySelectorAll(':scope > ul, :scope > ol').forEach(loop); // geneste punten worden gewone punten
    });
    loop(el);
    return regels.length ? `<${tag}>${regels.map(r => `<li>${r}</li>`).join('')}</${tag}>` : '';
  }

  function tabelHtml(el) {
    const rijen = [...el.querySelectorAll('tr')].map(tr => [...tr.children].map(c => inline(c)).filter(Boolean)).filter(r => r.length);
    if (!rijen.length) return '';
    return '<ul>' + rijen.map(r => `<li>${r.length > 1 ? `<strong>${zonderVet(r[0])}</strong>: ${r.slice(1).join(' – ')}` : r[0]}</li>`).join('') + '</ul>';
  }

  function datumUit(t) {
    const s = t.toLowerCase().trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) return iso(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    m = s.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
    if (m) { const maand = MAANDEN.findIndex(n => n.startsWith(m[2].slice(0, 3))); if (maand >= 0) return iso(+m[3], maand + 1, +m[1]); }
    return '';
  }
  const iso = (j, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31) ? `${j}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';

  function onderwerpUit(t) {
    const s = t.toLowerCase();
    for (const [k, namen] of Object.entries(ONDERWERPEN)) if (s === k || namen.some(n => s.includes(n))) return k;
    return '';
  }
  // Geen onderwerp opgegeven: raden aan de hand van de tekst
  function raadOnderwerp(tekst) {
    const s = tekst.toLowerCase();
    const tel = re => (s.match(re) || []).length;
    const scores = {
      verzekeringen: tel(/verzeker|overlijdensrisico|arbeidsongeschikt|woonlasten/g),
      ondernemers: tel(/ondernemer|zzp|zelfstandige|jaarcijfers|eigen bedrijf/g),
      'huidige-hypotheek': tel(/oversluit|rentevast|overwaarde|verduurzam|aflossen|boeterente|huidige hypotheek/g),
      'huis-kopen': tel(/huis kopen|woning kopen|starter|bod |koopsom|eerste huis|maximale hypotheek|lenen/g),
    };
    const [beste, n] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return n > 0 ? beste : 'huis-kopen';
  }

  // Korte tekst voor de kaart en voor Google: hele zinnen tot ongeveer `max` tekens
  function kort(tekst, max) {
    if (tekst.length <= max) return tekst;
    const zinnen = tekst.match(/[^.!?]+[.!?]+(\s|$)/g) || [];
    let uit = '';
    for (const z of zinnen) { if ((uit + z).trim().length > max) break; uit += z; }
    if (uit.trim().length >= max * 0.5) return uit.trim();
    const afgekapt = tekst.slice(0, max - 1);
    return afgekapt.slice(0, afgekapt.lastIndexOf(' ')).replace(/[,;:\s]+$/, '') + '…';
  }

  const LABELS = [
    ['metaTitel', /^(titel voor google|google[- ]?titel|seo[- ]?titel|meta[- ]?tit(el|le))\s*[:：]\s*/i],
    ['metaOmschrijving', /^(omschrijving voor google|google[- ]?omschrijving|seo[- ]?omschrijving|meta[- ]?(omschrijving|description|beschrijving))\s*[:：]\s*/i],
    ['samenvatting', /^samenvatting\s*[:：]\s*/i],
    ['onderwerp', /^(onderwerp|categorie|rubriek)\s*[:：]\s*/i],
    ['datum', /^(datum|publicatiedatum|publiceren op|plannen op|inplannen op|online op|live op)\s*[:：]\s*/i],
    ['titel', /^titel\s*[:：]\s*/i],
  ];
  const FAQKOP = /^(veel ?gestelde vragen|faq'?s?\b|vragen en antwoorden|vraag en antwoord)/i;

  function structureer(html) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    let blokken = [];
    let foto = null;
    const pakFoto = img => {
      const src = img.getAttribute('src') || '';
      if (!foto && /^data:image\/(jpeg|jpg|png|webp)/i.test(src)) foto = { url: src, alt: img.getAttribute('alt') || '' };
      img.remove();
    };
    const verzamel = node => {
      for (const el of [...node.children]) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'img') { pakFoto(el); continue; }
        el.querySelectorAll('img').forEach(pakFoto);
        if (/^h[1-6]$/.test(tag)) blokken.push({ soort: 'kop', niveau: +tag[1], el });
        else if (tag === 'p') blokken.push({ soort: 'p', el });
        else if (tag === 'ul' || tag === 'ol') blokken.push({ soort: 'lijst', el });
        else if (tag === 'table') blokken.push({ soort: 'tabel', el });
        else if (tag === 'blockquote') blokken.push({ soort: 'citaat', el });
        else if (['div', 'section', 'article', 'main', 'body', 'center'].includes(tag)) verzamel(el);
        else if (tekstVan(el)) blokken.push({ soort: 'p', el }); // losse tekst zonder alinea
      }
    };
    verzamel(doc.body);
    blokken = blokken.filter(b => tekstVan(b.el));

    // Regels met instellingen ("Titel voor Google: ...") eruit halen
    const instellingen = {};
    blokken = blokken.filter(b => {
      if (b.soort !== 'p') return true;
      const t = tekstVan(b.el);
      if (t.length > 400) return true;
      for (const [k, re] of LABELS) if (re.test(t)) { instellingen[k] = t.replace(re, '').trim(); return false; }
      return true;
    });

    // Titel
    let titel = instellingen.titel || '';
    if (!titel) {
      let i = blokken.findIndex(b => b.soort === 'kop' && b.niveau === 1);
      if (i < 0) i = blokken.findIndex(b => b.soort === 'kop');
      if (i < 0 && blokken[0]?.soort === 'p' && tekstVan(blokken[0].el).length < 160) i = 0;
      if (i >= 0) { titel = tekstVan(blokken[i].el); blokken.splice(i, 1); }
    }

    // Geen kopstijlen gebruikt? Dan zijn korte, helemaal vetgedrukte regels de tussenkoppen
    if (!blokken.some(b => b.soort === 'kop')) {
      blokken.forEach(b => {
        if (b.soort === 'p' && isVet(b.el) && !/[.:,;]$/.test(tekstVan(b.el))) { b.soort = 'kop'; b.niveau = 2; }
      });
    }

    // Veelgestelde vragen
    const faq = [];
    const fi = blokken.findIndex(b => b.soort === 'kop' && FAQKOP.test(tekstVan(b.el)));
    if (fi >= 0) {
      const faqNiveau = blokken[fi].niveau;
      let eind = blokken.length;
      for (let j = fi + 1; j < blokken.length; j++) {
        const b = blokken[j];
        if (b.soort === 'kop' && b.niveau <= faqNiveau && !/\?\s*$/.test(tekstVan(b.el))) { eind = j; break; }
      }
      const bereik = blokken.slice(fi + 1, eind);
      const opgemaakt = bereik.some(b => b.soort === 'kop' || (b.soort === 'p' && isVet(b.el)));
      const isVraag = b => b.soort === 'kop' || (b.soort === 'p' && (opgemaakt
        ? isVet(b.el)
        : /\?\s*$/.test(tekstVan(b.el)) && tekstVan(b.el).length < 200));
      for (const b of bereik) {
        if (isVraag(b)) faq.push({ vraag: zonderVet(inline(b.el)).replace(/^(vraag|v|q)\s*[:.]\s*/i, ''), delen: [] });
        else if (faq.length) {
          let deel = b.soort === 'lijst' ? [...b.el.querySelectorAll('li')].map(li => '• ' + inline(li)).join('<br>') : inline(b.el);
          if (!faq.at(-1).delen.length) deel = deel.replace(/^(antwoord|a)\s*[:.]\s*/i, '');
          faq.at(-1).delen.push(deel);
        }
      }
      blokken.splice(fi, eind - fi);
    }
    const vragen = faq.map(v => ({ vraag: v.vraag, antwoord: v.delen.filter(Boolean).join('<br><br>') })).filter(v => v.vraag && v.antwoord);

    // Inleiding: de eerste alinea vóór de eerste tussenkop
    let inleiding = '';
    const eersteKop = blokken.findIndex(b => b.soort === 'kop');
    const ii = blokken.findIndex(b => b.soort === 'p');
    if (ii >= 0 && (eersteKop < 0 || ii < eersteKop)) { inleiding = inline(blokken[ii].el); blokken.splice(ii, 1); }

    // Tussenkoppen: de grootste kopstijl wordt h2, de rest h3
    const niveaus = [...new Set(blokken.filter(b => b.soort === 'kop').map(b => b.niveau))].sort();
    const inhoud = blokken.map(b => {
      if (b.soort === 'kop') { const h = b.niveau === niveaus[0] ? 'h2' : 'h3'; return `<${h}>${zonderVet(inline(b.el))}</${h}>`; }
      if (b.soort === 'lijst') return lijstHtml(b.el);
      if (b.soort === 'tabel') return tabelHtml(b.el);
      if (b.soort === 'citaat') return `<blockquote>${inline(b.el)}</blockquote>`;
      return `<p>${inline(b.el)}</p>`;
    }).filter(h => !/^<(p|h2|h3|blockquote)><\/\1>$/.test(h)).join('');

    const alleTekst = [titel, kaal(inleiding), kaal(inhoud), ...vragen.map(v => kaal(v.vraag + ' ' + v.antwoord))].join(' ');
    const woorden = alleTekst.split(/\s+/).filter(Boolean).length;
    const minuten = Math.max(1, Math.round(woorden / 200));
    const samenvatting = instellingen.samenvatting || kort(kaal(inleiding) || kaal(inhoud), 200);
    const metaTitel = instellingen.metaTitel || (titel.length <= 44 ? `${titel} | Hypotheekhaven` : titel);
    const metaOmschrijving = instellingen.metaOmschrijving || kort(kaal(inleiding) || samenvatting, 155);

    const waarschuwingen = [];
    if (!titel) waarschuwingen.push('Geen titel gevonden: vul hem hieronder in.');
    if (!inleiding) waarschuwingen.push('Geen inleiding gevonden (een alinea direct onder de titel). Je kunt hem straks op de pagina schrijven.');
    if (!niveaus.length) waarschuwingen.push('Geen tussenkoppen gevonden. Geef koppen in je document de stijl "Kop 2", of maak ze vetgedrukt.');
    if (fi >= 0 && !vragen.length) waarschuwingen.push('Er staat een kop "Veelgestelde vragen", maar er zijn geen vragen met een antwoord herkend. Maak de vragen vetgedrukt of geef ze een kopstijl.');

    return {
      titel, inleiding, inhoud, faq: vragen, samenvatting, leestijd: `${minuten} ${minuten === 1 ? 'minuut' : 'minuten'} lezen`,
      meta: { title: metaTitel, description: metaOmschrijving },
      categorie: (instellingen.onderwerp && onderwerpUit(instellingen.onderwerp)) || raadOnderwerp(alleTekst),
      datum: instellingen.datum ? datumUit(instellingen.datum) : '',
      foto, woorden, tussenkoppen: blokken.filter(b => b.soort === 'kop' && b.niveau === niveaus[0]).length, waarschuwingen,
    };
  }

  window.hhDocument = { leesBestand, leesKlembord, structureer };
})();
