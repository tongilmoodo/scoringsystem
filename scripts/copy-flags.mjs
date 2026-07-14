// Copies the 3x2 SVG flags from country-flag-icons into public/flags so
// Next.js can serve them self-hosted (works offline at the venue).
// Runs automatically via the postinstall script.
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const src = 'node_modules/country-flag-icons/3x2';
const dest = 'public/flags';

if (!existsSync(src)) {
  console.warn('country-flag-icons not installed yet; skipping flag copy.');
  process.exit(0);
}
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log('Copied flag SVGs to public/flags');
