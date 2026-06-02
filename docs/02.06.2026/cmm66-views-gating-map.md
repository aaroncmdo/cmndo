# CMM-66 — Views-faelle-frei: De-Drift-Map + Gate-Analyse (02.06.2026)

> **Befund (korrigiert das Handoff-Label "CMM-66 🟢 jetzt baubar"):** Die CMM-66-Views sind der **Konvergenz-Sink** fast aller gated CMM-44/49-Arbeit. **Kein einziger der Views ist heute faelle-frei machbar** — das universelle Gate ist **PC-1 (`fall_id`-Identity)**, das jeden Treiber/Filter/Link betrifft. Diese Doc klassifiziert pro View jede verbliebene `faelle`-Referenz und mappt sie auf ihr Gate.

Quelle: Live-DB (`paizkjajbuxxksdoycev`, geteilt staging+prod) + Consumer-Grep auf `origin/staging`-HEAD, 02.06.2026. Branch `kitta/cmm-66-teil2-views` (off `kitta/cmm-66-view-rebase`).

---

## 0. Live-Stand

- **6 Views referenzieren `faelle`:** `faelle_kunde_view`, `faelle_sv_view`, `v_claim_full`, `v_claim_listing`, **`v_claim_phase`**, `v_faelle_mit_aktuellem_termin`.
- **`v_claim_phase` gehört NICHT zu CMM-66** — es ist die **Termin-Engine-Lane** (b″-Prereq, liefert die 5 operativen `sub_phase`; §4 Handoff). Das erklärt "5 Views" (Handoff) vs. 6 live. → **koordinieren, nicht in CMM-66 anfassen.**
- `faelle`: **75 Rows · 47 eingehende FKs · 12 ausgehende FKs**, **faelle_ohne_claim = 0** (jede faelle-Row hat `claim_id`).

---

## 1. Gate-Klassen (warum kein View frei wird)

| Gate | Spalte(n) | Owner-Ticket/Lane | Warum blockiert |
|---|---|---|---|
| **PC-1 / CMM-28** (UNIVERSAL) | `f.id` → `fall_id` bzw. View-`id` | Phase-C-Plan #2204, **939-Lane** (Fallakte-Route) | claims hat nur claim-`id`, **kein** faelle-Identity-Home. Consumer **filtern** (`.eq('id', fallId)`), **verlinken** (`/faelle/${fallId}`) und haben FKs (`reklamationen.fall_id`) darauf. Bis die Admin-Route `/faelle/[id]` claim_id akzeptiert (PC-1) bleibt `fall_id` load-bearing. |
| **b″ / CMM-74** | `f.status` | Track-1 + Termin-Engine | `claims.status` = neues Terminal-Vokabular, **lossy** aus operativem `fall.status` (13 Werte → null). Kein Rekonstruktions-Home bis `v_claim_phase.sub_phase` die operative Granularität hat. |
| **CMM-67** | `f.halter_*` (9 Spalten), `f.ust_id`, `f.firma_name`, `f.ist_fahrzeughalter` | CMM-67, **939-Lane** (parteien) | Home = `claim_parties` (hat `ist_halter`/`ust_id`/`firma`/Adresse), aber Halter-Snapshot-Relocate ist Backlog ("Daten sparse"). |
| **CMM-63-Rest** | `f.kunde_id` | CMM-63 | claims hat **kein** `kunde_id` (Home = `geschaedigter_user_id`/`claim_parties`). **Caveat: 1-Row-Delta** faelle.kunde_id ≠ geschaedigter_user_id (Handoff-Lektion) → pro Read prüfen. |
| **CMM-50-Backfill** | `COALESCE(veh.*, f.<legacy>)`-Fallbacks: `kennzeichen`, `fahrzeug_hersteller/modell/baujahr/typ/farbe/ausstattung`, `fin_quelle/fin_extrahiert_am`, `erstzulassung`, `kilometerstand`, `hsn`, `tsn`, `fin_vin`, `lackfarbe_code` | CMM-50 (Done, **aber Backfill+Cutover offen**) | De-fangen zu `veh.x` nur sicher wenn `veh.x` für **alle** Rows non-null wo `f.x` gesetzt (sonst Nullt der Drop Werte). CMM-50-Memory: "Verbleibt Backfill + harter Cutover". |
| **KEIN TICKET** (Entscheidung offen) | siehe §3 | — | faelle-only Spalten **ohne** claims-Home **und ohne** Relocate-Ticket. |

