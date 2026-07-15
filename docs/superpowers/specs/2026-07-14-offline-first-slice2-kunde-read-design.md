# Offline-First Slice 2 (Kunde Roadside — Offline-READ) — Design-Spec

**Datum:** 2026-07-14
**Branch:** `kitta/offline-first-slice2-kunde` (aus `origin/…offline-first-field-cache` = Slice 0)
**Status:** Design abgenommen (Brainstorming-Gate) → bereit für writing-plans
**Approved:** Aaron 2026-07-14 (Ansatz A, Scope = Offline-Lesen diese Slice)

---

## 1 · Problem & Kontext

Der Kunde am Straßenrand nach einem Unfall (Landstraße, kein Empfang) soll den Magic-Link `/flow/[token]` **auch ohne Netz wieder öffnen** und seinen Flow sehen können — statt einer Browser-Fehlerseite oder weißen Seite.

**Die Wand, die das Design-Ziel der ursprünglichen Spec traf:** `/flow/[token]/page.tsx` ist eine **Server-Component** (dynamisch SSR, liest Cookies). Um sie offline zu rendern, muss der Service-Worker die **Navigation** bedienen — und genau das grenzt an die **CMM-14-Narbe** (SW fängt RSC-Stream `?_rsc=` im Install-Race ab → weiße Seite). Slice 0 hält den SW deshalb bewusst static-only.

**Der entschärfende Befund** (Grounding `slice2-read-feasibility.md`): Der CMM-14-Auslöser ist spezifisch das **Abfangen von RSC-Soft-Navigation-Streams (`?_rsc=`)** während des Install/Activate-Race. **Harte Dokument-Navigationen (`request.mode === 'navigate'`) sind NICHT im Blast-Radius** — und `?_rsc=`-Requests sind nie `mode==='navigate'`. Zusätzlich: die Flow-Seite liefert HTML mit **inline RSC-Payload** (`self.__next_f.push`) → sie **hydriert offline aus sich selbst** (kein Server-Roundtrip), und sie rendert **keine `<Link>`/`next/image`** → feuert **null Framework-Prefetch** beim Hydrieren. Kein `middleware.ts` → kein Edge-Redirect.

Damit ist ein **schmaler, CMM-14-sicherer** Offline-Navigations-Cache möglich, ohne die riskante App-Shell.

---

## 2 · Scope-Entscheidung (abgenommen)

| Entscheidung | Wahl |
|---|---|
| Ansatz | **A — Network-First Navigations-Cache** (SW cached das SSR-HTML + Chunks, serviert offline). Nicht B (generische App-Shell). |
| Diese Slice | **Offline-LESEN**: Kunde öffnet `/flow/[token]` offline neu → sieht seinen Flow (gecachtes, selbst-hydrierendes HTML). |
| Offline-SCHREIBEN | **Folge-Slice** (die bewährten Handler wie Slice 1/1b). Nicht in dieser Slice. |
| Fläche | Nur `public/sw.js` + kleiner `next.config.ts`-Header + optional `register-sw.ts`. **Keine** Änderung an `page.tsx`/`FlowWizardKfz`. |
| DDL | **Keins** (Client-SW + Config). |

### Non-Goals (YAGNI)
- **Keine** Änderung an `page.tsx` / `FlowWizardKfz` / dem Wizard-Rendering.
- **Kein** Offline-Schreiben (Formular-Submits scheitern offline weiterhin wie heute — Server-Actions brauchen Netz; das ist die Folge-Slice).
- **Keine** generische App-Shell / kein zweiter Render-Pfad / keine Flow-Snapshot-Pipeline.
- **Kein** Serwist/Workbox (die Next-16-PWA-Doc verweist darauf, warnt aber: braucht Webpack-Config — kollidiert mit unserem Turbopack-Dev + custom `webpack()`-Alias). DIY-SW bleibt.
- **Kein** Caching von anderen Routen — nur `/flow/*` + `/_next/static/*`.

---

## 3 · Architektur — der CMM-14-sichere SW-Fetch-Handler

`public/sw.js` bekommt **zwei neue Branches** vor dem bestehenden Static-Assets-Branch; alles andere behält exakt das heutige Pass-Through-Verhalten.

### 3.1 Der Diskriminator (die CMM-14-Sicherheits-Invariante)

```js
function isHardFlowDocument(request, url) {
  return (
    request.method === 'GET' &&
    request.mode === 'navigate' &&           // nur harte Dokument-Navigation
    !url.searchParams.has('_rsc') &&         // NIE ein RSC-Soft-Nav-Stream (CMM-14-Landmine)
    request.headers.get('RSC') !== '1' &&    // belt-and-braces
    !request.headers.has('Next-Router-Prefetch') &&
    url.pathname.startsWith('/flow/') &&
    url.origin === self.location.origin
  )
}
```
`?_rsc=`-Requests sind nie `mode==='navigate'` → fallen automatisch auf den Pass-Through. Die `_rsc`/`RSC`/`Next-Router-Prefetch`-Checks sind zusätzliche Absicherung.

