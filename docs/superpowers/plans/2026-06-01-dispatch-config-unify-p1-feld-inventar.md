# Dispatch-Config-Unify P1 — Feld-Inventar-Seed (unified `lead-erfassung`-Flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Dispatcher-Lead-Felder als `onboarding_felder`-Eintraege einer neuen unified Flow `lead-erfassung` modellieren (audience/sektion/db_target=leads-Spalte) — das Daten-Fundament fuer den `DispatchLeadForm`-Renderer (P2). Rein additiv: neue Flow + 2 neue Spalten, bestehende Flows (`beauftragung`/`kunde-onboarding`/`gutachter-finden`) unangetastet.

**Architecture:** Aaron-Entscheidung 2026-06-01: **unified Flow.** Ein neuer `flow_key='lead-erfassung'` haelt ALLE Lead-Felder mit `audience`-Tags (`dispatcher` | `kunde` | `beide`). Der Dispatcher-Renderer (P2) liest `audience in {dispatcher,beide}`; der Kunden-Flowlink (`beauftragung`) bleibt vorerst unveraendert und zieht in einer spaeteren Phase auf dieselbe Config um (dann greift der P0-`filterFelderByAudience`-Leak-Schutz). Seed via Supabase-Plugin (`apply_migration`, Twin-Drift-konform). `db_target = {tabelle:'leads', spalte:<col>}`; Sentinels `_termin`/`_finalize` wie in `beauftragung`.

**Tech Stack:** Next.js, Supabase (Plugin-Migration, Projekt `paizkjajbuxxksdoycev`), TypeScript, vitest. Harte Regeln: DDL/Seed NUR via apply_migration (Filename == recorded version), PR `--base staging`, nie main, nie selbst mergen, 7-Punkt-Audit, Umlaute in UI-Strings, Server-Actions = Result-Object.

---

## §A. Flow + Phasen-Design (`onboarding_phasen`)

Neue Flow `lead-erfassung`, 9 Phasen == die `sektion`-Gruppen des flachen Dispatcher-Views (§4 der Spec). Der Dispatcher-Renderer (P2) gruppiert flach nach `sektion`; die Phasen-`reihenfolge` dient dem (spaeteren) gestuften Kunden-Renderer.

| reihenfolge | phase_key | titel | eyebrow |
|---|---|---|---|
| 10 | kontakt | Kontakt & Erreichbarkeit | Wer ist der Kunde? |
| 20 | schaden | Schaden | Was ist beschädigt? |
| 30 | unfall | Unfallhergang | Wie & wo ist es passiert? |
| 40 | fahrzeug | Fahrzeug & Halter | Welches Fahrzeug? |
| 50 | schuld | Schuld & Haftung | Wer trägt die Schuld? |
| 60 | service_kanzlei | Service & Kanzlei | Welcher Umfang? |
| 70 | termin_sv | Termin & Besichtigung | Wann & wo besichtigen? |
| 80 | vollmacht | Vollmacht & SA | Unterschrift |
| 90 | status | Status & Triage | Intern |

---

## §B. EXHAUSTIVE Feld-Mapping (Spec-Pflicht-Artefakt §4/§9)

Jedes Dispatch-Feld -> eine `onboarding_felder`-Zeile. `A`=audience (B=beide, D=dispatcher, K=kunde). `db_target` = `leads.<spalte>` ausser bei Sentinel. Verifiziert gegen `_phases/*` + `hard-gate.ts` + `qualification-engine.ts` + `_actions/*` (3-Agenten-Read 2026-06-01) und gegen die Live-`leads`-Spaltenliste (alle Spalten existieren ausser den 2 in Task 1).

### sektion `kontakt`
| reihenfolge | feld_key | typ | leads-Spalte | A | pflicht | optionen-Quelle |
|---|---|---|---|---|---|---|
| 10 | vorname | text | vorname | B | no | — |
| 20 | nachname | text | nachname | B | no | — |
| 30 | telefon | tel | telefon | B | no | — |
| 40 | email | email | email | B | no | — |
| 50 | bevorzugter_kanal | segmented | bevorzugter_kanal | B | no | reuse (whatsapp/anruf/email) |
| 60 | whatsapp_verfuegbar | segmented | whatsapp_verfuegbar | D | no | ja/nein (von WA-Check-Action gesetzt) |
| 70 | kunde_strasse | text | kunde_strasse | B | no | — |
| 80 | kunde_plz | text | kunde_plz | B | no | — |
| 90 | kunde_stadt | text | kunde_stadt | B | no | — |
| 100 | sprache | segmented | sprache | D | no | de/tr/ar/ru/pl/en/other (intern, steuert Flowlink-Sprache) |
| 110 | notiz | textarea | notiz | D | no | — (interne Notiz) |

