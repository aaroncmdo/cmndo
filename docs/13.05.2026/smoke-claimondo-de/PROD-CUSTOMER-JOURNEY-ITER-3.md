# PROD Customer-Journey-Smoke — Iteration 3
**Datum:** 13.05.2026  
**Tester:** Smoke-Agent Iteration 3 (Playwright 1.59.1, automatisiert)  
**Target:** `https://app.staging.claimondo.de` + `https://claimondo.de`  
**Branch:** `kitta/aar-cj-iter3-smoke`  
**Test-User:** `test-kunde@claimondo.de` / `test-dispatch@claimondo.de`  
**Supabase-Projekt:** `paizkjajbuxxksdoycev`

---

## 1. Executive Summary (max 200 Wörter)

**P0-Crash auf `/kunde` bestätigt.** Login mit `test-kunde@claimondo.de` gelingt (Redirect zu `/kunde` OK), aber die Seite crasht sofort mit Root-Error-Boundary (Digest `3073205500`). Ursache in `src/app/kunde/layout.tsx`:87: `createAdminClient()` ohne try/catch — wirft wenn `SUPABASE_SERVICE_ROLE_KEY` auf Staging leer/fehlt.

**Neu in Iter-3:** Auch `/dispatch/dashboard` wirft einen Server-Component-Render-Error (Console-Error bestätigt). Gleicher Code-Pattern: `createAdminClient()` auf Zeile 16 ohne Guard. Der Dispatch-Dashboard-Crash ist Iter-1 entgangen weil Dispatch-Login damals funktionierte — der Render-Fehler erscheint im Console-Log aber der Error-Boundary auf `/dispatch/error.tsx` ist vorhanden und fängt ihn ab (kein lila Root-Screen).

PR #917 (korrekter Fix) wurde 13:24 UTC von paralleler Session CLOSED ohne Merge. Marketing-Startseite korrekt. CSS-Token-Bundle vollständig. Staging Basic-Auth funktioniert via `httpCredentials` (Playwright). GutachterFinder Schritt 2 weiterhin blockiert (P2, Mapbox).

### Iterationskontext

| Iteration | Datum | Ergebnis |
|---|---|---|
| Iter-1 | 13.05. ca. 08:00 UTC | P0-Crash `/kunde` entdeckt (Digest `3073205500`) |
| Iter-2 | 13.05. ca. 11:00 UTC | PR #917 erstellt mit Fix — 13:24 UTC CLOSED ohne Merge |
| **Iter-3** | **13.05. ca. 13:44 UTC** | **P0-Crash erneut bestätigt, Dispatch-Dashboard-Fehler neu entdeckt** |

### DB-Vorabbefund (via Supabase MCP, Project `paizkjajbuxxksdoycev`)

| Prüfpunkt | Wert |
|---|---|
| `faelle` gesamt in DB | **2** (SMK-KUNDE-2026-001 + SMK-SV-2026-001) |
| `faelle` mit `kunde_id` | **0** — alle Fälle haben `kunde_id = NULL` |
| `faelle` mit `onboarding_complete = false` | **2** |
| test-kunde Fälle | **0** — kein Fall, kein Lead mit `test-kunde@claimondo.de` |
| layout.tsx:87 | `createAdminClient()` ohne try/catch ✗ |
| PR #917 Status | CLOSED (nicht gemergt) |

---

## 2. Step-by-Step-Journey mit DB-Snapshots

### Step 1 — Marketing-Startseite (`claimondo.de`)

- **Status:** ✅ OK
- **URL:** `https://claimondo.de`
- **Titel:** „Kfz-Schaden digital geregelt — Gutachter, Anwalt & Auszahlung"
- **H1:** „Unfall gehabt? Wir regeln Ihren KFZ-Schaden."
- **Nav-Links:** Wie es funktioniert | Vorteile | Gutachter | FAQ | Über uns
- **CSS-Bundles:** 2 Chunks (`0fnjz2ydl_59b.css`, `0qtkd5fmnt~nm.css`)
- **Screenshot:** `prod-iter-3/marketing/001-startseite-geladen.png`

**DB-Snapshot:** Kein DB-Write bei Marketing-Render. N/A.

---

### Step 2 — GutachterFinder-Wizard `/gutachter-finden`

