// Achtergrondfoto's onder de vouw: pas laden vlak voordat ze in beeld komen (zie lib/content.ts)
const fotos = document.querySelectorAll('[data-foto]');
if (fotos.length) {
  const laad = el => {
    const url = v => `url('${v}')`;
    if (el.hasAttribute('data-ef')) el.style.setProperty('--foto', url(el.dataset.foto));
    else { el.style.setProperty('--bg-l', url(el.dataset.foto)); el.style.setProperty('--bg-m', url(el.dataset.fotoM || el.dataset.foto)); }
    el.removeAttribute('data-foto');
  };
  // Volgende dia's van de hero (data-foto-later) pas na het load-event, zodat de eerste foto (LCP) voorgaat
  const later = [...fotos].filter(el => el.hasAttribute('data-foto-later'));
  const nu = [...fotos].filter(el => !el.hasAttribute('data-foto-later'));
  if (later.length) {
    const laadLater = () => setTimeout(() => later.forEach(el => el.hasAttribute('data-foto') && laad(el)), 300);
    if (document.readyState === 'complete') laadLater(); else addEventListener('load', laadLater, { once: true });
  }
  if (!('IntersectionObserver' in window)) nu.forEach(laad);
  else {
    const kijker = new IntersectionObserver(items => items.forEach(i => { if (i.isIntersecting) { kijker.unobserve(i.target); laad(i.target); } }), { rootMargin: '100% 0px' });
    nu.forEach(el => kijker.observe(el));
  }
}

// Alles hieronder in losse taakjes met een pauze ertussen: de browser kan dan tussendoor
// tekenen en reageren, in plaats van één lange taak bij het laden. Het menu gaat voor.
const taken = [];
const taak = fn => taken.push(fn);

// ---- menubalk ----
taak(() => {
  // Menubalk: na de hero de schaduw en de kennismakingsknop tonen
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.hero');
  if (nav && hero) {
    const updateNav = () => {
      const voorbij = hero.getBoundingClientRect().bottom < nav.offsetHeight + 24;
      nav.classList.toggle('is-scrolled', voorbij);
    };
    window.addEventListener('scroll', updateNav, { passive: true });
    updateNav();
  }
});

// ---- rekentools ----
taak(() => {
  // Rekentools in de menubalk: uitklapmenu openen met klik of toetsenbord (hover gaat via CSS), sluiten met Escape of klik ernaast
  document.querySelectorAll('.nav-tools').forEach((tools) => {
    const knop = tools.querySelector('.nav-tools-knop');
    const zet = (open) => { tools.classList.toggle('is-open', open); knop.setAttribute('aria-expanded', String(open)); };
    knop.addEventListener('click', () => zet(!tools.classList.contains('is-open')));
    document.addEventListener('click', (e) => { if (!tools.contains(e.target)) zet(false); });
    tools.addEventListener('keydown', (e) => { if (e.key === 'Escape') { zet(false); knop.focus(); } });
    tools.addEventListener('focusout', (e) => { if (!tools.contains(e.relatedTarget)) zet(false); });
  });
});

