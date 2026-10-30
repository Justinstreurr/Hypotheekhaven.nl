import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';

const site = (process.env.PUBLIC_SITE_URL || 'https://www.hypotheekhaven.nl').replace(/\/$/, '');

// Blogartikelen die nog concept zijn, horen niet in de sitemap
const blogMap = new URL('./src/content/blog/', import.meta.url);
const concepten = fs.readdirSync(blogMap)
  .filter(f => f.endsWith('.json') && JSON.parse(fs.readFileSync(new URL(f, blogMap), 'utf8')).artikel.status === 'concept')
  .map(f => `/blog/${f.replace(/\.json$/, '')}`);

export default defineConfig({
  site,
  output: 'static',
  adapter: vercel(),
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  compressHTML: true,
  integrations: [
    sitemap({
      filter: page => {
        const pad = new URL(page).pathname.replace(/\/$/, '');
        return !/^\/(beheer|api)(\/|$)/.test(pad) && pad !== '/404' && !concepten.includes(pad);
      },
      serialize: item => ({ ...item, url: item.url.replace(/\/$/, '') || item.url, lastmod: new Date().toISOString() }),
    }),
  ],
  devToolbar: { enabled: false },
});
