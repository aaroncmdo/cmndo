# Werkstatt-Admin Kunden-QR-Download — Design

**Datum:** 2026-06-26
**Branch:** `kitta/werkstatt-admin-qr-download` (base `staging`)
**Status:** Design approved (Aaron, 2026-06-26)

## Ziel

In der Admin-Werkstattverwaltung (`/admin/werkstaetten`) soll das Team pro Werkstatt den **regulären Kunden-QR-Code** (`/start/werkstatt/[werkstattId]`) ansehen, den Einstiegs-Link kopieren und den QR als **PNG/SVG** herunterladen — um ihn für eine Werkstatt auszugeben / zu drucken.

Es geht **nicht** um den KVA-QR (per-Lead-FlowLink aus dem Werkstatt-KVA-Flow), sondern um den regulären, statischen Werkstatt-QR.

## Kontext / Ist-Stand

- Der **identische QR-Download existiert bereits im Werkstatt-Portal selbst**: `/werkstatt/promo` (Nav-Label „QR-Code") via `WerkstattPromo.tsx` — PNG/SVG-Download, Link kopieren, Aushänge-Hinweis. Die Lücke betrifft **nur die Admin-Seite**.
- Wiederverwendbare Bausteine:
  - `werkstattStartUrl(werkstattId)` → `${NEXT_PUBLIC_APP_URL}/start/werkstatt/${id}` (`src/lib/start-link/werkstatt-start-url.ts`)
  - `generateQrCodeSvg(url, size)` → inline-SVG-String (`src/lib/kanzlei/qr-code.ts`)
  - On-Demand-QR-Server-Action-Muster: `src/app/werkstatt/(shell)/kva/qr-action.ts` (`{ ok, svg, url }`-Result)
  - Admin-Guard: lokales `requireAdmin()` in `admin/werkstaetten/actions.ts` (Result-Pattern, returnt `{ id } | null`)
  - UI-Primitive: `Modal`, `Button` (`@/components/primitives`); `DataTable`-Set; die Seite nutzt bereits ein `Modal` für „Neue Werkstatt".

## Architektur

On-Demand-Generierung + Modal + geteilte Download-Komponente.

### 1. Server-Action `werkstattQrSvg(werkstattId)`
`src/app/admin/werkstaetten/qr-action.ts` (`'use server'`):
- admin-gated über lokales `requireAdmin()` (spiegelt `createWerkstatt` im Nachbar-File),
- validiert `werkstattId` (nicht leer) + defensiver Existenz-/Name-Lookup via `werkstaetten`-SELECT (liefert zugleich den Namen für den Dateinamen),
- `const url = werkstattStartUrl(werkstattId)`, `const svg = await generateQrCodeSvg(url, 300)`,
- Rückgabe `{ ok: true; svg: string; url: string; name: string } | { ok: false; error: string }`.
- **Begründung On-Demand:** Admin listet N Werkstätten — N QRs bei jedem Seitenaufruf vorzugenerieren wäre verschwenderisch und skaliert schlecht. Der QR wird nur erzeugt, wenn das Team in einer Zeile auf „QR" klickt (spiegelt `kva/qr-action.ts`).

### 2. Geteilte Komponente `QrCodeDownloadButtons`
`src/components/shared/QrCodeDownloadButtons.tsx` (Client):
- Props `{ qrSvg: string; fileBaseName: string; pngSize?: number }`,
- kapselt `triggerDownload` + `downloadSvg` + `downloadPng` (Canvas SVG→PNG, default 600px), rendert die zwei `Button`s („PNG" navy / „SVG" ghost mit `DownloadIcon`),
- 1:1 aus `WerkstattPromo` extrahiert (Verhalten unverändert).

### 3. Admin-UI (`WerkstaettenClient.tsx`)
- neue, rechtsbündige Tabellen-Spalte „QR" mit `Button size="sm" variant="ghost" iconLeft={QrCodeIcon}` pro Zeile,
- Klick → ruft `werkstattQrSvg(w.id)`, setzt State, öffnet ein `Modal` mit:
  - gerendertem QR (`dangerouslySetInnerHTML={{ __html: svg }}`),
  - Einstiegs-Link (read-only `input` + „Kopieren"-Button, wie im Portal),
  - `<QrCodeDownloadButtons qrSvg fileBaseName />` (fileBaseName aus Werkstatt-Name, slugifiziert, Fallback id),
- Lade-/Fehlerzustand: während der Action Spinner/disabled; bei `!ok` `toast.error(result.error)`.

### 4. Refactor `WerkstattPromo.tsx`
Ersetzt die inline PNG/SVG-Buttons + die Funktionen `triggerDownload`/`downloadSvg`/`downloadPng` durch `<QrCodeDownloadButtons qrSvg={qrSvg} fileBaseName="claimondo-werkstatt-qr" />`. URL-Anzeige/Kopieren + QR-Render bleiben unverändert.

## Datenfluss

Admin klickt „QR" (Zeile `w`) → `werkstattQrSvg(w.id)` (Server, admin-gated) → `{ svg, url, name }` → Modal rendert QR + Link → `QrCodeDownloadButtons` erzeugt Blob (SVG direkt / PNG via Canvas) → Browser-Download.

## Fehlerbehandlung

- Server-Action: Result-Object (`{ ok: false, error }`), kein `throw`. Nicht-Admin → `{ ok: false, error }`. Leere/unbekannte id → `{ ok: false, error }`.
- Client: `toast.error(result.error)` bei `!ok`; Button während Laden disabled.
- PNG-Canvas ohne `ctx`: still no-op (wie im Bestand).

## Tests

`src/app/admin/werkstaetten/__tests__/qr-action.test.ts` (vitest, fokussiert, spiegelt das `actions.test.ts`-Mock-Setup):
- (a) Nicht-Admin → `{ ok: false }` (kein SVG erzeugt),
- (b) Admin + gültige id → `{ ok: true }` mit `svg` (enthält `"<svg"`) + erwarteter `url` (`…/start/werkstatt/<id>`).

## Out of Scope

- KVA-QR (separat, existiert bereits).
- Printable-Poster-Layout (nur roher QR + Download, identisch zum Portal).
- Änderungen am Kunden-Einstieg `/start/werkstatt/[werkstattId]`.
- DB-Änderung / Migration (keine).

## Constraints

- UI-Strings Deutsch mit echten Umlauten (ä/ö/ü/ß).
- Component-Set: `Button`/`Modal` aus `primitives`, `DataTable`-Set aus `shared`; keine raw-hex / raw Status-/Accent-Scales (token-audit-Ratchets).
- Kein `type`/`const`-Export aus `'use server'`-File (AAR-664) → `qr-action.ts` exportiert ausschließlich die async Server-Action.
- 7-Punkte-Audit vor Commit. Base `staging`, PR gegen `staging`.
