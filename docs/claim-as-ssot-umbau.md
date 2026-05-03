# Claim als SSoT — Vollständiger Umbau-Plan

**Status:** Living Doc · zuletzt 2026-04-27
**Owner:** Aaron + Claude
**Linear-Strecke:** CMM-1 bis CMM-26 (Team AAR)

## Strecken-Status (2026-04-27)

| Ticket | Scope | Status |
|---|---|---|
| CMM-1 | Master + dieses Dokument | live |
| CMM-2 | Phase 0 Foundation (Loader, Views, Types) | gemerged |
| CMM-3 | Phase 0.5 Lead→Claim Conversion | gemerged |
| CMM-4..11 | Phase 1-7 Migration | pending |
| CMM-12 | Outgoing Communication + Vertragswerk | pending |
| CMM-13 | Termin-Auto-Expiry 30min | pending |
| CMM-14 | Flow-Wizard Magic-Link + LexDrive-Karte | PR #393 in Review |
| CMM-16 | Kunden-Onboarding + Pflichtdaten-Banner-System | active (Parent) |
| CMM-19 | Onboarding Step 1 navy-Cards | gemerged |
| CMM-21 | Dokumente-Tab + Smart-Hochladen + Multi-File | PR #395 grün, mergeable |
| CMM-22 | Pflichtdaten-Banner-System (Re-Engagement) | active |
| AAR-858 | SV-Anonymität Customer-Sweep | offen (High) |

---

## 1. Business-Logik — kleinster gemeinsamer Nenner

Die Welt von Claimondo besteht aus **einem Schadenfall**. Punkt. Alles andere ist Verwaltung drumherum.

### 1.1 Was ist ein Claim?
Ein Claim ist die digitale Repräsentation eines KFZ-Schadens vom Moment der Lead-Erfassung bis zur finalen Regulierung/Ablehnung/Stornierung. Er hat:

- **Identität** — `id`, `claim_nummer` (für Mensch lesbar), Erstellungs-Metadaten
- **Beteiligte** (`claim_parties`) — Geschädigter, Verursacher, evtl. Mehrfach-Beteiligte
- **Fahrzeuge** (`claim_vehicle_involvements`) — geschädigtes + gegnerisches + ggf. weitere
- **Schadensereignis** — Hergang, Datum/Zeit, Ort, Geo, Polizei, Skizze
- **Phase** (`phase`) — wo im Prozess sind wir? (`0_lead` … `9_endzustand`)
- **Status** (`status`) — Lifecycle innerhalb der Phase (`offen`, `dispatch_done`, `in_bearbeitung`, `in_kommunikation_vs`, `reguliert`, `abgelehnt`, `an_externe_kanzlei_uebergeben`, `storniert`)
- **Service-Layer** — welcher Service ist beauftragt? (`service_typ`: gutachten / komplett)
- **Sub-Entities:**
  - `claim_payments` — Zahlungseingang VS, Forderungen, Mahnungen
  - `claim_mietwagen` — Mietwagen-Logik
  - `vs_korrespondenz` — Briefwechsel mit Versicherung
  - `repairs` — Werkstatt-Reparaturen
  - `gutachter_termine` — SV-Termine (heute an `faelle.id` gebunden, muss umziehen)
  - `gutachten` / `dokumente` — Files
  - `nachrichten` — Multi-Channel-Inbox
  - `ocr_runs` — Audit der Dokumenterfassung

### 1.2 Was ist `faelle` historisch gewesen?
Eine **denormalisierte 60-Spalten-Tabelle**, die vor `claims` versucht hat, alles auf einer Zeile zu halten. Sie ist heute eine *Facade* via Trigger AAR-854.

### 1.3 Was bleibt von `faelle` übrig?
Nach dem Umbau: **NUR Zuweisungs-Spalten**, alles andere kommt aus `claims`.
- `id` (= `claim.id` — wir behalten 1:1-Mapping)
- `fall_nummer` (Anzeigenummer)
- `sv_id` (zugewiesener Sachverständiger)
- `kundenbetreuer_id` (zugewiesener KB)
- `service_typ` (`gutachten` | `komplett`) — bestimmt Pricing & Pipeline-Sichtbarkeit
- `kanzlei_partner_id` (bei Komplett)