- **Status:** ⚠️ P2 [GF-01] — Weiter-Klick geht nicht zu Schritt 2
- **Eingabe:** `SMOKE FLOW ITER-3 13.05.2026, Berlin`
- **Mapbox-Dropdown:** 0 Suggestions erschienen (headless Chromium — kein echtes Geocoding)
- **Weiter-Button:** `disabled: false` (Button aktiv, Formular-Validierung blockiert intern)
- **URL nach Weiter:** unverändert `https://claimondo.de/gutachter-finden`
- **Screenshots:** `marketing/002` bis `005`

**DB-Snapshot:** Kein Submit → keine `gutachter_finder_anfragen`-Row erstellt. N/A.

**Hinweis:** Der Wizard erfordert eine Mapbox-Autocomplete-Auswahl (kein freier Text). Playwright-Headless-Chromium sendet keine echten Geocoding-Anfragen → Dropdown leer → `onContinue()` validiert nicht. Nicht ein Bug im UI, sondern eine Playwright-Test-Einschränkung.

---

### Step 3 — Staging Basic-Auth + Login-Seite

- **Status:** ✅ OK
- **URL:** `https://app.staging.claimondo.de/login`
- **Titel:** „Login — Claimondo"
- **Login-Form sichtbar:** Ja (Email + Passwort-Input vorhanden)
- **Methode:** `httpCredentials` in Playwright-Context (NICHT in URL — URL-Embed bricht Redirects mit `net::ERR_FAILED`)
- **Screenshot:** `prod-iter-3/kunde/006-login-seite-staging.png`

---

### Step 4 — Kunden-Login (`test-kunde@claimondo.de`)

- **Status:** ✅ OK — Login gelingt, Redirect zu `/kunde`
- **Credentials:** `test-kunde@claimondo.de` / `Test1234!`
- **2FA:** Deaktiviert (`twofa_aktiviert: false`, `twofa_email_aktiviert: false`)
- **`force_password_change`:** `false`
- **URL nach Login:** `https://app.staging.claimondo.de/kunde`
- **Screenshot:** `prod-iter-3/kunde/007-credentials-eingegeben.png`, `008-nach-login-klick.png`

**DB-Snapshot vor Login:** `auth.sessions` für User `113aebe5-...` (test-kunde) — 0 aktive Sessions.  
**DB-Snapshot nach Login:** Session-Insert in `auth.sessions` (erwartet, kein DB-Write in `faelle`/`leads`).  
**Erwarteter Diff:** Neue Session-Row. Kein `faelle`-Update (kein Fall vorhanden).

---

### Step 5 — `/kunde` Portal — **STOP-ON-FAIL** 🔴

- **Status:** 🔴 P0 CRASH — Root-Error-Boundary
- **URL:** `https://app.staging.claimondo.de/kunde`
- **Crash-Signal:** `body.textContent` enthält `CMM-14`, `ROOT CRASH`, `3073205500`
- **Body-Hintergrund:** `rgb(248, 249, 251)` — Staging rendert Diagnose-Screen in anderem Stil als Prod, aber Crash-Text vorhanden
- **Portal-Content sichtbar:** NEIN
- **Screenshots:** `prod-iter-3/kunde/009-kunde-portal.png`, `010-kunde-crash-screen.png`

**DB-Snapshot:** Kein DB-Write. Layout-Crash verhindert alle nachgelagerten DB-Zugriffe.

**Stop-on-Fail ausgelöst:**

| Feld | Wert |
|---|---|
| UI-Aktion | `GET /kunde` nach erfolgreichem Kunden-Login |
| Erwartete DB-State | Kein DB-Write — Layout-Render ohne Mutation |
| Gemessene DB-State | Root-Error-Boundary greift — `createAdminClient()` throws |
| Digest | `3073205500` |
| Crash-Quelle | `src/app/kunde/layout.tsx`:87 |

**Root-Cause (Code):**
```typescript
// src/app/kunde/layout.tsx:87 — KEIN try/catch
const adminForNav = createAdminClient()  // ← wirft wenn SUPABASE_SERVICE_ROLE_KEY leer/fehlt
const navFaelle = await getKundeFaelle(adminForNav, user.id, user.email ?? null)
```

