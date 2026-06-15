# Projekt: AlpenGewerbe
Technisches Konzept und Implementierungs-Roadmap für ein dateibasiertes Handwerker-Branchenbuch (Astro + Cloudflare Pages).

## 1. System-Architektur
- **Framework:** Astro (Hybrid-Modus für Cloudflare Pages)
- **Datenhaltung:** Reine JSON-Dateien in `src/content/companies/` (Keine SQL/NoSQL-Datenbank)
- **Styling:** Tailwind CSS
- **Deployment:** Cloudflare Pages
- **API-Integration:** Google Places API via Build-Time Sync-Skript (Vermeidung von Live-API-Kosten)

---

## 2. Datenstruktur & Validierung
Jeder Betrieb wird als JSON-Datei gespeichert. Die Validierung erfolgt über Astro Content Collections mit Zod (`src/content/config.ts`).

### Schema-Spezifikation (Zod)
- `id`: String (z.B. "ch-12345")
- `slug`: String (URL-konform)
- `name`: String
- `branchen`: Array von Strings (z.B. `["schreiner", "innenausbau"]`)
- `adresse`: Objekt { strasse, plz, ort, land: "CH" | "LI" }
- `kontakt`: Objekt { telefon, email, webseite }
- `googlePlaceId`: String (für den API-Sync)
- `ratingCached`: Objekt für Google-Daten { rating, user_ratings_total, reviews: Array, last_updated }

---

## 3. SEO & Routing-Struktur
- **Startseite:** `/` (Suche & Top-Branchen)
- **Kategorie:** `/[branche]/` (z.B. `/schreiner/`)
- **Region:** `/[branche]/[ort]/` (z.B. `/schreiner/vaduz/`)
- **Detailseite:** `/betrieb/[slug]/` (Inklusive `LocalBusiness` JSON-LD Schema für Google-Sterne)

---

## 4. Implementierungs-Roadmap (Taskliste für Claude)

### Phase 1: Initialisierung & Configuration
- [x] `[TASK-1.1]` Neues Astro-Projekt für Cloudflare Pages aufsetzen.
- [x] `[TASK-1.2]` Tailwind CSS integrieren und Basis-Layout (Header/Footer) erstellen.
- [x] `[TASK-1.3]` Astro Content Collection für `companies` in `src/content/config.ts` definieren.
- [x] `[TASK-1.4]` Drei Dummy-JSON-Dateien in `src/content/companies/` anlegen (2x CH, 1x LI).

### Phase 2: Google Places API Sync (Backend/Build-Skript)
- [x] `[TASK-2.1]` Node.js-Skript `scripts/sync-google.js` erstellen, das JSON-Dateien einliest und mit der Google API abgleicht.
- [x] `[TASK-2.2]` Fehlerbehandlung und Rate-Limiting für die Google API im Skript einbauen.
- [ ] `[TASK-2.3]` Lokales Caching-Verhalten testen (Daten in JSON zurückschreiben). [Benötigt GOOGLE_PLACES_API_KEY in .env]

### Phase 3: Frontend & Routing
- [x] `[TASK-3.1]` Dynamische Detailseite `src/pages/betrieb/[slug].astro` mit Google-Reviews-Anzeige bauen.
- [x] `[TASK-3.2]` SEO-Komponente für das `LocalBusiness` JSON-LD Schema erstellen.
- [x] `[TASK-3.3]` Kategorieseiten `/[branche]/` und Regionalseiten `/[branche]/[ort]/` mit Filter-Logik aufbauen.
- [x] `[TASK-3.4]` Einfache, performante Suchfunktion (Client-seitig auf JSON-Basis) für die Startseite bauen.

### Phase 4: Deployment & Automation
- [x] `[TASK-4.1]` GitHub Actions Workflow erstellen, der das Sync-Skript täglich ausführt und Änderungen via Git pusht.
- [ ] `[TASK-4.2]` Cloudflare Pages Deployment konfigurieren.

---

## 5. Hinweise für Claude Code
- Arbeite die Tasks sequenziell ab.
- Markiere erledigte Tasks in dieser Datei mit `[x]`.
- Schreibe sauberen, performanten TypeScript-Code ohne unnötige Client-seitige JavaScript-Hydrierung (Astro Server-First Prinzip).
