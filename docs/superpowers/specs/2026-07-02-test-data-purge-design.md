# Prod-Test-Daten-Bereinigung — Design & Record (2026-07-02)

**Goal:** Seed-/Test-Pollution aus der Prod-DB entfernen, damit die operativen Funnel-Zahlen die Realitaet zeigen — ohne echte Kundendaten oder aktive Fixtures zu beruehren.

## Kontext / Warum

Der Golden-Path-Harness (PR #3443) bewies: die Pipeline laeuft e2e durch. Die anschliessende Diagnose des „84 SV → 2 Gutachten"-Cliffs zeigte, dass er ein **Mess-Artefakt** ist:

- 82 Claims mit SV, **79 davon an 4 Test-SV-Accounts** (`ist_testaccount=true`).
- Genau **ein** echter aktiver SV („UnfallSafe – Kfz-Gutachten Köln") mit **3** recenten Claims.
- Echter Funnel Test-bereinigt: **13 Claims / 3 mit SV / 0 Gutachten** — kein Stall, nur niedriges Volumen.
- 391 Leads: 316 `@claimondo.de` (intern), 23 `@claimondo.test`, ~32 potenziell extern.

Ohne Bereinigung verwechselt **jeder** (Aaron, Dispatcher, Admin, kuenftige Sessions) das verschmutzte Zahlenbild mit einem Delivery-Problem — genau das ist in dieser Session passiert.

## Scope (Aaron-Entscheid: T1+T2, Hard-Delete + Manifest)

| Tier | Menge | Definition |
|---|---|---|
| **T1** | 69 Claims (+69 Leads +Dependents) | Claims mit `sv_id` → Test-SV (`ist_testaccount=true`), Aktivitaet ≤ 72h ausgeschlossen |
| **T2** | 5 Leads | Unkonvertierte reine Test-Leads (`@claimondo.test`/`@example.com`/`claimondo-test.de`), nicht hinter Test-SV- oder echtem Claim, ≤ 72h ausgeschlossen |
| **T3** | ~257 Leads | **AUSGESCHLOSSEN** — interne `@claimondo.de` (mehrdeutig, separate Entscheidung) |

**Verifizierte Sicherheit:** Die 82 Test-SV-Claims → 82 distinkte Leads (1:1); die 9 „extern" wirkenden Lead-Emails sind ausnahmslos Aarons eigene oder Smoke-Synthetics → **null echte Kunden**. `ist_testaccount` ist damit ein verlaesslicher Loesch-Proxy.

## Sicherheitsmechanismen (nicht verhandelbar)

1. **Fixture-ACCOUNTS bleiben** — nur Claims/Leads werden geloescht, nie SV-/User-Accounts (12 parallele Sessions referenzieren sie per ID).
2. **Recency-Guard 72h auf `created_at`** — Datensaetze mit `created_at > now()-72h` werden uebersprungen (schuetzt mid-flight Smoke-Runs). **Wichtig (Realisierung):** urspruenglich `greatest(created_at, updated_at)` geplant, aber der Lead-Delete SET-NULLt `claims.lead_id` → bumpt `claims.updated_at` auf now → alte Test-Claims wurden faelschlich als „recent" geschuetzt. `created_at` ist das korrekte „aus aktivem Lauf?"-Signal (ein aktiver Smoke-Run ERZEUGT jetzt, ein Backfill/Cleanup UPDATED nur).
3. **Manifest-Snapshot** vor jedem Delete (`docs/superpowers/artifacts/2026-07-02-test-data-purge-manifest.json`) — Audit-/Reversibilitaets-Record aller entfernten IDs.
4. **Dry-Run zuerst** — Utility druckt das Manifest ohne zu loeschen; Delete nur mit explizitem Confirm-Token.
5. **Loesch-Mechanik (Realisierung)** — `delete_fall_komplett(fall_id, claim_id)` ist post-CMM-49 fuer bridge-gemappte Claims (`fall_id != claim_id`) NICHT verlaesslich beim Claim-Row (der Golden-Path traf das nie, weil seine Claims `fall_id == claim_id` haben). Daher: RPC (best-effort fall-scoped) **plus direkter Bridge/Claim/Lead-Delete** + vollstaendiges NO_ACTION-Dep-Modell (per pg_catalog ermittelt: `auftraege`, `fall_dokumente`, `gutachter_finder_anfragen` `konvertiert_zu_fall_id`+`_lead_id`, `gutschriften`, 3× Abrechnungs-Positionen, `gutachter_termine`, `tasks`, `whatsapp_inbound_messages`; CASCADE/nullbares-SET-NULL self-healing). Loesch-Ordnung bottom-up: BRIDGE-Deps → Bridge-Row → CLAIM-Deps → Claim-Row; LEAD-Deps → Lead-Row. KEIN DDL/DML ueber `execute_sql` (Regel 2).
6. **Koordinations-Marker** vor Ausfuehrung (`memory/COORDINATION-test-data-purge.md`).

## Komponenten

- `src/lib/health/purge-test-data.ts` — `selectTestDataTargets(admin)` (re-derived T1+T2 mit Guard) + `purgeTestData(admin, { dryRun })` → Manifest `{ t1, t2, deleted, skipped, errors }`.
- `src/app/api/cron/purge-test-data/route.ts` — CRON_SECRET-gated; `dryRun` default true, `?confirm=DELETE-TESTDATA` zum echten Loeschen. Doppelnutzung: manueller One-Shot jetzt + optionaler nightly Janitor (Smoke-Residue akkumuliert).

## Verifikation

Nach dem Lauf: Funnel-Query erneut → `claims` von 94 → ~13, `mit_sv` von 84 → 3, Test-SV-Claims → 0. Manifest-Datei enthaelt exakt die entfernten IDs.

## Reversibilitaet

Hard-Delete ist irreversibel; die Reversibilitaet beschraenkt sich auf den Manifest-Record (welche IDs/Kernfelder entfernt wurden) + Supabase-PITR als Netz. Akzeptiert, weil null echte Kundendaten betroffen sind.
