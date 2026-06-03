# faelle-Drop Runway — Live-Revalidierung (01.06.2026)

**Owner:** Track-1-Lane (Session cmm-49-t1-2-cutover). Ergänzt Master-Plan #2118 (Phasen A-G) mit der **Live-Wahrheit + de-driftetem Status**. Grund: CMM-49 + CMM-66 standen fälschlich auf „Done"; vor dem Treiben einer DROP-Runway muss der Stand gegen die Live-DB stimmen (Lesson T1.1c — auf Annahmen bauen = Prod-Breaker).

## 1. Live-Stand (01.06., gemessen — paizkjajbuxxksdoycev)
- **faelle: 75 Rows** → CMM-49 ist **NICHT** done (Linear-„Done" = Release-PR-Artefakt).
- **47 FK-Constraints** zeigen noch auf `faelle.id` (alte `fall_id`-FKs leben neben den additiven `claim_id`-FKs aus dem Re-Key).
- **5 Views** hängen an faelle: `v_claim_listing`, `faelle_sv_view`, `faelle_kunde_view`, `v_claim_full`, `v_faelle_mit_aktuellem_termin`.
- **Code: 421 `.from('faelle')` in 223 Files, davon 32 Writes** (~389 Reads).

## 2. Kernbefund: KEIN sauberer Freebie — `fall_id` ist load-bearing
`v_claim_listing` schien „pure re-base" (zieht nur `claim_id`+`id` aus faelle). Aber `f.id AS fall_id` trägt Last:
- **admin-Kanban** (`admin/faelle/(hub)/page.tsx`): `fall_id` = Detail-Link-ID **+** Join-Key zu `kanzlei_faelle` / Message-Reads / Unread-Counts; der Kanban **filtert Rows ohne `fall_id` raus** (Z.243).
- **/faelle** (`faelle/page.tsx`): `linkId = r.fall_id ?? r.claim_id`.

→ faelle-Join entfernen ⇒ **Kanban bricht**. Das hängt am **fall_id-Tod (Phase E)**: Detail-Route `/faelle/[id]` + die `fall_id`-Joins + der Kanban-Filter müssen erst auf `claim_id`. **`fall_id` ist der Spine der Epic** — quer durch Routing + Sub-Entity-Joins + viele der 389 Reader gewoben.

## 3. Per-View-Blocker (gemessen via `view_column_usage`)
| View | # faelle-Spalten | echter Blocker |
|---|---|---|
| `v_claim_listing` | 2 (`claim_id`, `id`→`fall_id`) | **nur fall_id-Tod** |
| `faelle_sv_view` | 9 | fall_id + `kunde_id`/`status`-Repoint (Homes da: geschaedigter_user_id / Derivat) |
| `faelle_kunde_view` | 11 | + `auszahlung_kunde_*` (**kein Home**) |
| `v_claim_full` | 13 | + `gegner_*`, `organisation_id`, `dispatch_id` (**kein Home**) |
| `v_faelle_mit_aktuellem_termin` | **53** | das Monster: `halter_*`, `gegner_*`, `fin_*`, `bank_name`, `leasinggeber`, `source_*`, geo |

## 4. Homing-Status (live, name-mapping-bereinigt)
**Home existiert (Repoint genügt):** `kunde_id`→`claims.geschaedigter_user_id`, `sv_id`→`claims.sv_id` (CMM-60), `fahrzeug_*`/`kennzeichen`→`vehicles` (CMM-50), `ust_id`/`firma_name`→`claim_parties.ust_id`/`firma`, `ist_fahrzeughalter`→`claim_parties.ist_halter`, `leasinggeber_name`→`claims`, `status`→Derivat/`claims.status`.

**Echte Homing-Löcher (kein Ziel, brauchen ADD/Sub-Entity + Backfill):** `gegner_*` (6 — Struktur `claim_parties` rolle=verursacher da, Daten nicht), `halter_*`-Adresse/Kontakt (CMM-67, 75 Rows Daten da), `organisation_id`, `dispatch_id`, `auszahlung_kunde_betrag`/`_eingegangen_am`, `bank_name`, `zahlung_erwartet_am`, `kunde_lat`/`lng`, `source_channel`/`domain`, `konvertiert_am`.

→ **Mehrere „Done"-Tickets (CMM-63/64/65) haben ihre Spalten NICHT gehomed** — Drift bestätigt, per-Domäne nachzuziehen.

## 5. Sichere Reihenfolge (de-driftet, gegen Live-Stand)
- **A — Homing-Löcher schließen** (additiv, pro Domäne EXCEPT-0/0): `gegner_*`→claim_parties · `halter_*`→claim_parties (CMM-67) · `organisation_id`/`dispatch_id`/`auszahlung_kunde_*`/`bank_name`/geo/`source_*`→claims-Spalten.
- **B — 5 Views faelle-frei** (CMM-66 T2): pro View, sobald seine Spalten gehomed sind. `v_claim_listing` braucht nur C.
- **C — fall_id-Tod (Phase E, der Spine):** Detail-Route `/faelle/[id]`→`claim_id` (CMM-28) + `fall_id`-Joins (`kanzlei_faelle`/Messages/Uploads) auf `claim_id` + Kanban-Filter. Entsperrt `v_claim_listing` + viele Reader.
- **D — Reader/Writer-Sweep** (389/32) auf claims/Views.
- **E — b″ Engine-Cutover (CMM-74)** + `v_claim_phase` operative `sub_phase`.
- **F — 47 FKs entfernen + RLS-Reste + Trigger.**
- **G — `DROP TABLE faelle CASCADE`** (Aaron-gated, voller Portal-Smoke).

## 6. Strategische Realität (Aaron-Entscheidung nötig)
Die Epic **kollidiert strukturell mit den 8 aktiven Sessions** (AAR-939 = parties/leads/Fallakte, chat-inbox = nachrichten, termin-engine = `v_claim_phase`/Views). Solo zum DROP treiben parallel dazu = Dauer-Kollision + Prod-Breaker-Risiko. Drei Modi:
1. **Inkrementell-koordiniert** — isolierte/additive Bricks zuerst, geteilte Flächen pro Stück abgesprochen. Langsam, sicher, kein Freeze.
2. **Fokus-Fenster** — faelle-nahe Feature-Arbeit kurz einfrieren, Drop in einem konzentrierten Push.
3. **Verteilt** — Homing-Pieces an die Domänen-Sessions (gegner→939 etc.), ich sequenziere + gate G.

## 7. Erster ausführbarer Brick (Vorschlag)
Additiv + isoliert + entsperrt mehrere Views, niedrigste Kollision:
- **`gegner_*` → `claim_parties` (rolle=verursacher)** Homing — Struktur existiert, nur Daten-Backfill (75 Rows) + View-Repoint-Vorbereitung. Entsperrt `v_claim_full` + `vfat`. Pattern: claim_parties-Row pro Claim mit rolle=verursacher + Snapshot, EXCEPT-0/0.
- Alternativ **CMM-67 halter** (gleiche Mechanik, 75 Rows Daten da).

**fall_id-Tod (C) ist der größte Einzel-Unlock, aber cross-cutting (Route+Joins+Kanban) → braucht Koordination mit der Fallakte-/939-Lane, nicht als kalter Solo-Start.**
