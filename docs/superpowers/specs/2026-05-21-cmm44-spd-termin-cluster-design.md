# CMM-44 SP-D — Termin-Cluster (25 Spalten faelle → gutachter_termine)

**Datum:** 2026-05-21
**Sub-Projekt:** CMM-44 SP-D (Termin-Cluster)
**Master:** docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md
**Entsperrt durch:** SP-G2 ([[project_cmm44_spg2_status]]) — `gutachter_termine.claim_id` ist die faelle-freie Verknüpfung.

---

## 1 · Kontext

25 termin-bezogene `faelle`-Spalten (Verdikt MOVE → `gutachter_termine` aus dem Phase-1-Mapping §3 Cluster „Termin"(15) + „Nachbesichtigung"(9) + `no_show_gemeldet_am`) wandern additiv auf die `gutachter_termine`-Sub-Table. `gutachter_termine` ist **1:N pro Claim** (mehrere Termine über die Zeit). **Rein additiv** — die 25 `faelle`-Spalten bleiben stehen und sterben mit `DROP TABLE faelle` in Phase 6 (analog SP-B/SP-G/SP-H).

### Aaron-Entscheidungen (2026-05-21)
- **Nachbesichtigung als Spalten** auf `gutachter_termine` (additiv, wie die übrigen). Konfrontation-als-eigener-Termin-Row = späteres Refactor, nicht SP-D.
- **Backfill auf den aktuellsten Termin pro Claim** (`ORDER BY start_zeit DESC LIMIT 1`) — wie SP-H „aktueller Auftrag".

---

## 2 · Die 25 Spalten — DUP-vs-ADD-Audit

Verglichen mit den 85 bestehenden `gutachter_termine`-Spalten (live 2026-05-21). Drei Klassen:

### 2a · Klare ADD (kein GT-Äquivalent) — 15
| `faelle`-Spalte | Typ | Cov | GT-Ziel (neu) |
|---|---|--:|---|
| `besichtigungsort_adresse` | text | 1 | gleicher Name |
| `besichtigungsort_lat` | numeric | 1 | gleicher Name |
| `besichtigungsort_lng` | numeric | 1 | gleicher Name |
| `besichtigungsort_place_id` | text | 0 | gleicher Name |
| `besichtigungsort_notiz` | text | 0 | gleicher Name |
| `geschaetzte_fahrdistanz_km` | numeric | 0 | gleicher Name |
| `nachbesichtigung_status` | text | 30 | gleicher Name |
| `nachbesichtigung_angefordert_am` | timestamptz | 0 | gleicher Name |
| `nachbesichtigung_termin_datum` | timestamptz | 0 | gleicher Name |
| `nachbesichtigung_konfrontation` | boolean | 30 | gleicher Name |
| `nachbesichtigung_ergebnis` | text | 0 | gleicher Name |
| `nachbesichtigung_kunde_termin_vorschlaege` | jsonb | 30 | gleicher Name |
| `nachbesichtigung_kunde_termin_eingereicht_am` | timestamptz | 0 | gleicher Name |
| `nachbesichtigung_sv_konfrontation_gewuenscht` | boolean | 0 | gleicher Name |
| `nachbesichtigung_sv_termin_vereinbart_am` | timestamptz | 0 | gleicher Name |

