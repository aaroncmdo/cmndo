# Prod-Fehler-Bestandsaufnahme — 2026-07-14 (Playwright-Route-Sweep)

Punkt-in-Zeit-Snapshot der App-Gesundheit auf `https://app.claimondo.de`, erhoben per
authentifiziertem Chromium-Route-Sweep. **Read-only** (nur Navigation, keine Action-Klicks →
keine Writes/Comms).

> **⚠ Harness-Bug unterwegs gefunden & gefixt (wichtig für die Interpretation).**
> Der geteilte `cookie.mjs`-Login setzte den Supabase-Auth-Cookie mit `httpOnly:true`. SSR liest
> den, der **Browser-Supabase-Client** (`@supabase/ssr` liest aus `document.cookie`) aber NICHT →
> jede **client-seitige** REST/Realtime-Query lief unauthentifiziert und lieferte **401 / 500 /
> „Failed to fetch"**. Das ist ein **Harness-Artefakt**, das echte Nutzer (JS-lesbarer Cookie aus
> normalem Login) NICHT haben. Fix: `httpOnly:false` (spiegelt das reale App-Verhalten; SSR liest
> den non-httpOnly-Cookie weiter). **Zwei ursprünglich gemeldete Funde stellten sich damit als
> Artefakte heraus (s.u. „Zurückgezogen").** Erkannt, weil 401 ein *Auth*-Fehler ist, RLS-Denial
> aber 200+`[]` liefern würde.

## Methode & Harness

`scripts/prod-smoke/route-sweep.mjs` — Cookie-Injection-Login (umgeht 2FA-UI), besucht eine
Routen-Liste, erfasst pro Route: HTTP-Status · Redirect · `console.error`/`pageerror` ·
API-Calls ≥400 (401/403 vs 5xx getrennt) · Error-Boundary im **sichtbaren** Body (nicht im HTML —
sonst Next.js-Bundle-False-Positive). `domcontentloaded`+Settle statt `networkidle`
(Realtime-Websockets). **Nur die httpOnly:false-Läufe testen client-seitige Queries akkurat.**

## Abdeckung

~70 Routen: **admin** (41), **kundenbetreuer** (11), **sachverstaendiger** (13), public (6).
**Nicht abgedeckt:** Detail-Views nur teilweise (prod hatte 0 Claims — 1 Test-Claim gebaut+geräumt) ·
Portale kanzlei/makler/werkstatt/kunde/flottenmanager (keine Test-Zugangsdaten).

## Health-Zusammenfassung (nach Harness-Korrektur)

Mit akkuratem Harness (httpOnly:false) nachgeprüft: **App gesund.** admin ~41/41 · KB 11/11 ·
SV 11/13 · public 5/6 · Detail-Views (Fallakte, Claim-Chat) OK.

## Echte Funde (reproduzierbar, überleben den Harness-Fix)

1. **`/gutachter/community` + `/gutachter/team` → React #310** für SV ohne Mitgliedschaft/Org
   (2× reproduziert, auch mit gefixtem Cookie). Der Guard-Redirect landet korrekt auf
   `/gutachter/heute?error=…` (Toast), wirft dabei aber #310. Hängt an der bekannten
   „`/gutachter/heute`-Chunk dynamic-import #310"-Tech-Debt (`next.config.ts:96`). Kein sichtbarer
   Breakage. **Severity: Low (kosmetisch).**
2. **`holeOderErstelleDirektThread` (`src/lib/chat/thread-actions.ts:68`) ungated** — kein
   Claim-Zugriffs-Check (anders als die Geschwister-Actions). Jeder eingeloggte User kann einen
   DM-Thread an einem beliebigen Claim mit einem beliebigen User anlegen (Spam-/Social-Engineering-
   Vektor, kein Daten-Leak). Code-Level-Fund (nicht sweep-abhängig). **Severity: Medium (Security).**

## Zurückgezogen (Harness-Artefakte des httpOnly-Cookies — KEINE App-Bugs)

- ~~`/admin/marketing/content-studio` → 500~~ — mit httpOnly:false OK. Der 500 kam von einem
  client-seitigen Fetch, der bei fehlender Browser-Session server-seitig scheiterte. *(Eine
  Parallel-Session debuggte zeitgleich einen marketing-Render-Error — evtl. verwandt, aber der
  hier gemessene 500 war das Harness-Artefakt.)*
- ~~`GET /rest/v1/gutachter_termine` → 401 (Fallakte-Detail)~~ — Quelle:
  `TerminListeClient.tsx:105` (Client-Query via Browser-Supabase, gerendert in
  `faelle/[id]/_sidebar/FallSidebar.tsx`). Mit httpOnly:false → 200/OK. RLS auf gutachter_termine
  ist intakt (`staff_fall_scoped` etc.); 401 war reine fehlende Browser-Auth im Harness.

## Kein Bug / Kontext

- `/gutachter/verifizierung` „Failed to fetch" = **Mapbox-Satellitenkachel** (extern).
- `/gutachter` direkt → **502** = Deploy-in-progress (Release-Session redeployte prod).
- `/register` → **404** (kein Public-Self-Registration). App-Root `/` → `/login` (App-Subdomain).
- Viele Alt-Tool-Routen redirecten sauber (200) unter die Hub-Routen.

## `anlegeFall`-Audit (Zusatzfrage: vollständig + operativ sinnvoll?)

`/admin/faelle/anlegen` legt strukturell vollständig an: `claim` + `faelle_claim_bridge` +
`claim_party` (geschädigter, mit `person_id`) + `lead`, via kanonischem `convertLeadToClaim`.
**Operativ sichtbar** im Admin-Fälle-Board (Phase Erfassung, Name/KB/SV korrekt). ABER „dünn":
**kein Kunden-Auth-Account** (`geschaedigter_user_id=NULL`), kein Vehicle (ohne Kennzeichen),
**0 pflichtdokumente, 0 tasks**, `schadenart='unbekannt'` (wenn ungesetzt). Für „telefonisch
reingekommen" plausibel by-design; pflichtdok/tasks evtl. später generiert (nicht gegenprüfbar,
0 andere Claims). **`v_claim_full`-„0-Zeilen"-Verdacht war falsch** — View-Gate
`WHERE claim_sichtbar_fuer_aktuellen_user(sub.id)` + MCP-postgres (`auth.uid()=null`); echter
Admin sieht den Fall (app-verifiziert).

## ⚠ Daten-Zustand

Prod hatte **0 Claims / 0 Leads** (Purge-Sessions; Profile 35 + SVs 9 intakt) — auf „keine echten
Fälle verloren" verifizieren.

## Follow-ups

- kanzlei/makler/werkstatt/kunde/flotte-Portale (brauchen Test-Zugangsdaten).
- Vollständiger Re-Sweep aller ~70 Routen mit dem **gefixten** Harness (httpOnly:false) für
  akkurate client-seitige Abdeckung — der erste Durchlauf war für SSR-Render verlässlich, für
  client-seitige Queries nicht.
