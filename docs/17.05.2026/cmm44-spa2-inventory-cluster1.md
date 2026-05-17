# CMM-44 SP-A2 PR1a — Call-Site-Inventur Cluster 1 (11 Schadenort-/Datum-Spalten)

**Datum:** 2026-05-17 · **Branch:** `kitta/cmm-44-sp-a2-semantik-duplikate`
**Spec:** `docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md`
**Methode:** `grep -rIn --include='*.ts' --include='*.tsx' "\bSPALTE\b" src/` pro Spalte,
danach pro Treffer der Tabellen-/View-Kontext gelesen.

## Rename-Mapping Cluster 1

| `faelle` (alt) | `claims` (neu) | Gruppe |
|---|---|---|
| `schadens_adresse` | `schadenort_adresse` | C |
| `unfallort` | `schadenort_adresse` | C |
| `schadens_plz` | `schadenort_plz` | |
| `schadens_ort` | `schadenort_ort` | |
| `unfallort_kategorie` | `schadenort_kategorie` | |
| `unfallort_lat` | `schadenort_lat` | |
| `unfallort_lng` | `schadenort_lng` | |
| `schadens_datum` | `schadentag` | B |
| `unfalldatum` | `schadentag` | B |
| `schadens_entdeckt_am` | `entdeckt_am` | |
| `unfall_uhrzeit` | `schadenzeit` | |

## Schema-Verifikation (live gegen `database.types.ts`)

- Alle 11 `faelle`-Spalten existieren noch auf `faelle` (Zeilen 2808-3300).
- Alle 8 `claims`-Zielspalten existieren auf `claims` (`schadenort_*`, `schadentag`,
  `entdeckt_am`, `schadenzeit`; Zeilen 1954-2400).
- `v_claim_full` + `v_claim_listing` fuehren die **neuen** claims-Namen
  (`schadenort_*`, `schadentag`, `entdeckt_am`, `schadenzeit`). Sie fuehren
  zusaetzlich noch die Legacy-Felder `schadens_ort` + `schadens_plz` (kein
  `schadens_adresse`/`schadens_datum`).
- `v_faelle_mit_aktuellem_termin` fuehrt die **alten** `faelle`-Namen (alle 11) —
  diese View ist `faelle`-basiert.
- `faelle_kunde_view` fuehrt ebenfalls die alten Namen (`schadens_datum`,
  `schadens_adresse`, `schadens_plz`, `schadens_ort`).

## Wichtige Architektur-Befunde

1. **Sync-Trigger ist gedroppt.** `supabase/migrations/20260517012837_cmm44_spa_drop_34_dup_columns.sql`
   Zeilen 603-606 droppen `trg_sync_faelle_to_claims` / `trg_sync_claims_to_faelle`.
   Code-Kommentare in `claim-duplicate-columns.ts` + `faelle/[id]/_actions/stammdaten.ts`,
   die noch "Sync-Trigger spiegelt zurueck" behaupten, sind **stale**. → Jeder `faelle`-Write
   der 11 Spalten geht verloren, muss auf `claims`.

2. **`v_faelle_mit_aktuellem_termin` + `faelle_kunde_view`** werden in der SP-A-Drop-Migration
   (noch nicht appliziert) "repointed" — sie lesen die 11 Cluster-1-Spalten weiterhin
   physisch aus `faelle.schadens_*` / `faelle.unfallort*` (SP-A droppt nur die 34
   namensgleichen Spalten, NICHT die 11 Cluster-1-Spalten). Erst SP-A2-PR2 dropt sie. Reader
   aus diesen beiden Views, die eine der 11 Spalten lesen, brechen nach SP-A2-PR2 — die
   View-Definitionen muessen in PR2 ebenfalls repointed werden (Dependency-Audit PR2 Schritt 2).

