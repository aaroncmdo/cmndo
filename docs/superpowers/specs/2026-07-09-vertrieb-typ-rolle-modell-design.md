# Vertrieb-Konsole: Typ×Rolle-Modell + Lead-Vereinheitlichung — Design-Spec

**Datum:** 2026-07-09 · **Owner:** Session 0db72344 · **Status:** Design (Spec-first, Aaron 09.07.)

**Ziel (ein Satz):** Die Vertrieb-Konsole um ein 2-Achsen-Modell (**Typ**: Partner/Lead × **Rolle**: SV/Makler/Werkstatt) neu ordnen, die doppelte Lead-Quelle auf **partner_leads** vereinheitlichen, und alle Funktionen (Scraping/CSV/Zuweisung role-aware, QR-Pool) sauber unter's Dach bringen — Makler als gleichrangige Rolle.

## 1. Aaron-Entscheidungen (verbindlich)

- **Lead-Quelle vereinheitlichen:** `partner_leads` = **einzige** Lead-Quelle; die `sv-lead`-Branch fliegt aus der View. `sv_leads` bleibt nur noch für die Dead-Pin-Karte (bis migriert).
- **Spec-first**, dann Umsetzung in Phasen.
- **Aufteilen in Partner und Lead**, filterbar nach Rolle, in **einer** Ansicht + auf der **Karte**.
- **Scraping/CSV/Zuweisung role-aware** und unter dem Dach.
- **Makler** gleichrangig mitdenken.

## 2. Datenbefund (Prod `paizkjajbuxxksdoycev`, MCP-verifiziert 09.07.)

