#!/usr/bin/env node
/**
 * Google Places API Sync
 * Liest alle JSON-Dateien aus src/content/companies/, ruft für jeden Eintrag
 * mit googlePlaceId die Google Places API auf und schreibt ratingCached zurück.
 *
 * Benötigt: GOOGLE_PLACES_API_KEY in .env
 * Aufruf:   node scripts/sync-google.js [--dry-run] [--id <slug>]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPANIES_DIR = path.join(__dirname, '../src/content/companies');

// CLI-Argumente
const args = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const ONLY_ID  = args[args.indexOf('--id') + 1] ?? null;

// Rate-Limiting: Pause zwischen API-Calls
const RATE_LIMIT_MS = 300;
const MAX_REVIEWS   = 5;

// ── Hilfsfunktionen ─────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.error('Fehler: GOOGLE_PLACES_API_KEY nicht gesetzt.');
    console.error('Bitte in .env definieren und Datei vor dem Skript laden:');
    console.error('  export $(cat .env | xargs) && node scripts/sync-google.js');
    process.exit(1);
  }
  return key;
}

/**
 * Ruft Google Places Details API (v1) ab.
 * Felder: rating, userRatingCount, reviews
 */
async function fetchPlaceDetails(placeId, apiKey) {
  const fields = [
    'rating',
    'userRatingCount',
    'reviews',
  ].join(',');

  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&languageCode=de`;

  const response = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API-Fehler ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Transformiert Google Places API v1 Response in ratingCached-Format.
 */
function transformToRatingCached(data) {
  const reviews = (data.reviews ?? [])
    .slice(0, MAX_REVIEWS)
    .map((r) => ({
      author_name:               r.authorAttribution?.displayName ?? 'Anonym',
      rating:                    r.rating ?? 0,
      text:                      r.text?.text ?? '',
      time:                      r.publishTime
                                   ? Math.floor(new Date(r.publishTime).getTime() / 1000)
                                   : 0,
      relative_time_description: r.relativePublishTimeDescription ?? '',
    }));

  return {
    rating:              data.rating ?? 0,
    user_ratings_total:  data.userRatingCount ?? 0,
    reviews,
    last_updated:        new Date().toISOString(),
  };
}

// ── Haupt-Logik ───────────────────────────────────────────────────────────────

async function syncCompany(filePath, apiKey) {
  const raw      = await fs.readFile(filePath, 'utf-8');
  const company  = JSON.parse(raw);
  const filename = path.basename(filePath);

  if (!company.googlePlaceId) {
    console.log(`  ⏭  ${filename}: Kein googlePlaceId, übersprungen.`);
    return { updated: false };
  }

  if (ONLY_ID && company.slug !== ONLY_ID) {
    return { updated: false };
  }

  console.log(`  🔍 ${company.name} (${company.googlePlaceId})`);

  let data;
  try {
    data = await fetchPlaceDetails(company.googlePlaceId, apiKey);
  } catch (err) {
    console.error(`  ✗  API-Fehler für ${filename}: ${err.message}`);
    return { updated: false, error: true };
  }

  const ratingCached = transformToRatingCached(data);

  if (DRY_RUN) {
    console.log(`  ✔  [dry-run] ${company.name}: ${ratingCached.rating}★ (${ratingCached.user_ratings_total} Bewertungen)`);
    return { updated: false };
  }

  // Zod-Validierung überspringen im Skript; Astro validiert beim Build.
  company.ratingCached = ratingCached;

  await fs.writeFile(filePath, JSON.stringify(company, null, 2) + '\n', 'utf-8');
  console.log(`  ✔  ${company.name}: ${ratingCached.rating}★ (${ratingCached.user_ratings_total} Bewertungen) – gespeichert`);

  return { updated: true };
}

async function main() {
  console.log(`\nAlpenGewerbe – Google Places Sync ${DRY_RUN ? '[DRY RUN]' : ''}`);
  console.log('─'.repeat(50));

  const apiKey = getApiKey();

  const files = (await fs.readdir(COMPANIES_DIR))
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(COMPANIES_DIR, f));

  if (files.length === 0) {
    console.log('Keine JSON-Dateien in src/content/companies/ gefunden.');
    return;
  }

  let updated = 0;
  let errors  = 0;

  for (const file of files) {
    const result = await syncCompany(file, apiKey);
    if (result.updated) updated++;
    if (result.error)   errors++;
    await sleep(RATE_LIMIT_MS);
  }

  console.log('─'.repeat(50));
  console.log(`Fertig: ${updated} aktualisiert, ${errors} Fehler, ${files.length - updated - errors} übersprungen.\n`);

  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});