// ---- hamburger ----
taak(() => {
  // Hamburgermenu (tot en met tablet): bouwt een menu over het hele scherm uit de bestaande menubalk,
  // zodat paden op elke pagina kloppen (ook in /blog/)
  (function () {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'menu-knop';
    knop.setAttribute('aria-label', 'Menu openen');
    knop.setAttribute('aria-expanded', 'false');
    knop.setAttribute('aria-controls', 'menu-paneel');
    knop.innerHTML = '<span aria-hidden="true"></span>';

    const items = [...nav.children].map((el) => {
      if (el.classList.contains('nav-tools')) {
        const sub = [...el.querySelectorAll('a.nav-tool')].map((a) =>
          `<li><a href="${a.getAttribute('href')}"${a.getAttribute('aria-current') ? ' aria-current="page"' : ''}>${a.querySelector('strong').textContent}</a></li>`).join('');
        return `<li><span class="menu-sub-kop">Rekentools</span><ul class="menu-sub">${sub}</ul></li>`;
      }
      if (el.classList.contains('nav-cta')) return '';
      return `<li><a href="${el.getAttribute('href')}"${el.getAttribute('aria-current') ? ' aria-current="page"' : ''}>${el.textContent}</a></li>`;
    }).join('');
    const cta = nav.querySelector('.nav-cta');
    const paneel = document.createElement('div');
    paneel.className = 'menu-paneel';
    paneel.id = 'menu-paneel';
    paneel.setAttribute('role', 'dialog');
    paneel.setAttribute('aria-label', 'Menu');
    paneel.innerHTML = `<ul class="menu-links">${items}</ul>
      <div class="menu-voet">
        <a href="${cta ? cta.getAttribute('href') : '/contact#formulier'}" class="btn btn-dark">${cta ? cta.textContent : ''} <i class="arrow"></i></a>
        <a href="tel:+31655767819" class="menu-bel">${document.getElementById('menu-voet-tekst')?.innerHTML ?? ''}</a>
      </div>`;
    document.body.append(paneel, knop);

    const zet = (open) => {
      document.documentElement.classList.toggle('menu-open', open);
      knop.setAttribute('aria-expanded', String(open));
      knop.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
    };
    knop.addEventListener('click', () => zet(!document.documentElement.classList.contains('menu-open')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') zet(false); });
    // Na het kiezen van een link (ook een anker op dezelfde pagina) het menu sluiten
    paneel.addEventListener('click', (e) => { if (e.target.closest('a')) zet(false); });
    window.matchMedia('(min-width: 1025px)').addEventListener('change', (e) => { if (e.matches) zet(false); });
  })();
});

// ---- reviewbalk ----
taak(() => {
  // Reviewbalkje bovenaan (alleen zichtbaar op telefoon en tablet, zie styles.css)
  if (document.querySelector('.review-balk')) {
    const zetBalk = () => document.documentElement.classList.toggle('voorbij-balk', window.scrollY > 30);
    window.addEventListener('scroll', zetBalk, { passive: true });
    zetBalk();
  }
});

// ---- slideshow ----
taak(() => {
  // Hero background slideshow (fade, 5s per slide)
  const slides = document.querySelectorAll('.hero-slide');
  let current = 0;
  setInterval(() => {
    slides[current].classList.remove('is-active');
    current = (current + 1) % slides.length;
    slides[current].classList.add('is-active');
  }, 5000);
});

// ---- banken ----
taak(() => {
  // Banklogo-balk in de hero: om de 4 s schuift elk logo omhoog weg en komt een
  // nieuw logo van onderen binnen, eerst rechts en dan slot voor slot naar links.
  // Per logo: [bestand, naam, verhouding van het logo zelf (b/h), deel van de breedte dat het logo vult]
  // zodat elk logo even groot oogt, ook als het bestand veel lege ruimte heeft
  const bankLogos = [
    ['abn-amro-logo-new-colors-svg-1.webp', 'ABN AMRO', 4.06, .98], ['ing-group-n-v-logo-svg.webp', 'ING', 3.92, 1],
    ['rabo-logo.webp', 'Rabobank', 5.79, .88], ['aegon.svg', 'Aegon', 3.7, 1], ['achmea.svg', 'Achmea', 5.41, 1],
    ['asn.svg', 'ASN Bank', 5.38, .99], ['knab.svg', 'Knab', 3.08, 1], ['lloyds.svg', 'Lloyds Bank', 5, 1],
    ['nibc.svg', 'NIBC', 4.83, .94], ['regiobank.svg', 'RegioBank', 4.24, .76], ['triodos.svg', 'Triodos Bank', 3.25, 1],
    ['vanlanschot.svg', 'Van Lanschot', 4.71, 1], ['volksbank.svg', 'de Volksbank', 7.94, .99]
  ];
  const bankSlots = document.querySelector('.hero-banks-slots');
  if (bankSlots) {
    let bankPointer = 0;
    const makeBankImg = () => {
      const [file, alt, verhouding, vulling] = bankLogos[bankPointer++ % bankLogos.length];
      const img = new Image();
      img.src = `/img/banken/${file}`;
      img.alt = alt;
      // Gelijk oppervlak per logo: breedte = wortel(oppervlak x verhouding), begrensd tot het vak
      const vak = bankSlots.querySelector('.hero-banks-slot')?.offsetWidth || (window.innerWidth <= 767 ? 100 : 120);
      const oppervlak = 2200 * Math.min(1, vak / 120) ** 2;
      const breedte = Math.min(vak - 4, Math.sqrt(oppervlak * verhouding), 34 * verhouding);
      img.style.width = (breedte / vulling).toFixed(1) + 'px';
      return img;
    };
    for (let i = 0; i < 5; i++) {
      const slot = document.createElement('div');
      slot.className = 'hero-banks-slot';
      slot.append(makeBankImg());
      bankSlots.append(slot);
    }
    const rotateSlot = slot => {
      // Altijd maar één logo per vak: achtergebleven logo's van een vorige ronde direct weg
      const imgs = slot.querySelectorAll('img');
      for (let n = 0; n < imgs.length - 1; n++) imgs[n].remove();
      const old = imgs[imgs.length - 1];
      const next = makeBankImg();
      next.classList.add('is-in');
      slot.append(next);
      next.offsetHeight; // reflow, zodat de startpositie eerst geldt
      old.classList.add('is-out');
      next.classList.remove('is-in');
      setTimeout(() => old.remove(), 700);
    };
    // Niet wisselen als het tabblad op de achtergrond staat: de browser vertraagt dan
    // timers en animaties, waardoor logo's over elkaar heen bleven staan
    setInterval(() => {
      if (document.hidden) return;
      const slots = [...bankSlots.children].filter(s => s.offsetParent !== null);
      slots.reverse().forEach((slot, i) => setTimeout(() => rotateSlot(slot), i * 160));
    }, 4000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      bankSlots.querySelectorAll('.hero-banks-slot').forEach(slot => {
        const imgs = slot.querySelectorAll('img');
        for (let n = 0; n < imgs.length - 1; n++) imgs[n].remove();
        imgs[imgs.length - 1].classList.remove('is-in', 'is-out');
      });
    });
  }
});

// ---- cursor ----
taak(() => {
  // Rondje dat met de muis meebeweegt boven de dienstenkaarten
  const kanHoveren = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hulpCursor = document.querySelector('.hulp-cursor');
  if (hulpCursor && kanHoveren) {
    const bol = hulpCursor.querySelector('.hulp-cursor-bol');
    let muisX = 0, muisY = 0, gepland = false;
    document.addEventListener('mousemove', e => {
      muisX = e.clientX; muisY = e.clientY;
      // Boven een dienstenkaart: "Lees meer", tijdens slepen "Sleep"
      const doel = e.target.closest('.dienst');
      hulpCursor.classList.toggle('is-zichtbaar', !!doel);
      if (doel) bol.textContent = doel.closest('.is-slepen') ? '← Sleep →' : 'Lees meer';
      if (gepland) return;
      gepland = true;
      requestAnimationFrame(() => {
        hulpCursor.style.transform = `translate3d(${muisX}px, ${muisY}px, 0)`;
        gepland = false;
      });
    }, { passive: true });
    document.addEventListener('mouseleave', () => hulpCursor.classList.remove('is-zichtbaar'));
  }
});

// ---- tijdlijn ----
taak(() => {
  // Zo werkt het: de lijn vult zich mee met scrollen, stappen komen in beeld en hun stipje kleurt
  const tijdlijn = document.querySelector('.tijdlijn');
  if (tijdlijn) {
    const tStappen = tijdlijn.querySelectorAll('.tijdlijn-stap');
    const updateTijdlijn = () => {
      const r = tijdlijn.getBoundingClientRect();
      const midden = window.innerHeight * .6;
      const voortgang = Math.min(1, Math.max(0, (midden - r.top) / r.height));
      tijdlijn.style.setProperty('--voortgang', (voortgang * 100).toFixed(2) + '%');
      tStappen.forEach(stap => {
        const s = stap.getBoundingClientRect();
        stap.classList.toggle('is-bereikt', s.top + s.height / 2 < midden);
        if (s.top < window.innerHeight * .85) stap.classList.add('is-zichtbaar');
      });
    };
    window.addEventListener('scroll', updateTijdlijn, { passive: true });
    window.addEventListener('resize', updateTijdlijn);
    updateTijdlijn();
  }
});

// ---- diensten ----
taak(() => {
  // Onze diensten: pijlen schuiven de fotokaarten
  const dienstenTrack = document.querySelector('.diensten-track');
  if (dienstenTrack) {
    const knoppen = document.querySelectorAll('.slider-knop');
    const stap = () => dienstenTrack.querySelector('.dienst').offsetWidth + 30;
    const updateKnoppen = () => {
      knoppen[0].disabled = dienstenTrack.scrollLeft < 5;
      knoppen[1].disabled = dienstenTrack.scrollLeft + dienstenTrack.clientWidth > dienstenTrack.scrollWidth - 5;
      // Teller onder de kaarten (zichtbaar op mobiel): welke kaart staat vooraan
      const nr = document.querySelector('[data-diensten-nr]');
      if (nr) {
        const aantal = dienstenTrack.querySelectorAll('.dienst').length;
        document.querySelector('[data-diensten-totaal]').textContent = aantal;
        nr.textContent = knoppen[1].disabled ? aantal : Math.min(aantal, Math.round(dienstenTrack.scrollLeft / stap()) + 1);
      }
    };
    knoppen.forEach(k => k.addEventListener('click', () => dienstenTrack.scrollBy({ left: stap() * Number(k.dataset.dir), behavior: 'smooth' })));
    dienstenTrack.addEventListener('scroll', updateKnoppen, { passive: true });

    // Automatisch doorschuiven om de 5 seconden; aan het eind terug naar het begin.
    // Pauzeert bij hover, tijdens slepen en als de sectie niet in beeld is.
    let dienstenPauze = false, dienstenInBeeld = false;
    const dienstenSectie = dienstenTrack.closest('.diensten');
    dienstenSectie.addEventListener('mouseenter', () => { dienstenPauze = true; });
    dienstenSectie.addEventListener('mouseleave', () => { dienstenPauze = false; });
    dienstenSectie.addEventListener('focusin', () => { dienstenPauze = true; });
    dienstenSectie.addEventListener('focusout', () => { dienstenPauze = false; });
    new IntersectionObserver(([e]) => { dienstenInBeeld = e.isIntersecting; }, { threshold: .3 }).observe(dienstenSectie);
    // Niet op touchschermen: daar zou de slider bewegen terwijl je de pagina scrolt
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !window.matchMedia('(hover: none)').matches) {
      setInterval(() => {
        if (dienstenPauze || !dienstenInBeeld || document.hidden || dienstenTrack.classList.contains('is-slepen')) return;
        const aanEind = dienstenTrack.scrollLeft > dienstenTrack.scrollWidth - dienstenTrack.clientWidth - 5;
        dienstenTrack.scrollTo({ left: aanEind ? 0 : dienstenTrack.scrollLeft + stap(), behavior: 'smooth' });
      }, 5000);
    }

    // Swipen met de muis: kaarten vastpakken en slepen, met wat doorrollen bij loslaten
    let sleept = false, gesleept = false, startX = 0, startScroll = 0, laatsteX = 0, snelheid = 0, laatsteT = 0;
    dienstenTrack.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return; // touch swipet al vanzelf
      sleept = true; gesleept = false;
      startX = laatsteX = e.clientX; startScroll = dienstenTrack.scrollLeft; laatsteT = performance.now(); snelheid = 0;
      dienstenTrack.classList.add('is-slepen');
    });
    window.addEventListener('pointermove', e => {
      if (!sleept) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 5) gesleept = true;
      dienstenTrack.scrollLeft = startScroll - dx;
      const nu = performance.now();
      snelheid = (e.clientX - laatsteX) / Math.max(1, nu - laatsteT);
      laatsteX = e.clientX; laatsteT = nu;
    });
    window.addEventListener('pointerup', () => {
      if (!sleept) return;
      sleept = false;
      dienstenTrack.classList.remove('is-slepen');
      // doorrollen in de richting van de beweging, daarna klikt hij vast op een kaart
      dienstenTrack.scrollBy({ left: -snelheid * 220, behavior: 'smooth' });
    });
    // Swipen met de vinger (touch-events, betrouwbaar op iPhone en Android).
    // De pagina scrolt gewoon verticaal; pas bij een duidelijk horizontale beweging volgen de kaarten de vinger,
    // en bij loslaten klikt de slider per kaart vast.
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      dienstenTrack.classList.add('is-touch');
      let tStart = null, tRichting = null, tScroll = 0, tT = 0, tX = 0;
      dienstenTrack.addEventListener('touchstart', e => {
        const t = e.touches[0];
        tStart = { x: t.clientX, y: t.clientY }; tX = t.clientX; tRichting = null; gesleept = false;
        tScroll = dienstenTrack.scrollLeft; tT = performance.now();
      }, { passive: true });
      dienstenTrack.addEventListener('touchmove', e => {
        if (!tStart) return;
        const t = e.touches[0], dx = t.clientX - tStart.x, dy = t.clientY - tStart.y;
        tX = t.clientX;
        if (!tRichting) {
          if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { tRichting = 'verticaal'; return; }
          if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { tRichting = 'horizontaal'; gesleept = true; }
          else return;
        }
        if (tRichting !== 'horizontaal') return;
        e.preventDefault(); // de pagina staat stil zolang je opzij veegt
        dienstenTrack.scrollLeft = tScroll - dx;
      }, { passive: false });
      dienstenTrack.addEventListener('touchend', () => {
        if (tStart && tRichting === 'horizontaal') {
          const dx = tX - tStart.x, snel = Math.abs(dx) / Math.max(1, performance.now() - tT) > .3;
          const beginKaart = Math.round(tScroll / stap());
          const verder = (snel && Math.abs(dx) > 30) || Math.abs(dx) > stap() * .25 ? (dx < 0 ? 1 : -1) : 0;
          const max = dienstenTrack.scrollWidth - dienstenTrack.clientWidth;
          dienstenTrack.scrollTo({ left: Math.min(max, Math.max(0, (beginKaart + verder) * stap())), behavior: 'smooth' });
        }
        tStart = null;
      });
      dienstenTrack.addEventListener('touchcancel', () => { tStart = null; });
    }

    // Na slepen geen klik doorgeven aan de kaart
    dienstenTrack.addEventListener('click', e => { if (gesleept) { e.preventDefault(); gesleept = false; } }, true);
    dienstenTrack.addEventListener('dragstart', e => e.preventDefault());
    window.addEventListener('resize', updateKnoppen);
    updateKnoppen();
  }
});

