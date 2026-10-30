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
   Lokaal (`npm run dev`) worden de bestanden in `src/` opgeslagen en gecommit in de lokale git-repository.

Je kunt vrij tussen pagina's wisselen: wat je aanpast blijft bewaard (in de browser) tot je publiceert, en
**Publiceren** zet alles van alle pagina's in één keer live.

Wil je de site gewoon gebruiken (menu openen, tabbladen wisselen) zonder dat een klik iets gaat bewerken?
Zet in de werkbalk de schakelaar op **Klikken = website gebruiken**.

### Lijsten (FAQ's en reviews)

Ga met de muis over een vraag of review: er verschijnen knoppen om het item omhoog of omlaag te zetten,
een nieuw item eronder toe te voegen of het te verwijderen. Bij een review kies je ook de bron (Google of Trustoo).

### Blog

- **Nieuw artikel**: op `/blog` staat in de werkbalk **+ Nieuw artikel**. Het artikel begint als *concept*: alleen jij
  ziet het, het staat niet in het overzicht, niet in de sitemap en Google indexeert het niet.
- Schrijf het artikel op de pagina zelf. In de artikeltekst maak je met de knoppen een **Tussenkop**, **Kleine kop**,
  **Opsomming** of vetgedrukte tekst; de inhoudsopgave ontstaat vanzelf uit de tussenkoppen. Vragen voeg je toe onder
  "Veelgestelde vragen".
- Via **Artikel** in de werkbalk (of **Artikel-instellingen** bij een kaart in het overzicht) stel je de status in
  (*Concept*, *Gepubliceerd* of *Binnenkort*), het onderwerp, de datum, de teksten voor Google en de foto in het overzicht.
  Daar kun je een artikel ook verwijderen.
- Het artikel "Hoeveel kan ik lenen?" heeft een eigen, handgemaakte pagina (`src/pages/blog/hoeveel-kan-ik-lenen.astro`);
  nieuwe artikelen gebruiken het sjabloon `src/pages/blog/[slug].astro`.

### Ongedaan maken en back-ups

- **↶ Ongedaan maken** (of Ctrl+Z) draait de laatste nog niet gepubliceerde wijziging terug, stap voor stap.
- Elke publicatie is een versie: online een commit op GitHub, lokaal een git-commit. Onder **Geschiedenis** zie je alle
  versies en zet je met **Terugzetten** de hele site terug naar een eerdere versie. Dat wordt zelf ook weer een versie,
  dus ook terugzetten is altijd terug te draaien. Verwijderde artikelen en foto's komen zo ook terug.
- Daar staat ook de knop om alle nog niet gepubliceerde wijzigingen in één keer weg te gooien.

## Hoe het in elkaar zit

| Map / bestand | Inhoud |
| --- | --- |
| `src/content/site.json` | Teksten die op elke pagina staan: menu, footer, scores, banklogo-tekst |
| `src/content/pages/*.json` | Per pagina: `meta` (titel en omschrijving voor Google), `t` (teksten), `i` (foto's), `l` (lijsten zoals de FAQ) |
| `src/content/blog/*.json` | Eén bestand per blogartikel: `artikel` (status, onderwerp, datum) plus dezelfde `meta`, `t`, `i` en `l` |
| `src/content/pages/blog-artikel.json` | Vaste teksten die in elk nieuw artikel staan (auteur, delen, afsluiting) |
| `src/content/beeldmaten.json` | Gemeten breedte van elke foto, zodat de browser niet groter downloadt dan nodig |
| `src/assets/img/` | Alle foto's; Astro maakt er bij het bouwen WebP-versies in de juiste formaten van. Nieuwe foto's uit de bewerkmodus komen in `uploads/` |
| `src/pages/` | Eén bestand per pagina. Elk bewerkbaar element heeft `data-e="<bestand>:<sleutel>"`, een lijst `data-el="<bestand>:<lijst>"` met items `data-item` |
| `src/components/` | Gedeelde blokken: header, footer, hero-scores, banklogo's, logo en `Img` |
| `src/layouts/Base.astro` | `<head>` met SEO, Open Graph, gestructureerde data, lettertypes en de lader van de bewerkmodus |
| `src/lib/` | `content.ts` (content laden), `seo.ts` (JSON-LD, kruimelpaden), `site.ts` (domein en bedrijfsgegevens), `beheer.ts` (inloggen en publiceren) |
| `src/pages/api/` | Serverfuncties: inloggen, inhoud lezen, publiceren, blogartikelen, geschiedenis en het contactformulier |
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
