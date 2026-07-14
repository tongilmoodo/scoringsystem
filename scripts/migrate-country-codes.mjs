// ONE-TIME migration: converts athletes.country_code values stored as full
// country names (e.g. "South Korea") to ISO 3166-1 alpha-2 codes ("KR").
// Values that cannot be matched are reported, NOT guessed.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-country-codes.mjs
//
// Run this BEFORE applying the ^[A-Z]{2}$ CHECK constraint on existing data.
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const isoCountries = require('i18n-iso-countries');
isoCountries.registerLocale(require('i18n-iso-countries/langs/en.json'));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const admin = createClient(url, key);

const names = isoCountries.getNames('en');
const codeSet = new Set(Object.keys(names));
const nameToCode = new Map(Object.entries(names).map(([code, name]) => [name.toLowerCase(), code]));
// Also accept official names and common aliases the package knows about.
for (const code of codeSet) {
  for (const alias of [].concat(isoCountries.getName(code, 'en', { select: 'all' }) ?? [])) {
    nameToCode.set(String(alias).toLowerCase(), code);
  }
}

function resolve(raw) {
  const q = String(raw ?? '').trim();
  if (!q) return null;
  const upper = q.toUpperCase();
  if (upper.length === 2 && codeSet.has(upper)) return upper;
  return nameToCode.get(q.toLowerCase()) ?? null;
}

const { data: athletes, error } = await admin.from('athletes').select('id, name, country_code');
if (error) {
  console.error('Failed to read athletes:', error.message);
  process.exit(1);
}

let updated = 0;
let alreadyOk = 0;
const unmatched = new Map(); // raw value -> athlete names

for (const a of athletes ?? []) {
  const raw = a.country_code;
  if (raw == null || String(raw).trim() === '') continue;
  const code = resolve(raw);
  if (code === raw) {
    alreadyOk++;
    continue;
  }
  if (code) {
    const { error: updError } = await admin.from('athletes').update({ country_code: code }).eq('id', a.id);
    if (updError) console.error(`  FAILED ${a.name}: ${updError.message}`);
    else {
      updated++;
      console.log(`  ${a.name}: "${raw}" -> ${code}`);
    }
  } else {
    if (!unmatched.has(raw)) unmatched.set(raw, []);
    unmatched.get(raw).push(a.name);
  }
}

console.log('\n===== MIGRATION REPORT =====');
console.log(`Updated:    ${updated}`);
console.log(`Already OK: ${alreadyOk}`);
if (unmatched.size === 0) {
  console.log('Unmatched:  none');
} else {
  console.log(`Unmatched:  ${unmatched.size} distinct value(s) - fix these manually:`);
  for (const [raw, list] of unmatched) {
    console.log(`  "${raw}" (${list.length} athlete(s)): ${list.join(', ')}`);
  }
  process.exitCode = 2;
}
