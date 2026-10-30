import { absoluut, bedrijf, siteUrl } from './site';
import { inhoudVan } from './content';

type Type = 'WebPage' | 'CollectionPage' | 'ContactPage' | 'AboutPage' | 'BlogPosting';

interface PaginaSeo {
  pad: string;
  type: Type;
  kruimel: string[]; // namen van de tussenstappen + deze pagina; Home staat er altijd voor
  faq?: string;      // sleutelvoorvoegsel van de vragen in de content (summaryN / pN)
  artikel?: { gepubliceerd: string; gewijzigd: string; sectie: string; beeld: string };
  index?: false;     // niet in llms.txt en zoekmachines
}

export const paginas: Record<string, PaginaSeo> = {
  home: { pad: '/', type: 'WebPage', kruimel: [], faq: 'faq' },
  diensten: { pad: '/diensten', type: 'CollectionPage', kruimel: ['Diensten'] },
  werkwijze: { pad: '/werkwijze', type: 'WebPage', kruimel: ['Werkwijze & kosten'], faq: 'faq' },
  verzekeringen: { pad: '/verzekeringen', type: 'WebPage', kruimel: ['Verzekeringen'], faq: 'faq' },
  kredieten: { pad: '/kredieten', type: 'WebPage', kruimel: ['Kredieten'], faq: 'faq' },
  maandlasten: { pad: '/maandlasten-berekenen', type: 'WebPage', kruimel: ['Maandlasten berekenen'] },
  rentevast: { pad: '/rentevast-berekenen', type: 'WebPage', kruimel: ['Rentevaste periode loopt af'] },
  checklist: { pad: '/documentenchecklist', type: 'WebPage', kruimel: ['Documentenchecklist'] },
  blog: { pad: '/blog', type: 'CollectionPage', kruimel: ['Blog'] },
  'blog-hoeveel-kan-ik-lenen': {
    pad: '/blog/hoeveel-kan-ik-lenen', type: 'BlogPosting', kruimel: ['Blog', 'Hoeveel kan ik lenen?'], faq: 'veelgestelde-vragen',
    artikel: { gepubliceerd: '2026-10-11', gewijzigd: '2026-10-11', sectie: 'Een huis kopen', beeld: 'hh-interieur-woonkamer.jpg' },
  },
  contact: { pad: '/contact', type: 'ContactPage', kruimel: ['Contact'] },
  'over-sabrina': { pad: '/over-sabrina', type: 'AboutPage', kruimel: ['Over Sabrina'] },
  juridisch: { pad: '/juridisch', type: 'WebPage', kruimel: ['Privacy, cookies en klachten'] },
  'niet-gevonden': { pad: '/404', type: 'WebPage', kruimel: ['Pagina niet gevonden'], index: false },
};

const ORG = `${siteUrl}/#organisatie`;
const WEBSITE = `${siteUrl}/#website`;
const SABRINA = `${siteUrl}/over-sabrina#sabrina`;

const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function jsonLd(pagina: string, meta: { title: string; description: string }, ogImage: string) {
  const seo = paginas[pagina];
  const url = absoluut(seo.pad);
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'WebSite', '@id': WEBSITE, url: siteUrl + '/', name: bedrijf.naam, inLanguage: 'nl-NL', publisher: { '@id': ORG },
    },
    {
      '@type': 'FinancialService', '@id': ORG, name: bedrijf.naam, url: siteUrl + '/',
      logo: absoluut('/icon-512.png'), image: ogImage,
      description: 'Onafhankelijk hypotheek- en verzekeringsadvies in Noord-Holland, online of bij je thuis.',
      telephone: bedrijf.telefoon, email: bedrijf.email,
      areaServed: { '@type': 'AdministrativeArea', name: bedrijf.regio },
      founder: { '@id': SABRINA },
      identifier: [
        { '@type': 'PropertyValue', propertyID: 'KvK', value: bedrijf.kvk },
        { '@type': 'PropertyValue', propertyID: 'AFM', value: bedrijf.afm },
      ],
      knowsAbout: ['Hypotheekadvies', 'Oversluiten', 'Overwaarde', 'Verzekeringsadvies', 'Kredieten'],
      sameAs: [bedrijf.linkedin, bedrijf.trustoo],
    },
    {
      '@type': 'Person', '@id': SABRINA, name: bedrijf.eigenaar, jobTitle: 'Onafhankelijk hypotheek- en verzekeringsadviseur',
      url: absoluut('/over-sabrina'), worksFor: { '@id': ORG }, sameAs: [bedrijf.linkedin],
    },
  ];

  const pagina_: Record<string, unknown> = {
    '@type': seo.type === 'BlogPosting' ? 'WebPage' : seo.type, '@id': `${url}#webpagina`, url,
    name: meta.title, description: meta.description, inLanguage: 'nl-NL',
    isPartOf: { '@id': WEBSITE }, about: { '@id': ORG }, primaryImageOfPage: ogImage,
  };
  if (seo.kruimel.length) pagina_.breadcrumb = { '@id': `${url}#kruimelpad` };
  graph.push(pagina_);

  if (seo.kruimel.length) {
    const stappen = [{ naam: 'Home', pad: '/' }, ...seo.kruimel.map((naam, n) => ({
      naam, pad: n === seo.kruimel.length - 1 ? seo.pad : paginas[naam.toLowerCase()]?.pad ?? seo.pad,
    }))];
    graph.push({
      '@type': 'BreadcrumbList', '@id': `${url}#kruimelpad`,
      itemListElement: stappen.map((s, n) => ({ '@type': 'ListItem', position: n + 1, name: s.naam, item: absoluut(s.pad) })),
    });
  }

  if (seo.artikel) {
    graph.push({
      '@type': 'BlogPosting', '@id': `${url}#artikel`, headline: meta.title.replace(/\s*\|.*$/, ''), description: meta.description,
      url, mainEntityOfPage: { '@id': `${url}#webpagina` }, image: ogImage,
      datePublished: seo.artikel.gepubliceerd, dateModified: seo.artikel.gewijzigd, articleSection: seo.artikel.sectie,
      inLanguage: 'nl-NL', author: { '@id': SABRINA }, publisher: { '@id': ORG },
    });
  }

  if (seo.faq) {
    const t = inhoudVan(pagina).t;
    // De sleutels staan in documentvolgorde: het antwoord is de eerste alinea na de vraag
    const sleutels = Object.keys(t).filter(k => k.startsWith(`${seo.faq}.`));
    const vragen = sleutels.flatMap((k, n) => {
      if (!k.startsWith(`${seo.faq}.summary`)) return [];
      const antwoord = sleutels.slice(n + 1).find(a => a.startsWith(`${seo.faq}.p`));
      return antwoord ? [{ '@type': 'Question', name: tekst(t[k]), acceptedAnswer: { '@type': 'Answer', text: tekst(t[antwoord]) } }] : [];
    });
    if (vragen.length) graph.push({ '@type': 'FAQPage', '@id': `${url}#faq`, mainEntity: vragen });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