### sektion `schaden`
| reihenfolge | feld_key | typ | leads-Spalte | A | pflicht | conditional / optionen |
|---|---|---|---|---|---|---|
| 10 | schadentyp | toggle-cards | schadentyp | B | no | spurwechsel/auffahrunfall/vorfahrtsverletzung/parkplatz/sonstiges |
| 20 | schadentyp_freitext | textarea | schadentyp_freitext | B | no | conditional schadentyp=sonstiges |
| 30 | schaden_sichtbar | segmented | schaden_sichtbar | B | no | ja/nein (bool) |
| 40 | unfallhergang | textarea | unfallhergang | B | no | — |
| 50 | fahrzeugschaden_beschreibung | textarea | fahrzeugschaden_beschreibung | B | no | — |
| 60 | personenschaden_flag | segmented | personenschaden_flag | B | no | ja/nein (bool) |
| 70 | sachschaden_flag | segmented | sachschaden_flag | B | no | ja/nein (bool) |
| 80 | sachschaden_beschreibung | textarea | sachschaden_beschreibung | B | no | conditional sachschaden_flag=true |
| 90 | mietwagen_flag | segmented | mietwagen_flag | B | no | ja/nein (bool) |
| 100 | nutzungsausfall | segmented | nutzungsausfall | B | no | ja/nein (bool) |
| 110 | schadensfotos | file | schadensfoto_urls | B | no | — (jsonb url-array) |
| 120 | hat_vorschaeden | segmented | hat_vorschaeden | B | no | ja/nein (bool) |
| 130 | vorschaeden_beschreibung | textarea | vorschaeden_beschreibung | B | no | conditional hat_vorschaeden=true |

### sektion `unfall`
| reihenfolge | feld_key | typ | leads-Spalte | A | pflicht | conditional |
|---|---|---|---|---|---|---|
| 10 | unfallort | text | unfallort | B | no | (Place-Autocomplete in P2) |
| 20 | unfalldatum | text | unfalldatum | B | no | (date-Input in P2) |
| 30 | unfall_uhrzeit | text | unfall_uhrzeit | B | no | — |
| 40 | polizei_vor_ort | segmented | polizei_vor_ort | B | no | ja/nein (bool) |
| 50 | polizei_aktenzeichen | text | polizei_aktenzeichen | B | no | conditional polizei_vor_ort=true |
| 60 | gegner_kennzeichen | text | gegner_kennzeichen | B | no | — |
| 70 | gegner_versicherung | text | gegner_versicherung | B | no | (Autocomplete in P2) |
| 80 | gegner_schadennummer | text | gegner_schadennummer | B | no | — |
| 90 | gegner_telefon | tel | gegner_telefon (NEU, Task 1) | B | no | Unfallgegner-Kontakt (§8d) |
| 100 | gegner_email | email | gegner_email (NEU, Task 1) | B | no | Unfallgegner-Kontakt (§8d) |
| 110 | zeugen | segmented | zeugen | B | no | ja/nein (bool) |

### sektion `fahrzeug`
| reihenfolge | feld_key | typ | leads-Spalte | A | pflicht | conditional |
|---|---|---|---|---|---|---|
| 10 | fahrzeugschein_foto | zb1-upload | kennzeichen | B | no | OCR (wie kunde-onboarding); füllt FIN/HSN/TSN/Halter etc. |
| 20 | kennzeichen | text | kennzeichen | B | no | manueller Fallback |
| 30 | fahrzeug_hersteller | text | fahrzeug_hersteller | B | no | (Datalist in P2) |
| 40 | fahrzeug_modell | text | fahrzeug_modell | B | no | (Datalist in P2) |
| 50 | fahrzeug_baujahr | number | fahrzeug_baujahr | B | no | — |
| 60 | fin | text | fin | B | no | — |
| 70 | hsn | text | hsn | B | no | — |
| 80 | tsn | text | tsn | B | no | — |
| 90 | fahrzeug_farbe | text | fahrzeug_farbe | B | no | — |
| 100 | fahrzeug_fahrbereit | segmented | fahrzeug_fahrbereit | B | no | ja/nein (bool) |
| 110 | ist_fahrzeughalter | segmented | ist_fahrzeughalter | B | no | ja/nein (bool) |
| 120 | halter_vorname | text | halter_vorname | B | no | conditional ist_fahrzeughalter=false |
| 130 | halter_nachname | text | halter_nachname | B | no | conditional ist_fahrzeughalter=false |
| 140 | halter_geburtsdatum | text | halter_geburtsdatum | B | no | conditional ist_fahrzeughalter=false (date) |
| 150 | halter_strasse | text | halter_strasse | B | no | conditional ist_fahrzeughalter=false |
| 160 | halter_plz | text | halter_plz | B | no | conditional ist_fahrzeughalter=false |
| 170 | halter_stadt | text | halter_stadt | B | no | conditional ist_fahrzeughalter=false |

### sektion `schuld`
| reihenfolge | feld_key | typ | leads-Spalte | A | pflicht | conditional / optionen |
|---|---|---|---|---|---|---|
| 10 | schuldfrage | segmented | schuldfrage | B | no | reuse (gegner/unklar/eigenverantwortung) |
| 20 | aufklaerung_teilschuld_bestaetigt | segmented | aufklaerung_teilschuld_bestaetigt | D | no | ja/nein (bool), conditional schuldfrage=unklar (interne Aufklärungs-Bestätigung) |

