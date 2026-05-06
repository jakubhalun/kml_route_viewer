/**
 * Post-build inlining script.
 *
 * Angular's modern build outputs <script type="module"> which Chrome blocks
 * when the page is opened from the filesystem (file:// origin). This script
 * rewrites the generated index.html so that all external JS and CSS are inlined
 * directly, producing a single self-contained index.html that opens in Chrome
 * from file:/// without any CORS issues.
 *
 * The bundled JS produced by Angular/esbuild is already a fully self-contained
 * IIFE-style bundle (no bare import/export statements), so removing the
 * type="module" attribute is safe.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const browserDir = join(__dirname, 'dist', 'kml-route-viewer', 'browser');
const indexPath = join(browserDir, 'index.html');

let html = readFileSync(indexPath, 'utf8');

// --- Inline external CSS ---
// Replace <link rel="stylesheet" href="...css"> (and the media=print/onload variant)
// plus the <noscript> fallback, with a single <style> block.
const cssLinkRe = /<link rel="stylesheet" href="([^"]+\.css)"[^>]*>(<noscript>[^<]*<\/noscript>)?/g;
html = html.replace(cssLinkRe, (_match, href) => {
  const cssPath = join(browserDir, href);
  const css = readFileSync(cssPath, 'utf8');
  return `<style>${css}</style>`;
});

// --- Inline external JS ---
// Replace <script src="...js" type="module"> with an inline <script> (no type=module).
const jsScriptRe = /<script src="([^"]+\.js)" type="module"><\/script>/g;
html = html.replace(jsScriptRe, (_match, href) => {
  const jsPath = join(browserDir, href);
  const js = readFileSync(jsPath, 'utf8');
  // Wrap in an IIFE so the bundle's top-level variables don't pollute the global scope.
  return `<script>(function(){\n${js}\n})();</script>`;
});

// --- Remove <base href> (not needed when everything is inline) ---
html = html.replace(/<base href="[^"]*"\s*\/?>/g, '');

writeFileSync(indexPath, html, 'utf8');

console.log(`✔ index.html inlined successfully (${Math.round(html.length / 1024)} kB)`);