- `sv_leads` = **62** (DAT-Kaltpins, nur SV, alle mit Koordinaten). Speist `getDeadPins` (SV-LiveOpsMap).
- `partner_leads` = **63**: **62 rolle=sachverstaendiger** (`source_channel=dat_import`, alle mit Koordinaten, `zugewiesen`/`eingestuft`=0) + **1 rolle=werkstatt**. **0 rolle=makler.**
- **Überlappung: 62/62** — alle `partner_leads(rolle=sv)` sind auch `sv_leads` (Backfill-Migration `20260705183746`). → `sv_leads` zu 100% in `partner_leads` dupliziert; `v_vertrieb_kontakt` zeigt sie **doppelt** (`sv-lead` + `partner-lead`).
- Aktive Partner: `sachverstaendige`=14, `makler`=7, `werkstaetten`=14.
- Intern: 17 Mehr-Standort-Firmen (Filialen) — bereits per Roster-Collapse behandelt (#4016).

## 3. Modell: Typ × Rolle

| Quelle | Typ | Rolle |
|---|---|---|
| `sachverstaendige` | Partner | SV |
| `makler` | Partner | Makler |
| `werkstaetten` | Partner | Werkstatt |
| `partner_leads` | Lead | aus `rolle` (sachverstaendiger→SV / makler→Makler / werkstatt→Werkstatt) |
| ~~`sv_leads`~~ | — | **nicht mehr in der View** (Altlast → nur Dead-Pin-Karte) |

- **Typ** = Partner (aktiv/onboarding) vs Lead (Interessent).
- **Rolle** = SV/Makler/Werkstatt — die neue Filter-Achse (ersetzt die 5 flachen `kind`-Segmente).
- **Eine Ansicht** (Roster) + **Karte**, beide filterbar nach Typ × Rolle, farbcodiert.

## 4. Änderungen je Schicht

### 4.1 Datenschicht (View + Derive) — my lane (#4003-Migrations-Lineage)
- **`v_vertrieb_kontakt`:** `sv-lead`-Branch **entfernen**. `partner-lead`-Branch: `rolle`-Spalte exponieren (`partner_leads.rolle`, normalisiert auf `sv|makler|werkstatt`).
  - ⚠ **Vorher-Gate (P1):** verifizieren, dass **jeder** `sv_lead` einen `partner_leads`-Twin hat (Bijektion), damit kein Lead beim Entfernen still verloren geht. Query: `sv_leads` ohne Match in `partner_leads(rolle=sv)` MUSS 0 sein; sonst zuerst Rest-Backfill.
- **`vertrieb-kontakt.types` + `derive-vertrieb-state`:** neue abgeleitete Felder `typ: 'partner'|'lead'` und `rolle: 'sv'|'makler'|'werkstatt'`.
  - `typ`: `kind ∈ {sv,makler,werkstatt}` → `partner`; `kind='partner-lead'` → `lead`.
  - `rolle`: `sv`→sv, `makler`→makler, `werkstatt`→werkstatt, `partner-lead`→(neues `rolle`-View-Feld).
  - `kind` bleibt intern; `typ`/`rolle` sind die UI-Achsen. `sv-lead`-kind entfällt.

### 4.2 Verwaltungs-Ansicht: Leads/Partner-**Switch** — my lane (console) [Aaron 09.07.]
- **Primärer Switch (segmented): `[ Leads | Partner ]`** — die Typ-Achse als **Modus**, nicht als flacher Filter. Zwei Modi mit je eigenen Filtern/Spalten/Aktionen (Leads = Akquise, Partner = Bestandspflege — unterschiedliche Arbeit).
- **Rolle-Filter (geteilt, chips):** `Alle · SV · Makler · Werkstatt`.
- **Modus-spezifisch:**
  - **Leads:** Einstufung (heiß/warm/kalt) · Stufe (neu/kontaktiert) · Betreuer · Suche · Aktionen **[Scrapen (Rolle vorbelegt)] [CSV] [Zuweisen] [Konvertieren]**.
  - **Partner:** Status (aktiv/onboarding/pausiert/gesperrt) · (SV: Verifizierung) · Suche.
- **Ansicht-Toggle `[ Liste | Karte ]`** — beide spiegeln Switch + Filter.
- Firmen-Collapse (#4016) bleibt (Leads). Zeilen-Klick → **rollen-spezifisches Detail**.
- **Absorbiert die Phase-A-Sub-Nav:** „Partner-Leads"-Tab → Leads-Modus; SV/Makler/Werkstatt-Tabs → Rolle-Filter im Partner-Modus.

### 4.3 Karte — my lane (console)
- `VertriebKarteClient` **folgt dem Switch**: zeigt die Pins des aktiven Modus (Leads ODER Partner), **Farbe nach Rolle**. Kein Dual-Encoding nötig — der Switch trennt Typ schon (s. §9). Rolle-Filter + Suche wirken auch auf die Karte. Alle Standorte sichtbar (`partner_leads` geocoded).

### 4.4 Funktionen unter's Dach (SURFACE/MOUNT, nicht neu bauen)
- **Scraping role-aware:** `partner_leads`-Scrape-Modal (Rolle+Region, Google Places) — im gemounteten CRM ✓; zusätzlich aus der Lead-Ansicht triggerbar mit **Rolle aus dem aktiven Filter vorbelegt** (SV→„Kfz-Sachverständige", Makler→„Versicherungsmakler", Werkstatt→„Kfz-Werkstatt").
- **CSV-Import pro Rolle:** Modal im gemounteten CRM ✓; Rolle vorbelegt.
- **Zuweisung (Betreuer):** `partner_leads.zugewiesen_an` — im CRM ✓; zusätzlich aus dem Detail (`updateVertriebFeld` um `zugewiesen_an` erweitern, Whitelist).
- **QR-Pool (Werkstatt):** `/admin/vertrieb/werkstaetten/qr-pool` + `/drucken` als Re-Export **mounten** (Audit-Lücke: heute Link zur Altroute → raus aus der Konsole).
- **SV-Sub-Routen:** `anlegen` / `basic-freigaben` / `[id]` mounten; **`/leads` = obsolet** (Leads jetzt in `partner_leads`) → Redirect/entfernen.

### 4.5 Makler — gleichrangige Rolle (Aaron „denk an die makler")
- **Makler-Lead:** `partner_leads` rolle=makler (Scraping „Versicherungsmakler", CSV, Einstufung, Zuweisung, Convert → `makler`). Aktuell 0 — aber voll im Modell (Filter/Karte/Scraping-Preset).
- **Makler-Partner:** `makler`-Tabelle (Typ=Partner, Rolle=Makler) mit **makler-spezifischen Feldern** — Gesellschaft/Versicherung, Maklerpool, **Dual-Provision** (komplett vs. nur-Gutachter) — in der Makler-Detail/Verwaltung (gemountet `/admin/vertrieb/makler` ✓).
- **Makler-Convert:** `partner_lead` rolle=makler → `makler` (mit gesellschaft/pool/provision) + Welcome-Mail — e8aa73d4-Flow, unter's Dach gemountet, nicht neu gebaut.
- **Onboarding-Asymmetrie bewusst:** SV = Verifizierung/Basic-Freigaben; Werkstatt = QR-Pool; Makler = Gesellschaft/Pool/Provision. Das Detail-Cockpit rendert **rollen-spezifisch**, nicht SV-geformt.

## 5. Lanes / Koordination

- **partner_leads-CRM (e8aa73d4):** Lead-Quelle + Tooling (Scraping/CSV/Einstufung/Aktivitäten/Convert/Zuweisung, `rolle`-Feld) = BESTAND. **Surface/Mount, nicht neu bauen.** rolle-View-Exposition abstimmen.
- **getDeadPins/Karte (6c630247):** `sv_leads`→`partner_leads`-Migration der Dead-Pin-Karte = **Follow-up** (danach `sv_leads` droppbar). Bis dahin bleibt `sv_leads` nur dort.
- **Makler-Lane:** makler-Verwaltung + Convert-Provision.
- **AdminNav-Shell (eb3e46ca/2a18c1b0):** orthogonal.

## 6. Invarianten

- `v_vertrieb_kontakt` bleibt `security_invoker` + `revoke anon/authenticated`/`grant service_role` → beide RLS-Audits = 0.
- Bestehende Routes bleiben; Mounts = Re-Export (keine Duplikation, kein Trampeln).
- **`partner_leads` = Single Source für Leads** (keine Parallel-Pflege).
- Kein Lead-Verlust beim sv-lead-Branch-Entfernen (Bijektions-Gate P1).
- Design-Tokens/Umlaute/Komponenten-Set; alle Ratchets 0-neu.

## 7. Phasen (je eigener PR gegen staging)

- **P1 — Datenschicht:** Bijektions-Gate → View (`sv-lead` raus, `rolle` rein) + `derive` (typ/rolle) + Types + Tests. Klein, my lane. (Migration auf #4003-Lineage.)
- **P2 — Roster + Karte:** Typ×Rolle-Filter (ersetzt kind-Segmente) + Karten-Farbcodierung (Rolle=Farbe, Typ=Form). my lane.
- **P3 — Funktionen unter's Dach:** QR-Pool + SV-Sub-Routen mounten; `/leads`-Redirect; Scraping/CSV/Zuweisung aus der Ansicht triggerbar (Rolle vorbelegt). my lane + e8aa73d4-Abstimmung.
- **P4 — Makler-Vollausbau + Karten-Vereinheitlichung:** rollen-spezifisches Detail-Cockpit (Makler: Gesellschaft/Pool/Provision; SV: Verifizierung; Werkstatt: QR/Fähigkeiten); `getDeadPins`→`partner_leads` (6c630247) → `sv_leads` droppen.

## 8. Was schon steht (Fundament)

- P0/P1 (#3960/#3983 gemergt): Registry + `deriveVertriebState` + `v_vertrieb_kontakt` + Loader/Rollup + Roster + Detail-Drawer + Deep-Links + AdminNav „Vertrieb".
- #4003 (offen): notizen + Lead-Dedup-View (`konvertiert`/aktiv-als-SV-Exclusion).
- #4016 (offen): Ein-Dach-Konsole (Layout+Sub-Nav+Karte+4 Mounts) + Firmen-Collapse.

## 9. Entscheidungen (Aaron 09.07.) + Rest-Offen

- **✅ Verwaltung = Leads/Partner-Switch** (segmented, je eigene Filter — §4.2). Das **löst die Karten-Typ-Frage:** die Karte folgt dem Switch (ein Typ je Modus, Farbe=Rolle) — kein Form/Deckkraft-Dual-Encoding nötig.
- **Offen (klein, im Bau entscheidbar):** `/leads`-Altroute (308-Redirect vs. still entfernen); Makler-Scraping-Default („Versicherungsmakler") mit e8aa73d4.
