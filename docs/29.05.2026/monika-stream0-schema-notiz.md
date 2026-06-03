# Stream 0 — Live-Schema-Introspektion · Monika-Embed (Plan 2)

**Datum:** 29.05.2026
**Projekt:** Supabase `paizkjajbuxxksdoycev` (Claimondo-v2, ACTIVE_HEALTHY, eu-west-2)
**Zweck:** Pflicht-Vorlauf vor Stream 1 (Migrationen). Verifiziert die Plan-Annahmen gegen den echten DB-Stand. Quelle: MCP `execute_sql` (information_schema/pg_catalog) + PostgREST-OpenAPI + RLS-Migrations-File.

> **Infra-Hinweis:** Der Supabase-Origin flappte während der Introspektion (mehrfach HTTP 522 „Connection timed out" vom Cloudflare→Origin-Layer, Up-Windows ~60s). Lokale Last war minimal (Node-Prozesse 35–50 MB) → **serverseitige Überlastung**, nicht lokal. Deckt sich mit Memory-Regel „522 = Cloudflare-Timeout, lokale Last zuerst prüfen". Die Kern-Fakten sind im Up-Window gezogen; **zwei Voll-Spaltenabzüge (`abrechnungen`, `leads`) vor dem Schreiben der Migrationen nochmal sauber ziehen** (siehe Abschnitt „Vor Stream 1 re-verifizieren").

---

## Task 0.3 — Namens-Clash-Check ✅ alle frei

`anfragen`, `embed_sites`, `embed_abrechnung_positionen`, `embed_widget_events`, `embed_backlink_impressions` existieren **nicht** → keine Kollision. Die neuen Tabellen können additiv angelegt werden.

---

## Task 0.1 — `abrechnungen` (existiert, polymorph, sehr breit, leer)

- **Existiert** und ist polymorph über `(empfaenger_typ, empfaenger_id)`.
- **Sehr breit** (~80+ Spalten, viele semantische Dubletten: `betrag` / `betrag_netto` / `betrag_brutto` / `mwst_betrag`; `pdf_url` / `rechnung_pdf_url`; `rechnungsnummer`; `status`; `sv_id`; `empfaenger_typ` / `empfaenger_id`; `faellig_am`; `zahlungsziel_tage`; `zeitraum_von` / `zeitraum_bis`; `abrechnungsperiode_id` (FK); `positionen_anzahl`). **Voll-Abzug vor Stream 1 erneut ziehen.**
- **KEIN Live-CHECK** auf `empfaenger_typ` oder `status` gefunden (trotz Migrations-Kommentar in `aar_abrechnungen_rls_tighten.sql`, der ein CHECK `{marketing,kanzlei,sv,makler}` *behauptet*). Live ist `empfaenger_typ` **unbeschränkter text**. → Ein Insert mit `empfaenger_typ='sv'` ist DB-seitig unconstrained. (Klassischer „Repo-Doku ≠ Live"-Drift — genau wofür Stream 0 da ist.)
- **Tabelle ist leer** (0 Zeilen) bzw. sehr jung.
- **RLS (gehärtet, `aar_abrechnungen_rls_tighten.sql`):** `abrechnungen_select_admin` (via `public.is_admin()`), `abrechnungen_select_sv` (`empfaenger_typ='sv' AND empfaenger_id IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())`), `abrechnungen_select_makler`. Writes nur `service_role` (kein authenticated INSERT/UPDATE/DELETE).

## `abrechnung_positionen` (existiert, generisch, **DORMANT**)

- Generische Positions-Child-Tabelle. FK → `abrechnungen.id` **und** `claims.id`. Mechanik über `referenz_typ` / `referenz_id` (+ `bezug_typ`, `leistung_typ`, `einzelpreis`, `beschreibung` u.a.).
- **0 Zeilen, 0 Code-Referenzen in `src/`** → wird aktuell von keinem Code genutzt.
- RLS: `abrechnung_positionen_select` (SELECT) + `service_role_all_abrechnung_positionen` (ALL).

## `abrechnungsperioden` (existiert, **DORMANT**, purpose-built für Monats-SV-Abrechnung)

- Spalten u.a.: `id, sv_id, jahr, monat, status, betrag_gesamt, betrag_netto, betrag_brutto, mwst_betrag, anzahl_auftraege, anzahl_positionen, positionen_anzahl, rechnungsnummer, rechnung_pdf_url, faellig_am, bezahlt_am, abgerechnet_am, abgerechnet, zeitraum_von, zeitraum_bis, erstellt_am, sv_id_legacy`.
- **Das ist faktisch genau das Datenmodell, das Plan-Stream-8 „monatliche Sammelrechnung pro SV" braucht** (pro SV + Jahr/Monat + Summen + Rechnungsnummer + PDF + Fälligkeit).
- **0 Zeilen, 0 Code-Referenzen in `src/`** → dormant.

## Storage-Buckets (Q9)

- Bucket **`rechnungen` existiert** (public=false). → Für Abrechnungs-PDFs **wiederverwenden**, nicht neu anlegen. (Weitere Buckets vorhanden: `gutachten`, `dokumente`, `avatare` u.a.)

---

## Task 0.2 — Referenz-Tabellen (Konversions-Ziele)

### `leads` (sehr reich — **hohe Überlappung mit geplanter `anfragen`-Tabelle**)
Bestätigte/relevante Spalten u.a.: `name, email, telefon, status, quelle, gclid, utm_source, utm_medium, utm_campaign, referrer, landingpage, kontakt_versuche, konvertiert_am, disqualifiziert_grund, disqualifiziert_am, dispatch_status, dispatch_zugewiesen_an, dispatch_prioritaet, schaden_konstellation, kunde_anrede, kunde_vorname, kunde_nachname, sv_id (FK sachverstaendige), fall_id (FK faelle), kunde_id (FK profiles), termin_datum, termin_ort, lat, lng, adresse, plz, ort`.
- **RLS:** `leads_admin_all` (ALL), `leads_dispatch_all` (ALL), `leads_insert_public` (INSERT — public darf inserten), `leads_sv_select` (SELECT).
- **Enum-Werte live:** `status ∈ {neu, kontaktiert, qualifiziert, konvertiert, abgelehnt, neu_unbearbeitet}`; `quelle ∈ {website, gutachter_finder, manual, sea_kampagne}`.

### `claims` (Claim-SSoT — CMM-Migration)
- Enthält u.a. `lead_id, sv_id, kunde_*, quelle, status, claim_nummer, schaden_konstellation, besichtigung_*` (Voll-Abzug vor Stream 1).
- **RLS:** `claims_admin_all` (ALL), `claims_dispatch` (ALL), `claims_insert_public` (INSERT), `claims_select_party` (SELECT), `claims_sv_update` (UPDATE).
- **Enum-Werte live:** `quelle ∈ {lead_konvertierung, direkt, gutachter_finder, manuell}`; `status ∈ {neu, in_bearbeitung, gutachten_erstellt, abgeschlossen}`.

### `faelle` (existiert noch — aber per CMM-Migration auf DROP zulaufend)
- `faelle` existiert weiterhin, `leads.fall_id` → `faelle.id`. **ABER:** Laut CMM-44-Strecke ist `faelle` in Phase 6 zum `DROP TABLE CASCADE` vorgesehen, `claims` ist die SSoT. → **Plan-Stream-3 referenziert den Lifecycle `leads → faelle → auftraege`; der reale Stand bewegt sich auf `claims`.** Muss vor Stream 3 abgeglichen werden (nicht blockierend für Stream 1).

### `gutachter_termine` (Konversions-Ziel für Termin → €70-Billing)
Bestätigte Spalten: `id, sv_id, fall_id, lead_id, titel, beschreibung, beginn, ende, ganztags, ort, status, kunde_name, kunde_telefon, kunde_email, kennzeichen, fahrzeug, schadentyp, google_event_id, erinnerung_gesendet, created_at, updated_at, erstellt_von, claim_id, termin_typ, besichtigungsort_lat, besichtigungsort_lng, geschaetzte_fahrzeit_min, anfahrt_distanz_km, verlegt_von_termin_id, verlegung_grund, verlegt_am, original_beginn, absage_grund, abgesagt_am, reminder_24h_gesendet, reminder_1h_gesendet, kalender_synced_am, ical_uid`.
- → Plan-Stream-3.4 `INSERT INTO gutachter_termine (sv_id, lead_id, beginn, ende, status)` ist **kompatibel** — alle Spalten existieren.
- **Wichtig (CMM SP-G2):** Writer müssen **`claim_id`** mitsetzen (Termine sind an Claims gekoppelt). Plan setzt nur `lead_id` → bei Stream 3 `claim_id` ergänzen.
- **Status-Enum live:** `{geplant, angefragt, bestaetigt, verschoben, abgesagt, abgeschlossen}` → Plan nutzt `angefragt` + `bestaetigt` → **passt**.
- `termin_typ ∈ {besichtigung, nachbesichtigung}`.
- **RLS:** `gt_admin_all` (ALL), `gt_sv_select` (SELECT).

### `sachverstaendige` (RLS-Bezug + Billing-Adresse + **bestehendes Whitelabel-Branding**)
Bestätigte Spalten u.a.: `id, name, firma, strasse, plz, ort, telefon, email, profile_id` ✅ (RLS-Link bestätigt), `anrede, vorname, nachname, akademischer_titel, kammer_mitgliedsnummer, oeffentlich_bestellt, bestellungsbehoerde, umsatzsteuer_id, kleinunternehmer_19, iban, bic, kontoinhaber, handelsregister, geschaeftsfuehrer, webseite`, **`use_custom_branding, brand_primary_color, brand_secondary_color, brand_logo_url, brand_secondary_logo_url`**, `kunde_id, profile_id_legacy`.
- → **Billing-Adresse (R14) vollständig vorhanden** (name/firma/strasse/plz/ort/email/umsatzsteuer_id/kleinunternehmer_19/iban/bic/kontoinhaber).
- → **`sachverstaendige.profile_id` bestätigt** — das `abrechnungen_select_sv`-RLS-Pattern funktioniert 1:1 für die neuen Tabellen.
- → **Whitelabel-Branding existiert bereits** (`use_custom_branding` + `brand_*`). Plan-`embed_sites` will eigene `primary_color/accent_color/logo_url` — **überlappt** mit dem etablierten Whitelabel-System (siehe AGENTS.md §whitelabel-branding).

---

## Task 0.4 — RLS-Pattern-Inventar (Vorlage für neue Tabellen)

- **Admin-Helper:** `public.is_admin()` existiert + wird in Policies genutzt.
- **Etabliertes Capture-Tabellen-Pattern** (leads/claims/gutachter_finder_anfragen):
  `<t>_insert_public` (INSERT) + `<t>_admin_all` (ALL) + `<t>_dispatch_all` (ALL, wo Dispatch zuständig) + `<t>_sv_select` (SELECT).
- **SV-Scoping-Pattern:** `… IN (SELECT id FROM sachverstaendige WHERE profile_id = auth.uid())`.
- **Makler-Scoping:** `… IN (SELECT id FROM makler WHERE user_id = auth.uid())`.
- **Writes der sensiblen Tabellen:** nur `service_role` (Webhook + Konversion laufen über `createAdminClient`).

→ **Empfehlung für `anfragen`:** KEIN `insert_public` (anders als leads/claims) — der Webhook validiert serverseitig (Origin/JWT/Zod) und schreibt mit `service_role`. Policies: `anfragen_admin_all` + `anfragen_dispatch_all` + `anfragen_sv_select` (gefiltert auf eigene `embed_sites` UND `status='qualifiziert'`).

---

## Plan-verändernde Befunde → Entscheidungen für Aaron

1. **Billing: zwei dormante, purpose-built Tabellen existieren.** `abrechnungsperioden` (pro SV+Jahr/Monat, mit Rechnungsnummer/PDF/Summen) + `abrechnung_positionen` (generischer Child mit `referenz_typ`/`referenz_id`) — beide 0 Code-Refs. Der Plan will stattdessen `abrechnungen`(`empfaenger_typ='sv'`)-Kopf + **neue** `embed_abrechnung_positionen`. → **Reuse vs. neu — Aaron-Entscheidung.**
2. **`anfragen` überlappt stark mit `leads`** (utm/gclid/dispatch_status/disqualifiziert_*/konvertiert_am/schaden_konstellation/kunde_*). Plan trennt bewusst (raw capture, eigenes Auth-Modell). → **Bestätigen oder in `leads` (mit `quelle`) falten — Aaron-Entscheidung.**
3. **Variante-B-Theme:** `sachverstaendige.use_custom_branding` + `brand_*` existieren bereits (Whitelabel). Plan-`embed_sites` dupliziert Farb-/Logo-Spalten. → **Reuse Whitelabel vs. eigene embed_sites-Felder — Aaron-Entscheidung.**
4. **Lifecycle-Drift:** Plan referenziert `faelle`; CMM-Strecke droppt `faelle` (Phase 6), `claims` ist SSoT. → Stream 3 auf `claims` ausrichten (nicht blockierend für Stream 1).
5. **`empfaenger_typ` hat keinen Live-CHECK** — Doku-Drift, kein Blocker.
6. **Rechnungsnummer (Q11):** `abrechnungsperioden.rechnungsnummer` + `abrechnungen.rechnungsnummer` existieren bereits → Format muss kollisionsfrei sein. Bei Reuse von `abrechnungsperioden` ggf. bestehende Nummernlogik übernehmen.

---

## Vor Stream 1 re-verifizieren (Origin war instabil)

- [ ] Voll-Spaltenabzug `abrechnungen` (alle ~80 Spalten + Typen + NOT NULL + Defaults) — sauber, ein Up-Window.
- [ ] Voll-Spaltenabzug `leads` + `claims` (für Konversions-Insert in Stream 3).
- [ ] `abrechnungsperioden` + `abrechnung_positionen` Voll-Spalten + NOT-NULL (falls Reuse beschlossen).
- [ ] Bestätigen, dass `faelle`-DROP (CMM Phase 6) noch NICHT gefahren ist (sonst Stream 3 zwingend claims-only).

## ENTSCHEIDUNGEN (locked 29.05.2026 — Aaron)

- **Billing-Architektur:** Kopf in **aktiver `abrechnungen`** (`empfaenger_typ='sv'`, `empfaenger_id=sachverstaendige.id`) + **NEUE Child `embed_abrechnung_positionen`** mit `UNIQUE(anfrage_id)` (R15-Doppelabrechnungs-Sperre). KEIN Reuse der dormanten `abrechnungsperioden`/`abrechnung_positionen`.
- **Variante-B-Theme:** Default aus `sachverstaendige.brand_*` (Whitelabel, AGENTS.md-konform) + **optionale nullable Override-Spalten auf `embed_sites`** (null = erbt vom SV).
- **`anfragen`-Tabelle:** **NICHT neu bauen** → bestehende **`gutachter_finder_anfragen`** additiv erweitern (Workflow `wri7v1th5` identifiziert; sie ist die Roh-Anfrage→Lead-Brücke). Details: Abschnitt „gutachter_finder_anfragen — Reuse-Plan".
- **Scope:** **Anfrage → Lead → Termin. ENDE.** Kein Claim-/Fall-/Auftrag-Lifecycle (Aaron 29.05.). Monika generiert nur Anfragen; SV bekommt Termin im Pool.
- **Variante-B-Eingang:** **Dispatcher-Telefonat** (Default) — kein Auto-Flow-Link an Kunden.
- **Cluster-LP-Kanal:** Anfragen **in DB persistieren** (`source='kfz_gutachter_lp'`) → Dispatch wie Variante B. Ändert heutigen Webhook-only-Flow.
- **Q1 SV-No-Response (Variante B):** Eskalation an Dispatch — 4h-Reminder an SV → nach 24h Dispatch-Notification, Dispatch entscheidet (umvermitteln/nachfassen).
- **Q2 Variante A:** komplett kostenlos → **kein Billing-Pfad für A** (nur Variante B wird abgerechnet). Gegenwert = Pflicht-SEO-Backlink (A+B).
- **Q7 B-Zustimmung:** Checkbox + `consent_ts` + AGB-Versions-Hash im Wizard Step 2.
- **Q11 Rechnungsnummer (Default, unbestätigt):** `CLM-EMB-{YYYY}{MM}-{random6}` (konsistent zu bestehendem `CLM-{YYYY}{MM}-{random6}` aus `erstelle-abrechnung.ts:28`, durch EMB-Segment kollisionsfrei). Stream-8-Zeitpunkt final bestätigen.

## Linear-Ticket (locked 29.05.2026)

**AAR-939** — https://linear.app/aaroncmndo/issue/AAR-939/monika-embed-widget-anfragen-backend-sv-self-service-portal
- Branch: `kitta/aar-939-monika-embed`
- Migrations-Präfix: `<timestamp>_aar939_<name>.sql`
- Commit-Scope: `feat(AAR-939): …`
- Variante-A-Status: `embed_free` (locked)

## Offen (vor Stream 1 / db push)

- ~~Workflow-Ergebnis: welche bestehende Tabelle~~ → `gutachter_finder_anfragen` ✅
- ~~Linear-Ticket-Nummer~~ → AAR-947 ✅
- ~~Variante-A-Status-Wert~~ → `embed_free` ✅
- `KFZ_LP_BAILEYS_TARGET` (Aaron WA-Nummer) — für Stream 2/9, nicht Stream 1.
- `siegel-claimondo-partner-v2.svg` → `public/brand/` — für Stream 4, nicht Stream 1.

## `gutachter_finder_anfragen` — Reuse-Plan (Stream 1) ⭐

**Entscheidung (Aaron + Workflow `wri7v1th5`):** Monika baut KEINE neue `anfragen`-Tabelle, sondern erweitert die bestehende **`gutachter_finder_anfragen`** additiv. Sie ist die kanonische Roh-Anfrage→Lead-Brücke (`konvertiereAnfrageZuFall()` → `leads` → `convertLeadToClaim()` → Claim/Fall) und wird vom Dispatch-`RealtimeLeadAlert` (status='entwurf') bereits live konsumiert.

**Live-Spalten (bestätigt 29.05.2026 via information_schema — AUTORITATIV, korrigiert):**
`id, vorname, nachname, email, telefon, kennzeichen, fahrzeug_beschreibung, schadentyp, schadenort, schadenort_lat, schadenort_lng, wunschtermin, zugeordneter_sv_id, zugeordneter_sv_lead_id, matching_typ, sa_signatur_data_url, sa_unterzeichnet_am, status, bestaetigung_gesendet_am, fall_id, erstellt_am, abgebrochen_am, abbruch_phase, regulierungs_modus, fin_vin, hsn, tsn, erstzulassung, fahrzeug_baujahr, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_farbe, halter_vorname, halter_nachname, halter_strasse, halter_plz, halter_stadt, ocr_extrahiert_am, ocr_rohdaten, imagin_url, vorschaden_check_status, vorschaden_check_payload, konvertiert_zu_user_id, konvertiert_zu_lead_id, konvertiert_zu_fall_id, konvertiert_am, magic_link_gesendet_am, konvertierung_fehler, am_unfallort_flag, aufnahme_fotos, aufgenommen_am, whatsapp_verfuegbar, whatsapp_geprueft_am, schuldfrage, fahrzeug_fahrbereit, schadens_kurzbeschreibung, fahrzeugtyp, wunschtermin_wann, bevorzugter_kanal, dsgvo_zustimmung_am, reservierter_slot_von, reservierter_slot_bis, reservierter_sv_id, unterschrift_data_url, kanzlei_wunsch, besichtigungsort_adresse, ga_client_id`

> ⚠️ **Drift-Korrektur:** Eine frühere Notiz nannte `datenschutz_akzeptiert` / `marketing_einwilligung` / `lead_id` — die stammten aus dem (stale) `database.types.ts`. LIVE heißt das Consent-Feld **`dsgvo_zustimmung_am`**, GA-Tracking ist **`ga_client_id`**, und es gibt KEIN separates `lead_id` (nur `konvertiert_zu_lead_id`). Klassische Stale-Types-Falle (Memory „information_schema-Check"). Vor Stream 1 trotzdem nochmal live ziehen.

**Bereits vorhanden → wiederverwenden (kein neuer Spalten-Add):**
- Consent (DSGVO): `dsgvo_zustimmung_am` (timestamptz) → deckt Plan-`consent_ts` ab.
- Tracking: `ga_client_id` (vorhanden) → GA-Client-ID. `gclid` + `utm_*` fehlen → additiv.
- Kanal/WA: `bevorzugter_kanal`, `whatsapp_verfuegbar`, `whatsapp_geprueft_am`. Magic-Link: `magic_link_gesendet_am`.
- Konversion: `konvertiert_zu_lead_id` / `konvertiert_zu_fall_id` / `konvertiert_zu_user_id` / `konvertiert_am` / `konvertierung_fehler` / `status`.
- SV-Bezug/Reservierung: `zugeordneter_sv_id`, `reservierter_sv_id`, `reservierter_slot_von` / `reservierter_slot_bis`.

**Additiv für Monika (ALTER TABLE … ADD COLUMN IF NOT EXISTS):**
- `embed_site_id uuid REFERENCES embed_sites(id)` — bei SV-Embed
- `source text` — Diskriminator `'kfz_gutachter_lp' | 'sv_embed'` (+ ggf. CHECK)
- `variante text` — `'A' | 'B'` (oder aus embed_site ableiten)
- `cluster text`, `stadt_slug text`
- `gclid text`, `utm_source/medium/campaign/term/content text`
- `page_url text`, `origin_domain text`
- Billing: `termin_id uuid REFERENCES gutachter_termine(id)`, `abrechnungs_relevant bool DEFAULT false`, `abrechnungs_betrag_eur numeric(10,2)`, `abrechnung_id uuid REFERENCES abrechnungen(id)`, `abgerechnet_am timestamptz`

**Scope-Cut (Aaron 29.05.2026): Anfrage → Lead → Termin. ENDE.**
Monika generiert **nur Anfragen**. KEIN Claim-Lifecycle, KEIN `faelle`-Eintrag, KEIN `auftraege`-Eintrag (die entstehen ausschließlich im normalen Lead/Claim-Workflow, den Monika nicht auslöst). Der SV bekommt einen vollständigen Termin in seinen Pool, sonst (erstmal) keinen weiteren Service.

→ **Konsequenz für Stream 3:** NICHT den vollen `konvertiereAnfrageZuFall()` (geht bis Claim/Fall) verwenden. Stattdessen ein **leichter Pfad**: Anfrage → `leads`-INSERT (+ `konvertiert_zu_lead_id` zurückstempeln) → `gutachter_termine`-INSERT (`lead_id` + `sv_id`, OHNE claim_id) → €70 am Termin.

✅ **Live-Constraint geprüft (29.05.2026):** `gutachter_termine.claim_id/fall_id/lead_id` sind alle nullable. Trigger `trg_validate_gutachter_termine_claim_id` wirft **nur** `IF NEW.fall_id IS NOT NULL AND NEW.claim_id IS NULL`. → Ein Termin mit **nur `lead_id`** (fall_id NULL, claim_id NULL) ist **erlaubt**. Der Lead→Termin-Pfad ohne Claim funktioniert ohne Trigger-Workaround. (Weiterer Trigger `termin_sync_auftrag_status` feuert nur OF sv_angekommen_am/durchgefuehrt_am/auftrag_id → für Monika-Insert irrelevant.)

**Flow-Verzweigung (Aaron-Modell):**
- **Variante B (paid, `source='sv_embed', variante='B'`):** → erscheint im Dispatch (wie heute gutachter_finder) → Dispatcher-Telefonat → leichter Pfad Anfrage→Lead→Termin → SV bekommt Termin im Pool → 70€ am Termin.
- **Variante A (free, `variante='A'`):** → NUR WhatsApp an SV → **darf NICHT in die Dispatch-Queue** (RealtimeLeadAlert filtert auf status='entwurf'; A braucht eigenen Status/Filter, z.B. status='embed_free', damit Dispatch nicht geflutet wird). Keine Konversion/Termin/Abrechnung.
- **Cluster-LP (`source='kfz_gutachter_lp'`):** persistiert in DB (Aaron: „mit db") → Dispatch wie Variante B. (Heute nur `LEAD_WEBHOOK_URL`, keine DB-Zeile — Monika ändert das auf echte DB-Persistenz.)

**Achtung — `gutachter_finder_anfragen` ist LIVE aktiv** (gutachter-finder-Funnel + Dispatch). Daher:
- nur ADDITIVE Spalten, kein DROP/RENAME bestehender Spalten;
- Monika-Zeilen über `source` diskriminieren;
- Variante-A-Status so wählen, dass bestehende Dispatch-/Konversions-Queries (`RealtimeLeadAlert`, `konvertiereAnfrageZuFall`) NICHT fälschlich Variante-A-Zeilen aufgreifen — vor Stream 1 die Status-Filter dieser Consumer prüfen (Regression-Check).

## Stream 1 — Migrationen ENTWORFEN (29.05.2026, db push offen)

4 Files (DDL nur via supabase-CLI, Regel 2; rein additiv, kein Bestandscode bricht jetzt):
1. `20260529100000_aar939_embed_sites.sql` — neue Tabelle. Trigger `update_updated_at_column` (public, setzt `updated_at`), RLS: `embed_sites_admin_all` (is_admin), `embed_sites_owner_select` (inhaber=auth.uid), Writes nur service_role. Theme-Overrides `brand_{primary,secondary,accent}_override` + `brand_logo_url_override` (NULL=erbt sachverstaendige.brand_*).
2. `20260529100001_aar939_gfa_monika_columns.sql` — 19 ADD COLUMN IF NOT EXISTS auf `gutachter_finder_anfragen` (source/variante/cluster/stadt_slug/gclid/utm_*/page_url/origin_domain/embed_site_id/termin_id/abrechnungs_*). CHECK source∈{kfz_gutachter_lp,sv_embed}|NULL + variante∈{A,B}|NULL (NULL=Bestand). 4 neue Indizes (redundante NICHT angelegt).
3. `20260529100002_aar939_embed_abrechnung_positionen.sql` — Child von `abrechnungen`, UNIQUE(anfrage_id)→gutachter_finder_anfragen, RLS admin+sv_select.
4. `20260529100003_aar939_gfa_anon_policy_source_scope.sql` — ⚠️ SICHERHEITS-FIX an fremder Funnel-Policy (separat freigeben, siehe unten).

### Adversarialer Review (Workflow wypux75mc) — Verdikt fix-then-push, alle Punkte adressiert:
- ✅ CREATE POLICY idempotent (DROP POLICY IF EXISTS) — in allen Files.
- ✅ anon-PII-Leak → Fix-Migration 100003.
- ✅ Redundante Indizes entfernt; Umlaut-Check sauber; numeric(10,2) konsistent.
- 🔲 **embed_free-Regression (Stream-3-Folge, KEIN Stream-1-Blocker):** Dispatch-`actions.ts:83-96` zählt/listet `gutachter_finder_anfragen` teils ohne status-Filter (`select('*')`, statusFilter='alle'). Sobald Stream 2 `embed_free`-Zeilen (Variante A) schreibt, erscheinen sie fälschlich im Dispatch. → Stream 3 MUSS Dispatch-Queries + Statistik-Counts + RealtimeLeadAlert auf `status != 'embed_free'` (bzw. `NOT (source='sv_embed' AND variante='A')`) schärfen. Migration selbst bricht nichts (keine embed_free-Zeilen bis Stream 2).

### ⚠️ Sicherheits-Befund (live 29.05.2026) — Aaron-Entscheidung
`gutachter_finder_anfragen` hat 2 anon-Policies OHNE Owner-Scope: `gfa_anon_select_recent_window` (anon liest ALLE Anfragen <1h) + `gfa_anon_update_entwurf` (anon updated entwurf <2h). Bestehendes PII-Leak des nativen Funnels; Monika würde es verschärfen. Fix-Migration 100003 scoped beide auf `source IS NULL` (nur native bleibt anon-zugänglich, Monika-Zeilen anon-unsichtbar). **Eingriff in fremden Funnel → separat freigeben.**

### Live-Schema-Korrekturen (Build-Befund 29.05.2026)
- `update_updated_at_column()` existiert in `public`, setzt `NEW.updated_at`. `set_aktualisiert_am` existiert NICHT.
- `abrechnungen` echte Spalten (für Stream 8): `abrechnungs_nr, abrechnungs_zeitraum_start/ende, positionen jsonb NOT NULL, summe_netto, ust_satz, ust_betrag, summe_brutto, status NOT NULL, faellig_am, versand_datum, bezahlt_am, pdf_path, created_at, updated_at` (+ stripe/whatsapp/storno-Felder). `id uuid` ✓.
- `sachverstaendige` brand: `brand_primary, brand_secondary, brand_accent, brand_theme` (KEIN brand_logo_url/_color-Suffix).
- `gutachter_finder_anfragen`: 11 Indizes bestehen; NICHT in supabase_realtime-Publication (replica identity=default); `kunde_user_id` existiert NICHT.
- Realtime (Plan Task 1.6): ZURÜCKGESTELLT — gfa ist nicht in der Publication, aber RealtimeLeadAlert lauscht angeblich darauf. Erst klären wie der Dispatch heute Realtime bekommt (leads-Tabelle?) bevor REPLICA IDENTITY FULL auf die breite gfa-Tabelle gesetzt wird.
- DSGVO-IP-Cron (Plan Task 1.7): ENTFÄLLT — Monika speichert keine IP (Daten-Minimierung).
- pg_cron + pg_net verfügbar; 18 bestehende Cron-Jobs.

## Sicher für Stream 1 (sobald Entscheidungen 1–3 + Linear-Ticket da sind)

- `anfragen` + `embed_sites` (+ ggf. `embed_abrechnung_positionen`) additiv anlegbar — Namen frei.
- RLS nach etabliertem Pattern (is_admin + sachverstaendige.profile_id-Scoping, Writes service_role).
- Realtime für `anfragen` analog `aar864_realtime_termine_und_auftraege`.
- Migrations-Naming `YYYYMMDDHHMMSS_<ticket>_<name>.sql`, DDL **nur via supabase-CLI** (Regel 2).
