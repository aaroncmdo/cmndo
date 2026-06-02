# Handoff — Unisone Termin-Engine (ganze Strecke) · Stand 02.06.2026

**Ziel der Strecke:** EINE assignee-generische Termin-/Belegung-Engine (`src/lib/termine/engine`) für ALLE Entitys (Sachverständiger / sv_lead / Kundenbetreuer / Kanzlei) + ALLE Use-Cases (Dispatch, Self-Service, KB, Kanzlei). Kern-Auftrag (Aaron): **„sauber buchen" + Geocoding-Garantie** — der SV muss verlässlich am Besichtigungsort ankommen.

**Ausführungsmodus:** subagent-driven (Implementer → Spec- + adversarial-Review → Live-Verify), DDL fährt der **Controller selbst** via MCP `apply_migration` (Regel 2 / Twin-Drift), Live-Recheck vor JEDER Migration, Koordination auf geteiltem `gutachter_termine`.

---

## 1. Status-Übersicht

| Phase | Inhalt | Status |
|---|---|---|
| Phase 0 | SV-Busy-Cache vereinheitlicht (`sv_kalender_events_cache`, `cache-busy.ts`) | **MERGED #2165** |
| Phase 1 | Datenmodell: `gutachter_termine` assignee-Spalten + Backfill + Integritäts-Trigger; `v_belegung` VIEW; externe Belegung permanent (90d-Retention) | **MERGED #2180** |
| **P2.1a** | Belegung-Read-Core: `ladeBelegung` / `pruefeBelegung` / `rowToFenster` über `v_belegung` | **MERGED #2196** |
| **P2.1b** | Verfügbarkeits-Ausnahmen: Tabelle `verfuegbarkeits_ausnahmen` (urlaub/krank/sperre) + `v_belegung` 3. UNION-Branch `'ausnahme'` → `pruefeBelegung` vakanz-bewusst | **MERGED #2209** |
| **P2.1c** | `freieSlots` (konsolidiert `ladeFreieSlots` + `getAvailableKbSlots`) + reine `slotsFuerTag` | **PR #2219 OFFEN** (build läuft, mergeable) |
| P2.2 | Schema-Adds + Exclusion-Constraint-Generalisierung | **OFFEN** (riskanteste DDL) |
| P2.3 | Writes (State-Machine) + **Geocoding-Garantie** | OFFEN (Kern-Auftrag) |
| P2.4 | `findeBestePerson` + Org-Dedup | OFFEN |
| P2.5 | `syncTerminToExternalCalendar` (Google + CalDAV) | OFFEN |
| Phase 3 | Consumer-Migration (Repoint aller Caller auf die Engine) | OFFEN |

**Was die Engine JETZT kann (Lese-Seite KOMPLETT):** `src/lib/termine/engine/{types,belegung,slots,index}.ts`. `v_belegung` = Buchungen (aktive `gutachter_termine`) ∪ externe Blocks (`sv_kalender_events_cache`) ∪ Ausnahmen (`verfuegbarkeits_ausnahmen`), service_role-only. `pruefeBelegung`/`ladeBelegung`/`freieSlots` assignee-generisch (SV + KB implementiert; sv_lead/kanzlei werfen). **KEIN Consumer-Repoint** — die alten Generatoren (`ladeFreieSlots`/`getAvailableKbSlots`) laufen unverändert weiter.

---

## 2. OFFENE Aufgaben (in Reihenfolge)

### P2.2 — Schema-Adds + Exclusion-Constraint (RISKANTESTE DDL der Strecke)
**Additive Adds (low-risk, Controller-DDL):**
- `gutachter_termine.quelle` enum (`dispatch`|`self_service`|`manuell`)
- `gutachter_termine.bezug_typ`/`bezug_id` (generalisiert `fall_id`/`lead_id`/`claim_id`; v_belegung leitet `bezug_*` schon live ab)
- `gutachter_termine.reserviert_bis` timestamptz (TTL, Default **15 Min**) — für die Engine-Reservierungs-TTL (P2.3)

**Exclusion-Constraint generalisieren (HOCHRISIKO):**
- `DROP CONSTRAINT gutachter_termine_no_sv_overlap` → `ADD … EXCLUDE USING gist (assignee_typ WITH =, assignee_id WITH =, tstzrange(start_zeit,end_zeit) WITH &&) WHERE status IN ('bestaetigt','reserviert','verlegt','verlegung_pending')`
- ⚠️ **`btree_gist` liegt im `extensions`-Schema** (Migration `aar_btree_gist_to_extensions_schema`) → die `=`-Operator-Klasse ggf. qualifizieren (`extensions.gist_…` bzw. search_path beachten).
- **Vorab-Check (Pflicht, live):** alle aktiven Zeilen haben `assignee_id` (war 01.06. erfüllt: 0 aktive ohne assignee_id; `sv_gesucht` ist NICHT im active-set). ~19 Zeilen → instant ACCESS-EXCLUSIVE-Lock.
- **Voller Koordinations-Dance:** geteiltes `gutachter_termine`, viele aktive Sessions (AAR-939-Cluster, CMM-49/50/69/72) → `git fetch` + 60s-melden + Live-`information_schema`-Recheck unmittelbar vor dem Swap. **Aarons explizites Go einholen** vor dem Constraint-Swap.

