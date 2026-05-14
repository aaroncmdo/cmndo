# CMM-46 — Phase 2 Reader-Audit (Stand 2026-05-15)

**Linear:** [CMM-46](https://linear.app/aaroncmndo/issue/CMM-46) · **Master:** [CMM-44](https://linear.app/aaroncmndo/issue/CMM-44)

## Methodik

Programmatischer Scan via `scripts/cmm-46-reader-audit.py` über `src/**/*.{ts,tsx,js,jsx,mjs}`.
Erkennt `.from('faelle')` + folgendes `.select('...')` in 8-Zeilen-Fenster.
Klassifikation **D** = `.select(...)`-Liste enthält ≥1 der 38 sync-Trigger-Spalten.

## Zusammenfassung

- **Total faelle-Selects mit String-Literal:** 400
  - davon **`SELECT *`** (immer D):              8
  - davon mit konkreten Spalten:                  392
- **Dynamic / non-literal Selects** (z. B. Konstanten wie `FALL_SELECT`, oder Multi-Line/Method-Chains außerhalb des 8-Zeilen-Fensters): 106
- **D-Reader gefunden** (mind. 1 Duplikat-Spalte gelesen): **78** Stellen in **58** Dateien

Hinweis: Bytes wie `select` über Backslash-Continuation oder TypeScript-Template-Literals werden nicht erkannt — die `selects_dynamic`-Zahl ist die Obergrenze für versteckte D-Reader.

## Top-Dateien (sortiert nach Anzahl D-Reads)

| # | Datei | D-Reads |
|---|---|---:|
| 5 | `src/lib/actions/dispatch-fall-actions.ts` | 5 |
| 4 | `src/lib/faelle/kb-assignment.ts` | 4 |
| 3 | `src/app/admin/team/leaderboard/page.tsx` | 3 |
| 3 | `src/app/gutachter/fall/[id]/actions.ts` | 3 |
| 3 | `src/app/mitarbeiter/performance/page.tsx` | 3 |
| 3 | `src/lib/lexdrive/process-event.ts` | 3 |
| 2 | `src/app/admin/team/page.tsx` | 2 |
| 2 | `src/app/admin/team/[id]/page.tsx` | 2 |
| 2 | `src/app/api/webhooks/twilio/inbound/route.ts` | 2 |
| 2 | `src/app/faelle/[id]/_actions/termine.ts` | 2 |
| 2 | `src/lib/kanzlei-wunsch/actions.ts` | 2 |
| 1 | `src/app/admin/faelle/(hub)/page.tsx` | 1 |
| 1 | `src/app/admin/statistiken/page.tsx` | 1 |
| 1 | `src/app/api/cron/community-leaderboard-update/route.ts` | 1 |
| 1 | `src/app/api/cron/pflichtdokumente-reminder/route.ts` | 1 |
| 1 | `src/app/api/cron/re-termin-eskalation/route.ts` | 1 |
| 1 | `src/app/api/cron/sa-reminder/route.ts` | 1 |
| 1 | `src/app/api/cron/vollmacht-reminder/route.ts` | 1 |
| 1 | `src/app/api/cron/vs-korrespondenz-review/route.ts` | 1 |
| 1 | `src/app/api/cron/vs-timer/route.ts` | 1 |

## Häufigkeit pro Duplikat-Spalte (in D-Selects)

| Spalte | × gelesen | Hinweis |
|---|---:|---|
| `kundenbetreuer_id` | 59 | Massiv in Cron-Jobs + Team-Pages. Migration auf claims relativ einfach (selten allein gelesen — meist mit Workflow-Spalten kombiniert → v_claim_full ideal) |
| `*` | 8 |  |
| `abgeschlossen_am` | 4 | Lifecycle-Datum, in vielen Stat-Pages. v_claim_full bevorzugt |
| `polizei_vor_ort` | 4 |  |
| `vorsteuerabzugsberechtigt` | 3 |  |
| `spezifikation` | 2 |  |
| `kanzlei_ansprechpartner_name` | 2 |  |
| `kunde_email` | 2 |  |
| `unfall_konstellation` | 1 | Stufe-1 Quick-Drop-Kandidat (CMM-45) |
| `polizeibericht_status` | 1 |  |
| `polizei_aktenzeichen` | 1 |  |
| `totalschaden` | 1 | Wertfeld — gehört langfristig zu gutachten (CMM-51) |
| `fahrerflucht` | 1 |  |
| `finanzierung_leasing` | 1 | vehicles-Migration (CMM-50) |
| `gewerbe_flag` | 1 |  |
| `kanzlei_ansprechpartner_email` | 1 |  |
| `nutzungsausfall_tage` | 1 | Wertfeld — gehört langfristig zu gutachten (CMM-51) |
| `restwert` | 1 | Wertfeld — gehört langfristig zu gutachten (CMM-51) |
| `wiederbeschaffungswert` | 1 | Wertfeld — gehört langfristig zu gutachten (CMM-51) |
| `zeugen_kontakte` | 1 |  |

## Migration-Cluster (für PR-Schnitt in CMM-47)

Sortiert nach Refactor-Effizienz (1 PR pro Cluster):

### Cluster A — Cron-Jobs `kundenbetreuer_id`-Reads

Pattern: alle Cron-Routes filtern Fälle nach `kundenbetreuer_id` für Reminder/Eskalation. Aktuell auf `faelle`, kann auf `v_claim_full` oder direkter auf `claims` joined mit Workflow-Spalten.

### Cluster B — Admin-Stat-Pages `abgeschlossen_am` + `kundenbetreuer_id`

`src/app/admin/team/*`, `src/app/admin/statistiken/*`. Diese Reads kombinieren D mit W (status, sv_id). Migration auf `v_claim_full` 1:1 möglich.

### Cluster C — Finance-Aggregationen

`src/lib/finance/fall-finanzen.ts`, `src/lib/analytics/finance.ts`. Lesen Wert-Felder (restwert, wiederbeschaffungswert, nutzungsausfall_tage, totalschaden). **Empfehlung:** in CMM-51-Block (gutachten-Sub-Table) bündeln statt isoliert migrieren — Wert-Felder gehören eh auf `gutachten`.

### Cluster D — Stammdaten-Karten

`src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx` und ähnliche. Reads vieler Spalten gleichzeitig (gewerbe_flag, kanzlei_*, polizei_*, gegner_*). Hier 1 großer Refactor auf `getClaimForRole`-Pattern.

## Alle D-Reader (vollständig)

| File:Line | Duplikat-Spalten gelesen | Select-Snippet |
|---|---|---|
| `src/app/admin/faelle/(hub)/page.tsx:16` | `abgeschlossen_am`, `kundenbetreuer_id` | `id, fall_nummer, status, schadens_ursache, schadens_ort, sv_id, kundenbetreuer_id, mandatsnummer, schadens_fall_typ, kennzeichen, created_at` |
| `src/app/admin/statistiken/page.tsx:152` | `kundenbetreuer_id`, `unfall_konstellation` | `id, status, sv_id, created_at, regulierung_am, regulierung_betrag, gutachten_betrag, gutachten_eingegangen_am, sv_zugewiesen_am, schadens_ur` |
| `src/app/admin/team/[id]/page.tsx:23` | `*` | `SELECT *` |
| `src/app/admin/team/[id]/page.tsx:24` | `*` | `SELECT *` |
| `src/app/admin/team/leaderboard/page.tsx:25` | `abgeschlossen_am`, `kundenbetreuer_id` | `kundenbetreuer_id, created_at, abgeschlossen_am` |
| `src/app/admin/team/leaderboard/page.tsx:26` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/app/admin/team/leaderboard/page.tsx:27` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/app/admin/team/page.tsx:24` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/app/admin/team/page.tsx:25` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/app/api/cron/community-leaderboard-update/route.ts:60` | `abgeschlossen_am` | `id, lead_preis_netto, created_at, abgeschlossen_am` |
| `src/app/api/cron/pflichtdokumente-reminder/route.ts:31` | `kundenbetreuer_id` | `id, fall_nummer, aktuelle_phase, szenario, dokumente_vollstaendig_fuer_phase, kundenbetreuer_id, sv_id, updated_at, dokumente_reminder_whats` |
| `src/app/api/cron/re-termin-eskalation/route.ts:37` | `kundenbetreuer_id` | `id, fall_nummer, lead_id, kundenbetreuer_id, no_show_gemeldet_am, re_termin_token` |
| `src/app/api/cron/sa-reminder/route.ts:36` | `kundenbetreuer_id` | `id, fall_nummer, lead_id, kundenbetreuer_id, created_at, sa_unterschrieben_am` |
| `src/app/api/cron/vollmacht-reminder/route.ts:30` | `kundenbetreuer_id` | `id, fall_nummer, lead_id, kundenbetreuer_id, created_at, vollmacht_signiert_am, mandatsnummer` |
| `src/app/api/cron/vs-korrespondenz-review/route.ts:39` | `kundenbetreuer_id` | `id, fall_nummer, claim_id, kundenbetreuer_id` |
| `src/app/api/cron/vs-timer/route.ts:39` | `kundenbetreuer_id` | `id, anschlussschreiben_am, vs_eskalationsstufe, kundenbetreuer_id, fall_nummer` |
| `src/app/api/kunde/termin/absagen/route.ts:45` | `kundenbetreuer_id` | `id, kunde_id, lead_id, kundenbetreuer_id, fall_nummer` |
| `src/app/api/kunde/termin/verschieben/route.ts:46` | `kundenbetreuer_id` | `id, kunde_id, lead_id, kundenbetreuer_id, fall_nummer` |
| `src/app/api/sv-zuweisung/route.ts:49` | `spezifikation` | `id, schadens_plz, sv_id, status, spezifikation, schadens_art` |
| `src/app/api/termin/ablehnen/route.ts:90` | `kundenbetreuer_id` | `fall_nummer, kundenbetreuer_id` |
| `src/app/api/webhooks/twilio/inbound/route.ts:174` | `kundenbetreuer_id` | `kundenbetreuer_id, fall_nummer` |
| `src/app/api/webhooks/twilio/inbound/route.ts:558` | `kundenbetreuer_id` | `kundenbetreuer_id, fall_nummer` |
| `src/app/dispatch/leads/[id]/_actions/kunden-match.ts:108` | `kundenbetreuer_id` | `id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, kunde_id, kundenbetreuer_id, sv_id, created_at` |
| `src/app/faelle/[id]/_actions/chat.ts:84` | `kundenbetreuer_id` | `fall_nummer, lead_id, kunde_id, kundenbetreuer_id, sv_id` |
| `src/app/faelle/[id]/_actions/dokumente.ts:104` | `*` | `SELECT *` |
| `src/app/faelle/[id]/_actions/filmcheck.ts:163` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/app/faelle/[id]/_actions/kanzlei-paket.ts:216` | `kundenbetreuer_id` | `kundenbetreuer_id, sv_id, fall_nummer` |
| `src/app/faelle/[id]/_actions/manual-phase-override.ts:60` | `kundenbetreuer_id` | `id, fall_nummer, aktuelle_phase, kundenbetreuer_id` |
| `src/app/faelle/[id]/_actions/manual-status-override.ts:57` | `kundenbetreuer_id` | `id, fall_nummer, status, kundenbetreuer_id` |
| `src/app/faelle/[id]/_actions/termine.ts:36` | `kundenbetreuer_id` | `id, kunde_id, kundenbetreuer_id, lead_id` |
| `src/app/faelle/[id]/_actions/termine.ts:140` | `kundenbetreuer_id` | `kunde_id, fall_nummer, lead_id, kundenbetreuer_id` |
| `src/app/faelle/[id]/_sidebar/rueckruf-actions.ts:39` | `kundenbetreuer_id` | `fall_nummer, kundenbetreuer_id` |
| `src/app/flow/[token]/actions.ts:425` | `polizei_vor_ort`, `polizeibericht_status` | `lead_id, leads!faelle_lead_id_fkey(polizei_vor_ort, polizeibericht_pflicht, polizeibericht_status, personenschaden_flag, hat_vorschaeden, zb` |
| `src/app/gutachter/fall/[id]/actions.ts:111` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/app/gutachter/fall/[id]/actions.ts:128` | `kundenbetreuer_id` | `fall_nummer, kundenbetreuer_id` |
| `src/app/gutachter/fall/[id]/actions.ts:589` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/app/gutachter/reklamationen/actions.ts:54` | `kundenbetreuer_id` | `kundenbetreuer_id, fall_nummer` |
| `src/app/gutachter/team/page.tsx:91` | `spezifikation` | `id, fall_nummer, status, schadens_plz, schadens_ort, schadens_adresse, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, spezifikation, sch` |
| `src/app/gutachter/termine/[id]/page.tsx:72` | `polizei_aktenzeichen`, `polizei_vor_ort` | `id, fall_nummer, lead_id, besichtigungsort_adresse, schadens_adresse, schadens_plz, schadens_ort, fahrzeug_hersteller, fahrzeug_modell, kenn` |
| `src/app/kunde/_components/kb-chat-actions.ts:91` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/app/kunde/faelle/[id]/beratung-actions.ts:27` | `kundenbetreuer_id` | `id, kunde_id, kundenbetreuer_id` |
| `src/app/kunde/layout.tsx:126` | `kundenbetreuer_id` | `id, kundenbetreuer_id` |
| `src/app/mitarbeiter/performance/page.tsx:24` | `*` | `SELECT *` |
| `src/app/mitarbeiter/performance/page.tsx:25` | `*` | `SELECT *` |
| `src/app/mitarbeiter/performance/page.tsx:49` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/lib/actions/dispatch-fall-actions.ts:114` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/lib/actions/dispatch-fall-actions.ts:139` | `kundenbetreuer_id` | `kundenbetreuer_id, sv_id, fall_nummer` |
| `src/lib/actions/dispatch-fall-actions.ts:155` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/lib/actions/dispatch-fall-actions.ts:160` | `kundenbetreuer_id` | `id, fall_nummer, sv_id, kundenbetreuer_id, status, storno_grund` |
| `src/lib/actions/dispatch-fall-actions.ts:212` | `kundenbetreuer_id` | `kundenbetreuer_id, fall_nummer` |
| `src/lib/actions/stellungnahme-upload.ts:28` | `kundenbetreuer_id` | `id, fall_nummer, technische_stellungnahme_status, sv_id, kundenbetreuer_id` |
| `src/lib/actions/termin-actions.ts:232` | `kundenbetreuer_id` | `fall_nummer, kundenbetreuer_id, kunde_id` |
| `src/lib/actions/termin-verlegung-actions.ts:611` | `kundenbetreuer_id` | `kunde_id, kundenbetreuer_id, sv_id` |
| `src/lib/chatGruppe.ts:52` | `kundenbetreuer_id` | `kunde_id, kundenbetreuer_id, sv_id` |
| `src/lib/claims/get-kunde-faelle.ts:361` | `abgeschlossen_am`, `kanzlei_ansprechpartner_name`, `kundenbetreuer_id`, `polizei_vor_ort`, `totalschaden` | `id, claim_id, fall_nummer, status, szenario, aktuelle_phase, kunde_id, lead_id, sv_id, kundenbetreuer_id, kanzlei_id, schadens_beschreibung,` |
| `src/lib/claims/kunde-ownership.ts:51` | `kundenbetreuer_id` | `id, claim_id, kunde_id, lead_id, kundenbetreuer_id, sv_id` |
| `src/lib/communications/send-fall.ts:28` | `kundenbetreuer_id` | `id, fall_nummer, lead_id, sv_id, kunde_id, kundenbetreuer_id, regulierung_betrag` |
| `src/lib/dokumente/anforderung.ts:98` | `kundenbetreuer_id` | `id, kunde_id, lead_id, bevorzugter_kanal, kundenbetreuer_id` |
| `src/lib/dokumente/erwartung.ts:228` | `fahrerflucht`, `finanzierung_leasing`, `gewerbe_flag`, `polizei_vor_ort`, `vorsteuerabzugsberechtigt` | `lead_id, personenschaden_flag, sachschaden_flag, zeugen_vorhanden, polizei_vor_ort, polizeibericht_pflicht, fahrerflucht, gewerbe_flag, vors` |
| `src/lib/faelle/kb-assignment.ts:100` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/lib/faelle/kb-assignment.ts:173` | `kundenbetreuer_id` | `kundenbetreuer_id, profiles!faelle_kundenbetreuer_id_fkey(id, aktiv, rolle)` |
| `src/lib/faelle/kb-assignment.ts:227` | `kundenbetreuer_id` | `kundenbetreuer_id, claim_id, profiles!faelle_kundenbetreuer_id_fkey(id, aktiv, rolle)` |
| `src/lib/faelle/kb-assignment.ts:365` | `kundenbetreuer_id` | `id, kundenbetreuer_id` |
| `src/lib/faelle/state-machine.ts:240` | `kundenbetreuer_id` | `mietwagen_flag, nutzungsausfall, kundenbetreuer_id, fall_nummer` |
| `src/lib/finance/abrechnungen-generator.ts:165` | `kanzlei_ansprechpartner_email`, `kanzlei_ansprechpartner_name` | `id, fall_nummer, regulierung_betrag, regulierung_am, kanzlei_ansprechpartner_name, kanzlei_ansprechpartner_email, kanzlei_honorar, lead_id` |
| `src/lib/finance/fall-finanzen.ts:42` | `nutzungsausfall_tage`, `restwert`, `wiederbeschaffungswert` | `gutachten_betrag, schadens_hoehe_netto, wiederbeschaffungswert, restwert, reparaturkosten, wertminderung, nutzungsausfall_tage, nutzungsausf` |
| `src/lib/kanzlei-wunsch/actions.ts:673` | `*` | `SELECT *` |
| `src/lib/kanzlei-wunsch/actions.ts:682` | `*` | `SELECT *` |
| `src/lib/kanzlei/email-fallback.ts:28` | `kunde_email`, `vorsteuerabzugsberechtigt` | `id, fall_nummer, service_typ, kunde_id, kunde_vorname, kunde_nachname, kunde_email, kunde_telefon, kunde_strasse, kunde_plz, kunde_stadt, fi` |
| `src/lib/kanzlei/push-mandat.ts:77` | `kunde_email`, `vorsteuerabzugsberechtigt` | `id, claim_id, fall_nummer, service_typ, kunde_id, kunde_vorname, kunde_nachname, kunde_email, kunde_telefon, kunde_strasse, kunde_plz, kunde` |
| `src/lib/lexdrive/email-sender.ts:36` | `zeugen_kontakte` | `id, fall_nummer, kennzeichen, lead_id, claim_id, gegner_kennzeichen, gegner_name, gegner_versicherung, gegner_schadennummer, zeugen_kontakte` |
| `src/lib/lexdrive/process-event.ts:307` | `kundenbetreuer_id` | `id, fall_nummer, kunde_id, kundenbetreuer_id, sv_id` |
| `src/lib/lexdrive/process-event.ts:360` | `kundenbetreuer_id` | `id, kunde_id, kundenbetreuer_id, sv_id` |
| `src/lib/lexdrive/process-event.ts:421` | `kundenbetreuer_id` | `kundenbetreuer_id` |
| `src/lib/notifications/fan-out.ts:27` | `kundenbetreuer_id` | `id, kunde_id, sv_id, kundenbetreuer_id` |
| `src/lib/onboarding/load-needed-phases.ts:44` | `*` | `SELECT *` |
| `src/lib/sla/kanzlei-mahnungen.ts:361` | `kundenbetreuer_id` | `id, fall_nummer, kanzlei_id, kundenbetreuer_id, kuerzungs_betrag` |
| `src/lib/termine/kb-booking.ts:30` | `kundenbetreuer_id` | `id, kunde_id, kundenbetreuer_id, lead_id` |

## Workflow-Reader (W) — bleiben auf faelle

Alle `.from('faelle').select(...)`-Stellen, die KEINE Duplikat-Spalte lesen (322 Stellen).
Nicht im Detail gelistet — Migration nicht nötig.

## Empfehlung für CMM-47 (Reader-Migration)

1. **Quick-Wins zuerst**: Cluster A (Cron-Jobs) + Cluster B (Admin-Stat-Pages) — beide nur einfache Spalten-Listen, kein UI-Impact, kein RLS-Risiko
2. **Cluster D** als 1 großer PR für Stammdaten-Pfad
3. **Cluster C zurückstellen** bis CMM-51 (gutachten-Sub-Table) — sonst doppelter Refactor
4. **`vehicle_id`-Reads** (Cluster D-Tail) gehört zu CMM-50 (vehicles-Migration)

*Generiert: `scripts/cmm-46-reader-audit.py`*