### 3.2 Die drei Branches (in dieser Reihenfolge)

1. **`/_next/static/*` — cache-first** (NEU). Content-gehashte, immutable Chunks/CSS/Fonts. Ohne diesen Branch kann das gecachte Flow-HTML offline nicht hydrieren (Chunks fehlen). Self-warming: der erste **Online**-Besuch von `/flow/*` cached genau die Chunks, die die Seite braucht. Eigener Cache `claimondo-next-static-v1`.
   ```js
   if (url.pathname.startsWith('/_next/static/') && url.origin === self.location.origin) {
     event.respondWith(
       caches.open(NEXT_STATIC_CACHE).then(async (cache) => {
         const hit = await cache.match(request)
         if (hit) return hit
         const res = await fetch(request)
         if (res.ok) cache.put(request, res.clone())
         return res
       })
     )
     return
   }
   ```

2. **`isHardFlowDocument` — network-first mit Cache-Fallback** (NEU). Online → echter `fetch` zuerst (SW „besitzt" die Response nicht, klont nur → **online byte-identisch**), Klon in `claimondo-flow-docs`. Offline (`fetch` wirft) → gecachtes HTML; nichts gecached → minimale inline-branded Fallback-Response.
   ```js
   if (isHardFlowDocument(event.request, url)) {
     event.respondWith(
       (async () => {
         try {
           const res = await fetch(event.request)
           const cache = await caches.open(FLOW_DOCS_CACHE)
           cache.put(event.request, res.clone())
           void evictFlowDocs(cache, FLOW_DOCS_MAX)  // bounded, keine unbegrenzte Größe
           return res
         } catch {
           const cached = await caches.match(event.request)
           return cached ?? new Response(OFFLINE_FALLBACK_HTML, {
             status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
           })
         }
       })()
     )
     return
   }
   ```

3. **Bestehend** — Static-Assets (cache-first) + Pass-Through (alles andere, inkl. RSC/API/Auth). Unverändert.

### 3.3 Cache-Verwaltung
- Neue Caches: `FLOW_DOCS_CACHE = 'claimondo-flow-docs-v1'`, `NEXT_STATIC_CACHE = 'claimondo-next-static-v1'`. Beide in die `activate`-Cleanup-Allowlist aufnehmen (sonst werden sie beim nächsten Activate gelöscht).
- `evictFlowDocs(cache, max)`: bei Überschreiten von `FLOW_DOCS_MAX` (z.B. 5) die ältesten Keys löschen (count-bounded — wenige Tokens pro Gerät; kein echtes LRU nötig).
- Chunk-Cache wächst über Deploys (alte gehashte Chunks) → beim SW-Update Cache-Version bumpen (Name ändern) → `activate` prunt die alte Version.

### 3.4 SW-Auslieferung (prompt)
- `next.config.ts` `headers()`: `Cache-Control: no-cache, no-store, must-revalidate` für `source: '/sw.js'` (fehlt aktuell) → Browser holt `sw.js` bei jedem Load neu → SW-Update greift zeitnah.
- `register-sw.ts`: `updateViaCache: 'none'` am `register('/sw.js', { scope: '/', updateViaCache: 'none' })` (Doc-Parität).
- Die **3-Sekunden-Registrierungs-Verzögerung** (`ServiceWorkerBoot`) und `skipWaiting()`/`clients.claim()` bleiben **unverändert** — die Install/Activate-Timing der initialen kritischen Navigationen darf sich nicht ändern.

---

## 4 · Datenfluss / was der Kunde sieht

**Voraussetzung (Roadside-Sequenz):** Der Kunde öffnet den Link **einmal online** (Dispatcher schickt ihn; Kunde öffnet ihn zuhause / mit Empfang) → SW cached das SSR-HTML (seine Daten eingebettet) + die Chunks.

| Situation | Verhalten |
|---|---|
| **Online öffnen** | Echter `fetch` → SSR-HTML → SW klont in Cache + Chunks self-warmen. **Byte-identisch** zu heute. |
| **Offline neu öffnen (gecached)** | SW serviert gecachtes HTML → hydriert aus inline `self.__next_f`-Payload → Kunde sieht seinen Flow, Wizard client-interaktiv. |
| **Offline neu öffnen (nie online geöffnet)** | Minimale branded Fallback-Seite („Bitte öffnen Sie den Link einmal mit Internetverbindung") statt Browser-Fehler. |
| **Offline submitten** | Server-Action scheitert (kein Netz) — **wie heute**. Kein Fortschrittsverlust-Schutz in dieser Slice (= Offline-Schreiben-Folge-Slice). Keine Regression. |

---

## 5 · CMM-14-Sicherheits-Analyse (warum das nicht re-triggert)

1. **Nur `mode==='navigate'`-HTML-Dokumente** auf `/flow/*` werden abgefangen. `?_rsc=`-Streams (der echte Auslöser) sind nie `navigate` → bleiben auf Pass-Through. Plus explizite `_rsc`/`RSC`/`Next-Router-Prefetch`-Ausschlüsse.
2. **Network-First** → der SW besitzt die Response online nicht, klont nur. Kein Verhaltens­wechsel bei Verbindung → das Install/Activate-Race-Fenster sieht für die kritischen initialen Navigationen aus wie heute.
3. **3-Sekunden-Delay bleibt** → der erste Fetch-Handler installiert weiterhin nach den initialen Navigationen.
4. `router.refresh()` (LeadRealtimeRefresh, umbuchen) schlägt offline als **stiller Netzfehler** fehl (UI bleibt) — **kein** CMM-14 (ein fehlgeschlagener Offline-`?_rsc=` ist kein korrupter Install-Stream). Realtime verbindet offline ohnehin nicht.
5. Kein `middleware.ts` → kein Edge-Redirect gegen den man offline kämpft.

**Kritisch:** Build/tsc fängt eine CMM-14-Regression NICHT (wie das Redirect-Stub-Gate). Nur ein **echter Offline-Render-Smoke** verifiziert das (§7).

---

## 6 · Fehlerbehandlung / Edge-Cases
- **Token im Cache-Key:** `caches.match(request)` keyt auf die volle URL inkl. Token → jeder `/flow/<token>` cached unabhängig (korrekt; Kunde öffnet nur seinen eigenen Link).
- **Abgelaufener/verbrauchter Token:** gecachtes HTML zeigt offline den **alten** Stand. Für Lesen akzeptabel; die Server-Wahrheit gewinnt beim nächsten Online-Load. (Offline-Submit eines abgelaufenen Tokens = Folge-Slice-Thema, hier n/a.)
- **Cache-Staleness allgemein:** die Seite ist dynamisch gerendert; das gecachte HTML ist ein Zeitpunkt-Snapshot. Für „zeig mir meinen Flow" fine.
- **Chunk-Verfügbarkeit:** cache-first `/_next/static/*` warmt beim Online-Besuch; content-gehasht → cache-first korrekt. `output: 'standalone'` (VPS, kein CDN) → Chunks vom Node-Server; cache-first reduziert VPS-Last.
- **Nichts gecached:** inline Fallback-HTML (kein separater precached File nötig).

---

## 7 · Verifikation (PFLICHT — Prod-Smoke-Mandat)

**Build/tsc + Ratchets** grün (component-set/knip/token-audit/status-registry; die SW-Änderung ist reines JS in `public/`, keine neuen Tokens/Komponenten).

**Mandatory Offline-Smoke** (fängt CMM-14, was Build NICHT tut) — gegen die **PR-Preview-Deploy-URL** (oder lokalen Prod-Build falls RAM erlaubt), per Playwright/webapp-testing:
1. **Warm:** `/flow/<test-token>` online laden → HTML + Chunks cachen (SW registriert nach 3s; ggf. 2. Load).
2. **Offline:** `context.setOffline(true)` → **Hard-Reload** `/flow/<test-token>` → assert: die Seite **rendert + hydriert** aus Cache (nicht weiße Seite / nicht Browser-Fehler; ein bekanntes Flow-Element sichtbar).
3. **CMM-14-Regression-Check (online):** mit dem neuen SW aktiv, eine **`?_rsc=`-Soft-Navigation** (z.B. Login-Redirect / Client-Nav) online durchspielen → assert: **keine weiße Seite**, funktioniert wie zuvor.
4. **Byte-identisch online:** ein normaler Online-`/flow`-Load verhält sich unverändert.

Test-Token: über die App/DB einen Flow-Link erzeugen (Test-Konto). Smoke-Ergebnis im PR dokumentieren; ohne grünen Offline-Smoke **kein Merge**.

---

## 8 · Betroffene Dateien
- `public/sw.js` — 2 neue Fetch-Branches (`/_next/static/*` cache-first; `isHardFlowDocument` network-first) + `evictFlowDocs` + `OFFLINE_FALLBACK_HTML` + neue Cache-Namen in der `activate`-Allowlist.
- `next.config.ts` — `headers()`-Eintrag `Cache-Control: no-store` für `/sw.js`.
- `src/lib/offline/register-sw.ts` — `updateViaCache: 'none'` (klein, optional-aber-empfohlen).
- **Unverändert:** `page.tsx`, `FlowWizardKfz`, alle Server-Actions, das IndexedDB-Offline-Foundation.

## 9 · Rollout
Eigener PR gegen den Slice-0-Branch (gestackt, wie Slice 1/1b) oder `staging` mit #4194-Hinweis. Offline-Smoke = Merge-Gate. Die **Offline-Schreiben-Slice** (Formular/Fotos/Signatur queuen — die 9 Handler aus `slice2-grounding.md`) folgt separat auf dieser Foundation.
