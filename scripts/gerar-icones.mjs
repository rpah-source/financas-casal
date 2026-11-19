// Gera os ícones PNG do PWA a partir de um SVG. Uso: node scripts/gerar-icones.mjs
// (Precisa do Playwright; só é usado por quem desenvolve, não no deploy.)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { writeFileSync } from 'node:fs';

const svg = (padding) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#2E6B5A"/>
  <g transform="translate(${padding} ${padding}) scale(${(512 - 2 * padding) / 512})">
    <rect x="120" y="270" width="64" height="120" rx="18" fill="#F6F5F1" opacity="0.75"/>
    <rect x="224" y="200" width="64" height="190" rx="18" fill="#F6F5F1" opacity="0.88"/>
    <rect x="328" y="122" width="64" height="268" rx="18" fill="#F6F5F1"/>
  </g>
</svg>`;

const alvos = [
  { arquivo: 'public/icons/icon-192.png', tamanho: 192, padding: 0 },
  { arquivo: 'public/icons/icon-512.png', tamanho: 512, padding: 0 },
  { arquivo: 'public/icons/apple-touch-icon.png', tamanho: 180, padding: 0 },
  { arquivo: 'public/icons/icon-maskable-512.png', tamanho: 512, padding: 60 },
];

const browser = await chromium.launch();
for (const { arquivo, tamanho, padding } of alvos) {
  const page = await browser.newPage({ viewport: { width: tamanho, height: tamanho } });
  await page.setContent(`<style>html,body{margin:0}svg{width:${tamanho}px;height:${tamanho}px;display:block}</style>${svg(padding)}`);
  writeFileSync(arquivo, await page.screenshot({ type: 'png' }));
  await page.close();
}
await browser.close();
console.log('Ícones gerados.');
