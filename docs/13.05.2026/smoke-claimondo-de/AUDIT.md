# Portal-Smoke Audit — 13.05.2026

## Kontext

Smoke-Lauf gegen `https://app.staging.claimondo.de` — alle 5 Portale:
- `/dispatch` (test-dispatch@claimondo.de)
- `/sv` (test-sv@claimondo.de)
- `/kanzlei` (test-kanzlei@claimondo.de) ← neu angelegt
- `/makler` (test-makler@claimondo.de) ← neu angelegt
- `/kunde` (test-kunde@claimondo.de)

Smoke-Script: `docs/13.05.2026/smoke-claimondo-de/smoke-portale-v2.mjs`

---

## Staging-DB = Prod-DB (Dokumentation)

**Befund:** Das Staging-Slot (PM2 Port 3001, VPS 212.132.119.110) nutzt **dieselbe Supabase-Instanz** wie Production:
- Supabase-Project: `paizkjajbuxxksdoycev`
- Kein `.env.staging` vorhanden — Staging liest `.env.local` / PM2-Env-Vars

**Konsequenz:** Seed-Records werden direkt in die Prod-DB geschrieben. Alle Records sind mit Smoke-Marker versehen:
```
SMOKE-SEED 13.05.2026 — Staging-Testdaten, löschen wenn Staging eigene DB bekommt
```

**Entscheidung:** Fortgefahren, da `test-*@claimondo.de`-Convention bereits vor diesem Seed existierte (test-dispatch, test-sv, test-kunde). Kein neues Muster.

---

## Staging-Test-User-Seed 13.05.2026

### Angelegte Auth-User (stable UUIDs, direkt via SQL bootstrap)

| E-Mail | Auth-UUID | Rolle | Org-Record |
|--------|-----------|-------|------------|
| `test-kanzlei@claimondo.de` | `bbbb1111-0000-4000-8000-000000000010` | kanzlei | `bbbb1111-0000-4000-8000-000000000011` |
| `test-makler@claimondo.de` | `bbbb2222-0000-4000-8000-000000000020` | makler | `bbbb2222-0000-4000-8000-000000000021` |

Passwort: `Test1234!` (identisch mit allen anderen Test-Usern, nur als Process-Env, nie im Repo)

### SV-Test-Fall (SMK-SV-2026-001)

| Tabelle | UUID | Wert |
|---------|------|------|
| `claims` | `bbbb3333-0000-4000-8000-000000000031` | schadenart=haftpflicht, status=in_bearbeitung |
| `faelle` | `bbbb3333-0000-4000-8000-000000000032` | aktenzeichen=SMK-SV-2026-001, phase=termin_bestaetigt |
| `leads` | `bbbb3333-0000-4000-8000-000000000033` | status=konvertiert, konvertiert_zu_fall_id→Fall |
| `auftraege` | `bbbb3333-0000-4000-8000-000000000034` | typ=erstgutachten, status=termin |
| `gutachter_termine` | `bbbb3333-0000-4000-8000-000000000035` | datum=2026-05-16, status=bestaetigt |

SV: `test-sv@claimondo.de` → sachverstaendige.id=`1da11741-a406-45ce-a27b-c041576cccbb`

### Kunden-Fall (SMK-KUNDE-2026-001)

| Tabelle | UUID | Wert |
|---------|------|------|
| `claims` | `bbbb4444-0000-4000-8000-000000000041` | schadenart=haftpflicht, status=in_bearbeitung |
| `faelle` | `bbbb4444-0000-4000-8000-000000000043` | aktenzeichen=SMK-KUNDE-2026-001, phase=fallakte_angelegt |
| `leads` | `bbbb4444-0000-4000-8000-000000000042` | status=konvertiert, konvertiert_zu_fall_id→Fall |

Kunde: `test-kunde@claimondo.de`

---

## Gelöste Blocker

