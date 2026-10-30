/* DOCUMENTENCHECKLIST
   Persoonlijke lijst op basis van situatie, inkomen en bijzonderheden.
   Bronnen: NHG checklist dossier (versie 2024), checklists van geldverstrekkers en de lijst van Sabrina's oude site.
   Afvinken wordt alleen in de browser van de bezoeker bewaard (localStorage), er wordt niets verstuurd. */
(function () {
  const tool = document.querySelector('.rekentool');
  if (!tool || !window.HH_Stappen) return;

  const a = { situatie: null, samen: 'alleen', inkomen: [], extra: [] };
  const OPSLAG = 'hh-checklist-afgevinkt';

  // Labels voor de samenvattingen
  const namen = {
    situatie: { eerste: 'Mijn eerste huis kopen', volgend: 'Een volgend huis kopen', oversluiten: 'Rente loopt af of oversluiten', scheiden: 'Scheiden' },
    inkomen: { vast: 'vast contract', tijdelijk: 'tijdelijk contract', flex: 'flexibel', ondernemer: 'ondernemer', dga: 'dga', pensioen: 'pensioen', uitkering: 'uitkering' },
    extra: { nieuwbouw: 'nieuwbouw', verbouwen: 'verbouwen', verkopen: 'huidig huis verkopen', eigengeld: 'eigen geld', schenking: 'schenking', studieschuld: 'studieschuld', leningen: 'andere leningen', alimentatie: 'alimentatie', erfpacht: 'erfpacht', geen: 'geen' }
  };

  /* ---------- Alle documenten met wanneer ze nodig zijn ---------- */
  const heeft = (lijst, ...w) => w.some((x) => lijst.includes(x));
  const kopen = () => a.situatie === 'eerste' || a.situatie === 'volgend';
  const extra = () => a.extra.filter((x) => document.querySelector(`[data-meer="extra"][data-waarde="${x}"]`)?.hidden !== true);
  const samen = () => a.samen === 'samen';
  const docs = [
    // Over jou
    { id: 'id', groep: 'jou', titel: 'Geldig paspoort of identiteitskaart', uitleg: () => samen() ? 'Van jullie allebei. Een rijbewijs is niet genoeg.' : 'Een rijbewijs is niet genoeg.', als: () => true },
    { id: 'pensioenoverzicht', groep: 'jou', titel: 'Pensioenoverzicht', uitleg: () => 'Download het via mijnpensioenoverzicht.nl. Zo kijken we ook naar je inkomen later.', als: () => true },

    // Inkomen
    { id: 'wgv', groep: 'inkomen', titel: 'Werkgeversverklaring', uitleg: () => 'Ingevuld en ondertekend door je werkgever, niet ouder dan drie maanden. Een UWV-verzekeringsbericht kan vaak ook.', als: () => heeft(a.inkomen, 'vast', 'tijdelijk') },
    { id: 'loonstrook', groep: 'inkomen', titel: 'Je meest recente loonstrook', uitleg: () => 'Van de afgelopen maand.', als: () => heeft(a.inkomen, 'vast', 'tijdelijk', 'flex') },
    { id: 'intentie', groep: 'inkomen', titel: 'Intentieverklaring of perspectiefverklaring', uitleg: () => 'Bij een tijdelijk contract: je werkgever verklaart dat je contract wordt omgezet of verlengd.', als: () => heeft(a.inkomen, 'tijdelijk') },
    { id: 'uwv', groep: 'inkomen', titel: 'UWV-verzekeringsbericht', uitleg: () => 'Overzicht van je inkomen over de afgelopen jaren. Download het via mijn.uwv.nl.', als: () => heeft(a.inkomen, 'flex') },
    { id: 'jaaropgaven', groep: 'inkomen', titel: 'Jaaropgaven van de afgelopen drie jaar', uitleg: () => 'Bij flexibel inkomen kijken we naar je gemiddelde.', als: () => heeft(a.inkomen, 'flex') },
    { id: 'jaarcijfers', groep: 'inkomen', titel: 'Jaarcijfers van de afgelopen drie jaar', uitleg: () => heeft(a.inkomen, 'dga') ? 'Balans en winst-en-verliesrekening van je bv.' : 'Balans en winst-en-verliesrekening.', als: () => heeft(a.inkomen, 'ondernemer', 'dga') },
    { id: 'ib', groep: 'inkomen', titel: 'Aangiften en aanslagen inkomstenbelasting', uitleg: () => 'Van de afgelopen drie jaar.', als: () => heeft(a.inkomen, 'ondernemer', 'dga') },
    { id: 'kvk', groep: 'inkomen', titel: 'Uittreksel Kamer van Koophandel', uitleg: () => 'Niet ouder dan zes maanden.', als: () => heeft(a.inkomen, 'ondernemer', 'dga') },
    { id: 'iv', groep: 'inkomen', titel: 'Inkomensverklaring ondernemer', uitleg: () => 'Een rekenexpert stelt je inkomen vast op basis van je cijfers. Dit regelen we samen.', als: () => heeft(a.inkomen, 'ondernemer', 'dga') },
    { id: 'pensioenbesluit', groep: 'inkomen', titel: 'Toekenningsbesluit pensioen en AOW', uitleg: () => 'Plus je meest recente uitkeringsspecificatie.', als: () => heeft(a.inkomen, 'pensioen') },
    { id: 'uitkering', groep: 'inkomen', titel: 'Toekenningsbesluit van je uitkering', uitleg: () => 'Plus je meest recente uitkeringsspecificatie.', als: () => heeft(a.inkomen, 'uitkering') },

    // Woning
    { id: 'koop', groep: 'woning', titel: 'Getekende koopovereenkomst', uitleg: () => 'Zodra je een huis hebt gekocht.', als: () => kopen() && !heeft(extra(), 'nieuwbouw') },
    { id: 'aanneem', groep: 'woning', titel: 'Koop- en aannemingsovereenkomst', uitleg: () => 'Van je nieuwbouwwoning, met de specificatie van meer- en minderwerk.', als: () => kopen() && heeft(extra(), 'nieuwbouw') },
    { id: 'taxatie', groep: 'woning', titel: 'Taxatierapport', uitleg: () => a.situatie === 'oversluiten' ? 'Vaak nodig als je naar een andere geldverstrekker gaat. Ik help je een erkend taxateur te vinden.' : a.situatie === 'scheiden' ? 'Om de waarde van het huis te bepalen, bijvoorbeeld als je je ex uitkoopt.' : 'Laat je maken door een erkend taxateur, ik help je daarbij.', als: () => !(kopen() && heeft(extra(), 'nieuwbouw')) },
    { id: 'verbouw', groep: 'woning', titel: 'Offertes of specificatie van de verbouwing', uitleg: () => 'Met de kosten, en apart wat energiebesparend is. Daarvoor is soms extra leenruimte.', als: () => heeft(extra(), 'verbouwen') },
    { id: 'erfpacht', groep: 'woning', titel: 'Erfpachtvoorwaarden', uitleg: () => 'Met de hoogte van de canon en tot wanneer die vaststaat.', als: () => heeft(extra(), 'erfpacht') },
    { id: 'hypnu', groep: 'woning', titel: 'Jaaroverzicht van je huidige hypotheek', uitleg: () => 'Met de openstaande schuld en je rente. Staat ook in de app van je geldverstrekker.', als: () => a.situatie !== 'eerste' },
    { id: 'verkoop', groep: 'woning', titel: 'Verkoopovereenkomst van je huidige huis', uitleg: () => 'Als je huis al verkocht is. Zo niet, dan kijken we naar de verwachte waarde.', als: () => a.situatie === 'volgend' && heeft(extra(), 'verkopen') },
    { id: 'renteaanbod', groep: 'woning', titel: 'Rentevoorstel van je geldverstrekker', uitleg: () => 'Als je dat al hebt gekregen. Zo kunnen we het vergelijken.', als: () => a.situatie === 'oversluiten' },
    { id: 'voorwaarden', groep: 'woning', titel: 'Je hypotheekofferte of leningsvoorwaarden', uitleg: () => 'Hierin staan je boetevrije ruimte en andere afspraken.', als: () => a.situatie === 'oversluiten' },
    { id: 'woz', groep: 'woning', titel: 'Recente WOZ-beschikking', uitleg: () => 'Je vindt hem bij je aanslag van de gemeente of via het WOZ-waardeloket.', als: () => a.situatie === 'oversluiten' || a.situatie === 'scheiden' },
    { id: 'convenant', groep: 'woning', titel: 'Echtscheidingsconvenant', uitleg: () => 'Of het concept, met de afspraken over het huis.', als: () => a.situatie === 'scheiden' },
    { id: 'beschikking', groep: 'woning', titel: 'Echtscheidingsbeschikking', uitleg: () => 'Als de rechter die al heeft afgegeven.', als: () => a.situatie === 'scheiden' },

    // Financiën
    { id: 'spaar', groep: 'geld', titel: 'Afschrift van je spaarrekening', uitleg: () => 'Waaruit je eigen geld blijkt.', als: () => heeft(extra(), 'eigengeld') },
    { id: 'schenking', groep: 'geld', titel: 'Schenkingsovereenkomst', uitleg: () => 'Of een verklaring van wie het geld schenkt, met het bedrag.', als: () => heeft(extra(), 'schenking') },
    { id: 'duo', groep: 'geld', titel: 'Overzicht studieschuld van DUO', uitleg: () => 'Met je oorspronkelijke schuld en je maandbedrag, via Mijn DUO.', als: () => heeft(extra(), 'studieschuld') },
    { id: 'leningen', groep: 'geld', titel: 'Overzicht van andere leningen', uitleg: () => 'Zoals een persoonlijke lening, private lease of creditcard, met het maandbedrag.', als: () => heeft(extra(), 'leningen') },
    { id: 'alimentatie', groep: 'geld', titel: 'Afspraken over alimentatie', uitleg: () => 'Uit je convenant of de beschikking, met het bedrag per maand.', als: () => heeft(extra(), 'alimentatie') }
  ];
  const groepen = [['jou', 'Over jou'], ['inkomen', 'Je inkomen'], ['woning', 'Je woning en hypotheek'], ['geld', 'Je financiën']];

  /* ---------- Afvinken onthouden (alleen in deze browser) ---------- */
  let afgevinkt = new Set();
  try { afgevinkt = new Set(JSON.parse(localStorage.getItem(OPSLAG) || '[]')); } catch (e) { /* geen opslag beschikbaar */ }
  const bewaarVinkjes = () => { try { localStorage.setItem(OPSLAG, JSON.stringify([...afgevinkt])); } catch (e) { /* geen opslag */ } };

  /* ---------- Tonen ---------- */
  let gereed = false;
  const uit = (naam, tekst) => tool.querySelectorAll(`[data-uit="${naam}"]`).forEach((el) => { el.textContent = tekst; });
  const nodig = () => docs.filter((d) => d.als());

  function bouwLijst() {
    tool.querySelector('[data-leeg]').hidden = gereed;
    tool.querySelector('[data-cijfers]').hidden = !gereed;
    tool.querySelector('[data-lijst]').hidden = !gereed;
    if (!gereed) return;
    const lijst = nodig();
    uit('lijstIntro', samen() ? 'Voor jullie allebei, waar het om inkomen of identiteit gaat. Vink af wat je al hebt.' : 'Vink af wat je al hebt. Je voortgang zie je rechts.');
    tool.querySelector('[data-groepen]').innerHTML = groepen.map(([g, titel]) => {
      const items = lijst.filter((d) => d.groep === g);
      if (!items.length) return '';
      return `<div class="rt-groep"><h4>${titel}</h4><ul>${items.map((d) => `
        <li><label class="rt-vink"><input type="checkbox" data-doc="${d.id}"${afgevinkt.has(d.id) ? ' checked' : ''}>
          <span class="rt-vink-vak" aria-hidden="true"></span>
          <span class="rt-vink-tekst"><strong>${d.titel}</strong><small>${d.uitleg()}</small></span></label></li>`).join('')}</ul></div>`;
    }).join('');
    tool.querySelectorAll('[data-doc]').forEach((v) => v.addEventListener('change', () => {
      v.checked ? afgevinkt.add(v.dataset.doc) : afgevinkt.delete(v.dataset.doc);
      bewaarVinkjes();
      telling();
    }));
    telling();
  }

  function telling() {
    const lijst = nodig();
    const klaar = lijst.filter((d) => afgevinkt.has(d.id)).length;
    uit('klaar', String(klaar));
    uit('totaal', String(lijst.length));
    tool.querySelector('[data-voortgang]').style.width = (lijst.length ? (klaar / lijst.length) * 100 : 0) + '%';
    uit('voortgangTekst', klaar === lijst.length && lijst.length
      ? 'Alles verzameld. Je bent klaar voor het adviesgesprek.'
      : klaar ? `Nog ${lijst.length - klaar} te gaan. Goed bezig.` : 'Vink documenten af zodra je ze hebt.');
  }

  /* ---------- Stappen ---------- */
  const stappen = window.HH_Stappen(tool, a, {
    standaardSituatie: 'eerste',
    samenvatting(naam) {
      if (naam === 'situatie') return namen.situatie[a.situatie] || '';
      if (naam === 'inkomen') return a.inkomen.length ? `${samen() ? 'Samen' : 'Alleen'} · ${a.inkomen.map((x) => namen.inkomen[x]).join(', ')}` : '';
      if (naam === 'extra') { const e = extra(); return !e.length || heeft(e, 'geen') ? 'Geen bijzonderheden' : (([t]) => t.charAt(0).toUpperCase() + t.slice(1))([e.map((x) => namen.extra[x]).join(', ')]); }
      return '';
    },
    controleer(naam) {
      if (naam !== 'inkomen') return true;
      const fout = tool.querySelector('[data-blok="inkomen"] [data-fout]');
      fout.hidden = a.inkomen.length > 0;
      return a.inkomen.length > 0;
    },
    naStap(naam) {
      if (naam === 'inkomen') gereed = true;
      bouwLijst();
    },
    wijziging() {
      const fout = tool.querySelector('[data-blok="inkomen"] [data-fout]');
      if (a.inkomen.length) fout.hidden = true;
      bouwLijst();
    },
    opnieuw() { gereed = false; bouwLijst(); },
    klaar() {
      if (window.matchMedia('(max-width: 1024px)').matches) tool.querySelector('[data-lijst]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Printen of als pdf bewaren: de printopmaak toont alleen de lijst
  tool.querySelector('[data-print]').addEventListener('click', () => window.print());

  stappen.open('situatie');
  bouwLijst();
})();
