# CMM-44 SP-B — View-Audit (2026-05-18)

**Query:** `scripts/cmm44-spb-views-audit.sql`
**Ausgeführt gegen:** Prod-DB (Supabase linked), 2026-05-18
**Ergebnis:** 4 Views mit Treffern — 3 benötigen Repoint, 1 false positive

---

## Rohergebnis (view_name | column_name)

| view_name | column_name |
|---|---|
| v_claim_full | deaktiviert_grund |
| v_claim_full | dokumente_reminder_whatsapp_letzte_sendung |
| v_claim_full | dokumente_vollstaendig_fuer_phase |
| v_claim_full | ist_aktiv |
| v_claim_full | kundenbetreuer_fallback_flag |
| v_claim_full | sa_unterschrieben |
| v_claim_full | sa_unterschrieben_am |
| v_claim_full | schadens_ursache |
| v_claim_full | service_typ |
| v_claim_full | sv_zugewiesen_am |
| v_claim_full | szenario |
| v_claim_full | vollmacht_signiert_am |
| v_claim_listing | service_typ |
| v_claim_parties_safe | ist_aktiv |
| v_faelle_mit_aktuellem_termin | abrechnungsart_besprochen |
| v_faelle_mit_aktuellem_termin | abrechnungsart_besprochen_am |
| v_faelle_mit_aktuellem_termin | abrechnungsart_notiz |
| v_faelle_mit_aktuellem_termin | abtretung_pdf |
| v_faelle_mit_aktuellem_termin | abtretung_signiert_am |
| v_faelle_mit_aktuellem_termin | betreuungspaket |
| v_faelle_mit_aktuellem_termin | bevorzugter_kanal |
| v_faelle_mit_aktuellem_termin | bkat_unfallart |
| v_faelle_mit_aktuellem_termin | datenschutz_akzeptiert |
| v_faelle_mit_aktuellem_termin | datenschutz_akzeptiert_am |
| v_faelle_mit_aktuellem_termin | deaktiviert_am |
| v_faelle_mit_aktuellem_termin | deaktiviert_grund |
| v_faelle_mit_aktuellem_termin | deaktiviert_notiz |
| v_faelle_mit_aktuellem_termin | dokumente_reminder_whatsapp_letzte_sendung |
| v_faelle_mit_aktuellem_termin | dokumente_vollstaendig_am_phase |
| v_faelle_mit_aktuellem_termin | dokumente_vollstaendig_fuer_phase |
| v_faelle_mit_aktuellem_termin | fahrzeug_fahrbereit |
| v_faelle_mit_aktuellem_termin | fahrzeugschaden_beschreibung |
| v_faelle_mit_aktuellem_termin | fallakte_angelegt_am |
| v_faelle_mit_aktuellem_termin | geschlossen_grund |
| v_faelle_mit_aktuellem_termin | google_review_gesendet |
| v_faelle_mit_aktuellem_termin | interne_notizen |
| v_faelle_mit_aktuellem_termin | ist_aktiv |
| v_faelle_mit_aktuellem_termin | kanzlei_ansprechpartner_position |
| v_faelle_mit_aktuellem_termin | kundenbetreuer_fallback_flag |
| v_faelle_mit_aktuellem_termin | kundenbetreuer_zugewiesen_am |
| v_faelle_mit_aktuellem_termin | leasinggeber_informiert |
| v_faelle_mit_aktuellem_termin | makler_id |
| v_faelle_mit_aktuellem_termin | mietwagen_argumentations_puffer |
| v_faelle_mit_aktuellem_termin | mietwagen_limit_grund |
| v_faelle_mit_aktuellem_termin | mietwagen_limit_tage |
| v_faelle_mit_aktuellem_termin | mietwagen_rechnung_url |
| v_faelle_mit_aktuellem_termin | mietwagen_rechnung_vorhanden |
| v_faelle_mit_aktuellem_termin | mietwagen_seit_datum |
| v_faelle_mit_aktuellem_termin | mietwagen_vermieter |
| v_faelle_mit_aktuellem_termin | notizen |
| v_faelle_mit_aktuellem_termin | onboarding_complete |
| v_faelle_mit_aktuellem_termin | prioritaet |
| v_faelle_mit_aktuellem_termin | sa_pdf_url |
| v_faelle_mit_aktuellem_termin | sa_unterschrieben |
| v_faelle_mit_aktuellem_termin | sa_unterschrieben_am |
| v_faelle_mit_aktuellem_termin | sa_unterschrift_url |
| v_faelle_mit_aktuellem_termin | schadens_hoehe_netto |
| v_faelle_mit_aktuellem_termin | schadens_ursache |
| v_faelle_mit_aktuellem_termin | service_typ |
| v_faelle_mit_aktuellem_termin | sprache |
| v_faelle_mit_aktuellem_termin | status_changed_at |
| v_faelle_mit_aktuellem_termin | sv_zugewiesen_am |
| v_faelle_mit_aktuellem_termin | szenario |
| v_faelle_mit_aktuellem_termin | unfallmitteilung_status |
| v_faelle_mit_aktuellem_termin | vollmacht_geprueft_am |
| v_faelle_mit_aktuellem_termin | vollmacht_geprueft_von |
| v_faelle_mit_aktuellem_termin | vollmacht_pdf |
| v_faelle_mit_aktuellem_termin | vollmacht_pruefung_begruendung |
| v_faelle_mit_aktuellem_termin | vollmacht_pruefung_status |
| v_faelle_mit_aktuellem_termin | vollmacht_signiert_am |
| v_faelle_mit_aktuellem_termin | vollmacht_status |
| v_faelle_mit_aktuellem_termin | werkstatt_seit_datum |
| v_faelle_mit_aktuellem_termin | zb1_status |
| v_faelle_mit_aktuellem_termin | zeugen_vorhanden |

