// Single source of truth for countries: the i18n-iso-countries package.
// Do not hardcode country lists anywhere else in the app.
import isoCountries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

isoCountries.registerLocale(en);

export interface Country {
  code: string; // ISO 3166-1 alpha-2, e.g. "KE"
  name: string; // e.g. "Kenya"
}

export const COUNTRIES: Country[] = Object.entries(isoCountries.getNames('en'))
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** 2-letter ISO code -> flag emoji via Unicode regional indicator symbols. */
export function getFlagEmoji(code: string): string {
  if (!code || code.length !== 2) return '';
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

/**
 * Self-hosted SVG flag from country-flag-icons (copied to public/flags by
 * scripts/copy-flags.mjs on install). Use for big displays/TVs where emoji
 * rendering is inconsistent across OS/browsers.
 */
export function getFlagUrl(code: string): string {
  return `/flags/${code?.toUpperCase()}.svg`;
}

/** Full English name for an ISO code; falls back to the code itself. */
export function countryName(code: string): string {
  if (!code) return '';
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code;
}

/** Resolve free-text input (code or name, case-insensitive) to an ISO code. */
export function resolveCountry(input: string): string | null {
  if (!input) return null;
  const q = input.trim().toLowerCase();
  if (!q) return null;
  const byCode = COUNTRIES.find((c) => c.code.toLowerCase() === q);
  if (byCode) return byCode.code;
  const byName = COUNTRIES.find((c) => c.name.toLowerCase() === q);
  return byName?.code ?? null;
}
