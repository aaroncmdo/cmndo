# Bug-Audit: SV-Onboarding /willkommen — „muss einmal laden"

**Datum:** 2026-05-12
**Symptom:** Sachverständige beim ersten Login landen auf `/gutachter/willkommen`, aber die Seite rendert nicht korrekt — User muss manuell F5/Reload drücken, dann erscheint der Wizard.
**Status:** Root-Cause-Analyse abgeschlossen, Fix nicht implementiert (per User-Direktive nur Audit).

---

## TL;DR

Hauptverdächtiger ist der **Read-Lag-Workaround in `src/app/gutachter/willkommen/page.tsx:55-60`** in Verbindung mit dem **`window.location.reload()`-Mechanismus in `WillkommenWaiting.tsx`**. Die Konstruktion „Server-Component sieht keine Row → Client-Spinner → 4-Sekunden-Auto-Reload" hat **mindestens drei reproduzierbare Versagensmodi**, die alle als „muss einmal laden" wahrgenommen werden.

Sekundär: Der **Pathname-Header-Check im Gutachter-Layout** (`src/app/gutachter/layout.tsx:77-86`) verlässt sich auf `x-pathname`/`x-next-url`/`x-invoke-path`-Header, die nur bei spezifischer Middleware-Konfiguration zuverlässig gesetzt werden — und die Middleware setzt sie nicht in allen Code-Pfaden korrekt.

---

## Reproduktionsfluss (rekonstruiert aus Code)

1. **Admin legt SV an** über `src/app/admin/sachverstaendige/anlegen/actions.ts`
   - `auth.admin.createUser()` — neuer Auth-User
   - `sachverstaendige.insert(...)` mit `portal_zugang_freigeschaltet: false`
   - Beide Inserts in **derselben Server-Action** mit Service-Role-Client
2. **SV loggt sich erstmals ein** über `src/app/login/actions.ts`
   - `signInWithPassword` → Auth-Cookies werden gesetzt
   - `roleToPath('sachverstaendiger')` → `'/gutachter'`
   - `revalidatePath('/gutachter', 'layout')`
   - `redirect('/gutachter')`
3. **Browser GET `/gutachter`** → Middleware → `x-pathname=/gutachter` → Layout läuft
4. **`src/app/gutachter/layout.tsx`** lädt:
   - `getUser()` ✓
   - `profiles`-Query → `rolle='sachverstaendiger'` ✓
   - `sachverstaendige`-Query mit `.eq('profile_id', user.id).maybeSingle()`
   - Ergebnis: `sv` existiert, aber `portal_zugang_freigeschaltet=false`
   - `pathname='/gutachter'` → `isOnboardingPath=false`
   - → `redirect('/gutachter/willkommen')`
5. **Browser GET `/gutachter/willkommen`** → Layout läuft erneut
   - Diesmal: `pathname='/gutachter/willkommen'` → `isOnboardingPath=true` → kein Redirect
   - Page-Component rendert
6. **`src/app/gutachter/willkommen/page.tsx`** lädt:
   - `sachverstaendige`-Query mit `.eq('profile_id', user.id)` (ohne `.single()`, gibt Array)
   - **Wenn `allSvs.length === 0`** → `<WillkommenWaiting />` (Spinner mit Auto-Reload nach 4 s)
   - Wenn Row da → `WillkommenClient` rendert den Wizard

---

## Versagensmodi

### Modus A — Read-Lag-Race (wahrscheinlichster Hauptverdächtiger)

**Hypothese:** Zwischen dem Admin-Insert (Schritt 1) und dem SV-Login (Schritt 2) liegen oft Stunden/Tage — also **kein Race-Lag im klassischen Sinne**. Aber der Check in `page.tsx:55` triggert trotzdem, weil:

- **Layout-Query (Schritt 4)** nutzt `.maybeSingle()` → bei mehreren SV-Rows pro Profil (Inhaber+Sub) wirft das im PostgREST einen 406-Fehler oder gibt `null` zurück. `sv?.portal_zugang_freigeschaltet === false` evaluiert dann zu `false` (kein Triple-Equals-Match auf null). `!sv` aber ist `true`, also Redirect feuert.
- **Page-Query (Schritt 6)** nutzt `.eq('profile_id', user.id)` ohne `.single()` → liefert Array. Aber: wenn die RLS-Policy auf `sachverstaendige` an irgendeiner Stelle restriktiv ist (z. B. nur Rows wo `profile_id = auth.uid()` aber zusätzliche Bedingungen wie `aktiv=true` oder `geloescht_am IS NULL`), dann kann es passieren, dass die Page **leeres Array** sieht, obwohl die Row im DB physisch existiert.

**Ergebnis:** `<WillkommenWaiting />` rendert mit dem Hinweis „Konto wird eingerichtet …". Auto-Reload nach 4 s. Wenn die Bedingung sich nicht ändert (z. B. weil RLS-Policy weiterhin filtert), → **Endlos-Loop von 4-Sekunden-Reloads**, den der User als „kaputte Seite" wahrnimmt und manuell F5 drückt — was zur exakt gleichen Page führt.

