# Vertrieb-CRM — Umbrella-Design (vereintes Partner-Lebenszyklus-CRM)

> **Status:** Design-Entwurf zur Aaron-Review. Bewusst als EINE Gesamt-Spec geschrieben
> (Aaron 08.07.: „erst Gesamt-Spec, dann Phase + Owner entscheiden"). Nach Freigabe →
> writing-plans je Phase.

**Ziel (ein Satz):** Die heute in 5 Silos verstreute Partnerverwaltung (SV-Leads,
Partner-Leads, Makler, Werkstätten, Sachverständige) wird zu EINEM Nav-Punkt „Vertrieb"
— einem CRM über den GANZEN Partner-Lebenszyklus `Lead → Onboarding → aktiver Partner`,
mit sauberem abgeleitetem Zustand, Roster/Pipeline, Karte, workflow-getriebenem Detail
und einem Kalender-Feldmodus für die Vertriebs-Admins.

**Architektur (zwei Sätze):** Das Vertrieb-CRM ist der **partner-seitige Zwilling des
ops-cockpit-Rebuilds** (der dasselbe für die Claim-Seite tut) und übernimmt dessen
bewährtes „Approach-C"-Muster: EINE abgeleitete Zustands-Basis (`deriveVertriebState` +
gegatete `v_vertrieb_kontakt`-View + `vertrieb-workflow`-Registry) treibt alle Flächen.
Tabellen bleiben unangetastet — die Vereinheitlichung passiert **derive-on-top** (View +
reine TS-Ableitung), nicht per Schema-Rip.

**Tech-Stack:** Next.js 15 (RSC + `@drawer`-Intercepts), Supabase (RLS-gegatete Views +
`createAdminClient` NACH Role-Guard), `src/lib/status`-Registry, `shared/DataTable` +
`primitives/*`, Mapbox (`LiveOpsMap`), `admin_termine` (Kalender-Sync Google/CalDAV/Outlook).

---

## 0. Kontext & Auftrag

**Aaron (08.07.):** „Ich möchte, dass wir die gesamte Partnerverwaltung in einen Nav-Punkt
und ein CRM als ‚Vertrieb' bekommen — also die SV-Leads, die Partner-Leads, die Makler, die
Werkstätten und die Sachverständigen. Ein zusammengefasstes CRM und saubere Prozesse. Plus
Karte. Und die Admins im Vertrieb sollen in ihrem Kalender eine Art Feldmodus bekommen."

**Der Reframe (entscheidend):** Ein Vertriebs-CRM **existiert bereits** —
`/admin/partner-leads` (PR #3678 live, ausgebaut in #3863/#3921: Scraping, CSV-Import,
**Convert→Konto** für makler/werkstatt/sv, Onboarding-Termine auf `admin_termine`). Aber es
deckt nur die **Lead-/Akquise-Seite** ab. Ziel dieser Spec: dieses CRM zum **Schirm über den
gesamten Lebenszyklus** machen — kein neues, konkurrierendes System.

**Die Symmetrie:** Parallel läuft der **ops-cockpit-Rebuild** (Session 470d55c9, live in
staging: v_claim_workstate + `src/lib/ops` + KB-Kanban + Admin-Rollup-Matrix + voll
editierbares Detail). Das ist exakt dasselbe für die **Claim-Seite**. Das Vertrieb-CRM ist
die **Partner-Seite** desselben Musters. Es MUSS dieses Muster spiegeln (Konsistenz +
Wiederverwendung), nicht ein drittes divergentes Cockpit werden.

---

## 1. Ist-Zustand (Warum)

### 1.1 Die 5 Silos

