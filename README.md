# Hypotheekhaven

Website van Hypotheekhaven (Sabrina Reiz-Coenraad), gebouwd met [Astro](https://astro.build) en gehost op Vercel.
Bezoekers krijgen kale, snelle HTML; teksten en foto's zijn op de site zelf te bewerken via `/beheer`.

## Snel starten

```bash
npm install
cp .env.example .env   # en vul de waarden in
npm run dev            # http://localhost:4321
npm run build          # productieversie in dist/
npm run check          # TypeScript-controle
```

## Teksten en foto's aanpassen (bewerkmodus)

1. Ga naar `/beheer` en log in met het wachtwoord (`BEHEER_WACHTWOORD`).
2. Open een pagina. Onderin staat de werkbalk van de bewerkmodus.
3. Klik op een tekst om hem direct op de pagina aan te passen (Enter = nieuwe regel, Ctrl+B = vet, Esc = annuleren).
   Klik op een foto om een andere foto te kiezen en de omschrijving aan te passen.
   Achtergrondfoto's staan onder **Achtergrondfoto's**, de teksten voor Google onder **Google & menu**.
4. Druk op **Publiceren**. Online maakt dit één commit op GitHub; Vercel zet de site binnen ongeveer een minuut live.
   Lokaal (`npm run dev`) worden de bestanden direct in `src/` opgeslagen.

Wil je de site gewoon gebruiken (menu openen, tabbladen wisselen) zonder dat een klik iets gaat bewerken?
Zet in de werkbalk de schakelaar op **Klikken = website gebruiken**.

## Hoe het in elkaar zit

| Map / bestand | Inhoud |
| --- | --- |
| `src/content/site.json` | Teksten die op elke pagina staan: menu, footer, scores, banklogo-tekst |
| `src/content/pages/*.json` | Per pagina: `meta` (titel en omschrijving voor Google), `t` (teksten), `i` (foto's) |
| `src/content/beeldmaten.json` | Gemeten breedte van elke foto, zodat de browser niet groter downloadt dan nodig |
| `src/assets/img/` | Alle foto's; Astro maakt er bij het bouwen WebP-versies in de juiste formaten van. Nieuwe foto's uit de bewerkmodus komen in `uploads/` |
| `src/pages/` | Eén bestand per pagina. Elk bewerkbaar element heeft `data-e="<bestand>:<sleutel>"` |
| `src/components/` | Gedeelde blokken: header, footer, hero-scores, banklogo's, logo en `Img` |
| `src/layouts/Base.astro` | `<head>` met SEO, Open Graph, gestructureerde data, lettertypes en de lader van de bewerkmodus |
| `src/lib/` | `content.ts` (content laden), `seo.ts` (JSON-LD, kruimelpaden), `site.ts` (domein en bedrijfsgegevens), `beheer.ts` (inloggen en publiceren) |
| `src/pages/api/` | Serverfuncties: inloggen, inhoud lezen, publiceren en het contactformulier |
| `src/scripts/` | JavaScript per onderdeel (sliders, wiel, rekentools, contactformulier) |
| `public/beheer/` | De editor zelf; wordt alleen geladen voor wie is ingelogd |

Nieuwe tekst of foto toevoegen aan een pagina: zet het element in het `.astro`-bestand met
`data-e="pagina:sleutel" set:html={t('sleutel')}` (of `<Img data={img('sleutel')} />`) en voeg de sleutel toe aan de JSON van die pagina.

## SEO en GEO

- Per pagina een canonical-URL, Open Graph- en Twitter-kaart (1200×630) en één JSON-LD-`@graph` met WebSite, FinancialService, Person, WebPage, BreadcrumbList en waar van toepassing FAQPage en BlogPosting.
- `sitemap-index.xml` en `robots.txt` worden bij het bouwen gemaakt; `llms.txt` geeft AI-assistenten een samenvatting van de site.
- Alleen met `PUBLIC_ENV=production` mag de site geïndexeerd worden. Preview-omgevingen krijgen `noindex` en een robots.txt die alles blokkeert.
- Oude adressen (`/diensten.html`) sturen met een 301 door naar de nieuwe (`/diensten`), zie `vercel.json`.

## Livegang op Vercel

1. Zet deze map in een GitHub-repository (privé) en koppel die in Vercel als nieuw project (framework: Astro).
2. Vul in Vercel de omgevingsvariabelen in (zie `.env.example`):
   - **Production**: `PUBLIC_SITE_URL`, `PUBLIC_ENV=production`, `BEHEER_WACHTWOORD`, `SESSIE_GEHEIM`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `RESEND_API_KEY`, `CONTACT_AAN`, `CONTACT_VAN`.
   - **Preview**: hetzelfde, maar zonder `PUBLIC_ENV`.
3. `GITHUB_TOKEN`: een *fine-grained personal access token* met alleen **Contents: Read and write** op deze ene repository.
4. Contactformulier: maak een account bij [Resend](https://resend.com), verifieer het domein en zet de API-sleutel in `RESEND_API_KEY`.
   Zolang die ontbreekt, opent het formulier een e-mail in het mailprogramma van de bezoeker (zoals de oude site).
5. Koppel het domein in Vercel en controleer daarna `https://<domein>/robots.txt` en `/sitemap-index.xml`.
   Meld de sitemap aan in Google Search Console.

## Onderhoud

- **Normen rekentools**: één keer per jaar (na Prinsjesdag) bijwerken in `src/scripts/normen.js`.
- **Beeldmaten bijwerken**: alleen nodig als de opmaak van foto's verandert (een andere foto op dezelfde plek hoeft niet).
  Meet dan opnieuw de breedte van elke `img[data-ei]` op schermbreedtes 390, 820, 1280 en 1920 en werk `src/content/beeldmaten.json` bij.
- **Cookiebanner**: de site plaatst nu geen tracking-cookies en heeft daarom geen banner nodig. Komt er Google Analytics of Tag Manager bij,
  plaats dan eerst een gecertificeerde cookiebanner (Cookiebot, CookieYes of Osano) met Consent Mode v2 in `Base.astro`, vóór de GTM-code.