---

## Bewertung pro View

### v_claim_full — 12 Treffer → REPOINT IN BLOCK 3

Basis: `FROM claims c LEFT JOIN faelle f ON f.claim_id = c.id`
Alle 12 SP-B-Spalten kommen aus `f.<col>` — nach SP-B existieren sie auf `c`, werden auf `c.<col>` repointet.

Repointete Spalten: `service_typ`, `kundenbetreuer_fallback_flag`, `szenario`,
`dokumente_vollstaendig_fuer_phase`, `dokumente_reminder_whatsapp_letzte_sendung`,
`sa_unterschrieben_am`, `vollmacht_signiert_am`, `sa_unterschrieben`,
`sv_zugewiesen_am`, `schadens_ursache`, `deaktiviert_grund`, `ist_aktiv`

### v_claim_listing — 1 Treffer → REPOINT IN BLOCK 3

Basis: `FROM claims c LEFT JOIN faelle f ON f.claim_id = c.id`
`service_typ` kommt aus `f.service_typ` — wird auf `c.service_typ` repointet.

### v_claim_parties_safe — 1 Treffer → KEIN REPOINT (false positive)

Basis: `FROM claim_parties` — keine `faelle`/`claims`-Joins.
`ist_aktiv` gehört zu `claim_parties.ist_aktiv`, nicht zu `faelle.ist_aktiv`.
information_schema matcht nur auf Spaltenname — der Treffer ist ein false positive.
**Kein Repoint nötig.**

### v_faelle_mit_aktuellem_termin — 60 Treffer → REPOINT IN BLOCK 3

Basis: `FROM faelle f LEFT JOIN claims c ON c.id = f.claim_id`
Alle 60 SP-B-Spalten kommen aus `f.<col>` — nach SP-B existieren sie auf `c`,
werden auf `c.<col>` repointet (alle 60 gelisteten Spalten).

**Hinweis Drift-Find:** `schadens_hoehe_netto` war auf `faelle` als `numeric(10,2)` definiert
(nicht plain `numeric`). Der ADD-COLUMN-Block wurde entsprechend auf `numeric(10,2)` korrigiert
(Dry-Run hatte initial 400-Fehler: "cannot change data type of view column ... from numeric(10,2) to numeric").

---

## Spalten die NICHT in der Audit-Liste auftauchen (4 von 64)

`google_review_prompt_gezeigt_am`, `eskaliert_an_admin_id`, `eskaliert_am`,
`eskaliert_grund` — in keiner aktuellen View exponiert. Kein Repoint nötig.

---

## Ergebnis

Block 3 in der Migration enthält `CREATE OR REPLACE VIEW` für:
1. `v_claim_full` (12 SP-B-Spalten)
2. `v_claim_listing` (1 SP-B-Spalte)
3. `v_faelle_mit_aktuellem_termin` (60 SP-B-Spalten)

`v_claim_parties_safe` — kein Repoint (false positive).