### sektion `service_kanzlei`
| reihenfolge | feld_key | typ | leads-Spalte | A | pflicht | conditional / optionen |
|---|---|---|---|---|---|---|
| 10 | service_typ | toggle-cards | service_typ | B | no | reuse (komplett/nur_gutachter) + hint |
| 20 | kanzlei_wunsch | toggle-cards | kanzlei_wunsch | B | no | reuse (partnerkanzlei/eigene_kanzlei/keine_kanzlei), conditional service_typ=komplett |

### sektion `termin_sv`
| reihenfolge | feld_key | typ | leads-Spalte | A | pflicht | conditional |
|---|---|---|---|---|---|---|
| 10 | besichtigungsort_adresse | text | besichtigungsort_adresse | B | no | (Place-Autocomplete in P2) |
| 20 | besichtigungsort_notiz | textarea | besichtigungsort_notiz | B | no | — |
| 30 | wunschtermin | text | wunschtermin | B | no | (datetime-local in P2) |
| 40 | termin | termin | `_termin` (Sentinel, spalte `termin_id`) | B | no | SV-Buchung (SvDispatchPanel in P2; persistiert via gutachter_termine.lead_id) |

### sektion `vollmacht`
| reihenfolge | feld_key | typ | db_target | A | pflicht |
|---|---|---|---|---|---|
| 10 | unterschrift | signature | `_finalize` (Sentinel, spalte `unterschrift`) | B | no |

### sektion `status`
| reihenfolge | feld_key | typ | leads-Spalte | A | pflicht | conditional |
|---|---|---|---|---|---|---|
| 10 | disqualifiziert | segmented | disqualifiziert | D | no | ja/nein (bool, manuelles Flag — §6) |
| 20 | disqualifiziert_grund | textarea | disqualifiziert_grund | D | no | conditional disqualifiziert=true |

**Summe: 63 Felder** (kontakt 11, schaden 13, unfall 11, fahrzeug 17, schuld 2, service_kanzlei 2, termin_sv 4, vollmacht 1, status 2). audience-Split: 57 `beide`, 6 `dispatcher` (whatsapp_verfuegbar, sprache, notiz, aufklaerung_teilschuld_bestaetigt, disqualifiziert, disqualifiziert_grund), 0 `kunde`.

---

## §C. Bewusst NICHT geseedet (kein Silent-Cap — dokumentiert)

| Feld(er) | Grund | Folge |
|---|---|---|
| `unfallskizze_svg` (+_bestaetigt/_generiert_am) | Server-generierter Canvas (Claude), kein Standard-Input | P2 Special-Section `UnfallskizzeCard` (audience B) |
| `zeugen_kontakte` (jsonb-Array) | Composite-Editor (Name/Tel/Email-Reihen), kein Standard-Typ | P2 Special-Component `ZeugenKontakteEditor` (db_target leads.zeugen_kontakte) |
| `wunschtermin_wochentage` (int[]) | Multi-Select auf Array-Spalte, kein Standard-Typ | P2 Special (Pill-Multiselect) |
| `lackfarbe_code` | Dynamischer Select (LACKFARBE_OPTIONS/imagin) | P2 optional (select aus imagin-Konstante) |
| `finanzierung_leasing`, `vorsteuerabzugsberechtigt`, `finanzierungsgeber_*`, Bankdaten | §8a: **Vorsteuer/Bankdaten RAUS** | nicht im Scope |
| `fahrerflucht`, `auslandskennzeichen`, `unfallort_kategorie`, `*_lat`/`*_lng`/`*_place_id` | Server-abgeleitet (checkKZFlags/geocode/Place) | werden von Actions gesetzt, kein manuelles Feld |
| `zb1_*`, `polizeibericht_*` (Token/Status), `flow_link_*`, `reminder_*`, `gespraech_*` | Status/Token/Telemetrie, kein Eingabefeld | DokumenteAnfordernCard / Flowlink-Logik |
| `schadens_hergang` (legacy), `hat_haftpflicht` (legacy no-UI), `zeuge_name/anschrift/telefon/email` (legacy singular) | durch `unfallhergang` / `zeugen_kontakte` ersetzt | nicht seeden |
| Personenschaden-Personen | eigene Tabelle `personenschaden_personen` (kein leads-db_target) | bleibt eigene Komponente (Phase1PersonenForm) |

---

## §D. Wichtige P2-Abhaengigkeiten (hier nur dokumentiert, NICHT in P1 gebaut)