**Indizien im Code:**
- Kommentar in `page.tsx:56-58` selbst: „Supabase-Propagierungs-Lag … nach 4 s ist die Row da" — diese Annahme ist nicht durch Telemetrie belegt
- Kein Telemetry-Event auf den `<WillkommenWaiting />`-Zweig → wir wissen aktuell nicht wie oft / wie lange User darin landen
- `WillkommenWaiting.tsx:13` macht **immer** Reload nach 4 s, auch wenn vorher kein Initial-Render-Erfolg war → der User sieht den Spinner, dann kurz das gleiche Page-Bild, dann wieder Spinner

### Modus B — `x-pathname`-Header inkonsistent gesetzt

**Hypothese:** Der Check im Layout

```ts
const pathname = h.get('x-pathname') ?? h.get('x-next-url') ?? h.get('x-invoke-path') ?? ''
const isOnboardingPath = isWillkommenPath || pathname.includes('/gutachter/onboarding')
if (!sv || sv.portal_zugang_freigeschaltet === false) {
  if (!isOnboardingPath) redirect('/gutachter/willkommen')
}
```

verlässt sich darauf, dass die Middleware den `x-pathname`-Header injiziert hat. Das passiert in `src/lib/supabase/middleware.ts:14`:

```ts
requestHeaders.set('x-pathname', request.nextUrl.pathname)
```

aber **nur wenn der Request über `NextResponse.next({ request: { headers: requestHeaders } })`** durchgelassen wird (Zeilen 17, 101, 105, 109). **Bei Redirects (Zeile 84, 94, 99) wird `requestHeaders` nicht mitgegeben** — was technisch korrekt ist, weil Redirects die Page nicht rendern.

**Aber:** Wenn die Middleware `NextResponse.redirect()` zurückgibt (z. B. weil 2FA-Cookie abgelaufen ist), wird der Browser auf `/login/2fa` geschickt → User logt sich neu ein → neue Session → kommt auf `/gutachter` → … vermutlich kein direktes Symptom hier.

