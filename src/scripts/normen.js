/* NORMEN VOOR DE REKENTOOLS
   Eén keer per jaar bijwerken, na Prinsjesdag (de nieuwe cijfers gelden vanaf 1 januari).
   Alle rekentools lezen hun cijfers uit dit bestand, nergens anders staan bedragen of percentages.

   Bronnen 2026 (gecontroleerd oktober 2026):
   - Belastingschijven box 1 en maximaal aftrektarief: Belastingplan 2026
   - Eigenwoningforfait: Belastingdienst, tabel 2026 (gelijk aan 2025)
   - Wet Hillen: versnelde afbouw van 4,8 procentpunt per jaar vanaf 2026 */
window.HH_NORMEN = {
  jaar: 2026,

  // Inkomstenbelasting box 1 (onder de AOW-leeftijd)
  grensSchijf1: 38883,        // tot dit inkomen geldt het tarief van schijf 1
  tariefSchijf1: 0.3575,      // 35,75%
  maxAftrekTarief: 0.3756,    // 37,56%: hoger dan dit wordt hypotheekrente nooit afgetrokken

  // Eigenwoningforfait: percentage van de WOZ-waarde, per schijf (vanaf: ondergrens WOZ)
  eigenwoningforfait: [
    { vanaf: 0,       pct: 0 },
    { vanaf: 12500,   pct: 0.0010 },
    { vanaf: 25000,   pct: 0.0020 },
    { vanaf: 50000,   pct: 0.0025 },
    { vanaf: 75000,   pct: 0.0035 }
  ],
  villaGrens: 1350000,        // boven deze WOZ-waarde: vast bedrag + hoger percentage over het meerdere
  villaVastBedrag: 4725,
  villaPct: 0.0235,

  // Wet Hillen: deel van (forfait min rente) dat je mag aftrekken als je weinig rente betaalt
  hillenPct: 0.71867,

  // Fiscale aftrek alleen bij aflossen binnen 30 jaar
  maxLooptijdAftrek: 30,

  // Tool rentevast/oversluiten: aannames die de bezoeker zelf kan aanpassen
  boetevrijPct: 0.10,         // deel van het oorspronkelijke bedrag dat je per jaar boetevrij mag aflossen (bij de meeste banken)
  oversluitKosten: 3300,      // advies, notaris en taxatie samen; gemiddeld ca. € 3.295 (HomeFinance 2026)

  // Voorbeeldrente bij het openen van de tool: geen aanbod, de bezoeker past hem zelf aan.
  // Rond het gemiddelde voor 10 jaar vast met NHG (Van Bruggen, oktober 2026: 4,49%).
  voorbeeldRente: 4.5
};
