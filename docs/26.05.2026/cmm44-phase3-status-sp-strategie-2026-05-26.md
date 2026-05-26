# CMM-44 — `status`-SP: Implementierungsplan (2026-05-26, KORRIGIERT)

> **REQUIRED SUB-SKILL fuer Worker:** superpowers:executing-plans / subagent-driven-development.
> Steps mit `- [ ]` Checkbox-Syntax.

**Status: PLAN zur Review — eine Produkt-Entscheidung offen (§3 Mapping), dann PR1 bauen.**

**Goal:** Den Legacy-`faelle.status` (`fall_status`-Enum, 19 Werte) retiren zugunsten des kanonischen
claims-Modells `claims.status` (7-Wert coarse) + `claims.phase` (11-Wert, auto-derived), damit
`faelle.status` in Phase 6 gedroppt werden kann.

**Architektur:** Dual-Write-Transition mit Mapping. NICHT mechanische Spalten-Relocation (anders als
Bankdaten/SV-Leadpreis-Slices — die Vokabulare unterscheiden sich).

---

## 0 · Premissen-Korrektur (WICHTIG — frueherer Plan war falsch)

Die erste Analyse nahm an, `status` sei eine namens-gleiche Duplikat-Spalte (wie die anderen
CLAIM_OWNED-Spalten). **Falsch.** Befund + Aaron-Klarstellung ("claim status ist das richtige"):

- `faelle.status` = `fall_status` **Enum** (19 Werte: ersterfassung, sv-gesucht, sv-zugewiesen,
  sv-termin, besichtigung, begutachtung-laeuft, gutachten-eingegangen, filmcheck, qc-pruefung,
  kanzlei-uebergeben, anschlussschreiben, regulierung, regulierung-laeuft, nachbesichtigung-laeuft,
  vs-abgelehnt, zahlung-eingegangen, abgeschlossen, storniert, onboarding). Der detaillierte
  Lifecycle, getrieben von `transitionFallStatus` (state-machine.ts). **LEGACY.**
- `claims.status` = `text`, 7 Werte (`CLAIM_STATUS` in `src/lib/claims/types.ts`): dispatch_done,
  in_bearbeitung, in_kommunikation_vs, reguliert, abgelehnt, an_externe_kanzlei_uebergeben, storniert.
  Coarse Lifecycle-Status. **KANONISCH** (mit Badge/Label/Endzustand-Mapping in
  `src/components/shared/claims/status-mappings.ts`).
- `claims.phase` = 11 Werte (`CLAIM_PHASEN`): 0_lead..6_kommunikation_versicherung + 9_* Endzustaende.
  **Auto-derived** durch `calc_claims_phase` (Trigger `trg_claims_set_phase`). Traegt die feinere
  Prozess-Position. **KANONISCH.**

Design-Referenz: `docs/claim-as-ssot-umbau.md` §1.1 (Phase+Status-Definition), §1.3 ("Was bleibt von
faelle: NUR Assignment-Spalten — Status/Phase sind im Claim"), §3.1.4 (Trigger AAR-854 stilllegen
sobald keine UI faelle.status liest), §6+§7 ("git grep faelle.status muss leer sein").

→ Die Aufgabe ist **Retirement von faelle.status**, nicht "rüberkopieren". Jeder faelle.status-Reader
muss auf `claims.status` (coarse) und/oder `claims.phase` (fein) umgestellt werden.

## 1 · Empirischer Stand (live 2026-05-26, PRE-LAUNCH SEED-DATA, ~59 Faelle)

| faelle.status | claims.status | claims.phase | n |
|---|---|---|---|
| sv-termin | dispatch_done | 2_in_bearbeitung | 45 |
| ersterfassung | dispatch_done | 2_in_bearbeitung | 10 |
| sv-termin | in_bearbeitung | 0_lead | 1 |
| gutachten-eingegangen | dispatch_done | 2_in_bearbeitung | 1 |
| ersterfassung | in_bearbeitung | 0_lead | 1 |
| sv-termin | dispatch_done | 3_gutachter_unterwegs | 1 |

