#!/usr/bin/env node
/**
 * Import-Skript: Supabase leads → AlpenGewerbe JSON-Dateien
 *
 * Verwendung:
 *   node scripts/import-from-supabase.js           # Vollimport
 *   node scripts/import-from-supabase.js --dry-run # Nur Vorschau (keine Dateien)
 *   node scripts/import-from-supabase.js --limit 10 # Nur N Datensätze
 *
 * Voraussetzung: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── CLI-Argumente
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT   = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i + 1]) : 0; })();

// ── .env laden
function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) {
    // Fallback: CRM-Projekt
    const crmEnv = '/Users/ivoengelhardt/Projekte/Eigene-Projekte/Greyboard/greyboard-crm/.env';
    if (existsSync(crmEnv)) return parseEnv(readFileSync(crmEnv, 'utf8'));
    throw new Error('.env nicht gefunden – SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen');
  }
  return parseEnv(readFileSync(envPath, 'utf8'));
}

function parseEnv(content) {
  return Object.fromEntries(
    content.split('\n')
      .filter(l => l.includes('=') && !l.startsWith('#'))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
  );
}

// ── Leistungen-Mapping
const leistungsMap = JSON.parse(readFileSync(join(__dirname, 'branchen-leistungen.json'), 'utf8'));

// ── Branche-Normalisierung (GHL → Slug)
const branchenSlugMap = {
  'Bodenleger':    'bodenleger',
  'Dachdecker':    'dachdecker',
  'Elektriker':    'elektriker',
  'Fliesenleger':  'fliesenleger',
  'Gartenbau':     'gartenbau',
  'Gipser':        'gipser',
  'Glaser':        'glaser',
  'Heizungsbauer': 'heizungsbauer',
  'Maler':         'maler',
  'Maurer':        'maurer',
  'Metallbau':     'metallbau',
  'Sanitär':       'sanitaer',
  'Heizungsbau':   'heizungsbauer',
  'Schreiner':     'schreiner',
  'Zimmermann':    'zimmermann',
};

// ── Slug generieren
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // é→e, è→e, à→a etc.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Adresse parsen (Fallback wenn city/postal_code fehlen)
function parseAddress(raw) {
  if (!raw) return { strasse: '', plz: '', ort: '' };
  // Format: "Str. 5, 8000 Zürich, Switzerland" oder "Str. 5, 8000 Zürich"
  const parts = raw.split(',').map(s => s.trim());
  const strasse = parts[0] || '';

  // PLZ und Ort aus zweitem Segment extrahieren
  const middle = parts[1] || '';
  const match = middle.match(/^(\d{4,5})\s+(.+)$/);
  const plz = match ? match[1] : '';
  const ort = match ? match[2] : middle;

  return { strasse, plz, ort };
}

// ── E-Mail validieren
function validEmail(email) {
  if (!email) return undefined;
  const cleaned = email.trim().replace(/^[%\s]+/, ''); // %20 und Leerzeichen am Anfang entfernen
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned);
  return ok ? cleaned : undefined;
}

// ── Website normalisieren
function normalizeWebsite(url) {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

// ── Supabase paginiert lesen
async function fetchAllLeads(supabaseUrl, key) {
  const pageSize = 500;
  const results = [];
  let offset = 0;

  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Accept': 'application/json',
    'Prefer': 'count=exact',
  };

  while (true) {
    const params = new URLSearchParams({
      select: '*',
      order:  'created_at.asc',
      limit:  String(LIMIT > 0 ? Math.min(pageSize, LIMIT - results.length) : pageSize),
      offset: String(offset),
    });

    const res = await fetch(`${supabaseUrl}/rest/v1/leads?${params}`, { headers });
    if (!res.ok) throw new Error(`Supabase HTTP ${res.status}: ${await res.text()}`);

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    results.push(...batch);
    offset += batch.length;

    process.stdout.write(`\r  Geladen: ${results.length} Datensätze...`);

    if (LIMIT > 0 && results.length >= LIMIT) break;
    if (batch.length < pageSize) break;
  }
  process.stdout.write('\n');
  return results;
}

// ── Lead → AlpenGewerbe JSON
function mapLead(lead) {
  const brancheSlug = branchenSlugMap[lead.industry] ?? slugify(lead.industry ?? 'sonstiges');
  const leistungen  = leistungsMap[brancheSlug] ?? [];

  // Adresse
  const parsed = parseAddress(lead.address);
  const strasse    = parsed.strasse;
  const plz        = (lead.postal_code || parsed.plz || '').toString().trim();
  const ort        = (lead.city || parsed.ort || '').trim();
  const land       = lead.country === 'LI' ? 'LI' : 'CH';

  // Slug: Firmenname + Ort für Eindeutigkeit
  const slug = slugify(`${lead.company_name}-${ort}`);

  // ID: "ch-" / "li-" + GHL-ID (kurz und stabil)
  const id = `${land.toLowerCase()}-${lead.ghl_id}`;

  // Website
  const webseite = normalizeWebsite(lead.website);

  // Description: icebreaker wenn vorhanden (gekürzt auf 300 Zeichen)
  const description = lead.icebreaker
    ? lead.icebreaker.slice(0, 300).trim()
    : undefined;

  return {
    id,
    slug,
    name:     lead.company_name,
    branchen: [brancheSlug],
    adresse: {
      strasse,
      plz,
      ort,
      ...(lead.state && land === 'CH' ? { kanton: lead.state.trim() } : {}),
      land,
    },
    kontakt: {
      ...(lead.phone           ? { telefon: lead.phone }         : {}),
      ...(validEmail(lead.email) ? { email: validEmail(lead.email) } : {}),
      ...(webseite               ? { webseite }                     : {}),
    },
    leistungen,
    ...(description ? { description } : {}),
  };
}

// ── Dateiname generieren
function filename(entry) {
  return `${entry.id}.json`;
}

// ── Main
async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  AlpenGewerbe Import${DRY_RUN ? ' (DRY-RUN)' : ''}${LIMIT ? ` (Limit: ${LIMIT})` : ''}`);
  console.log('══════════════════════════════════════════════════════════\n');

  const env = loadEnv();
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in .env');

  const outDir = join(ROOT, 'src/content/companies');
  if (!DRY_RUN && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Daten laden
  console.log('► Lade Leads aus Supabase...');
  const leads = await fetchAllLeads(SUPABASE_URL, SUPABASE_KEY);
  console.log(`  ${leads.length} Datensätze geladen.\n`);

  // Mapping + Statistik
  let written = 0, skipped = 0, slugCollisions = 0;
  const slugsSeen = new Map();
  const branchenStats = {};

  for (const lead of leads) {
    if (!lead.industry || !branchenSlugMap[lead.industry]) {
      console.warn(`  ⚠  Unbekannte Branche: "${lead.industry}" bei "${lead.company_name}" – übersprungen`);
      skipped++;
      continue;
    }

    let entry = mapLead(lead);

    // Slug-Kollision auflösen
    if (slugsSeen.has(entry.slug)) {
      entry = { ...entry, slug: `${entry.slug}-${slugsSeen.get(entry.slug) + 1}` };
      slugCollisions++;
    }
    slugsSeen.set(entry.slug, (slugsSeen.get(entry.slug) ?? 0) + 1);

    // Statistik
    branchenStats[entry.branchen[0]] = (branchenStats[entry.branchen[0]] ?? 0) + 1;

    if (DRY_RUN) {
      if (written < 3) {
        console.log(`  [Vorschau] ${filename(entry)}:`);
        console.log(JSON.stringify(entry, null, 2).split('\n').map(l => '    ' + l).join('\n'));
        console.log();
      }
    } else {
      writeFileSync(join(outDir, filename(entry)), JSON.stringify(entry, null, 2), 'utf8');
    }
    written++;
  }

  // Abschlussbericht
  console.log('── Ergebnis:\n');
  console.log(`  ✅ ${written} Einträge ${DRY_RUN ? 'gemappt (nicht gespeichert)' : 'geschrieben'}`);
  if (skipped)        console.log(`  ⚠  ${skipped} übersprungen (unbekannte Branche)`);
  if (slugCollisions) console.log(`  ℹ  ${slugCollisions} Slug-Kollisionen aufgelöst`);

  console.log('\n── Einträge pro Branche:\n');
  Object.entries(branchenStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([b, n]) => console.log(`  ${b.padEnd(20)} ${n}`));

  console.log('\n── Zielordner:', outDir);
  if (!DRY_RUN) console.log('\n  Nächster Schritt: npm run build\n');
}

main().catch(err => { console.error('\n❌ Fehler:', err.message); process.exit(1); });
