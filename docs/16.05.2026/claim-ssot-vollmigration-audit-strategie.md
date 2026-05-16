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

### Live-Kennzahlen (empirisch verifiziert — Management-API, 16.05.2026)

| Tabelle | Spalten | Rolle im Zielmodell |
|---|---:|---|
| `faelle` | **341** | **wegfallend** — Quelle der Migration |
| `claims` | **81** | SSoT-Rückgrat — muss wachsen um claim-globale faelle-Spalten |
| `leads` | 201 | Pre-Claim, bleibt eigene Tabelle |
| `gutachter_termine` | 83 | Besichtigungstermin (Auftrag-LC) — hängt noch an `faelle.id` |
| `gutachten` | 73 | Gutachten-Werte (Auftrag-LC) — F+G-Sub-Table |
| `claim_parties` | 54 | Beteiligte — aktive Sub-Table |
| `auftraege` | 17 | Auftrag-Lifecycle-Marker |
| `kanzlei_faelle` | 8 | Kanzleifall-Lifecycle-Marker |

| Kennzahl | Wert | Quelle |
|---|---:|---|
| Sync-Duplikat-Spalten faelle↔claims | 34 | Sync-Trigger-Def, post-#1322 |
| `faelle`-Writer-Call-Sites | 101 | CMM-48-Audit |
| `claims`-Reads | ~506 | Memory `cmm_phase_24_finishing` |
| `claims`-Writes | ~54 | Memory `cmm_phase_24_finishing` |

**Die Migrations-Mathe:** `faelle` 341 Spalten, `claims` 81 — eine Lücke von ~260 Spalten. Davon sind 34 Duplikate (existieren bereits beidseitig). Die verbleibenden ~226 `faelle`-Spalten sind faelle-only und müssen klassifiziert + verschoben/gedroppt werden. `auftraege` (17) und `kanzlei_faelle` (8) sind schlanke Lifecycle-Marker — viele faelle-Workflow-Spalten gehören vermutlich dort hinein, nicht alle nach `claims`.

---

## 3 · Gap-Analyse — was für `faelle`-Vollwegfall fehlt

### 3.1 Die 341 `faelle`-Spalten brauchen ein Zuhause

Jede `faelle`-Spalte muss in eine von vier Kategorien fallen:

1. **→ `claims`** (Stammdaten/Status/Phase, claim-global) — Großteil
2. **→ Domänen-/Lifecycle-Tabelle** (`vehicles` / `auftraege` / `kanzlei_faelle` / `gutachter_termine` / `gutachten` / `claim_parties` / `abrechnungen`) — Werte die zu einer Domäne / Lifecycle-Stufe gehören
3. **→ bereits dort** (eine der 34 Duplikat-Spalten, oder schon auf claims)
4. **→ DROP** (tot, kein Reader/Writer)

Aktuell ist nur die Duplikat-Menge (34) sicher zugeordnet. Die übrigen ~307 `faelle`-Spalten sind **nicht klassifiziert** gegen das neue Zielmodell. Das ist die zentrale offene Audit-Arbeit.

### 3.1a Domänen-Cluster + Nutzer-Relevanz (Phase-1-Framework)

Das Mapping ist **nicht** „341 flache Spalten einzeln verschieben". Die Spalten bilden fachliche **Domänen** — jede Domäne hat eine Heimat-Tabelle UND ein Nutzer-Relevanz-Profil (welche Rolle sieht sie, in welcher Lifecycle-Phase). Nur so lassen sich die Daten später im Portal **systematisch nach Relevanz** darstellen statt als 341-Feld-Wüste. Empirisch identifizierte Haupt-Cluster (Live-Schema 16.05.):