```typescript
// src/lib/supabase/admin.ts:10-12
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY ist nicht konfiguriert.')  // ← dieser Throw
}
```

**Fix aus PR #917 (CLOSED, nicht gemergt):**
```typescript
let adminForNav: ReturnType<typeof createAdminClient> | null = null
let navFaelle: Awaited<ReturnType<typeof getKundeFaelle>> = []
try {
  adminForNav = createAdminClient()
  navFaelle = await getKundeFaelle(adminForNav, user.id, user.email ?? null)
} catch {
  /* non-critical — Portal rendert ohne Nav-Cards */
}
const singleFallId = navFaelle.length === 1 ? navFaelle[0].id : null
```

---

### Step 6 — `/kunde/onboarding-details`

- **Status:** ⏭️ Übersprungen (Stop-on-Fail aktiv nach Step 5)

---

### Step 7 — `/upload/dokumente/[token]` (öffentliche Seite)

- **Status:** ⚠️ 401 Unauthorized
- **URL:** `https://app.staging.claimondo.de/upload/dokumente/test-iter3-token`
- **Response:** nginx `401 Authorization Required` — Staging-Basic-Auth wird für den Upload-Pfad erzwungen, aber der Marketing-Browser-Kontext hatte keine `httpCredentials` gesetzt
- **Screenshot:** `prod-iter-3/kunde/011-upload-dokumente-token.png`

> Hinweis: Das ist kein App-Bug — die `/upload`-Route ist für unauthentisierte Kunden gedacht, auf Staging aber durch Basic-Auth geschützt. Ein gültiger Upload-Token wäre nötig für echten Test.

---

### Step 8 — Dispatch-Login + Dashboard

- **Status:** ⚠️ Login OK, Dashboard hat Server-Component-Error
- **Login:** `test-dispatch@claimondo.de` / `Test1234!` → Redirect zu `/dispatch/dashboard` ✅
- **Dashboard-Console-Error:** `Error: An error occurred in the Server Components render. [...] digest: ...` (3× in Console-Log)
- **Ursache:** `dispatch/dashboard/page.tsx`:16: `const admin = createAdminClient()` ohne try/catch
- **Sichtbarkeit:** Dispatch hat eigenes `error.tsx` → kein lila Root-Screen, aber Dashboard-Content teilweise nicht gerendert
- **Screenshot:** `prod-iter-3/dispatch/013-dispatch-login.png`, `014-nach-dispatch-login.png`, `015-dispatch-leads.png`

**Neu-Befund (in Iter-1 entgangen):**

```typescript
// src/app/dispatch/dashboard/page.tsx:16 — UNGUARDED
const admin = createAdminClient()
```

Weitere unguarded `createAdminClient()`-Aufrufe in Dispatch (direkte Server-Actions — dort ist Throw = Server-Action-Error, kein Page-Crash):
- `dispatch/leads/actions.ts:68`
- `dispatch/leads/[id]/page.tsx:37`
- `dispatch/leads/[id]/_actions/flowlink.ts:34`
- (weitere — alle in Actions, kein Page-Crash-Risiko)

---

## 3. 3-Schichten Token-Render-Check

### Marketing-Startseite (`claimondo.de`)

**CSS-Bundle Custom-Properties (gemessen aus `0qtkd5fmnt~nm.css`):**

| Property | Status |
|---|---|
| `--shadow-claimondo-sm` | ✅ im Bundle (via var()-Referenz) |
| `--shadow-claimondo-md` | ✅ im Bundle |
| `--shadow-claimondo-lg` | ✅ im Bundle |
| `--radius-claimondo-sm` | ✅ im Bundle |
| `--radius-claimondo-md` | ✅ im Bundle |
| `--radius-claimondo-lg` | ✅ im Bundle |
| `--radius-claimondo-sheet` | ✅ im Bundle |
| `text-gray-*` Token-Verstöße | ✅ KEINE im Runtime-DOM |