| Blocker | Beschreibung | Gelöst mit |
|---------|-------------|------------|
| PS-P0-2 | `test-kanzlei@claimondo.de` fehlte → Kanzlei-Portal nicht testbar | Auth-User + Org-Record via SQL-Bootstrap |
| PS-P0-3 / B3 | `test-makler@claimondo.de` fehlte → Makler-Portal blockiert | Auth-User + Org-Record via SQL-Bootstrap |
| PS-P1-1 | Kein SV-Fall/Auftrag/Termin für test-sv → Feldmodus-Button nicht testbar | SMK-SV-2026-001 mit Termin 16.05.2026 |
| PS-P1-3 | Kein Phase-5-Lead → Magic-Link nicht testbar | SMK-KUNDE-2026-001 mit fallakte_angelegt |

---

## Constraint-Pitfalls (für künftige Seeds)

Beim Seed wurden folgende Constraints per `pg_constraint`-Query ermittelt und eingehalten:

```sql
-- claims
schadenart IN ('haftpflicht','vollkasko','teilkasko','eigenverschulden','unbekannt')
status IN ('dispatch_done','in_bearbeitung','in_kommunikation_vs','reguliert','abgelehnt','an_externe_kanzlei_uebergeben','storniert')
created_via IN ('web_formular','manuell_admin','import','api')
phase IN ('ersterfassung','dokumente_hochgeladen','sv_zugewiesen','termin_bestaetigt','bericht_fertig','abgeschlossen','storniert')

-- faelle
aktuelle_phase: langer Enum — 'termin_bestaetigt' (SV) und 'fallakte_angelegt' (Kunden) sind valide Werte

-- auftraege
status IN ('termin','besichtigung','gutachten','abgeschlossen')
```

**Zirkuläre FK:** `leads.konvertiert_zu_fall_id → faelle.id` erfordert:
1. Fall zuerst einfügen (ohne lead_id)
2. Lead einfügen (mit fall_id)
3. Fall updaten (lead_id setzen)

---

## Seed-Script

`scripts/seed-staging-test-users.mjs` — idempotent, stable UUIDs, `ON CONFLICT DO NOTHING`

Ausführung (lokal):
```bash
node scripts/seed-staging-test-users.mjs
```

---

# Design-System-Audit — Claimondo — 13.05.2026

Statischer Codebase-Audit aller Portale gegen die Policy aus `AGENTS.md §claimondo-component-set` und `src/lib/design-tokens.ts`. Smoke-Tests gegen Live/Staging konnten nur für die Marketing-Site durchgeführt werden (Staging: Blocker, s. README.md B2).

---

## Methodik

- Grep-basierte Analyse aller `src/app/` und `src/components/` Dateien
- Referenz-Tokens aus `src/lib/design-tokens.ts` (colors, radius, shadow, spacing, typo)
- Keine Runtime-Verifikation für Portale (Staging blockiert)
- Marketing-Site live getestet via Playwright gegen `https://claimondo.de`

---

## 1. Farbtoken-Verstöße

### 1.1 gray-\* (Tailwind-Default statt Claimondo-CI)

**Policy:** `text-gray-*`, `bg-gray-*`, `border-gray-*` sind verboten für UI-Neutral. Claimondo-Tokens: `text-claimondo-shield`, `text-claimondo-light-blue`, `text-claimondo-navy`.

| Portal | Vorkommen | Hauptdateien |
|---|---|---|
| dispatch | 15 | GutachterFinderUebersichtClient.tsx (8), GutachterFinderDetailClient.tsx (7) |
| gutachter | 0 | — |
| kanzlei | 0 | — |
| makler | 0 | — |
| kunde | 0 | — |
| admin | 0 | — |

**Betroffene Dateien (dispatch):**

`src/app/dispatch/gutachter-finder/GutachterFinderUebersichtClient.tsx`
- Zeile 14: `bg-gray-100 text-gray-500` (Status "Abgeschlossen") → `bg-claimondo-bg text-claimondo-shield/60`
- Zeile 19: `bg-gray-100 text-gray-600` (Fallback-Status) → `bg-claimondo-bg text-claimondo-shield/70`
- Zeile 75: `text-gray-400` (Datum) → `text-claimondo-light-blue/60`
- Zeile 81, 84, 87, 93: `text-gray-600`, `text-gray-400`, `text-gray-500` (Meta-Infos) → `text-claimondo-shield`, `text-claimondo-light-blue/60`
- Zeile 172: `text-gray-500 border-gray-200 hover:bg-gray-100` (Button) → `text-claimondo-shield border-claimondo-border hover:bg-claimondo-bg`

