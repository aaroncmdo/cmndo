# CMM-44 MP-7 — Manual Phase Mode (claim-level Override) — Design

> Status: **Design** (brainstormt mit Aaron 2026-05-28). Implementierung = MP-7 (Zukunft, nach MP-6/claims.phase-Drop). Ersetzt den alten, kaputten per-Wert-`ManualPhaseOverride` (der tote No-op-Stub wird in MP-6a entfernt — siehe MP-6-Plan §5.1).

## Problem
Die Phase ist **abgeleitet** (`getClaimLifecycle` / `v_claim_phase`, D1: nie gespeichert). Der alte `ManualPhaseOverride` schrieb einen Wert direkt in `claims.phase` → seit SP-A2 (`claims_phase_check`) defekt, heute deaktivierter No-op. Gebraucht wird ein **derived-kompatibler** manueller Eingriff: ein Sicherheitsventil, wenn die Auto-Ableitung danebenliegt (Aaron: „control when something goes wrong").

## Kernidee — „switch the case to manual"
Pro Claim ein **AUTO ⇄ MANUAL**-Schalter, getragen von **einem nullable Override-Feld** (kein separates Mode-Flag → kann nicht desyncen → sauberer Switch-back by construction).

- **Feld:** `claims.phase_override` — nullable `ClaimSubPhase`. `NULL` = AUTO (ableiten); gesetzt = MANUAL (Resolver nutzt es; Hauptphase folgt via `mainPhaseOf(sub)`).
- **Resolver:** `getClaimLifecycle` / `v_claim_phase` → `override ?? derive` (CASE/COALESCE auf das Override-Feld).
- **Granularität:** ganzer Lifecycle (main + sub) auf den gesetzten Substate eingefroren, bis ein Mensch zurückschaltet.

## Grenzen (kritisch)
- **Nur Phasen-Anzeige-Layer.** Override fasst `claims.status` / Abschluss / Billing / Sub-Entity-States **nicht** an (die folgen den echten Daten, B-11). „Abschluss/storniert" zu pinnen **schließt den Fall NICHT**.
- **Datenerfassung läuft weiter** im Manual-Modus (Dokumente, Sub-Entity-Status werden weiter befüllt) → der echte State bleibt aktuell. **Deshalb** funktioniert „start from there" beim Zurückschalten.
- **Phase-getriebene Automations pausieren** während Manual (gegated auf „Override gesetzt?"): z. B. `pflichtdokumente-reminder` (phase-keyed) + andere phase-keyed Crons/Sends. Ihre **interne Daten-Logik bleibt erhalten** (z. B. „sind die Dokumente da?") — nur das phase-getriebene **Feuern** pausiert. (Automations sind `phase × Daten`; wir pausieren den Phasen-Teil, nicht die Daten.)

## Switch-back auf AUTO
- Override auf `NULL` setzen → Resolver leitet aus dem **aktuellen** State ab („start from there"); kein stale Carryover.
- **UX:** „Zurück auf automatisch" zeigt zuerst eine **Vorschau** der dann abgeleiteten Phase (z. B. „Auto leitet ab: Begutachtung · Gutachten"), damit der Sprung nicht überrascht; auf Bestätigung → null + Audit + **MANUELL**-Badge weg + Automations laufen wieder.
- **Nie Auto-Clear** — der Mensch besitzt den Toggle (Ventil hält).

## Mismatch-Signal (Aaron: „notification for the exact value that derives mistakes")
Jeder manuelle Override ist **Evidenz für einen Ableitungs-Bug.** Beim Setzen erfassen + benachrichtigen:
`{ auto_derived (= der falsche Wert), manual_value, begruendung, wer, wann }` → ein **Derivation-Mismatch-Trail**. Ziel: den Resolver fixen, damit Manual über die Zeit **immer seltener** nötig ist.
+ **Drift-Reminder** während gepinnt: „seit X manuell; Auto würde jetzt Z ableiten — noch nötig?" (fängt den stale Pin ab).

## Sichtbarkeit / Audit
- **MANUELL**-Badge überall wo die Phase erscheint (Aaron: „show there is another phase").
- Admin-gesetzt mit **Pflicht-Begründung**; Audit auf Set **und** Clear.

## Offen für den MP-7-Plan (bei Umsetzung klären)
- Wer darf togglen — nur `admin`, oder auch `kb`? (Default: admin.)
- Exakte Liste der phase-getriebenen Automations zum Gaten (Inventur bei MP-7-Bau; Start: `pflichtdokumente-reminder` + phase-keyed SLA/WhatsApp-Sends).
- Migration `claims.phase_override` + Resolver-/`v_claim_phase`-Änderung **via Supabase-Plugin** (Regel 2 / PR #1896).
- Ersetzt zugleich den in MP-4c entfernten Admin-Kanban-Status-Drag als manuellen Admin-Hebel (Handoff §3 MP-7).

## Bezug zu MP-6
MP-6a entfernt den toten No-op-Stub (`manual-phase-override.ts` + Modal + Trigger). **Dieser Spec = der Neubau in MP-7** (nach `claims.phase`-Drop). MP-6 räumt auf; MP-7 baut derived-kompatibel neu. MP-6c ist **nicht** auf MP-7 gegated (der No-op blockiert den Drop nicht).