| Domäne | faelle-Spalten (≈) | Heimat-Tabelle | Nutzer-Relevanz |
|---|---:|---|---|
| **Fahrzeug-Spec** | ~24 (`fahrzeug_*`, `kennzeichen*`, `fin_vin`, `hsn`, `tsn`, `erstzulassung`, `kilometerstand`, `lackfarbe_code`) | **`vehicles`** (44-Spalten-Tabelle, via `vehicle_id`) — NICHT claims | SV (Besichtigung), Kunde (sein Auto), Admin |
| **Fahrzeug-Schaden** | ~3 (`fahrzeugschaden_beschreibung`, `fahrzeug_fahrbereit`, …) | `claims` (claim-spezifisch, nicht Fahrzeug-Stammdaten) | alle, ab Auftrag-LC |
| **Halter** | ~9 (`halter_*`) | `claim_parties` (rolle=halter) bzw. `vehicles.current_owner_id` | SV, Kanzlei, Admin |
| **Gutachten/OCR** | ~11 (`gutachten_*`, `gutachter_honorar`, `ocr_*`) | **`gutachten`** (73-Spalten-Sub-Table, claim-linked, RPC `apply_gutachten_ocr`) | SV (erstellt), Kunde+KB (Ergebnis), Kanzlei |
| **Regulierung / VS** | ~13 (`vs_*`, `regulierung_*`) | `kanzlei_faelle` (Kanzleifall-LC) bzw. `claims` | Kanzlei, KB, Kunde (Auszahlung) |
| **Abrechnung** | ~6 (`abrechnung_id`, `kanzlei_abrechnung_id`, `*_honorar`, `abrechnungsart_*`, `zahlung_*`) | `abrechnungen` / `kanzlei_faelle` | Admin, SV (Honorar), Kanzlei |
| **Unfall/Schaden-Stammdaten** | ~30 (`schadens_*`, `unfall*`, `gegner_*`) | `claims` + `claim_parties` (Gegner=rolle=verursacher) | alle |
| **Kunde-Snapshot** | ~10 (`kunde_*`) | `claim_parties` (rolle=geschaedigter) | alle |
| **Workflow/Status** | ~40 (`status`, `phase`, `*_am`, `*_gesendet`, `eskalation_*`, `sv_id`, `kundenbetreuer_id`) | `claims` + `auftraege` (Auftrag-LC) + `kanzlei_faelle` (Kanzleifall-LC) | rollenabhängig pro Lifecycle-Stufe |
| **Mietwagen/Nutzungsausfall** | ~10 (`mietwagen_*`, `nutzungsausfall*`) | `gutachten` (Nutzungsausfall) / `claims` (Mietwagen-Flag) | Kunde, Kanzlei |
| **Vorschäden** | ~11 (`hat_vorschaeden`, `vorschaden_anzahl`, `vorschaden_erkannt`, `vorschaden_geprueft`, `vorschaden_letzter_datum`, `vorschaden_typ_a_ergebnis`, `vorschaden_typ_b_bericht/_pdf_url`, `vorschaeden_beschreibung`, `cardentity_*`) | **offen** — teils Fahrzeug-Historie (`vehicles`), teils claim-zeitige Cardentity-Prüfung (`claims`/Sub-Table). Genau ein Fall für den Vertikal-Audit. | SV (Bewertung), Kanzlei (VS-Argumentation), Kunde (Transparenz) |
| **Dokumente/Vollmacht/SA** | ~15 (`vollmacht_*`, `sa_*`, `abtretung_*`, `anschlussschreiben_*`) | `claims` + `dokumente`-Tabelle | Kunde, Kanzlei |
| **Tot/Drop-Kandidaten** | ? | — | — |

### 3.1b Vertikaler Rendering-Audit — was sieht der Nutzer im Claim?

Das Schema-Mapping allein reicht nicht. Es braucht zusätzlich einen **vertikalen Audit der Claim-Detail-Renderings** pro Rolle (Kunde / SV / KB / Admin / Kanzlei): Was wird im „Fall"(Claim)-Rendering **tatsächlich angezeigt — und unter welcher Bedingung**? Die Portale rendern Felder/Blöcke conditional je nach Datenlage (`fall.x ?? null`, `{fall.y && <Block/>}`). Beim `faelle`→`claims`-Umzug muss jede dieser Bedingungen mitgezogen werden, sonst verschwinden Blöcke still oder zeigen `null`.

Der Audit muss pro Domänen-Cluster beantworten:
- Welche UI-Blöcke hängen an welchen Spalten? (Conditional-Render-Bedingung)
- Was passiert wenn die Spalte leer ist — Block weg, Platzhalter, oder kaputt?
- Stimmt die Rolle/Lifecycle-Phase-Sichtbarkeit? (z.B. VS-Quote nur ab Kanzleifall-LC)

**Vorschäden ist ein expliziter Prüf-Fall:** Der Vorschaden-Block (Cardentity-Typ-A/-B-Ergebnis, `hat_vorschaeden`, Beschreibung) wird im Claim-Rendering conditional gezeigt. Nach der Migration muss geprüft werden, dass er bei vorhandenen Vorschaden-Daten weiterhin korrekt erscheint — und bei fehlenden sauber leer/ausgeblendet ist, nicht kaputt. Gleiches gilt für jeden anderen datenabhängigen Block (Gutachten-Werte, Mietwagen, VS-Regulierung, Fahrzeug-Spec).

Dieser Rendering-Audit gehört in Phase 1 — er liefert die Reader-Bedingungs-Landkarte, ohne die Phase 4 (Reader-Migration) blind wäre.

### 3.1c Cardentity-Extraction-Audit + Konsolidierung mit Gutachten-Werten

