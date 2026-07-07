# Ops-Cockpit Rebuild (Admin · KB · Dispatch) — Design

**Datum:** 2026-07-07
**Branch:** `kitta/ops-cockpit-rebuild` (off `staging`)
**Status:** Design — wartet auf Aaron-Review, dann `writing-plans`.

> Aaron: „lass uns die Darstellung für Admin und KB wirklich von Grund auf neu aufbauen … ich brauche eine abgeleitete View, die dann die Cockpits zeigt … nimm die abgeleitete Dispatch-View auch mit auf … voll editierbar für KB und Admin, damit die Claim-Basis die Daten auch hat, falls wir eingreifen müssen … alle Statuses sauber, alle Felder angezeigt, übersichtlich."

---

## 1. Problem & Kontext

Admin- und KB-Portal sind „zusammengeschraubt": jedes Widget holt seine Daten ad-hoc, die Sicht wird per Hand komponiert, und **niemand leitet ab**, in welchem Zustand ein Fall ist und was als Nächstes zu tun ist. Der frühere Refactor war kosmetisch (Farben/Anordnung) auf einer Struktur, die selbst das Problem ist.

**Gemessene Belege:**
- **Admin** (`src/app/admin/page.tsx`): 5 gestapelte Widgets, jedes mit eigenen Queries (`KpiCards`, `KritischeUpdatesWidget` 296 Z., `WichtigeUpdatesWidget` 313 Z. …). 56 Routen mit **3 Task-Einstiegen**, **2 Finance-Hubs**, Monsterdateien (Finance-Hub **838 Z.**, Statistiken-Client **852 Z.**, SV-Detail **1083 Z.**), **11+ inline Status-Farb-Maps**, **5 tote Widgets**.
- **KB** (`src/app/mitarbeiter/page.tsx`): **228-Zeilen-Einzeldatei**, 7 Parallel-Queries, wiederholte Cardinality-Auspackerei von Hand, inline Status-Farben, tote `#`-Links; `termine`/`kundentermine` = 200-Zeilen-Monolithen.
- **Status-Chaos in der DB (verifiziert):** `claims` trägt **drei** konkurrierende Status-Spalten — `status` (CHECK, 12 Werte), `operative_status` (freier Text), `work_state` (freier Text) — zusätzlich zur abgeleiteten `v_claim_phase`. Das ist die „Statuses nicht sauber"-Wurzel.

**Vorhandenes Muster, das das löst:** Das Dispatch-Lead-Cockpit (`deriveLeadWorkflowState` → Registry-Domain `lead-workflow` → `LeadWorkflowPanel`/Stepper/NextBestAction, gebaut in Session `kitta/dispatch-leads-workflow-*`). Dieses Design hebt es zum gemeinsamen Fundament und überträgt es auf Claims.

## 2. Ziel & Definition-of-Done

Eine **abgeleitete Datenbasis**, auf der drei arbeitsgetriebene Cockpits sitzen (Dispatch = Lead-Stage, KB = Claim-Stage, Admin = Aggregat über beide + Drill-in). Verbindliche DoD (Aaron-Auftrag):

1. **Prod-reif & eine 1+** — jede Phase real gegen Prod gesmoket (Playwright, Test-Accounts), iteriert bis nutzbar.
2. **Alle Statuses sauber** — eine Registry (`src/lib/status`), keine inline-Maps; die drei `claims`-Status-Spalten konsolidiert (§5).
3. **Alle Felder angezeigt + voll editierbar** — keine read-only-Sackgasse; jeder Wert hat einen Schreibpfad in die Claim-Basis.
4. **Übersichtlich** — der Ausgangsschmerz; die Cockpit-Layouts (§6/§7) sind visuell mit Aaron abgestimmt.

## 3. Architektur — drei Schichten, verwurzelt in `v_claim_phase`