### 2b · Klare DUP (bestehende GT-Spalte nutzen → KEIN ADD, Reader-Switch) — 2
| `faelle`-Spalte | Typ | bestehende GT-Spalte | Begründung |
|---|---|---|---|
| `geschaetzte_fahrzeit_min` | int | `geschaetzte_fahrtzeit_min` (int) | Tippfehler-Zwilling („fahr**t**zeit"); semantisch identisch (geschätzte Fahrzeit). |
| `gcal_event_id` | text | `google_event_id` (text) | Beide = Google-Calendar-Event-ID des Termins. |

Diese 2 werden **nicht** addiert; Reader/Writer der `faelle`-Spalte stellen auf die bestehende GT-Spalte um (SP-G „Klasse-C"-Muster). Werte-Konsistenz in PR1 Task-0 prüfen (`faelle.X` vs `GT.twin` an verknüpften Rows).

### 2c · Ambiguous — Default ADD, **deine Bestätigung im Spec-Review** — 8
Default-Regel: **im Zweifel ADD** (nie still in eine falsche bestehende Spalte mergen). Bestätigst du einen als DUP, wird er von ADD → Reader-Switch verschoben.

| `faelle`-Spalte | Typ | GT-Kandidat | Frage | Default |
|---|---|---|---|---|
| `termin_erinnerung_5min_gesendet` | bool | `reminder_5min_sent_at` (timestamptz) | Gleicher 5-Min-Reminder? Typ differiert (bool vs ts). | **DUP?** → bestätige; sonst ADD |
| `sv_termin_dokument_reminder_gesendet_am` | timestamptz | `erinnerung_48h_docs_gesendet` (bool) | Gleicher Dokumenten-Reminder? | **DUP?** → bestätige; sonst ADD |
| `re_termin_eskalation_an_kb_am` | timestamptz | `verlegung_eskalation_an_kb_an` (timestamptz) | Re-Termin-Eskalation == Verlegungs-Eskalation? | **DUP?** → bestätige; sonst ADD |
| `re_termin_token` | uuid | (verlegung-Flow?) | Token-basierter Kunde-Reschedule ≠ verlegung-State — eigener Mechanismus. | **ADD** |
| `re_termin_token_eingelaufen_am` | timestamptz | (verlegung-Flow?) | s.o. | **ADD** |
| `wunschtermin` | timestamptz | `vorgeschlagenes_datum` (timestamptz) | Kunde-Wunsch vs SV-Vorschlag — andere Akteure. | **ADD** |
| `no_show_gemeldet_am` | timestamptz | `uebersprungen`/`uebersprung_grund` | No-Show (Kunde) vs Termin-übersprungen — andere Granularität. | **ADD** |
| `losfahren_erinnerung_gesendet` | bool | `notification_losgefahren_gesendet_am` (ts) | Erinnerung-zum-Losfahren (an SV) ≠ Benachrichtigung-dass-losgefahren. | **ADD** |

**Ergebnis (vor Review):** bis zu **23 ADD** (15 klar + 8 ambiguous-default-ADD) + **2 Reader-Switch** (klare DUP). Jede vom Review als DUP bestätigte Ambiguous-Spalte reduziert die ADDs um 1.

---

## 3 · Backfill (1:N — aktueller Termin)

Pro Claim den aktuellsten Termin (`ORDER BY start_zeit DESC NULLS LAST LIMIT 1`) mit den `faelle`-Werten füllen — analog SP-H. Pre-launch: 18 Termine, 6 fall-verknüpft → wenig betroffen. UPDATE-only auf existierende Termin-Rows (Option A, kein neuer Termin). Postgres-Muster:
```
UPDATE gutachter_termine gt SET <cols> = f.<cols>
FROM faelle f
WHERE gt.claim_id = f.claim_id
  AND gt.id = (SELECT id FROM gutachter_termine x WHERE x.claim_id = f.claim_id ORDER BY x.start_zeit DESC NULLS LAST LIMIT 1);
```

## 4 · Views (PR1)

Live-Audit (`pg_get_viewdef`) welche Views eine der 25 Spalten exponieren (Kandidat: `besichtigungsort_*` via `v_faelle_mit_aktuellem_termin`/`faelle_sv_view`). Treffer via LATERAL-Join auf den aktuellen Termin re-pointen (SP-H-Muster). **Abhängigkeit:** SP-G2 PR2 (#1525) hat `v_faelle_mit_aktuellem_termin` + `v_claim_timeline` bereits auf `gt.claim_id` re-keyed (live appliziert). SP-D-View-Repoints müssen auf der **post-PR2-Def** aufsetzen → SP-D-View-Migration erst nachdem PR2 auf staging gemergt ist (sonst git-Def-Drift), bzw. SP-D-Branch auf PR2 rebasen. Reine ADD/Backfill-Schritte sind davon unabhängig.

## 5 · PR-Struktur (3 PRs, SP-H-Muster)

- **PR1** — additive Migration: `ADD COLUMN` (≈23) auf `gutachter_termine` + UPDATE-Backfill (aktueller Termin) + View-Repoints (gated auf PR2-staging). Typen/Defaults live gemessen.
- **PR2** — Reader/Writer-Sweep (paren-balanced, `scripts/cmm44-spd-grep.mjs`): `faelle`-seitige Zugriffe der 25 Spalten auf `gutachter_termine` (aktueller Termin via `order('start_zeit desc').limit(1)`, Array-Normalisierung). Die 2 (+ ggf. mehr) DUP-Spalten → bestehende GT-Spalte. Kein Dual-Write.
- **PR3** — idempotenter COALESCE-Catch-up-Backfill.

Sequencing: PR1 additiv jederzeit (View-Block nach PR2-staging). PR2 nach PR1-staging-Merge (Reader-Sweep braucht regen. Types). PR3 nach PR2-main-Release.

## 6 · Non-Goals (YAGNI)
- **Keine** Konfrontation-als-eigener-Termin-Row-Modellierung (nachbesichtigung_* bleiben Spalten) — späteres Refactor.
- **Kein** per-Spalten-Drop an `faelle` — additiv, faelle stirbt in Phase 6.
- **Keine** RLS-Policy-Umstellung. **Keine** flächige `fall_id`-Entfernung aus Termin-Readern.
- **Keine** Migration der bereits-auf-GT-existierenden Termin-Daten-Flows (SP-D betrifft nur die 25 faelle-Spalten).

## 7 · Verifikation
- Live `information_schema`-Recheck vor Migration ([[feedback_information_schema_check]]).
- Werte-Konsistenz der 2 klaren DUP (faelle vs GT-twin) live prüfen vor Reader-Switch.
- Paren-balanced Re-Grep 0 live `faelle`-Zugriffe der 25 Spalten nach PR2.
- Portal-Smoke (SV-Kalender, Fallakte, Kunde-Termin, Admin-Kalender) mit Screenshot ([[feedback_post_drop_smoke]], [[feedback_smoke_screenshot_pflicht]]).

## 8 · Referenzen
- Phase-1-Mapping: `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` §3 (Termin/Nachbesichtigung-Cluster), §4 (SP-D).
- Muster: SP-H (`docs/superpowers/*/2026-05-20-cmm44-sph-auftrag-lc*`), SP-G2 (`*2026-05-21-cmm44-spg2*`).
- Lessons: feedback_information_schema_check, feedback_post_drop_smoke, feedback_kein_auto_merge, feedback_draft_pr_nicht_release_sicher.