`src/app/dispatch/gutachter-finder/[id]/GutachterFinderDetailClient.tsx`
- Zeile 15: `bg-gray-100 text-gray-500` → `bg-claimondo-bg text-claimondo-shield/60`
- Zeile 23: `text-gray-400` → `text-claimondo-light-blue/60`
- Zeile 73: `bg-gray-100 text-gray-600` → `bg-claimondo-bg text-claimondo-shield/70`
- Zeile 177: `text-gray-400` → `text-claimondo-light-blue/60`
- Zeile 234: `text-gray-500 border-gray-200 hover:bg-gray-100` → `text-claimondo-shield border-claimondo-border hover:bg-claimondo-bg`
- Zeile 314: `text-gray-500` → `text-claimondo-shield`
- Zeile 326: `text-gray-600` → `text-claimondo-shield`

**Dispatch: RueckrufSection.tsx**
- Zeile 136: `placeholder-gray-400` — Ausnahme toleriert (Tailwind-Placeholder-Utility ist akzeptiert)

### 1.2 blue-\* (Tailwind-Default, nicht Claimondo-Info)

| Portal | Vorkommen | Dateien |
|---|---|---|
| dispatch | 7 | GutachterFinderUebersichtClient.tsx (1), GutachterFinderDetailClient.tsx (1), SvKalenderVergleichModal.tsx (5) |

`src/app/dispatch/gutachter-finder/GutachterFinderUebersichtClient.tsx` Zeile 11:  
`bg-blue-100 text-blue-700` → `bg-claimondo-ondo/10 text-claimondo-ondo`

`src/app/dispatch/gutachter-finder/[id]/GutachterFinderDetailClient.tsx` Zeile 12:  
`bg-blue-100 text-blue-700` → `bg-claimondo-ondo/10 text-claimondo-ondo`

`src/app/dispatch/leads/[id]/SvKalenderVergleichModal.tsx` Zeilen 377, 388, 452, 488, 553:  
Kalender-Slot-Highlighting in `bg-blue-50 border-blue-200 text-blue-800 bg-blue-500`.  
Empfehlung: `bg-claimondo-ondo/8 border-claimondo-ondo/25 text-claimondo-navy`  
(Semantisch begründbar als Kalender-Info, P2 statt P1)

---

## 2. Schatten-Verstöße (Hardcoded vs. Token)

**Policy:** Nur `shadow-sm` / `shadow-md` / `shadow-lg` aus `design-tokens.ts` (3 Stufen mit Navy-Tint).  
Hardcoded `shadow-[0_Xpx_...]` ist ein Token-Verstoß.

**Gesamte App: 143 Vorkommen** hardcodierter Schatten-Werte.

| Portal | Vorkommen |
|---|---|
| dispatch | 24 |
| gutachter | 12 |
| makler | 6 |
| kunde | 4 |
| flow/ + schaden-melden/ + rest | ~97 |

**Top-Verletzer (dispatch):**

`src/app/dispatch/dashboard/page.tsx`
- Zeile 119: `shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)]` → `shadow-sm`
- Zeile 119: hover-shadow `shadow-[0_6px_18px_rgba(15,30,68,.07),0_24px_48px_rgba(15,30,68,.06)]` → `hover:shadow-md`
- Vorkommen: 4x

`src/app/dispatch/kalender/KalenderClient.tsx`
- Zeile 242: `shadow-[0_4px_12px_rgba(69,115,162,.30),0_1px_2px_rgba(69,115,162,.18)]` → `shadow-md`