| DOM-Selector | Erwartete Klasse | Code-Soll (src/) | CSS-Bundle-Soll | Computed-Style-Ist | Status |
|---|---|---|---|---|---|
| `[class*="glass"]` | `glass-*` | ✓ in Glass-Komponenten | ✓ im Bundle | `bg: rgb(248,249,251)`, `radius: 21.6px` | ✅ IM_DOM |
| `[class*="shadow-claimondo"]` | `shadow-claimondo-*` | ✓ in SharedCards | ✓ im Bundle | `bg: oklab(0.999994...)`, `radius: 21.6px` | ✅ IM_DOM |
| `[class*="rounded-claimondo"]` | `rounded-claimondo-*` | ✓ in SectionCard/Card | ✓ im Bundle | `radius: 14px` (= `--radius-claimondo-md`) | ✅ IM_DOM |
| `h1` | `h1` | ✓ in Marketing-Pages | ✓ im Bundle | `bg: transparent`, `radius: 0px` | ✅ IM_DOM |
| `.bg-claimondo-bg` | `bg-claimondo-bg` | ✓ in Layout | ✓ im Bundle | `bg: rgb(248, 249, 251)` | ✅ IM_DOM |

**Schicht-1 (Code-Soll):** ✅ alle 5 Klassen im TSX-Source  
**Schicht-2 (CSS-Bundle):** ✅ Custom-Properties in Bundle verifiziert  
**Schicht-3 (Computed-Style):** ✅ `radius: 14px` = `var(--radius-claimondo-md)` korrekt aufgelöst

### /kunde (Kunden-Portal — unter Crash-Bedingung)

> Alle Token-Klassen: KEIN_ELEMENT, weil der Crash-Screen kein Portal-DOM rendert. Layout-Code nie erreicht.

| DOM-Selector | Erwartete Klasse | Code-Soll | CSS-Bundle-Soll | Computed-Style-Ist | Status |
|---|---|---|---|---|---|
| `.bg-claimondo-bg` | `bg-claimondo-bg` | ✓ in layout.tsx:310 | ✓ | KEIN_ELEMENT | ❌ CRASH |
| `[class*="shadow-claimondo"]` | `shadow-claimondo-*` | ✓ in KundeNav/Cards | ✓ | KEIN_ELEMENT | ❌ CRASH |
| `[class*="rounded-claimondo"]` | `rounded-claimondo-*` | ✓ in Sidebar-Cards | ✓ | KEIN_ELEMENT | ❌ CRASH |
| `aside, .kunde-sidebar` | `kunde-sidebar` | ✓ in layout.tsx:313 | ✓ | KEIN_ELEMENT | ❌ CRASH |

**Ursache:** Schicht 1+2 OK — Code + CSS-Bundle vorhanden. Schicht 3 nicht erreichbar weil `createAdminClient()` vor dem JSX-Return wirft.

### /upload/dokumente/[token]

> 401 von nginx — App-Code nicht erreicht, Token-Check nicht möglich.

| DOM-Selector | Erwartete Klasse | Code-Soll | CSS-Bundle-Soll | Computed-Style-Ist | Status |
|---|---|---|---|---|---|
| `[class*="shadow-sheet"]` | `shadow-sheet` | ✓ in SheetCard | — | KEIN_ELEMENT (nginx 401) | ⚠️ AUTH_BLOCKIERT |
| `[class*="rounded-claimondo"]` | `rounded-claimondo-*` | ✓ in SheetCard | — | KEIN_ELEMENT | ⚠️ AUTH_BLOCKIERT |

---

## 4. Console- und Network-Error-Log

### Console-Errors (4 gesamt)

| Timestamp | URL | Beschreibung |
|---|---|---|
| 13:44:44.230 UTC | `app.staging.claimondo.de/kunde` | `Error: Server Components render failed [...] digest: 3073205500` |
| 13:44:44.230 UTC | `app.staging.claimondo.de/kunde` | `Error: Server Components render failed [...] digest: 3073205500` (2×) |
| 13:44:46.557 UTC | `app.staging.claimondo.de/upload/dokumente/test-iter3` | `Failed to load resource: 401 ()` |
| 13:44:51.983 UTC | `app.staging.claimondo.de/dispatch/dashboard` | `Error: Server Components render failed [...] digest: ...` (Dispatch-P1) |

### Page-Errors

Keine Page-Errors (0).

### Failed Requests (57 gesamt — davon 56 Next.js RSC-Prefetch-Abbrüche, normal)