→ **`faelle` wird zur reinen Assignment-Tabelle.** Status, Phase, alle Schadendaten sind im Claim. Punkt.

---

## 2. Zwei SSoTs — saubere Trennung Lead vs. Claim

Es gibt **zwei** Single-Source-of-Truths in diesem System, mit einem klaren Übergabepunkt dazwischen:

### 2.1 SSoT für Dispatcher — `leads`

Der **Lead** ist die Welt des Dispatchers. Er wird angelegt, qualifiziert (Daten zusammentragen, Foto-Briefing, ZB1-OCR, SV-Klärung, Versicherung identifizieren) und durchläuft Lead-Phasen bis zum Status `konvertiert`.

- **Lead-System existiert** und funktioniert im Grundsatz korrekt (`/dispatch/leads/[id]`, `lib/lead-*`, `lead-fall-mapping.ts`)
- **Wird im Umbau nicht angefasst**, ausser an einer Stelle: dem Konvertierungs-Punkt
- Nach erfolgreicher Konvertierung hat der Dispatcher **keine Berührung** mehr mit dem entstandenen Claim

### 2.2 SSoT für alle anderen — `claims`

Sobald aus einem Lead ein Claim wird, übernehmen **5 Konsumenten** die Welt des Claims:

| Rolle | Portal | Sicht | Filter | Schreiben |
|---|---|---|---|---|
| **Kunde** | `/kunde/faelle/[id]` | Eigener Claim: Phase, nächste Schritte, Mietwagen, Zahlung, Dokumente, Chat mit KB | `claims.geschaedigter_user_id = auth.uid()` | Vollmacht, Antworten auf Anliegen, Dokument-Upload |
| **SV** | `/gutachter/fall/[id]` | Zugewiesener Claim: Termin, Fahrzeug, Befund, Skizze, Gutachten, Filmcheck | `claims.id IN (SELECT claim_id FROM faelle WHERE sv_id = auth.uid())` | Befund, Termin-Status, Gutachten, Filmcheck |
| **KB (Mitarbeiter)** | `/mitarbeiter/faelle/[id]` + `/termine` + `/tasks` + `/nachrichten` | Tagesgeschäft: **seine** Claims, Termine, Tasks, Inbox | `claims.kundenbetreuer_id = auth.uid()` | Status, Eskalation, Kommunikation, Tasks abhaken |
| **Admin** | `/faelle/[id]` (Hub) | Alles + Manual Override + Audit + Test-Tools | Keiner | Alles |
| **Kanzlei** (extern) | `/kanzlei/fall/[id]` | Komplett-Mandate read-only | RLS auf `service_typ = 'komplett' AND kanzlei_partner_id = …` | Nichts (nur Dokument-Download) |

**Dispatcher kommt in dieser Liste bewusst nicht vor.** Der Dispatcher ist Lead-, nicht Claim-Konsument. Sobald der Lead konvertiert ist, ist der Dispatcher fertig.

### 2.3 Der Lead-Tag am Claim

Der einzige bleibende Bezug Dispatcher → Claim ist eine **Herkunftsmarke** am Claim:
- `claims.source_lead_id` (UUID auf `leads.id`)
- `claims.created_via = 'lead_konvertierung'` (Enum existiert)
- `claims.created_by_user_id = <dispatcher.id>` (zur Nachverfolgung wer den Lead konvertiert hat)

Damit kann jederzeit zurückverfolgt werden, **wie** ein Claim entstanden ist — aber der Dispatcher hat keinen Schreib-/Lese-Zugriff auf den Claim-Lifecycle.

**Wichtig:** Alle 5 Claim-Konsumenten lesen denselben Claim — **es gibt keine Rollen-eigenen Datenquellen mehr**. Die Sichtbarkeits-Differenzierung läuft über:
1. **DB:** RLS-Policies auf `claims` (per Rolle + Zuweisung)
2. **Loader:** `getClaimForRole(role)` selektiert je Rolle eine andere Spalten-Whitelist
3. **UI:** rollenspezifische Component-Variants, aber **immer aus demselben `Claim`-Type gefüttert**

---

## 3. Daten-Layer (DB + Loader)

