# /dispatch/kalender React #418 — Hydration-Fix

**Datum:** 2026-05-15
**Branch:** `kitta/aar-dispatch-kalender-hydration`
**Vorläufer:** PR #1281 (`/dispatch` 404-Redirect)
**Loop:** Mobile-Hygiene Iteration 3

## Befund

Mobile-Hygiene-Audit gegen Staging (am 15.05.2026, nach #1281-Merge) bestätigte:

```json
{
  "scope": "dispatch",
  "url": "https://app.staging.claimondo.de/dispatch/kalender",
  "type": "pageerror",
  "msg": "Minified React error #418"
}
```

React-Error #418 = „text content does not match server-rendered HTML".

Screenshot `docs/15.05.2026/mobile-hygiene-post-1281/dispatch/04-kalender-mobile.png` zeigt: Page rendert (Hydration-Recovery), ein Termin-Block ist auf FR 15.05 sichtbar mit „CLM-2…"-Text — also keinen kompletten Crash, aber `window.onerror` fängt den Mismatch.

## Ursache

`KalenderClient.tsx:60-62` (vor Fix):

```ts
function formatHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
```

`d.getHours()` und `d.getMinutes()` lesen die **Process-Timezone**:
- VPS-Node läuft in UTC → rendert „12:00"
- Browser läuft in Europe/Berlin → rendert „14:00" (Sommerzeit UTC+2)

Server-Pre-Render und Client-Hydrate produzieren unterschiedlichen Text → React #418.

`block.timeLabel` (= `formatHHMM(start)–formatHHMM(end)`) wird in Z. 408 ohne `suppressHydrationWarning` gerendert. Die anderen Datum-Elemente (Z. 200, 313, 320) hatten den Suppress-Marker schon (PR #1036 + Commit `552efce9`), aber Termin-Block-Labels waren übersehen worden.

## Fix

```ts
function formatHHMM(d: Date): string {
  return d.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  })
}
```

`Intl.DateTimeFormat` mit explicit `timeZone: 'Europe/Berlin'` ist **deterministisch über alle Host-Prozesse** — die Intl-API liest die TZ-Datenbank und konvertiert konsistent. Server und Client produzieren identischen Text → kein Hydration-Mismatch.

Pattern ist identisch zu `src/lib/format/datum.ts:formatUhrzeit` (AAR-411).

## Was nicht geändert wurde

Die bestehenden `suppressHydrationWarning`-Marker auf Z. 200, 313, 320 bleiben. Sie hängen an Datum-Strings mit `toLocaleDateString` **ohne** `timeZone`-Override — Defense-in-Depth bis dort die gleiche Berlin-TZ-Korrektur durchgezogen wird. Ist als Follow-up gestapelt (würde diesen PR zu invasiv machen).

## Verifikation (post-merge auf Staging)

```bash
STAGING_BASIC_PASS='…' AUDIT_OUT='docs/15.05.2026/mobile-hygiene-post-kalender' \
  node scripts/mobile-hygiene-audit.mjs
```

Erwartete `audit-summary.json`:

```json
{ "totalIssues": 1, "issues": [{ "scope": "kanzlei", "route": "/kanzlei/mandate", "status": 404 }] }
```

Also: Issue-Count sinkt von 2 auf 1 — nur noch `/kanzlei/mandate` als verbleibender Befund.
