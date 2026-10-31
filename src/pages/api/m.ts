import type { APIRoute } from 'astro';
import { verwerk, type Gebeurtenis } from '../../lib/statistiek';

export const prerender = false;

// Ontvangt anonieme meetgegevens van de site (navigator.sendBeacon, platte tekst met JSON)
const ROBOT = /bot|crawl|spider|slurp|lighthouse|headless|preview|monitor|curl|wget|python|axios|node-fetch|go-http|okhttp|java\/|scrapy|facebookexternalhit|^$/i;

export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  const leeg = new Response(null, { status: 204 });
  const agent = request.headers.get('user-agent') ?? '';
  const origin = request.headers.get('origin');
  if (ROBOT.test(agent) || !agent.startsWith('Mozilla/') || origin !== new URL(request.url).origin) return leeg; // browsers sturen bij een POST altijd Origin mee
  if (cookies.get('hh_edit')?.value === '1') return leeg; // eigen bezoeken in de bewerkmodus tellen niet mee
  const tekst = await request.text();
  if (tekst.length > 20_000) return leeg;
  try {
    const lijst = JSON.parse(tekst) as Gebeurtenis[];
    if (Array.isArray(lijst)) await verwerk(lijst, { ip: clientAddress, agent });
  } catch (e) {
    console.error('meten', e);
  }
  return leeg;
};
