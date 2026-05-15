# Claim-SSoT-Vollmigration — Audit & Umstellungsstrategie

**Datum:** 2026-05-16
**Status:** Strategie-Entwurf — zur Abstimmung
**Beschluss-Anlass:** `faelle` soll **komplett wegfallen**. Bisher war geplant, `faelle` als schlanke Assignment-Tabelle zu behalten (`claim-as-ssot-umbau.md`, 27.04.) — dieser Plan ist hiermit überholt.

---

## 1 · Beschluss & Ziel-Architektur

### Was sich ändert

Bisherige Linie (`claim-as-ssot-umbau.md`): `claims` wird SSoT, `faelle` schrumpft auf ~6 Assignment-Spalten und bleibt als Bridge bestehen.

**Neuer Beschluss (16.05.2026):** `faelle` wird **vollständig entfernt**. Es gibt keine Backfill-/Bridge-Tabelle mehr. Auslöser: Es wurden bereits so viele `faelle`-Spalten gedroppt (Cluster-Arbeit + PR #1322), dass der Zwitter-Zustand mehr Bugs produziert als er Sicherheit gibt (siehe `cmm-48-writer-stellen-audit.md` §0 — 2 Prod-Bugs allein aus übersehenen Writern).

### Ziel-Datenmodell — `claim` als Rückgrat eines sequenziellen Lifecycles

```
  LEAD                CLAIM ──────────────────────────────────────────────┐
  (leads-Tabelle)     (claims-Tabelle = SSoT)                              │
  pre-claim,          │                                                   │
  Dispatcher-Welt     ├─ Auftrag-Lifecycle                                 │
       │              │    Besichtigungstermin → Gutachten-Upload          │
       │  Konversion   │    → QC → Übergabe an Kanzlei                       │
       └─────────────▶│                                                   │
                      └─ Kanzleifall-Lifecycle                             │
                           (beginnt mit der Kanzlei-Übergabe)              │
                                                                           │
  Stepper-UI zeigt durchgehend: wo steht der Claim + wo steht jeder ───────┘
  einzelne Lifecycle (Auftrag-LC, Kanzleifall-LC). Diese Stepper EXISTIEREN
  bereits — die Lifecycle-Repräsentation muss nicht neu entworfen werden.
```

**Tabellen-Rollen im Zielbild:**

| Konzept | Tabelle | Rolle |
|---|---|---|
| Lead | `leads` | Bleibt eigene Tabelle — Pre-Claim-Phase (Dispatcher-Welt). Konvertiert IN den Claim. |
| Claim | `claims` | **SSoT.** Trägt Stammdaten, Status, Phase, alle Lifecycle-Zeiger. |
| Besichtigungstermin | `gutachter_termine` | Sub-Tabelle des Auftrag-LC. **Hängt heute noch an `faelle.id` → muss auf `claim_id`.** |
| Auftrag-Lifecycle | `auftraege` | Sub-Tabelle. Hat bereits `claim_id`-FK. Termin→Gutachten→QC→Übergabe. |
| Kanzleifall-Lifecycle | `kanzlei_faelle` | Sub-Tabelle. Hat bereits `claim_id`-FK. Beginnt bei Kanzlei-Übergabe. |
| Gutachten-Werte | `gutachten` | Sub-Tabelle (F+G-Cluster, RPC `apply_gutachten_ocr`). |
| Beteiligte | `claim_parties` | Sub-Tabelle (aktiv). |

`faelle` taucht in diesem Bild **nicht mehr auf**.

---

## 2 · Audit-Konsolidierung — was schon bekannt ist

Bestehende Audits (alle gelesen + konsolidiert, 16.05.):

| Doc | Kernergebnis |
|---|---|
| `14.05/.../CLAIMS-VERTIKAL-AUDIT.md` | 12 Cluster A–L; Drop-Verdikte; `claim_parties` aktiv, `gutachten` Greenfield |
| `14.05/.../VERTIKAL-AUDIT.md` | `leads`: 17 tote Spalten + Drift-Bugs (kunde_*-Adresse, halter_*-Race) |
| `14.05/.../CLAIMS-BEFUND.md` | `claims` 133 Spalten, nur 6 gefüllt — 0-Coverage ≠ tot (Lifecycle-Phase) |
| `15.05/claims-horizontal-audit.md` | `claims` 119 Spalten, 10 Befunde A1–A10, bidir. Sync 40/38 |
| `15.05/claims-cleanup-handoff.md` | 8 PRs live; A2/A5/A9 erledigt; Cluster C+L gedroppt |
| `15.05/claims-status-phase-reader-audit.md` | `status` vs `phase` = bewusste Trennung, beide behalten |
| `11.05/db-backend-frontend-claim-audit.md` | Bidir. Sync-Trigger Drift-Risiko; `auftraege`-Updates propagieren nicht |
| `16.05/cmm-48-writer-stellen-audit.md` | 101 `faelle`-Writer: 84 Workflow / 1 Duplikat / 13 Mixed / **3 kaputt** |

**Verworfen / überholt:** `claim-as-ssot-umbau.md` (Assignment-Tabellen-Linie), `claims-a1-gutachten-cleanup-plan.md`, `claims-cluster-c-l-quick-drops-plan.md` (beide bereits mit OBSOLET-Marker).

### Live-Kennzahlen (empirisch verifiziert wo möglich)

| Kennzahl | Wert | Quelle / Stand |
|---|---:|---|
| `faelle` Spalten | **341** | `probe-faelle-schema.mjs`, 16.05. — verifiziert |
| `claims` Spalten | ~78–119 | 15.05-Audit (119) minus F+G-#1322-Drops (−41) — **live nachzumessen** |
| Sync-Duplikat-Spalten | 34 | aus Sync-Trigger-Def, post-#1322 |
| `faelle`-Writer-Call-Sites | 101 | CMM-48-Audit |
| `claims`-Reads | ~506 | Memory `cmm_phase_24_finishing` |
| `claims`-Writes | ~54 | Memory `cmm_phase_24_finishing` |
| `auftraege` Spalten | ? | **nicht auditiert** |
| `kanzlei_faelle` Spalten | ? | **nicht auditiert** |
| `gutachter_termine` Spalten | ? | **nicht auditiert** |

> Supabase hatte am 16.05. ~23:00 anhaltende Cloudflare-522er — die Live-Probe von `claims`/`auftraege`/`kanzlei_faelle`/`gutachter_termine` muss nachgeholt werden (`scripts/probe-claims-schema.mjs` liegt bereit).

---

## 3 · Gap-Analyse — was für `faelle`-Vollwegfall fehlt

### 3.1 Die 341 `faelle`-Spalten brauchen ein Zuhause

Jede `faelle`-Spalte muss in eine von vier Kategorien fallen:

1. **→ `claims`** (Stammdaten/Status/Phase, claim-global) — Großteil
2. **→ Lifecycle-Sub-Tabelle** (`auftraege` / `kanzlei_faelle` / `gutachter_termine` / `gutachten`) — Werte die zu einer Lifecycle-Stufe gehören
3. **→ bereits dort** (eine der 34 Duplikat-Spalten, oder schon auf claims)
4. **→ DROP** (tot, kein Reader/Writer)

Aktuell ist nur die Duplikat-Menge (34) sicher zugeordnet. Die übrigen ~307 `faelle`-Spalten sind **nicht klassifiziert** gegen das neue Zielmodell. Das ist die zentrale offene Audit-Arbeit.

### 3.2 Die 3 Lifecycle-Tabellen sind nicht spaltengenau auditiert

`auftraege`, `kanzlei_faelle`, `gutachter_termine` brauchen je ein Writer-/Reader-/Spalten-Audit analog `cmm-48-writer-stellen-audit.md`, damit klar ist:
- Welche `faelle`-Spalten gehören semantisch in welche Lifecycle-Tabelle?
- Schreiben/lesen diese Tabellen schon `claim_id`-konsistent?

### 3.3 `gutachter_termine` hängt an `faelle.id`

Voraussetzung für den Auftrag-Lifecycle: `gutachter_termine` muss von `fall_id` auf `claim_id` umgezogen werden (FK + alle Reader/Writer + die View `v_faelle_mit_aktuellem_termin`).

### 3.4 Lead-Konzept

`leads` bleibt eine eigene Tabelle (Pre-Claim, Dispatcher-Welt) — der „Lead-Lifecycle in claims" bedeutet **nicht** `leads` in `claims` zu mergen, sondern dass der Claim-Stepper die Lead-Herkunft + Konversion sichtbar macht. `leads.konvertiert_zu_claim_id` ist bereits der SSoT-Zeiger; `konvertiert_zu_fall_id` (Legacy) wird beim `faelle`-Drop mit entfernt (~5 Reader umstellen).

### 3.5 INSERT-Zeit-Sync-Lücke

Die Sync-Trigger sind `AFTER UPDATE` — greifen nicht bei INSERT (siehe `cmm-48-writer-stellen-audit.md` §5). Solange `faelle` und `claims` parallel existieren, muss jeder neue Claim-/Fall-INSERT beide konsistent befüllen. Beim `faelle`-Drop entfällt das Problem — aber bis dahin ist es eine Bug-Quelle.

### 3.6 Akute Prod-Bugs (blockierend)

`CMM-53` + `CMM-54` (Urgent) — 2 Writer schreiben bereits jetzt auf gedroppte `faelle`-Spalten. Müssen VOR der Vollmigration gefixt sein, sonst wird der Fehler beim Weiter-Droppen nur größer.

---

## 4 · Umstellungsstrategie

Leitprinzip: **claims-first, faelle stirbt zuletzt.** Erst alle Daten + Reader + Writer auf `claims`/Sub-Tabellen, dann Sync-Trigger weg, dann `faelle` DROP. Kein Big-Bang — Subsystem-weise, jede Stufe einzeln deploybar + smoke-bar.

### Phase 0 — Stabilisieren (sofort)
- **CMM-53 / CMM-54** Prod-Bugs fixen (Writes auf gedroppte Spalten).
- `scripts/probe-claims-schema.mjs` nachziehen sobald Supabase erreichbar → exakte Spaltenzahlen.

### Phase 1 — Vollständiges Spalten-Mapping-Audit
- Jede der 341 `faelle`-Spalten klassifizieren: → claims / → Sub-Tabelle / → bereits dort / → DROP.
- Spaltengenaues Audit von `auftraege`, `kanzlei_faelle`, `gutachter_termine` (Writer/Reader/Coverage).
- Ergebnis: Mapping-Tabelle als Migrations-Blueprint.

### Phase 2 — `gutachter_termine` auf `claim_id`
- FK-Umzug `fall_id` → `claim_id`, Reader/Writer + `v_faelle_mit_aktuellem_termin` nachziehen.
- Voraussetzung für den Auftrag-Lifecycle.

### Phase 3 — Writer-Migration (läuft als CMM-48)
- Die 14 migrationspflichtigen `faelle`-Writer auf `claims`/Sub-Tabellen umstellen (PR-A..F aus `cmm-48-writer-stellen-audit.md`).
- Workflow-Spalten die heute faelle-only sind: nach `claims` oder passende Sub-Tabelle ziehen.

### Phase 4 — Reader-Migration
- Die ~506 `claims`-Reads sind teils schon claims-nativ; die verbleibenden `faelle`-Reader auf `claims`/Views (`v_claim_full`, `v_claim_listing`) umstellen.
- Pro Portal (Kunde/SV/KB/Admin/Kanzlei) ein Reader-Sweep + Smoke.

### Phase 5 — Sync-Trigger abschalten
- Wenn kein Code mehr `faelle` schreibt/liest: `trg_sync_faelle_to_claims` + `trg_sync_claims_to_faelle` droppen.

### Phase 6 — `faelle` DROP
- `DROP TABLE faelle CASCADE` (nachdem alle FKs umgehängt sind), Legacy-Spalten (`konvertiert_zu_fall_id` etc.) entfernen.
- Voller Portal-Smoke.

---

## 5 · Risiken

| Risiko | Mitigation |
|---|---|
| 341 Spalten — Mapping-Fehler verliert Daten | Phase 1 spaltengenau + live gegen `information_schema`; pro Spalte Coverage prüfen |
| Andere Sessions droppen parallel weiter | Audits veralten in <1 Tag (`feedback_information_schema_check`) — vor jedem Migrations-PR live nachmessen |
| `faelle`-Drop bricht versteckte Reader | Reader-Sweep pro Portal + Smoke; `grep` ist nicht genug (dynamische `[field]`-Zugriffe) |
| INSERT-Zeit-Sync greift nicht | Phase 3/4 müssen jeden Convert-Pfad beidseitig konsistent halten bis Phase 6 |
| Stepper-UI bricht wenn Lifecycle-Daten umziehen | Stepper-Reader explizit in den Phase-4-Reader-Sweep aufnehmen |

---

## 6 · Nächste Schritte

1. **Phase 0:** CMM-53 + CMM-54 fixen (separate Urgent-Tickets, schon angelegt).
2. **Phase 1 starten:** vollständiges 341-Spalten-Mapping-Audit + die 3 Lifecycle-Tabellen-Audits. Das ist der nächste konkrete Arbeitsblock — ohne dieses Mapping kann keine Migration sauber laufen.
3. `claim-as-ssot-umbau.md` überarbeiten: Assignment-Tabellen-Linie streichen, dieses Dokument als neue Master-Referenz verlinken.
4. Linear: Master-Ticket „Claim-SSoT-Vollmigration (faelle-Drop)" anlegen, CMM-44ff darunter neu ordnen.

---

## 7 · Quellen & Tooling

- `docs/16.05.2026/cmm-48-writer-stellen-audit.md` — 101-Writer-Audit + §0-Prod-Bugs
- `scripts/probe-faelle-schema.mjs` / `probe-claims-schema.mjs` / `probe-dead-column-writes.mjs` — Live-Schema-/Crash-Proben
- Konsolidierte Audits siehe §2
- **Nicht** mehr maßgeblich: `claim-as-ssot-umbau.md` (alte Assignment-Linie)