---

## 2. Per-View-Klassifikation (verbliebene `faelle`-Refs nach diesem Session-Repoint)

> Output-Spaltenname → Quelle. Nur noch `f.`-Refs gelistet (alles andere kommt schon aus `c`/`kf`/`veh`/`vcp`/Lateral).

### `v_claim_listing` (FROM claims c LEFT JOIN faelle f) — **am nächsten dran**
- `fall_id` ← `f.id` → **PC-1** *(EINZIGE faelle-Ref!)* — consumed: `/faelle` + `admin/faelle (hub)` Routing.
- ⇒ **Sobald PC-1 durch ist, ist v_claim_listing mit EINEM Repoint frei** (fall_id → claim_id-Link). Bester erster "echt-frei"-Kandidat.

### `v_claim_full` (FROM claims c LEFT JOIN faelle f)
- `fall_id` ← `f.id` → **PC-1** (consumed: `mitarbeiter/reklamationen` [FK `reklamationen.fall_id`], `mitarbeiter/performance`, `mitarbeiter/faelle`).
- `fall_status` ← `f.status` → **DROPPBAR JETZT** (0 Consumer, grep `fall_status` = 0 Treffer). *Removal braucht DROP+CREATE (Spalten-Removal), darum hier dokumentiert statt blind auf prod gedroppt.*
- `fall_created_at` ← `f.created_at` → consumed (`.select('… fall_created_at …')` in team/performance). claims hat `created_at` — **Delta-Verdacht** (faelle vs claims created_at), vor Repoint EXCEPT prüfen.
- `gegner_anzahl_beteiligte`, `gegner_fahrzeugtyp`, `organisation_id`, `dispatch_id` ← `f.*` → **§3 (kein Ticket)**.
- `kunde_id` ← `f.kunde_id` → **CMM-63**.
- veh-COALESCE-Fallbacks → **CMM-50**.

### `faelle_kunde_view` / `faelle_sv_view` (FROM faelle f) — security_invoker-Status s. §5
- `id` ← `f.id` → **PC-1** (consumed: `.eq('id', fallId)` in kunde/nachbesichtigung + kunde/faelle/[id]).
- `status` ← `f.status` → **b″** (Consumption pro View noch zu bestätigen).
- `kunde_id` ← `f.kunde_id` → **CMM-63**.
- `auszahlung_kunde_betrag`, `auszahlung_kunde_eingegangen_am` (nur kunde_view) ← `f.*` → **§3**.
- veh-COALESCE-Fallbacks → **CMM-50**.

### `v_faelle_mit_aktuellem_termin` (FROM faelle f) — breiteste faelle-Fläche
- `id` ← `f.id`, `lead_id` ← `f.lead_id` (claims.lead_id **2/76-Delta** → nicht 0-äquiv.) → **PC-1**.
- `status` ← `f.status` → **b″**. `kunde_id` ← `f.kunde_id` → **CMM-63**.
- `halter_*` (9), `ust_id`, `firma_name`, `ist_fahrzeughalter` ← `f.*` → **CMM-67**.
- `gegner_name/versicherung/kennzeichen/anzahl_beteiligte/fahrzeugtyp/versicherung_anfrage_datum`, `dispatch_id`, `organisation_id`, `source_channel/domain`, `konvertiert_am`, `kunde_lat/lng`, `zahlung_erwartet_am`, `mietwagen_kanzlei_informiert(_am)`, `bank_name`, `auszahlung_kunde_betrag/eingegangen_am` ← `f.*` → **§3 (kein Ticket)**.
- `claim_id` ← `f.claim_id` → **trivial repointbar** zu `c.id` (Join-Key, `c.id = f.claim_id` per Definition). Mini-Boy-Scout.
- veh-COALESCE-Fallbacks (viele) → **CMM-50**.

---

## 3. ⚠️ Unticketed faelle-only-Cluster (Entscheidung @aaron)

Diese Spalten haben **weder claims-Home noch Relocate-Ticket**. Für den Drop muss je Spalte entschieden werden: **(a) aus den Views droppen** (wenn unconsumed) **oder (b) Home schaffen** (claims-Spalte + Backfill, oder claim_parties).

