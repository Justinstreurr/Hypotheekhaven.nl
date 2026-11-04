// Aanvragen via het contactformulier: naast de e-mail ook bewaard in de beheeromgeving (/beheer/aanvragen),
// zodat er geen aanvraag verloren gaat als een mail in spam belandt of niet verstuurd kon worden.
// Opslag in dezelfde Upstash Redis-database als de statistieken (lokaal: .data/statistiek.json).
// Bewaartermijn: 12 maanden na ontvangst, daarna automatisch verwijderd (zie de privacyverklaring).
import { randomUUID } from 'node:crypto';
import { opslag, statistiekBeschikbaar } from './statistiek';

const SLEUTEL = 'aanvragen';
const BEWAAR_MS = 365 * 24 * 60 * 60 * 1000;

export type Status = 'nieuw' | 'gelezen' | 'afgehandeld';
export const STATUSSEN: Status[] = ['nieuw', 'gelezen', 'afgehandeld'];

export interface Aanvraag {
  id: string;
  tijd: string; // ISO-datum van ontvangst
  naam: string;
  email: string;
  telefoon: string;
  onderwerp: string;
  voorkeur: string;
  bericht: string;
  status: Status;
  mail: boolean | null; // is de e-mail verstuurd? null = nog onbekend
}

export const aanvragenBeschikbaar = statistiekBeschikbaar;

const lees = (s: unknown): Aanvraag | null => {
  try { return typeof s === 'string' ? (JSON.parse(s) as Aanvraag) : null; } catch { return null; }
};

export async function bewaarAanvraag(v: Omit<Aanvraag, 'id' | 'tijd' | 'status' | 'mail'>): Promise<string> {
  const a: Aanvraag = { id: randomUUID(), tijd: new Date().toISOString(), status: 'nieuw', mail: null, ...v };
  await opslag([['HSET', SLEUTEL, a.id, JSON.stringify(a)]]);
  return a.id;
}

async function wijzig(id: string, aanpassing: Partial<Aanvraag>) {
  const [ruw] = await opslag([['HGET', SLEUTEL, id]]);
  const a = lees(ruw);
  if (!a) return false;
  await opslag([['HSET', SLEUTEL, id, JSON.stringify({ ...a, ...aanpassing, id: a.id })]]);
  return true;
}

export const zetMail = (id: string, verstuurd: boolean) => wijzig(id, { mail: verstuurd });
export const zetStatus = (id: string, status: Status) => wijzig(id, { status });

export async function verwijderAanvraag(id: string) {
  const [n] = await opslag([['HDEL', SLEUTEL, id]]);
  return Number(n) > 0;
}

// Alle aanvragen, nieuwste eerst. Ruimt meteen aanvragen op die ouder zijn dan de bewaartermijn.
export async function alleAanvragen(): Promise<Aanvraag[]> {
  const [plat] = await opslag([['HGETALL', SLEUTEL]]);
  const lijst = (Array.isArray(plat) ? plat : []) as unknown[];
  const grens = Date.now() - BEWAAR_MS;
  const goed: Aanvraag[] = [], oud: string[] = [];
  for (let i = 0; i < lijst.length; i += 2) {
    const a = lees(lijst[i + 1]);
    if (!a) continue;
    if (Date.parse(a.tijd) < grens) oud.push(a.id); else goed.push(a);
  }
  if (oud.length) await opslag([['HDEL', SLEUTEL, ...oud]]);
  return goed.sort((a, b) => b.tijd.localeCompare(a.tijd));
}
