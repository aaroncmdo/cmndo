# 🐞 BUG: Wunschtermin geht bei Anfrage→Lead-Konvertierung verloren

**Entdeckt:** 2026-05-15 im Vollstrecke-Smoke.
**Severity:** Medium-High — Datenverlust für Dispatch.

## Symptom

Kunde gibt im `/gutachter-finden`-Wizard einen Wunschtermin an. Submit
schreibt korrekt in `gutachter_finder_anfragen.wunschtermin` (z. B.
`2026-05-14T09:00:00+00:00`). Der nachgelagerte Convert-Step erzeugt
`leads`-Row mit `status='quali-offen'`, aber `leads.wunschtermin = NULL`.

Dispatch sieht in der Lead-Liste keinen Wunschtermin → muss Kunde
erneut anrufen.

## Reproduktion (Smoke-Daten)

```sql
-- Anfrage (Quelle)
SELECT wunschtermin, wunschtermin_wann
FROM gutachter_finder_anfragen
WHERE id = '34f02e36-f959-44bf-a5b2-f0d4c81f4d68';
-- → 2026-05-14T09:00:00+00:00 / 'tage'

-- Konvertierter Lead (Ziel)
SELECT wunschtermin, wunschtermin_wochentage
FROM leads
WHERE id = '8b485e40-3072-4ba9-aea6-12ab4d6a1b80';
-- → NULL / NULL
```

## Root Cause

`src/lib/actions/konvertiere-anfrage-zu-fall.ts:148-194` — der
`leads.insert({...})`-Block enthält viele Anfrage-Felder, aber
**weder `wunschtermin` noch `wunschtermin_wochentage`**. Spalten
existieren in `leads`-Schema (verifiziert via
`information_schema.columns`).

## Fix

In `konvertiere-anfrage-zu-fall.ts` im `.insert({...})`-Block ergänzen:

```ts
wunschtermin: (anfrage.wunschtermin as string | null) ?? null,
// Optional: das 'wann' (sofort/heute/tage) ist im Lead-Schema als
// wunschtermin_wochentage gespeichert — Mapping prüfen.
```

## Linear-Ticket (Vorschlag)

> **Titel:** `[KFZ-AAR-???] Anfrage→Lead-Convert: wunschtermin geht verloren → Dispatch ohne Termin-Kontext`
> **Labels:** bug, backend, data-loss
> **Priorität:** Medium-High (Dispatch-UX-Verlust, jeder konvertierte Lead betroffen)