### 3.1 DB-Konsolidierung
1. **View `v_claim_full`** — joined `claims` + alle Sub-Entities zu einer breiten Zeile. Wird vom Loader für Detail-Pages benutzt.
2. **View `v_claim_listing`** — schmale View für Listen/Kanban (id, claim_nummer, phase, status, kunde-name, kennzeichen, sv_id, kundenbetreuer_id, updated_at).
3. **`faelle` abspecken** — alle Schadendaten-Spalten droppen, nur Assignment behalten. Migrations-Reihenfolge: erst Loader umstellen, dann Trigger droppen, dann Spalten droppen. (3 Migrations, je eine PR.)
4. **Trigger AAR-854 stilllegen** — sobald keine UI mehr `faelle.status`/`faelle.aktuelle_phase` liest.

### 3.2 Loader-Lib
Neue Datei: `src/lib/claims/get-claim-for-role.ts`

```ts
type Rolle = 'kunde' | 'sv' | 'kb' | 'admin' | 'kanzlei'

export async function getClaimForRole(
  supabase: SupabaseClient,
  claimId: string,
  rolle: Rolle,
): Promise<ClaimFull | null>
```

- Selektiert je Rolle eine andere Spalten-Whitelist aus `v_claim_full`
- Wirft **immer** denselben Type `ClaimFull` zurück — das Type-System sorgt für Einheitlichkeit
- RLS macht den eigentlichen Zugriffsschutz; die Whitelist ist Performance + Need-to-know

### 3.3 Type-System
Eine zentrale Type-Datei: `src/lib/claims/types.ts`

```ts
export type Claim = { ... }              // Basis (immer da)
export type ClaimFull = Claim & { ... }  // mit allen Sub-Entities
export type ClaimListing = { ... }       // schmal für Listen
```

Generated types kommen aus Supabase, aber wir wrappen sie in fachliche Types.

---

## 4. Component-Layer

### 4.1 Prinzip
**Eine Komponente pro fachlicher Aufgabe — rollenneutral.** Die Komponente bekommt `claim: ClaimFull` und `rolle: Rolle` (für Permission-Gating) als Props. Keine duplizierten `KundeFallStatusCard` + `AdminFallStatusCard` mehr.

### 4.2 Standard-Komponenten (fachlich gedacht)
| Komponente | Was zeigt sie? | Konsumenten |
|---|---|---|
| `ClaimStatusHero` | Hero-Card oben: Phase + Status + nächster Step | Alle 5 |
| `ClaimPhaseTimeline` | Phasen-Timeline mit aktueller Position | Alle 5 |
| `ClaimVehicleCard` | Fahrzeug + Schaden + Skizze | Alle 5 (read-only für Kunde nach Submit) |
| `ClaimPartiesCard` | Geschädigter + Verursacher + VS | Alle 5 |
| `ClaimPaymentsPanel` | Zahlungen, Forderungen, Eingänge (NEU) | Alle 5 |
| `ClaimMietwagenPanel` | Mietwagen-Status + Anbieter (NEU) | Alle 5 |
| `ClaimVsKorrespondenzPanel` | Briefe an/von VS | Dispatch/Admin/Kanzlei |
| `ClaimRepairsPanel` | Werkstatt-Reparaturen | Alle 5 |
| `ClaimDokumentePanel` | Files (heute schon shared) | Alle 5 |
| `ClaimMessagesInbox` | Multi-Channel-Inbox (heute schon shared) | Alle 5 |
| `ClaimAuditLog` | Audit-Trail (`webhook_events` + Status-History) | Admin only |

### 4.3 Layout-Pattern
Jede Rolle bekommt eine **`ClaimDetailShell`** mit denselben Komponenten, nur die Reihenfolge + Sichtbarkeit unterscheidet sich:

```tsx
<ClaimDetailShell rolle="kunde">
  <ClaimStatusHero />
  <ClaimPhaseTimeline />
  <ClaimMessagesInbox />        {/* Kunde: prominent */}
  <ClaimVehicleCard readOnly />
  <ClaimPaymentsPanel readOnly />
  <ClaimMietwagenPanel readOnly />
  <ClaimDokumentePanel />
</ClaimDetailShell>
```

Permission-Gating per `rolle`-Prop — keine eigenen Files.

---

## 5. Migrations-Phasen (PR-Plan)