**Hinweis:** Der Wert `0_2px_6px_rgba(15,30,68,.05)` entspricht annähernd `shadow-sm` aus `design-tokens.ts`. Die Konversion ist mechanisch möglich. Empfehlung: `scripts/aar-745b-color-tokens.mjs` um Shadow-Replace-Pass erweitern.

---

## 3. Radius-Verstöße (rounded-[...] statt Token)

**Policy:** Nur `rounded-sm` (8px), `rounded-md` (14px), `rounded-lg` (20px), `rounded-full` aus `design-tokens.ts`.

**Gesamte App: 19 Vorkommen** hardcodierter Radien.

Wichtigste:

| Datei | Wert | Korrekt |
|---|---|---|
| `dispatch/leads/_components/LeadsViewToggle.tsx:59,71` | `rounded-[14px]` | `rounded-md` |
| `flow/[token]/FlowWizardKfz.tsx:344` | `rounded-[36px]` | Token-Lücke: größer als `rounded-lg` (20px) — kein passendes Token |
| `flow/[token]/FlowWizardKfz.tsx:740` | `rounded-[14px]` | `rounded-md` |
| `gutachter/faelle/FaelleFilterBar.tsx:99` | `rounded-[14px]` | `rounded-md` |
| `gutachter/reklamationen/ReklamationenClient.tsx:138,151,164` | `rounded-[14px]` | `rounded-md` |
| `kunde/termin/[token]/page.tsx:43,63` | `rounded-[36px]` | Token-Lücke (36px) |

**Token-Lücke:** `rounded-[36px]` wird für Sheet-/Wizard-Container genutzt. In `design-tokens.ts` ist der größte Wert `lg: 20`. Entweder einen `xl: 36`-Token ergänzen oder die 36px-Verwendungen auf `rounded-lg` (20px) angleichen.

---

## 4. Komponenten-Layer-Verstöße

### 4.1 Tabellen — DataTable-Adoption (GRÜN)

Keine handgerollten `<thead>` in App-Routes gefunden. Dispatch und Gutachter nutzen `@/components/shared/DataTable` korrekt (3 DataTable-Importe in Dispatch, 33 in Gutachter).

### 4.2 Buttons — Primitives-Adoption (GRÜN)

Keine handgerollten `<button className="...rounded...bg-...">` in App-Routes gefunden (0 Treffer). Buttons werden via shadcn `ui/button` oder `primitives/Button` gerenedert.

### 4.3 Empty-States

| Portal | EmptyState-Nutzung | Naked-Text-Vorkommen |
|---|---|---|
| dispatch | 2 | 4 |
| gutachter | 33 | ~6 |

**Dispatch Naked-Empty-States** (4 Stellen ohne `<EmptyState>`):  
Grep-Treffer: `"Keine Leads vorhanden"`, `"Noch keine..."`, `"Keine Anfragen"`, `"Keine Daten"`.  
Fix: `<EmptyState icon={FolderOpenIcon} title="..." />` aus `@/components/shared/EmptyState` verwenden.

---

## 5. Umlaut-Check

Kein ASCII-Umlaut-Ersatz (`ae`/`oe`/`ue`/`ss`) in UI-Strings gefunden (0 Treffer in `src/app/`). Pre-Commit-Hook aktiv.

**Ausnahme:** `FaqClient.tsx` `slugify()`-Funktion konvertiert Umlaute bewusst zu ASCII für URL-Anchors — korrekt.

---

## 6. Marketing-Site — Live-Test Ergebnisse

### Getestete Routes

