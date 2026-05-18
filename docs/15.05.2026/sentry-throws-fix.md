# Sentry-Throws-Fix — 15.05.2026 (Follow-up zu PR #1308)

## Kontext

Aaron-Anfrage: „du musst die sentry throws analysieren und fixen". Sentry-Org
`claimondo`, Projekt `javascript-nextjs`. 5 unresolved Issues (Stand 11:05 Uhr,
sortiert nach Frequenz):

| ID | Titel | Events | Trigger |
|---|---|---|---|
| NEXTJS-6 | TypeError: controller[kState].transformAlgorithm is not a function | 3 | GET / mit `?p=SMOKE-MK-TEST` |
| NEXTJS-7 | TypeError: An error occurred while loading instrumentation hook: Z.Hook is not a constructor | 2 | Server-Boot (unhandledRejection) |
| NEXTJS-8 | Cookies can only be modified in a Server Action or Route Handler | 1 | GET /schaden-melden (staging) |
| NEXTJS-9 | Cookies can only be modified in a Server Action or Route Handler | 1 | GET /schaden-melden (localhost dev) |
| NEXTJS-3 | Error: failed to pipe response | 3 | GET /gutachter-partner/opengraph-image |

## Triage

| Issue | Diagnose | Action |
|---|---|---|
| NEXTJS-3 | Transient: Browser/Bot schließt Verbindung mitten in Edge-OG-Image-Stream | Bereits per `ignoreErrors: ['failed to pipe response']` in `sentry.server.config.ts` gefiltert (PR #1301, main). Kein Code-Fix. |
| NEXTJS-6 | Transient: Node-Webstreams-Race bei Client-Abort | Bereits per `ignoreErrors: ['controller[kState].transformAlgorithm is not a function']` gefiltert (PR #1301). Kein Code-Fix. |
| NEXTJS-7 | Echter Server-Boot-Crash: IITM-Hook in Turbopack-Standalone-Bundle | **Fix in dieser PR.** |
| NEXTJS-8/9 | Echter Bug: cookies().set() im Server-Component-Render | **Fix in dieser PR (Follow-up zu PR #1308).** |

## Fix 1 — NEXTJS-8/9 (Cookies in Server Component) — Follow-up zu PR #1308

### Vorgeschichte

**PR #1308** (a1f1da1a, gemerged 11:07 Uhr) hatte den Cookie-Write in eine
eigene `'use server'`-Datei (`src/lib/flow/promo-cookie-action.ts`) extrahiert:

```ts
// page.tsx (Server Component)
const { p } = await searchParams
if (p && isValidPromoCodeFormat(p)) {
  await setPromoCookie(p)   // ← weiterhin inline-await aus Render
}
```

Das reicht NICHT. Sentry-Issue **NEXTJS-9** vom selben Tag (11:02 Uhr, release
`a335539d`, also exakt der Stand zwischen Helper-Extract und Merge) zeigt den
identischen throw mit dem neuen Code-Pfad:

```
src\app\schaden-melden\page.tsx:29:5 (async SchadenMeldenPage)
   await setPromoCookie(p)
src\lib\flow\promo-cookie-action.ts:20:5 (setPromoCookie)
   c.set(COOKIE_NAME, code, {
```

### Root Cause

Auch wenn `setPromoCookie` in einer `'use server'`-Datei lebt: solange sie
**inline aus dem Server-Component-Render-Pfad mit `await` aufgerufen** wird,
gilt der Call als Render-Seiteneffekt — Next.js erteilt keine Cookie-Mutation-
Permission. Der Action-Context (mit Cookie-Set-Erlaubnis) entsteht NUR bei
einem echten Client→Server-POST-Roundtrip.

### Fix

1. `src/app/schaden-melden/page.tsx`: Cookie-Write entfernt. Validierter
   Promo-Code wird als `initialPromo`-Prop an die Client-Component
   durchgereicht.
2. `src/app/schaden-melden/MiniWizardClient.tsx`: `useEffect`-Hook on-mount
   ruft `setPromoCookie(initialPromo)` auf. Das ist ein echter Server-Action-
   POST, Cookie-Mutation erlaubt. Fire-and-forget — Fehler werden geschluckt,
   weil der Promo-Cookie für den Submit-Flow nicht kritisch ist
   (`createLeadFromMiniWizard` liest `readPromoCookie` defensiv mit
   Null-Fallback).

`src/lib/flow/promo-cookie-action.ts` aus PR #1308 bleibt unverändert.

### Verifikation

- `npx tsc --noEmit` grün
- `npm run build` grün (Turbopack)
- Manueller Smoke ausstehend (nach Merge auf staging): `?p=MK-XXXX` setzt
  Cookie via POST-Action, kein Sentry-Event mehr

## Fix 2 — NEXTJS-7 (Z.Hook is not a constructor)

### Root Cause

Stack-Trace führt zu Sentry-Node-Init im Minified-Bundle:

```
new Q (Sentry-Hub)
Q._initialize
new en (Client)
new c (Integration)
Object.setupOnce
s → "An error occurred while loading instrumentation hook: Z.Hook is not a constructor"
```

`Z.Hook` ist die `Hook`-Klasse aus `import-in-the-middle` (IITM), die
Sentry-Node 10.x per Default für ESM-Auto-Instrumentation registriert. Beim
Tree-Shaking in Next.js-16-Standalone (Turbopack) wird die `Hook`-Klasse
offenbar nicht als Konstruktor re-exportiert — `new Hook(...)` wirft.

Sentry-Doc-Hinweis aus `@sentry/node` `types.d.ts`:

> Whether to register ESM loader hooks to automatically instrument libraries.
> This is necessary to auto instrument libraries that are loaded via ESM
> imports, but **it can cause issues with certain libraries**. If you run into
> problems running your app with this enabled, please raise an issue.

### Fix

`sentry.server.config.ts`: `registerEsmLoaderHooks: false` ergänzt.

### Trade-off

- Sentry-Error-Capture funktioniert weiter (das war eh der primäre Zweck)
- RSC-Capture via `captureRequestError` funktioniert weiter
- Explizite `Sentry.startSpan()`-Traces funktionieren weiter
- Auto-Tracing ESM-geladener Libs (HTTP-Fetches via undici-Hook etc.) entfällt

Akzeptabel: Wir nutzen Sentry für Error-Reporting + RSC-Errors, nicht für
detaillierte HTTP-Auto-Traces.

## 7-Punkte-Audit

1. **Build:** `npx tsc --noEmit` grün, `npm run build` grün (Turbopack
   kompiliert in 60s; TS-Phase mit `NODE_OPTIONS=--max-old-space-size=8192`)
2. **UI:** Kein Einstiegspunkt-Change — Fix ist transparent
3. **Redundanz:** Nutzt die existierende `promo-cookie-action.ts` aus PR
   #1308 weiter; keine neue Server-Action-Datei
4. **Dead-Code:** Keine
5. **Spec:** AAR-467 C1 (Promo-Cookie-Attribution) funktional unverändert
6. **Inkonsistenz:** Umlaute korrekt, kein Token-Hex
7. **Regression:** `readPromoCookie` + `createLeadFromMiniWizard` intakt;
   keine Konsumenten von `setPromoCookie` außerhalb des Schaden-Melden-Flows
   (greppt: nur page.tsx → MiniWizardClient)

## Files

```
M  sentry.server.config.ts
M  src/app/schaden-melden/MiniWizardClient.tsx
M  src/app/schaden-melden/page.tsx
A  docs/15.05.2026/sentry-throws-fix.md
```

## Koordination

Andere parallele Sessions zum Zeitpunkt des Fixes (per
`current_focus_*.md`-Marker):

- `a1f1da1a` — Hatte PR #1308 gemerged, danach auf Memory-Updates +
  Smoke-Skripte umgeschwenkt. Keine aktive Promo-Datei-Arbeit mehr.
- `4d587522` — RLS-Grants + Cluster F+G Migrationen, unabhängiger Scope
- `db63d2b4` — AAR-924/926 Billing, unabhängiger Scope

Keine File-Kollision auf den editierten Pfaden zum Push-Zeitpunkt.
