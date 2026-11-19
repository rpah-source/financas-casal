import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

/**
 * Content-Security-Policy (SPEC 11). Só entra no build: o servidor de
 * desenvolvimento do Vite precisa de scripts inline.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://apis.google.com https://www.gstatic.com https://ssl.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://ssl.gstatic.com https://www.gstatic.com https://drive-thirdparty.googleusercontent.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://sheets.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://content.googleapis.com",
  "frame-src https://accounts.google.com https://docs.google.com https://drive.google.com https://content.googleapis.com https://apis.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

/**
 * Gera o service worker no build com a lista de arquivos do "app shell"
 * e uma versão única. Mudou o build → mudou o sw.js → o navegador
 * percebe que há versão nova (aviso "Atualização disponível").
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'app-shell-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter(
        (f) => !f.endsWith('.map') && f !== 'sw.js',
      );
      const shell = ['./', ...files.map((f) => `./${f}`), './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
      const version = Date.now().toString(36);
      const source = `// Gerado no build. Não editar.
const CACHE = 'shell-${version}';
const SHELL = ${JSON.stringify(shell)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Só o app shell vem do cache. Dados (APIs do Google) sempre vão à rede.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./')));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Caminhos relativos: o mesmo build funciona no GitHub Pages
  // (/financas-casal/) e no Cloudflare Pages (/).
  base: './',
  plugins: [preact(), cspPlugin(), serviceWorkerPlugin()],
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
