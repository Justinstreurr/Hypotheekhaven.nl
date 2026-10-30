import type { APIRoute } from 'astro';
import { bestaat, bestandPad, ingelogd, leesBestand, schoneHtml, schoneTekst, schrijfBestanden, zelfdeHerkomst } from '../../../lib/beheer';
import { slugVan } from '../../../lib/artikel';
import { CATEGORIEEN, type Artikel } from '../../../lib/content';

export const prerender = false;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

// Nieuw artikel aanmaken of een artikel verwijderen. Elk artikel is een bestand in src/content/blog/.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!zelfdeHerkomst(request)) return json({ ok: false, fout: 'Niet toegestaan' }, 403);
  if (!ingelogd(cookies)) return json({ ok: false, fout: 'Je bent uitgelogd. Log opnieuw in via /beheer.' }, 401);
  const d = await request.json().catch(() => ({}));

  try {
    if (d.actie === 'nieuw') {
      const titel = schoneTekst(String(d.titel ?? '')).slice(0, 120);
      const categorie = String(d.categorie ?? '');
      if (!titel) return json({ ok: false, fout: 'Geef het artikel een titel' }, 400);
      if (!(categorie in CATEGORIEEN)) return json({ ok: false, fout: 'Kies een onderwerp' }, 400);
      let slug = slugVan(titel);
      for (let n = 2; await bestaat(bestandPad(`blog/${slug}`)); n++) slug = `${slugVan(titel)}-${n}`;
      const vandaag = new Date().toISOString().slice(0, 10);
      const artikel: Artikel = {
        artikel: { status: 'concept', categorie, datum: vandaag },
        meta: { title: `${titel} | Hypotheekhaven`, description: `${titel}: uitleg van Sabrina Reiz-Coenraad, onafhankelijk hypotheekadviseur in Noord-Holland.` },
        t: {
          titel: schoneHtml(titel),
          samenvatting: 'Een korte samenvatting voor de kaart in het blogoverzicht.',
          leestijd: '5 minuten lezen',
          inleiding: 'Schrijf hier een korte inleiding van twee of drie zinnen.',
          inhoud: '<h2>Eerste tussenkop</h2><p>Schrijf hier de tekst van je artikel. Met de knoppen boven de tekst maak je een tussenkop, een opsomming of vetgedrukte tekst.</p>',
        },
        i: {
          kaart: { src: 'hh-hero-kaartje.jpg', alt: '' },
          'hero.foto1': { src: 'hh-hero-kaartje.jpg', alt: '' },
        },
        l: { faq: [] },
      };
      await schrijfBestanden([{ pad: bestandPad(`blog/${slug}`), inhoud: JSON.stringify(artikel, null, 2) + '\n' }], `Nieuw artikel (concept): ${titel}`);
      return json({ ok: true, slug });
    }

    if (d.actie === 'verwijder') {
      const slug = String(d.slug ?? '');
      if (!/^[a-z0-9-]+$/.test(slug)) return json({ ok: false, fout: 'Onbekend artikel' }, 400);
      const pad = bestandPad(`blog/${slug}`);
      const artikel = JSON.parse(await leesBestand(pad)) as Artikel;
      if (artikel.artikel.eigenPagina) return json({ ok: false, fout: 'Dit artikel heeft een eigen pagina en kan hier niet worden verwijderd.' }, 400);
      const titel = artikel.t.titel.replace(/<[^>]+>/g, '');
      await schrijfBestanden([{ pad, inhoud: null }], `Artikel verwijderd: ${titel}`);
      return json({ ok: true });
    }
    return json({ ok: false, fout: 'Onbekende actie' }, 400);
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'Dat is niet gelukt. Probeer het opnieuw.' }, 500);
  }
};