### P2.3 — Writes (State-Machine) + GEOCODING-GARANTIE (der Kern-Auftrag)
- `reserviere` / `bestaetige` / `sageAb` / `verlege` als EINE State-Machine in der Engine.
- **`bestaetige` MUSS** das Vor-Ort-Ziel **resolven** (Termin `besichtigungsort_*` → sonst verknüpfter Lead/Fall: `besichtigungsort`→`fahrzeug_standort`→`kunde`→`schadenort`/`claims.schadenort_*`) + **geocoden** (`lib/mapbox/geocode` `geocodeAdresse` ODER `lib/google-geocoding/geocode-address` `geocodeAddress`) + auf `gutachter_termine.besichtigungsort_lat/lng` cachen. **Ohne geocodebares Ziel → NICHT `bestätigt`** (Result-Error/Flag, Dispatch sieht's). Remote-Termine `kanal IN (video,telefon)` ausgenommen.
- **⚠️ fail-closed `pruefeBelegung` (P2.1a-Flag):** `ladeBelegung`/`pruefeBelegung` sind aktuell **fail-open** (DB-Fehler → `[]` → `'frei'`). BEVOR `reserviere`/`bestaetige` `pruefeBelegung` als Buchungs-Gate nutzen, MUSS eine fail-closed Variante (Result-Object) her — sonst Doppelbuchungs-Vektor. JSDoc-Warnung steht an `pruefeBelegung`.
- **Reservierungs-TTL-Cleanup zentral** in der Engine. **Koordination:** die `gutachter-finder-self-service`/P4-Session erwartet, dass die Engine die TTL ownt → sie baut KEINEN eigenen Interim-Guard.
- **⚠️ typ-Discrepancy verifizieren:** `reserviereSlot` (onboarding/slots.ts) setzt `typ:'vor_ort'`, aber der Live-CHECK erlaubt nur `sv_begutachtung/kb_beratung/konfrontation` (Live-Daten: nur `sv_begutachtung`). Beim Bau der Writes klären (Bug/Legacy/anderes Feld).
- **CMM-73 Daten-Fix:** `bestaetige` legt verlässlich den `auftraege`-Eintrag `typ='erstgutachten'` an → `v_claim_phase` derivt dann korrekt (kein parity-gegateter View-Umbau). **`v_claim_phase` = geteilte Kern-View → mit CMM-50/69/72 abstimmen.** Handoff: `docs/01.06.2026/HANDOFF-cmm73-v-claim-phase-gutachter-termine.md`.

### P2.4 — `findeBestePerson` + Org-Dedup
- `findeBestePerson(org/region, fenster, bezug, opts)`: Auslastung + Distanz + Verfügbarkeit → `reserviere`. Filter: nur buchbare Rollen, nur exklusives Gebiet (`gebiet_exklusivitaeten`).
- **Org-Dedup:** `organisationen` gewinnt (Aaron 01.06.), `sv_organisation*` (alle 0 Zeilen) droppen.

### P2.5 — `syncTerminToExternalCalendar` (generalisiert das heutige sv-termin-sync; Google + CalDAV).

### Phase 3 — Consumer-Migration (nach der Engine, einer nach dem anderen, je Smoke)
- Reihenfolge: Dispatch (`findBestSV`/`sv-termin`) → Self-Service (`onboarding/slots.ts` + Beauftragungs-Wizard P4) → KB (`kb-*`) → Kanzlei.
- **`cache-busy.ts` → `v_belegung` repointen** UND den separaten `belegte`-Read pro Caller entfernen (sonst Doppelzählung).
- **`freieSlots`-Repoint** (`ladeFreieSlots`/`getAvailableKbSlots` → `freieSlots`) — dabei die **Phase-3-Parity-Flags aus dem P2.1c-Review:**
  1. **v_belegung-Status-Allowlist** (`reserviert/bestaetigt/verlegt/verlegung_pending`) vs Original-Blocklist (alles außer `storniert/abgelehnt/abgesagt`) → `verschoben`/`gegenvorschlag`/`sv_gesucht` blocken in der Engine **nicht mehr**. SSoT-Semantik beim Repoint bestätigen (lebt in `v_belegung`/P2.1a).
  2. **KB-Vorlauf (2h)** ist jetzt window-driven → KB-Caller übergibt `vonIso = now + 2h`.
  3. **GFA-`pre_flowlink_reserviert`-Holds (SV) + `admin_termine` (KB)** sind NICHT in v_belegung → via `freieSlots(opts.zusaetzlicheBelegung)` injizieren ODER in v_belegung falten.
- **`v_claim_phase`-Rest (CMM-73)** abschließen.
- `sv_id`/`lead_id`-Kompat-Spalten erst NACH dem Reader-Sweep droppen.

### Fallback-Layer (Aaron-Kernpunkt — NICHT verlieren; Phase 3 UI)
Die Geocoding-Garantie sichert das Ziel am Ursprung. Der **Fallback** läuft über **Kunde UND SV** (Spalten/Infra existieren, in Phase 3 verdrahten):
- **Kunde:** Tracking-Seite (`kunde_tracking_token`) — sieht „SV ist X Min entfernt" (`sv_eta_minuten`) + kann Besichtigungsort bestätigen/korrigieren.
- **SV:** Feldmodus / Live-Tracking (`sv_unterwegs_seit`/`sv_eta_minuten`/`sv_angekommen_am`).
- **Wichtig:** eine Ziel-Korrektur durch Kunde/SV MUSS `besichtigungsort_*` (geocodet) aktualisieren, damit Route + ETA konsistent bleiben.

---

## 3. Wichtige Fakten / Lessons (spart Recherche)

- **Branch-Modell:** pro Sub-Phase **frisch aus `origin/staging`** branchen + nur die additiven Commits (p2-1a/1b/1c). `kitta/unisone-termin-engine` ist **stale** (alter Fork-Point + Phase-1 squash-merged → Rebase wirft add/add-Konflikte auf Spec/Plan-Docs). Cherry-pick onto fresh staging = 0 Konflikte.
- **DDL:** Controller selbst via `mcp__plugin_supabase_supabase__apply_migration` (NICHT CLI/raw execute_sql). Danach `list_migrations` → File exakt nach getrackter Version benennen (Twin-Drift). Bei View-Replace: `NULL`-Casts **typgenau** (z.B. `NULL::numeric(10,7)` — sonst `42P16 cannot change data type of view column`). Security-Lock (`security_invoker=true` + `REVOKE anon,authenticated`) nach `CREATE OR REPLACE VIEW` re-applizieren.
- **Verify-first zahlt sich aus:** Live-Verify fing den 0-Slots-Default-Bug (alle 10 SVs `arbeitszeiten=null`); opus-Review fing den 4×-Puffer-Under-Block (hardcoded 15 statt `TERMIN_PUFFER_MIN=60`). → **Konstanten statt Magic-Numbers** (`TERMIN_DAUER_MIN`/`TERMIN_PUFFER_MIN`/`KB_BERATUNG_DURATION_MIN`).
- **Verify-Pattern:** `scripts/verify-engine-*.mts` (tsx, `createAdminClient`, `.env.local` aus Main kopieren + nach Lauf entfernen, Cleanup von Test-Daten via `try/finally`, JSON-`VERDICT`).
- **Build-Gate:** `npx tsc --noEmit` (`next build` OOMt im Worktree). knip: index.ts hat schon einen Vitest-Entry-Importer → keine unused-file-Ratchet-Falle.
- **TZ:** `freieSlots` nutzt `setHours` (server-lokal) für Slot-Zeiten == beide Original-Generatoren. `datum` jetzt aus lokalem Kalenderdatum (kein Off-by-one in +TZ; auf UTC-Server identisch). `toBerlinWallClock` = eigenes Cross-Cutting-Ticket, NICHT hier.
- **CI:** gatend ist `build`. `Supabase Preview` läuft auf Migration-PRs (Branching), `e2e` läuft gegen Prod (post-merge). Merge-Session (`/loop`) merged build-grüne mergeable PRs autonom — diese Session ist NICHT die Merge-Session.

---

## 4. Pointer

- **Spec:** `docs/superpowers/specs/2026-06-01-unisone-termin-engine-design.md`
- **Phase-1-Plan:** `docs/superpowers/plans/2026-06-01-unisone-termin-engine-phase1.md`
- **Phase-2-Kickoff-Handoff:** `docs/01.06.2026/HANDOFF-termin-engine-phase2-kickoff.md` (live-Schema-Fakten, Geo-Realität, Dekomposition P2.1–P2.5)
- **Sub-Phasen-Pläne:** `docs/superpowers/plans/2026-06-01-unisone-termin-engine-p2-1a-belegung-reads.md` · `…-p2-1b-ausnahmen.md` · `2026-06-02-…-p2-1c-freieslots.md`
- **Memory:** `[[unisone-termin-engine]]` (+ `[[sv-verfuegbarkeit-cache]]` = Phase 0)
- **PRs:** #2165 (P0) · #2180 (P1) · #2196 (P2.1a) · #2209 (P2.1b) · #2219 (P2.1c, offen)
- **Migrationen (getrackt):** P1 `20260601175420–182550`; P2.1b `20260601210303` (Tabelle) + `20260601210507` (v_belegung-ausnahme-Branch).

---

## 5. Sofort-Nächster Schritt
1. #2219 mergen lassen (Merge-Session, build-grün abwarten).
2. **P2.2-Plan** schreiben (additive Adds zuerst; Exclusion-Constraint-Swap als separater, koordinierter Schritt mit Aarons Go).
3. Dann P2.3 (Writes + Geocoding-Garantie) — der eigentliche Produkt-Kern.
