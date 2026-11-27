import type { APIRoute } from 'astro';
import { bestaat, bestandPad, ingelogd, leesBestand, lijstBestanden, schoneHtml, schoneTekst, schrijfBestanden, zelfdeHerkomst } from '../../../lib/beheer';
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

    // Artikel uit een document (Word of Google Docs): de editor heeft het al opgedeeld in titel, inleiding,
    // tekst en veelgestelde vragen. Hier wordt alles opgeschoond en in één keer als artikel opgeslagen.
    if (d.actie === 'importeer') {
      const titel = schoneTekst(String(d.titel ?? '')).slice(0, 160);
      const categorie = String(d.categorie ?? '');
      const status = String(d.status ?? 'concept');
      const datum = String(d.datum ?? '');
      if (!titel) return json({ ok: false, fout: 'Het artikel heeft geen titel' }, 400);
      if (!(categorie in CATEGORIEEN)) return json({ ok: false, fout: 'Kies een onderwerp' }, 400);
      if (!['concept', 'gepubliceerd', 'ingepland'].includes(status)) return json({ ok: false, fout: 'Ongeldige status' }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return json({ ok: false, fout: 'Kies een datum' }, 400);
      const inhoud = schoneHtml(String(d.inhoud ?? ''), true);
      if (!inhoud) return json({ ok: false, fout: 'Er staat geen tekst in het document' }, 400);
      const faq = (Array.isArray(d.faq) ? d.faq : []).slice(0, 40)
        .map((v: { vraag?: unknown; antwoord?: unknown }) => ({ vraag: schoneHtml(String(v?.vraag ?? '')), antwoord: schoneHtml(String(v?.antwoord ?? '')) }))
        .filter((v: { vraag: string; antwoord: string }) => v.vraag && v.antwoord);

      // Eerste foto uit het document wordt de foto bovenaan en in het blogoverzicht
      const bestanden: { pad: string; inhoud: string | Buffer }[] = [];
      let foto = { src: 'hh-hero-kaartje.jpg', alt: '' };
      if (d.foto?.data) {
        const data = String(d.foto.data);
        const ext = data.startsWith('/9j/') ? 'jpg' : data.startsWith('iVBORw0KGgo') ? 'png' : data.startsWith('UklGR') ? 'webp' : null;
        if (!ext) return json({ ok: false, fout: 'De foto in het document is geen JPG, PNG of WebP' }, 400);
        const buf = Buffer.from(data, 'base64');
        if (buf.length > 3 * 1024 * 1024) return json({ ok: false, fout: 'De foto in het document is te groot (max. 3 MB)' }, 400);
        const stempel = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const src = `uploads/${stempel}-${slugVan(titel).slice(0, 40)}.${ext}`;
        bestanden.push({ pad: `src/assets/img/${src}`, inhoud: buf });
        foto = { src, alt: schoneTekst(String(d.foto.alt ?? '')).slice(0, 200) };
      }

      let slug = slugVan(titel);
      for (let n = 2; await bestaat(bestandPad(`blog/${slug}`)); n++) slug = `${slugVan(titel)}-${n}`;
      const metaTitel = schoneTekst(String(d.meta?.title ?? '')) || `${titel} | Hypotheekhaven`;
      const metaOmschrijving = schoneTekst(String(d.meta?.description ?? '')) || schoneTekst(String(d.samenvatting ?? '')).slice(0, 155);
      const artikel: Artikel = {
        artikel: { status: status as Artikel['artikel']['status'], categorie, datum },
        meta: { title: metaTitel.slice(0, 120), description: metaOmschrijving.slice(0, 300) },
        t: {
          titel: schoneHtml(titel),
          samenvatting: schoneHtml(String(d.samenvatting ?? '')) || 'Een korte samenvatting voor de kaart in het blogoverzicht.',
          leestijd: schoneTekst(String(d.leestijd ?? '')) || '5 minuten lezen',
          inleiding: schoneHtml(String(d.inleiding ?? '')),
          inhoud,
        },
        i: { kaart: { ...foto }, 'hero.foto1': { ...foto } },
        l: { faq },
      };
      bestanden.push({ pad: bestandPad(`blog/${slug}`), inhoud: JSON.stringify(artikel, null, 2) + '\n' });
      const soort = status === 'ingepland' ? `ingepland op ${datum}` : status === 'gepubliceerd' ? 'gepubliceerd' : 'concept';
      await schrijfBestanden(bestanden, `Artikel uit document (${soort}): ${titel}`);
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

// Alle artikelen zoals ze nu in de opslag staan (ook net aangemaakte), voor de blogplanning
export const GET: APIRoute = async ({ cookies }) => {
  if (!ingelogd(cookies)) return json({ ok: false, fout: 'Je bent uitgelogd. Log opnieuw in via /beheer.' }, 401);
  try {
    const paden = (await lijstBestanden('src/content/blog')).filter(p => p.endsWith('.json'));
    const artikelen = await Promise.all(paden.map(async pad => {
      const a = JSON.parse(await leesBestand(pad)) as Artikel;
      return {
        ref: `blog/${pad.replace(/^.*\/(.+)\.json$/, '$1')}`,
        titel: a.t.titel.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'),
        status: a.artikel.status, datum: a.artikel.datum, categorie: a.artikel.categorie, eigenPagina: !!a.artikel.eigenPagina,
      };
    }));
    return new Response(JSON.stringify({ ok: true, artikelen }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return json({ ok: false, fout: 'De artikelen konden niet worden geladen' }, 500);
  }
};