1. **Boolean-Coercion im Dispatcher-Save:** `groupFelderByTarget` schreibt `segmented`-Werte als String. Die boolean `leads`-Spalten (schaden_sichtbar, polizei_vor_ort, *_flag, fahrzeug_fahrbereit, ist_fahrzeughalter, zeugen, hat_vorschaeden, whatsapp_verfuegbar, aufklaerung_teilschuld_bestaetigt, disqualifiziert) brauchen in der P2-Dispatcher-Save-Action eine Coercion `'true'->true / 'false'->false` (sonst String in bool-Spalte). `checkbox`-Typ ist hier NICHT nutzbar (coerct zu TIMESTAMPTZ).
2. **conditional_on bei bool-Quelle:** equals ist String ('true'/'false'); der Renderer muss bool->string vergleichen. Im flachen Dispatcher-View ohnehin „alle sichtbar" (§5.2) — conditional_on greift erst beim gestuften Kunden-Renderer.
3. **i18n:** P1 seedt nur deutsche Labels (`i18n=null`). Beim Kunden-Cutover der unified Flow muss i18n (5 Sprachen) nachgezogen werden (audience B/K-Felder).
4. **Special-Components** aus §C (Unfallskizze, Zeugen-Kontakte, Wochentage, Place-Autocomplete, Kennzeichen-Parts, Versicherungs-Autocomplete) als Sektion-Inhalte in `DispatchLeadForm`.

---

### Task 1: Neue Spalten `gegner_telefon` + `gegner_email` (additiv)

**Files:**
- Create: `supabase/migrations/<recorded_version>_leads_gegner_kontakt.sql`

- [ ] **Step 1: DDL via Plugin** (`mcp__plugin_supabase_supabase__apply_migration`, name `leads_gegner_kontakt`):
```sql
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS gegner_telefon text,
  ADD COLUMN IF NOT EXISTS gegner_email text;
```

- [ ] **Step 2: Recorded Version ablesen** (`execute_sql`):
```sql
SELECT version FROM supabase_migrations.schema_migrations WHERE name='leads_gegner_kontakt';
```
File benennen als `supabase/migrations/<version>_leads_gegner_kontakt.sql` mit exakt obigem DDL (Twin-Drift: Filename == recorded version).

- [ ] **Step 3: Verifizieren (READ)**:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='leads' AND column_name IN ('gegner_telefon','gegner_email');
```
Expected: beide Zeilen.

- [ ] **Step 4: Commit** (Datei + Audit-Body):
```bash
git add supabase/migrations/<version>_leads_gegner_kontakt.sql
git commit -F - <<'MSG'
feat(db): leads.gegner_telefon + .gegner_email (Unfallgegner-Kontakt, additiv)
... 7-Punkt-Audit ...
MSG
```

---

### Task 2: Seed `onboarding_phasen` (Flow `lead-erfassung`, 9 Sektionen)

**Files:**
- Create: `supabase/migrations/<recorded_version>_seed_lead_erfassung_phasen.sql`

- [ ] **Step 1: Pre-Check (live information_schema/Daten — viele Sessions)** (`execute_sql`):
```sql
SELECT count(*) FROM onboarding_phasen WHERE flow_key='lead-erfassung';
```
Expected: 0 (sonst hat eine andere Session geseedet — stoppen + koordinieren).

- [ ] **Step 2: Seed via Plugin** (`apply_migration`, name `seed_lead_erfassung_phasen`):
```sql
INSERT INTO onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow)
VALUES
  ('lead-erfassung', 10, 'kontakt',         'Kontakt & Erreichbarkeit', 'Wer ist der Kunde?'),
  ('lead-erfassung', 20, 'schaden',         'Schaden',                  'Was ist beschädigt?'),
  ('lead-erfassung', 30, 'unfall',          'Unfallhergang',            'Wie & wo ist es passiert?'),
  ('lead-erfassung', 40, 'fahrzeug',        'Fahrzeug & Halter',        'Welches Fahrzeug?'),
  ('lead-erfassung', 50, 'schuld',          'Schuld & Haftung',         'Wer trägt die Schuld?'),
  ('lead-erfassung', 60, 'service_kanzlei', 'Service & Kanzlei',        'Welcher Umfang?'),
  ('lead-erfassung', 70, 'termin_sv',       'Termin & Besichtigung',    'Wann & wo besichtigen?'),
  ('lead-erfassung', 80, 'vollmacht',       'Vollmacht & SA',           'Unterschrift'),
  ('lead-erfassung', 90, 'status',          'Status & Triage',          'Intern');
```

- [ ] **Step 3: Recorded Version ablesen + File benennen** (`execute_sql` auf schema_migrations; File == version).

- [ ] **Step 4: Verifizieren (READ)**:
```sql
SELECT count(*) AS n, string_agg(phase_key, ', ' ORDER BY reihenfolge) FROM onboarding_phasen WHERE flow_key='lead-erfassung';
```
Expected: n=9, kontakt..status.

- [ ] **Step 5: Commit** (File + Audit-Body).

---

### Task 3: Seed `onboarding_felder` (58 Felder via VALUES+JOIN)

**Files:**
- Create: `supabase/migrations/<recorded_version>_seed_lead_erfassung_felder.sql`

- [ ] **Step 1: Seed via Plugin** (`apply_migration`, name `seed_lead_erfassung_felder`). phase_id wird per JOIN aus phase_key aufgeloest (keine hardcoded UUIDs). optionen/db_target/conditional_on als jsonb-Cast.
```sql
INSERT INTO onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, optionen, db_target, conditional_on, audience, sektion)
SELECT p.id, v.reihenfolge, v.feld_key, v.typ, v.label, v.hint, v.placeholder, v.pflicht,
       v.optionen::jsonb, v.db_target::jsonb, v.conditional_on::jsonb, v.audience, v.sektion