| Entität | Heute | Reife | Status-Modell |
|---|---|---|---|
| **Partner-Leads** | `/admin/partner-leads` (= das CRM, #3678/#3863) | ausgebaut (Lead-Seite) | `partner_leads` (stage/status) |
| **SV-Leads** | Karten-Dead-Pins + `/admin/sv-leads` | Daten-only / Basis-Liste | `sv_leads.ist_aktiv` (bool) |
| **Sachverständige** | `/admin/sachverstaendige` (Karten-Hub + `@drawer`) | reif, aber verstrickt | 6 überlappende Spalten (s.u.) |
| **Makler** | via `/admin/team` angelegt (kein Roster/Detail) | nascent | `makler.status` (aktiv/pending) |
| **Werkstätten** | Portal + `v_werkstatt_auftrag` + admin-detail-Lane | im Aufbau | eigene Lifecycle |

**Kein gemeinsames Partner-Modell, kein „Vertrieb"-Nav.** Jedes Silo hat eigenes
Status-/Lifecycle-Modell, eigene (oder keine) Admin-UI, eigenen (oder keinen) Onboarding-Flow.
Der `/admin/partner`-Hub deckt nur Organisationen/Communities/Versicherer ab — nicht
Makler/Werkstatt.

### 1.2 Die SV-Modell-Fragmentierung (repräsentativ für „unsaubere Prozesse")

Der SV-Detail (mein Ausgangs-Scope) zeigt die Wurzel: **Verifizierung = 4 überlappende
Konzepte** (Tier-1-Pflichtdokumente + Tier-2-14-Tage + manueller `verifiziert`-Toggle +
Basic-Freigabe) und **Onboarding-Status = 3 überlappende Spalten**
(`onboarding_status` / `portal_zugang_freigeschaltet` / `ist_aktiv`), die auseinanderlaufen
können (Stripe-Webhook setzt zwei zusammen). Dazu: `gesperrt_*` schreibt legacy `deaktiviert_*`
doppelt; Quali-Nummern in 3 Spalten; `VerifizierungsTab.tsx` **959 LOC** (4 Workflows in einer
Datei); `SvDetailClient.tsx` **498 LOC** (Bearbeiten + Sperren + Welcome-Mail vermischt);
`anlegen/actions.ts` **1548 LOC** ohne Transaktions-Sicherheit. Gemischte Auth-Muster
(`createClient` vs `createAdminClient`), kein Audit-Log.

### 1.3 Was das ops-cockpit für die Claim-Seite schon gelöst hat (das Vorbild)

- **EINE abgeleitete Work-State-Basis** statt Ad-hoc-Queries: `v_claim_workstate` (gegatet)
  + `deriveClaimWorkflowState` (TS) + `claim-workflow`-Registry.
- **Approach C = 3 Schichten:** Layer-1 Read-Detail (TS-Ableitung) · Layer-2 Read-Aggregat
  (SQL-Rollup `v_ops_rollup`) · Layer-3 Write→Basis (editierbare Felder + enum-sicherer
  Override + Audit→`timeline`).
- **Lead-View ≠ Claim-View STRIKT getrennt** (verschiedene Phasen-Achsen), vereint NUR im
  TS-`WorkItem` (discriminated union `by kind`) — kein lossy SQL-UNION.
- **Layouts:** KB = Phase-Kanban + Hover-Split (editierbar); Admin = Rollup-Matrix
  (Phase×Owner-Heatmap) + KPI + Attention + Drill-in.
- **Kritische RLS-Lehren** (gelten 1:1 für unsere Views): jede DEFINER-View über eine
  Basis-View MUSS ein explizites Row-Gate tragen (sonst PII-Leak + `audit_ungated_definer_views()`
  blockt ALLE SQL-PRs); shared Default-Deny-Tabellen liest man via `createAdminClient()`
  **nach** einem Role-Guard (adminClient ohne Guard = IDOR).

---

## 2. Leitprinzipien

1. **Derive-on-top, kein Schema-Rip.** Die 5 Tabellen bleiben. Vereinheitlichung = eine
   `v_vertrieb_kontakt`-View + eine reine `deriveVertriebState`-Funktion darüber. Das ist das
   Haus-Muster (v_claim_workstate, deriveLeadWorkflowState) — niedriges Risiko, sofortiger
   Round-trip, twin-drift-frei.
2. **Das ops-cockpit-Muster spiegeln, kein 3. System.** Gleiche Schichten, gleiche
   Registry-Mechanik, gleiche Präsentations-Bausteine (Stepper/Hero/Panel), gleiche
   Write/Override/Audit-Actions. Divergenz vermeiden.
3. **Umbrella, nicht Ersatz.** Das existierende `/admin/partner-leads`-CRM wird absorbiert
   (nicht neu gebaut); Convert/Scraping/CSV/Geocode/admin_termine werden **wiederverwendet**.
4. **Reuse überall:** `shared/DataTable`, `StatusBadge`, `@drawer`-Pattern, `LiveOpsMap`,
   die generischen Workflow-Bausteine (aus lead-/claim-workflow gehoben), `admin_termine`
   (Kalender-Sync existiert), geteiltes `geocodeAddress`.
5. **RLS-Disziplin (nicht verhandelbar):** jede View row-gated; `createAdminClient` nur nach
   Role-Guard; `audit_ungated_definer_views()` + `audit_claim_views_leaking_to_nobody()` = 0.
6. **DoD 1+:** jede Phase Branch→PR→staging→`build` grün→Prod-Smoke mit echten Inputs
   (nur Test-Accounts) bis „rund" (alle Rollen/Kanten, kein 5xx, keine toten Buttons/leeren Views).

---

## 3. Fundament — das Vertrieb-Modell (Layer 1–3)

### 3.1 Der „Vertrieb-Kontakt" (die vereinte Projektion)

Ein **Vertrieb-Kontakt** = ein Lead ODER ein aktiver Partner. Gemeinsame Dimensionen:

```
VertriebKontakt {
  id: string
  kind: 'sv-lead' | 'partner-lead' | 'sv' | 'makler' | 'werkstatt'   // discriminant
  quelle_tabelle: 'sv_leads'|'partner_leads'|'sachverstaendige'|'makler'|'werkstaetten'
  name: string                    // firmenname / ansprechpartner / vorname+nachname
  kontakt: { email, telefon }     // projiziert, PII-gegated
  standort: { lat, lng, plz, ort } | null
  stufe: VertriebStufe            // ABGELEITET (s. 3.3)
  owner_id: string | null         // Vertriebs-Admin (zugewiesen_an / aktiviert_von)
  quelle: string | null           // self_service / scraping / csv / claim / ...
  erstellt_am, letzte_aktivitaet_am
  // kind-spezifische Rohfelder als schmale Extension (nicht flach vereint)
}
```

### 3.2 Drei Schichten (Approach C, wie ops-cockpit)

- **Layer 1 — TS `deriveVertriebState(row) → VertriebKontakt`** (rein, TDD). Leitet `stufe`
  first-match aus den kind-spezifischen Feldern ab. Analog zu `deriveLeadWorkflowState`
  (23 Tests) / `deriveClaimWorkflowState`. Liefert die discriminated union `by kind`.
- **Layer 2 — `v_vertrieb_kontakt`** (SQL-View): projiziert die 5 Tabellen auf das gemeinsame
  Schema (UNION ALL der 5 Quellen mit `kind`-Discriminant + Standard-Spalten). **Gegatet**:
  nur `rolle in ('admin','dispatch')` sieht alles; `security_invoker` ODER explizites Gate.
  Rohe kind-Felder bleiben in den Quell-Tabellen; die View trägt nur das Gemeinsame + `kind`.
  - **Layer 2b — `v_vertrieb_rollup`** (Aggregat, `security_invoker`, wie `v_ops_rollup`):
    `kind × stufe × owner`-Counts + „braucht Aufmerksamkeit"-Flag. Row-gate-frei, weil
    counts-only + kein PII → audit=0.
- **Layer 3 — Write→Basis:** `updateVertriebFeld(kind, id, feld, wert)` (Whitelist je kind,
  Role-Guard, Audit→`timeline`) + `setzeVertriebStufe`/Override wo sinnvoll. Result-Object,
  `revalidatePath`. Reine Wiederverwendung des ops-cockpit-`updateClaimField`-Musters.
- **Registry-Domain `vertrieb-workflow`** (`src/lib/status/domains/`): Label + Farb-Slot je
  `VertriebStufe` (policy-konform, 7 Token-Slots, kein inline-Map).

### 3.3 Die `stufe`-Achse (die „sauberen Prozesse")

EINE abgeleitete Lebenszyklus-Achse, aus den fragmentierten Rohspalten konsolidiert
(Spalten bleiben; die Ableitung ist die Wahrheit):

```
neu → kontaktiert → onboarding → aktiv → pausiert/inaktiv → gesperrt/verloren
```

**Per-kind-Verfeinerung** (die Ableitung kennt die kind-Nuancen):
- **sv-lead / partner-lead:** `neu → kontaktiert → (convert) → onboarding`. Danach lebt der
  Kontakt als `sv`/`makler`/`werkstatt` weiter (gleiche id-Kette via convert).
- **sv:** `onboarding` = ¬portal_zugang ∨ ¬vertrag ∨ Verifizierung-offen (Tier-1/Tier-2/Basic
  → als EIN abgeleiteter „Verifizierungs-Substatus" gebündelt); `aktiv` = verifiziert ∧
  portal_zugang ∧ ist_aktiv; `gesperrt` = gesperrt_seit; `pausiert` = urlaub.
- **makler:** `status` (pending→onboarding, aktiv→aktiv).
- **werkstatt:** eigener Lifecycle (Vermittler vs Reparateur — s. werkstatt-auftrag-Lane).

**Kern-Effekt:** Das SV-Onboarding/Verifizierungs-Chaos (onboarding_status / portal_zugang /
ist_aktiv / verifiziert / verifizierung_status / Tier-1/2/Basic) kollabiert in EINE `stufe`
+ EINEN abgeleiteten „was fehlt noch"-Fortschritt — sichtbar überall gleich.

---

## 4. Die 4 Flächen (`/admin/vertrieb`)

### ① Roster / Pipeline (Landing)

- **Segmentierbar** nach `kind` (Alle / Sachverständige / Makler / Werkstätten / Leads) und
  `stufe`. Zwei Modi:
  - **Tabelle (Roster):** Management-Sicht — Suche, Filter, Sort, Status-Spalte (`vertrieb-
    workflow`-Badge), Owner, Standort, letzte Aktivität. `shared/DataTable`.
  - **Kanban (Pipeline):** Akquise-Sicht — `stufe` als Spalten (neu→kontaktiert→onboarding→
    aktiv), Karten mit Hover-Aktionen. Muster wie ops-cockpit-KB.
- **Triage-KPIs oben:** „X Leads neu · Y Onboarding offen · Z Verifizierung offen · N gesperrt"
  (aus `v_vertrieb_rollup`).
- **Schluckt:** `/admin/partner-leads` (Lead-Kanban) + die SV-Liste + Makler + Werkstatt →
  EINE Fläche. Klick Zeile/Karte → Detail-Drawer (③).

### ② Karte (Modus)

- Partner + Leads räumlich. **Reuse `LiveOpsMap`** (heute SV-only) → erweitert auf alle
  `kind`s mit typ-farbigen Pins (+ Leads als eigener Pin-Typ). Klick Pin → Detail-Drawer.
- Filter/Segmente gespiegelt zum Roster (gleicher Zustand, andere Darstellung).

### ③ Detail (workflow-getrieben, pro Entität)

Der **partner-seitige Zwilling der Claim-Detail-„Phase 4+"** (ops-cockpit Scope-Erweiterung
„Claim-Detail ops-normalisiert für alle Rollen"). Ersetzt die verstrickten SV-Tab-Monolithen
durch EINE typ-/rollen-parametrierte Ansicht:

- **Next-Best-Action-Hero** (aus `deriveVertriebState`): der nächste Schritt — „kontaktieren"
  / „Onboarding-Termin vereinbaren" / „Tier-2 verifizieren" / „freischalten" / „Rückruf".
- **Stufen-Stepper** (Pipeline-Schiene) + **Zustands-Badge** (`vertrieb-workflow`).
- **Voll-editierbare Felder** (analog ops-cockpit-Hover, aber vollständig) + Audit.
- **Progressive, typ-spezifische Sektionen:**
  - *SV:* Verifizierung (Tier-1/2 als EIN entzerrter Block), Pakete, Isochrone/Standort,
    Kalender-Verbindung, Abrechnung.
  - *Makler:* Provision/Staffelung, Promo-Code, Consent, Leads/Attribution.
  - *Werkstatt:* Aufträge (`v_werkstatt_auftrag`), Abrechnungsweg, Vermittler-vs-Reparateur.
  - *Lead:* Convert→Konto (reuse `convert-partner-lead`/`anlege-partner`), Qualifizierung.
- **Timeline** (Audit + Termine + Aktivität).
- **Reuse:** die generischen Workflow-Bausteine (Stepper/Hero/Panel — aus lead-/claim-workflow
  generisch gehoben), die Write-Actions, das `@drawer`-Pattern.

### ④ Kalender-Feldmodus (Vertriebs-Admins)

- Der **Tag des Vertriebs-Admins** mit seinen Partner-/Lead-Terminen (auf `admin_termine` —
  die partner-leads-CRM-Phase-2 legt Onboarding-Termine genau dort ab; Kalender-Sync
  Google/CalDAV/Outlook existiert schon).
- **Feld-/Routen-Modus wie der SV-Tagesmodus:** die heutigen Besuche/Calls als räumliche Route
  + Zeitachse; „unterwegs zu Prospect X". Reuse des SV-Tagesmodus/Feldmodus-Musters.
- Verbindet Roster/Detail (Termin am Kontakt) mit der Karte (Route) — ein Kontext.

---

## 5. Status-/Modell-Konsolidierung (die „sauberen Prozesse")

Alles VIA Ableitung, **nicht** per Schema-Rip (jetzt):
- SV: `onboarding_status / portal_zugang_freigeschaltet / ist_aktiv / verifiziert /
  verifizierung_status / Tier-1/2/Basic` → EINE `stufe` + abgeleiteter „was fehlt".
- Makler: `status`. Werkstatt: eigener Lifecycle. Sperre: `gesperrt_*` kanonisch,
  legacy `deaktiviert_*` als deprecated markiert (nicht mehr lesen).
- **Optionaler späterer Schema-Cleanup** (eigene, spätere Phase — z.B. `deaktiviert_*` droppen,
  Onboarding-Booleans zu einem Enum) ist **nicht Teil dieses Rebuilds**; erst wenn die
  Ableitung überall Wahrheit ist.

---

## 6. Zerlegung in Phasen (spiegelt den ops-cockpit-Rollout)

| Phase | Deliverable | Kein UI? | Owner-Kandidat |
|---|---|---|---|
| **P0 — Fundament** | `deriveVertriebState` (TDD) + gegatete `v_vertrieb_kontakt` + `v_vertrieb_rollup` + `vertrieb-workflow`-Registry + Write/Override/Audit-Actions + Status-Ableitung-Konsolidierung | ja | eine Session (koord. mit ops-cockpit-`src/lib`) |
| **P1 — Shell + Roster/Pipeline** | `/admin/vertrieb`-Nav + Roster (Tabelle+Kanban) + Segmente + Triage-KPIs; **absorbiert `/admin/partner-leads`** | nein | koord. mit partner-leads-CRM-Lane |
| **P2 — Detail (der große)** | workflow-getriebenes Partner-Detail, **SV zuerst** (entwirrt VerifizierungsTab/SvDetailClient), dann Makler/Werkstatt/Lead | nein | koord. mit Claim-Detail-Phase-4+ (gemeinsames generisches Detail-Muster) |
| **P3 — Karte** | `LiveOpsMap` auf alle `kind`s + Leads | nein | — |
| **P4 — Kalender-Feldmodus** | Vertriebs-Admin-Feldmodus auf `admin_termine` (Route + Sync) | nein | koord. mit partner-leads-CRM-Phase-2-Termine + SV-Tagesmodus |

Jede Phase: Branch → PR gegen `staging` → `build` grün → Prod-Smoke (echte Inputs,
Test-Accounts) bis 1+. P0 ist rein additiv (Views + `src/lib` + Registry) und blockt niemanden.

---

## 7. Koordination (Lanes — kein Trampeln, kein 3. System)

- **ops-cockpit (470d55c9, live in staging):** der Claim-Zwilling. **Muster + Bausteine
  wiederverwenden** (WorkItem-Vertrag, Registry-Mechanik, Cockpit-Komponenten, Write/Override/
  Audit). Offene Entscheidung: gemeinsames `src/lib/ops` (WorkItem-Union um `partner`-kinds
  erweitern) **vs** eigenes `src/lib/vertrieb` (parallel, gleiches Muster). Das ops-cockpit
  sagt explizit „andere Sessions: NICHT parallel Admin-/KB-Dashboards neu bauen" → das
  Vertrieb-CRM ist eine **andere Domäne** (Partner ≠ Fall), aber MUSS abgestimmt sein, damit es
  dasselbe Muster teilt statt divergiert.
- **partner-leads-CRM (e8aa73d4, Session beendet — Phase-2-Spec wartet auf Aaron):**
  `/admin/partner-leads` + `src/lib/partner/{scraping,csv-import,convert-partner-lead,
  anlege-partner}.ts` werden von **P1 absorbiert** und **wiederverwendet** (nicht neu). Die
  offene Phase-2 (Onboarding-Termine/CSV-Smart-Mapping/Geocoding auf `admin_termine`) fügt sich
  nahtlos in P1 (Convert/Geocode) + P4 (Termine/Feldmodus). Deren 4 offene Entscheidungen
  (Video-Link, Geocode-Zeitpunkt, Convert-Block, Reihenfolge) bleiben gültig.
- **SV-Verwaltung (`/admin/sachverstaendige`):** wird von P1 (Roster) + P2 (Detail) absorbiert;
  **Legacy-Redirect erhalten** (Bookmarks). Der SV-Karten-Hub wird zur `/admin/vertrieb`-Karte
  (②).
- **Makler (`/admin/team`-createMakler)** + **Werkstatt (admin-werkstatt-detail-Lane +
  `v_werkstatt_auftrag`):** bekommen ihr Roster/Detail in P1/P2 (heute nascent) — **additiv**.
- **RLS/Grants:** jede neue View trägt das explizite Gate; shared Default-Deny-Tabellen
  (flow_links etc.) via `createAdminClient` **nach** Role-Guard. Beide RLS-Audits = 0 (Pflicht-
  build-Step). Kein Broad-Grant ohne koordinierte Entscheidung.

---

## 8. Error-Handling & Testing

- **Server-Actions:** Result-Object (`{ ok; error? }`), Role-Guard als Pre-Condition,
  `revalidatePath`, non-kritische Sub-Ops (Mail/Timeline) in lokalem try/catch, Audit→`timeline`.
- **`deriveVertriebState`:** TDD — Unit-Tests je `stufe` × `kind` + Prioritäts-Kollisionen
  (ausführbare Spec, wie deriveLeadWorkflowState 23 Tests). Env=node → am Element-Typ prüfen
  (Primitive-Stubs laufen nicht bei Funktionsaufruf).
- **Views:** RLS-Audit=0 gegen Prod verifiziert (JWT-Sim); `v_vertrieb_kontakt` gegatet,
  `v_vertrieb_rollup` counts-only.
- **Ratchets:** token-audit/component-set/status-registry/knip 0-neu (NACH `git add` laufen).
- **Prod-Smoke je Phase:** Playwright mit echten Inputs, nur Test-Accounts, frischer SW-freier
  Browser, bis 1+.

---

## 9. Offene Entscheidungen (für Aaron)

1. **Nav-Konsolidierung:** `/admin/partner-leads` **umbenennen** zu `/admin/vertrieb` (Redirect)
   oder `/admin/vertrieb` als neue Shell, die das Bestehende hostet?
2. **`src/lib`-Grenze:** gemeinsames `src/lib/ops` mit dem ops-cockpit (WorkItem-Union um
   `partner`-kinds erweitern) **oder** eigenes `src/lib/vertrieb` (parallel, gleiches Muster)?
3. **Erste Phase:** P0 Fundament (sauberste Basis, UI erst später) **vs** P1 Shell/Roster
   (schnell sichtbarer Nutzen, Fundament härtet unterwegs)?
4. **Owner-Verteilung:** Wer baut welche Phase? (partner-leads-CRM-Lane beendet; ops-cockpit-
   Lane aktiv auf Claims; SV-/Makler-/Werkstatt-Lanes teils aktiv.)
5. **SV-Migrations-Timing:** `/admin/sachverstaendige` sofort in `/admin/vertrieb` absorbieren
   oder parallel weiterlaufen lassen bis P2-Detail steht?
6. **Feldmodus-Scope:** nur Termine-Route + Kalender **oder** auch Live-Standort/Check-in (wie
   SV-Tagesmodus mit Tracking)?
7. **SV-Leads-Rolle:** bleiben sie Daten-only (Karten-Pins) **oder** werden sie im Roster
   erst-klassige Recruiting-Leads (eigene Akquise-Pipeline neben Partner-Leads)?

---

## 10. Zusammenfassung

Das Vertrieb-CRM ist **kein Greenfield**, sondern die Vollendung von zwei bereits laufenden
Bewegungen: (a) das partner-leads-CRM (Lead-Seite) und (b) das ops-cockpit-Muster (abgeleiteter
Zustand → Board → Detail, bewiesen auf der Claim-Seite). Es zieht sie unter EINEN
`/admin/vertrieb`-Schirm, konsolidiert die 5 Partner-Silos über EINE abgeleitete `stufe`
(derive-on-top, kein Schema-Rip), und liefert die 4 Flächen Roster/Pipeline · Karte ·
workflow-getriebenes Detail · Kalender-Feldmodus. Der Bau ist streng phasiert (P0 Fundament →
P4 Feldmodus), jede Phase koordiniert mit ihrer Nachbar-Lane, jede bis 1+ auf Prod.