**Befund:** `claims.status` haengt fast ueberall auf `dispatch_done` (wird nach Lead-Convert NICHT
weiter-advanced — `transitionFallStatus` schreibt nur faelle.status). `claims.phase`-Derivation
(calc_claims_phase) variiert kaum (meist 2_in_bearbeitung). Daten sind Seed-Rauschen → das Mapping
ist NICHT empirisch ableitbar, sondern Design-Entscheidung (§3). claims.status/phase wird heute NICHT
durch den faelle-Lifecycle gepflegt — das ist die Luecke, die PR1 schliesst.

## 2 · Writer-Landschaft (faelle.status)

- **Kanonisch:** `transitionFallStatus` (state-machine.ts:48) — schreibt nur faelle.status (Z.155).
- **DIRECT (umgehen die State-Machine):** `lib/kanzlei-wunsch/actions.ts`, `app/gutachter/team/actions.ts`,
  `app/api/sv-zuweisung/route.ts`, `app/admin/faelle/anlegen/actions.ts` (INSERT/Erzeugung),
  `lib/lexdrive/process-event.ts` (ovFaelle-Pfad ~Z.744 `status: neuerStatus` — VARIABLE, von Grep
  leicht uebersehen!) + VorOrtPanel verifizieren + ~6 Smoke/Seed-Scripts (lifecycle-seed.ts etc.).
- **claims.status-Setter heute:** convert-lead-to-claim (dispatch_done), kanzlei-wunsch (in_bearbeitung),
  endzustand-actions (reguliert/abgelehnt/an_externe_kanzlei/storniert). KEIN Setter fuer die mittleren
  Uebergaenge → daher haengt es auf dispatch_done.

## 3 · OFFENE PRODUKT-ENTSCHEIDUNG: fall_status → ClaimStatus Mapping

PR1 macht `transitionFallStatus` (+ Direct-Writer) zum claims.status-Advancer. Dafuer braucht es ein
Mapping enum→coarse. **Vorschlag (Aaron bitte bestaetigen/korrigieren):**

| claims.status | fall_status-Werte |
|---|---|
| `dispatch_done` | onboarding, ersterfassung, sv-gesucht *(Claim erstellt, SV noch nicht aktiv)* |
| `in_bearbeitung` | sv-zugewiesen, sv-termin, besichtigung, begutachtung-laeuft, gutachten-eingegangen, filmcheck, qc-pruefung, nachbesichtigung-laeuft |
| `in_kommunikation_vs` | kanzlei-uebergeben, anschlussschreiben, regulierung, regulierung-laeuft |
| `reguliert` | zahlung-eingegangen, abgeschlossen |
| `abgelehnt` | vs-abgelehnt |
| `storniert` | storniert |

Offene Detail-Fragen fuer Aaron:
1. **dispatch_done vs in_bearbeitung-Grenze**: ab `sv-zugewiesen` "in Bearbeitung" — korrekt?
2. **in_kommunikation_vs-Start**: ab `kanzlei-uebergeben`? Oder erst ab `regulierung`?
3. **an_externe_kanzlei_uebergeben**: kein passender Enum-Wert (klage ist NICHT im Enum) → wird via
   endzustand-actions gesetzt, NICHT via Transition? Bestaetigen.
4. **claims.phase**: bleibt auto-derived (calc_claims_phase) — soll PR1 die Derivation pruefen/fixen,
   oder ist sie out-of-scope (eigenes Ticket)? (Seed-Daten zeigen sie ist grob, aber Seed ≠ Prod.)

## 4 · PR-Split

### PR1 — claims.status-Advancement (Dual-Write, Reader-Blast-Radius ≈ 0)
**Goal:** claims.status wird ab jetzt durch jeden faelle-Status-Uebergang korrekt mitgefuehrt
(gemappt). faelle.status bleibt unveraendert geschrieben (Reader + Notification-Trigger intakt).

