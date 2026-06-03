# CMM-44 MP-8b — Claims-zentrischer Phasen-Read-Path (claims.id als SSoT-Key)

> **Spec / Design.** Implementierungs-Plan: `cmm44-mp8b-claims-centric-phase-readpath-plan.md`.
> Entscheidung Aaron 2026-05-29: **`claims.id` ist der kanonische Phasen-Key**, nicht `faelle.id` — `claims` ist die SSoT (kundenseitig angezeigt), `faelle` wird in Phase 6 gedroppt.

## 0 · Einordnung in den Gesamtplan

Zwei verschränkte Strecken laufen auf dasselbe Ziel zu:

1. **Claim-as-SSoT-Vollmigration** (`docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`, autoritativ): *„claims-first, faelle stirbt zuletzt"* → Phase 6 = `DROP TABLE faelle CASCADE`. **Härtester dokumentierter Blocker:** alle `FROM faelle`-Views (`v_faelle_mit_aktuellem_termin`, `faelle_sv_view`, `faelle_kunde_view`, `v_claim_full`, …) **müssen vor Phase 6 auf claims-Basis neu gebaut werden**, sonst killt der CASCADE-Drop alle Portale.
2. **Phasen-Lifecycle-Strecke** (MP-0..MP-9, `project_claim_phasen_ssot_architektur`): die 4-Phasen-Ableitung (`getClaimLifecycle` / `v_claim_phase`) als Produkt-Value (Live-Lifecycle im Kunde-Stepper). Stand: MP-5 fertig, MP-6 (System-A-Drop) fertig, MP-7/8 (Writer) laufend; MP-8-Keystone (Terminal-Vokabular) **gemergt (PR #2000)**.

**MP-8b liegt exakt auf der Schnittmenge:** `v_claim_phase` ist `FROM faelle f` — also genau eine der faelle-basierten Views, die Phase 4 ohnehin claims-zentrisch neu bauen muss. Diese Spec macht das für den **Phasen-Read-Path** (nicht die anderen Views — die bleiben Phase-4-Scope).

## 1 · Problem

Die gesamte Phasen-Strecke wurde unter der Annahme **`claim_id == faelle.id` (1:1 shared id)** gebaut (Parity-Probes MP-0/2/3 „0 Divergenzen", View `FROM faelle f`, `claim-phase-map.ts`-Kommentar „claim_ids == faelle.id"). **Diese Invariante ist heute FALSCH** (Live-DB 2026-05-29):

- `faelle.claim_id → claims.id` ist der echte Link (**74/74 valide FKs**).
- `faelle.id = claims.id` gilt nur für **1/74** (Legacy-Zeile).
- 75 claims, 74 faelle (1 claim hat keinen fall).

Folgen am Read-Path:

| Layer | Stand vor MP-8b | Effekt |
|---|---|---|
| `v_claim_phase` Join `claims c ON c.id = f.id` | matcht 1/74 | `c.status` NULL für 73/74 → terminale + Status-Regulierungs-Zweige **tot** → Abschluss/Regulierung-aus-Status unerreichbar |
| `getClaimPhaseMap`-Key (`claim_id = f.id` = faelle.id) | — | Caller uneinheitlich (s.u.) |
| Fallakte `page.tsx:133` + `kanzlei/queries` + `kanzlei/actions` | passen **claims.id** | Key-Mismatch → null Phase → `projectNextEvents`/Kanzlei-Block/`isKanzleiPaketPending` tot |
| `makler/*` (3 Sites) | passen **faelle.id** | (zufällig) korrekt gg. die alte faelle.id-Key |
| `getClaimLifecycleForClaim` (Haupt-Pipeline) | faelle-zentrische Sub-Entity-Joins | muss verifiziert/aligned werden |

Das ist **kein MP-8-Regress** — es ist vorbestehende Schuld (MP-3-View + die Invarianten-Verletzung durch die Lead-Konversion, die claims mit eigener id + `faelle.claim_id`-FK anlegt). MP-8 (Terminal-Vokabular) ist korrekt, sitzt aber auf diesem kaputten Read-Path.

## 2 · Ziel / Nicht-Ziel

**Ziel:** Den **Phasen-Read-Path** auf `claims.id` (SSoT) re-gründen — claims-zentrisch, faelle-frei. Damit ist (a) MP-8 end-to-end korrekt (Abschluss erreichbar, alle Portale lesen konsistent) und (b) ein Stück Phase-4 erledigt (die Phasen-View vom faelle-Drop entkoppelt).

**Nicht-Ziel (separate Slices):**
- Die **anderen** faelle-basierten Views (`v_faelle_mit_aktuellem_termin` etc.) → Phase 4.
- **lead→claim Field-Sync** (`claims.sa_unterschrieben/vollmacht_signiert_am/onboarding_complete` sind NICHT aus `leads` gesynct — 5-Claim-Gap, s. §4) → Phase-3-Slice.
- Restliche MP-7/8-Writer: lexdrive-Setzen (Regulierungs-Eintritt), no-show/storno→claims, ManualPhaseOverride-Redesign, Admin-Kanban-Status-Writer-Ersatz → eigene Slices.
- MP-9 Drift-Gate (CI-Parität `getClaimLifecycle` ↔ `v_claim_phase`) → eigene Slice, **hochpriorisiert** (hätte genau diese Klasse gefangen).

## 3 · Design

### 3.1 `v_claim_phase` claims-zentrisch (`FROM claims c`, Key `claims.id`)

```sql
CREATE OR REPLACE VIEW public.v_claim_phase AS
 SELECT c.id AS claim_id,
        CASE
            WHEN c.status = ANY(ARRAY['reguliert_vollstaendig','storniert','klage_rechtsstreit','verjaehrt','abgelehnt_final','an_externe_kanzlei_uebergeben']) THEN 'abschluss'
            WHEN kf.lexdrive_case_id IS NOT NULL THEN 'regulierung'
            WHEN c.status = ANY(ARRAY['in_kommunikation_vs','abgelehnt']) THEN 'regulierung'
            WHEN kf.claim_id IS NOT NULL THEN 'begutachtung'
            WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen' THEN 'begutachtung'
            ELSE 'erfassung'
        END AS main_phase,
        CASE
            WHEN c.status='reguliert_vollstaendig' THEN 'erfolgreich_reguliert'
            WHEN c.status='storniert' THEN 'storniert'
            WHEN c.status='klage_rechtsstreit' THEN 'klage_rechtsstreit'
            WHEN c.status='verjaehrt' THEN 'verjaehrt'
            WHEN c.status='abgelehnt_final' THEN 'abgelehnt_final'
            WHEN c.status='an_externe_kanzlei_uebergeben' THEN 'an_externe_kanzlei'
            WHEN kf.lexdrive_case_id IS NOT NULL THEN CASE WHEN kf.status='auszahlung' THEN 'auszahlung' ELSE 'versicherungskontakt' END
            WHEN c.status='in_kommunikation_vs' THEN 'versicherungskontakt'
            WHEN c.status='abgelehnt' THEN 'nachforderung'
            WHEN kf.claim_id IS NOT NULL THEN 'kanzlei_uebergabe'
            WHEN eg.status IS NOT NULL AND eg.status <> 'abgeschlossen' THEN eg.status
            WHEN l.id IS NOT NULL THEN CASE WHEN l.vollmacht_signiert_am IS NOT NULL THEN 'onboarding_offen' WHEN l.sa_unterschrieben THEN 'vollmacht_offen' ELSE 'sa_offen' END
            ELSE 'sa_offen'
        END AS sub_phase
   FROM claims c
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
     LEFT JOIN leads l ON l.id = c.lead_id
     LEFT JOIN LATERAL (SELECT a.status FROM auftraege a WHERE a.claim_id = c.id AND a.typ='erstgutachten' ORDER BY a.reihenfolge LIMIT 1) eg ON true;
```

- **Key `claim_id = c.id` (= claims.id)** — endgültig, faelle-frei.
- Sub-Entitäten via **claim-FK**: `kanzlei_faelle.claim_id`, `auftraege.claim_id` (beide existieren, CMM-37/Phase-1.5).
- **Erfassungs-Felder via `leads` über `claims.lead_id`** (NICHT `claims`' eigene Kopien — die sind ungesynct, §4). `leads` wird NICHT gedroppt → legitime Abhängigkeit.
- Inkludiert den **1 fall-losen Claim** (SSoT-Gewinn; die faelle-zentrische View ließ ihn weg).
- `CREATE OR REPLACE` (gleiche Spalten claim_id/main_phase/sub_phase, Grants/security_invoker bleiben). Ersetzt den MP-8b-Zwischen-Join-Fix (`c.id=f.claim_id`), der nur ein Pflaster auf der faelle-zentrischen View war.
- **`security_invoker`-Flag wie im Live-Stand erhalten** (`pg_get_viewdef`/`reloptions` vor Apply prüfen; Service-Read-Pfad in `getClaimPhaseMap` ändert sich nicht).

### 3.2 `getClaimPhaseMap` — Key = claims.id, Caller alignen

`claim-phase-map.ts`: Kommentar „claim_ids == faelle.id" → **„claim_ids == claims.id"**. Signatur unverändert (`string[]`).

Caller-Status nach View-Re-Key:
- ✅ `faelle/[id]/page.tsx:133` (`claimId = fall.claim_id`), `kanzlei/queries.ts` (`isKanzleiPaketPending`), `kanzlei/actions.ts` — passen schon `claims.id` → **forward-korrekt, kein Change**.
- 🔧 `makler/copilot-prompt.ts:142`, `makler/queries.ts:395` (Detail), `makler/queries.ts:587` (Liste) — passen `fallId` (faelle.id) → **auf `claims.id` umstellen**. Makler-Queries haben den Fall-Kontext (consent auf faelle) → `faelle.claim_id` mitselektieren und die Map per `claim_id` keyen (fallId→claimId-Bridge in der Liste).

### 3.3 `getClaimLifecycleForClaim` + `getClaimLifecycle`-Inputs

- `getClaimLifecycleForClaim` (Haupt-Pipeline, Fallakte-aside + Kunde-Stepper) **verifizieren + claims-zentrisch alignen**: Sub-Entity-Loads via `claim_id` (kanzlei_faelle/auftraege) statt `fall_id`/faelle.id; Erfassungs-Felder via `leads` über `claims.lead_id`. Muss bit-gleich zur §3.1-View bleiben (Parity).
- `lifecycle.ts`-Logik selbst (Aggregation) ist unverändert korrekt — nur die **Input-Beschaffung** des Loaders wird auf claims-Basis gezogen.

### 3.4 Drift-Cleanup
Der in dieser Session via `apply_migration` applizierte Zwischen-Fix `cmm44_mp8b_v_claim_phase_join_on_claim_id` (Join `c.id=f.claim_id`, **File nicht committed**) wird durch die §3.1-Migration ersetzt. Beide recorded Migrationen (Zwischen-Fix + claims-zentrisch) als Files committen → kein DB↔Repo-Twin-Drift (Regel 2).

## 4 · Datenbefund (verifiziert 2026-05-29)

- **Parity 74/74:** Die §3.1-Logik (claims-zentrisch, leads via claims.lead_id) liefert für alle 74 vergleichbaren Claims **exakt dieselbe** `(main_phase, sub_phase)` wie die aktuelle View (0 Mismatches). → **kein Phasen-Shift im Bestand.**
- **Daten-Gap (separat):** `claims.{sa_unterschrieben, vollmacht_signiert_am, onboarding_complete}` sind NICHT aus `leads` gesynct — eine claims-eigene-Felder-Variante regressierte 5 Claims (`sa_offen` statt `vollmacht_offen`). Darum liest die View `leads` via `claims.lead_id`. **Wenn der lead→claim Field-Sync (Phase 3) fertig ist, kann die View auf `claims`' eigene Felder umstellen + den `leads`-Join droppen.**
- Bestand alle nicht-terminal (dispatch_done 72 / in_bearbeitung 3) → terminale + Status-Regulierungs-Zweige feuern heute für 0 Claims (additiv, kein Risiko).

## 5 · Verifikation (Akzeptanz)

1. **DB:** neue View live; `phase_dist` unverändert (erfassung/vollmacht_offen 61, begutachtung/kanzlei_uebergabe 12, erfassung/sa_offen 1, **+1 fall-loser Claim**); 0 null-rows.
2. **Parity-Probe** (`scripts/probe-claim-phase-parity.mjs` mitziehen): `getClaimLifecycleForClaim` (claims-zentrisch) == `v_claim_phase` → 0 Divergenzen.
3. **Build/tsc/vitest** grün; token-audit + component-set grün.
4. **Smoke (Screenshots):** Admin/KB-Fallakte + Admin-Kanban + Kanzlei + **Makler** + Kunde-Stepper → 4-Phasen korrekt, keine null-Phasen.
5. **Terminale e2e:** auf einem Test-Claim einen terminalen Status setzen (Verjährt, notify=off) → Fallakte + Kanban + Kunde zeigen **Abschluss / <substate>**; danach reverten.

## 6 · Risiken / Migrations-Sicherheit

- **Geteilte Prod/Staging-DB:** Die View-Migration ist `CREATE OR REPLACE` (additiv, 0 Phasen-Shift verifiziert) → safe vor Code-Deploy. Die Makler-Caller-Fixes deployen mit dem Code (Merge → staging).
- **`apply_migration` via Plugin** (Regel 2), Dateiname == recorded version.
- **Deploy-Reihenfolge:** View-Migration → Code (Makler-Fixes + getClaimLifecycleForClaim) → Merge. View-Re-Key ändert für Fallakte/kanzlei das Verhalten von „null" auf „korrekt" (Verbesserung); für Makler von „faelle.id-Key" auf „claims.id-Key" — beide Seiten müssen mit dem Code-Deploy zusammenpassen, daher Makler-Caller-Fix + View im selben PR.
- **Parallele Sessions:** 6 aktiv, keine auf `lifecycle.ts`/`v_claim_phase`/`claim-phase-map`/makler-phase — kein File-Overlap. Vor Merge `git fetch` + Re-Check.

## 7 · Wo das in der Strecke steht (danach)

MP-8b (dieser Read-Path) → Rest MP-7/8-Writer (lexdrive-Eintritt, no-show/storno, Override-Redesign, Kanban-Writer) → **MP-9 Drift-Gate** → … → Phase-4 (übrige faelle-Views claims-zentrisch) → Phase-5 (Sync-Trigger weg) → Phase-6 (`DROP TABLE faelle CASCADE`).

## 8 · Offene Punkte (Review)
1. Scope-Schnitt ok? (nur Phasen-Read-Path; andere faelle-Views = Phase 4)
2. `getClaimLifecycleForClaim` claims-zentrisch in DIESER Slice (empfohlen, da Haupt-Pipeline + Parity-Gate), oder separat?
3. lead→claim Field-Sync als eigenes Phase-3-Ticket anlegen (claims-eigene Erfassungs-Felder befüllen → View kann später `leads`-Join droppen)?
