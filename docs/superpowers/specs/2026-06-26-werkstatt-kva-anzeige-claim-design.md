# Werkstatt-KVA Follow-up: Betrag-Anzeige + Claim-Carry (A + B)

- **Datum:** 2026-06-26
- **Branch:** `kitta/werkstatt-kva-display` (Worktree, Basis `staging`)
- **Status:** Design genehmigt (Aaron) — Follow-up zu PR #3168
- **Voraussetzung:** `leads.kostenvoranschlag_netto/brutto` + `gutachter_finder_anfragen.kostenvoranschlag_*` existieren bereits (Migration `20260625222737`, prod-live; geteilte DB).

## Problem / Ziel

PR #3168 **erfasst** den Werkstatt-Kostenvoranschlag-Betrag (`leads.kostenvoranschlag_*`), aber er ist **nirgends in der UI sichtbar** und **fließt nicht in den Claim**. Dieses Follow-up schließt beides:
- **A** — Betrag anzeigen (Dispatch-Lead-View + Fallakte), klar getrennt vom SV-Wert.
- **B** — Betrag bei Lead→Claim-Konvertierung auf den Claim snapshotten.

## Scope / Nicht-Ziele

**In Scope:** A (Anzeige) + B (claims-Snapshot-Spalte + Carry im Convert).
**Nicht-Ziele:** Keine `repairs`-Schreibung (beim Convert wird **keine** repairs-Zeile angelegt — verifiziert: 0 `repairs`-Inserts im `src`-Baum; repairs sind post-Gutachten). **Nie** `claims.schadens_hoehe_netto` / `gutachten.*` anfassen (SV-Werte, eigene Spur). Kein Edit-Feld (Betrag ist read-only Referenz).

## B — Daten (claims-Snapshot)

- **Migration (Plugin):** `claims.kostenvoranschlag_netto/brutto` (numeric, nullable) — Snapshot der Werkstatt-Schätzung, claim-nativ (CMM-49-SSoT-konform). Kommentar dokumentiert die Trennung vom SV-Wert.
- **`convertLeadToClaim`** (`src/lib/leads/convert-lead-to-claim.ts`): reicht `lead.kostenvoranschlag_netto/brutto` → `claims.kostenvoranschlag_netto/brutto` durch — **additiv**, exakt analog zum bestehenden `werkstatt_id`/`werkstatt_seit_datum`-Carry (Record-Cast, da generierte Types die frische Spalte noch nicht kennen, AGENTS §6).
- **Invariante:** Der Wert geht ausschließlich in `claims.kostenvoranschlag_*`, **nie** in `claims.schadens_hoehe_netto` oder `gutachten.*`.

## A — Anzeige (read-only, vom SV-Wert getrennt)

- **Dispatch-Lead-View** (`src/app/dispatch/leads/[id]/…`): eine **read-only** Zeile/Pill „Kostenvoranschlag (Werkstatt): € X — Schätzung", **nur** wenn `leads.kostenvoranschlag_brutto` (oder netto) gesetzt ist (= Werkstatt-KVA-Lead). Liest `leads.kostenvoranschlag_*` (bereits live). Kein editierbares Config-Feld — es ist ein erfasster Referenzwert.
- **Fallakte** (`src/app/faelle/[id]/_stammdaten/`): eine **eigene** `WerkstattKvaSection` neben (nicht in) der `KernwerteSection`, Label „Kostenvoranschlag Werkstatt (Schätzung, vor SV-Gutachten)". Liest `claims.kostenvoranschlag_*` (aus B). Nur sichtbar wenn gesetzt. Die KernwerteSection (SV-/Gutachten-Werte) bleibt unberührt → semantische Trennung sofort sichtbar.
- **Formatierung:** `€`-Betrag de-DE (z.B. `3.862,35 €`); Brutto primär, Netto wenn vorhanden als Sekundär.

## Fehlerbehandlung / Konsistenz

- B-Carry rein additiv; kein bestehender Convert-Pfad geändert. ok-Shape unverändert.
- A: read-only Display, kein Write, keine Action. Conditional-Render (null → nichts).
- Komponenten aus `primitives`/`shared`; echte Umlaute; Claimondo-Tokens (kein raw Hex/Status/Accent; `rounded-ios-*`).

## Tests

- vitest: falls es einen PURE Lead→Claim-Mapper gibt (z.B. `buildClaimInsertFromLead`), dort die kostenvoranschlag-Felder im Snapshot asserten; sonst tsc + Build.
- `tsc --noEmit` + voller `npm run build` (Routen/Server-Pfade) + Ratchets (token-audit/component-set/termin-contract).
- Manuell nach Deploy: Werkstatt-KVA-Lead → Betrag im Dispatch-Lead sichtbar; nach Konvertierung `claims.kostenvoranschlag_*` gesetzt + in der Fallakte als „Werkstatt-KVA" sichtbar, getrennt vom Gutachten-Wert.

## Rollout

- Branch `kitta/werkstatt-kva-display` → eigener PR gegen `staging` (zweiter PR, unabhängig von #3168). Migration additiv via Plugin. ⚠ `convert-lead-to-claim.ts` ist CMM-49-Hotzone → additive 2-Zeilen, trivialer Merge, aber bei Kollision koordinieren.
