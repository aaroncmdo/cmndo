# SV-Honorar-Sicht (S4) — Design

**Datum:** 2026-07-23
**Lane:** b0e963b6 (SV-Claim-Detail-Audit, S4)
**Branch:** `kitta/sv-honorar-sicht`
**Status:** Approach „kleine MeinFallStatusCard-Erweiterung" freigegeben (Aaron 23.07.). Kleiner Change → Plan in diese Spec gefaltet.

## Problem
Der SV sieht sein Honorar in `MeinFallStatusCard` **nur in der `auszahlung`-Phase** (nach Zahlung: „Dein Honorar wurde am Y überwiesen"). Zwischen Gutachten-Freigabe und Auszahlung (Wochen: Kanzlei → VS-Regulierung) sieht er **nichts** zu seinem Honorar-Status. Das entfernte `SvHonorarCard` (AAR-559) hatte ein Pending-Badge; CMM-23 faltete es in `MeinFallStatusCard`, aber nur für die `auszahlung`-Phase → **Pending-Sichtbarkeit verloren**.

## Constraint (in-flux Domain)
`claims.auszahlung_gutachter_betrag`/`_eingegangen_am` (was `MeinFallStatusCard` heute liest) ist ein **Cache, der von der Payment-Ledger-Normalisierung retired wird** (`docs/superpowers/specs/2026-07-07-payment-ledger-normalisierung-design.md` — Grep-Gate „0 Reader ausserhalb des Ledgers"). **Kein neuer Reader dieser Spalte.** Das **verdiente** Honorar `gutachten.gutachten_sv_honorar_brutto` (Soll) ist stabil (nicht retired), schon via `gutachtenWerte` in page.tsx geladen.

## Ziel (CMM-23-konform)
`MeinFallStatusCard` zeigt das SV-Honorar (Betrag + Auszahlungs-Status) **ab `gutachten-freigegeben`** — nicht erst in `auszahlung`. **Kein `SvHonorarCard`-Revival** (CMM-23 „eine Karte = eine Funktion"; MeinFallStatusCard ist der sanktionierte Ersatz).

## Design
- **`MeinFallStatusCard`**: neue Prop `svHonorarVerdient: number | null` (= `gutachten_sv_honorar_brutto`, **stabile** Quelle). Der auszahlung-only-Honorar-Block wird durch einen **breiteren Block** ersetzt: in den Phasen `gutachten-freigegeben`/`bei-kanzlei`/`auszahlung`/`abgeschlossen-fall` zeigt er „**Dein Honorar: {Ist ?? Soll} €**" + Status „**ausstehend — nach Regulierung**" (kein `svHonorarEingegangenAm`) bzw. „**am Y überwiesen**". **Reuse** der bestehenden `svHonorarBetrag`/`svHonorarEingegangenAm`-Props (**kein neuer retiring-Spalten-Reader**) + der stabilen `svHonorarVerdient`. Betrag: bevorzugt der ausgezahlte Ist (`svHonorarBetrag`), sonst der verdiente Soll (`svHonorarVerdient`).
- **`page.tsx`**: `svHonorarVerdient={gutachtenWerte?.gutachten_sv_honorar_brutto ?? null}` an die Card (schon in Scope, :729-737).
- **Kein** DB-/i18n-Change, **kein** `FallDetailClient`-Change.

## Betroffene Files & Koordination
- `src/components/gutachter/MeinFallStatusCard.tsx` (Prop + Block), `src/app/gutachter/fall/[id]/page.tsx` (1 Prop).
- ⚠ `page.tsx` auch von S2 (#4715)/S3 (#4720) + Lane 63fe43f9 angefasst — meine Änderung im `MeinFallStatusCard`-Element (:729-737), disjunkt zu deren Regionen.

## Implementation-Steps (proportional)
1. `MeinFallStatusCard`: Prop `svHonorarVerdient` + Honorar-Block ersetzen. tsc.
2. `page.tsx`: `svHonorarVerdient` an die Card. tsc.
3. Full build (SV-Route). Gates (token-audit/component-set/knip). Commit + PR nach staging.
4. **Regel-4-Prod-Smoke**: SV-Fall in `gutachten-freigegeben`/`bei-kanzlei` → Honorar-Block „ausstehend — nach Regulierung"; ein `auszahlung`-Fall → „am Y überwiesen". Test-Konto `telefon=NULL`. Handoff an Deploy.

## Testing
tsc/build + Regel-4-Prod-Smoke (throwaway-SV). **Kein Unit-Test** — reine Display-Erweiterung, keine neue Pure-Logik.