// ---- wiel ----
taak(() => {
  // Daarom Hypotheekhaven: wiel draait vanzelf door, pauzeert bij hover, hover of klik draait naar dat punt
  const wiel = document.querySelector('.wiel');
  if (wiel) {
    const wielItems = [...wiel.querySelectorAll('.wiel-item')];
    const wielTekst = wiel.querySelector('.wiel-tekst');
    let actief = 0, pauze = false;
    let getoond = -1, tekstTimer;
    // Licht een punt op (zonder te draaien) en toont de bijbehorende uitleg
    const toon = i => {
      if (i === getoond) return;
      getoond = i;
      wielItems.forEach((it, k) => {
        it.classList.toggle('is-actief', k === i);
        it.dataset.afstand = afstand(k);
      });
      clearTimeout(tekstTimer);
      wielTekst.classList.add('is-wissel');
      tekstTimer = setTimeout(() => { wielTekst.textContent = wielItems[i].dataset.tekst; wielTekst.classList.remove('is-wissel'); }, 250);
    };
    // Oneindig: elk punt krijgt een plek t.o.v. het midden (-3 .. 2). Wat onderaan wegvalt,
    // springt buiten beeld naar boven (zonder animatie), zodat er altijd één in het midden staat.
    const n = wielItems.length;
    const rijen = wielItems.map(it => it.closest('li'));
    const plekVan = k => { let p = ((k - actief) % n + n) % n; if (p >= n / 2) p -= n; return p; }; // -3..2: wat boven wegschuift vervaagt, en komt onderaan zacht terug
    const vorigePlek = new Array(n).fill(null);
    const plaats = () => rijen.forEach((li, k) => {
      const p = plekVan(k);
      const sprong = vorigePlek[k] !== null && Math.abs(p - vorigePlek[k]) > 1;
      li.classList.toggle('is-sprong', sprong);
      li.style.setProperty('--plek', p);
      vorigePlek[k] = p;
    });
    const afstand = k => Math.min(Math.abs(plekVan(k)), 3);
    // Draait het wiel zodat punt i in het midden staat
    const zet = i => {
      actief = (i + n) % n;
      plaats();
      getoond = -1;
      toon(actief);
    };
    // Met de muis over een titel draait het wiel ernaartoe. Tijdens het draaien schuiven er andere titels
    // onder de muis door; die negeren we even, anders draait het wiel steeds verder.
    let draaitTot = 0;
    wielItems.forEach((it, k) => {
      it.addEventListener('click', () => zet(k));
      it.addEventListener('mouseenter', () => {
        if (Date.now() < draaitTot || k === actief) return;
        draaitTot = Date.now() + 850; // iets langer dan de draai-animatie (.8s)
        zet(k);
      });
    });
    wiel.querySelector('.wiel-venster').addEventListener('mouseleave', () => toon(actief));
    wiel.addEventListener('mouseenter', () => { pauze = true; });
    wiel.addEventListener('mouseleave', () => { pauze = false; });
    zet(0);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInterval(() => { if (!pauze && !document.hidden) zet(actief + 1); }, 3500);
    }
  }
});

