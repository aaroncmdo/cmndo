# `@/lib/format` Adoption — Phased Plan (2026-07-13)

Aus dem Go-Live-Sweep-Redundanz-Fund. Kanonische Formatter-Libs existieren, werden aber ignoriert:
Namens-Auflösung `[vorname,nachname].join(' ')` in ~115–130 Files, EUR inline in ~66 Files,
Datum inline in ~145 Files, E.164-Telefon in 9 Blöcken. Zusätzlich 4 parallele „Nutzer
benachrichtigen"-Pfade (`notifications.ts`, `mitteilungen.ts`, `create-mitteilung.ts`, `emit.ts`).

**Timing-Entscheidung:** Das Voll-Programm (Phasen 1–4) ist **DEFERRED bis nach dem
Go-Live-Merge-Storm**. Ein cross-cutting Sweep über ~275 Files während 13 paralleler Sessions =
maximaler Konflikt-Blast-Radius bei null Go-Live-Wert. Nur **Phase 0** (kollisionsfrei, nur
`src/lib/format/**`) läuft jetzt.

## Zwei-Lib-Zuständigkeit (verbindlich)
- **`@/lib/format`** — INTERNE Portale (Admin/Dispatch/SV/Werkstatt/Kanzlei). Beträge in **Cent**
  (`formatEUR`), de-DE OHNE Locale-Parameter. Cent-vs-Euro-Bug-Klasse-Guard.
- **`@/lib/i18n/format`** — KUNDEN-gerichtete, mehrsprachige Oberflächen (Kunde-Portal,
  Magic-Links, kundengerichtete Emails). **Euro** + `Locale`-Parameter.
- Vor jeder EUR/Datum-Massen-Migration: pro Site entscheiden, welche Lib zuständig ist.

## Phase 0 — JETZT (dieser PR, kollisionsfrei, nur `src/lib/format/**`)
- `index.ts` barrelt jetzt `./anrede` → `formatNameKurz` ist via `@/lib/format` erreichbar
  (vorher 0 Consumer, weil ungebarrelt = unauffindbar).
- `datum.ts` neuer Style `formatDatum(iso, 'numerisch')` → `17.04.2026` (4-stelliges Jahr ohne
  Zeit) — der fehlende Drop-in für die ~145 Inline-`{day,month,year:'numeric'}`-Sites.
- Zwei-Lib-Zuständigkeit im `index.ts`-Header dokumentiert.

## Phase 1 — Datum-Slice (kalte Files, eine Kategorie) — nach Go-Live
`formatDatum`/`formatDatumUhrzeit`/`'numerisch'` in kollisionsarmen Files: `app/mitarbeiter/**`,
admin non-finance Pages, kalte `app/gutachter/**` (team/reklamationen/profil/…). ~15–25 Files,
reviewed. Wert: null-safety killt „Invalid Date" + Konsistenz. Vorsicht 2-stelliges Jahr bei `'kurz'`
(→ `'numerisch'` wählen, wo 4-stellig gewünscht).

## Phase 2 — EUR-Konvergenz (höchster Wert, höchstes Risiko) — nach Go-Live
`formatEUR` (Cent) / `formatEURausEuro` (Euro-NUMERIC-Spalten) / `formatCurrency` (i18n). Braucht
**pro-Site Cent-vs-Euro-vs-Locale-Audit**. Lebt in heißen finance/makler-Files. Eigenes Ticket +
`check:format`-Ratchet (Baseline + Boy-Scout, analog knip/component-set/token-audit).

## Phase 3 — Name + Phone Sweeps — nach Go-Live
`${v} ${n}` → `formatNameKurz(null, v, n)` (Boy-Scout, ~115–130 Sites). 9 Phone-Blöcke → `toE164`.
Mechanisch nach Phase 0, aber viele Sites in heißen Lanes → nach dem Storm.

## Phase 4 — Notify-Konvergenz — nach Go-Live
`emitEvent` als einziger Entry-Point (Event → channel-matrix Fan-out, honoriert preferences); der
In-App-Channel schreibt via `createMitteilung`. `createNotification`/`benachrichtigungen` +
`gutachter_mitteilungen` retiren, ~10 Direkt-Inserts killen. Architektonisch → Design-Doc, kein
Find-Replace.

## ⚠️ Regression-Warnung für die Merge/Deploy-Lane
Der aar-956-Branch hat `src/lib/format/telefon.ts` verändert: `toE164` **privatisiert** +
`telefon.test.ts` **gelöscht**. Auf `staging`/`main` ist `toE164` **public + getestet** (korrekt).
Beim aar-956-Merge NICHT re-privatisieren — Phase 3 braucht `toE164` als öffentlichen Kanon.
