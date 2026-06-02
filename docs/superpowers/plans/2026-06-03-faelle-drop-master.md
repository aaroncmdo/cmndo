# `DROP TABLE faelle` — Master-Plan (einmal richtig)

**Ziel:** `faelle` aus dem Schema entfernen. **Stand 2026-06-03.** Ersetzt das Stückwerk der per-Spalte-`fall_id`-Drops.

---

## Bottom Line (die Entscheidung)

1. **Per-Spalte-`fall_id`-Drops werden GESTOPPT.** Sie liegen **nicht** auf dem kritischen Pfad — was `DROP TABLE faelle` blockt, sind die **FK-Constraints** (nicht die Spalten), die **DB-Objekte** und die **Code-Reader**. Die Column-Drops waren Kosmetik und haben am 02.06. zwei Live-Breaks + einen staging/main-Replay-Inzident produziert (Baseline-RLS/Funktions-Drift).
2. **Gewählter Weg: Full-Repoint** der faelle-Reader auf `claims` / claims-basierte Views — **deploy-safe**, dasselbe bewährte Muster wie die „b"-Repoints (die liefen sauber). Danach FK-Constraints droppen (Spalten bleiben) + `DROP TABLE faelle`.
3. **Compat-View verworfen:** `faelle.id ≠ claims.id`, child-`fall_id` hält alte faelle-ids → eine View kann die id nicht ohne Mapping-Tabelle erhalten; + 278 Spalten + INSTEAD-OF-Write-Trigger = fragil. Nicht wert.

---

## Konsolidierter Stand — was ist schon DRIN (alle gemergt, nichts in-flight)

Dies ist die **einzige Wahrheit**; ausser diesem Plan ist **nichts Drop-bezogenes mehr offen** (keine offenen cmm49/cmm74-PRs).