// ---- kleurzin ----
taak(() => {
  // Zo werkt het: de tweede kopregel kleurt woord voor woord van grijs naar donker tijdens het scrollen
  // Bij data-woorden worden de woorden hier automatisch in spans gezet (ook binnen <b>)
  const splitsWoorden = el => [...el.childNodes].forEach(n => {
    if (n.nodeType === 1) return splitsWoorden(n);
    if (n.nodeType !== 3 || !n.textContent.trim()) return;
    const frag = document.createDocumentFragment();
    n.textContent.split(/(\s+)/).forEach(d => {
      if (!d) return;
      if (/^\s+$/.test(d)) return frag.append(d);
      const s = document.createElement('span');
      s.textContent = d;
      frag.append(s);
    });
    n.replaceWith(frag);
  });
  document.querySelectorAll('.kleur-zin').forEach(zin => {
    if (zin.hasAttribute('data-woorden')) splitsWoorden(zin);
    const woorden = [...zin.querySelectorAll('span')];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      woorden.forEach(w => w.classList.add('is-gekleurd'));
      return;
    }
    const update = () => {
      const r = zin.getBoundingClientRect(), vh = window.innerHeight;
      // begint als de zin op 85% van het scherm staat, klaar op 45%
      const p = Math.min(1, Math.max(0, (vh * .85 - r.top) / (vh * .4)));
      woorden.forEach((w, i) => w.classList.toggle('is-gekleurd', i < Math.round(p * woorden.length)));
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  });
});

