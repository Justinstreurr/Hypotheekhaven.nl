/* Contactformulier: controle in het Nederlands, daarna versturen via /api/contact.
   Lukt dat niet (geen verbinding of nog niet ingesteld), dan opent een e-mail naar info@hypotheekhaven.nl. */
(function () {
  const form = document.querySelector('.contactformulier');
  if (!form) return;
  const bevestiging = document.querySelector('.formulier-bevestiging');
  const ONTVANGER = 'info@hypotheekhaven.nl';

  // Komt de bezoeker uit een rekentool ("Bespreek je uitkomst")? Dan staat de samenvatting klaar in het berichtveld.
  try {
    const uitkomst = sessionStorage.getItem('hh-rekentool');
    if (uitkomst && !form.elements.bericht.value.trim()) form.elements.bericht.value = uitkomst;
    sessionStorage.removeItem('hh-rekentool');
  } catch (e) { /* geen opslag beschikbaar: het formulier blijft gewoon leeg */ }

  const meldingen = {
    naam: (el) => (el.value.trim() ? '' : 'Vul je naam in.'),
    email: (el) => {
      const v = el.value.trim();
      if (!v) return 'Vul je e-mailadres in.';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Dit e-mailadres lijkt niet te kloppen. Controleer het even.';
    },
    telefoon: (el) => {
      const v = el.value.trim();
      if (!v) return '';
      return /^[+()\d\s-]{8,}$/.test(v) && v.replace(/\D/g, '').length >= 9 ? '' : 'Dit telefoonnummer lijkt niet te kloppen.';
    },
    onderwerp: (el) => (el.value ? '' : 'Kies waar je bericht over gaat.'),
    bericht: (el) => (el.value.trim() ? '' : 'Schrijf kort waar ik je mee kan helpen.'),
    akkoord: (el) => (el.checked ? '' : 'Vink aan dat je akkoord gaat met de privacyverklaring.')
  };

  function controleer(naam) {
    const el = form.elements[naam];
    const fout = document.getElementById(naam + '-fout');
    const tekst = meldingen[naam](el);
    if (tekst) {
      el.setAttribute('aria-invalid', 'true');
      fout.textContent = tekst;
      fout.hidden = false;
    } else {
      el.removeAttribute('aria-invalid');
      fout.textContent = '';
      fout.hidden = true;
    }
    return !tekst;
  }

  // Na een eerste fout direct meekijken tijdens het typen
  Object.keys(meldingen).forEach((naam) => {
    const el = form.elements[naam];
    const opnieuw = () => { if (el.getAttribute('aria-invalid') === 'true') controleer(naam); };
    el.addEventListener('input', opnieuw);
    el.addEventListener('change', opnieuw);
    el.addEventListener('blur', () => { if (el.type !== 'checkbox' && el.value.trim()) controleer(naam); });
  });

  const toonFout = (tekst) => {
    let p = form.querySelector('.formulier-fout');
    if (!p) {
      p = document.createElement('p');
      p.className = 'veld-fout formulier-fout';
      p.setAttribute('role', 'alert');
      form.querySelector('.formulier-voet').append(p);
    }
    p.textContent = tekst;
  };

  const toonBevestiging = () => {
    if (!bevestiging) return;
    const voornaam = form.elements.naam.value.trim().split(/\s+/)[0];
    const naamVak = bevestiging.querySelector('.bevestiging-naam');
    if (naamVak) naamVak.textContent = voornaam;
    form.hidden = true;
    bevestiging.hidden = false;
    bevestiging.focus();
  };

  const perMail = (w, voorkeur) => {
    const onderwerp = 'Contactformulier: ' + w('onderwerp') + ' (' + w('naam') + ')';
    const body = [
      'Naam: ' + w('naam'),
      'E-mail: ' + w('email'),
      'Telefoon: ' + (w('telefoon') || '-'),
      'Onderwerp: ' + w('onderwerp'),
      'Voorkeur gesprek: ' + voorkeur,
      '',
      'Bericht:',
      w('bericht'),
      '',
      'Akkoord met de privacyverklaring: ja'
    ].join('\n');
    window.location.href = 'mailto:' + ONTVANGER +
      '?subject=' + encodeURIComponent(onderwerp) +
      '&body=' + encodeURIComponent(body);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fouten = Object.keys(meldingen).filter((naam) => !controleer(naam));
    if (fouten.length) {
      form.elements[fouten[0]].focus();
      return;
    }

    const w = (naam) => form.elements[naam].value.trim();
    const voorkeur = (form.querySelector('input[name="voorkeur"]:checked') || {}).value || 'Maakt niet uit';
    const knop = form.querySelector('button[type="submit"]');
    knop.disabled = true;
    try {
      const r = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          naam: w('naam'), email: w('email'), telefoon: w('telefoon'), onderwerp: w('onderwerp'),
          voorkeur, bericht: w('bericht'), akkoord: form.elements.akkoord.checked, website: form.elements.website.value
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!d.ok && r.status !== 429 && r.status !== 400) perMail(w, voorkeur);
      else if (!d.ok) { toonFout(d.fout); knop.disabled = false; return; }
    } catch (fout) {
      perMail(w, voorkeur);
    }
    knop.disabled = false;
    toonBevestiging();
  });

  const opnieuwKnop = document.querySelector('.bevestiging-opnieuw');
  if (opnieuwKnop) {
    opnieuwKnop.addEventListener('click', () => {
      form.reset();
      bevestiging.hidden = true;
      form.hidden = false;
      form.elements.naam.focus();
    });
  }
})();
