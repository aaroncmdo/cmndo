# /dispatch Root-Redirect — Iteration-2-Fix aus Mobile-Hygiene-Loop

**Datum:** 2026-05-15
**Branch:** `kitta/aar-dispatch-root-redirect`
**Vorläufer:** PR #1273 (`kitta/aar-mobile-hygiene`, Cookie-Banner-Fix)

## Befund

Mobile-Hygiene-Audit-Run gegen `app.staging.claimondo.de` (Iteration 2 am 2026-05-15) bestätigte das schon in Iteration 1 gemeldete Problem:

```json
{ "scope": "dispatch", "route": "/dispatch", "status": 404 }
```

Aufruf von `/dispatch` (Dispatcher-Portal-Root) liefert HTTP 404. Andere Portal-Roots (`/admin`, `/gutachter`, `/kunde`, `/kanzlei`) leiten korrekt auf ihre Dashboards/Heute-Views weiter.

## Ursache

- Keine `src/app/dispatch/page.tsx` vorhanden — nur `src/app/dispatch/dashboard/page.tsx` und die übrigen Sub-Routen.
- Kein Redirect-Eintrag in `next.config.ts` für `/dispatch`.

Andere Portale wurden bereits konsolidiert:
- `/gutachter` → `/gutachter/heute` (Z. 108, CMM-14)
- `/kanzlei` → `/kanzlei/dashboard` (Z. 202, AAR-889-Sweep)
- `/admin` → eigene `src/app/admin/page.tsx` (kein Redirect nötig)

`/dispatch` wurde bei der AAR-889-Sweep übersehen.

## Fix

Ein neuer Redirect-Eintrag in `next.config.ts:redirects()`:

```ts
{ source: '/dispatch', destination: '/dispatch/dashboard', permanent: true }
```

Bewusst als HTTP-308 (nicht als `page.tsx`-Stub mit `redirect()`), weil das Stub-Pattern in der Vergangenheit deterministisch React-#310/#418 im Next-AppRouter ausgelöst hat (siehe AAR-889-Block ab `next.config.ts:182`).

## Erwartung nach Merge

- `GET /dispatch` → HTTP 308 → `/dispatch/dashboard` (HTTP 200)
- Mobile-Hygiene-Audit-Issue-Count sinkt von 3 auf 2 (verbleibend: `/dispatch/kalender` React #418, `/kanzlei/mandate` 404)

## Verifikation (post-merge auf Staging)

Wiederhole den Audit-Script gegen Staging:

```bash
STAGING_BASIC_PASS='…' AUDIT_OUT='docs/15.05.2026/mobile-hygiene-run-3' \
  node scripts/mobile-hygiene-audit.mjs
```

Erwarteter `audit-summary.json` zeigt für `scope: "dispatch"` keinen `/dispatch`-Eintrag mehr.