// ---- verhaal ----
taak(() => {
  // Mijn manier van adviseren: foto groeit tot schermvullend, blijft staan, en wisselt met een dip naar zwart.
  // Volgorde: tekst eruit, foto snel naar zwart, nieuwe tekst eerst, foto rustig op, labels als laatste.
  const verhaalPin = document.querySelector('.verhaal-pin');
  if (verhaalPin) {
    const podium = verhaalPin.querySelector('.verhaal-podium');
    const vScenes = [...podium.querySelectorAll('.verhaal-scene')];
    const rustig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let huidige = 0, t1, t2;
    const dim = (sc, waarde, overgang) => {
      const laag = sc.querySelector('.verhaal-dim');
      laag.style.transition = overgang ? 'opacity ' + overgang : 'none';
      laag.style.opacity = waarde;
    };
    const wissel = i => {
      if (i === huidige) return;
      const oud = vScenes[huidige], nieuw = vScenes[i];
      huidige = i;
      clearTimeout(t1); clearTimeout(t2);
      vScenes.forEach(sc => { if (sc !== oud && sc !== nieuw) { sc.classList.remove('is-actief', 'is-zichtbaar'); dim(sc, 0); } });
      oud.classList.remove('is-zichtbaar');          // 1. tekst en labels snel weg
      if (rustig) { oud.classList.remove('is-actief'); dim(oud, 0); nieuw.classList.add('is-actief', 'is-zichtbaar'); return; }
      dim(oud, 1, '.18s ease-in');                   // 2. foto snel naar zwart
      t1 = setTimeout(() => {
        oud.classList.remove('is-actief'); dim(oud, 0);
        dim(nieuw, 1);                               // nieuwe foto staat klaar, nog helemaal zwart
        nieuw.classList.add('is-actief', 'is-zichtbaar'); // 3. nieuwe tekst verschijnt al op het zwart
        t2 = setTimeout(() => dim(nieuw, 0, '.6s cubic-bezier(.22, 1, .36, 1)'), 120); // 4. foto rustig op
      }, 190);
    };
    // Op mobiel zijn het gewone kaarten onder elkaar (zie styles.css): dan niets aanpassen tijdens het scrollen,
    // anders tekent de browser de foto's steeds opnieuw en flikkert de eerste foto
    const mobiel = window.matchMedia('(max-width: 767px)');
    const updateVerhaal = () => {
      if (mobiel.matches) {
        podium.style.removeProperty('--inset-y'); podium.style.removeProperty('--inset-x');
        vScenes.forEach(sc => { sc.classList.add('is-actief', 'is-zichtbaar'); const d = sc.querySelector('.verhaal-dim'); d.style.transition = 'none'; d.style.opacity = 0; });
        return;
      }
      const vh = window.innerHeight;
      const r = verhaalPin.getBoundingClientRect();
      // Aankomen: van ingesprongen (r.top = vh) naar schermvullend (r.top = 0)
      const groei = Math.min(1, Math.max(0, 1 - r.top / vh));
      const zacht = 1 - Math.pow(1 - groei, 2);
      podium.style.setProperty('--inset-y', (12 * (1 - zacht)).toFixed(2) + 'vh');
      podium.style.setProperty('--inset-x', (8 * (1 - zacht)).toFixed(2) + 'vw');
      if (groei > .85 && huidige === 0) vScenes[0].classList.add('is-zichtbaar');
      // Vastgepind: elke foto krijgt een eigen stuk scrollen
      const totaal = verhaalPin.offsetHeight - vh;
      const stuk = totaal / vScenes.length;
      wissel(Math.min(vScenes.length - 1, Math.max(0, Math.floor((-r.top + stuk * .15) / stuk))));
    };
    window.addEventListener('scroll', updateVerhaal, { passive: true });
    window.addEventListener('resize', updateVerhaal);
    updateVerhaal();
  }
});

