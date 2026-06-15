#!/usr/bin/env node
/**
 * Google Places Anreicherung für AlpenGewerbe
 *
 * Verwendung:
 *   node scripts/fetch-google-data.js              # Alle (noch nicht geholten)
 *   node scripts/fetch-google-data.js --limit 10   # Nur N Betriebe
 *   node scripts/fetch-google-data.js --dry-run    # Kein Schreiben
 *   node scripts/fetch-google-data.js --id <slug>  # Einzelner Betrieb
 */

import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lokale .env zuerst, Fallback auf Greyboard-Projekt
dotenv.config({ path: path.join(__dirname, '../.env') });
if (!process.env.GOOGLE_PLACES_API_KEY) {
  dotenv.config({ path: '/Users/ivoengelhardt/Projekte/Eigene-Projekte/Greyboard/greyboard-astro/.env' });
}
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) { console.error('❌ GOOGLE_PLACES_API_KEY fehlt'); process.exit(1); }

// CLI-Argumente
const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const LIMIT      = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i+1]) : 0; })();
const ONLY_ID    = (() => { const i = args.indexOf('--id');    return i !== -1 ? args[i+1] : null; })();

const COMPANIES_DIR = path.join(__dirname, '../src/content/companies');
const IMAGES_DIR    = path.join(__dirname, '../public/images/reviews');

const PLACES_BASE   = 'https://places.googleapis.com/v1';
const DELAY_MS      = 220;   // Rate-Limiting zwischen Betrieben
const MAX_REVIEWS   = 5;     // Nur Top-5-Rezensionen

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(icon, msg, ...rest) {
  const time = new Date().toTimeString().slice(0, 8);
  console.log(`${time} ${icon} ${msg}`, ...rest);
}

async function textSearch(query) {
  const res = await axios.post(
    `${PLACES_BASE}/places:searchText`,
    { textQuery: query, languageCode: 'de' },
    {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName',
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );
  const places = res.data?.places;
  if (!places || places.length === 0) return null;
  return {
    placeId:     places[0].id,
    officialName: places[0].displayName?.text ?? null,
  };
}

async function placeDetails(placeId) {
  const res = await axios.get(
    `${PLACES_BASE}/places/${placeId}`,
    {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'displayName,rating,userRatingCount,regularOpeningHours,reviews,editorialSummary',
        'Accept-Language': 'de',
      },
      timeout: 10000,
    }
  );
  return res.data;
}

async function downloadImage(url, destPath) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    await fs.outputFile(destPath, res.data);
    return true;
  } catch {
    return false;
  }
}

// ── Haupt-Logik ───────────────────────────────────────────────────────────────