- [ ] **Mapping-Konstante** `src/lib/claims/fall-status-to-claim-status.ts` (KEINE 'use server'-Datei —
      reine Konstante/Funktion, vgl. AAR-664): `export function mapFallStatusToClaimStatus(s: string):
      ClaimStatus | null` mit der Tabelle aus §3.
- [ ] **state-machine.ts** `transitionFallStatus`: nach dem faelle/claims-Write zusaetzlich
      `claims.status = mapFallStatusToClaimStatus(newStatus)` setzen (wenn != null, via claimId, im
      bestehenden claims-Update-Block oder separat). NICHT via splitOrKeepFaelleUpdate (das ist
      namens-gleich-Routing; status-Vokabular unterscheidet sich).
- [ ] **Direct-Writer** (kanzlei-wunsch, gutachter/team, sv-zuweisung, lexdrive ovFaelle,
      admin/faelle/anlegen): wo sie faelle.status setzen, claims.status mitsetzen (gemappt). Pro Site
      einzeln; kanzlei-wunsch setzt claims.status='in_bearbeitung' bereits — pruefen ob konsistent.
- [ ] **Backfill-Migration** (db push, Regel 2): einmalig `UPDATE claims c SET status =
      <map(f.status)> FROM faelle f WHERE f.claim_id=c.id` — fixt die haengenden dispatch_done.
      Mapping als SQL CASE. KEINE Typ-Aenderung (claims.status bleibt text — die Werte sind
      ClaimStatus, nicht fall_status; ALTER TYPE fall_status ist FALSCH hier, wuerde an dispatch_done
      scheitern).
- [ ] **Verify:** `SELECT f.status, c.status, count(*) ... GROUP BY` zeigt korrektes Mapping; ein
      Test-Uebergang advanced claims.status.
- [ ] KEINE Reader-Aenderung. tsc + Build.

### PR2..N — Reader-Migration (portal-weise, je 1 PR, "keine Mischform" §5b)
- [ ] faelle.status-Reader pro Portal (Kunde / SV / Mitarbeiter / Admin / Dispatch / Kanzlei) auf
      `claims.status` (coarse) bzw. `claims.phase` (fein) umstellen — je nach was die UI braucht.
      Detaillierte Stufen (sv-termin/gutachten-eingegangen/filmcheck) → meist `claims.phase` oder die
      Sub-Entity (auftraege/gutachten/gutachter_termine), NICHT claims.status.
- [ ] Views die faelle.status projizieren auf claims.status repointen (Typ text=text, kein 42P16).
      View-Inventur via `information_schema.view_column_usage` (bei ruhigem Pool nachholen).
- [ ] `transitionFallStatus`-Selbst-Validierung (liest fall.status Z.68) → erst hier auf claims
      umstellen, falls noetig (PR1 schreibt faelle weiter → unkritisch bis dahin).
- [ ] Pro Portal Smoke (Screenshot-Pflicht).

### PR_final — Trigger + Drop (Teil Phase 6)
- [ ] faelle-Notification-Trigger (on_gutachten_eingegangen/on_filmcheck_done/on_regulierung) auf
      claims.status/phase umziehen oder droppen.
- [ ] faelle.status-Write aus allen Writern entfernen; `git grep faelle.status` leer; Spalte droppen.

## 5 · Risiken

- **Mapping ist Produkt-Logik** — PR1 nicht ohne Aaron-Nod auf §3 bauen.
- **Notification-Trigger** feuern auf faelle.status — bis PR_final weiter faelle.status schreiben.
- **claims.status bleibt `text`** (NICHT auf fall_status-Enum casten — Werte sind ClaimStatus).
- **Reader-Zahl gross** — PR2 portal-weise sub-splitten; jede Stufe einzeln smoken.
- **calc_claims_phase-Derivation** evtl. eigenes Ticket (Seed-Daten nicht aussagekraeftig).
- **Pool** load-shedding (8 Sessions) — Migration im ruhigen Slot, db push atomar, NUR CLI (Regel 2).

## 6 · Reihenfolge gesamt
SV-Leadpreis ✅ (#1794) → **status-SP (dieser Plan)** → sv_id-Slice → Cardentity/Fahrzeug → Phase 6.
