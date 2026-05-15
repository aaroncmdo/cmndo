# AAR-920 (A9) claims.status vs claims.phase — Reader-Consistency-Audit

**Datum:** 15.05.2026
**Vorlage:** claims-horizontal-audit.md Abschnitt A9
**Ergebnis:** Bewusste Trennung, **keine Inkonsistenz** — kein Refactor nötig

## Architektur-Trennung (AAR-840 + AAR-854)

Beide Felder existieren gleichzeitig **mit unterschiedlichem Zweck**:

| Feld | Typ | Werte | Zweck |
|---|---|---|---|
| `claims.status` | text-enum, 7 Werte | `dispatch_done`, `in_bearbeitung`, `in_kommunikation_vs`, `reguliert`, `abgelehnt`, `an_externe_kanzlei_uebergeben`, `storniert` | **End-State** — finale Status-Setzung + Endzustand-Logik |
| `claims.phase` | text-enum, 11 Werte | `0_lead`, `1_neu`, `2_in_bearbeitung`, `3_gutachter_unterwegs`, `4_gutachten_fertig`, `5_in_reparatur`, `6_kommunikation_versicherung`, `9_reguliert`, `9_abgelehnt`, `9_an_externe_kanzlei`, `9_storniert` | **Pipeline-Position** — Visualisierung + Phase-basierte Geschäftslogik |

Trigger `trg_claims_set_phase` (BEFORE INSERT OR UPDATE OF status, kundenbetreuer_id) syncronisiert via `calc_claims_phase()` → status ist Single-Source-of-Truth, phase wird abgeleitet.

## Reader-Matrix

### `claims.status`-Reader (16 Stellen)

| Datei | Zweck |
|---|---|
| `components/shared/claims/ClaimStatusBadge.tsx` | Status-Badge-Rendering (Admin/SV/Kunde) |
| `components/shared/claims/status-mappings.ts` | SoT für Status-Display + isEndzustand-Flag |
| `app/admin/faelle/(hub)/FaelleKanban.tsx` | Kanban-Spalten gruppieren by status |
| `app/faelle/[id]/_actions/manual-status-override.constants.ts` | Endzustand-Dropdown-Optionen |
| `app/faelle/[id]/page.tsx` | Endzustand-Dropdown im Header |
| `app/faelle/[id]/FallakteShell.tsx` | gleiche Use-Case |
| `components/kunde/FallStatusCard.tsx` | Kunde-Sicht: Final-Status |
| `components/kunde/EigeneKanzleiPaketCard.tsx` | Conditional auf `status='an_externe_kanzlei_uebergeben'` |
| `lib/kanzlei/actions.ts` | Status-Snapshot in Kanzlei-Webhook |
| `lib/airdrop/server-actions.ts` | Cancel-Check: `['storniert','verjaehrt','reguliert_vollstaendig']` |
| `lib/claims/endzustand-actions.ts` | `markClaimAs*` Actions setzen status |
| `lib/fall/communication-timeline.ts` | Timeline-Snapshot |
| `lib/kanzlei-wunsch/actions.ts` | KB-Override-Logik |

### `claims.phase`-Reader (10 Stellen)

| Datei | Zweck |
|---|---|
| `components/shared/claims/ClaimPhaseBadge.tsx` | Phase-Badge-Rendering |
| `components/shared/claims/PhasePipeline.tsx` | Pipeline-Visualisierung mit Sortier-Order |
| `components/shared/claims/phase-mappings.ts` | SoT für Phase-Display + Order |
| `components/shared/claims/KanzleiAnsprechpartnerBlock.tsx` | Render-Variant je nach Phase |
| `components/kunde/FallStatusCard.tsx` | Phase-Feindetails (optional) |
| `lib/kanzlei/queries.ts` | Phase-basierte Query-Filter |
| `lib/kanzlei/actions.ts` | Auto-Paket-Logik: nur wenn `phase >= 4_gutachten_fertig` |
| `lib/claims/timeline-projection.ts` | Future-Projection basierend auf phase |
| `lib/claims/types.ts` | Type-Definitions |

### Beide

`components/kunde/FallStatusCard.tsx` liest **beide** — `status` als Endzustand-Anzeige, `phase` als optionaler Pipeline-Hinweis. Konsistent: status zuerst (final), phase ergänzend.

`lib/kanzlei/actions.ts` snapshotted **beide** in Webhook (Audit-Trail).

## Konsistenz-Verdikt

✅ **Keine Inkonsistenz.** Jeder Reader nutzt das passende Feld für seinen Zweck. Synchronisation läuft via Trigger Single-Source. Mehrere SoTs für UI-Mapping (`status-mappings.ts`, `phase-mappings.ts`) sind klar separiert.

## Empfehlung

- **Beide Felder behalten.** Drop einer Seite würde entweder Pipeline-Visualisierung (Drop phase) oder Endzustand-Editor (Drop status) brechen.
- **Dokumentation** in `AGENTS.md` ergänzen: kurzer Block „claims state-machine" der die Trennung erklärt — damit Future-Aaron / neue Sessions die Architektur nicht doppelt lesen müssen.
- **Folge-Audit (LOW)**: Prüfen ob `manual-status-override.constants.ts` und `status-mappings.ts` denselben Werte-Bereich abdecken — Drift-Schutz.

## Folge-Tickets

Keine. Dieses Audit schließt A9 ab. Falls Drift in den Sub-SoTs auftaucht → eigenes Ticket dann.
