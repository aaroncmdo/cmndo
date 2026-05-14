# PROD Customer-Journey-Smoke — Iteration 1
**Datum:** 13.05.2026  
**Tester:** Smoke-Agent (automatisiert via Playwright)  
**Targets:** `https://claimondo.de` + `https://app.claimondo.de`  
**Branch:** `kitta/aar-prod-smoke-iter-1` (nur Doku-Output, kein Code-Fix)  
**Test-User:** `test-kunde@claimondo.de` (Kunden-Perspektive), `test-dispatch@claimondo.de` (Hintergrund-Verifikation)

---

## 1. Executive Summary

**Deploy-Status:** Production-Build läuft auf `origin/main` (Stand: PR #906 → Merge 13.05.2026 ca. 14:11 UTC). Der VPS läuft nginx/1.24.0 + Next.js; kein Vercel-Header sichtbar (VPS-hosted). Der Build vom heutigen Tag ist live.

**Was funktioniert:**
- Marketing-Startseite `claimondo.de` rendert vollständig, Hero-H1 korrekt
- GutachterFinder-Wizard Schritt 1 erreichbar + Formular befüllbar
- Dispatch-Login funktioniert, Dashboard + Lead-Liste korrekt
- Dispatch-Portal `/dispatch/gutachter-finder` erreichbar (zeigt „Keine offenen Anfragen" — korrekt, da GF-Submit im Wizard blockiert)
- Kunden-Login (`test-kunde@claimondo.de`) schlägt durch bis `/kunde`
- Design-Token-CSS ist im Bundle vorhanden (alle 8 Klassen verifiziert)

**Was nicht funktioniert:**
- **HARD-BLOCKER:** `/kunde` crasht mit Root-Error-Boundary (Digest `3073205500`, lila `#9900ff`-Screen). Alle Kunden sehen bei Portal-Aufruf den Diagnose-Crash-Screen statt ihrem Portal.
- GutachterFinder-Wizard Schritt 2 nicht zugänglich (Adresse ohne Mapbox-Autocomplete-Selektion = Form validiert nicht)
- `/admin/abrechnungen` leitet Dispatch-User zu `/kunde` um (Route entweder nicht für Dispatch, oder Redirect-Bug)
- 24× Server-Component-Render-Error im Console-Log für `/kunde`

**Echte Outbound-Calls:** Keine. GF-Submit wurde nicht durchgeführt (Wizard blockiert bei Step 1→2-Transition). Keine WhatsApp/Email/Twilio-Calls ausgelöst.

---

## 2. Token-Render-Tabelle

Token-Klassen wurden im CSS-Bundle `0qtkd5fmnt~nm.css` verifiziert. Werte aus `getComputedStyle()` im Playwright-Browser:

| CSS-Klasse | Erwarteter Wert | Gemessen (Browser) | Status |
|---|---|---|---|
| `.shadow-claimondo-sm` | `0 1px 2px #0d1b3e0a, 0 1px 3px #0d1b3e0f` | CSS-Bundle: `--shadow-claimondo-sm: 0 1px 2px #0d1b3e0a, 0 1px 3px #0d1b3e0f` | ✓ im Bundle |
| `.shadow-claimondo-md` | `0 4px 6px -1px #0d1b3e0f, ...` | `rgba(13,27,62,.06) 0px 4px 6px -1px, rgba(13,27,62,.04) 0px 2px 4px -2px` | ✓ DOM-Element gefunden (Dispatch) |
| `.shadow-claimondo-lg` | `0 10px 25px -5px #0d1b3e1a, ...` | CSS-Bundle bestätigt | ✓ im Bundle |
| `.shadow-sheet` | `0 6px 18px #0f1e4412, 0 24px 48px #0f1e440f` | CSS-Bundle bestätigt | ✓ im Bundle |
| `.shadow-focus-ondo` | `0 0 0 4px #4573a21f` | CSS-Bundle bestätigt | ✓ im Bundle |
| `.rounded-claimondo-sm` | `border-radius: 8px` | CSS-Bundle: `--radius-claimondo-sm: 8px` | ✓ im Bundle |
| `.rounded-claimondo-md` | `border-radius: 14px` | CSS-Bundle: `--radius-claimondo-md: 14px` | ✓ im Bundle |
| `.rounded-claimondo-sheet` | `border-radius: 36px` | CSS-Bundle bestätigt | ✓ im Bundle |

**Hinweis Lücke:** Bei Marketing-Seite und Kunden-Portal wurden keine DOM-Elemente mit diesen Klassen zur Laufzeit gefunden — KEIN_ELEMENT zurückgegeben. Das bedeutet entweder: (a) kein SheetCard-/shadow-claimondo-Element im sichtbaren Viewport, oder (b) der Crash verhindert Render. Dispatch-Portal hat `.shadow-claimondo-md` korrekt im DOM.

**Token-Verletzungen:** Keine `text-gray-*` oder `text-slate-*` Klassen auf DOM-Elementen zur Laufzeit festgestellt (Gray-Klassen im Bundle = Utility-CSS, nicht im App-DOM aktiv).

---

## 3. Funktionale Findings pro Portal

### 3.1 Marketing — `claimondo.de`

**Startseite:**
- ✅ Vollständig gerendert, Hero-H1 korrekt: „Unfall gehabt? Wir regeln Ihren KFZ-Schaden."
- ✅ Navigation (Wie es funktioniert, Vorteile, Gutachter, FAQ, Über uns, Anmelden) sichtbar
- ✅ 3 CTAs sichtbar: Anrufen, Schaden melden, Gutachter finden
- ✅ Mapbox-Karte auf `/gutachter-finden` lädt (WebGL-Warnings aus headless Chromium, kein App-Code-Fehler)
- Screenshot: `prod-iter-1/marketing/001-001-startseite-oben.png`

**GutachterFinder-Wizard:**
- ✅ Schritt 1/4 sichtbar, Adress-Input beschriftet „Straße, PLZ, Ort*"
- ✅ Weiter-Button vorhanden und klickbar
- ⚠️ **P2 [GF-01]:** Weiter-Klick navigiert NICHT zu Schritt 2. Die URL bleibt `/gutachter-finden`, Step-Indikator bleibt auf „Schritt 1/4". Ursache: Freie Text-Eingabe ohne Mapbox-Autocomplete-Auswahl → Formular-Validierung blockiert. Real-User würde aus dem Dropdown auswählen; Playwright-Simulation tippt in das Input ohne Dropdown-Interaktion.
- ℹ️ GF-Submit konnte daher nicht durchgeführt werden → keine Anfrage in Dispatch sichtbar → kein Twilio-Outbound ausgelöst.
- Screenshot: `prod-iter-1/marketing/003` bis `006`

### 3.2 Dispatch — `app.claimondo.de/dispatch`

- ✅ Login als `test-dispatch@claimondo.de` funktioniert, Redirect zu `/dispatch/dashboard`
- ✅ Lead-Liste (`/dispatch/leads`) rendert korrekt: 3 SMOKE-Leads sichtbar („SMOKE Kunde 13.05.2026", „SMOKE Test 13.05.2026", „Smoke P2T4-7B")
- ✅ Filter-Tabs (Neu, Rückruf, In Qualifizierung usw.) sichtbar
- ✅ Kanban-Toggle vorhanden
- ✅ `/dispatch/gutachter-finder` erreichbar, zeigt „Keine offenen Anfragen" (korrekt: Smoke-GF-Submit nie abgesendet)
- ⚠️ **P2 [DISP-01]:** `SMK-SV-2026-001` nicht in der Lead-Liste sichtbar (nur 3 SMOKE-Leads; SMK-SV ist ein Fall-Referenz, kein Lead — korrekte Nomenklatur)
- Screenshot: `prod-iter-1/dispatch/009` bis `011`

### 3.3 Kunden-Portal — `app.claimondo.de/kunde`

- ✅ Kunden-Login (`test-kunde@claimondo.de`) schlägt durch, Post-Login-URL = `/kunde`
- 🔴 **HARD-BLOCKER [KUNDE-CRASH]:** `/kunde` zeigt vollbildigen Root-Error-Boundary-Screen (lila `#9900ff`). Text: „🟣 APP ROOT CRASH (CMM-14 diag)" + Digest `3073205500`. Kein Portal-Content sichtbar.
- Server-Component-Render-Error wird 24× in Console gemeldet (wiederholt durch Page-Refresh-Versuche des Browsers)
- **Root-Cause-Analyse:** Der `src/app/error.tsx` (Root-Segment) fängt den Fehler — nicht `/src/app/kunde/error.tsx` (orange). Das bedeutet der Crash liegt im `/kunde/layout.tsx`, welches keinen eigenen `try/catch` hat. Das `/kunde/error.tsx` fängt nur Kinder-Fehler, nicht Layout-Fehler desselben Segments. Welche spezifische Zeile im Layout wirft, konnte ohne VPS-Zugang + Sentry-Log nicht isoliert werden (Prod blendet Error-Details aus, Digest `3073205500`).
- **Kandidaten für den Layout-Crash:** `resolveKundenTheme()` (macht `createClient()` intern), `getKundeFaelle()` (Admin-Client, keine throws aber DB-Spalten-Drift möglich), oder einer der `adminForNav.from('faelle')`-Selects. Keine Migrations-Drift festgestellt (alle 4 OCR-Spalten existieren in DB).
- **Auswirkung:** Alle echten Kunden sind von ihrem Portal ausgesperrt. **Höchste Priorität.**
- Screenshot: `prod-iter-1/kunde/015-018-kunde-dashboard.png`

### 3.4 Abrechnung — `app.claimondo.de/admin/abrechnungen`

- ⚠️ **P1 [ABR-01]:** Dispatch-User wird nach `/admin/abrechnungen`-Aufruf auf `/kunde` weitergeleitet (weil der Dispatch-User laut Portal-Guard auf `/dispatch` gehört, aber die Redirect-Logik ihn zu `/kunde` schickt statt zurück zu `/dispatch`). Entweder ist die `roleToPath()`-Funktion für `dispatch` nicht konfiguriert, oder der Route-Guard leitet falsch weiter.
- Kein Abrechnung-Content sichtbar.

---

## 4. Console-/Network-Error-Log

### Console-Errors (App-Code)

| Anzahl | Typ | URL | Beschreibung |
|---|---|---|---|
| 24× | `error` | `https://app.claimondo.de/kunde` | `Error: An error occurred in the Server Components render. The specific message is omitted in production builds...` Digest: `3073205500` |
| 4× | `warning` | `https://claimondo.de/gutachter-finden` | `GL Driver Message (OpenGL, Performance): GPU stall due to ReadPixels` — Mapbox WebGL in headless Chromium, kein App-Code |

### Network-Errors

Keine 4xx oder 5xx HTTP-Responses für App-Routes. Alle Assets loaded erfolgreich (kein Failed Chunk).

### WebGL-Warning

Nur in headless Chromium (kein GPU-Treiber). Kein echter User würde das sehen. Kein App-Code-Fehler.

---

## 5. Token-Render-Spot-Checks (Detail)

**CSS-Bundle-Verifikation (`0qtkd5fmnt~nm.css` von `claimondo.de`):**
```
--shadow-claimondo-sm: 0 1px 2px #0d1b3e0a, 0 1px 3px #0d1b3e0f
--shadow-claimondo-md: 0 4px 6px -1px #0d1b3e0f, 0 2px 4px -2px #0d1b3e0a
--shadow-claimondo-lg: 0 10px 25px -5px #0d1b3e1a, 0 8px 10px -6px #0d1b3e0f
--shadow-focus-ondo: 0 0 0 4px #4573a21f
--shadow-sheet: 0 6px 18px #0f1e4412, 0 24px 48px #0f1e440f
--radius-claimondo-sm: 8px
--radius-claimondo-md: 14px
--radius-claimondo-lg: 20px
--radius-claimondo-sheet: 36px
```
Alle Werte entsprechen den Spec-Werten aus `src/lib/design-tokens.ts`.

**`rounded-claimondo-sheet` im Bundle:**
```
.rounded-claimondo-sheet { border-radius: var(--radius-claimondo-sheet) }
```
Korrekt.

**Gray-Klassen:** Im CSS-Bundle als Utility vorhanden, aber kein DOM-Element im App-Code nutzt sie aktiv (kein Token-Verstoß im Runtime-DOM gefunden).

---

## 6. Empfehlung an Main-Agent

### Sofort-Fix (BLOCKER) — heute dispatchen:

**KUNDE-PORTAL-CRASH** → Dispatch einen Fix-Subagent mit folgendem Auftrag:

> Finde in `src/app/kunde/layout.tsx` die Zeile die einen unbehandelten Throw auslöst und zu Digest `3073205500` führt. Das `/kunde/error.tsx` (orange) greift NICHT — also crasht das Layout selbst, nicht eine Page darunter. Kandidaten: alle ungegügelten `await`-Calls ohne `try/catch` in der Layout-Funktion. Füge gezieltes Error-Wrapping hinzu oder behebe die Root-Cause. Branch: `kitta/aar-prod-cj-fix-01-kunde-crash`, PR gegen `staging`.

**Konkrete Debugging-Strategie:**
1. Füge temporär `try { ... } catch (err) { console.error('[KundeLayout] CRASH:', err); throw err }` um den ganzen Layout-Body (ab Zeile 34 bis Ende) ein — damit der Error-Stack in VPS-PM2-Logs erscheint
2. Lese PM2-Logs: `pm2 logs claimondo --lines 50`
3. Alternativ: Sentry-Dashboard aufrufen (Projekt `claimondo`), nach Digest `3073205500` filtern

### Mittelfristig (P1/P2) — nächste Iteration:

1. **GutachterFinder-Wizard-Automation:** Der Playwright-Smoke kann Schritt 2+ nicht erreichen ohne Mapbox-Autocomplete-Interaktion. Lösung: smoke-script muss Dropdown-Option nach Eingabe selektieren (`.mapboxgl-ctrl-geocoder--suggestion` warten + klicken), oder Test-PLZ mit bekannten Koordinaten direkt in das versteckte `lat/lng`-Feld injizieren.

2. **`roleToPath('dispatch')`** prüfen — leitet bei `/admin/abrechnungen`-Zugriff fälschlicherweise zu `/kunde` statt `/dispatch`. Ursache: `roleToPath` returnt vermutlich `/kunde` als Default für unbekannte Rollen.

3. **Kein `error.tsx` unter `/kunde/faelle/[id]/`** — wenn die Fallakten-Detail-Page crasht, greift Root-Error-Boundary (lila). Besser: `error.tsx` unter `/kunde/faelle/[id]/` hinzufügen, damit Fallakten-Crash abgefangen wird ohne das gesamte Portal zu killen.

### Smoke-Erweiterung für Iteration 2:

- Warte auf KUNDE-PORTAL-FIX, dann nochmal smochen
- GF-Wizard-Step-2-4 mit korrekter Autocomplete-Interaktion
- `/admin/abrechnungen` mit korrektem Admin-User testen
- SV-Portal + Reklamation-Flow nachholen
- Kunden-Fallakten-Detail (`/kunde/faelle/<id>`) für Kunden MIT Fall smochen

---

## 7. Screenshot-Übersicht (19 Screenshots)

| Nr | Datei | Beschreibung | Status |
|---|---|---|---|
| 001 | `marketing/001-001-startseite-oben.png` | Marketing-Startseite Hero | ✅ korrekt |
| 002 | `marketing/002-002-startseite-cta-bereich.png` | CTA-Bereich Marketing | ✅ korrekt |
| 003 | `marketing/003-003-gutachter-finden-schritt1.png` | GF-Wizard Schritt 1 | ✅ korrekt |
| 004 | `marketing/004-004-gutachter-adresse-eingegeben.png` | Adresse eingetippt | ✅ korrekt |
| 005 | `marketing/005-005-gutachter-schritt2.png` | Nach Weiter-Klick | ⚠️ URL gleich, kein Step-Wechsel |
| 006 | `marketing/006-006-gutachter-schritt2-layout.png` | Step-2-Ist-Zustand | ⚠️ kein Auffahrunfall-Option |
| 007 | `dispatch/007-010-login-vor-dispatch.png` | Login-Seite Dispatch | ✅ korrekt |
| 008 | `dispatch/008-011-login-credentials-eingetragen.png` | Dispatch-Credentials | ✅ korrekt |
| 009 | `dispatch/009-012-dispatch-dashboard-nach-login.png` | Dispatch Loading-State | ✅ normal |
| 010 | `dispatch/010-013-dispatch-leads-liste.png` | Lead-Liste Dispatch | ✅ 3 Leads sichtbar |
| 011 | `dispatch/011-014-dispatch-gutachter-finder.png` | GF-Anfragen Dispatch | ✅ korrekt (leer) |
| 012 | `kunde/012-015-login-vor-kunde.png` | Login-Seite Kunde | ✅ korrekt |
| 013 | `kunde/013-016-login-kunde-credentials.png` | Kunden-Credentials | ✅ korrekt |
| 014 | `kunde/014-017-kunde-portal-nach-login.png` | Kunden-Portal Loading | ✅ normal (Loading-State) |
| 015 | `kunde/015-018-kunde-dashboard.png` | **CRASH-Screen** | 🔴 APP ROOT CRASH |
| 016 | `kunde/016-019-kunde-status-bereich.png` | Kunden-Status | 🔴 CRASH-Screen |
| 017 | `kunde/017-021-kunde-dokumente.png` | Dokumente-Bereich | 🔴 CRASH-Screen |
| 018 | `kunde/018-022-kunde-final.png` | Kunden-Final-State | 🔴 CRASH-Screen |
| 019 | `abrechnung/019-023-abrechnung-uebersicht.png` | Abrechnung | 🔴 CRASH-Screen (Dispatch zu /kunde redirected) |

---

## 8. Zusammenfassung (250 Worte)

**(a) Deploy live?** Ja. Production-Build läuft auf nginx/1.24.0 + Next.js, Stand PR #906 (13.05.2026 ca. 14:11 UTC). Kein Vercel-Header — VPS-hosted. Heutiger Build ist live.

**(b) Wie viele Screenshots?** 19 Screenshots total.

**(c) Token-Render-Status:** Alle 8 Klassen im CSS-Bundle verifiziert ✓. Im DOM zur Laufzeit: `shadow-claimondo-md` auf Dispatch-Portal-Element bestätigt (korrekte rgba-Werte). Marketing + Kunden-Portal: `KEIN_ELEMENT` — kein SheetCard im Viewport oder Crash verhindert Render. Keine Gray/Slate-Token-Verletzungen im DOM.

**(d) Top-3 Findings für Fix-Iteration:**
1. 🔴 **BLOCKER: Kunden-Portal `/kunde` crasht** mit Root-Error-Boundary (Digest `3073205500`). Alle echten Kunden können ihr Portal nicht öffnen. Root-Cause: Unbehandelter Throw im `/kunde/layout.tsx`, wahrscheinlich in einem der `await`-Aufrufe ohne `try/catch`. VPS-PM2-Logs und/oder Sentry-Digest nötig für präzise Zeile.
2. ⚠️ **P1: `/admin/abrechnungen` redirectet Dispatch-User zu `/kunde`** statt zu `/dispatch`. Vermutlich `roleToPath('dispatch')` gibt falschen Pfad.
3. ⚠️ **P2: GutachterFinder-Wizard Step 1→2-Transition blockiert** wegen Mapbox-Autocomplete-Validierung. Kein echtes GF-Submit möglich, kein Dispatch-Eingang, kein Outbound. Smoke-Script muss Autocomplete-Dropdown-Selektion simulieren.

**(e) Echte Outbound-Calls ausgelöst:** Null. Kein Twilio-Call, keine Email, keine WhatsApp. GF-Submit wurde nie abgeschickt.