Die **Cardentity-Extraction** (`api/cardentity/typ-a`, `api/cardentity/typ-b`, `lib/cardentity/*`, `enrichFallByFin`) schreibt heute u.a. nach `faelle`:
- **Typ-A** (`cardentity/typ-a/route.ts`): `vorschaden_geprueft`, `hat_vorschaeden`, `vorschaden_anzahl`, `vorschaden_letzter_datum`, `vorschaden_typ_a_ergebnis`, `cardentity_abfrage_am`
- **Typ-B** (`cardentity/typ-b.ts`): `vorschaden_typ_b_bericht`, plus dieselben Vorschaden-Flags
- **Fahrzeug-Enrichment** (`enrichFallByFin`): Fahrzeug-Spec → `vehicles` (`cardentity_letzter_pull`, `data_completeness_score`)

Zu auditieren — und für die Konsolidierung zu entscheiden:
1. **Was genau schreibt Cardentity** (Spalten + Ziel-Tabelle, Typ-A vs Typ-B abgrenzen)?
2. **Überlappung mit Gutachten-Werten:** Cardentity-Vorschaden-Daten und die `gutachten`-Werte (OCR aus dem Gutachten-PDF) beschreiben beide „Zustand/Schäden am Fahrzeug" — wo doppeln sie sich? Kann der Vorschaden-Befund die Gutachten-Werte **anreichern** (z.B. Cardentity liefert Vorschaden-Historie, Gutachten liefert aktuellen Schaden — zusammen ein vollständiges Bild)?
3. **Konsolidierungs-Ziel:** Gehören Cardentity-Output + Gutachten-Werte in dieselbe Sub-Table-Familie (`gutachten` erweitern um Vorschaden-Sektion) oder bleiben sie getrennt (`vehicles`-Historie vs. claim-`gutachten`)?

Ergebnis dieses Audits steuert, ob die Vorschäden-Domäne (§3.1a) nach `vehicles`, nach `gutachten` oder in eine eigene Sub-Table geht — und ob die Cardentity-Writer im Zuge der Migration auf die RPC-Schreibwege (analog `apply_gutachten_ocr`) umgestellt werden.

### 3.1d RLS-Audit (→ `claim-rls-audit.md`)

Die RLS-Policies + SECURITY-DEFINER-Helper müssen mitwandern — durchgeführt in `docs/16.05.2026/claim-rls-audit.md`. Kernbefunde:
- **Struktureller Blocker:** `gutachter_termine` hat **kein `claim_id`** (nur `fall_id`) — einzige Sub-Tabelle ohne claim-FK. Muss FK+Backfill+Sync bekommen, sonst lässt sich keine seiner 4 RLS-Policies migrieren.
- **`claims` hat kein natives `sv_id`/`kunde_id`** — die meisten Sub-Tabellen-Policies hängen an `faelle.sv_id`/`faelle.kunde_id`. Vor dem Drop muss ein claim-natives SV-Mapping definiert sein (`auftraege.sv_id` kanonisch?).
- `can_access_fall()` (JOIN auf `faelle`) speist **19 Policies** — größter Einzel-Hebel.
- 5 Risiken (R1–R5): u.a. DSGVO-Über-Exposition in `claim_parties.cp_select_consolidated`, fehlende Kunde-Lese-Policy auf `gutachten`, `TO public`-Staff-Policies auf 5 Sub-Tabellen.

### 3.1e Routen-Hygiene-Audit (Journey-Routen → claims)

Pro Nutzer-Journey (Kunde / SV / KB / Admin / Kanzlei) müssen die **nutzerrelevanten vertikalen Routen** auf `claims` umgestellt werden. Der Audit muss erfassen:
- Welche Routen durchläuft jede Journey? (Lead-Erfassung → Claim-Detail → Auftrag-LC-Schritte → Kanzleifall-LC)
- Welche Routen lesen/schreiben heute `faelle` und müssen migriert werden?
- **Hygiene:** Welche Routen sind überflüssig — tot, redundant, Legacy-Stub (z.B. der bereits gefundene tote `/kanzlei/fall/[id]`-Link)? Diese gehören aufgeräumt statt mitmigriert.
- **Immer relevant, nie als überflüssig flaggen:** alles Gutachten-bezogene und alles Fahrzeug-bezogene — diese Domänen sind für jede Journey kern-relevant.

Ergebnis: Routen-Landkarte pro Journey mit Migrations- und Cleanup-Markierung.

> Die exakte Spalten-für-Spalten-Zuordnung + die Drop-Kandidaten sind die Phase-1-Detailarbeit. Die Domänen-Sicht ist die **Gliederung** dafür — und gleichzeitig die Vorlage für die spätere Portal-Darstellung (jede Domäne = ein UI-Block, pro Rolle/Lifecycle-Phase ein-/ausgeblendet).