3. **Coalesce-/Dual-Quellen-Pattern.** `get-kunde-faelle.ts` + `stammdaten/schema.ts` lesen
   bereits BEIDE Tabellen und coalescen `fall.schadens_* ?? claim.schadenort_*`. Diese
   Stellen sind nicht "naiv faelle-only".

4. **`lead-fall-mapping.ts`** schreibt 8 der 11 Spalten beim Lead→Fall-Insert in `faelle`
   (RENAMED: `schadens_datum`/`schadens_adresse`/`schadens_plz`/`schadens_ort`; COPY:
   `unfall_uhrzeit`/`unfallort_lat`/`unfallort_lng`; sowie `unfallort_kategorie`).
   `convert-lead-to-claim.ts` schreibt dieselben Werte separat schon in `claims`.

## Klassifikation der Call-Sites

Legende: **R-F** = read-faelle · **R-V** = read-view · **W-F** = write-faelle ·
**JSX** = jsx-display/property-access · **R-C/W-C** = liest/schreibt schon claims ·
**TYPE** = type-only · **C** = comment · **LEAD** = Treffer betrifft `leads`/Lead-Form,
nicht `faelle` → **kein Change**.

### CHANGE-noetig (faelle-seitige Reads/Writes der 11 Spalten)

| Datei | Zeile(n) | Klasse | Spalte(n) | Hinweis |
|---|---|---|---|---|
| `src/app/admin/sachverstaendige/_karte/actions.ts` | 356, 372 | R-F+JSX | schadens_adresse/ort/plz | `.from('faelle')` select |
| `src/app/api/cron/gutachter-erinnerungen/route.ts` | 37, 67, 72 | R-V+JSX | schadens_adresse/plz/ort | aus `v_faelle_mit_aktuellem_termin` |
| `src/app/api/cron/send-reminders/route.ts` | 80, 85, 176, 179 | R-F+JSX | schadens_adresse/plz/ort | 2× `.from('faelle')` |
| `src/app/api/cron/termin-morgen-erinnerung/route.ts` | 115, 118 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/app/api/gutachter/search/route.ts` | 26, 28, 35, 66 | R-F+JSX | schadens_ort | 2× select + `.or()`-Filter |
| `src/app/api/gutachter/fall/[fallId]/termin.ics/route.ts` | 30, 72 | R-V+JSX | schadens_ort/adresse | aus `v_faelle_mit_aktuellem_termin` |
| `src/app/api/kunde/termin/ics/[id]/route.ts` | 34, 63 | R-F+JSX | schadens_adresse/ort/plz | `.from('faelle')` |
| `src/app/api/pdf/kanzlei-paket/[id]/route.tsx` | 102, 103 | R-F+JSX | schadens_entdeckt_am/datum/adresse/plz/ort | `select('*')` → Property-Zugriff |
| `src/app/api/search/route.ts` | 17, 18, 43 | R-F+JSX | schadens_ort | select + `.or()`-Filter |
| `src/app/api/sv-zuweisung/route.ts` | 53, 65, 73, 277, 294, 409, 425, 427 | R-F+W-F?+JSX | schadens_plz/adresse/ort | 4× `.from('faelle')` select; `.eq('plz', fall.schadens_plz)` |
| `src/app/api/email/send/route.ts` | 27, 79 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/app/admin/sachverstaendige/[id]/page.tsx` | 68 | R-V | schadens_ort | aus `v_faelle_mit_aktuellem_termin` |
| `src/app/faelle/[id]/_actions/stammdaten.ts` | 63-66, 126-127, 144-146, 265-267 | W-F | alle 11 (Allowlist + `updateSchadensAdresse`) | siehe OFFENE FRAGE 1+2 |
| `src/app/faelle/[id]/ai-actions.ts` | 95, 96 | R-V+JSX | schadens_datum/ort | aus `v_faelle_mit_aktuellem_termin` (`select('*')`) |
| `src/app/gutachter/auftraege/page.tsx` | 78, 191, 192 | R-F+JSX | schadens_datum/ort | `.from('faelle')` |
| `src/app/gutachter/auftraege/export-action.ts` | 132, 178 | R-F+JSX | schadens_datum | `.from('faelle')` |
| `src/app/gutachter/auftraege/AuftragCard.tsx` | 33, 34, 175, 178 | TYPE+JSX | schadens_datum/ort | Props-Type wird aus page.tsx (faelle) gespeist |
| `src/app/gutachter/faelle/page.tsx` | 104, 128, 183 | R-F+JSX | schadens_datum/ort | `.from('faelle')` |
| `src/app/gutachter/heute/page.tsx` | 45-47, 157, 403-405 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` + Coalesce mit lead |
| `src/app/gutachter/heute/TerminCard.tsx` | 62 | JSX | schadens_adresse/plz/ort | Wert aus heute/page.tsx |
| `src/app/gutachter/heute/TagesrouteSidebar.tsx` | 192 | JSX | schadens_adresse/plz/ort | Wert aus heute/page.tsx |
| `src/app/gutachter/heute/googleMapsLink.ts` | 12-14, 64-66 | TYPE+JSX | schadens_adresse/plz/ort | Type-Param aus heute/page.tsx |
| `src/app/gutachter/feldmodus/page.tsx` | 142, 228 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/app/gutachter/feldmodus/_fallakte/actions.ts` | 84, 184 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/app/gutachter/team/page.tsx` | 94, 106-108 | R-F+JSX | schadens_plz/ort/adresse | `.from('faelle')` (hat schon `claims:claim_id` embed) |
| `src/app/gutachter/team/TeamClient.tsx` | 30-32, 158 | TYPE+JSX | schadens_plz/ort/adresse | Type aus team/page.tsx |
| `src/app/gutachter/termine/[id]/page.tsx` | 44-46, 76, 86-88, 134 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` (hat `claims:claim_id` embed) |
| `src/app/gutachter/termine/[id]/navigation/page.tsx` | 37, 48 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/app/gutachter/kalender/page.tsx` | 65, 192 | R-V+JSX | schadens_ort/adresse | aus `v_faelle_mit_aktuellem_termin` |
| `src/app/gutachter/kalender/SVKalenderClient.tsx` | 20, 21, 403 | TYPE+JSX | schadens_ort/adresse | Type aus kalender/page.tsx |
| `src/app/gutachter/fall/[id]/FallDetailClient.tsx` | 250, 324, 325 | JSX | schadens_ort/adresse/plz, unfallort | Wert aus `v_faelle_mit_aktuellem_termin` |
| `src/app/kunde/faelle/[id]/page.tsx` | 447, 535 | R-V+JSX | schadens_adresse/plz/ort, unfallort | aus `v_faelle_mit_aktuellem_termin` + `faelle_kunde_view` |
| `src/app/kunde/page.tsx` | 132-134, 201 | R-V+JSX | schadens_adresse/plz/ort/datum | aus `v_faelle_mit_aktuellem_termin` |
| `src/app/kunde/faelle/page.tsx` | 68-70, 107 | R?+JSX | schadens_adresse/plz/ort/datum | Quelle ueber `get-kunde-faelle` (siehe OFFENE FRAGE 3) |
| `src/app/kunde/re-termin/[token]/page.tsx` | 28, 72 | R-F+JSX | schadens_ort | `.from('faelle')` |
| `src/app/kunde/termin/[token]/page.tsx` | 80, 156, 182 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/app/kunde/termin/[token]/actions.ts` | 101, 107 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/app/kunde/termine/[id]/page.tsx` | 41, 92 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/components/faelle/OcrAutoFillModal.tsx` | 36, 37, 90, 97 | W-F | schadens_datum/ort | Dual-Write faelle+claims (siehe OFFENE FRAGE 1) |
| `src/components/fall/StammdatenDetail.tsx` | 323, 324, 327 | JSX | schadens_adresse/plz/ort, unfallort | Wert aus fall-Objekt (faelle/View) |
| `src/components/shared/stammdaten/StammdatenReadSection.tsx` | 98-100 | JSX | schadens_adresse/plz/ort | Property-Zugriff auf fall |
| `src/components/shared/TerminCard.tsx` | 37-39, 142, 143 | TYPE+JSX | schadens_adresse/plz/ort | Props-Type fall — Caller pruefen |
| `src/components/kunde/ClaimSummary.tsx` | 71-75, 197-203, 333-340, 355 | TYPE+JSX | schadens_adresse/plz/ort/datum | Caller `get-kunde-faelle` |
| `src/components/kunde/FallKarte.tsx` | 40, 227-229 | TYPE+JSX | schadens_datum | Caller `get-kunde-faelle` |
| `src/components/makler/akte-detail/MaklerAkteDetail.tsx` | 156, 379, 380 | JSX | unfalldatum, unfallort | Wert aus `makler/queries.ts` — siehe OFFENE FRAGE 4 |
| `src/lib/actions/dispatch-fall-actions.ts` | 62, 68, 83, 572, 588 | R-F+JSX | schadens_adresse/plz/ort | 2× `.from('faelle')` |
| `src/lib/actions/termin-actions.ts` | 740, 743, 891, 894 | R-F+JSX | schadens_adresse/plz/ort | 2× `.from('faelle')` |
| `src/lib/actions/termin-verlegung-actions.ts` | 164, 180, 381, 393 | R-F+JSX | schadens_adresse/plz/ort | 2× `.from('faelle')` |
| `src/lib/auftrag/aktiver-auftrag.ts` | 29, 34 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/lib/email/google/flows.ts` | 64, 137, 309, 449, 450, 779, 786 | R-F+JSX | schadens_datum/ort/adresse/plz | 3× `.from('faelle')` |
| `src/lib/google-calendar/sv-event-sync.ts` | 117 | R-F | schadens_adresse | `.from('faelle')` |
| `src/lib/google-calendar/sv-termin-sync.ts` | 38, 39, 65, 98, 99, 112, 129, 190 | R-F+TYPE+JSX | schadens_ort/adresse | `.from('faelle')` |
| `src/lib/kalender/caldav/sv-termin-sync.ts` | 35, 36, 71, 104, 105, 117, 136, 195 | R-F+TYPE+JSX | schadens_ort/adresse | `.from('faelle')` |
| `src/lib/termine/actions.ts` | 138, 153 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/lib/termine/baseline-fahrtzeit.ts` | 59, 63-65 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/lib/termine/sv-ablehnung.ts` | 113 | R-F | schadens_plz | `.from('faelle')` |
| `src/lib/termine/trigger-losgefahren.ts` | 45, 68 | R-F+JSX | schadens_adresse/plz/ort | `.from('faelle')` |
| `src/lib/fall/queries.ts` | 41, 42, 44 | R-V | schadens_datum/adresse/plz/ort, unfallort | `FALL_SELECT`-String fuer 4× `v_faelle_mit_aktuellem_termin` |
| `src/lib/kunde/fall-karte-loader.ts` | 34-36, 137 | TYPE+JSX | schadens_adresse/plz/ort | Caller pruefen |
| `src/lib/kunde/termin-heuristik.ts` | 22-24, 60 | TYPE+JSX | schadens_adresse/plz/ort | Caller pruefen |
| `src/lib/makler/queries.ts` | 247, 248, 308 | R-V+TYPE | unfalldatum, unfallort | aus `v_faelle_mit_aktuellem_termin` (Z. 305) — siehe OFFENE FRAGE 4 |
| `src/lib/makler/copilot-prompt.ts` | 79, 163, 164 | R-F+JSX | unfalldatum, unfallort | `.from('faelle')` |
| `src/lib/claims/create-for-fall.ts` | 19-30, 73, 74, 86-92 | R-F? | alle 11 | liest `source.*` (Param), schreibt schon claims — siehe OFFENE FRAGE 5 |
| `src/lib/lead-fall-mapping.ts` | 69, 134-136, 172-175 | W-F | 8 von 11 | Lead→faelle-Insert-Mapper — siehe OFFENE FRAGE 6 |
| `src/lib/leads/convert-lead-to-claim.ts` | 417 (`.from('faelle').insert(fallInsert)`) | W-F | via lead-fall-mapping | siehe OFFENE FRAGE 6 |

### KEIN Change (leads-Treffer, Test-Seeds, Kommentare, claims-seitig)

- **LEAD** (Treffer betrifft `leads`, nicht `faelle`):
  `dispatch/leads/[id]/_actions/{hard-gate,stammdaten,schadentyp,types,debug-sv,geocode,sv-termin}.ts`,
  `dispatch/leads/[id]/_phases/{Phase1Qualifizierung,Phase2TerminServiceTyp,Phase4Stammdaten,Phase5Zusammenfassung}.tsx`,
  `dispatch/isochrone/page.tsx`, `mitarbeiter/isochrone/page.tsx`,
  `schaden-melden/MiniWizardClient.tsx`, `lib/flow/schemas/mini-wizard.ts`,
  `lib/actions/create-lead-from-mini-wizard.ts`, `lib/dispatch/karte/{triage-leads,triage-leads.test,types}.ts`,
  `lib/stammdaten/leadSchema.ts`, `components/makler/MaklerLeadsTable.tsx` (`lead.unfalldatum`),
  `flow/[token]/{actions,page}.ts(x)` (`lead.unfallort`), `lib/stammdaten/schema.ts` (`unfallort_*`-Felder
  greifen via getValue auf das fall-Objekt zu — pruefen ob faelle oder View).
- **W-F-Test/Seed** (Test-/Smoke-Daten, kein Prod-Pfad — laut Spec-Praxis idR mitgezogen,
  aber niedrige Prio): `api/admin/create-test-fall/route.ts`, `api/admin/test/cmm48-smoke/route.ts`,
  `api/seed-testdata/route.ts`, `lib/smoke/lifecycle-seed.ts`, `scripts/seed-test-data.ts`.
- **C** (Kommentar): diverse Stellen in `lead-fall-mapping.ts`, `get-kunde-faelle.ts`,
  `SchemaFields.tsx`, `(hub)/page.tsx` Z. 18/237.
- **R-C** (liest schon claims-Namen): `v_claim_full`/`v_claim_listing`-Reads mit `schadenort_*`/
  `schadentag` — keine Aktion.

## OFFENE FRAGEN (Controller-Entscheidung noetig, NICHT geraten)

1. **`faelle/[id]/_actions/stammdaten.ts` + `OcrAutoFillModal.tsx` — Dual-Write-Routing.**
   Beide nutzen den Helper `splitOrKeepFaelleUpdate()` / `claim-duplicate-columns.ts`
   (`CLAIM_OWNED_DUPLICATE_COLUMNS`-Set), der pro Feld faelle vs. claims routet. Die 11
   Cluster-1-Spalten stehen dort NICHT im claims-Set, gehen also aktuell auf `faelle`.
   ABER: Der Helper geht von **gleichnamigen** Spalten aus (`claimsUpdate[key] = value`).
   Cluster-1 ist ein **Rename** (`schadens_datum` → `schadentag`). Der bestehende Helper
   kann das nicht — er braeuchte eine Rename-Map. → Soll PR1a den `claim-duplicate-columns.ts`-
   Helper um eine Rename-Map erweitern, oder ist das CMM-48-Territorium? Der Helper ist
   shared (mehrere Caller), eine Aenderung dort beruehrt CMM-48.

2. **`updateSchadensAdresse` (`stammdaten.ts:263-267`)** schreibt `schadens_adresse/plz/ort`
   direkt auf `faelle` ohne den Split-Helper. Umstellung auf `claims` braucht die `claim_id`
   (aktuell nur `fallId` im Scope) → zusaetzlicher `claim_id`-Lookup. Bestaetigen.

3. **`get-kunde-faelle.ts` Coalesce-Bruecke.** Z. 314-316 + 469-473 lesen bewusst
   `fall.schadens_* ?? claim.schadenort_*`. Nach SP-A2-PR2 ist `fall.schadens_*` weg → der
   `fall`-Teil des Coalesce wird `undefined`. Soll PR1a den faelle-Teil schon jetzt entfernen
   (nur noch `claim.schadenort_*` lesen + `FALL_SELECT` Z. 142/370 von den 11 Spalten
   bereinigen) — das ist die saubere Loesung, geht aber ueber "Rename" hinaus. Das
   `KundenFallRow`-Interface (Z. 41-61) behaelt die Property-Namen `schadens_*` als
   API-Vertrag — die ~10 Consumer (`FallKarte`, `ClaimSummary`, …) erwarten sie. Wenn die
   Property-Namen bleiben, ist nur die Datenquelle umzustellen, nicht das Interface.
   Bestaetigen, ob Property-Namen `schadens_*` bleiben duerfen.

4. **`makler/queries.ts` liest `unfalldatum`/`unfallort` aus `v_faelle_mit_aktuellem_termin`**
   (Z. 305-308). Diese View fuehrt die alten Namen. Da die View NICHT in PR1a-Scope ist
   (kein DB-Change) und bis PR2 weiterlaeuft: bleibt der View-Read bis PR2, oder auf
   `v_claim_full`/`claims` umstellen? Pattern-Frage — die uebrigen `v_faelle_mit_aktuellem_termin`-
   Reader haben dasselbe Problem (siehe naechste Frage).

5. **`v_faelle_mit_aktuellem_termin`-Reader (~10 Dateien).** Diese View ist `faelle`-basiert
   fuer die 11 Spalten. Optionen: (a) Reader auf `v_claim_full`/`claims` umstellen — aber
   `v_claim_full` fuehrt z.B. `schadentag` als neuen Namen, nicht `schadens_datum`, und hat
   `fall_id` statt `id`; das ist ein groesserer Umbau pro Datei. (b) Reader auf View belassen
   und in PR2 die View-Definition repointen (sie gibt dann weiter `schadens_*` aus, zieht
   aber aus `claims`). Variante (b) ist deutlich kleiner und vermeidet, dutzende
   Cron-/Kalender-/Email-Reader umzubauen. Welche Variante?

6. **`lead-fall-mapping.ts` + `convert-lead-to-claim.ts` Lead→faelle-Insert.** `lead-fall-mapping`
   schreibt 8 der 11 Spalten beim Fall-Insert in `faelle`; `convert-lead-to-claim` schreibt
   dieselben Werte separat schon in `claims`. Nach SP-A2-PR2 sind die faelle-Spalten weg →
   der faelle-Insert wuerde mit "column does not exist" crashen. Soll PR1a die 8 Eintraege
   aus `LEAD_TO_FALL_RENAMED_FIELDS` + `LEAD_TO_FALL_COPY_FIELDS` jetzt entfernen? Das ist
   ein Write-Change im Scope, aber `lead-fall-mapping` ist ein shared Mapper — Konsumenten
   gegenpruefen.

7. **`create-for-fall.ts`** liest `source.<11 Spalten>` aus einem Funktions-**Parameter**
   (nicht aus `faelle` direkt) und schreibt sie korrekt in `claims` (`schadenort_*` etc.).
   Der Parameter-Typ ist `Partial<...>` mit den alten Namen. Da die Quelle des Parameters
   ein faelle-Row sein kann: bleibt der Parameter-Vertrag, oder umstellen? Vermutlich
   **kein Change** (claims-Write ist schon korrekt), aber der Caller bestimmt's.

## Aufloesung der offenen Fragen (Controller-Entscheidung 2026-05-17)

- **Q1** — `claim-duplicate-columns.ts` bleibt unveraendert. Cluster-1-Felder in
  `stammdaten.ts` / `OcrAutoFillModal.tsx` werden NICHT ueber den Helper geroutet,
  sondern direkt mit dem neuen Namen auf `claims` (eigene Rename-Map im Caller).
- **Q2** — `updateSchadensAdresse` holt jetzt `claim_id` und schreibt `schadenort_*` auf claims.
- **Q3** — `KundeFallRow`-Property-Namen `schadens_*` bleiben (TS-Vertrag); nur die
  Datenquelle umgestellt (faelle-Teil des Coalesce entfernt, `FALL_SELECT` bereinigt).
- **Q4+Q5** — `v_faelle_mit_aktuellem_termin`-Reader bleiben UNVERAENDERT (Variante b);
  die View wird in PR2 repointet. Betrifft u.a. `fall/queries.ts`, `ai-actions.ts`,
  `makler/queries.ts`, `gutachter-erinnerungen`, `kalender/page.tsx`,
  `admin/sachverstaendige/[id]/page.tsx`, `termin.ics/route.ts`, `MaklerAkteDetail`,
  `FallDetailClient`, `kunde/faelle/[id]/page.tsx` (`getKundeFallDetailRecord`-Pfad).
- **Q6** — 8 faelle-Insert-Eintraege aus `lead-fall-mapping.ts` entfernt. Coverage
  verifiziert: `convert-lead-to-claim.ts` schreibt alle 8 claims-seitig
  (`schadentag`/`schadenort_*`/`schadenzeit`). Ausnahme: `unfallort_lat/lng` —
  claims-Seite nutzte vorher `kunde_lat/lng`; `convert-lead-to-claim.ts` jetzt auf
  `lead.unfallort_lat ?? lead.kunde_lat` erweitert, damit kein Write verloren geht.
- **Q7** — `create-for-fall.ts` hat 2 Caller (`convert-lead-to-claim.ts`,
  `admin/faelle/anlegen/actions.ts`); beide uebergeben ein aus Lead/Form gebautes
  `source`-Objekt, KEINE faelle-Row. claims-Write ist korrekt. → **kein Change**.

### Zusaetzlich gefunden (nicht in der Erst-Inventur)

- `src/lib/termine/get-sv-tagesplan.ts` — `.from('gutachter_termine')` mit
  geschachteltem `faelle!...(...)`-Join der 3 Schadenort-Spalten. Umgestellt auf
  geschachtelten `claims:claim_id(schadenort_*)`-Embed. (Erst-Grep filterte
  `from('faelle')` und verpasste den nested Join.)
- `api/gutachter/search/route.ts` + `api/search/route.ts` — `.or()`-Filter konnten
  `schadens_ort` nicht ueber Embeds filtern; der `schadens_ort`-ilike-Such-Term
  wurde entfernt (Suche laeuft ueber fall_nummer/kennzeichen/mandatsnummer; Anzeige
  via `schadenort_ort`-Embed). Minimaler Funktions-Verlust, dokumentiert.

## Empfehlung

Der "reine Reader-Rename" der Spec trifft fuer die **eindeutigen R-F-Selects** (ca. 30
Dateien) zu und ist mechanisch machbar. Die 7 offenen Fragen betreffen shared Mapper,
Dual-Write-Helper und die `v_faelle_mit_aktuellem_termin`-Strategie — hier wuerde Raten
Lead-Konversion + Termin-Emails still brechen. PR1a sollte erst nach Klaerung von Frage
5 (View-Strategie, bestimmt ~10 Dateien) + Frage 1/6 (Writer) ausgefuehrt werden.