// ---- reviews ----
taak(() => {
  // Reviews: pijlen schuiven per kaart, voortgangslijn en teller lopen mee
  const reviewsTrack = document.querySelector('.reviews-track');
  if (reviewsTrack) {
    const kaarten = reviewsTrack.querySelectorAll('.review');
    // Alleen de bediening binnen de reviewsectie (de banners gebruiken dezelfde stijlklassen)
    const reviewsSectie = reviewsTrack.closest('.reviews');
    const pijlen = reviewsSectie.querySelectorAll('.reviews-pijl');
    const teller = reviewsSectie.querySelector('.reviews-teller');
    const balk = reviewsSectie.querySelector('.reviews-voortgang');
    const stap = () => kaarten[0].offsetWidth + parseFloat(getComputedStyle(reviewsTrack).gap);
    const updateReviews = () => {
      const max = reviewsTrack.scrollWidth - reviewsTrack.clientWidth;
      const zichtbaar = Math.max(1, Math.round(reviewsTrack.clientWidth / stap()));
      const eerste = Math.round(reviewsTrack.scrollLeft / stap());
      const laatste = Math.min(kaarten.length, eerste + zichtbaar);
      teller.textContent = laatste + '/' + kaarten.length;
      balk.style.setProperty('--voortgang', (laatste / kaarten.length * 100).toFixed(1) + '%');
      pijlen[0].disabled = reviewsTrack.scrollLeft < 5;
      pijlen[1].disabled = reviewsTrack.scrollLeft > max - 5;
    };
    pijlen.forEach(p => p.addEventListener('click', () => reviewsTrack.scrollBy({ left: stap() * Number(p.dataset.dir), behavior: 'smooth' })));
    reviewsTrack.addEventListener('scroll', updateReviews, { passive: true });

    // Automatisch doorschuiven om de 5 seconden; aan het eind terug naar het begin.
    // Pauzeert bij hover of focus, en als de sectie niet in beeld is.
    let reviewsPauze = false, reviewsInBeeld = false;
    reviewsSectie.addEventListener('mouseenter', () => { reviewsPauze = true; });
    reviewsSectie.addEventListener('mouseleave', () => { reviewsPauze = false; });
    reviewsSectie.addEventListener('focusin', () => { reviewsPauze = true; });
    reviewsSectie.addEventListener('focusout', () => { reviewsPauze = false; });
    new IntersectionObserver(([e]) => { reviewsInBeeld = e.isIntersecting; }, { threshold: .3 }).observe(reviewsSectie);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setInterval(() => {
        if (reviewsPauze || !reviewsInBeeld || document.hidden) return;
        const aanEind = reviewsTrack.scrollLeft > reviewsTrack.scrollWidth - reviewsTrack.clientWidth - 5;
        reviewsTrack.scrollTo({ left: aanEind ? 0 : reviewsTrack.scrollLeft + stap(), behavior: 'smooth' });
      }, 5000);
    }
    window.addEventListener('resize', updateReviews);
    updateReviews();
  }
});

