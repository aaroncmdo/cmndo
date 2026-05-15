# /kanzlei/mandate Route — Rename von /kanzlei/dashboard

**Datum:** 2026-05-15
**Branch:** `kitta/aar-kanzlei-mandate-route`
**Vorläufer:** PR #1273, #1281, #1285 (Mobile-Hygiene-Loop)
**Loop:** Mobile-Hygiene Iteration 4 (final)

## Befund

Mobile-Hygiene-Audit (alle Iterationen) reportet konsistent:

```json
{ "scope": "kanzlei", "route": "/kanzlei/mandate", "status": 404 }
```

Die URL `/kanzlei/mandate` existiert nicht — aber die Page **existiert bereits** als `/kanzlei/dashboard`:

- `src/app/kanzlei/dashboard/page.tsx` rendert per `PageHeader` den Titel **„Mandate"** (Z. 44)
- `KanzleiNav` benennt den NavLink `/kanzlei/dashboard` ebenfalls als **„Mandate"** (Z. 15)
- Die Page zieht alle `faelle` mit `service_typ='komplett'` und rendert sie als `shared/DataTable`

URL und Page-Titel waren inkonsistent — der Audit hat das aufgedeckt.

## Fix — Rename statt Neubau

Bestehende View wird wiederverwendet. Route-Verzeichnis umbenannt:

```
src/app/kanzlei/dashboard/ → src/app/kanzlei/mandate/
```

## Geänderte Konsumenten

| Datei | Änderung |
|---|---|
| `src/app/kanzlei/_components/KanzleiNav.tsx` | NavLink `href` → `/kanzlei/mandate` |
| `src/app/kanzlei/layout.tsx` | TasksPill `href` → `/kanzlei/mandate` |
| `src/lib/auth/role-redirect.ts` | Kanzlei-Login-Target → `/kanzlei/mandate` |
| `next.config.ts` | `/kanzlei` → `/kanzlei/mandate` (Z. 202, war `/dashboard`) |
| `next.config.ts` | Neuer Redirect `/kanzlei/dashboard` → `/kanzlei/mandate` (Bookmarks) |

`src/app/api/auth/callback/route.ts:6` enthält nur einen Kommentar mit „dashboard"-Referenz — historisch, kein Code-Pfad. Lasse ich unberührt, sonst rauscht der Kommentar nur durch git-blame.

## Was bleibt unberührt

- `/kanzlei/kanban` — bleibt als alternative Pipeline-Kanban-View bestehen (NavLink „Pipeline"), greift dieselben Daten
- `/kanzlei/termin` — bleibt unberührt
- `/kanzlei/abrechnung/[token]` — bleibt unberührt (Magic-Link-Route)

## Verifikation (post-merge auf Staging)

```bash
STAGING_BASIC_PASS='…' AUDIT_OUT='docs/15.05.2026/mobile-hygiene-post-final' \
  node scripts/mobile-hygiene-audit.mjs
```

Erwartete `audit-summary.json`:

```json
{ "totalIssues": 0, "issues": [] }
```

Mobile-Hygiene-Loop sauber bei 0 Issues geschlossen.

## Bookmark-Sicherheit

Alte URLs `/kanzlei/dashboard` und `/kanzlei` leiten beide via HTTP-308 auf `/kanzlei/mandate` weiter — Email-Links und Browser-Bookmarks von LexDrive-Partnern bleiben funktional.
