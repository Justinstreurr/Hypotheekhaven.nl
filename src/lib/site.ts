// Eén bron voor absolute URL's (canonical, Open Graph, JSON-LD, sitemap)
import site from '../content/site.json';

export const siteUrl = (import.meta.env.PUBLIC_SITE_URL || 'https://www.hypotheekhaven.nl').replace(/\/$/, '');
export const isProductie = import.meta.env.PUBLIC_ENV === 'production';
export const absoluut = (pad: string) => siteUrl + (pad.startsWith('/') ? pad : '/' + pad);

// Bedrijfsgegevens staan in src/content/site.json ("bedrijf") en zijn aan te passen in de bewerkmodus
// (knop "Bedrijfsgegevens"). Ze zitten achter de bel-, WhatsApp- en mailknoppen en in de gegevens voor Google.
export interface Bedrijf {
  naam: string; eigenaar: string; telefoon: string; telefoonVast: string; email: string; kvk: string; afm: string;
  regio: string; plaats: string; omschrijving: string; werkgebied: string[];
  googleProfiel: string; linkedin: string; trustoo: string;
}
export const bedrijf: Bedrijf = site.bedrijf; // plaats: geen bezoekadres, advies bij de klant thuis of online

/** Links achter de knoppen: telefoon, vaste lijn, WhatsApp en e-mail */
export const contactLinks = {
  bel: `tel:${bedrijf.telefoon}`,
  belVast: `tel:${bedrijf.telefoonVast}`,
  whatsapp: `https://wa.me/${bedrijf.telefoon.replace(/\D/g, '')}`,
  mail: `mailto:${bedrijf.email}`,
};