// ---- faq ----
taak(() => {
  // FAQ: keep only one item open
  document.querySelectorAll('.faq details').forEach(d => {
    d.addEventListener('toggle', () => {
      if (d.open) document.querySelectorAll('.faq details[open]').forEach(o => o !== d && (o.open = false));
    });
  });
});

// ---- bankkleur ----
taak(() => {
  // Banklogo's in kleur zodra sectie Onze diensten in beeld komt, weer Inkt-tint bij terugscrollen
  const heroBanks = document.querySelector('.hero-banks');
  const dienstenSectie = document.querySelector('.diensten');
  if (heroBanks && dienstenSectie) {
    const kleurBanks = () => heroBanks.classList.toggle('is-kleur', dienstenSectie.getBoundingClientRect().top < window.innerHeight);
    window.addEventListener('scroll', kleurBanks, { passive: true });
    kleurBanks();
  }
});

// ---- cijfers ----
taak(() => {
  // Over Sabrina: kerncijfers tellen op vanaf 0 zodra ze in beeld komen (25+, 5,0, 9,8, 1).
  // Komma, aantal decimalen en een eventuele "+" worden uit de tekst zelf gehaald.
  const cijfers = document.querySelectorAll('.cijfer');
  if (cijfers.length && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const tel = el => {
      const [, getal, rest] = el.textContent.trim().match(/^([\d,]+)(.*)$/) || [];
      if (!getal) return;
      const decimalen = (getal.split(',')[1] || '').length;
      const doel = parseFloat(getal.replace(',', '.'));
      const duur = 1600, start = performance.now();
      const stap = nu => {
        const t = Math.min(1, (nu - start) / duur);
        const w = doel * (1 - Math.pow(1 - t, 3)); // snel beginnen, rustig uitlopen
        el.textContent = w.toFixed(decimalen).replace('.', ',') + rest;
        if (t < 1) requestAnimationFrame(stap);
      };
      requestAnimationFrame(stap);
    };
    const kijker = new IntersectionObserver(items => items.forEach(item => {
      if (!item.isIntersecting) return;
      kijker.unobserve(item.target);
      tel(item.target);
    }), { threshold: .5 });
    cijfers.forEach(el => kijker.observe(el));
  }
});

const volgende = () => {
  const fn = taken.shift();
  if (!fn) return;
  fn();
  if (taken.length) setTimeout(volgende, 0);
};
volgende();