FROM (VALUES
  -- kontakt
  ('kontakt',10,'vorname','text','Vorname',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"vorname"}',NULL,'beide'),
  ('kontakt',20,'nachname','text','Nachname',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"nachname"}',NULL,'beide'),
  ('kontakt',30,'telefon','tel','Telefon',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"telefon"}',NULL,'beide'),
  ('kontakt',40,'email','email','E-Mail',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"email"}',NULL,'beide'),
  ('kontakt',50,'bevorzugter_kanal','segmented','Bevorzugter Kanal',NULL,NULL,false,'[{"label":"WhatsApp","value":"whatsapp"},{"label":"Anruf","value":"anruf"},{"label":"E-Mail","value":"email"}]','{"tabelle":"leads","spalte":"bevorzugter_kanal"}',NULL,'beide'),
  ('kontakt',60,'whatsapp_verfuegbar','segmented','WhatsApp verfügbar?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"whatsapp_verfuegbar"}',NULL,'dispatcher'),
  ('kontakt',70,'kunde_strasse','text','Straße',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"kunde_strasse"}',NULL,'beide'),
  ('kontakt',80,'kunde_plz','text','PLZ',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"kunde_plz"}',NULL,'beide'),
  ('kontakt',90,'kunde_stadt','text','Stadt',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"kunde_stadt"}',NULL,'beide'),
  ('kontakt',100,'sprache','segmented','Sprache',NULL,NULL,false,'[{"label":"Deutsch","value":"de"},{"label":"Türkisch","value":"tr"},{"label":"Arabisch","value":"ar"},{"label":"Russisch","value":"ru"},{"label":"Polnisch","value":"pl"},{"label":"Englisch","value":"en"},{"label":"Andere","value":"other"}]','{"tabelle":"leads","spalte":"sprache"}',NULL,'dispatcher'),
  ('kontakt',110,'notiz','textarea','Notiz (intern)',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"notiz"}',NULL,'dispatcher'),
  -- schaden
  ('schaden',10,'schadentyp','toggle-cards','Schadentyp',NULL,NULL,false,'[{"label":"Spurwechsel","value":"spurwechsel"},{"label":"Auffahrunfall","value":"auffahrunfall"},{"label":"Vorfahrtsverletzung","value":"vorfahrtsverletzung"},{"label":"Parkplatz","value":"parkplatz"},{"label":"Sonstiges","value":"sonstiges"}]','{"tabelle":"leads","spalte":"schadentyp"}',NULL,'beide'),
  ('schaden',20,'schadentyp_freitext','textarea','Beschreibung',NULL,'Was genau ist passiert?',false,NULL,'{"tabelle":"leads","spalte":"schadentyp_freitext"}','{"feld":"schadentyp","equals":"sonstiges"}','beide'),
  ('schaden',30,'schaden_sichtbar','segmented','Sichtbarer Schaden?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"schaden_sichtbar"}',NULL,'beide'),
  ('schaden',40,'unfallhergang','textarea','Unfallhergang',NULL,'Wie ist es passiert?',false,NULL,'{"tabelle":"leads","spalte":"unfallhergang"}',NULL,'beide'),
  ('schaden',50,'fahrzeugschaden_beschreibung','textarea','Schadenbeschreibung (Fahrzeug)',NULL,'Was ist am Auto beschädigt?',false,NULL,'{"tabelle":"leads","spalte":"fahrzeugschaden_beschreibung"}',NULL,'beide'),
  ('schaden',60,'personenschaden_flag','segmented','Personenschaden?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"personenschaden_flag"}',NULL,'beide'),
  ('schaden',70,'sachschaden_flag','segmented','Sachschäden an Dritten?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"sachschaden_flag"}',NULL,'beide'),
  ('schaden',80,'sachschaden_beschreibung','textarea','Was wurde beschädigt?',NULL,'z.B. Leitplanke, Handy …',false,NULL,'{"tabelle":"leads","spalte":"sachschaden_beschreibung"}','{"feld":"sachschaden_flag","equals":"true"}','beide'),
  ('schaden',90,'mietwagen_flag','segmented','Mietwagen gewünscht?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"mietwagen_flag"}',NULL,'beide'),
  ('schaden',100,'nutzungsausfall','segmented','Nutzungsausfall?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"nutzungsausfall"}',NULL,'beide'),
  ('schaden',110,'schadensfotos','file','Schadenfotos',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"schadensfoto_urls"}',NULL,'beide'),
  ('schaden',120,'hat_vorschaeden','segmented','Vorschäden bekannt?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"hat_vorschaeden"}',NULL,'beide'),
  ('schaden',130,'vorschaeden_beschreibung','textarea','Vorschäden-Beschreibung',NULL,'Bereich / Schadenhöhe',false,NULL,'{"tabelle":"leads","spalte":"vorschaeden_beschreibung"}','{"feld":"hat_vorschaeden","equals":"true"}','beide'),
  -- unfall
  ('unfall',10,'unfallort','text','Unfallort',NULL,'Adresse',false,NULL,'{"tabelle":"leads","spalte":"unfallort"}',NULL,'beide'),
  ('unfall',20,'unfalldatum','text','Unfalldatum',NULL,'JJJJ-MM-TT',false,NULL,'{"tabelle":"leads","spalte":"unfalldatum"}',NULL,'beide'),
  ('unfall',30,'unfall_uhrzeit','text','Unfall-Uhrzeit (ca.)',NULL,'z.B. 14:30',false,NULL,'{"tabelle":"leads","spalte":"unfall_uhrzeit"}',NULL,'beide'),
  ('unfall',40,'polizei_vor_ort','segmented','Polizei vor Ort?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"polizei_vor_ort"}',NULL,'beide'),
  ('unfall',50,'polizei_aktenzeichen','text','Aktenzeichen',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"polizei_aktenzeichen"}','{"feld":"polizei_vor_ort","equals":"true"}','beide'),
  ('unfall',60,'gegner_kennzeichen','text','Gegner-Kennzeichen',NULL,'oder leer bei Fahrerflucht',false,NULL,'{"tabelle":"leads","spalte":"gegner_kennzeichen"}',NULL,'beide'),
  ('unfall',70,'gegner_versicherung','text','Gegner-Versicherung',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"gegner_versicherung"}',NULL,'beide'),
  ('unfall',80,'gegner_schadennummer','text','Schadennummer (Gegner)',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"gegner_schadennummer"}',NULL,'beide'),
  ('unfall',90,'gegner_telefon','tel','Gegner-Telefon',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"gegner_telefon"}',NULL,'beide'),
  ('unfall',100,'gegner_email','email','Gegner-E-Mail',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"gegner_email"}',NULL,'beide'),
  ('unfall',110,'zeugen','segmented','Zeugen vorhanden?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"zeugen"}',NULL,'beide'),
  -- fahrzeug
  ('fahrzeug',10,'fahrzeugschein_foto','zb1-upload','Fahrzeugschein (ZB1) — Foto',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"kennzeichen"}',NULL,'beide'),
  ('fahrzeug',20,'kennzeichen','text','Kennzeichen',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"kennzeichen"}',NULL,'beide'),
  ('fahrzeug',30,'fahrzeug_hersteller','text','Marke',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"fahrzeug_hersteller"}',NULL,'beide'),
  ('fahrzeug',40,'fahrzeug_modell','text','Modell',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"fahrzeug_modell"}',NULL,'beide'),
  ('fahrzeug',50,'fahrzeug_baujahr','number','Baujahr',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"fahrzeug_baujahr"}',NULL,'beide'),
  ('fahrzeug',60,'fin','text','FIN',NULL,'17 Zeichen',false,NULL,'{"tabelle":"leads","spalte":"fin"}',NULL,'beide'),
  ('fahrzeug',70,'hsn','text','HSN',NULL,'4 Ziffern',false,NULL,'{"tabelle":"leads","spalte":"hsn"}',NULL,'beide'),
  ('fahrzeug',80,'tsn','text','TSN',NULL,'3 Zeichen',false,NULL,'{"tabelle":"leads","spalte":"tsn"}',NULL,'beide'),
  ('fahrzeug',90,'fahrzeug_farbe','text','Lack-Detail',NULL,'z.B. Saphirschwarz Metallic',false,NULL,'{"tabelle":"leads","spalte":"fahrzeug_farbe"}',NULL,'beide'),
  ('fahrzeug',100,'fahrzeug_fahrbereit','segmented','Fahrzeug fahrbereit?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"fahrzeug_fahrbereit"}',NULL,'beide'),
  ('fahrzeug',110,'ist_fahrzeughalter','segmented','Kunde = Fahrzeughalter?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"ist_fahrzeughalter"}',NULL,'beide'),
  ('fahrzeug',120,'halter_vorname','text','Halter Vorname',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"halter_vorname"}','{"feld":"ist_fahrzeughalter","equals":"false"}','beide'),
  ('fahrzeug',130,'halter_nachname','text','Halter Nachname',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"halter_nachname"}','{"feld":"ist_fahrzeughalter","equals":"false"}','beide'),
  ('fahrzeug',140,'halter_geburtsdatum','text','Halter Geburtsdatum',NULL,'JJJJ-MM-TT',false,NULL,'{"tabelle":"leads","spalte":"halter_geburtsdatum"}','{"feld":"ist_fahrzeughalter","equals":"false"}','beide'),
  ('fahrzeug',150,'halter_strasse','text','Halter Straße',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"halter_strasse"}','{"feld":"ist_fahrzeughalter","equals":"false"}','beide'),
  ('fahrzeug',160,'halter_plz','text','Halter PLZ',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"halter_plz"}','{"feld":"ist_fahrzeughalter","equals":"false"}','beide'),
  ('fahrzeug',170,'halter_stadt','text','Halter Ort',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"halter_stadt"}','{"feld":"ist_fahrzeughalter","equals":"false"}','beide'),
  -- schuld
  ('schuld',10,'schuldfrage','segmented','Schuldfrage',NULL,NULL,false,'[{"label":"Die Gegenseite","value":"gegner"},{"label":"Noch unklar","value":"unklar"},{"label":"Ich selbst","value":"eigenverantwortung"}]','{"tabelle":"leads","spalte":"schuldfrage"}',NULL,'beide'),
  ('schuld',20,'aufklaerung_teilschuld_bestaetigt','segmented','Aufklärung Teilschuld bestätigt',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"aufklaerung_teilschuld_bestaetigt"}','{"feld":"schuldfrage","equals":"unklar"}','dispatcher'),
  -- service_kanzlei
  ('service_kanzlei',10,'service_typ','toggle-cards','Service-Umfang','Bei "Komplettservice" arbeiten wir mit unserer Partnerkanzlei LexDrive zusammen — kostenlos für Sie.',NULL,false,'[{"label":"Komplettservice (empfohlen)","value":"komplett","description":"Anwalt + Vollmacht inkl. — 0 EUR, wir regeln alles fuer Sie"},{"label":"Nur Gutachten","value":"nur_gutachter","description":"Sie regulieren selbst mit der gegnerischen Versicherung"}]','{"tabelle":"leads","spalte":"service_typ"}',NULL,'beide'),
  ('service_kanzlei',20,'kanzlei_wunsch','toggle-cards','Anwalt-Wahl',NULL,NULL,false,'[{"label":"Unsere Partnerkanzlei (empfohlen)","value":"partnerkanzlei","description":"LexDrive — spezialisiert auf Kfz-Schaeden, 0 EUR fuer Sie, kuemmern sich um Vollmacht und alles weitere"},{"label":"Meine eigene Kanzlei","value":"eigene_kanzlei","description":"Sie geben uns die Kontaktdaten, wir uebergeben das Paket"},{"label":"Kein Anwalt","value":"keine_kanzlei","description":"Sie regulieren selbst — keine Anwalts-Begleitung"}]','{"tabelle":"leads","spalte":"kanzlei_wunsch"}','{"feld":"service_typ","equals":"komplett"}','beide'),
  -- termin_sv
  ('termin_sv',10,'besichtigungsort_adresse','text','Besichtigungsadresse',NULL,'Wo steht das Fahrzeug?',false,NULL,'{"tabelle":"leads","spalte":"besichtigungsort_adresse"}',NULL,'beide'),
  ('termin_sv',20,'besichtigungsort_notiz','textarea','Treffpunkt-Notiz',NULL,'z.B. Hintereingang, Schlüssel bei Werkstatt',false,NULL,'{"tabelle":"leads","spalte":"besichtigungsort_notiz"}',NULL,'beide'),
  ('termin_sv',30,'wunschtermin','text','Wunschtermin',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"wunschtermin"}',NULL,'beide'),
  ('termin_sv',40,'termin','termin','SV-Besichtigungstermin',NULL,NULL,false,NULL,'{"tabelle":"_termin","spalte":"termin_id"}',NULL,'beide'),
  -- vollmacht
  ('vollmacht',10,'unterschrift','signature','Schadenanzeige (SA) — Unterschrift',NULL,NULL,false,NULL,'{"tabelle":"_finalize","spalte":"unterschrift"}',NULL,'beide'),
  -- status
  ('status',10,'disqualifiziert','segmented','Disqualifiziert?',NULL,NULL,false,'[{"label":"Ja","value":"true"},{"label":"Nein","value":"false"}]','{"tabelle":"leads","spalte":"disqualifiziert"}',NULL,'dispatcher'),
  ('status',20,'disqualifiziert_grund','textarea','Disqualifikations-Grund',NULL,NULL,false,NULL,'{"tabelle":"leads","spalte":"disqualifiziert_grund"}','{"feld":"disqualifiziert","equals":"true"}','dispatcher')
) AS v(sektion,reihenfolge,feld_key,typ,label,hint,placeholder,pflicht,optionen,db_target,conditional_on,audience)
JOIN onboarding_phasen p ON p.flow_key='lead-erfassung' AND p.phase_key=v.sektion;
```

- [ ] **Step 2: Recorded Version ablesen + File benennen** (`execute_sql` schema_migrations; File == version).

- [ ] **Step 3: Verifizieren (READ)** — Count, audience-Split, db_target-Integritaet:
```sql
-- a) Gesamt + pro Sektion
SELECT f.sektion, count(*) FROM onboarding_felder f JOIN onboarding_phasen p ON p.id=f.phase_id
WHERE p.flow_key='lead-erfassung' GROUP BY f.sektion ORDER BY min(f.reihenfolge);
-- b) audience-Split
SELECT f.audience, count(*) FROM onboarding_felder f JOIN onboarding_phasen p ON p.id=f.phase_id
WHERE p.flow_key='lead-erfassung' GROUP BY f.audience;
-- c) db_target-Integritaet: jede leads-Spalte muss existieren (Sentinels _termin/_finalize ausgenommen)
SELECT f.feld_key, f.db_target->>'spalte' AS spalte FROM onboarding_felder f JOIN onboarding_phasen p ON p.id=f.phase_id
WHERE p.flow_key='lead-erfassung' AND f.db_target->>'tabelle'='leads'
  AND f.db_target->>'spalte' NOT IN (SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='leads');
