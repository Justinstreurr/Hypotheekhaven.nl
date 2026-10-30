import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

const site = (process.env.PUBLIC_SITE_URL || 'https://www.hypotheekhaven.nl').replace(/\/$/, '');

export default defineConfig({
  site,
  output: 'static',
  adapter: vercel(),
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  compressHTML: true,
  integrations: [
    sitemap({
      filter: page => !/\/(beheer|api)(\/|$)/.test(page) && !page.endsWith('/404'),
      serialize: item => ({ ...item, url: item.url.replace(/\/$/, '') || item.url, lastmod: new Date().toISOString() }),
    }),
  ],
  devToolbar: { enabled: false },
});