Jede Phase = ein PR, grün durch Build + Smoke-Test, mergebar einzeln.

### Phase 0.5 — Lead → Claim Konvertierungs-Pipeline (1.5 Tage)

**Heute kaputt:** Konvertierung läuft `lead → faelle → claim` (Dual-Write via `lead-fall-mapping.ts` + `createClaimForFall`). Der Claim entsteht *nach* dem Fall — daher die Drift.

**Ziel:** Direkte Konvertierung `lead → claim`, mit `faelle`-Row als minimales Beiwerk (id, fall_nummer, sv_id, kundenbetreuer_id, service_typ, kanzlei_partner_id).

- [ ] Neue zentrale Funktion `src/lib/leads/convert-lead-to-claim.ts`:
  - Eingabe: `leadId`, `kundenbetreuer_id` (Round-Robin oder manuell vom Dispatcher)
  - Schritt 1: Volles Lead-Row laden, alle qualifizierten Felder
  - Schritt 2: **Identitäts-Mapping Lead → Claim** (eine Tabelle, eine Migration, alle 80+ Felder):
    - Schadensereignis: `unfalldatum/zeit/ort/lat/lng → claims.schaden*`
    - Hergang: `unfallhergang → claims.hergang_kunde_text`
    - Klassifikation: `schadens_art / fall_typ / unfall_konstellation / ursache → claims.*`
    - Polizei: `polizei_* → claims.polizei_*`
    - Kunde: `kunde_id → claims.geschaedigter_user_id`
    - Gegner: `gegner_versicherung_id / gegner_bekannt / gegner_anzahl_beteiligte → claims.*`
    - Schadens-Flags: `mietwagen_flag / personenschaden_flag / nutzungsausfall / sachschaden_flag → claims.hat_*`
    - Halter≠Fahrer / Auslandskennzeichen / Fahrerflucht → `claims.*`
    - **Lead-Tag**: `source_lead_id = leadId`, `created_via = 'lead_konvertierung'`, `created_by_user_id = dispatcher_id`
  - Schritt 3: Sub-Entities anlegen (in einer Transaktion):
    - `claim_parties` — Geschädigter (immer), Verursacher (falls bekannt)
    - `claim_vehicle_involvements` — Geschädigtes Fahrzeug + ggf. gegnerisches
  - Schritt 4: Minimale `faelle`-Row anlegen — `id = claim.id`, `fall_nummer`, `service_typ`, `kundenbetreuer_id`, ggf. `kanzlei_partner_id`. **Keine Schadendaten-Spalten mehr füllen.**
  - Schritt 5: `claims.phase` setzen (`1_neu`), `claims.status` (`dispatch_done`)
  - Schritt 6: `leads.status = 'konvertiert'`, `leads.converted_claim_id = <neue claim.id>`
  - Schritt 7: Audit-Eintrag in `webhook_events` + Mitteilung an KB
- [ ] Alte Dual-Write-Pipeline deaktivieren:
  - `lead-fall-mapping.ts` als deprecated, nur noch von Legacy-Tests genutzt — **wird in Phase 6 gelöscht**
  - `createClaimForFall` umbenennen zu `createClaimForFall_DEPRECATED` mit Throw-Wrapper, damit kein neuer Caller hinzukommt
  - `signSAandCreateFall` bleibt im SA-Flow, aber ruft intern `convertLeadToClaim` und legt nur die `faelle`-Assignment-Row + SA-Doc an
- [ ] Migration: Spalte `leads.converted_claim_id UUID REFERENCES claims(id)` hinzufügen
- [ ] Migration: Spalte `claims.source_lead_id UUID REFERENCES leads(id)` hinzufügen (falls nicht schon da — muss gegen Generated Types gecheckt werden)
- [ ] Test (Vitest): Conversion Smoke-Test legt einen Test-Lead an, ruft `convertLeadToClaim`, prüft alle Felder im Claim + Sub-Entities + Lead-Status
- [ ] **Vollständigkeit:** Doku `docs/lead-fall-handoff-mapping.md` ersetzen durch `docs/lead-claim-conversion.md` mit allen Mappings