- **b″ Prereq DONE** — `#2233` (`v_claim_phase` +5 operative sub_phase) + `#2257` (Engine-Cursor-Re-Base): **`faelle.status` eingefroren**, Engine schreibt `claims.operative_status`; 3 Views + 26 Status-Reader auf operative_status. → Status-Cursor lebt auf `claims`.
- **„b" Reader/Writer-Repoints DONE** (deploy-safe, fall_id→claim_id, KEIN Drop): Finance/Positionen `#2285`, Call-Logs `#2290`, `email_log` `#2294`, `notification_events` `#2297`, `webhook_events` `#2299`.
- **„a" fall_id-Drops DONE** (replay-safe, live-verifiziert beim Drop): `ki_gespraeche`, `fall_summaries`, `ai_usage_log` `#2284`, `technische_probleme` `#2286`, Call-Logs (`aircall_calls`/`calls`/`matelso_calls`) `#2303` + Hotfix `#2311` (+ `link_lead_data_to_fall` Live-Fix `20260602215635`).
- **GESTOPPT:** weitere per-Spalte-`fall_id`-Drops (finance/email_log/notif Batch 2/3) — off-path, ersetzt durch diesen Plan.
- **Schema-Cursor:** `claims` = SSoT (operative_status + claim_id auf allen rekey'd Tabellen). `faelle` = 75 Rows / 278 Spalten / 40 FK — datenarm, nur noch die Hülle.

---

## Gemessener Scope (02.06., live)

| Blocker | Menge | Anmerkung |
|---|---|---|
| `from('faelle')` Code-Reader | **240** | 189 lesen / **51 schreiben** (insert/update/delete) |
| FK-Constraints → faelle | **40** | child.fall_id → faelle.id; **DROP CONSTRAINT** (Spalte bleibt) |
| Views auf faelle | **5** | `faelle_kunde_view`, `faelle_sv_view`, `v_claim_full`, `v_claim_listing`, `v_faelle_mit_aktuellem_termin` |
| Funktionen, die faelle referenzieren | **23** | inkl. `delete_fall_komplett`, `link_lead_data_to_fall`, Sync-Trigger, `can_access_fall` |
| Policies, die faelle/`can_access_fall` referenzieren | **21** | → auf `can_access_claim` umstellen |
| faelle Rows / Spalten | 75 / 278 | datenarm; Daten leben großteils auf `claims` |

**Reader-Domänen (Batch-Schnitt):** api 49 · gutachter 26 · kunde 16 · faelle 15 · admin 15 · lib/termine 12 · lib/actions 10 · lib/claims 8 · Rest ≤5.

---

## Phasen

> **P1-GATE-BEFUND (03.06.):** `v_claim_full` hat nur **48/278** faelle-Spalten (**230 fehlen**). Reader können also **nicht** einfach auf `v_claim_full` schwenken — der View deckt die Spalten nicht. → **P0 ist Pflicht-Voraussetzung vor P1.**

### P0 — Daten-Spalten-Migration — *die echte Voraussetzung (Audit 03.06. gemacht)*
**Audit-Ergebnis** der 230 in `v_claim_full` fehlenden faelle-Spalten:
- **86 sind schon auf `claims` (78) / `vehicles` (8)** → P0-easy: nur **`v_claim_full` erweitern** (Spalten in den View ziehen, keine Daten-Migration).
- **144 sind faelle-only**, davon (ohne `claim_id`=FK):
  - **~133 live-read** (im Code referenziert, ohne `database.types.ts`) → **müssen nach `claims`/`vehicles` migriert + in `v_claim_full` aufgenommen werden** (SP-A/B-Muster). *Das ist der harte Kern.*
  - **10 tot** (nur in Types/DB, kein Code-Read) → ignorieren, fallen mit `DROP TABLE` weg: `gcal_event_id, geschaetzte_fahrdistanz_km, gutachten_nummer, gutachten_stundensatz, klage_uebergeben_am, kunde_match_via, lexdrive_ocr_data, lexdrive_ocr_received_at, mietwagen_kanzlei_informiert_am, vorschaden_typ_a_ergebnis`.

**Spalten-Cluster der 133 (für Batch-Migration):** `halter_*` (9), `kunde_*` (8), `gegner_*` (4), `eskalation_tag_*` (12), `vs_quote_*`/`vs_reaktion_*`/`vs_*` (~9), `ruege_*` (6), `nachbesichtigung_*` (10), `sv_briefing_*` (6), `technische_stellungnahme_*` (5), `gutachten_*`/`anschlussschreiben_*`/`as_*`/`mietwagen_*`/`ki_*`/`fahrzeug_*`/`kennzeichen_*`/`source_*`/`zahlung_*`/`auszahlung_*` + Einzelne.
→ **Pro Cluster:** existiert die Spalte schon auf claims unter anderem Namen? Sonst `ADD COLUMN` auf claims + Backfill aus faelle + in `v_claim_full`. Erst wenn alle live-read-Spalten in `v_claim_full` sind, ist P1 mechanisch.

> **Realismus:** ~133 Spalten-Migration ist KEIN Quick-Win — mehrere fokussierte Sessions. Erst hier ist klar wie groß: der faelle-DROP ist ein Daten-Architektur-Projekt, nicht ein Reader-Repoint.

### P1 — Reader-Repoint (240 Sites) — *der Bulk, deploy-safe (NACH P0)*
`from('faelle')` → `from('claims')` bzw. `from('v_claim_full')` (presented die faelle-Daten claim-seitig). Pro Domäne ein PR (Batch-Schnitt oben), **parallel via Subagenten** wie bei „b". Writes (51) → `claims` (Split-Logik `splitOrKeepFaelleUpdate` existiert). **Kein Schema-Change** → deploy-safe, kein Replay-Risiko. tsc-Gate genügt.
- Reihenfolge: lib/* zuerst (shared Reader), dann app/* Portale.
- Ein Reader-Batch = ein PR, gegen staging, normaler „b"-Flow.

### P2 — DB-Objekte faelle-frei machen — *sorgfältig, getrackt*
- **5 Views** → auf `claims`/`vehicles` umschreiben (v_claim_full/v_claim_listing sollen ohnehin SSoT sein; faelle_kunde_view/faelle_sv_view/v_faelle_mit_aktuellem_termin repointen).
- **23 Funktionen** → faelle-Referenzen auf `claims` (z.B. `delete_fall_komplett` schon claim-fähig; `link_lead_data_to_fall` Rest-Zeilen; Sync-Trigger claims↔faelle werden **moot** und entfallen).
- **21 Policies** → `can_access_fall(fall_id)` → `can_access_claim(claim_id)`.
- Jede getrackte Migration **idempotent** + **Fresh-Replay-Preview-grün** (siehe Regeln).

### P3 — FK-Cutover + DROP — *Finale, eine Migration*
- **40 FK-Constraints droppen** (`ALTER TABLE child DROP CONSTRAINT <child>_fall_id_fkey`) — Spalten bleiben als verwaiste uuids (kosmetisch später entfernbar, **nicht** Pflicht).
- Letzte faelle-Referenzen (Sync-Trigger, Defaults) entfernen.
- `DROP TABLE public.faelle;`
- **Post-Drop-Portal-Smoke** (Public/Admin/Kunde/SV) — Pflicht.

### P4 (optional, später) — Kosmetik
Verwaiste child.`fall_id`-Spalten + die 278 faelle-Spalten sind mit dem Table-Drop weg; übrige `fall_id`-Spalten auf nicht-FK-Tabellen nach Bedarf.

---

## Harte Regeln (aus den 02.06.-Inzidenten)

1. **Eine Drop-Migration NIE mergebar machen, solange der Supabase-Preview nicht GRÜN ist.** #2303 wurde build-grün mit Preview-rot/unvalidiert früh-gemergt → staging+main-Replay kaputt (#2261-Wiederholung). **Konsequenz:** Drop-PRs als **Draft** öffnen, erst auf grünem **Fresh-Replay** (frischer Branch, kein Edit-Skip) auf „ready" setzen.
2. **Baseline-Objekt-Dependency-Audit vor jedem faelle-Touch:** nicht nur Objekte ON der Tabelle, sondern **cross-table-Policies** (`pg_policy` wo expr `\mfaelle\M`) **und Funktionen mit statischem SQL** (`pg_proc.prosrc`). `pol=0`-LIVE ≠ replay-safe (untracked Baseline-Repoints).
3. **Eine fokussierte, koordinierte Session** für P2+P3 — **nicht** interleaved mit Live-rel-Wellen + parallelen Sessions (das hat den Mess gemacht). P1 (deploy-safe) darf parallel laufen.
4. **Geteilte prod+staging-DB:** Schema-Drop trifft Prod sofort → erst Reader/DB-Objekte in **Prod (main)**, dann droppen.

---

## Ehrliche Aufwandsschätzung
- **P1 (240 Reader):** der Löwenanteil; parallel-batchbar, jeder Batch sicher. Mehrere fokussierte Sessions, aber **null Replay-Risiko**.
- **P2 (49 DB-Objekte):** ~1–2 Sessions, sorgfältig, Preview-gated.
- **P3 (FK-Drop + DROP TABLE):** 1 Session, 1 Migration, Fresh-Replay-gated + Portal-Smoke.

Kein 10-Minuten-Drop — aber **jeder Schritt sicher**, und der Weg konvergiert garantiert (anders als das per-Spalte-Hauen).

---

## Nächster konkreter Schritt
**P1 starten:** erster Reader-Batch `lib/*` (shared Reader zuerst), parallel via Subagenten, je Domäne ein deploy-safer PR. Das ist sofort produktiv + risikofrei und baut den 240er-Berg ab.