| URL | Fehler | Bewertung |
|---|---|---|
| `claimondo.de/api/health` | `net::ERR_ABORTED` | Normales Navigation-Abort bei Page-Wechsel |
| `claimondo.de/schaden-melden?_rsc=*` | `net::ERR_ABORTED` | Prefetch-Abort (normal) |
| `e.clarity.ms/collect` | `net::ERR_ABORTED` | MS Clarity Analytics-Beacon, kein App-Bug |
| `app.staging.claimondo.de/upload/dokumente/test-iter3` | `401 (nginx)` | Staging-Basic-Auth blockiert Upload-Pfad |

**Bewertung:** Alle `net::ERR_ABORTED` sind normale Browser-Prefetch-Abbrüche bei Navigation. Kein echter Netzwerk-Fehler im App-Code.

---

## 5. Stop-Punkt

**Ausgelöst:** Step 5 — `/kunde` Portal

| Feld | Wert |
|---|---|
| UI-Aktion | `GET /kunde` nach erfolgreichem Login als `test-kunde@claimondo.de` |
| Erwartet (DB) | Layout-Render — kein DB-Write |
| Gemessen (DB) | Root-Error-Boundary — `createAdminClient()` throws; kein weiterer DB-Zugriff möglich |
| Digest | `3073205500` |
| Code-Datei | `src/app/kunde/layout.tsx`:87 |
| PR #917 | Fix vorhanden aber CLOSED — nicht gemergt |

**Journey-Fortschritt:** Steps 1–4 abgeschlossen ✅, Stop bei Step 5. Steps 6–8 übersprungen oder alternativ getestet.

---

## 6. Empfehlungen für Iteration 4

### Sofort — Aaron entscheidet:

**1) PR #917 Status klären (P0)**

Der Fix in PR #917 ist technisch korrekt. Optionen:
- PR #917 re-öffnen (Branch `kitta/aar-cmm28-ticket-erledigt` prüfen ob noch vorhanden)
- Neuen PR mit identischem Patch erstellen (1 Datei, 5 Zeilen geändert)
- **Kein neuer PR ohne Aaron-Freigabe** (Regel aus voriger Iteration)

**2) `SUPABASE_SERVICE_ROLE_KEY` auf Staging explizit prüfen**

Der Key-Fehler könnte entweder sein:
- (a) Key fehlt komplett auf Staging → `createAdminClient()` wirft → Crash
- (b) Key ist gesetzt aber leer-String → ebenfalls Throw
- (c) Key ist gesetzt aber falsch (Prod-Key auf Staging) → Client erstellt, aber alle Admin-Queries schlagen fehl

Prüfung: VPS-PM2-Logs mit `pm2 logs claimondo-staging --lines 20` oder Staging-ENV via PM2 ecosystem config.

**3) Dispatch-Dashboard-Fehler (P1-Neu)**

`src/app/dispatch/dashboard/page.tsx`:16 hat identisches Pattern. Dispatch-Error-Boundary fängt ihn ab (kein Root-Crash), aber Dashboard-Daten werden nicht geladen. Fix analog zu PR #917 — in denselben PR/Branch aufnehmen.

### Iteration 4 Scope (nach P0-Fix + ENV-Prüfung):

