# CMM-44 Phase-6 Breaker-Inventar — RE-VALIDIERT gegen aktuellen Code

**Datum:** 2026-05-24 · **Branch:** `kitta/cmm61-datenverlust-writer` (= aktueller staging-Stand, HEAD `c0ef05a1`)
**Master:** CMM-44 (`faelle`-Drop / Claim-SSoT-Vollmigration) · **Gate fuer:** Phase 6 (`DROP TABLE faelle CASCADE`)
**Input:** `docs/23.05.2026/cmm44-phase6-reader-sweep-inventory.md` (417 statische Grep-Treffer)
**Methode:** Jede Fundstelle gegen den AKTUELLEN Code geoeffnet (±20 Zeilen Kontext), Embed/View/Helper/Kommentar von echten Top-Level-`faelle`-Zugriffen getrennt. NUR Analyse, kein Code-Change ausser dieser Datei.

---

## 0 · Warum dieser zweite Lauf

Der erste Lauf (417 „Breaker") war ein **statisches Literal-Grep** und hat massiv False-Positives produziert:
das Grep sah einen relocateten Spaltennamen *irgendwo* in der Naehe eines `.from('faelle')` und flaggte ihn —
unabhaengig davon, ob der Name in einem Embed (`kanzlei_faelle(...)`), einem View-Read
(`from('v_faelle_mit_aktuellem_termin')`), einem Helper-Write (`upsertKanzleiFall(...)`) oder nur in einem
Kommentar stand. Zusaetzlich sind seit dem ersten Lauf die **Zeilennummern verschoben** (der Code wurde
weitergebaut), d.h. die `Datei:Zeile`-Angaben des ersten Laufs treffen oft die falsche Zeile.

Dieser Lauf klassifiziert jede der 417 Fundstellen in eine von 5 Klassen:
- **FP-Embed** — Spalte steht in `kanzlei_faelle(...)` / `claims:claim_id(...)` / `gutachter_termine(...)` / `auftraege(...)` / `gutachten(...)` / `claim_parties(...)`. Kein faelle-Spalten-Zugriff.
- **FP-View** — `.from(...)` ist eine **View** (`v_faelle_mit_aktuellem_termin`), nicht `faelle`. Caller sauber (View selbst evtl. Breaker → §V).
- **FP-Helper** — Write geht ueber `upsertKanzleiFall` / `writeAuftragSpH` / Split-Helper, nicht `.from('faelle').update/insert`.
- **FP-Kommentar/entfernt** — Spaltenname nur in Kommentar/Type, oder aus dem `select`/`insert` **entfernt** (Code liest/schreibt ihn nicht mehr; Wert kommt aus separatem Sub-Table-Read).
- **GENUINE** — echter Top-Level-`.from('faelle').select/eq/or/gte/lte/order/in/not/is/update/insert('<relocateteSpalte>')`.

> **NEU in diesem Lauf — die Views (§V).** Der erste Lauf hat die **faelle-basierten View-Definitionen**
> komplett uebersehen. `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`, `v_claim_full`,
> `v_claim_listing`, `v_claim_timeline` sind alle `FROM faelle ...` gebaut → sie **sterben mit `DROP TABLE
> faelle CASCADE`** und mehrere exponieren relocatete Spalten via `f.<col>` (teils schon **jetzt stale**).
> Das sind echte Breaker, die in keiner der 417 Code-Fundstellen auftauchen.

---

## 1 · Zusammenfassung (korrigiert)

| Kennzahl | Erster Lauf | **Re-validiert** |
|---|---:|---:|
| Fundstellen gesamt (Code) | 417 | 417 |
| davon **GENUINE** (echter faelle-Top-Level-Zugriff auf relocatete Spalte) | (alle 417 als HARD/SOFT) | **~338** |
| davon **FALSE-POSITIVE** | 0 | **~75** |
| davon **GRENZFALL** (Spalte bleibt faelle-nativ — kein Relocation-Breaker, nur Table-DROP) | — | **4** |
| **Views** (FROM faelle, sterben bei DROP) — NEU | 0 | **6** (4 mit relocateten Spalten exponiert) |

### False-Positive-Aufschluesselung (~75)

| FP-Klasse | Anzahl | Dominante Quelle |
|---|---:|---|
| **FP-View** (Caller liest `v_faelle_mit_aktuellem_termin`) | **17** | `regulierung_am` in DashboardStats / MonatsUmsatzForecast / WichtigeUpdates / finance-hub / abrechnungen-generator |
| **FP-Embed** (`kanzlei_faelle(...)` / Nested) | **18** | `regulierung_am`, `ruege_*`, `kuerzungs_betrag`, `vs_kuerzung_grund`, `mandatsnummer`, `kanzlei_id` |
| **FP-Helper** (`upsertKanzleiFall` etc.) | **11** | `vs_eskalationsstufe`, `anschlussschreiben_*`, `ruege_*`, `regulierung_am`, `mandatsnummer` (Writes) |
| **FP-Kommentar/entfernt** (aus Select/Insert raus) | **~29** | `mandatsnummer` (filmcheck/push-mandat/kanzlei-wunsch), `get-kunde-faelle:419` kanzlei-Cols, `kunde-ownership:4` Kommentar |
| **Summe FP** | **~75** | |

> **Wichtigste Erkenntnis:** Die FP-Reduktion kommt fast ausschliesslich aus dem **kanzlei_faelle-Bucket
> (4.A)** und den **kanzlei-Cols in get-kunde-faelle**. Dort sind die Writer laengst auf `upsertKanzleiFall`
> umgestellt und die Reader auf Embed/View — der erste Lauf hat den alten Spaltennamen im Kommentar/daneben
> gesehen. Die **grossen genuinen Cluster (`kunde_id` 61×, `fahrzeug_*`/`fin_*` vehicles 55×, `created_at`/
> `updated_at` 93×) bleiben FAST VOLLSTAENDIG GENUINE** — `kunde_id` ist ein Top-Level-Ownership-Filter
> (`.eq('kunde_id', user.id)`, nicht embeddbar), `fahrzeug_*` ist noch SSoT auf faelle (SP-E pending).

### GENUINE-Verteilung nach Ziel-Bucket

| Ziel-Sub-Tabelle | GENUINE | Slice-Status | Kommentar |
|---|---:|---|---|
| `claims` (Timestamps `created_at`/`updated_at`) — §V.TS | **~91** | DONE | mechanische Filter/Order/Update-Begleit. Top-Level auf faelle bestaetigt. |
| `claim_parties` (`kunde_id` + Parteien) — §G.B | **~109** | IN-FLIGHT (SP-C) | `kunde_id` 60× (Top-Level-Ownership) + gegner_*/halter_*/kunde_*-Namen/Adresse/Bank |
| `vehicles` (`fahrzeug_*`/`fin_*`) — §G.C | **55** | PENDING (SP-E) | alle Top-Level — noch SSoT auf faelle, korrekt heute, Breaker bei DROP |
| `claims` (Business) — §G.G | **~21** | DONE | lead_preis_*, marketing_*, polizei (else-Zweig), org, dispatch, konvertiert_am |
| `kanzlei_faelle` — §G.A | **7** | DONE → **latent buggy** | NUR diese 7 echt: stripe-webhook(2), search-or(1), kanzlei_honorar(4) |
| `?` Vorschaeden — §G.F | **~9** | PENDING (SP-F) | hat_vorschaeden/vorschaden_* (typ-b dyn. + cardentity select) |
| `gutachter_termine` — §G.D | **5** | DONE | besichtigungsort-Fallback-Write (§2 #1!) + re_termin_token×2 |
| `gutachten` — §G.E | **2** | DONE | nutzungsausfall_tagessatz, wertminderung (fall-finanzen top-level) |
| Seed/Test (dev-only) — §G.SEED | **~33** | gemischt | create-test-fall(19) + seed-testdata + lifecycle-seed — Top-Level-Inserts |
| dynamische Writes (§4.K) | **5** | gemischt | ocr-fahrzeugschein/ocr-gutachten/typ-b/VorOrtPanel/ocr-trigger |
| SOFT `select('*')` | **4** | — | load-needed-phases / kanzlei-wunsch:712 / copilot-prompt / pdf-route |

> Die Bucket-GENUINE-Zahlen ueberlappen mit dem TS-Bucket (eine Zeile kann `kunde_id`-select **und**
> `created_at`-order sein → zaehlt in beiden). Gesamt-GENUINE ~338 ist die Summe ueber alle Buckets inkl. TS.

---

## 2 · Die echten Top-Prioritaeten (nach Re-Validierung)

1. **`kunde_id`-Ownership-Filter portalweit (60× GENUINE).** Bestaetigt Top-Level
   (`lib/claims/kunde-ownership.ts:55` `.select('id, claim_id, kunde_id, ...')`,
   `app/kunde/layout.tsx:78/93/137/176/223` `.eq('kunde_id', user.id)`, +50 weitere). `kunde_id` ist NICHT
   embeddbar (Ownership-Vergleich), bleibt der hoechste echte Cluster. SP-C muss vor DROP auf
   `claims.geschaedigter_user_id` / `claim_parties` umstellen. **Einziger FP hier:** `kunde-ownership.ts:4`
   (Zeile steht im Doc-Kommentar).

2. **`app/api/stripe/webhook/route.ts:338` — `.from('faelle').update({ kanzlei_provision_status,
   kanzlei_provision_ausgezahlt_am }).in('id', fallIds)` — ECHT GENUINE.** Der erste-Lauf-Annahme
   („Writer alle gefixt") widerspricht: diese Stelle nutzt **kein** `upsertKanzleiFall`, schreibt zwei
   kanzlei_faelle-Spalten direkt auf faelle (in einem `try/catch`). Latent buggy jetzt (KFZ-188
   Provisions-Auszahlung landet in toter faelle-Kopie).

3. **`app/kunde/faelle/[id]/_actions/besichtigungsort.ts:69` — faelle-Fallback-Write (besichtigungsort_*).**
   Bestaetigt: Haupt-Write geht auf `gutachter_termine`, aber der `if (!writeOk)`-else-Zweig (Zeile 68-76)
   schreibt `besichtigungsort_adresse/lat/lng` direkt auf faelle. **Hard-Breaker bei DROP** (else schreibt
   auf gedroppte Spalten). Braucht Termin-Platzhalter-Migration.

4. **`app/api/search/route.ts:28` — `.or('mandatsnummer.ilike...')` auf faelle — GENUINE.** Code-Kommentar
   sagt selbst „faelle.mandatsnummer additiv vorhanden bis Phase-6". Top-Level-`.or()`-Filter (nicht
   embeddbar) → Mandat-Volltextsuche bricht bei DROP; fuer neue Faelle schon jetzt degradiert.

5. **Views `v_faelle_mit_aktuellem_termin` + `v_claim_full` + `faelle_kunde_view` + `faelle_sv_view` (§V).**
   Alle `FROM faelle f`. `v_claim_full` exponiert `f.mandatsnummer` **stale** (Spalte ist nach SP-I2 auf
   kanzlei_faelle, View liest weiter faelle). Heavy-Consumer (SV-Portal, finance-hub, vs-timer). **Diese
   sechs Views muessen vor `DROP TABLE faelle` auf claims/Sub-Tables umgebaut oder gedroppt werden.**

---

## V · Views auf `faelle` gebaut — ECHTE Breaker (vom ersten Lauf uebersehen)

Geprueft: die jeweils **letzte** `CREATE OR REPLACE VIEW`-Definition jeder View in `supabase/migrations`.
Jede `FROM faelle`/`JOIN faelle`-View stirbt bei `DROP TABLE faelle CASCADE`.

| View | Basis | exponiert relocatete Spalten via `f.`? | Consumer (src/) | Verdikt |
|---|---|---|---|---|
| **`v_faelle_mit_aktuellem_termin`** | `FROM faelle f` + JOIN claims/gutachten/kanzlei_faelle/gutachter_termine(LATERAL)/auftraege(LATERAL)/claim_parties(LATERAL) | **JA:** `f.fahrzeug_hersteller/modell/baujahr/typ` (vehicles), `f.gegner_name/versicherung/kennzeichen` (claim_parties), `f.fin_quelle/fin_extrahiert_am` (vehicles), `f.vorschaden_*/cardentity_abfrage_am` (vorschaeden) — daneben korrekt repointet: kanzlei→`kf.`, gutachten→`g.`, termin→`t.`, kunde-name→`cp_g.` | DashboardStats, MonatsUmsatzForecast, WichtigeUpdatesWidget, finance/(hub)/page, abrechnungen-generator, fall-finanzen-Embed-Quelle | **BREAKER** — hoechste Reichweite |
| **`v_claim_full`** | `FROM claims c LEFT JOIN faelle f` + gutachten/kanzlei_faelle | **JA:** `f.mandatsnummer` (**STALE!** → kanzlei_faelle seit SP-I2), `f.fahrzeug_hersteller/modell/typ` (vehicles), `f.gegner_anzahl_beteiligte/gegner_fahrzeugtyp` (claim_parties), `f.hat_vorschaeden/vorschaden_anzahl/_letzter_datum/_typ_b_bericht` (vorschaeden), `f.organisation_id`, `f.kunde_id` — korrekt repointet: anschlussschreiben_am/vs_eskalationsstufe/regulierung_am→`kf.` | SV-Portal (v_claim_full ist SV-Hauptread, CMM-60), vs-timer/route.ts:42 | **BREAKER** — `f.mandatsnummer` schon jetzt stale |
| **`faelle_kunde_view`** | `FROM faelle f` + claims/kanzlei_faelle/gutachter_termine(LATERAL) | **JA:** `f.fahrzeug_hersteller/modell/baujahr` (vehicles), `f.auszahlung_kunde_betrag/_eingegangen_am`, `f.kunde_id` — eskalation/vs_quote/nachbesichtigung/besichtigungsort korrekt auf `kf.`/`spd_termin.` | `kunde/faelle/[id]/page.tsx:271`, `kunde/nachbesichtigung/[fall_id]/page.tsx:23` + actions.ts:56 | **BREAKER** (aktiv genutzt) |
| **`faelle_sv_view`** | `FROM faelle f` + claims/gutachten/kanzlei_faelle/auftraege(LATERAL)/gutachter_termine(LATERAL) | **JA:** `f.fahrzeug_hersteller/modell/baujahr` (vehicles), `f.kunde_id` — kanzlei/gutachten/termin korrekt repointet | `gutachter/fall/[id]/page.tsx:165` (mandatsnummer-Read) | **BREAKER** (aktiv genutzt) |
| **`v_claim_listing`** | `FROM claims c LEFT JOIN faelle f` (+profiles+vehicles) | **NEIN** — nur `f.claim_id/id/sv_id` (faelle-nativ) | (Listing-Views) | **BREAKER strukturell** (JOIN-Dependency stirbt bei CASCADE) — aber keine stale Daten |
| **`v_claim_timeline`** | mehrere Subqueries `FROM faelle f` / `JOIN faelle f ON f.id = pt.fall_id` | **NEIN** — nur `f.claim_id/id` | Timeline-Reads | **BREAKER strukturell** (CASCADE) — keine relocateten Cols |

**Nicht betroffen (claims-/Sub-Table-basiert, kein faelle):** `v_gutachten_werte` (`FROM claims+gutachten`),
`v_claim_for_gast` (`FROM claims`), `v_claim_sv` (`FROM claims`, CMM-60), `v_claim_parties_safe` (`FROM claim_parties`).

> **Umbau-Reihenfolge Views:** `v_claim_full` + `v_faelle_mit_aktuellem_termin` sind die kritischen — beide
> muessen auf `FROM claims` umbauen (faelle-Daten via Sub-Table-JOIN ziehen). `v_claim_full.f.mandatsnummer`
> ist sogar JETZT ein Bug (stale) und sollte auf `kf.mandatsnummer` repointet werden, unabhaengig vom Drop.

---

## §G · GENUINE-Breaker nach Ziel-Bucket

### §G.A · → `kanzlei_faelle` — nur **7 GENUINE** (von 64 im ersten Lauf!)

| Datei:Zeile (aktuell) | Spalte | Zugriff | Warum genuine |
|---|---|---|---|
| `app/api/search/route.ts`:28 | `mandatsnummer` | or | Top-Level `.or('mandatsnummer.ilike...')` auf faelle; Kommentar bestaetigt „additiv bis Phase-6" |
| `app/api/stripe/webhook/route.ts`:338 | `kanzlei_provision_status` | update | `.from('faelle').update({...}).in('id', fallIds)` — KEIN upsertKanzleiFall |
| `app/api/stripe/webhook/route.ts`:338 | `kanzlei_provision_ausgezahlt_am` | update | s.o. (zweite Spalte im selben Update) |
| `lib/abrechnung/kanzlei/erstelle-abrechnung.ts`:105 | `kanzlei_honorar` | select | Top-Level im Select neben `kanzlei_faelle(kanzlei_id)`-Embed |
| `lib/analytics/finance.ts`:104 | `kanzlei_honorar` | select | `.from('faelle').select('id, kanzlei_honorar')` |
| `lib/analytics/finance.ts`:104 | `kanzlei_honorar` | not | `.not('kanzlei_honorar', 'is', null)` Top-Level |
| `lib/finance/fall-finanzen.ts`:57 | `kanzlei_honorar` | select | Top-Level im Select neben `kanzlei_faelle(regulierung_am)`-Embed |

> **`kanzlei_honorar`** ist im Phase-1-Doc auf kanzlei_faelle gemappt, wird aber an 3 Stellen noch
> top-level von faelle gelesen → echte Breaker (latent buggy: kanzlei_honorar fuer neue Faelle null).
> Alle anderen 4.A-Treffer sind FP (Detail §FP).

**GRENZFALL (2): `kanzlei_provision_status`** in `erstelle-abrechnung.ts:106` (`.eq`) + `:231` (`.update`):
Der Code behandelt die Spalte explizit als **faelle-nativ** (Server-Filter `'berechtigt'` + Bulk-`.in`-Update
`'abgerechnet'`, Kommentar „kanzlei_provision_status bleibt faelle-native"). Wenn das stimmt (Phase-1-Doc
mappt sie zwar auf kanzlei_faelle), sind das **keine Relocation-Breaker** — nur Table-DROP-Kandidaten.
**→ menschlich klaeren: ist `kanzlei_provision_status` relocatet oder faelle-nativ?**

### §G.B · → `claim_parties` (`kunde_id` + Parteien) — ~109 GENUINE (von 117)

**`kunde_id` (60 GENUINE, 1 FP):** ALLE als Top-Level `.eq('kunde_id', …)` / `.select('…kunde_id…')` /
`.update({kunde_id})` / `.or('kunde_id…')` / `.is('kunde_id', null)` / `.in('kunde_id', …)` bestaetigt
(per Voll-Grep verifiziert — `claims:claim_id(...)`-Embed steht IMMER separat daneben, `kunde_id` selbst
ist top-level). **Einziger FP:** `lib/claims/kunde-ownership.ts:4` (Doc-Kommentar, nicht Code).

Repraesentative GENUINE (Voll-Liste = inventory §4.B minus kunde-ownership:4):
`app/kunde/layout.tsx`:76/91/135/174/221 · `lib/claims/kunde-ownership.ts`:55 ·
`lib/claims/get-kunde-faelle.ts`:190(eq)/426(select) · `lib/whatsapp.ts`:264 ·
`lib/notifications/fan-out.ts`:28 · `app/api/cron/kb-termin-reminder*/route.ts` · `lib/actions/termin-actions.ts`:124/233/411/438/691 · usw.

**Parteien-Snapshot-Spalten (alle Top-Level-Select/Update, GENUINE):**

| Datei:Zeile | Spalte(n) | Zugriff | Bucket |
|---|---|---|---|
| `lib/kanzlei/email-fallback.ts`:34 | `firma_name, kunde_vorname/nachname/telefon/strasse/plz/stadt` (+kunde_id) | select | cp Geschaedigter/Adresse |
| `lib/kanzlei/push-mandat.ts`:84 | `firma_name, kunde_vorname/nachname/telefon/strasse/plz/stadt` (+kunde_id) | select | cp (`mandatsnummer` NICHT mehr drin → FP) |
| `lib/lexdrive/email-sender.ts`:39 | `gegner_kennzeichen, gegner_name, gegner_versicherung` | select | cp Verursacher |
| `lib/makler/copilot-prompt.ts`:251 | `gegner_versicherung` | select | cp.versicherung_klartext |
| `app/admin/sachverstaendige/_karte/actions.ts`:358 | `kunde_vorname, kunde_nachname` | select | cp |
| `app/kanzlei/kanban/page.tsx`:63 | `kunde_vorname, kunde_nachname` | select | cp (Top-Level, `mandatsnummer` daneben = Embed) |
| `app/kanzlei/mandate/page.tsx`:38 | `kunde_vorname, kunde_nachname` | select | cp |
| `app/api/ocr-trigger/route.ts`:132 | `halter_geburtsdatum` | select | cp Halter |
| `app/api/ocr-trigger/route.ts`:138 | `halter_geburtsdatum` | update | cp Halter (auch §4.K) |
| `lib/dokumente/erwartung.ts`:243 | `halter_nachname, ist_fahrzeughalter` | select | cp Halter |
| `app/kunde/faelle/[id]/actions.ts`:93 | `iban, bic, kontoinhaber, bankdaten_hinterlegt_am` | update | cp/Bankdaten |
| `lib/claims/get-kunde-faelle.ts`:430 | `gegner_versicherung, bankdaten_hinterlegt_am` | select | cp |

### §G.C · → `vehicles` — 55 GENUINE (alle bestaetigt Top-Level)

Alle `fahrzeug_hersteller/modell/baujahr`, `fin_vin`, `fin_quelle`, `fin_extrahiert_am`, `lackfarbe_code`,
`erstzulassung`, `kilometerstand` sind Top-Level-Select/Update auf faelle (per Voll-Grep verifiziert).
SP-E PENDING → faelle ist HEUTE noch SSoT, korrekt; Breaker erst bei DROP.

Bestaetigte Stellen (= inventory §4.C, unveraendert GENUINE):
`app/api/sv/upload-with-ocr/route.ts`:81/103 · `app/faelle/[id]/_actions/stammdaten.ts`:357 (fin_vin/quelle/extrahiert_am update) ·
`app/gutachter/auftraege/{page.tsx:80,export-action.ts:137}` · `app/gutachter/{feldmodus,heute,team,termine}` ·
`app/kunde/termine/{page.tsx:26,[id]/page.tsx:43}` · `app/gutachter/fall/[id]/actions.ts`:417 (fin_vin update) ·
`lib/cardentity/typ-b.ts`:137 · `lib/claims/get-kunde-faelle.ts`:430 · `lib/email/google/flows.ts`:66/332 ·
`lib/google-calendar/sv-{event,termin}-sync.ts` · `lib/kalender/caldav/sv-termin-sync.ts`:72 ·
`lib/inbound/match-fall.ts`:76 · `lib/kanzlei-wunsch/actions.ts`:634 (SMOKE-Seed update) · `lib/termine/get-by-token.ts`:81

### §G.D · → `gutachter_termine` — 5 GENUINE

| Datei:Zeile | Spalte | Zugriff | Warum genuine |
|---|---|---|---|
| `app/kunde/faelle/[id]/_actions/besichtigungsort.ts`:69 | `besichtigungsort_adresse` | update | else-Fallback-Write auf faelle (Haupt-Write → gutachter_termine) |
| `app/kunde/faelle/[id]/_actions/besichtigungsort.ts`:69 | `besichtigungsort_lat` | update | s.o. |
| `app/kunde/faelle/[id]/_actions/besichtigungsort.ts`:69 | `besichtigungsort_lng` | update | s.o. |
| `app/kunde/re-termin/[token]/actions.ts`:48 | `re_termin_token` | eq | `.eq('re_termin_token', token)` Top-Level (Kommentar: „verbleibt auf faelle fuer Suche") |
| `app/kunde/re-termin/[token]/page.tsx`:~32 | `re_termin_token` | eq | s.o. |

> `re_termin_token`: Kommentar sagt es bleibt auf faelle, Phase-1-Doc mappt auf gutachter_termine.
> Top-Level-Filter → bricht bei DROP. Grenzfall (Heimat-Klaerung), aber als Top-Level-faelle-Zugriff genuine.

### §G.E · → `gutachten` — 2 GENUINE

| Datei:Zeile | Spalte | Zugriff | Warum genuine |
|---|---|---|---|
| `lib/finance/fall-finanzen.ts`:57 | `nutzungsausfall_tagessatz` | select | Top-Level im faelle-Select |
| `lib/finance/fall-finanzen.ts`:57 | `wertminderung` | select | Top-Level im faelle-Select |

### §G.G · → `claims` (Business) — ~21 GENUINE

| Datei:Zeile | Spalte | Zugriff | Notiz |
|---|---|---|---|
| `app/admin/faelle/anlegen/actions.ts`:103 | `dispatch_id`, `konvertiert_am` | insert | Top-Level-Insert (dispatch_id 0-cov) |
| `app/admin/finance/(hub)/offene-faelle/page.tsx`:51 | `lead_preis_netto` | is | `.is('lead_preis_netto', null)` |
| `app/admin/finance/(hub)/page.tsx`:646 | `lead_preis_netto` | select+not | Top-Level (monatFaelle-Query) |
| `app/api/cron/case-billing-batch/route.ts`:52 | `lead_preis_netto` | is | Top-Level |
| `app/api/cron/community-leaderboard-update/route.ts`:63 | `lead_preis_netto` | select | Top-Level |
| `app/api/cron/monatsabrechnung/route.ts`:80 | `lead_preis_netto/typ/berechnet_am` | update | Top-Level-Update ×3 |
| `app/gutachter/team/actions.ts`:46 | `organisation_id` | select | Top-Level |
| `app/gutachter/team/page.tsx`:97 | `organisation_id` | eq | `.eq('organisation_id', …)` |
| `app/gutachter/termine/[id]/actions.ts`:388 | `polizei_aktenzeichen` | update | else-Fallback (claim-Pfad primaer) |
| `lib/abrechnung/process-case-billing.ts`:31 | `lead_preis_netto` | select | Top-Level |
| `lib/abrechnung/revert-case-billing.ts`:30 | `lead_preis_netto` | select | Top-Level |
| `lib/actions/sv-lead-ablehn-actions.ts`:56 | `lead_preis_netto` | select | Top-Level |
| `lib/analytics/finance.ts`:111(orig 107) | `marketing_provision` | select+not | Top-Level ×2 |
| `lib/finance/abrechnungen-generator.ts`:101 | `marketing_quelle` | select | Top-Level |
| `lib/finance/fall-finanzen.ts`:57 | `marketing_provision`, `marketing_quelle` | select | Top-Level ×2 |
| `lib/leads/convert-lead-to-claim.ts`:521 | `kundenbetreuer_id` | eq | `.eq('kundenbetreuer_id', …)` Top-Level |

> `kundenbetreuer_id` ist sonst ueberall `claims:claim_id(kundenbetreuer_id)`-Embed (korrekt, nicht geflaggt) —
> nur `convert-lead-to-claim.ts:521` ist ein Top-Level-`.eq` → genuine.

### §G.F · → Vorschaeden (SP-F PENDING) — ~9 GENUINE

| Datei:Zeile | Spalte(n) | Zugriff |
|---|---|---|
| `lib/cardentity/typ-b.ts`:137 | `vorschaden_typ_b_bericht, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum` | select |
| `lib/cardentity/typ-b.ts`:189 | `vorschaden_typ_b_bericht, vorschaden_geprueft, hat_vorschaeden, vorschaden_anzahl, cardentity_abfrage_am, vorschaden_letzter_datum` | update (dyn., §4.K) |
| `app/gutachter/feldmodus/page.tsx`:149 | `hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum` | select |
| `app/gutachter/heute/page.tsx`:164 | `hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum` | select |
| `app/api/cardentity/typ-b/route.ts`:22 | `vorschaden_anzahl, vorschaden_typ_a_ergebnis` | select |

### §G.SEED · Seed/Test-Routen (dev-only) — ~33 GENUINE (Top-Level-Inserts/Filter)

`app/api/admin/create-test-fall/route.ts`:122 (Insert mit ~16 relocateten Cols) + :26 (mandatsnummer eq) ·
`app/api/seed-testdata/route.ts`:80 (kunde_id/kundenbetreuer_id or), :498 (Insert), :895 (gegner_* update) ·
`lib/smoke/lifecycle-seed.ts`:165 (Insert) · `app/api/admin/test/cmm48-smoke/route.ts`:137 (besichtigungsort_adresse select — Top-Level, NICHT Embed).
Alle GENUINE, aber kein Prod-Pfad → niedrigste Prio.

### §G.K · Dynamische Property-Writes (§4.K) — alle 5 GENUINE

| Datei:Zeile | `.update(<obj>)` mit relocateten Keys | Ziel |
|---|---|---|
| `app/api/ocr-fahrzeugschein/route.ts`:80 | `ocr_*`(→gutachten), `fin_vin/quelle/extrahiert_am, erstzulassung, fahrzeug_baujahr/hersteller/modell/farbe, hsn, tsn`(→vehicles), `halter_*`(→cp) | mehrere (groesster Cluster) |
| `app/api/ocr-gutachten/route.ts`:155 | `ocr_extrahiert_am/rohdaten, nutzungsausfall_tagessatz, reparaturdauer_tage, gutachter_honorar`(→gutachten), `fin_vin`(→vehicles) | gutachten/vehicles |
| `lib/cardentity/typ-b.ts`:189 | vorschaden_* (s. §G.F) | vorschaeden |
| `components/VorOrtPanel.tsx`:65 | `fin_vin, kilometerstand` | vehicles |
| `app/api/ocr-trigger/route.ts`:138 | `halter_geburtsdatum` | claim_parties (auch statisch §G.B) |

### §V.TS · → `claims` Timestamps `created_at`/`updated_at` — ~91 GENUINE

Stichprobe (~30 Stellen) bestaetigt: alle `.gte/.lte/.lt('created_at', …)`, `.order('created_at')`,
`.update({ updated_at })` sind Top-Level auf `faelle` (nicht View/Embed). Beispiele verifiziert:
`finance.ts:20/87/101/108/147`, `kunde/layout.tsx:94/139/178/225`, `prozess.ts` updated_at ×4 (72/109/169/217),
`dokumente.ts:311`, `kunde/faelle/[id]/actions.ts:213`, `faelle/[id]/page.tsx:526`, `offene-faelle:53`,
`finance-hub:509/537`. Niedrigere fachliche Prio (kein Datenverlust solange faelle lebt), gleicher
Hard-Breaker bei DROP → muessen auf `claims.created_at/updated_at` (bzw. Embed) umziehen.

> **GRENZFALL (offene Entscheidung):** Falls Phase 6 nur die **Business-Spalten** droppt und
> `faelle.created_at/updated_at` bewusst stehen laesst, fallen diese 91 aus dem Sweep. Bei `DROP TABLE
> faelle CASCADE` (Voll-Drop, wie der Master-Titel sagt) sind sie Breaker.

---

## §FP · False-Positives im Detail (~75)

### FP-View (17) — Caller liest `v_faelle_mit_aktuellem_termin`, nicht faelle
| Stelle (erster Lauf) | Spalte | Realitaet |
|---|---|---|
| `app/admin/_components/DashboardStats.tsx`:38 | `regulierung_am` ×3 (select/gte/order) | `.from('v_faelle_mit_aktuellem_termin')` (Z.41) |
| `app/admin/_components/MonatsUmsatzForecast.tsx`:31 | `regulierung_am` ×2 (gte/lte) | View (Z.33) |
| `app/admin/_components/WichtigeUpdatesWidget.tsx`:191 | `regulierung_am` ×4 (select/gte/order/not) | View (Z.195) |
| `app/admin/finance/(hub)/page.tsx`:517 | `regulierung_am` ×2 (gte/lte) | View (Z.519) |
| `app/admin/finance/(hub)/page.tsx`:545 | `regulierung_am` ×2 (select/order) | View (Z.550) |
| `lib/finance/abrechnungen-generator.ts`:168 | `kanzlei_honorar` + `regulierung_am` ×3 | View (Z.172) |

### FP-Embed (18) — Spalte in `kanzlei_faelle(...)` / Nested-Embed
| Stelle | Spalte | Embed |
|---|---|---|
| `app/admin/faelle/(hub)/page.tsx`:108 | `mandatsnummer` | `kanzlei_faelle(mandatsnummer)` |
| `app/api/cron/vs-timer` — n/a (Helper) | — | — |
| `app/faelle/[id]/_actions/prozess.ts`:143 | `ruege_counter` | `kanzlei_faelle(ruege_counter)` |
| `app/gutachter/fall/[id]/stellungnahme/page.tsx`:27 | `kuerzungs_betrag, vs_kuerzung_grund` | `claims(...kanzlei_faelle(...))` |
| `app/kanzlei/kanban/page.tsx`:61 | `mandatsnummer` | `kanzlei_faelle(mandatsnummer)` (kunde_*/TS daneben = GENUINE) |
| `app/kanzlei/mandate/page.tsx`:36 | `mandatsnummer` | s.o. |
| `lib/abrechnung/kanzlei/erstelle-abrechnung.ts`:101 | `kanzlei_id` | `kanzlei_faelle(kanzlei_id)` (client-Filter) |
| `lib/analytics/finance.ts`:143 | `regulierung_am` | `kanzlei_faelle(regulierung_am)` (Z.146) |
| `lib/finance/fall-finanzen.ts`:54 | `regulierung_am` | `kanzlei_faelle(regulierung_am)` |
| `lib/sla/blocker-detection.ts`:38 | `anschlussschreiben_am, kuerzungs_betrag, ruege_gesendet_am` | Nested `claims(...kanzlei_faelle(...))` |
| `lib/sla/completion-signals.ts`:29/38/47 | `anschlussschreiben_am, ruege_gesendet_am` ×3 | `kanzlei_faelle(...)`-Embed |
| `lib/sla/kanzlei-mahnungen.ts`:362 | `kanzlei_id, kuerzungs_betrag` | Nested `claims(...kanzlei_faelle(...))` |

### FP-Helper (11) — Write via `upsertKanzleiFall`/`writeAuftragSpH`
| Stelle | Spalte | Helper |
|---|---|---|
| `app/api/cron/vs-timer/route.ts`:66 | `vs_eskalationsstufe` | `upsertKanzleiFall` (Z.68); liest aus `v_claim_full` |
| `app/api/stripe/webhook/route.ts`:338 | — | **NICHT FP — siehe §G.A (GENUINE)** |
| `app/faelle/[id]/_actions/dokumente.ts`:302 | `anschlussschreiben_url` | `upsertKanzleiFall` (Z.307) |
| `app/faelle/[id]/_actions/dokumente.ts`:336 | `anschlussschreiben_ocr_am/sendedatum/unterschrift` ×3 | `upsertKanzleiFall` (Z.343) |
| `app/faelle/[id]/_actions/kanzlei-paket.ts`:177 | `vs_eskalationsstufe` | `upsertKanzleiFall` (Z.183) |
| `app/faelle/[id]/_actions/kanzlei-paket.ts`:357 | `regulierung_am` | `upsertKanzleiFall` (Z.375) |
| `app/faelle/[id]/_actions/prozess.ts`:160 | `ruege_counter, ruege_gesendet_am` ×2 | `upsertKanzleiFall` (Z.167) |
| `app/faelle/[id]/_actions/prozess.ts`:242 | `vs_eskalationsstufe` | `upsertKanzleiFall` (Z.248) |
| `lib/kanzlei/push-mandat.ts`:225 | `mandatsnummer` | `upsertKanzleiFall` (Z.227) |

### FP-Kommentar/entfernt (~29) — Spalte aus Select/Insert raus oder nur Kommentar
| Stelle | Spalte | Realitaet |
|---|---|---|
| `lib/claims/get-kunde-faelle.ts`:419 | `anschlussschreiben_am, kanzlei_id, regulierung_am, vs_kuerzung_grund` ×4 | aus faelle-Select **entfernt** (Z.430), via separatem kanzlei_faelle-Read |
| `app/faelle/[id]/_actions/filmcheck.ts`:32 | `mandatsnummer` ×3 (select/like/order) | mandatsnummer-Logik **entfernt** (Z.29 Kommentar); Select nur `claim_id` |
| `app/faelle/[id]/_actions/filmcheck.ts`:49 | `mandatsnummer` (update) | entfernt — Write geht auf `auftraege` (filmcheck_*) |
| `lib/kanzlei/push-mandat.ts`:81 | `mandatsnummer` | NICHT mehr im Select (Z.84 hat kunde_*) |
| `lib/kanzlei-wunsch/actions.ts`:171 | `mandatsnummer` | Read direkt aus `.from('kanzlei_faelle')` (Z.178), nicht faelle |
| `lib/claims/kunde-ownership.ts`:4 | `kunde_id` | Doc-Kommentar (Z.4-5), nicht Code |

> Die uebrigen FP-Kommentar/entfernt-Faelle sind die durch die Migration entfernten Spaltennamen, die der
> erste Lauf im umgebenden Kommentar-Block (CMM-44 SP-* Notizen direkt vor dem Select) gesehen hat.

---

## 3 · Empfehlung fuer die Reststrecke (Worklist, nach Prio)

1. **`kunde_id`-Ownership zentral umbauen (SP-C)** — `lib/claims/kunde-ownership.ts:55` +
   `lib/claims/get-kunde-faelle.ts:190/426` + `app/kunde/layout.tsx` sind die Hebel; deckt die Mehrzahl der
   60 GENUINE `kunde_id`-Stellen ab. Auf `claims.geschaedigter_user_id` / `claim_parties` umstellen.
2. **`stripe/webhook:338` SOFORT fixen** — auf `upsertKanzleiFall(... { kanzlei_provision_status,
   kanzlei_provision_ausgezahlt_am })` umstellen (latent buggy, Provisions-Auszahlung verloren).
3. **`besichtigungsort.ts:69` else-Fallback** — Termin-Platzhalter statt faelle-Write (Hard-Breaker bei DROP).
4. **`kanzlei_honorar` (3×)** + **`search:28 mandatsnummer.or`** — die letzten echten kanzlei_faelle-Reader.
5. **Views (§V) vor `DROP TABLE faelle`** — `v_claim_full` + `v_faelle_mit_aktuellem_termin` auf `FROM claims`
   umbauen; `faelle_kunde_view`/`faelle_sv_view` (vehicles/kunde_id raus). `v_claim_full.f.mandatsnummer`
   ist schon jetzt stale → auf `kf.mandatsnummer` repointen.
6. **vehicles (55) + vorschaeden (~9)** mit ihren Slices (SP-E/SP-F) — heute korrekt, Breaker bei DROP.
7. **TS-Bucket (~91)** + **Seed (~33)** zuletzt — mechanisch bzw. dev-only.
8. **Menschlich klaeren:** (a) `kanzlei_provision_status` relocatet oder faelle-nativ? (b) `re_termin_token`
   Heimat? (c) `zahlungsweg` bleibt faelle (SP-J-Korrektur bestaetigt — **kein** Breaker, nur Table-DROP).
   (d) Droppt Phase 6 die ganze Tabelle (→ TS+zahlungsweg Breaker) oder nur Business-Spalten?

> **Methodische Grenze (unveraendert):** Statisch nicht erfassbar sind weitere dynamische `fall[feld]`-
> Property-Reads nach `select('*')` (§SOFT deckt die 4 gefundenen `select('*')` ab). Nach jedem Slice
> Portal-Smoke (`feedback_post_drop_smoke`), `information_schema` live vor jedem Drop
> (`feedback_information_schema_check`).

🤖 Re-Validierung mit Claude Opus 4.7 (1M context) — CMM-44 Phase-6 Breaker-Inventar
