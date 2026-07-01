# OCR-Konsolidierung (Filmcheck #7 Phase 2) — Audit + Decision + Plan

**Datum:** 2026-06-29
**Herkunft:** Filmcheck-Audit Tier-3. Aaron: „das OCR unbedingt sauber nachziehen." Voraussetzung für die OCR-gestützte QC-Review (Phase 3).

## Audit — was wirklich da ist

Zwei „OCR-Systeme" auf der `gutachten`-Tabelle, beide in Prod **0-genutzt** (3 Gutachten, 0 OCR je gelaufen):

| | **ALT** (funktional) | **NEU AAR-838** (Skeleton) |
|---|---|---|
| Pipeline | `src/lib/ai/gutachten-ocr.ts` (In-App Anthropic SDK) | Edge Function `supabase/functions/gutachten-ocr/index.ts` |
| Status | **funktioniert** (extrahiert Werte) | **SKELETON** — setzt immer `ocr_status='failed'` / `engine_not_implemented`; echte Engine = AAR-846, **nie gebaut** |
| Entry | `extractGutachtenAndSaveToClaim` (via `_actions/gutachten-ocr.ts`) | `uploadGutachtenPdf` → `functions.invoke('gutachten-ocr')` |
| Trigger | „nach QC-Freigabe" (post-freigabe) | `auto_after_upload` (beim Upload) |
| Felder | **flach**: reparaturkosten_netto, minderwert, restwert, WBW, fin, … (+ 5 Cluster) | **strukturiert**: `ocr_runs`, `gutachten_positionen`, `bericht_pdf_url`, `gesamt_schadensbetrag`, `felder_quelle_jsonb` |
| Consumer | **finance** (`fall-finanzen.ts`), **makler** (`copilot-prompt.ts`), `GutachtenOcrCard`, `_actions` | (keine echten — Skeleton liefert nie Daten) |

**Root-Cause der Verwirrung:** AAR-838 war ein geplanter Rebuild (Edge-Function, run-versioniert, strukturierte Positionen), der bei AAR-846 (der echten Engine) **stehenblieb**. Zurück blieben zwei Halb-Systeme + eine Karte (`GutachtenOcrCard`) mit dem stalen „läuft nach Freigabe"-Text.

## Decision

**Kanonisch = die ALTE, funktionierende Pipeline** (`lib/ai/gutachten-ocr.ts`). Nicht auf einen Stub migrieren. (Kippt die Brainstorm-Annahme „AAR-838 kanonisch" — der Audit hat's korrigiert.)

- **AAR-838-Skeleton retiren/parken:** `uploadGutachtenPdf` triggert eine **immer fehlschlagende** OCR → latenter Bug vor Launch (SV lädt hoch, OCR „failed"). Den Skeleton-Trigger neutralisieren (oder die ganze AAR-838-Action retiren, falls `uploadGutachtenPdf` kein echter SV-Upload-Pfad ist — in Phase 2a verifizieren). Die `ocr_runs`/`gutachten_positionen`-Tabellen + Edge-Function bleiben als Runway für ein späteres, ECHTES AAR-846 (separater Scope) — aber unverdrahtet.
- **Trigger der alten Pipeline vorziehen:** von post-freigabe → **Gutachten-Abgabe** (`gutachtenAbgeben`). Dann liegt OCR VOR der QC → ermöglicht Phase 3 (OCR-Werte in der QC-Karte + `schadenspositionen_erfasst` ableiten). Idempotent + Re-Run bei Nachbesserung; nicht pro File-Upload (Kosten).
- **Consumer bleiben** auf den flachen Feldern — **keine Migration** nötig (Kanon = alt). Das ist der große Vorteil der Decision: minimaler Blast-Radius.

## Plan (Phasen)

- **2a — Verifizieren (read-only):** Wo genau triggert die alte Pipeline heute (`extractGutachtenAndSaveToClaim`-Caller)? Ist `uploadGutachtenPdf` (AAR-838) ein echt-verdrahteter SV-Upload-Pfad oder nur referenziert? Doppel-Trigger-Risiko?
- **2b — Skeleton neutralisieren:** AAR-838-Trigger (`uploadGutachtenPdf` → Edge-Function-invoke) stoppen/retiren, damit kein SV-Upload in eine failende OCR läuft. `GutachtenOcrCard`-Text korrigieren („nach Freigabe" → tatsächlicher Trigger).
- **2c — Trigger vorziehen:** alte OCR-Pipeline an `gutachtenAbgeben` hängen (idempotent, Re-Run bei Nachbesserung), post-freigabe-Trigger entfernen. → „OCR vorziehen" mit der WORKING Pipeline.
- **2d (separat/optional):** AAR-846 echt implementieren (Edge-Function-OCR + strukturierte Positionen) + Consumer migrieren — nur wenn die strukturierte Variante wirklich gewünscht ist. Nicht Teil dieser Strecke.

## Error-Handling / Risiko
- Beide Systeme 0-genutzt → **kein Live-Daten-Risiko**, kein Customer-Impact (pre-launch). Konsolidierung ist risikoarm.
- Trigger-Move: idempotent halten (OCR nur einmal pro finalem Gutachten; Re-Run bei Nachbesserung), sonst Anthropic-Kosten pro Re-Upload.
- Consumer (finance/makler) unverändert → keine Regression dort.

## Scope-Grenze
2a–2c = die Konsolidierung (diese Strecke). 2d (echtes AAR-846) = eigener Scope, nur bei Bedarf. Phase 3 (OCR-Werte in QC-Karte) hängt an 2c.