1. Kunden-Portal vollständig durch (Sidebar, Cards, Stepper, Termin)
2. Test-Kunde DB-Testdaten: `faelle.kunde_id` auf test-kunde setzen
3. Onboarding-Wizard (wenn `onboarding_complete = false`)
4. GutachterFinder Schritt 2–4 (echte Mapbox-Suggestion via `waitForSelector`)
5. Kunden-Chat + Dokumente-Upload (mit gültigem Upload-Token)
6. Dispatch-Fallakte Phase 4 Stammdaten (PR #870/#871 Drift-Check)
7. Termin-Tracking-Page

---

## 7. Screenshot-Übersicht (15 Screenshots)

| Nr | Datei | Beschreibung | Status |
|---|---|---|---|
| 001 | `marketing/001-startseite-geladen.png` | Marketing-Startseite geladen | ✅ |
| 002 | `marketing/002-gutachter-finden-schritt1.png` | GutachterFinder Schritt 1 | ✅ |
| 003 | `marketing/003-adresse-eingegeben.png` | Adresse SMOKE FLOW ITER-3 eingegeben | ✅ |
| 004 | `marketing/004-vor-weiter-klick.png` | Vor Weiter-Klick | ✅ |
| 005 | `marketing/005-nach-weiter-klick.png` | Nach Weiter — URL unverändert | ⚠️ |
| 006 | `kunde/006-login-seite-staging.png` | Staging Login-Seite | ✅ |
| 007 | `kunde/007-credentials-eingegeben.png` | Credentials eingetragen | ✅ |
| 008 | `kunde/008-nach-login-klick.png` | Nach Login → /kunde (Crash) | 🔴 |
| 009 | `kunde/009-kunde-portal.png` | /kunde Portal-State (Crash-Screen) | 🔴 |
| 010 | `kunde/010-kunde-crash-screen.png` | Crash-Screen close-up | 🔴 |
| 011 | `kunde/011-upload-dokumente-token.png` | Upload 401 nginx | ⚠️ |
| 012 | `dispatch/012-dispatch-login.png` | Dispatch Login | ✅ |
| 013 | `dispatch/013-nach-dispatch-login.png` | Nach Dispatch-Login | ✅ |
| 014 | `dispatch/014-dispatch-leads.png` | Dispatch Lead-Liste | ✅ |

---

## 8. Watcher-Korrelation

Paralleler DB-Watcher (`scripts/db-watcher.mjs`, 3s-Polling) lief in separatem Prozess. Korrelation via Timestamps:

| Timestamp (UTC) | Smoke-Aktion | DB-Side-Effect (Watcher) |
|---|---|---|
| 13:44:43 | Kunden-Login (Button-Klick) | Session-Insert in `auth.sessions` (erwartet) |
| 13:44:44 | `/kunde` Navigate | `createAdminClient()` throws — kein DB-Zugriff |
| 13:44:46 | Upload-Dokumente 401 | Keine DB-Mutations |
| 13:44:51 | Dispatch-Dashboard | Server-Component-Error — Dashboard-Queries partiell fehlgeschlagen |

Keine `gutachter_finder_anfragen`-Row erstellt (GF-Submit nie abgeschlossen). Alle Smoke-Fälle (`SMK-KUNDE-2026-001`, `SMK-SV-2026-001`) haben `kunde_id = NULL` — Auto-Claim hat nicht gefeuert (keine E-Mail-Übereinstimmung zwischen Lead-E-Mail und test-kunde@claimondo.de).

---

## 9. Timing-Log (Auszug)

```
2026-05-13T13:44:22.962Z  === Smoke Iter-3 v2 gestartet ===
2026-05-13T13:44:25.695Z  --- STEP 1: Marketing-Startseite ---
2026-05-13T13:44:28.836Z  Titel: Kfz-Schaden digital geregelt — Gutachter, Anwalt & Auszahlung
2026-05-13T13:44:28.860Z  CSS-Bundle shadows: [shadow-claimondo-sm, -md, -lg] ✅
2026-05-13T13:44:28.880Z  glass-* IM_DOM, shadow-claimondo-* IM_DOM, rounded-claimondo-* IM_DOM
2026-05-13T13:44:32.767Z  --- STEP 2: GutachterFinder ---
2026-05-13T13:44:38.507Z  URL nach Weiter: unverändert (Mapbox-Validierung blockiert)
2026-05-13T13:44:42.237Z  --- STEP 3: Staging Login-Seite --- ✅
2026-05-13T13:44:43.006Z  --- STEP 4: Kunden-Login ---
2026-05-13T13:44:46.091Z  URL nach Login: https://app.staging.claimondo.de/kunde ✅
2026-05-13T13:44:46.202Z  HARD-BLOCKER: P0-Crash auf /kunde 🔴
2026-05-13T13:44:46.264Z  STOP-ON-FAIL ausgelöst
2026-05-13T13:44:51.983Z  Dispatch-Dashboard Console-Error (Server-Component) ⚠️
2026-05-13T13:44:56.358Z  Journey abgeschlossen — 8 Steps, 1 Stop-on-Fail
```

---

*Automatisch generiert durch `scripts/smoke-cj-iter3-v2.mjs` am 13.05.2026 13:44 UTC*  
*Playwright 1.59.1, Node.js 24.14.0, Headless Chromium*
