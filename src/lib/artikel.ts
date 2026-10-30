// Artikeltekst uit de bewerkmodus (h2, h3, p, lijsten) opdelen in secties per tussenkop,
// zodat de inhoudsopgave en de opmaak gelijk zijn aan het handgemaakte artikel.

const kaal = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

export const slugVan = (tekst: string) => kaal(tekst).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'sectie';

export interface Sectie { id?: string; titel?: string; html: string }

export function verdeel(inhoud: string): Sectie[] {
  const delen = inhoud.split(/(?=<h2[\s>])/i);
  const gebruikt = new Set<string>();
  return delen.filter(d => d.trim()).map(deel => {
    const kop = deel.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (!kop) return { html: deel };
    let id = slugVan(kop[1]);
    while (gebruikt.has(id)) id += '-2';
    gebruikt.add(id);
    return { id, titel: kaal(kop[1]), html: deel.replace(/^<h2[^>]*>/i, `<h2 id="${id}-titel">`) };
  });
}