| Spalte(n) | Views | Consumption-Indiz (Grep) | Empfehlung |
|---|---|---|---|
| `gegner_name`, `gegner_versicherung`, `gegner_kennzeichen`, `gegner_anzahl_beteiligte`, `gegner_fahrzeugtyp`, `gegner_versicherung_anfrage_datum` | v_full, v_faelle | Grep zeigt nur **Writes** (leads/flow-wizard), keine View-Reads | wahrsch. **droppbar**; Gegner-Daten leben in `claim_parties` (rolle=gegner) — ggf. später dort |
| `dispatch_id`, `organisation_id`, `source_channel`, `source_domain` | v_full, v_faelle | nur Writes/Fremd-Tabellen | **droppbar** (confirm) — oder claims-Home falls Reporting sie braucht |
| `konvertiert_am`, `kunde_lat`, `kunde_lng`, `zahlung_erwartet_am`, `mietwagen_kanzlei_informiert(_am)`, `bank_name`, `auszahlung_kunde_betrag`, `auszahlung_kunde_eingegangen_am` | v_full/v_faelle/kunde_view | gemischt — **pro Spalte Grep nötig** | **TBD**: View-Read-Audit vor Drop |

**Nächster sicherer Schritt (non-gated, read-only):** Pro Cluster-Spalte Consumer-Grep gegen die `.select('*')`-Consumer (`ai-actions` v_faelle, `dispatch/leads` v_full) → bestätigte-unconsumed-Liste. Dann beim eigentlichen View-Rebase (DROP+CREATE) mitdroppen.

---

## 4. Was diese Session getan hat

- **`sv_id`-Repoint** `f.sv_id` → `c.sv_id` in `faelle_kunde_view`, `faelle_sv_view`, `v_faelle_mit_aktuellem_termin` (Migration `20260602063253`). Setzt `9d28d3478` (v_claim_full) fort. **Danach liest KEIN View mehr `faelle.sv_id`** (`views_still_f_sv_id = 0`).
  - Parität: `f.sv_id IS DISTINCT FROM c.sv_id` = **0** (75/75). Post-Verify: `md5(array_agg(view.* ORDER BY id))` **pre==post** je View (byte-identisch).
  - Methode: `CREATE OR REPLACE` via `pg_get_viewdef + replace` (transkriptionssicher, erhält Grants/security_invoker).
- **Diese De-Drift-Map** (korrigiert "🟢 jetzt baubar").

---

## 5. Follow-up-Audit (Sicherheit, nicht in CMM-66-Scope)

`faelle_kunde_view`/`faelle_sv_view` haben `reloptions = null` ⇒ **security_invoker default = false** (Definer-Semantik, läuft mit View-Owner-Rechten, **erbt NICHT** die Kunde/SV-RLS). Code-Kommentare behaupten aber "security_invoker → erbt faelle-RLS". **Diskrepanz** → separat verifizieren: Schützt der jeweilige Route-Filter (`.eq('id', autorisierter fallId)` / `.eq('kunde_id', user.id)`) ausreichend, oder ist es ein Read-Leak? Nicht in diesem Repoint geändert (Security-Modell unangetastet).

---

## 6. Empfohlene Sequenz zum DROP (Views-Seite)

1. **PC-1** (Admin-Route claim_id accept-both) — entsperrt `fall_id` in **allen** Views. *Danach:* `v_claim_listing` mit 1 Repoint frei.
2. **b″/CMM-74** (operative `sub_phase` in `v_claim_phase`) — entsperrt `f.status`; ausserdem `fall_status` droppen (schon 0 Consumer).
3. **CMM-67** (Halter/Firma → claim_parties) — entsperrt `v_faelle` Halter-Block.
4. **§3-Cluster-Entscheidung** (drop vs Home) — parallel, non-gated Read-Audit jetzt machbar.
5. **CMM-50-Backfill-Cutover** — de-fang veh-COALESCE.
6. **CMM-63-Rest** (`kunde_id`, 1-Delta).
7. Dann: 5 Views faelle-frei (DROP+CREATE je View, SECDEF/Grant-Restore, Pre/Post-Parität) → entsperrt `DROP TABLE faelle CASCADE` (Phase F+G).
