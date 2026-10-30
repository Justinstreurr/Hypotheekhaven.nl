import { absoluut, bedrijf, siteUrl } from './site';
import { artikelen, CATEGORIEEN, inhoudVan } from './content';

type Type = 'WebPage' | 'CollectionPage' | 'ContactPage' | 'AboutPage' | 'BlogPosting';

export interface PaginaSeo {
  pad: string;
  type: Type;
  kruimel: string[]; // namen van de tussenstappen + deze pagina; Home staat er altijd voor
  faq?: boolean;     // de pagina heeft een FAQ-lijst (content.l.faq)
  artikel?: { gepubliceerd: string; gewijzigd: string; sectie: string; beeld: string };
  index?: false;     // niet in llms.txt en zoekmachines
}

const vast: Record<string, PaginaSeo> = {
  home: { pad: '/', type: 'WebPage', kruimel: [], faq: true },
  diensten: { pad: '/diensten', type: 'CollectionPage', kruimel: ['Diensten'] },
  werkwijze: { pad: '/werkwijze', type: 'WebPage', kruimel: ['Werkwijze & kosten'], faq: true },
  verzekeringen: { pad: '/verzekeringen', type: 'WebPage', kruimel: ['Verzekeringen'], faq: true },
  kredieten: { pad: '/kredieten', type: 'WebPage', kruimel: ['Kredieten'], faq: true },
  maandlasten: { pad: '/maandlasten-berekenen', type: 'WebPage', kruimel: ['Maandlasten berekenen'], faq: true },
  rentevast: { pad: '/rentevast-berekenen', type: 'WebPage', kruimel: ['Rentevaste periode loopt af'], faq: true },
  checklist: { pad: '/documentenchecklist', type: 'WebPage', kruimel: ['Documentenchecklist'], faq: true },
  blog: { pad: '/blog', type: 'CollectionPage', kruimel: ['Blog'] },
  contact: { pad: '/contact', type: 'ContactPage', kruimel: ['Contact'] },
  'over-sabrina': { pad: '/over-sabrina', type: 'AboutPage', kruimel: ['Over Sabrina'] },
  juridisch: { pad: '/juridisch', type: 'WebPage', kruimel: ['Privacy, cookies en klachten'] },
  'niet-gevonden': { pad: '/404', type: 'WebPage', kruimel: ['Pagina niet gevonden'], index: false },
};

const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Alle pagina's met hun SEO-gegevens, inclusief blogartikelen */
export function alleSeo(): Record<string, PaginaSeo> {
  const blog: Record<string, PaginaSeo> = {};
  for (const a of artikelen()) {
    if (a.artikel.status === 'binnenkort') continue;
    const seo: PaginaSeo = {
      pad: `/blog/${a.slug}`, type: 'BlogPosting', kruimel: ['Blog', tekst(a.t.titel)], faq: !!a.l?.faq?.length,
      artikel: { gepubliceerd: a.artikel.datum, gewijzigd: a.artikel.datum, sectie: CATEGORIEEN[a.artikel.categorie] ?? '', beeld: a.i['hero.foto1']?.src ?? 'hh-hero-kaartje.jpg' },
    };
    if (a.artikel.status === 'concept') seo.index = false;
    // Een artikel met een eigen pagina gebruikt de content van die pagina (content/pages/blog-<slug>.json)
    blog[a.artikel.eigenPagina ? `blog-${a.slug}` : `blog/${a.slug}`] = seo;
  }
  return { ...vast, ...blog };
}

export const seoVoor = (pagina: string): PaginaSeo | undefined => alleSeo()[pagina];

const ORG = `${siteUrl}/#organisatie`;
const WEBSITE = `${siteUrl}/#website`;
const SABRINA = `${siteUrl}/over-sabrina#sabrina`;

export function jsonLd(pagina: string, meta: { title: string; description: string }, ogImage: string) {
  const alle = alleSeo();
  const seo = alle[pagina];
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

  const webpagina: Record<string, unknown> = {
    '@type': seo.type === 'BlogPosting' ? 'WebPage' : seo.type, '@id': `${url}#webpagina`, url,
    name: meta.title, description: meta.description, inLanguage: 'nl-NL',
    isPartOf: { '@id': WEBSITE }, about: { '@id': ORG }, primaryImageOfPage: ogImage,
  };
  if (seo.kruimel.length) webpagina.breadcrumb = { '@id': `${url}#kruimelpad` };
  graph.push(webpagina);

  if (seo.kruimel.length) {
    const stappen = [{ naam: 'Home', pad: '/' }, ...seo.kruimel.map((naam, n) => ({
      naam, pad: n === seo.kruimel.length - 1 ? seo.pad : alle[naam.toLowerCase()]?.pad ?? seo.pad,
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

  const faq = seo.faq ? inhoudVan(pagina).l?.faq ?? [] : [];
  if (faq.length) {
    graph.push({
      '@type': 'FAQPage', '@id': `${url}#faq`,
      mainEntity: faq.map(v => ({ '@type': 'Question', name: tekst(v.vraag), acceptedAnswer: { '@type': 'Answer', text: tekst(v.antwoord) } })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