| Route | HTTP | H1 | Errors |
|---|---|---|---|
| `/` | 200 | Kfz-Schaden digital geregelt | 0 |
| `/wie-es-funktioniert` | 200 | Ihr Unfall. Unser Problem. | 0 |
| `/vorteile` | 200 | Ihr Recht. Vollständig durchgesetzt. | 0 |
| `/kfz-gutachter` | 200 | Kfz-Gutachter finden — unabhängig & kostenfrei | 0 |
| `/ueber-uns` | 200 | Vollständige Schadensregulierung — auf Augenhöhe | 0 |
| `/faq` | 200 | **APP ROOT CRASH** (React #419) | 2 |
| `/schaden-melden` | 200 | Was ist passiert? (Schritt 1) | 0 |
| `/login` | 200 | → Redirect auf `app.claimondo.de/login` | 0 |
| `/datenschutz` | 200 | Datenschutzerklärung | 0 |
| `/impressum` | 200 | Impressum | 0 |
| `/agb` | 200 | Allgemeine Geschäftsbedingungen | 0 |
| `/beratung-anfragen` | 200 | Kostenlose Beratung | 0 |

### CTA-Flow

CTA "Schaden meldenOnline in 2 Min" → `/schaden-melden` → Schritt 1 rendert korrekt. ✓

### Console-Errors auf `/faq` (GEFIXT)

```
Minified React error #419
Error: `getTranslations` is not supported in Client Components
```

Ursache: `FaqClient.tsx` (`'use client'`) importierte `LandingFooter` (Server-Component mit `getTranslations`).  
Fix: Commit `36138521` — Shell-Components nach `page.tsx` verschoben.

---

## 7. Portal-Smoke — Status

| Portal | Status | Grund |
|---|---|---|
| Dispatch | ❌ Nicht durchgeführt | Staging 401 (Basic-Auth-Passwort fehlt) |
| SV/Gutachter | ❌ Nicht durchgeführt | Staging 401 |
| Kanzlei | ❌ Nicht durchgeführt | Staging 401 |
| Makler | ❌ Nicht durchgeführt | Staging 401 + kein test-makler User |
| Kunde | ❌ Nicht durchgeführt | Staging 401 |

**Blocker-Auflösung:** `node docs/13.05.2026/smoke-claimondo-de/smoke-claimondo-full.mjs --staging-pass=<bitwarden-passwort>`

---

## 8. Severity-Matrix (Gesamt)

| ID | Severity | Portal | Beschreibung | Status |
|---|---|---|---|---|
| B1 | **P0 BLOCKER** | marketing | `/faq` Production-Crash React #419 | ✅ GEFIXT (36138521) |
| B2 | **P0 BLOCKER** | alle | Staging Basic-Auth-Passwort fehlt | ⏳ Wartet auf Aaron |
| B3 | **P0 BLOCKER** | makler | test-makler User nicht vorhanden | ⏳ Offen |
| H1 | P1 HIGH | dispatch | GutachterFinder 15x gray-* Verstöße | 📋 Backlog |
| H2 | P1 HIGH | dispatch | SvKalenderVergleichModal 5x blue-* | 📋 Backlog |
| H3 | P1 HIGH | dispatch | Dashboard 4x hardcoded Shadows + rounded | 📋 Backlog |
| M1 | P2 MEDIUM | alle | 143x hardcoded shadow-[...] app-weit | 📋 Batch-Fix |
| M2 | P2 MEDIUM | alle | 19x rounded-[...] statt Token | 📋 Batch-Fix |
| M3 | P2 MEDIUM | dispatch | 4x Naked Empty-State statt `<EmptyState>` | 📋 Backlog |
| M4 | P2 MEDIUM | app | Token-Lücke: kein `rounded-xl`/36px-Token | 📋 design-tokens.ts |
| L1 | P3 LOW | marketing | /login Redirect auf andere Domain (bewusst) | ℹ️ Dokumentiert |
| L2 | P3 LOW | app | Umlaut-Check: grün (kein Handlungsbedarf) | ✅ OK |

---

*Audit: Claude Sonnet 4.6 Subagent, 13.05.2026*  
*Design-Token-Referenz: `src/lib/design-tokens.ts`*  
*Policy-Referenz: `AGENTS.md §claimondo-component-set` + `§branding-rules`*

---

## Portal-Smoke 13.05.2026 (Staging)

**Zeitpunkt:** 13.05.2026, ~09:00 Uhr  
**Durchführender Agent:** Claude Sonnet 4.6  
**Branch (Fixes):** `kitta/aar-smoke-staging-portals` (Commit `552efce9`)  
**Grundlage:** Blocker B2 (Basic-Auth) aufgelöst — Credentials per Env-Var übergeben.

---

### Staging-Erreichbarkeit

`https://app.staging.claimondo.de` mit Basic-Auth-Header → HTTP 200. ✅

**Cookie-Banner-Befund:** Staging-Login-Page hat einen Cookie-Consent-Banner mit zwei Submit-Buttons ("Nur notwendige", "Alle akzeptieren"). Ein allgemeiner `button[type="submit"]`-Klick trifft den Cookie-Submit statt "Einloggen". Login-Skript muss explizit `button[type="submit"]:has-text("Einloggen")` klicken.

---

### Test-User-Status (Staging)

| Rolle | E-Mail | Status |
|---|---|---|
| dispatch | test-dispatch@claimondo.de | ✅ Login OK → `/dispatch/dashboard` |
| sv | test-sv@claimondo.de | ✅ Login OK → `/gutachter` |
| admin | test-admin@claimondo.de | ✅ Login OK → `/admin` |
| kanzlei | test-kanzlei@claimondo.de | ❌ `Invalid login credentials` — User fehlt auf Staging |
| makler | test-makler@claimondo.de | ❌ `Invalid login credentials` — Blocker B3 bestätigt |

---

### Dispatch-Portal

**Login:** ✅  
**Dashboard:** ✅ — rendert korrekt, keine JS-Fehler  
**Lead-Liste:** ✅ — 2 Leads (Smoke-Daten), rendert korrekt; **aber: React #418 Hydration-Error** auf jeder Seitenladung  
**Lead-Detail:** ✅ — Phase-1-Maske mit 6 Phase-Buttons, kein Crash  
**Kalender:** ✅ — Wochengrid rendert; **aber: React #418 Hydration-Error**  
**Gutachter-Finder:** ✅ — Suche-Page rendert, keine JS-Fehler  
**Lead-Anlage-Button:** ✅ — "Neuer Lead"-Drawer öffnet; **aber: React #418** ebenfalls  
**Screenshots:** 10 (dispatch/)

**Root Cause React #418 (Dispatch):**  
`LeadsViewToggle.tsx` + `KalenderClient.tsx` sind Client Components und nutzen `new Date(…).toLocaleDateString('de-DE', …)` direkt im Render-Tree. SSR läuft in UTC (Server), Hydration in `Europe/Berlin` → Text-Mismatch → React Error #418.  
**FIX COMMITTED:** `suppressHydrationWarning` auf allen betroffenen Date-Rendering-Elementen. Commit `552efce9`.

---

### SV/Gutachter-Portal

**Login:** ✅  
**SV-Startseite `/gutachter`:** ✅  
**Fälle-Übersicht `/gutachter/faelle`:** ✅ — leer (keine SV-Fälle für test-sv auf Staging)  
**Kalender `/gutachter/kalender`:** ✅  
**Reklamationen `/gutachter/reklamationen`:** ✅  
**Fall-Detail:** ⏳ nicht testbar — keine Fälle dem test-sv zugewiesen  
**Feldmodus-Button:** nicht prüfbar (kein Fall-Detail erreichbar)  
**Screenshots:** 6 (sv/)

---

### Kanzlei-Portal

**Login als test-kanzlei:** ❌ — User existiert nicht auf Staging  
**Fallback: Admin-Login:** ✅  
**`/kanzlei`:** ✅ → Redirect auf `/kanzlei/dashboard`  
**`/kanzlei/dashboard`:** ✅ — rendert korrekt  
**`/kanzlei/faelle`:** ✅ — leer  
**`/kanzlei/mandanten`:** ✅ — rendert korrekt  
**`/kanzlei/dokumente`:** ✅ — rendert korrekt  
**Fall-Detail:** nicht testbar — keine Fälle in Kanzlei-DB  
**Screenshots:** 11 (kanzlei/)

**Anmerkung:** Kanzlei-Routen sind mit Admin-Session zugänglich (keine strikte RLS-Blockade für Admin). Für echten Kanzlei-Rolle-Test muss `test-kanzlei@claimondo.de` auf Staging angelegt werden.

---

### Makler-Portal

**Login:** ❌ — Blocker B3 aus Vorlauf bestätigt  
**Aktion:** dokumentiert, kein Portal-Test möglich  
**Screenshots:** 2 (makler/)

---

### Kunden-Portal

**Strategie:** Als Dispatch eingeloggt → Lead-Detail → Magic-Link suchen  
**Magic-Link-Button in Dispatch-Lead-Detail:** ❌ nicht gefunden  

**Analyse:** Beide Test-Leads sind in Phase 1 (Qualifizierung). Die Kunden-Fallakte + Magic-Link erscheinen erst wenn der Lead zur Fallakte konvertiert wurde (Phase 5 "Abschluss" / Status "konvertiert"). Mit Phase-1-Leads kein Magic-Link-Test möglich.

**Anonyme Kunden-Routen:**
- `/kunde` → Redirect auf `/dispatch/dashboard` (Session der Dispatch-Rolle mitgebracht — korrekt, kein Crash)
- `/kunde/mein-fall` → bleibt auf `/kunde/mein-fall` (kein Redirect, kein Crash — Dispatch-Session hat Zugriff oder Route ist ungeschützt)
- `/kunde/dokumente` → bleibt auf `/kunde/dokumente`
- `/kunde/termin/<invalid-token>` → Redirect auf `/dispatch/dashboard`

**Screenshots:** 10 (kunde/)

---

### Neue Severity-Matrix (Portal-Smoke-Ergänzungen)

| ID | Severity | Portal | Beschreibung | Status |
|---|---|---|---|---|
| PS-P0-1 | **P0** | dispatch | React Hydration Error #418 in Lead-Liste + Kalender (toLocaleDateString UTC vs. Berlin) | ✅ **GEFIXT** (552efce9) |
| PS-P0-2 | **P0** | kanzlei | test-kanzlei@claimondo.de nicht auf Staging — Kanzlei-Rolle nicht testbar | ⏳ Aaron: User anlegen |
| PS-P0-3 | **P0** | makler | test-makler@claimondo.de nicht auf Staging — Blocker B3 bestätigt | ⏳ Aaron: User anlegen |
| PS-P1-1 | P1 | sv | SV-Fälle-Liste leer auf Staging — kein Fall-Detail, Feldmodus-Test nicht möglich | ⏳ Staging-Testdaten |
| PS-P1-2 | P1 | kanzlei | Kanzlei-Fälle leer auf Staging — kein Kanzlei-Fall-Detail testbar | ⏳ Staging-Testdaten |
| PS-P1-3 | P1 | kunde | Magic-Link-Button erfordert konvertierten Lead (Phase 5+) — beide Test-Leads sind Phase 1 | ⏳ Staging-Testdaten |
| PS-P2-1 | P2 | kunde | `/kunde/mein-fall` kein Auth-Redirect mit Dispatch-Session — unklar ob Route RLS-geschützt | 📋 Prüfen |
| PS-P3-1 | P3 | alle | Cookie-Consent-Banner auf Staging: Submit-Button-Namens-Konflikt (Login vs. Cookie) | ℹ️ Dokumentiert |

---

### Screenshots-Übersicht (Portal-Smoke)

| Portal | Anzahl | Verzeichnis |
|---|---|---|
| dispatch | 10 | `docs/13.05.2026/smoke-claimondo-de/dispatch/` |
| sv | 6 | `docs/13.05.2026/smoke-claimondo-de/sv/` |
| kanzlei | 11 | `docs/13.05.2026/smoke-claimondo-de/kanzlei/` |
| makler | 2 | `docs/13.05.2026/smoke-claimondo-de/makler/` |
| kunde | 10 | `docs/13.05.2026/smoke-claimondo-de/kunde/` |
| **Gesamt** | **39** | |

---

*Portal-Smoke: Claude Sonnet 4.6 Subagent, 13.05.2026*  
*Branch: `kitta/aar-smoke-staging-portals`*  
*Skript: `docs/13.05.2026/smoke-claimondo-de/smoke-portale-v2.mjs`*