**Definition of Done:**
- Ein neu konvertierter Claim hat **alle** qualifizierten Lead-Daten in seinen Spalten + Sub-Entities
- `faelle`-Row hat **keine** Schadendaten mehr — nur Assignment
- Dispatcher sieht den Lead als `konvertiert` mit Link zum Claim, hat aber keinen Read-Access mehr auf den Claim
- KB sieht den neu zugewiesenen Claim sofort in `/mitarbeiter/faelle`

### Phase 0 — Foundation (1 Tag)
- [ ] `src/lib/claims/types.ts` mit `Claim`, `ClaimFull`, `ClaimListing`
- [ ] `src/lib/claims/get-claim-for-role.ts` Loader-Lib (alle 5 Rollen-Whitelists)
- [ ] DB-View `v_claim_full` (Migration)
- [ ] DB-View `v_claim_listing` (Migration)
- [ ] Test-Route `/admin/debug/claim/[id]` zeigt rohen Loader-Output je Rolle

### Phase 1 — Kunde-Portal vollständig migrieren (2 Tage)
- [ ] `ClaimStatusHero` + `ClaimPhaseTimeline` rollenneutral
- [ ] **Komplette** `/kunde/faelle/[id]`-Page auf neuen Loader umgestellt — keine Übergangs-Mischformen
- [ ] Alle Kunde-spezifischen Komponenten migriert (`FallStatusCard` → `ClaimStatusHero` etc.) und alte Files **gelöscht**
- [ ] Lead-Übergang `/kunde/lead/[id]` ebenfalls auf Claim-Loader umgestellt (sobald Lead → Claim konvertiert wurde)
- [ ] Smoke: 3 echte Test-Claims durch alle 9er-End-Phasen → UI korrekt
- [ ] `git grep "FallStatusCard\|aktuelle_phase" src/app/kunde` muss leer sein

### Phase 2 — Drei kritische Sub-Entities (2 Tage)
- [ ] `ClaimPaymentsPanel` (Read+Write je Rolle) — schließt `claim_payments` Lücke (AAR-823)
- [ ] `ClaimMietwagenPanel` — schließt `claim_mietwagen` Lücke (AAR-824)
- [ ] `ClaimVehicleInvolvementsPanel` — schließt `claim_vehicle_involvements` Lücke (AAR-810)
- [ ] In allen 5 Portalen einbinden

### Phase 3 — SV-Portal Migration (1.5 Tage)
- [ ] `/gutachter/fall/[id]` umgestellt
- [ ] `ClaimVehicleCard` mit Befund-Edit für SV
- [ ] Termin-Logik bleibt (nicht Teil dieses Umbaus)