Echter potenzieller Bug: `x-next-url` und `x-invoke-path` sind Next.js-15-internal-Headers, die in **Next.js 16 entfernt oder umbenannt** wurden. Wenn der Build auf Next 16 läuft (Aaron erwähnte „This is NOT the Next.js you know" in CLAUDE.md), kann der Fallback nicht mehr greifen. Bleibt nur `x-pathname` aus der Middleware. Wenn diese aus irgendeinem Grund nicht gesetzt ist (z. B. Edge-Caching, CDN strippt Custom-Header), wird `pathname=''`, `isOnboardingPath=false`, **infinite Layout-Redirect-Loop** auf `/gutachter/willkommen` → Next.js fängt das ab mit „too many redirects" → User sieht weiße Seite → drückt F5 → manche Reload-Variante schickt anderen Header-Set → Loop bricht.

### Modus C — Router-Cache + Soft-Navigation

**Hypothese:** Nach `redirect('/gutachter')` aus der Server-Action serviert Next.js die RSC-Payload aus dem Cache, falls vorhanden. `revalidatePath('/gutachter', 'layout')` wird in `login/actions.ts:133` aufgerufen, **invalidiert aber NICHT `/gutachter/willkommen`**. Wenn der Layout-Redirect von `/gutachter` auf `/gutachter/willkommen` springt, könnte eine alte (z. B. anonyme) RSC-Cache-Entry für `/gutachter/willkommen` existieren, die geliefert wird. Der Browser würde dann statt der korrekten Seite eine alte Version sehen, die nicht zur aktuellen Session passt.

Ein manuelles `window.location.reload()` würde den Router-Cache umgehen (echter Server-Roundtrip ohne RSC-Payload-Cache) und die korrekte Seite holen.

**Indizien:**
- Kommentar in `login/actions.ts:130-132` adressiert genau diesen Fall für `/gutachter`, aber nicht für die nachfolgende Redirect-Kette
- Pattern „Server-Action → revalidate → redirect → noch ein redirect" ist eine bekannte Cache-Edge-Case in Next.js 15+

---

## Sekundärbefunde

1. **Inkonsistente `single()`-Strategie zwischen Layout und Page**
   - Layout: `.maybeSingle()` (erwartet 0 oder 1 Row)
   - Page: ohne `.single()` (erwartet Array, wegen Inhaber+Sub-Akademie-Mehrfach-Rows)
   - Wenn ein User mehrere SV-Rows hat (Inhaber + Sub-Standort), wirft `.maybeSingle()` im Layout einen Fehler oder gibt unzuverlässig eine der Rows zurück. Layout könnte dann fälschlich `!sv` true setzen und Redirect feuern — die Page-Query findet dann zwar Rows, aber der User wurde unnötig redirected.

2. **`WillkommenWaiting` ohne Maximal-Versuch-Counter**
   - Reload-Loop kann theoretisch ewig laufen, wenn z. B. die Row dauerhaft nicht sichtbar ist (RLS-Misconfiguration, gelöschte Row, etc.)
   - Kein Telemetry-Hook → wir würden den Fall nie sehen
   - Kein User-Eject-Button („Ich bin hier falsch — zurück zum Login")

3. **Header-Fallback-Liste enthält Legacy-Next-Header**
   - `x-next-url` und `x-invoke-path` sind Next-internal und können stillschweigend entfernt werden. Eigentlich sollte nur `x-pathname` (own custom header) zählen
   - Wenn der eigene Header fehlt, ist die Logik kaputt — sollte explizit als Fehler geloggt werden, nicht stillschweigend als leerer String fallback'en

4. **Unicode-BOM am Start von `WillkommenClient.tsx`**
   - Datei beginnt mit `﻿` (BOM). Bei `'use client'`-Komponenten kann das in seltenen Fällen die React-Server-Component-Boundary verwirren oder in Build-Tools für stille Probleme sorgen. Niedriges Risiko, aber Code-Hygiene-Issue.

---

## Empfohlene Diagnose-Schritte (vor jedem Fix)

In Reihenfolge:

1. **Telemetry an `<WillkommenWaiting />`-Zweig hängen**
   - Counter erhöhen wenn dieser Zweig rendert + Reload-Counter mitsenden
   - Erwartung: bei „echtem Read-Lag" sehen wir 1-2 Reload-Zyklen pro Erstlogin; bei dauerhaftem Nicht-Sehen-der-Row sehen wir > 5 → klare Diagnose

2. **`pathname` aus Layout mitloggen** (Sentry-Breadcrumb oder console.warn auf VPS-Logs)
   - Erwartung: alle Layout-Renders haben `pathname=/gutachter/...`. Wenn leer/null → Modus B bestätigt

3. **In Layout-Query von `.maybeSingle()` auf Array umstellen** (analog zur Page) und beide Queries im selben Pattern halten — das schließt Modus A1 (single-vs-array-Inkonsistenz) aus

4. **Manueller Repro in Staging**
   - Neuen SV anlegen via `/admin/sachverstaendige/anlegen`
   - Im Inkognito-Tab als der neue SV einloggen
   - DevTools → Network → schauen ob `/gutachter/willkommen` zwei Mal vom Server geladen wird (Mit + Ohne Spinner)
   - DevTools → Application → Cookies → ist die Auth-Session korrekt da?
   - Wenn ja → Modus A bestätigt (4-s-Reload-Mechanik). Wenn nein → Modus B oder C

---

## Mögliche Fixes (zur späteren Diskussion, nicht jetzt umsetzen)

| Fix | Adressiert | Aufwand | Risiko |
|---|---|---|---|
| `WillkommenWaiting` polling statt Page-Reload (Server-Action `checkSvExists()` alle 1 s, max 10 Versuche) | Modus A | 1-2 h | niedrig — kein DOM-Reset, sauberer State |
| Layout-Query auf gleiches Pattern wie Page (`.eq().select()` ohne `.single()`) | Modus A1 | 30 min | sehr niedrig — minimaler Refactor |
| `x-pathname`-Fallback auf `request.url` von Middleware durchreichen, Legacy-Header rauswerfen | Modus B | 1 h | niedrig |
| `revalidatePath('/gutachter/willkommen', 'layout')` in `login/actions.ts` zusätzlich aufrufen | Modus C | 5 min | sehr niedrig |
| Telemetry-Event in `WillkommenWaiting` für Reload-Counter | Diagnose | 30 min | null |
| Hard-Eject-Button in `WillkommenWaiting` nach 3 Reloads („Bei Problemen melden Sie sich beim Support") | UX-Safety | 30 min | null |

---

## Was ich NICHT geprüft habe

- Live-Logs vom VPS (Sentry / `pm2 logs`) — wäre der schnellste Weg zur Bestätigung von Modus A vs B
- DB-RLS-Policies auf `sachverstaendige` — könnte Modus A1 (RLS-Filter blockt SELF-Read) oder ausschließen
- Tatsächliches Next.js-Versions-Verhalten der `x-pathname`-Header in Production-Build (nur statische Code-Analyse)
- E2E-Smoke-Test für den First-Login-Pfad — würde zeigen ob das Bug konsistent oder sporadisch ist

---

## Empfehlung Reihenfolge

1. **Diagnose-Telemetry** in `WillkommenWaiting` und Layout-Pathname-Check (1-2 h Dev) → 1-2 Tage Daten sammeln
2. Auf Basis der Daten **klare Entscheidung Modus A vs B vs C**
3. Dann **gezielter Fix** (Polling statt Reload + Layout-Query-Konsistenz sind die wahrscheinlichsten Sieger)

Mein Bauchgefühl nach Code-Lesen: **Modus A** ist mit Abstand am wahrscheinlichsten (Read-Lag oder RLS-Filter-Inkonsistenz). Der `window.location.reload()`-Workaround ist konzeptionell schwach — er resetet den ganzen Browser-State und gibt dem User die hässliche Spinner-Seite, statt sauber im Hintergrund zu pollen.