async function processCompany(filePath) {
  const company = await fs.readJson(filePath);

  // Checkpoint: schon verarbeitet?
  if (company.google_fetched === true) return 'skipped';

  const { name, adresse, slug } = company;
  if (!name || !adresse?.ort) return 'skipped';

  // Schritt 1: Text Search → Place ID + offizieller Name
  const query   = [name, adresse.strasse, `${adresse.plz} ${adresse.ort}`, adresse.land === 'LI' ? 'Liechtenstein' : 'Schweiz']
    .filter(Boolean).join(', ');

  let placeId, officialName;
  try {
    const found = await textSearch(query);
    if (!found) { log('⚠ ', `Nicht gefunden: ${name}`); return 'not_found'; }
    placeId     = found.placeId;
    officialName = found.officialName;
  } catch (err) {
    log('❌', `Text Search Fehler für ${name}:`, err.message);
    return 'error';
  }

  // Schritt 2: Place Details
  let details;
  try {
    details = await placeDetails(placeId);
  } catch (err) {
    log('❌', `Details Fehler für ${name}:`, err.message);
    return 'error';
  }

  const rating        = details.rating ?? null;
  const ratingCount   = details.userRatingCount ?? 0;
  const rawReviews    = details.reviews?.slice(0, MAX_REVIEWS) ?? [];
  const openingHours  = details.regularOpeningHours?.weekdayDescriptions ?? [];
  const editorialText = details.editorialSummary?.text ?? null;

  // Schritt 3: Reviewer-Bilder herunterladen
  const reviewsWithLocalImages = [];
  const imgDir = path.join(IMAGES_DIR, slug);

  for (let i = 0; i < rawReviews.length; i++) {
    const r    = rawReviews[i];
    const photoUrl = r.authorAttribution?.photoUri ?? null;
    let   localPath = null;

    if (photoUrl && !DRY_RUN) {
      const destFile = path.join(imgDir, `reviewer_${i + 1}.jpg`);
      const ok = await downloadImage(photoUrl, destFile);
      if (ok) localPath = `/images/reviews/${slug}/reviewer_${i + 1}.jpg`;
    }

    reviewsWithLocalImages.push({
      author_name:              r.authorAttribution?.displayName ?? 'Anonym',
      author_photo:             localPath ?? r.authorAttribution?.photoUri ?? null,
      rating:                   r.rating ?? 0,
      text:                     r.text?.text ?? '',
      time:                     r.publishTime ? Math.floor(new Date(r.publishTime).getTime() / 1000) : 0,
      relative_time_description: r.relativePublishTimeDescription ?? '',
    });
  }

  // Schritt 4: JSON aktualisieren
  const updated = {
    ...company,
    name:          officialName ?? name,   // offizieller Google-Name
    googlePlaceId: placeId,
    google_fetched: true,
    ...(editorialText ? { description: editorialText } : {}),
    ...(openingHours.length ? { openingHours } : {}),
    ...(rating !== null ? {
      ratingCached: {
        rating,
        user_ratings_total: ratingCount,
        reviews:            reviewsWithLocalImages,
        last_updated:       new Date().toISOString().split('T')[0],
      }
    } : {}),
  };

  if (!DRY_RUN) {
    await fs.writeJson(filePath, updated, { spaces: 2 });
  }

  return 'done';
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Google Places Anreicherung${DRY_RUN ? ' (DRY-RUN)' : ''}${LIMIT ? ` — max. ${LIMIT}` : ''}`);
  console.log('══════════════════════════════════════════════════════════\n');

  const files = (await fs.readdir(COMPANIES_DIR))
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(COMPANIES_DIR, f));

  // Einzelner Betrieb via --id
  const queue = ONLY_ID
    ? files.filter(f => path.basename(f).includes(ONLY_ID))
    : files;

  if (LIMIT > 0) queue.splice(LIMIT);

  log('ℹ ', `${queue.length} Dateien in der Warteschlange`);

  const stats = { done: 0, skipped: 0, not_found: 0, error: 0 };

  for (let i = 0; i < queue.length; i++) {
    const result = await processCompany(queue[i]);
    stats[result] = (stats[result] ?? 0) + 1;

    if (result === 'done') {
      const company = await fs.readJson(queue[i]);
      log('✅', `[${i+1}/${queue.length}] ${company.name} (${company.ratingCached?.rating ?? '–'} ★)`);
    } else if (result === 'not_found') {
      const company = await fs.readJson(queue[i]);
      log('🔍', `[${i+1}/${queue.length}] Nicht gefunden: ${company.name}`);
    } else if (result === 'skipped') {
      if ((i + 1) % 100 === 0) log('⏭ ', `${i+1}/${queue.length} (${stats.skipped} übersprungen)`);
    }

    if (result !== 'skipped') await sleep(DELAY_MS);
  }

  console.log('\n── Abschlussbericht:\n');
  console.log(`  ✅ Verarbeitet:    ${stats.done}`);
  console.log(`  ⏭  Übersprungen:   ${stats.skipped}`);
  console.log(`  🔍 Nicht gefunden: ${stats.not_found}`);
  console.log(`  ❌ Fehler:         ${stats.error}`);
  console.log();
}

main().catch(err => { console.error('\n❌ Fataler Fehler:', err.message); process.exit(1); });
