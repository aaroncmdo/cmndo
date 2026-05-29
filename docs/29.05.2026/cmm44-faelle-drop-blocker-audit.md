# CMM-44 — faelle-Drop-Blocker-Audit (29.05.2026)

**Status:** Synthese aus 6-Dimensionen-Audit (ultracode workflow `wf_850922c8-853`, 814k tokens, 18 min, 6 Finder erfolgreich, Critic+Synth abgebrochen → manuell synthetisiert).
**Baseline:** Worktree `kitta/cmm44-mp8b-claims-centric-phase` (Stand staging + MP-8b PR #2020).
**Methodik:** Datei-basiert (alle Migrationen unter `supabase/migrations` + `supabase/_archive`, gesamter `src/`-Baum). Live-DB-Cross-Check (`pg_views`, `pg_trigger`, `pg_constraint`) ausstehend — Pooler timeout >30 min.
**Vorbedingung-Notiz:** Diese Synthese ersetzt die 2 Wochen alte Master-Strategie (`docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`) als aktuelle, evidenzbasierte Blocker-Karte.

---

## 1 · Executive Summary

`DROP TABLE faelle CASCADE` ist **noch weit weg**. Die zentrale Befund-Mathematik:

| Metrik | Zahl | Bedeutung |
|---|---:|---|
| `.from('faelle')` Aufrufe in `src/` | **417** in 222 Dateien | Jeder bricht hart beim Drop (TS-Fehler + Runtime) |
| Views, die NEUESTE Definition noch `FROM/JOIN faelle` haben | **6 von 11** | Härtester Phase-6-Block (müssen claims-zentrisch neu gebaut werden) |
| Faelle-Writer (insert/update/delete) | **~40 Sites** + Root-Helper `splitOrKeepFaelleUpdate` | Jeder Write wirft post-Drop |
| **Akute Prod-Bugs der MP-8b-Klasse** (faelle.id ≠ claims.id) | **3 CRITICAL** | Kanban-Gruppierung kollabiert *jetzt schon* still für 73/74 Karten |
| Kind-Tabellen mit `fall_id`-FK auf faelle (kein Repoint gefunden) | **~13** | Datenmodell-Bruch wenn CASCADE nur Constraints, nicht Spalten droppt |
| Trigger/Funktionen/Crons auf ANDEREN Tabellen, die faelle lesen/schreiben | **9** | Runtime-Breaker (CASCADE räumt sie NICHT weg) |

**Bereits sauber (bestätigt):** `v_claim_phase` (MP-8b, FROM claims), `v_claim_sv`, `v_claim_for_gast`, `v_claim_parties_safe`, `v_gutachten_werte`. Die claims/types.ts ist claims-zentrisch. Lokale `Fall*`-Typen (ClaimFull/Listing/FallThread) sind handgeschriebene Subsets, nicht an faelle-Row gekoppelt — überleben den Drop.

**Härtester Block-Layer:** die 6 Views in MP-6c sind die *Linchpins* — sie ziehen ~50 f.*-Spalten pro View direkt aus faelle (Fahrzeug, Halter, Vorschaden, Cardentity, Mietwagen, FIN, etc.). Diese Spalten müssen vorher in claims (oder sub-tables) eine Heimat haben, **dann** die Views repointet werden, **dann** die 417 Reader/Writer migriert. Erst danach ist der DROP möglich.

---

## 2 · Akute Folge-Tickets aus MP-8b (sofort, vor Phase-4)

MP-8b hat v_claim_phase claims-zentrisch gemacht (claims.id = view key). Drei Caller wurden NICHT auf `getClaimPhaseMap(claimIds)` migriert und übergeben weiterhin `faelle.id` an `v_claim_phase`. Da claims.id ≠ faelle.id für 73/74 Fälle, matcht der Lookup nicht → Phase-Spalten = `null` → Kanban-Gruppierung kollabiert in den `erfassung`-Guard-Fallback.

| # | Datei | Symptom | Fix |
|---|---|---|---|
| 1 | `src/app/admin/faelle/(hub)/page.tsx:86,150-155,163` | Admin-Fallakten-Hub: `fallIds = rows.map(r=>r.fall_id)` → `.in('claim_id', fallIds)`. Kommentar Zeile 161/283 `// claim_id == fall_id` *ist* die gebrochene Annahme. | `v_claim_listing` liefert `main_phase`/`sub_phase` schon mit → separater v_claim_phase-Read redundant streichen. Sonst: `rows.map(r=>r.claim_id)` + `phaseMap.get(r.claim_id)`. |
| 2 | `src/app/kanzlei/mandate/page.tsx:58-63` | Kanzlei-Mandate: `mandatIds = faelle.map(f=>f.id)` → `.in('claim_id', mandatIds)`. Mandate zeigen keine/falsche Phasen. | `claim_id` aus `claims:claim_id`-Embed sammeln; `getClaimPhaseMap(claimIds)` (wie `lib/makler/queries.ts`) wiederverwenden. |
| 3 | `src/app/kanzlei/kanban/page.tsx:48-53` | Kanzlei-Kanban: identisch wie Mandate. Spalten-Gruppierung leer. | wie #2 |
| 4 | `src/lib/claims/get-claim-for-role.ts:184-187` | Stale Kommentar: *"Nach Phase 6 ist faelle.id = claims.id (1:1 nach Cleanup)"* — widerspricht der MP-8b-Invariante, verleitet künftige Sessions zur gleichen Bug-Klasse. | Kommentar korrigieren: IDs sind und bleiben ungleich. Helper bleibt notwendig. |
| 5 | `src/lib/claims/types.ts:30-41 (ClaimFull)` | Kommentar Zeile 31 *"parallele Row, gleiche id"* — selbe stale Behauptung. | Kommentar korrigieren. Kein TS-Handlungsbedarf. |

**Empfehlung:** ein PR `MP-8c — faelle.id≠claims.id Reader-Fixes` (3 Files-Edits + 2 Kommentar-Korrekturen). Lohnt sich bevor Phase 4 startet — die Bugs sind *jetzt schon* live und maskieren Phasen.

---

## 3 · Blocker-Karte nach Kategorie

### 3.1 Views (6 Phase-4-Linchpins)

Pro View: neueste Definition + ob sie faelle in der primären FROM-Tabelle oder nur LEFT JOIN nutzt.

| View | Severity | faelle-Rolle | Hauptproblem | Claims-zentrische Aktion |
|---|---|---|---|---|
| `v_faelle_mit_aktuellem_termin` | **critical** | primäres `FROM faelle f LEFT JOIN claims c` | ~50 f.*-Spalten direkt aus faelle (fahrzeug/halter/gegner/vorschaden/organisation/dispatch/kunde_id). Härtester Block. | `FROM claims c LEFT JOIN faelle f ON f.claim_id = c.id` repointen; sukzessive f.*-Spalten nach claims/Sub-Tables migrieren. Output-Spaltenliste byte-identisch halten (Reader-Stabilität). |
| `faelle_kunde_view` | **critical** | primäres `FROM faelle f` | f.kennzeichen, f.fahrzeug_*, f.auszahlung_kunde_*, f.kunde_id, f.sv_id direkt | wie oben; Kunde-Owned-Filter unverändert |
| `faelle_sv_view` | **critical** | primäres `FROM faelle f` | f.kennzeichen, f.fahrzeug_*, f.sv_id, f.kunde_id | wie oben; sv_id ist via CMM-60 schon auf claims |
| `v_claim_full` | **critical** | `LEFT JOIN faelle f` für ~40 f.*-Restspalten | f.kennzeichen, f.fahrzeug_hersteller/_modell/_typ, f.gegner_*, f.organisation_id, f.dispatch_id, f.kunde_id, f.hat_vorschaeden, f.vorschaden_*, f.cardentity_*, f.halter_*, f.fin_*, f.source_channel, f.mietwagen_kanzlei_*, f.ist_fahrzeughalter, f.lackfarbe_code, f.kunde_lat/_lng, f.hsn/_tsn, f.zahlung_erwartet_am, f.auszahlung_kunde_* | Restspalten nach claims/Sub-Tables ziehen, dann LEFT JOIN entfernen |
| `v_claim_listing` | **high** | `LEFT JOIN faelle f` nur für `f.id AS fall_id` + `f.sv_id` | sv_id ist via CMM-60 schon claims-nativ → sofort von `c.sv_id` ziehen; fall_id-Output entfernen oder NULL casten | LEFT JOIN entfernen (kleinster View-Fix) |
| `v_claim_timeline` | **high** | 13 Referenzen | Korrelierte Subqueries `SELECT f.id FROM faelle WHERE f.claim_id=…` zur fall_id-Ableitung + JOINs `faelle ON f.id = pt.fall_id` (phase_transitions/timeline-Branch) | fall_id-Subqueries löschen oder claim_id-only ausgeben; phase_transitions/timeline-Branches über deren eigene claim_id-FK joinen (wenn vorhanden — sonst zuerst claim_id additiv backfillen, siehe §3.5) |

**Migrations-Ordnung:** zuerst die 2 leichten (`v_claim_listing`: LEFT JOIN weg; `v_claim_timeline`: claim_id-only). Dann die 4 schweren (alle 4 hängen am gleichen ~50-Spalten-Mapping nach claims/Sub-Tables — gemeinsam migrieren).

### 3.2 Trigger/Funktionen/Crons auf ANDEREN Tabellen (9 Runtime-Breaker post-Drop)

CASCADE räumt diese **nicht** weg (sie liegen nicht ON faelle, sondern lesen/schreiben es). Müssen vor/in Phase 6 explizit gedroppt oder umgeschrieben werden.

| Objekt | Wo | Was kaputtgeht post-Drop | Aktion |
|---|---|---|---|
| Trigger `trg_sync_claims_sv_id_to_faelle` ON claims + Fn `sync_claims_sv_id_to_faelle()` | `migrations/20260516192003_cmm60_schritt3_reverse_sync_claims_sv_id.sql:13-35` | UPDATE faelle SET sv_id wirft bei jedem claims.sv_id-UPDATE | DROP TRIGGER+FUNCTION vor/mit faelle-Drop. claims.sv_id ist bereits SSoT (CMM-60). |
| Trigger `trg_sync_kanzlei_paket_to_faelle` ON kanzlei_pakete + Fn | `migrations/20260427140300_aar854…sql:7-27` | UPDATE faelle SET aktuelle_phase wirft bei jedem kanzlei_pakete-Status-Update | DROP — Phasen-Logik ist seit MP-6c claims-zentrisch (v_claim_phase) |
| Trigger `trg_kanzlei_faelle_sync` ON kanzlei_faelle + Fn `kanzlei_faelle_sync_claim_fall()` | `migrations/20260502005823_cmm37…sql:50-69` | SELECT claim_id FROM faelle wirft bei jedem kanzlei_faelle-Write | DROP. kanzlei_faelle.claim_id ist NOT NULL + UNIQUE SSoT. |
| Trigger `fall_dokumente_sync_claim_id` ON fall_dokumente + Fn | `migrations/20260514092159_aar_862…sql:44-64` | SELECT claim_id FROM faelle wirft bei jedem Doku-Insert mit nur fall_id | DROP. Caller müssen claim_id direkt setzen. |
| Fn `dsgvo_anonymize_user_data(uuid)` (SECURITY DEFINER) | `migrations/20260517012837_cmm44_spa…sql:745-818` | UPDATE faelle SET kunde_* wirft → DSGVO-Löschung schlägt komplett fehl (RAISE) | Komplett claims-zentrisch neu schreiben; claim_parties-Subquery von `fall_id IN (SELECT id FROM faelle)` auf `claim_id IN (SELECT id FROM claims)`. **DSGVO-kritisch — vor Drop testen.** |
| Cron Fn `cron_konsistenz_check()` ('0 8 * * *') | `migrations/20260426153000_aar826…sql` | Check 1 (faelle-ohne-claim) wirft; EXCEPTION fängt → ALLE Checks 2-6 laufen nie durch | Check 1 ersatzlos entfernen (Invariante post-Drop gegenstandslos) |
| Cron Fn `cron_vs_frist_reminder()` ('0 9 * * *') | `migrations/20260426151000_aar826…sql:47-80` | INSERT notification_events.fall_id mit SELECT f.id FROM faelle wirft → VS-Frist-Reminder feuern still nicht mehr | Subselect entfernen, notification_events claim-zentrisch befüllen (hängt an §3.5 notification_events) |
| Cron Fn `cron_kanzlei_paket_pending_check()` (jobid 14) | `migrations/20260528192402_cmm44_mp6c…sql:25-86` | JOIN faelle wirft → kanzlei_paket_pending-Events feuern nicht mehr | faelle-JOIN entfernen, fall_id durch claim_id ersetzen, phase_transitions-Subquery claim-keyed (hängt an §3.5 phase_transitions) |
| Fn `trg_fall_dokumente_autotask()` (dormant) | `migrations/20260517012837_cmm44_spa…sql:824-898` | falls reaktiviert: SELECT faelle JOIN claims wirft | Claim-zentrisch umschreiben oder droppen falls dauerhaft tot |

### 3.3 RLS-Policies

- **Policies ON faelle** (`faelle_staff_all_consolidated`, `faelle_kunde_sv_kanzlei_select_consolidated`, `faelle_makler_read`): fallen mit dem Tabellen-Drop automatisch. Kein Block. Voraussetzung: Schutz-Äquivalente auf claims existieren (per CMM-60 schon vorhanden: `claims_staff_all_consolidated`, `is_sv_for_claim`).
- **`leads_staff_all_consolidated` ON leads** (`migrations/20260517012837_cmm44_spa…sql:654-664`): `EXISTS (SELECT 1 FROM faelle f JOIN claims c ON c.id=f.claim_id … WHERE f.lead_id=leads.id …)` — der faelle-JOIN bleibt drin. **Blockt den Drop** (Policy hängt direkt an Relation). Vor Drop: faelle-JOIN durch `claims c WHERE c.lead_id = leads.id` ersetzen.

### 3.4 FK-Constraints — Daten-Modell-Risiko

Per `DROP TABLE faelle CASCADE` werden FK-Constraints automatisch entfernt (kein Block), aber die `fall_id`-Spalten der Kind-Tabellen bleiben mit dann verwaisten UUIDs zurück. Pro Tabelle eine Entscheidung nötig: (a) `claim_id` additiv + Backfill + Reader-Umstellung + `fall_id`-DROP, oder (b) als historisch einfrieren und fall_id als FK-lose UUID behalten.

**Kritische (NOT NULL fall_id, ohne nachgewiesene claim_id-Migration):**

| Tabelle | Hat schon claim_id? | Aktion |
|---|---|---|
| `auftraege` | **ja** (CMM-1.5) — `auftraege.claim_id` SSoT seit Phase 1.5 | `ALTER COLUMN fall_id DROP NOT NULL` → FK drop → DROP COLUMN. Reader auf claim_id-Sweep nötig (manche Trigger/Views lesen noch fall_id). |
| `kanzlei_faelle` | **ja** (CMM-37) — NOT NULL UNIQUE | wie auftraege. |
| `phase_transitions` | **nein** | claim_id additiv anlegen + aus faelle.claim_id backfillen, Reader umstellen (cron_kanzlei_paket_pending_check), dann fall_id drop |
| `notification_events` | **nein** | claim_id additiv + Backfill + alle event-emittierenden Crons umstellen, dann fall_id drop |
| `sla_tracking` | **nein** (laut Migrationen) | claim_id additiv + Backfill + Reader-Sweep |
| `fall_summaries`, `ki_gespraeche`, `kunde_gutachten_requests`, `personenschaden_personen`, Makler-Self-Service-Tabellen | **nein** | Entscheiden: claim_id-Migration oder historisch einfrieren |

**Unkritisch (SET NULL / nullable fall_id):** `ai_usage_log`, `aircall_calls`, `whatsapp_inbound.matched_fall_id`, `kanzlei_admin_termine`, `sv_live_location`, `matelso_calls`, `gutachter_finder_anfragen.konvertiert_zu_fall_id`. CASCADE droppt Constraint, Spalte bleibt als nicht mehr referenzierende UUID — akzeptabel falls historisch.

### 3.5 Reader (417 .from('faelle') in 222 Dateien)

**Pro Portal die kritischen Cluster:**

| Portal/Pfad | Kritische Reader | Hauptkomplikation |
|---|---|---|
| **Kunde** | `lib/claims/get-kunde-faelle.ts:228` (zentral, FALL_SELECT), `app/kunde/faelle/[id]/page.tsx:169,350`, kunde/page, chat, termine, onboarding-details, nachbesichtigung; Banner-Components | Route `/kunde/faelle/[id]` ist faelle.id-keyed → CMM-28 URL-Switch nach claim.id nötig |
| **SV (Gutachter)** | `gutachter/fall/[id]/actions.ts` (~25 reads), faelle/page, termine/[id], abrechnung, feldmodus, posteingang, team, heute | sv_id ist via CMM-60 SSoT; sehr viele f.*-Detail-Reads |
| **Admin** | `faelle/(hub)/page.tsx:109` (supplemental fall-read), KPI-Widgets, sachverstaendige/_karte, finance hub | v_claim_listing reicht für Listing; supplemental-reads + Detail (faelle/[id]/_actions/* ~45 reads) zu migrieren |
| **Kanzlei** | `kanzlei/mandate`, `kanzlei/kanban` (auch §2 id-bug), kanzlei-wunsch/actions.ts (~15 reads incl. faelle-by-claim-id-Resolver) | Mandate/Kanban-Daten von kanzlei_faelle/claims, fall-by-claim-Resolver weg |
| **Dispatch + SV-Zuweisung** | `api/sv-zuweisung/route.ts` (6 reads), `dispatch-fall-actions.ts` (~12), dispatch/dashboard, sv-termin | Schreibt zwar bereits claims.sv_id, liest aber noch faelle |
| **Makler** | `lib/makler/queries.ts:657/662/667/1189`, copilot-prompt | makler/queries.ts ist via MP-8b auf v_claim_phase claims-keyed (sauber); Detail-Reads noch auf faelle |
| **Magic-Link-Flows** | `app/flow/[token]/actions.ts` (8 reads), upload/dokumente, flow/signatur | Token → claim resolven, party-Linkage via claim_parties statt faelle.kunde_id |
| **Communications/SLA** | send-fall, send-chat, channel-router, whatsapp, notifications/fan-out, sla/tracker, sla/kanzlei-mahnungen, sla/completion-signals, resolver/* | Empfänger + Lifecycle-Kontext aus claims; KB von claims.kundenbetreuer_id |
| **LexDrive** | `lib/lexdrive/process-event.ts` (8 reads), email-sender, api/lexdrive/*, api/webhooks/lexdrive | Webhooks haben claim.id schon — faelle.id-Round-Trips kappen |
| **Finance/Billing/Analytics** | `lib/abrechnung/*`, `lib/finance/*`, admin/finance hub, analytics/finance/conversion/sv-performance | Finance-Aggregate auf claims + claim_payments (SP-J) ankern |
| **Document/OCR-Pipeline** | dokumente/*, gutachten/ocr-actions, api/ocr-* | Vehicle/VIN aus claim_vehicle_involvements+vehicles |
| **Crons** | send-reminders, termin-erinnerungen, pflichtdokumente-reminder, re-termin-eskalation, kb-termin-reminder(-1h), case-billing-batch, release-makler-provisionen, community-leaderboard-update, send-lead-reminders | Stillbreaker-Gefahr: Crons fehlen ohne UI-Fehler |
| **Termin/Calendar** | termin-actions, termin-verlegung-actions, lib/termine/*, api/termin/ablehnen, google-calendar/sv-*, kalender/caldav/* | gutachter_termine.claim_id ist via SP-G2 SSoT — fall_id-JOIN-Hop weg |
| **Brand/Whitelabel** | branding/token-theme, branding/kunden-theme | sv_id aus claims |
| **Tasks/Reklamationen** | admin/tasks, admin/meine-tasks, admin/reklamationen, gutachter/tasks, components/tasks/UeberfaelligeTasks, lib/tasks/entity-loader | tasks-Referenzen auf claim_id; claim_nummer direkt aus claims |
| **claims/ helper layer** | get-claim-for-role, owned-claims, kunde-ownership, create-for-fall, onboarding/load-needed-phases, kunde/auto-claim | Ownership aus claim_parties (CMM-63); onboarding aus claims.onboarding_complete (SP-B) |

**Empfehlung Phase 4:** Portal-weise Sweeps (Kunde → SV → Kanzlei → Admin → Magic-Link → Communications/Crons → Helpers/Brand). Jeder Sweep ein Spec/Plan/PR-Triplet mit Smoke-Tests pro Portal. **Vor jedem Sweep** den Phase-1-Audit-Punkt §3.1a (Spalten-Domänen-Mapping) und §3.1b (Rendering-Bedingungen) für die berührten Domänen schließen — sonst migrieren wir Reader auf nicht existierende claims-Spalten.

### 3.6 Writer (~40 Sites)

**Root-Blocker:** `src/lib/faelle/claim-duplicate-columns.ts:splitOrKeepFaelleUpdate`. Designt um residual `faelleUpdate` weiter auf faelle zu schreiben ("faelle behält die Spalten bis Phase 6"). 10+ Caller (state-machine, lexdrive/process-event, stammdaten, core deactivate/reactivate, eskalation-actions, kanzlei-paket, billing-flows, admin/abrechnungen) hängen daran. Solange der Helper lebt + Residual non-empty zurückgibt, ist Phase 6 unmöglich.

**Inserts (2 Prod-Pfade):**
- `lib/leads/convert-lead-to-claim.ts:455-457` — Haupt-Convert-Pfad. INVERTIEREN: claim first, kein faelle-INSERT mehr.
- `app/admin/faelle/anlegen/actions.ts:103-109` — manuelle Admin-Anlage. Selbe Inversion.

**Highest-Traffic Update:** `lib/faelle/state-machine.ts:154-157` — Status-Übergänge. Status-Spalte muss SSoT in claims werden (oder im Lifecycle-Owner) → keine faelle.update mehr.

**Unconditional Touches (sofort fixbar):** `app/faelle/[id]/_actions/core.ts:79,115`, `_sidebar/eskalation-actions.ts:66,108` schreiben `faelle.update(faelleUpdate)` UNCONDITIONAL — auch wenn das Object nur `{updated_at}` enthält. Ohne `length>0`-Guard → kann sofort gestrichen werden (claims.updated_at / `touch_claim_recency` reicht).

**Kategorien noch-zu-migrierender Spalten** (aus `splitOrKeepFaelleUpdate`-Source):

| Cluster | Beispielspalten | Heimat-Vorschlag |
|---|---|---|
| Status/Workflow | `status`, lifecycle-marker `*_am` | claims (oder Lifecycle-Owner) |
| SV-Zuweisung | `sv_id`, `organisation_id` | claims (sv_id via CMM-60 schon SSoT) |
| Kunde-Linkage | `kunde_id` | claim_parties (geschaedigter) — CMM-63 Pfad |
| FIN/Fahrzeug-OCR | `fin_vin`, `fin_quelle`, `fin_extrahiert_am`, `kennzeichen`, `fahrzeug_*`, `erstzulassung`, `hsn`, `tsn`, `lackfarbe_code` | `vehicles` (44-Spalten SSoT) via `vehicle_id`, NICHT claims |
| Halter-OCR | `halter_*` | `claim_parties` (rolle=halter) bzw. `vehicles.current_owner_id` |
| Vorschaden (Cardentity) | `vorschaden_*`, `hat_vorschaeden`, `cardentity_*`, `vorschaden_typ_*_bericht` | claims oder vehicles-historie (Phase-1-Audit §3.1c) |
| Termin-Hilfsfelder | `besichtigungsort_*`, `polizei_aktenzeichen` | `gutachter_termine` (SSoT) |
| Vollmacht-Datum | `vollmacht_datum` | claims (vollmacht_signiert_am ist schon dort) |
| Gutachten-OCR-Residuen | `ocr_*`, `nutzungsausfall_tagessatz`, `reparaturdauer_tage`, `gutachter_honorar` | gutachten-Sub-Table (SP-G), via RPC `apply_gutachten_ocr` |
| Lead-Preis | `lead_preis_netto`, `lead_preis_typ`, `lead_preis_berechnet_am` | claims |

**Test/Seed-Writer:** `lib/smoke/lifecycle-seed.ts:166`, `scripts/seed-test-data.ts:265`, `api/seed-testdata/route.ts:91/498/898`, `api/admin/create-test-fall/route.ts:122`, `api/admin/test/cmm48-smoke/route.ts:191` — alle insert/update/delete auf faelle. Vor Drop auf claims-Insert umschreiben (oder löschen falls obsolet).

### 3.7 Type-Kopplung (417 Build-Errors am Drop-Tag)

Es gibt **0** explizite faelle-Row-Typ-Ableitungen (`Tables<'faelle'>`, `Database['public']['Tables']['faelle']`) im src-Baum. Die *einzige* Definition ist der generierte Block in `src/lib/supabase/database.types.ts:3329` — der verschwindet automatisch beim Type-Regen nach dem Drop.

Die **strukturelle Kopplung** ist der `SupabaseClient<Database>`-Generic: 16+ explizite Annotationen + alle `createClient`-Pfade. Konsequenz: `.from('faelle')` ist Compile-time-string-literal-typisiert → nach `generate_typescript_types` werden ALLE 417 Calls zu TS2769/TS2345.

**Reihenfolge ist kritisch:** Type-Regen NICHT vor dem Call-Site-Sweep — der `faelle`-Block in `database.types.ts` ist die Maske, die die 417 Errors zeigt. Erst Reader/Writer migrieren (oder die Calls auf andere Tabellen umrouten), DANN Drop + Regen.

Stale Kommentare zum mitfixen: `claims/types.ts:31` ("parallele Row, gleiche id" — falsch).

---

## 4 · Empfohlene Sequenz bis `DROP TABLE faelle CASCADE`

Erweitert den Phase-0-6-Rahmen der 16.05.-Master-Strategie mit aktueller Evidenz. Phase 0-2 sind großteils erledigt (siehe Memory-Trace: SP-G2/SP-D Termin-Migration, CMM-60 sv_id, CMM-63 kunde_id). Phase 3 läuft (CMM-48-Strecke). Was offen ist:

### Phase 3.5 — Akute Folge-Fixes aus MP-8b (sofort, 1 PR)

- Ticket **MP-8c** (1-2 Tage): die 3 id-Annahmen-Bugs aus §2 fixen + 2 stale Kommentare. Schließt die MP-8b-Klasse vollständig.
- Plus: Live-DB-Cross-Check (sobald Pooler zurück): `pg_views` (Definition der 6 Views), `pg_trigger` (sind alle 9 cross-table Trigger noch attached?), `pg_constraint confrelid='faelle'::regclass` (welche FKs faktisch live?), `pg_proc` für `dsgvo_anonymize_user_data` + die 3 Crons.

### Phase 4 — Reader-Migration + View-Repoint (mehrere PRs, ~2-3 Wochen)

Die einzige tractable Dekomposition geht **bottom-up nach Spalten-Cluster + portal-Sweep**:

1. **Phase 4.0 — Spalten-Domänen-Mapping abschließen** (Phase-1.1 Audit aus Master-Strategie): jede der ~226 noch-faelle-only Spalten in eine Heimat (claims / vehicles / gutachten / auftraege / kanzlei_faelle / claim_parties / abrechnungen) bzw. DROP. Pro Cluster ein Sub-Ticket SP-K/L/M/...
2. **Phase 4.1 — Kleinste Views (1 PR)**: `v_claim_listing` (LEFT JOIN weg, sv_id von claims), `v_claim_timeline` (fall_id-Subqueries weg).
3. **Phase 4.2 — Schwerste 4 Views**: `v_claim_full`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`. Hängt direkt an Phase 4.0. Migration cluster-weise (Fahrzeug-Cluster → vehicles, Halter → claim_parties, Vorschaden → claims/vehicles, etc.). Pro View ein PR oder gebündelt nach Cluster.
4. **Phase 4.3 — Reader-Sweeps pro Portal** (parallelisierbar): Kunde / SV / Kanzlei / Admin / Magic-Link / Communications+Crons / Helpers. Jeder Sweep ein Spec/Plan/PR + Smoke.
5. **Phase 4.4 — Route-Schema-Switch** (CMM-28 β/γ): `/kunde/faelle/[id]` und `/faelle/[id]` von faelle.id auf claim.id umlenken (mit Redirect-Legacy für Bookmarks). Optional — können auch nach dem Drop migrieren wenn /faelle/* dann auf claims geht.

### Phase 5 — Writer-Migration + Sync-Trigger-Abschaltung (~1 Woche)

1. **Insert-Pfade invertieren** (1 PR): `convert-lead-to-claim` + `admin/anlegen` schreiben nur noch claim, kein faelle.
2. **Status-SSoT-Pfad** (1 PR): `state-machine.ts` schreibt claims.status, nicht faelle.status. Hängt an Phase 4.0 (status-Spalte muss claim-SSoT sein).
3. **`splitOrKeepFaelleUpdate` retirement** (cluster-weise): pro Spalten-Cluster die Caller direkt auf claims/Sub-Table umstellen, Set-Eintrag streichen. Wenn der Set leer ist, Helper komplett löschen.
4. **Unconditional faelle-Touches sofort streichen** (1 schneller PR): `core.ts:79,115`, `eskalation-actions.ts:66,108` (nur updated_at).
5. **Sync-Trigger droppen** (Phase-6-Migration-Bundle): die 4 cross-table Trigger + 1 RLS-Policy + 3 Crons + DSGVO-Fn umschreiben/droppen.

### Phase 6 — DROP TABLE faelle CASCADE (1 Migration + 1 Type-Regen-PR)

1. `ALTER POLICY leads_staff_all_consolidated` auf claims-JOIN.
2. `DROP TRIGGER` × 4 + `DROP FUNCTION` für die cross-table-Sync-Funktionen.
3. `CREATE OR REPLACE FUNCTION` für `dsgvo_anonymize_user_data`, `cron_konsistenz_check`, `cron_vs_frist_reminder`, `cron_kanzlei_paket_pending_check` — claim-zentrisch.
4. `ALTER TABLE auftraege/kanzlei_faelle DROP COLUMN fall_id` + FK.
5. `ALTER TABLE phase_transitions/notification_events/...` claim_id additiv + Backfill + DROP fall_id (oder als historisch markieren).
6. `DROP TABLE faelle CASCADE` — räumt verbleibende Constraints + Policies + ON-faelle-Trigger + die 6 Views (die in Phase 4 schon repointet sind).
7. `generate_typescript_types` — entfernt faelle-Block aus database.types.ts. Build wird grün, weil Phase 4+5 die 417 Calls schon migriert haben.

---

## 5 · Offene Fragen / Live-DB-Verifikationen (Phase 0 vor Phase 4)

Sobald der Supabase-Pooler wieder antwortet:

1. **View-Definitionen Live:** `SELECT viewname, definition FROM pg_views WHERE schemaname='public' AND viewname IN ('v_claim_full','v_claim_listing','v_faelle_mit_aktuellem_termin','faelle_kunde_view','faelle_sv_view','v_claim_timeline')` — bestätigen, dass die neueste Migration-Definition tatsächlich live ist.
2. **Trigger Live:** `SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal AND (tgrelid='public.claims'::regclass OR tgrelid='public.kanzlei_pakete'::regclass OR tgrelid='public.kanzlei_faelle'::regclass OR tgrelid='public.fall_dokumente'::regclass)` — sind alle 4 cross-table Sync-Trigger live? Insbesondere `trg_sync_kanzlei_paket_to_faelle` (Drift-Verdacht aus cmm44_spa2).
3. **FK-Inventar Live:** `SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE confrelid='public.faelle'::regclass` — welche FKs existieren faktisch (Migrations vs. Live).
4. **MP-8b Parity:** Re-run `scripts/probe-claim-phase-parity.mjs` → 0 Divergenzen / 75/75 Coverage. Finalisiert MP-8b live.
5. **Phase-Coverage:** Verteilung von `v_claim_phase.main_phase` über alle 75 Claims (besonders ob der eine claim-ohne-fall jetzt sauber `erfassung` zurückgibt, nicht null).

---

## 6 · Caveats

- **Supabase-Pooler down >30 min:** REST API + Management API timeouten beide. Nicht selbst-debuggbar (vermutlich Anbieter-seitig / aktiver Restart hängt). Aaron: Dashboard checken (Project Status, Compute Health).
- **Datei-basiert hat blinde Flecken:** Direkte DDL über Studio (gegen Regel 2) oder ungetrackte CLI-Migrationen aus alten Sessions hinterlassen DB-Objekte, die in keiner Migration stehen. Der Live-Cross-Check oben ist Pflicht vor jeder Phase-5/6-Migration.
- **Critic+Synthese-Agenten ausgefallen:** ich habe als Backup-Synthese-Architekt agiert. Die 6 Finder-Ergebnisse sind im Workflow-Journal: `C:\Users\Aaron Sprafke\.claude\projects\C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2\4eb05efe-995b-4ee6-af5c-40eba89043b3\subagents\workflows\wf_850922c8-853\journal.jsonl` (Zeilen 7-12) — für Review.

---

## 7 · Quellen

- Workflow `wf_850922c8-853` (6 Finder × ~135k tokens je): db-views, db-triggers-funcs-fks, code-readers, code-writers, id-assumptions, type-coupling
- Master-Strategie 16.05.: `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` (Phase 0-6 Rahmen, jetzt evidenz-aktualisiert)
- MP-8b: PR #2020 (`kitta/cmm44-mp8b-claims-centric-phase`), Migration `20260529155953_cmm44_mp8b_v_claim_phase_claims_centric.sql`
- Memory-Anker: `project_cmm44_mp6c_ready`, `project_cmm60_claims_sv_id`, `project_cmm44_spg2_status`, `project_cmm44_spd_status`, `project_cmm44_spc_kunde_ownership`, `feedback_information_schema_check`