```
                 v_claim_phase (claim_id · main_phase · sub_phase)  = Lifecycle-SSoT
                  /                                                \
  LAYER 1 · Read-Detail (TS-Ableitung)              LAYER 2 · Read-Aggregat (SQL)
  ── zwei GETRENNTE entity-native Views ──          v_ops_rollup
  v_claim_workstate   (Fälle: Rohsignale)             COUNT(*) GROUP BY
  v_lead_workstate    (Leads: Rohsignale)               kind, phase, owner, is_overdue
        │                    │                          (kind bleibt First-Class-Dimension —
        ▼                    ▼                           Lead- und Claim-Phasen NIE gemerged)
  deriveClaimWorkflowState  deriveLeadWorkflowState            │
        └────────► WorkItem (discriminated union `by kind`) ◄──┘   ← EINZIGER Vereinigungspunkt
                          │
   Status-Registry: claim-workflow (neu) · lead-workflow (bestehend)  → Label/Farbe/CTA
                          │
   Cockpit-Primitives: WorkItemRow · WorkItemHoverCard · KanbanBoard · RollupMatrix · StatBar
                          │
  ┌───────────────────────┬─────────────────────────┬──────────────────────────────┐
  Dispatch-Cockpit          KB-Cockpit                  Admin-Cockpit
  Lead-Board (v_lead_ws)    Claim-Board (v_claim_ws)     Rollup-Matrix (v_ops_rollup)
  + frühe Claims-Lane*      owner_kb = me                + Drill-in → Lead- ODER Claim-Board
  (*aus v_claim_ws,         + Meine-Arbeit-Streams       + Finance/Team (eigene Sektionen)
   getrennte Quelle)
```

  LAYER 3 · Write/Eingriff (Server-Actions → Basis-Tabellen `claims`/`leads`/`personen`/… ; Override; Audit→`timeline`)

**Kernprinzip „Lead-View ≠ Claim-View" (Aaron, verbindlich):** Lead und Claim sind verschiedene Entitäten mit **verschiedenen Phasen-Achsen** (Lead: `neu → qualifizieren → sv_zuweisen → flowlink_senden → …`; Claim: `erfassung → begutachtung → regulierung → abschluss`). Sie werden **nie in eine SQL-View gemischt**. Getrennt bleiben: die Views, die Ableitungen, die Registry-Domains. Vereint wird **ausschließlich** das TS-`WorkItem` (discriminated union) — rein zur Präsentation über dieselben Cockpit-Bausteine. `v_ops_rollup` darf Zählwerte kombinieren, führt aber `kind` als Dimension und hält Lead-/Claim-Phasen als getrennte Achsen.

## 4. Datenmodell & Verträge (verifizierte Spalten, kein Raten)

### 4.1 `v_claim_phase` (SSoT, existiert)
`claim_id (uuid) · main_phase (text) · sub_phase (text)`. Wird von allen drei Schichten als Phasen-Wahrheit genutzt. Der Admin-`phase_override` (§9) wird hier via `COALESCE` respektiert.

