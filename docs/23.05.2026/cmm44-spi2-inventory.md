# CMM-44 SP-I2 — Reader/Writer-Sweep Inventory

**Datum:** 23.05.2026  
**PR:** cmm44-spi2-pr2-sweep  
**Scope:** 11 Spalten auf kanzlei_faelle (1:1 per Claim) migriert (code-only, kein DROP in PR2)

## Grep-Inventur

Initial (20 Hits):

```
TOTAL HITS: 20  (nach PR1 Start)
TOTAL HITS: 17  (nach PR2 Writer/Reader-Sweep)
```

## Hit-Analyse PR2-Rest (17 verbleibend)

Alle 17 verbleibenden Hits sind akzeptiert:

| File | Art | Begruendung |
|------|-----|-------------|
| admin/faelle/(hub)/page.tsx:108 | Phase-6-Lese | mandatsnummer aus faelle (Spalte existiert noch) — sekundaer-Display |
| api/admin/create-test-fall/route.ts:26,121 | Phase-6-Lese | Test-Sentinel mandatsnummer auf faelle |
| api/search/route.ts:22,55 | Phase-6-Filter | ilike auf faelle.mandatsnummer (Spalte existiert); label-Prio ist fix |
| api/seed-testdata/route.ts:497 | False-Positive | Treffer in COMMENT; INSERT enthaelt anschlussschreiben_am nicht mehr |
| faelle/[id]/_actions/dokumente.ts:305,308 | Korrekt gepatcht | claim_id-Read + upsertKanzleiFall-Call — kein faelle-Write mehr |
| faelle/[id]/_actions/kanzlei-paket.ts:177 | False-Positive | Treffer in COMMENT (KFZ-202-Kommentar); actual update = vs_eskalationsstufe |
| kanzlei/kanban/page.tsx:61 | Phase-6-Lese | mandatsnummer sekundaer-Display (claim_nummer ist primaer) |
| kanzlei/mandate/page.tsx:36 | Phase-6-Lese | mandatsnummer sekundaer-Display (claim_nummer ist primaer) |
| lib/faelle/state-machine.ts:61 | False-Positive | update.anschlussschreiben_am wird peelKanzleiFaelleColumns gefangen |
| lib/kanzlei/push-mandat.ts:82 | Phase-6-Lese | mandatsnummer-Read vor Idempotency (Spalte existiert noch) |
| lib/kanzlei-wunsch/actions.ts:171 | Phase-6-Lese | !fallRow.mandatsnummer Idempotency-Guard (Spalte existiert noch) |
| lib/lexdrive/process-event.ts:764 | False-Positive | Treffer in COMMENT; ovFaelle enthaelt keine SP-I2 Spalten |
| lib/sla/blocker-detection.ts:40 | Korrekt gepatcht | claims:claim_id(kanzlei_faelle(anschlussschreiben_am)) Embed |
| lib/sla/completion-signals.ts:31 | Korrekt gepatcht | claims:claim_id(kanzlei_faelle(anschlussschreiben_am)) Embed |

## Aenderungen PR2

### Neue Dateien
- `scripts/cmm44-spi2-grep.mjs` — paren-balanced Re-Grep-Script
- `src/lib/kanzlei-fall/upsert-kanzlei-fall.ts` — Helper: KANZLEI_FAELLE_COLS, peelKanzleiFaelleColumns, upsertKanzleiFall

### Gepatche Writer (Pattern C)
- `src/lib/faelle/state-machine.ts` — SP-I2-Peel vor SP-H-Peel, kfUpdate via upsertKanzleiFall
- `src/lib/lexdrive/process-event.ts` — SP-I2-Peel vor SP-H-Peel, kfUpdate via upsertKanzleiFall
- `src/lib/kanzlei/push-mandat.ts` — mandatsnummer via upsertKanzleiFall, not faelle.update
- `src/app/faelle/[id]/_actions/dokumente.ts` — anschlussschreiben_url/ocr via upsertKanzleiFall
- `src/app/faelle/[id]/_actions/filmcheck.ts` — CLM-YYYY-Generator entfernt (mandatsnummer-Write entfernt)
- `src/app/api/seed-testdata/route.ts` — anschlussschreiben_am aus claimlosem faelle-INSERT entfernt

### Gepatchte Reader (Pattern A/B)
- `src/lib/sla/completion-signals.ts` — kanzlei_as_versand via Embed kanzlei_faelle(anschlussschreiben_am)
- `src/lib/sla/blocker-detection.ts` — embed kanzlei_faelle(anschlussschreiben_am) in claims-Embed
- `src/lib/claims/get-kunde-faelle.ts` — 6. Promise.all-Slot: kanzlei_faelle.anschlussschreiben_am

### Label-Sites (Pattern L)
- `src/app/api/search/route.ts` — claim_nummer primaer, mandatsnummer in sub
- `src/app/admin/faelle/(hub)/FaelleKanban.tsx` — claim_nummer primaer, mandatsnummer sekundaer-Badge

### Lean-Display (Task 5)
- `src/components/kunde/FallStatusCard.tsx` — WA-Hinweis wenn anschlussschreiben und kein AS-Datum
- `src/app/gutachter/fall/[id]/page.tsx` — mandatsnummer-Block fuer SV via faelle_sv_view

## Verifizierung
- `npx tsc --noEmit` — 0 Errors
- `npm run build` — Compilation OK (`Compiled successfully in 48s`); TS-Check-Worker OOM = bekannte Env-Limitation
- `node scripts/cmm44-spi2-grep.mjs` — 17 Hits, alle akzeptiert (False-Positives oder Phase-6-Drops)