```
Expected: (a) 63 gesamt, (b) 57 beide / 6 dispatcher / 0 kunde, (c) **0 Zeilen** (alle leads-Spalten existieren).

- [ ] **Step 4: Commit** (File + Audit-Body).

---

### Task 4: Regressions-Verifikation (bestehende Flows + audience-Filter)

**Files:**
- Test: `src/lib/onboarding/lead-erfassung-seed.test.ts`

- [ ] **Step 1: Failing test** — prüft, dass `filterFelderByAudience` (P0) den dispatcher-only-Anteil korrekt trennt (reine Logik, kein DB-Zugriff):
```ts
import { describe, it, expect } from 'vitest'
import { filterFelderByAudience } from './filter-felder-by-audience'
import type { OnboardingFeld } from '@/components/onboarding/types'

const mk = (k: string, a: 'beide'|'dispatcher'|'kunde'): OnboardingFeld =>
  ({ id:k, phase_id:'p', reihenfolge:0, feld_key:k, typ:'text', label:k, pflicht:false,
     db_target:{tabelle:'leads',spalte:k}, audience:a } as unknown as OnboardingFeld)

describe('lead-erfassung audience-Trennung', () => {
  const felder = [mk('vorname','beide'), mk('notiz','dispatcher'), mk('sprache','dispatcher')]
  it('Kunde sieht keine dispatcher-only-Felder (Leak-Schutz §9)', () => {
    expect(filterFelderByAudience(felder, 'kunde').map(f=>f.feld_key)).toEqual(['vorname'])
  })
  it('Dispatcher sieht alle', () => {
    expect(filterFelderByAudience(felder, 'dispatcher').map(f=>f.feld_key)).toEqual(['vorname','notiz','sprache'])
  })
})
```

- [ ] **Step 2: Run -> grün** (Helper existiert seit P0): `npx vitest run src/lib/onboarding/lead-erfassung-seed.test.ts` -> PASS.

- [ ] **Step 3: DB-Regression (READ, kein Code)** — bestehende Flows unverändert:
```sql
SELECT flow_key, count(*) FROM onboarding_phasen GROUP BY flow_key ORDER BY flow_key;
-- Expected: beauftragung 5, gutachter-finden 5, kunde-onboarding 5, lead-erfassung 9
```

- [ ] **Step 4: Commit** (Test + Audit-Body).

---

## Self-Review (gegen Spec §4/§8a/§9)

- **Spec-Coverage:** §8a-Felder alle abgebildet oder in §C dokumentiert ausgeschlossen (Vorsteuer/Bankdaten RAUS ✓; WhatsApp-Check ✓; Vorschäden ✓; Zeugen ✓ via composite-Note; Unfallgegner-Kontakt ✓ neue Spalten; Unfallskizze → §C P2). §4 sektionen abgebildet als 9 Phasen ✓. §9 Leak-Schutz: dispatcher-only-Felder (notiz/sprache/whatsapp_verfuegbar/teilschuld/disqualifiziert×2) audience='dispatcher' ✓.
- **Additiv:** neue Flow + 2 Spalten; 0 Änderung an bestehenden Flows/Code (Task-4-Step-3 beweist es).
- **No-Placeholder:** alle db_target-Spalten gegen Live-`leads` verifiziert; optionen reuse verbatim aus DB.
- **P2-Abhängigkeiten** dokumentiert (§D: Boolean-Coercion, conditional_on-bool, i18n, Special-Components).

## Folge-Phasen (eigene Pläne + PRs)
- **P2** `DispatchLeadForm` (flach, audience=dispatcher/beide, sektion-Gruppen, Autosave/Feld + **Boolean-Coercion** §D.1, Flags statt Hard-Block) hinter `?v2` + OCR-always-DB-Fix (§8b) + Checkliste (§8c) + Special-Components (§C).
- **P3** Cutover `/dispatch/leads/[id]` default DispatchLeadForm; Phasen-Maschinerie raus nach grünem Smoke.
- **P4** Re-Smoke beider Strecken + Disqualifikations-Reporting auf manuelles Flag; (später) Kunden-Flowlink-Cutover auf `lead-erfassung` + i18n.