### Phase 4a — KB-Portal (Mitarbeiter) vollständig migrieren (2 Tage)
- [ ] `/mitarbeiter/faelle/[id]` auf Claim-Loader (Filter `kundenbetreuer_id = auth.uid()` per RLS)
- [ ] `/mitarbeiter/faelle` (Liste) auf `v_claim_listing` mit KB-Filter
- [ ] `/mitarbeiter/termine` + `/mitarbeiter/kundentermine` auf `claim → gutachter_termine` Joins umstellen
- [ ] `/mitarbeiter/tasks` auf `tasks` mit Claim-Bezug (Spalte `claim_id` statt `fall_id`)
- [ ] `/mitarbeiter/nachrichten` auf Claim-Inbox (heute schon shared, nur Loader umstellen)
- [ ] KB-spezifische Quick-Actions (Status setzen, eskalieren, KB-Notiz) auf Claim-Actions
- [ ] Alte mitarbeiter/*-Page-Komponenten **gelöscht** falls dupliziert mit Dispatch
- [ ] Smoke: KB-User testet Tagesablauf — Termine, Tasks, 1 Status-Update, 1 Nachricht raus

### Phase 4b — Dispatch + Admin Migration (2 Tage)
- [ ] `/dispatch/leads/[id]` und `/dispatch/faelle/[id]` umgestellt
- [ ] `/faelle/[id]` (Admin-Hub) umgestellt
- [ ] `ClaimAuditLog` für Admin
- [ ] `/admin/team` Leaderboard auf Claim-Counts umgestellt

### Phase 5 — Kanzlei Migration (1 Tag)
- [ ] `/kanzlei/fall/[id]` umgestellt (read-only Variants)
- [ ] Kanzlei-Dashboard + Kanban auf `v_claim_listing` umgestellt

### Phase 6 — `faelle` Cleanup (1 Tag)
- [ ] Alle `.from('faelle')` Reads in Reports/Listen auf `v_claim_listing` umstellen
- [ ] Trigger AAR-854 droppen
- [ ] `faelle`-Schadendaten-Spalten droppen (Migration mit Backfill-Verifikation)
- [ ] Alle alten Komponenten löschen (`FallStatusCard`, `FaelleKanban` etc.)

### Phase 7 — Härtung (0.5 Tag)
- [ ] E2E-Tests pro Rolle
- [ ] `git grep "faelle.status\|aktuelle_phase"` muss leer sein (außer in deprecated/migration-Files)
- [ ] Performance-Check: View-Query unter 200ms

**Gesamt-Schätzung:** 12–14 Werktage. Realistisch 3–4 Wochen mit Reviews.

---

## 5b. Vollständigkeitsregel (HART)

**Eine Phase ist nicht "fertig", wenn nur ein Teil migriert ist.** Wir bauen keine Übergangs-Mischformen, keine "alte Komponente bleibt vorerst", keine "deprecated, aber noch im Code". Pro Phase gilt:

1. **Komplette Route-Migration:** Eine Page wird in einem Rutsch umgestellt — sie liest danach **ausschließlich** aus dem neuen Loader.
2. **Alte Komponenten werden gelöscht** — nicht deprecated, nicht kommentiert, **gelöscht**. `git grep` muss leer sein.
3. **Alle Server-Actions** der betroffenen Route werden auf `claim_id` als Parameter umgestellt. `fall_id`-Parameter werden **entfernt**, nicht alias-gewrappt.
4. **Keine "Übergangs-Spalten"** — wenn eine UI einen Claim-Wert braucht, kommt er **direkt** aus dem Claim-Loader, nicht aus `faelle`-Spalten "die wir noch synced halten".
5. **Smoke-Test ist Pflicht:** Aaron testet jede Phase im Preview-Deploy mit echten Test-Claims durch alle relevanten States. Erst wenn das grün ist, ist die Phase abgenommen.

Die einzige erlaubte Ausnahme: Phase 6 droppt `faelle`-Spalten erst **nach** Abschluss aller Portal-Migrations (Phase 1-5). Bis dahin existieren die Spalten in der DB weiter, werden aber **vom Frontend nicht mehr gelesen**.

---

## 6. Definition of Done — pro Phase

Eine Phase ist erst dann fertig, wenn **alle** Punkte abgehakt sind:

1. ✅ **Build grün** (`npm run build`)
2. ✅ **Tests grün** (Vitest + Playwright wo vorhanden)
3. ✅ **Manuell verifiziert** — Aaron testet im Preview-Deploy
4. ✅ **Audit:** kein neuer Konsument von `faelle.status`/`faelle.aktuelle_phase`
5. ✅ **PR gemerged** in `staging`
6. ✅ **Notion-Update** im Master-Doc

---

## 7. Risiken + Gegenmaßnahmen

| Risiko | Wahrscheinlichkeit | Gegenmaßnahme |
|---|---|---|
| RLS-Bug → Kunde sieht fremden Claim | mittel | Phase 0: RLS-Test-Suite, vor jedem Merge `pnpm test:rls` |
| View-Performance schlecht | mittel | Phase 0: EXPLAIN ANALYZE auf realer Datenmenge, ggf. Index-Migration |
| `faelle.id ≠ claims.id` Edge-Case | gering | Phase 0: Audit-Query "WHERE faelle.id != claims.id" muss leer sein |
| Komponente in Phase 4 bricht Phase-1-Pilot | mittel | Strikter Type-Contract `ClaimFull` — Build fängt Drift |
| Aaron-Reviews bottleneck | hoch | Phase 0+1 als Demo-Branch, Aaron entscheidet danach Tempo |

---

## 8. Erste konkrete Aktion

Nach Aaron's "go": **Phase 0 starten** — neuer Branch `kitta/aar-9XX-claim-ssot-foundation`, Loader + Types + Views bauen, Smoke auf Test-Route.

Alles weitere stoppt bis Phase 0 grün ist.
