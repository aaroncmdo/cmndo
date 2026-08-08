# Plan Tranche W — Werkstatt-Termin-Sicht (Branch `kitta/kunde-termin-funnel-w`)

Spec: `docs/superpowers/specs/2026-08-05-kunde-termin-funnel-design.md` §4.9 (Diagnose-Stand 08.08. — Root-Causes file:line-hart, dort nachlesen). Alle Pfade relativ zum Worktree `.claude/worktrees/kunde-termin-funnel`.

## Tasks

- **T1 (W1, Migration/DDL — Session-Owner, NICHT Subagent):** `CREATE OR REPLACE VIEW v_werkstatt_auftrag` — Besichtigungs-LATERAL bezug-aware (`(t.bezug_typ IN ('fall','claim') AND t.bezug_id=c.id) OR (t.bezug_typ IS NULL AND (t.claim_id=c.id OR t.fall_id=c.id))`) + `t.status NOT IN ('storniert','abgesagt','abgelehnt','verlegt')`. Spaltenliste IDENTISCH (Grants bleiben). Regel-2-Ablauf komplett (apply_migration → list_migrations → File == Version → READ-Verify).
- **T2 (W1, UI-Mini):** `src/components/werkstatt/WerkstattAuftragDetail.tsx:416` — Status-Label-Map statt binaerem Ternary: `bestaetigt→'bestätigt'`, `dispatch_pending|sv_gesucht→'wird bestätigt'`, sonst `'reserviert'`. Umlaute echt (Frontend-Regel).
- **T3 (W2, Helper+TDD):** `src/lib/werkstatt/ensure-reparatur-termin.ts` — `ensureReparaturTerminAngefragt(admin, { claimId, werkstattId, erstelltVon })`: SELECT offene Row (`status IN ('angefragt','werkstatt_vorschlag','anruf_erbeten','bestaetigt')`) → existiert: `{ ok:true, created:false }`; sonst INSERT `{ claim_id, werkstatt_id, status:'angefragt', wunschtermin:null, erstellt_von }`. Vitest (3 Faelle: noop/insert/error-degradiert).
- **T4 (W2, Funnel):** (a) `src/lib/werkstatt/vermittlung-server.ts` `assignReparaturWerkstatt`: nach dem Cursor-Block, wenn `effectiveClaimId` → `ensureReparaturTerminAngefragt` non-fatal (try/catch + console.error). (b) `src/lib/leads/convert-lead-to-claim.ts:~899-916`: Bedingung vom Lead-Feld auf den EFFEKTIVEN Claim-Zustand heben (nach dem claims-Insert `reparatur_werkstatt_id` zuruecklesen — deckt die qr_referral-Trigger-Promotion); bestehende Wunschtermin-Uebernahme (`lead.reparatur_wunschtermin`) beibehalten; bei vorhandenem Lead-Werkstatt-Feld verhaelt sich alles wie bisher (Regression-Guard: bestehende Tests gruen).
- **T5 (W2, Kunde-Nachtrag):** `src/app/kunde/faelle/[id]/reparatur-termin-actions.ts` `schlageReparaturTerminVorPortal`: Wenn aktive Row `status='angefragt' AND wunschtermin IS NULL` → Wunschtermin per `createServiceClient()` nachtragen (`.update({wunschtermin}).eq('id',…).select()`+Row-Check; Owner-Check ist durch die vorgelagerten user-scoped Reads erbracht) statt „Es liegt bereits ein Terminwunsch vor." Andere aktive Rows blocken weiter wie heute.
- **T6 (W2, Werkstatt-UI-Fallback):** `WerkstattAuftragDetail.tsx:80-81` — ohne `terminId` NICHT `return null`, sondern den bestehenden „Terminvorschlag offen"-Zustand (Badge + Vorschlag-Form; `schlageWerkstattTerminVor(claim_id,…)` funktioniert row-los via Server-Upsert). Bestehende Row-Zweige unveraendert.
- **T7 (W2, Backfill-DML — Session-Owner):** Migration: INSERT `reparatur_termine (claim_id, werkstatt_id, status, erstellt_von)` SELECT fuer Claims mit `reparatur_werkstatt_id IS NOT NULL`, ohne offene/irgendeine Row, `coalesce(operative_status,'offen') NOT IN ('abgeschlossen','storniert','abgelehnt')` → Stand 08.08.: 8 Rows. Verify: Konsistenz-Query 0 offene Luecken.
- **T8 (D1, Session-Owner):** Journey-Deltas `docs/fundament/journeys/j01…` (Werkstatt sieht Begutachtungstermin, „wird bestätigt") + `j04…` (Bindung ⇒ offene Row, Werkstatt proaktiv). Journey-Spec-Nachzug als dokumentierter `test.skip` falls kein automatisierbarer Schritt (Werkstatt-Login-Fixture fehlt → begruenden).
- **T9 (Verify, Session-Owner):** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (exklusiv) · `tsc --noEmit` · vitest betroffene Suiten · Ratchets (component-set/status-registry/flag-drift/termin-bezug/operative-status) — 0 neue. Draft-PR ab erstem Commit (#4999-Lesson).

## Nicht-Ziele
- Kein DB-Trigger fuer den Ensure (0 UPDATE-Promotionen im Bestand; bekannte Rest-Luecke dokumentiert in Spec §4.9).
- Keine RLS-Aenderungen (Werkstatt-INSERT laeuft admin-seitig; Kunde-Nachtrag via Service-Client).
- Kein i18n-Ausbau Werkstatt-Portal (Bestand ist hardcoded-de; neue Strings folgen dem Bestand).

## Smoke-Plan (Regel 4, deploy-gated — in den PR-Body)
1. W1: Werkstatt-Login (Wegwerf- oder Test-Werkstatt) → Auftrag mit bezug-nativem SV-Termin zeigt Besichtigungs-Block (Datum/Ort/„wird bestätigt" bei pending). DB-Gegenprobe: View-SELECT auf Claim mit bezug-fall-Termin liefert besichtigung_start NOT NULL.
2. W2: Backfill-Claim (CLM-2026-01838, Aarons Repro) → Werkstatt-Detail zeigt Termin-Sektion „Terminvorschlag offen" → Werkstatt schlaegt Termin vor → Kunde-Akte zeigt Vorschlag → Kunde bestaetigt (`reparatur-laeuft`-Cursor).
3. W2-Kunde-Nachtrag: Claim mit angefragt/null-Wunsch-Row → Kunde traegt Wunschtermin nach (kein „bereits vorhanden"-Block).
4. Akte-Finder-Neuvermittlung (Wegwerf): Werkstatt waehlen → Row entsteht sofort (READ) + Werkstatt-Sektion sichtbar.
