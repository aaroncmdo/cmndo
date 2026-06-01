# Handoff / Kickoff — Unisone Termin-Engine **Phase 2** (Engine-Lib)

**Datum:** 01.06.2026 · **Branch (Phase 1):** `kitta/unisone-termin-engine` · **Autor:** Claude (Phase-1-Builder)
**Für:** die nächste (frische) Session, die Phase 2 baut. Subagent-driven, hybrid für DDL.

> Dieses Doc ergänzt — **nicht ersetzt** — den **Spec** (`docs/superpowers/specs/2026-06-01-unisone-termin-engine-design.md`) und den **Phase-1-Plan** (`docs/superpowers/plans/2026-06-01-unisone-termin-engine-phase1.md`). Hier steht NUR, was du sonst neu recherchieren müsstest: live-untersuchte Fakten, Consumer-Liste, Dekomposition, Ausführungsmodus.

---

## 0. TL;DR
Phase 1 (Datenmodell) ist **merged** (PR #2180, staging, build+Preview grün). Phase 2 = die Lib `lib/termine/engine`, die „sauber funktioniert" durchsetzt — Kern ist die **Geocoding-Garantie** (der SV muss verlässlich am Besichtigungsort ankommen). Multi-PR. Ausführung: **subagent-driven**; DDL-Migrationen fährt der **Controller selbst** (Regel-2-Disziplin + Live-Recheck + Koordination auf geteiltem `gutachter_termine`), Subagents nur für Code + 2-stufiges Review.

## 1. Was Phase 1 LIVE gemacht hat (staging + geteilte prod+staging-DB)
- `gutachter_termine` + `assignee_typ`/`assignee_id` (+ CHECK + Index `idx_gutachter_termine_assignee` + Backfill alle aktiven → `sachverstaendiger`). `sv_id`/`sv_lead_id`/`kb_id`/`claim_id`/`fall_id`/`lead_id` bleiben **Kompat-Spalten**.
- Trigger `trg_gutachter_termine_validate_assignee` (BEFORE INSERT OR UPDATE OF assignee_*, **SECURITY DEFINER**, `search_path=''`): gesetzte `assignee_id` muss in der typ-passenden Tabelle existieren. NULL erlaubt (`sv_gesucht`).
- `v_belegung` VIEW = die EINE Lese-Quelle: aktive Buchungen ∪ externe Cache, assignee **live aus Legacy-FKs** (COALESCE), Büro-Fallback `COALESCE(besichtigungsort, sachverstaendige.standort)`, `security_invoker=true`, nur `service_role`/`postgres`.
- Externe Belegung **permanent**: `pruneStaleExternalEvents(db, svId, source)` in `src/lib/kalender/sync-to-cache.ts` (exportiert, 90d Retention; für künftigen Retention-Cron nutzbar).
- Migrationen: `20260601175420` add_assignee_columns · `175516` backfill · `180027` integrity_trigger · `180231` v_belegung_view · `181218` security_invoker_lock · `182550` guards_hardening.

## 2. Entscheidungen — LOCKED (nicht neu verhandeln)
- **Org-Modell = `organisationen`** (Aaron 01.06.). `sv_organisation*` (leer) droppen; Mitgliedschaft/Läufer falls gebraucht additiv auf `organisationen`.
- **Payroll NICHT im Scope** (Personal-Audit: `profiles.gehalt_*` tot). Engine kennt Personen nur als buchbare Kapazität.
- **Geocoding-Garantie = harte Invariante** (Aaron: „die Route muss sauber sein"). Siehe §4-P2.3.
- **Produkt-Regel:** der SV MUSS verlässlich ankommen; Kunde + SV sind der **Fallback** (Live-Tracking/ETA + Standort-Bestätigung/Korrektur), aber das Ziel muss am Ursprung sauber (geocodet) sein. Vor-Ort-Termin geht **NICHT auf `bestätigt`** ohne aufgelöstes Ziel.
- 4 Phase-1-Abweichungen (besichtigungsort-Reuse, assignee_id nullable, Reader-Repoint→Phase 3, kein Tabellen-Rename) — Begründung im Plan §Abweichungen.

## 3. Live-Schema-Fakten (hart untersucht 01.06. — spart dir die Recherche)
- **Exclusion-Constraint** `gutachter_termine_no_sv_overlap` = `EXCLUDE USING gist (sv_id WITH =, tstzrange(start_zeit,end_zeit) WITH &&) WHERE status IN ('bestaetigt','reserviert','verlegt','verlegung_pending')`. **`btree_gist` liegt im `extensions`-Schema** (Migration `aar_btree_gist_to_extensions_schema`) — bei der Generalisierung ggf. Operator-Klasse qualifizieren.
- **status-CHECK:** reserviert/bestaetigt/abgelehnt/abgesagt/storniert/abgeschlossen/sv_gesucht/gegenvorschlag/verschoben/verlegt/verlegung_pending. **typ-CHECK:** sv_begutachtung/kb_beratung/konfrontation. `kanal`: telefon/video (remote, kein Ort).
- **Geo-Realität (wichtig für die Geocoding-Garantie):** Der Besichtigungsort lebt auf **`gutachter_termine.besichtigungsort_lat/lng/adresse/place_id/notiz`** UND als Twin auf **`leads.besichtigungsort_*`** + **`faelle.besichtigungsort_*`**. Zusätzliche Quell-Koordinaten: `leads.fahrzeug_standort_lat/lng/adresse`, `leads.kunde_lat/lng` + `leads.unfallort_lat/lng`, `faelle.kunde_lat/lng/adresse`, `claims.schadenort_lat/lng/adresse/plz`. **Befund 01.06.:** nur **3/12 aktive Termine** hatten *irgendein* geocodetes Ziel (Termin ODER Lead/Fall/Claim) → der Rest ist **Test-Daten**, kein Flow-Loch. Das ist genau die Lücke, die die Engine schließt.
- `v_belegung`-Spalten: `assignee_typ, assignee_id, start_zeit, end_zeit, belegung_typ (buchung|extern), status, termin_typ, bezug_typ, bezug_id, standort_lat, standort_lng, quelle_id`.

## 4. Phase-2-Bausteine (Dekomposition — je eigener kleiner Spec/Plan/PR, in dieser Reihenfolge)

### P2.1 — Engine-Core READS (`lib/termine/engine`)
`pruefeBelegung(assignee, von, bis): 'frei'|'belegt'` + `freieSlots(assignee, fenster, opts)`. **Konsolidiert** diese verstreute Logik (alle lesen künftig die Engine):
- `src/lib/google-calendar/freebusy.ts` (`checkSvFreeBusy`, `getBusyWindows`)
- `src/lib/google-calendar/busy-slots.ts` (`getSvBusySlots`)
- `src/lib/onboarding/slots.ts` (`ladeFreieSlots`, `reserviereSlot`)
- KB: `kb-slots`/`kb-booking` · `src/lib/kalender/cache-busy.ts` (#2165, liest den Cache)
Reachability/ETA **first-class**: `precomputeSvSlotEtas`/`isSlotReachable` + `src/lib/dispatch/reachability.ts` (liest schon `besichtigungsort_lat`), `src/lib/mapbox/{geocode,eta,route}.ts`, `src/lib/termine/{baseline-fahrtzeit,get-sv-tagesplan}.ts`. Engine liest `v_belegung` + (neu) `verfuegbarkeits_ausnahmen`.

### P2.2 — Schema-Adds für die Engine (additive Migrationen zuerst)
- `quelle` (dispatch/self_service/manuell), `bezug_typ`/`bezug_id` (generalisiert fall_id/lead_id/claim_id) — additiv.
- **`verfuegbarkeits_ausnahmen`** Tabelle (`assignee_typ, assignee_id, von, bis, typ urlaub|krank|sperre, grund`) → fließt in `v_belegung`/`freieSlots`.
- `reserviert_bis` (TTL) auf `gutachter_termine`.
- **Exclusion-Constraint generalisieren** (riskanteste DDL): `DROP gutachter_termine_no_sv_overlap` → `ADD … EXCLUDE gist (assignee_typ WITH =, assignee_id WITH =, tstzrange WITH &&) WHERE status IN (active-set)`. btree_gist im extensions-Schema beachten. 19 Zeilen → instant ACCESS-EXCLUSIVE, aber **Vorab-Check**: alle aktiven Zeilen haben assignee_id (`sv_gesucht` ist NICHT im active-set → unkritisch). Live-Recheck + Koordination.

### P2.3 — Engine-Core WRITES (State-Machine) — **hier sitzt die Geocoding-Garantie**
`reserviere`/`bestaetige`/`sageAb`/`verlege`. 
- **`bestaetige` MUSS:** das Vor-Ort-Ziel **resolven** (Termin `besichtigungsort_*` → sonst verknüpfter Lead/Fall: besichtigungsort→fahrzeug_standort→kunde→schadenort) + **geocoden** (`lib/mapbox/geocode` oder `lib/google-geocoding/geocode-address`) + auf `termin.besichtigungsort_lat/lng` cachen. **Ohne geocodebares Ziel → kein `bestätigt`** (Result-Error/Flag, Dispatch sieht's). (Remote-Termine `kanal in (video,telefon)` ausgenommen.)
- **Reservierungs-TTL-Cleanup zentral** in der Engine (Self-Service/P4 baut KEINEN Interim-Guard — siehe Koordination mit gutachter-finder-self-service-Session).
- **CMM-73 Daten-Fix:** `bestaetige` legt verlässlich den `auftraege`-Eintrag `typ='erstgutachten'` an → `v_claim_phase` derivt dann korrekt (kein parity-gegateter View-Umbau nötig). Handoff: `docs/01.06.2026/HANDOFF-cmm73-v-claim-phase-gutachter-termine.md`.
- Booking-Flows, die heute schreiben (werden in Phase 3 auf die Engine migriert): `src/lib/termine/actions.ts`, `src/app/dispatch/leads/[id]/_actions/sv-termin.ts`, `src/app/kunde/faelle/[id]/_actions/besichtigungsort.ts`, `src/app/dispatch/kalender/_actions/spontan.ts`, `termin-verlegung-actions.ts`.

### P2.4 — `findeBestePerson` + Org-Dedup
`findeBestePerson(org/region, fenster, bezug, opts)` (Auslastung+Distanz+Verfügbarkeit → `reserviere`). Org-Dedup: `organisationen` gewinnt, `sv_organisation*` droppen.

### P2.5 — `syncTerminToExternalCalendar` (generalisiert das heutige sv-termin-sync; Google + CalDAV).

## 5. Phase 3 (SEPARAT, nach der Engine) — nur als Ausblick
Consumer-Migration: Dispatch (`findBestSV`/`sv-termin`) → Self-Service (`slots.ts` + Beauftragungs-Wizard P4) → KB → Kanzlei. **Hier** `cache-busy.ts`→`v_belegung` repointen **und** den separaten `belegte`-Read pro Caller entfernen (sonst Doppelzählung). `sv_id`/`lead_id`-Kompat erst danach droppen. CMM-73-Rest + `v_claim_phase` = geteilte Kern-View → mit CMM-50/69/72 abstimmen.

## 6. Ausführungsmodus (Aaron-Wahl: subagent-driven)
- **Hybrid:** `apply_migration`/`list_migrations`/`execute_sql` (READ-only) fährt der **Controller selbst** — Regel-2 Twin-Drift (apply → getrackte Version ablesen → File exakt so benennen), Live-Schema-Recheck vor JEDER Migration ([[information_schema-Check vor Cluster-Refactor]]), Koordination (geteiltes `gutachter_termine`, viele Sessions). Subagents: Code + **2-stufiges Review** (Spec-Compliance, dann adversarial SQL/Security). Das hat in Phase 1 echte Bugs gefangen (Replay-Idempotenz, Trigger-DEFINER-Landmine).
- **Verify-Pattern:** `scripts/verify-*.mts` (tsx, `createAdminClient`, `.env.local` aus Main kopieren, nach Lauf entfernen) + `execute_sql` READ. Vorbilder: `verify-busy.mts`, `verify-v-belegung.mts`, `verify-retention.mts`.
- **Build-Gate:** `npx tsc --noEmit` (next build OOMt im Worktree). Bei Server-Actions/Routen voller Build.

## 7. Risiken / Koordination
- `gutachter_termine` + `v_claim_phase` = geteilte Kern-Objekte, ~viele aktive Sessions (AAR-939-Cluster, CMM-50/69/72, gutachter-finder-self-service P4). Live-Recheck + 60s-Melden vor DDL.
- Exclusion-Constraint-Swap (P2.2) = riskanteste Operation.
- Self-Service/P4-Session (`kitta/gutachter-finder-self-service`) erwartet, dass die Engine die Reservierungs-TTL ownt → koordinieren, dass sie keinen eigenen Guard baut.

## 8. Pointer
Spec + Phase-1-Plan (s.o.) · PR #2180 · Memory `[[unisone-termin-engine]]` (+ `[[sv-verfuegbarkeit-cache]]` = Phase 0/#2165) · die 6 Migrationen `20260601175420–182550`.