### 4.2 `v_claim_workstate` (Layer 1, Fälle — NEU)
Baut auf `v_claim_full` (bereits geflacht: `claim_nummer`, `kennzeichen`, `sv_id`, `kundenbetreuer_id`, `lead_id`, Kunde-Anzeige) + `v_claim_phase` + Signal-/Timing-Spalten aus `claims` (verifiziert):
- **Keys/Owner:** `claim_id`, `claim_nummer`, `lead_id`, `kundenbetreuer_id`, `sv_id`, `makler_id`.
- **Phase:** `main_phase`, `sub_phase` (aus `v_claim_phase`), `status` (CHECK-Enum), `phase_override` (NEU §9).
- **Signale (für Ableitung/„waiting_on"):** `sa_unterschrieben`, `sv_zugewiesen_am`, `regulierungs_betrag`, `abgeschlossen_am`, `eskaliert_am`, `vollmacht_status`, `dokumente_vollstaendig_fuer_phase`, `auszahlung_gutachter_eingegangen_am`, `unfallmitteilung_status`.
- **Timing (für „is_overdue"):** `created_at`, `status_changed_at`, `sv_zugewiesen_am`, `kundenbetreuer_zugewiesen_am` → `phase_since`.
- **Anzeige:** `kennzeichen`, Kunde-Name (via `geschaedigter_user_id`→`personen`/`profiles`, RLS-/consent-aware), `schadens_hoehe_netto`.
- **Scope:** nur aktive (`ist_aktiv = true`, `main_phase <> 'abschluss'` für Worklists; Admin-Rollup sieht alle).

### 4.3 `v_lead_workstate` (Layer 1, Leads — NEU, dünn)
Standardisiert, was `deriveLeadWorkflowState` bereits aus `leads` liest (verifiziert): `id`, `lead_nummer`, `status` (enum), `qualifizierungs_phase`, `zugewiesen_an`, `sa_unterschrieben`, `flow_link_geoeffnet`, `flow_link_abgeschlossen`, `disqualifiziert`, `letzter_anruf_am/_status`, `anruf_versuche`, `rueckruf_geplant_am`, `gutachter_termin`, `konvertiert_zu_claim_id`; Anzeige `vorname/nachname/kennzeichen/fahrzeug_hersteller/modell/telefon`. **Scope:** nur nicht-konvertierte (`konvertiert_zu_claim_id IS NULL`, `disqualifiziert = false`) → **kein Doppelzählen** mit `v_claim_workstate`.

### 4.4 TS-`WorkItem` (der einzige Vereinigungspunkt)
```ts
type WorkItem =
  | { kind: 'lead';  id; stage; subState; nextActionCode; ownerRole; ownerId;
      isOverdue; overdueSince; waitingOn; display: LeadDisplay }
  | { kind: 'claim'; id; stage; subState; nextActionCode; ownerRole; ownerId;
      isOverdue; overdueSince; waitingOn; display: ClaimDisplay }
```
`deriveClaimWorkflowState(row: ClaimWorkstateRow): WorkItem` (neu, rein, TDD) und `deriveLeadWorkflowState(...)` (bestehend, absorbiert). `ownerRole` wandert über den Lifecycle: Erfassung=KB · Begutachtung=SV · Regulierung=KB/Kanzlei.

### 4.5 Registry-Domains (Präsentation)
- `lead-workflow` (existiert) — Lead-`nextActionCode`s.
- `claim-workflow` (NEU) — Claim-`nextActionCode`s. Repräsentative Codes: `daten_vervollstaendigen · sv_beauftragen · termin_offen · gutachten_ausstehend · filmcheck · qc_pruefung · vs_anschreiben · warten_auf_vs · kuerzung_pruefen · anschlussschreiben · abgeschlossen`. **Die exakte `sub_phase → nextActionCode`-Abbildung wird in Phase 0 aus der `v_claim_phase`-Definition abgeleitet (Sub-Phasen wie `sa_offen`/`filmcheck`/`qc-pruefung`/`vs-kuerzt`/`anschlussschreiben`/`nachbesichtigung-laeuft`), nicht geraten.** Label/Farbe/CTA kommen aus der Registry (`src/lib/status`, aus dieser Session), keine inline Maps.

## 5. Status-Konsolidierung („alle Statuses sauber")

`claims` hat heute `status` (CHECK-Enum), `operative_status` (Text), `work_state` (Text) + abgeleitete `v_claim_phase`. **Phase 0** klärt (mit `execute_sql`-Bestandsaufnahme der aktuellen Nutzung), welche Spalte autoritativ ist, und leitet die anderen ab statt sie parallel zu pflegen. Ziel-Zustand:
- **`v_claim_phase` (main/sub)** bleibt die abgeleitete Phasen-Wahrheit → Registry `claim-main-phase` (existiert) + `fall-phase` (existiert) für Badges.
- **`claims.status`** bleibt der CHECK-Enum-Lifecycle → Registry `claims-status`/`fall-status` (existieren).
- **`operative_status` / `work_state`** werden entweder auf eine autoritative Rolle reduziert oder als abgeleitet markiert (kein 4. Freitext dazu). Migration additiv, Reader zuerst, dann Deprecation.
- Alle Badge-Renderer ziehen aus `src/lib/status` — der `check:status-registry`-Ratchet blockt neue inline-Maps.

## 6. KB-Cockpit (`/mitarbeiter`) — „C + Hover-Split"

Layout mit Aaron abgestimmt (Visual-Companion):
- **„Heute"-Leiste** oben: zeitkritisch (Rückrufe fällig, Termine heute, überfällige Tasks) + Counter (ungelesene Nachrichten, offene Reklamationen).
- **Phase-Kanban** (Spalten = Claim-Phasen `Erfassung/Begutachtung/Regulierung`), Karten = Fälle mit Dringlichkeits-Farbe + „nächste Aktion". Datenquelle: `v_claim_workstate` (owner_kb = me).
- **Hover-Split:** beim Drüberfahren klappt ein **editierbarer Detail-Popover** auf — Felder inline editierbar (✎) + **klickbare kontextbezogene Aktionen** (Primary = Next-Best-Action, plus SV zuweisen / Rückruf / Notiz / Öffnen). Schreibpfad → Claim-Basis (§9).
- **Meine-Arbeit-Streams** (komponiert): Rückrufe/Termine/Nachrichten/Reklamationen als angrenzende To-dos.
- Ersetzt die 228-Zeilen-Ad-hoc-Seite + die Monolithen.

## 7. Admin-Cockpit (`/admin`) — „Rollup-Matrix"

Layout mit Aaron abgestimmt:
- **KPI-Leiste:** Aktiv · Überfällig · SLA-verletzt · Neue Leads · Unzugewiesen.
- **Rollup-Matrix (Heatmap):** Zeilen = Owner (KBs/Dispatcher), Spalten = Phase, Zellen = Anzahl, Farbe = überfällig-Anteil → zeigt sofort „wo staut es UND wer ist behind". Datenquelle: `v_ops_rollup`. **Lead- und Claim-Phasen als getrennte Achsen/Spaltengruppen** (nicht gemerged).
- **„Braucht Aufmerksamkeit"-Liste:** übergreifend überfällig/steckt, alle Owner.
- **Drill-in:** Klick auf Zelle/Zeile → das C+Hover-Board, admin-weit auf dieses Bucket gefiltert — **Lead-Bucket → Lead-Board, Claim-Bucket → Claim-Board** (getrennte Quellen).
- **Finance/Team** bleiben eigene Sektionen (verlinkt, nicht der Fokus).

## 8. Dispatch-Harmonisierung (Phase 3, „danach")

Dispatch ist die Lead-Stage desselben Kontinuums:
- `deriveLeadWorkflowState` (bestehend) wird die Lead-Seite des `WorkItem` — **absorbiert, nicht neu gebaut**.
- Dispatch-Cockpit = **Lead-Board** aus `v_lead_workstate` (Spalten = Lead-Phasen) + optionale **frühe-Claims-Lane** aus `v_claim_workstate` (z. B. `sv_gesucht`), als **getrennte Quelle** — nie mit Leads vermischt.
- Lead-Rollup analog Admin, aber Lead-Phasen-Achse.
- ⚠️ **Koordination:** Session `kitta/dispatch-leads-workflow-phase1b` baut gerade genau diese Lead-Ableitung. Dispatch-Harmonisierung ist die **letzte** Phase und übernimmt deren Ergebnis; wir bauen nichts parallel neu.

## 9. Write / Edit / Override / Audit (Layer 3)

- **Edit → Basis, nie View.** Server-Actions (`{ ok, error }` + `revalidatePath`, RLS) schreiben in `claims`/`leads`/`personen`/`vehicles`/`gutachten`. Cockpits lesen Views, schreiben Tabellen (CQRS).
- **Reguläre Views (nicht materialized):** damit jeder Eingriff sofort in Worklist *und* Rollup durchschlägt (Round-trip).
- **Override (beide Rollen, Aaron):** `claims.phase_override` (NEU, **CHECK-constrained auf gültige `ClaimMainPhase` → enum-sicher**; der alte Admin-Status-Override war enum-unsicher = `v_claim_base`-Cast-500 aus dem Rollen-Audit) + `phase_override_reason/_by/_at`. `v_claim_phase` macht `COALESCE(phase_override, <abgeleitet>)`. Reiht sich neben die bestehende `endzustand_*`/`eskaliert_*`-Präzedenz ein.
- **RLS:** KB `kundenbetreuer_id = auth.uid()` (eigene Fälle), Admin alles — an Basis-Tabellen *und* Views.
- **Audit:** jeder Eingriff (Fakten-Edit *und* Override) → Insert in `timeline` (Tabelle; gelesen via `v_claim_timeline`), mit wer/was/warum.

## 10. Rollout-Phasen (jede: Branch → PR gegen `staging` → build + Prod-Smoke bis 1+)

- **Phase 0 — Fundament:** `v_claim_workstate` + `v_lead_workstate` + `v_ops_rollup` (reguläre Views, DDL via Supabase-Plugin) · `WorkItem` + `deriveClaimWorkflowState` (TDD) · Registry-Domain `claim-workflow` · Status-Konsolidierungs-Bestandsaufnahme (§5) · Write-Actions + `phase_override` + Audit. **Kein UI.**
- **Phase 1 — KB-Cockpit:** C+Hover-Board + Heute + Streams + editierbares Hover. Smoke bis 1+.
- **Phase 2 — Admin-Cockpit:** Rollup-Matrix + KPI + Attention + Drill-in. Smoke bis 1+.
- **Phase 3 — Dispatch-Harmonisierung:** Lead-Board + Lead-Rollup, koordiniert mit `dispatch-leads-workflow`-Session.

## 11. Testing & Ratchets

- **TDD** für `deriveClaimWorkflowState` (jede Phase/Sub-Phase → erwarteter `nextActionCode`/`ownerRole`/`isOverdue`).
- **Prod-Smoke** je Phase (Playwright, frischer SW-freier Browser, Test-Accounts `test-{kb,admin,dispatch}@claimondo.de` — KB/Dispatch intern → ggf. 2FA-Infra abwarten).
- **Ratchets grün:** `status-registry` (keine neuen inline-Maps), `component-set`, `token-audit`, `knip`.
- **DDL nur über Supabase-Plugin** (`apply_migration`), Twin-Drift-Regel (AGENTS.md Regel 2).

## 12. Koordination (viele parallele Sessions)

Geteilte Flächen — Marker-Lane `COORDINATION-ops-cockpit-rebuild`:
- `src/app/admin/**` — ⚠️ Sessions `claim-ai-konsole` (admin AI-Konsole), `werkstatt-detailview-zentral` (admin werkstatt). Additive Cockpit-Arbeit; Legacy-Widgets erst nach Abstimmung entfernen.
- `src/app/mitarbeiter/**` — KB, aktuell frei.
- `src/app/dispatch/**` + `deriveLeadWorkflowState` — ⚠️ Session `dispatch-leads-workflow-phase1b`. Phase 3 übernimmt deren Ergebnis.
- `src/lib/status/**` — Registry (diese Session ist Owner der Foundation).
- Claim-Views (`v_claim_*`) — ⚠️ Sessions `payment-ledger-*`, `sv-termine-canonical-source`. Additive Views (`v_*_workstate`, `v_ops_rollup`), keine bestehenden brechen.

## 13. Offene Punkte & Annahmen

- **SLA-/„überfällig"-Schwellen** pro Sub-Phase: Default-Werte im Design, exakte Zahlen mit Aaron kalibrieren (parametrierbar, nicht hartkodiert).
- **Autoritative Status-Spalte** (`status` vs `operative_status` vs `work_state`): Phase-0-Bestandsaufnahme entscheidet; Konsolidierung additiv + Deprecation.
- **`v_claim_full`-Spalten** für `v_claim_workstate`: beim Bau final gegen die View-Definition verifizieren (nicht raten).
- **Dispatcher-Claims-Lane**: ob/welche frühen Claim-Phasen der Dispatcher sieht — mit Aaron/Dispatch-Session final schneiden.