> **Fahrzeug-Hinweis:** `vehicles` (44 Spalten, eigene SSoT-Tabelle mit `cardentity`-Anreicherung) ist bereits das Ziel — die `faelle.fahrzeug_*`-Spalten dürfen **nicht** nach `claims` wandern, sondern müssen über `vehicle_id` auf `vehicles` aufgelöst werden. AAR-810 (Cluster H) hat das angefangen, aber `vehicle_id` wird laut Audit oft nicht initial gesetzt — Migration unfertig.

### 3.2 Lifecycle-Tabellen — Coverage-Befund (16.05.)

Live-Coverage der 3 Lifecycle-Tabellen:

| Tabelle | Rows | gefüllte Spalten | Befund |
|---|---:|---|---|
| `auftraege` | **1** | 9/17 | praktisch unbefüllt — Auftrag-LC läuft heute über `faelle`-Status, nicht über diese Tabelle |
| `kanzlei_faelle` | **0** | 0/8 | **komplett leer** — Kanzleifall-LC trägt keine Daten; lebt heute in `faelle.kanzlei_*`/`vs_*` |
| `gutachter_termine` | 18 | 44/83 | aktiv genutzt — einzige der drei mit echten Daten |

**Konsequenz:** `auftraege` + `kanzlei_faelle` sind heute **strukturelle Skelette** — die Lifecycle-*Daten* liegen weiterhin als Spalten auf `faelle` (Status/Phase/`kanzlei_*`/`vs_*`). Die Migration muss diese Spalten erst in die Lifecycle-Tabellen **befüllen** (Backfill), bevor `faelle` weg kann — es ist kein reiner Spalten-Umzug, sondern teils ein Erst-Befüllen leerer Tabellen. Restarbeit: spaltengenaues Writer-/Reader-Audit der 3 Tabellen (analog `cmm-48-writer-stellen-audit.md`).

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

### Phase 1 — Vollständiges Audit (6 Teil-Audits)
1. **Spalten-Domänen-Mapping:** ✅ erledigt → `claim-spalten-domaenen-mapping.md`. 341 Spalten: 265 0-Coverage / 76 live. Die 76 sind domänen-klassifiziert; per-Spalten-Writer-Match der 265 ist Detail-Restarbeit.
2. **Lifecycle-Tabellen-Audit:** ✅ erledigt → `claim-lifecycle-tabellen-audit.md`.
3. **Vertikaler Rendering-Audit (§3.1b):** ✅ erledigt → `claim-rendering-vertikal-audit.md`.
4. **Cardentity-Audit (§3.1c):** ✅ erledigt → `claim-cardentity-audit.md`.
5. **RLS-Audit (§3.1d):** ✅ erledigt (statisch) → `claim-rls-audit.md`. Live-Verifikation offen.
6. **Routen-Hygiene-Audit (§3.1e):** ✅ erledigt → `claim-routen-hygiene-audit.md`. 123 Routen, ~70 mit faelle-Bezug, ~17 Cleanup-Kandidaten + 2 Defekte (Admin-Legacy-Hub-Drift, GutachterShell-Nav-Bug).
- Ergebnis: Mapping-Tabelle + Rendering-Bedingungs-Landkarte + RLS-Plan + Routen-Landkarte als Migrations-Blueprint.

**Alle 6 Phase-1-Teil-Audits sind durch** (16.05.2026) — die Detail-Restarbeit (per-Spalten-Writer-Match der 265 0-Coverage-Spalten, RLS-Live-Verifikation gegen `pg_policies`) ist im jeweiligen Doc markiert. Migrations-Umsetzung (Phase 2+) ist separat.

### Phase-0-Vorarbeiten — eigenständige Bugs/Strukturlücken (vor der Migration zu erledigen)

Beim Audit gefunden, blockieren bzw. erschweren die Migration:
- **`gutachter_termine.claim_id` fehlt** — anlegen (FK + Backfill-Trigger). Pflicht vor Termin-Migration + RLS-Umstellung.
- **Claim-natives `sv_id`** — `claims` hat keins; `is_sv_for_claim`/RLS hängen an `faelle.sv_id`. Kanonische SV-Quelle festlegen (`auftraege.sv_id`?).
- **Prod-Bugs CMM-53 / CMM-54** — Writes auf gedroppte faelle-Spalten.
- **Latente Bugs:** `createSideQuestAuftrag` `status='geplant'` (CHECK-Verstoß-Risiko), `lib/termine/actions.ts:440` schreibt nicht-existente Spalte `sv_notizen`.
- **2 UI-Bugs** (AAR-934 GutachterShell-Nav, AAR-935 Admin-Hub-Drift) — eigene Tickets.

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
