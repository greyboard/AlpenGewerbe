// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://alpengewerbe.ch';

export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
  site: SITE_URL,
  trailingSlash: 'always',

  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/impressum/') &&
        !page.includes('/datenschutz/'),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
