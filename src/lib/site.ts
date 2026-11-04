// Eén bron voor absolute URL's (canonical, Open Graph, JSON-LD, sitemap)
export const siteUrl = (import.meta.env.PUBLIC_SITE_URL || 'https://www.hypotheekhaven.nl').replace(/\/$/, '');
export const isProductie = import.meta.env.PUBLIC_ENV === 'production';
export const absoluut = (pad: string) => siteUrl + (pad.startsWith('/') ? pad : '/' + pad);

export const bedrijf = {
  naam: 'Hypotheekhaven',
  eigenaar: 'Sabrina Reiz-Coenraad',
  telefoon: '+31655767819',
  telefoonVast: '+31858001977',
  email: 'info@hypotheekhaven.nl',
  kvk: '94387672',
  afm: '12042801',
  regio: 'Noord-Holland',
  plaats: 'Enkhuizen', // geen bezoekadres: advies bij de klant thuis of online
  omschrijving: 'Onafhankelijk hypotheek- en verzekeringsadvies in Enkhuizen, West-Friesland en Noord-Holland, bij je thuis of online.',
  werkgebied: ['Enkhuizen', 'Stede Broec', 'Drechterland', 'Medemblik', 'Hoorn', 'Koggenland', 'Opmeer', 'Schagen', 'Alkmaar', 'Purmerend', 'Edam-Volendam'],
  googleProfiel: 'https://www.google.com/maps?cid=3046776625114960757',
  linkedin: 'https://www.linkedin.com/in/sabrina-reiz-coenraad-a4a829135/',
  trustoo: 'https://trustoo.nl/noord-holland/enkhuizen/hypotheekadviseur/hypotheekhaven/',
};
