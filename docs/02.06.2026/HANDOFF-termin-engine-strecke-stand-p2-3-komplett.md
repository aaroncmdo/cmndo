# Handoff — Unisone Termin-Engine (Strecke) · Stand 02.06.2026 (P2.3 komplett)

**Ziel der Strecke:** EINE assignee-generische Termin-/Belegung-Engine (`src/lib/termine/engine`) für ALLE Entitys (Sachverständiger / sv_lead / Kundenbetreuer / Kanzlei) + ALLE Use-Cases (Dispatch, Self-Service, KB, Kanzlei). Kern-Auftrag (Aaron): **„sauber buchen" + Geocoding-Garantie** — der SV muss verlässlich am Besichtigungsort ankommen.

**Ausführungsmodus:** subagent-driven (Implementer → Spec-/adversarial-Review → Live-Verify), **DDL fährt der Controller selbst** via MCP `apply_migration` (Regel 2 / Twin-Drift), Live-Recheck vor JEDER Migration. **NICHT die Merge-Session** → PRs gegen `staging`, Merge macht die Merge-Session.

---

## 1. Status-Übersicht

| Phase | Inhalt | Status |
|---|---|---|
| Phase 0 | SV-Busy-Cache vereinheitlicht (`sv_kalender_events_cache`, `cache-busy.ts`) | **MERGED #2165** |
| Phase 1 | Datenmodell: `gutachter_termine` assignee-Spalten + Backfill + Integritäts-Trigger; `v_belegung` VIEW | **MERGED #2180** |
| P2.1a | Belegung-Read-Core: `ladeBelegung`/`pruefeBelegung`/`rowToFenster` über `v_belegung` | **MERGED #2196** |
| P2.1b | Verfügbarkeits-Ausnahmen: `verfuegbarkeits_ausnahmen` + `v_belegung` 3. UNION-Branch | **MERGED #2209** |
| P2.1c | `freieSlots` (konsolidiert `ladeFreieSlots`+`getAvailableKbSlots`) + `slotsFuerTag` | **MERGED #2219** |
| **P2.2** | Schema-Adds (`quelle`/`bezug_typ`/`bezug_id`/`reserviert_bis`) + Normalize-Trigger + Exclusion-Constraint `sv_id`→`(assignee_typ,assignee_id)` | **PR #2231 OFFEN** (live applied + bewiesen) |
| **P2.3a** | `reserviere` (race-sicher) + fail-closed `pruefeBelegungStrict` + TTL-Cron-Erweiterung | **MERGED #2240** |
| **P2.3b** | `bestaetige` + **Geocoding-Garantie** + CMM-73-Daten-Fix | **MERGED #2247** |
| **P2.3c** | `sageAb` + `verlege` + `entscheideVerlegung` (AAR-864-Transitions) | **PR #2250 OFFEN** (live bewiesen) |
| P2.4 | `findeBestePerson` (Org-Matching) + Org-Dedup | **OFFEN** |
| P2.5 | `syncTerminToExternalCalendar` (Google + CalDAV) | **OFFEN** |
| Phase 3 | Consumer-Migration (Repoint aller Caller auf die Engine) | **OFFEN** |

> **P2.3 (die ganze Writes-Engine) ist KOMPLETT.** Offen: P2.4, P2.5, Phase 3.

---

## 2. Was die Engine JETZT kann — Public API (`src/lib/termine/engine/index.ts`)

**Lesen:** `ladeBelegung` / `pruefeBelegung` (fail-open) · `ladeBelegungStrict` / `pruefeBelegungStrict` (**fail-closed**, Result-Object — für Write-Gates) · `freieSlots` / `slotsFuerTag` / `zeitZuMin` / `minZuZeit` · `rowToFenster`.

**Schreiben (Writes-State-Machine):**
- `reserviere(input)` → `{ok, terminId, reserviertBis}` | `{ok:false, code:'belegt'|'db'}`. Race-sicher über den Constraint (23P01→belegt). Dual-Write assignee_*+Legacy-FK. `reserviert_bis`-TTL (15 Min).
- `bestaetige(terminId, opts?)` → `{ok, …, quelle}` | `{ok:false, code:'kein_ziel'|'not_found'|'db'}`. **Geocoding-Garantie:** resolved+geocodet das Vor-Ort-Ziel (Kette Termin→claim/fall/lead), cached auf `besichtigungsort_lat/lng`; ohne Ziel KEIN bestätigt. Remote (`kanal video/telefon`) ausgenommen. CMM-73-Auftrag best-effort.
- `sageAb(terminId, opts?)` → cancelt EINEN Termin (status→abgesagt/storniert/abgelehnt + cancelled_at). **NICHT** Fall-Storno.
- `verlege(terminId, input)` → alt→verlegt(+neuer Slot, race-sicher) | `{ok:false, code:'belegt'|'alt_nicht_aktiv'}`. Beide Modi (SV-pending / Kunde-bestätigt).
- `entscheideVerlegung(neuId, 'bestaetigen'|'ablehnen', opts?)` → pending→bestaetigt/storniert + alt-Transition.

**Helfer:** `resolveBesichtigungsort` · `geocodeMitFallback`/`makeGeocodeMitFallback` · `assigneeLegacyPatch` · `RESERVIERUNG_TTL_MIN`.

**Wichtig:** `reserviere`/`bestaetige`/`sageAb`/`verlege`/`entscheideVerlegung` sind **gebaut + live bewiesen, aber NICHT verdrahtet** — kein Consumer ruft sie (das ist Phase 3). Die alten Pfade (`reserviereSlot`, `bestaetigeTermin`, `stornoFall`, `terminVerlegung*`) laufen unverändert weiter.

---

## 3. OFFENE Aufgaben (in Reihenfolge)

### P2.4 — `findeBestePerson` + Org-Dedup
- `findeBestePerson(org/region, fenster, bezug, opts)`: Auslastung + Distanz + Verfügbarkeit → pickt beste buchbare Person → `reserviere`. Filter: nur buchbare Rollen (`rolle_in_organisation`), nur exklusives Gebiet (`gebiet_exklusivitaeten`). Deckt Dispatch-Auto-Matching (`findBestSV`) + Self-Service-„egal wer".
- **Org-Modell:** `organisationen` ist die Quelle (Aaron 01.06.). **`sv_organisation*` ist bereits gedroppt** (AAR-950 / #2232 gemergt) → Org-Dedup erledigt, P2.4 kann direkt auf `organisationen` bauen.
- Reachability/ETA: vorhanden (`precomputeSvSlotEtas`/`isSlotReachable`, mapbox-matrix) — first-class in die Auswahl.

### P2.5 — `syncTerminToExternalCalendar`
- Generalisiert das heutige `sv-termin-sync` (Google + CalDAV) → schreibt eine Engine-Buchung in den verbundenen Kalender des Assignees. **Google-Timezone-Gotcha:** `toBerlinWallClock()` nutzen (dateTime-Offset + timeZone gleichzeitig = 2h-Versatz). Bestand: `src/lib/google-calendar/sv-termin-sync.ts`, `src/lib/kalender/caldav/sv-termin-sync.ts`.

### Phase 3 — Consumer-Repoint (einer nach dem anderen, je Smoke)
Reihenfolge: Dispatch → Self-Service → KB → Kanzlei. Konkret:
1. **`bestaetigeTermin` (bestaetigung.ts) → `bestaetige`** + **Notifier portieren** (WA T4 / Email S-E6 / SLA `completeSla('termin_bestaetigung')` / Timeline) — bestaetige macht das NOCH NICHT (kein Doppel-Send). Beim Repoint die Notifications mitnehmen.
2. **`reserviereSlot` (onboarding/slots.ts) → `reserviere`** — **fixt den Prod-Bug** (s. §4).
3. **`terminVerlegung*` (termin-verlegung-actions.ts) → `verlege`/`entscheideVerlegung`** — **Auth (`assertDarfVerlegungEntscheiden`) + Notifications (`emitEvent`) + Route-Vorschläge (`findVerlegungsVorschlaege`) + `touchClaimRecency` + `revalidatePath` BEHALTEN** (die Engine-Ops sind reine DB-Transitions). [[RLS-Function-Grants verlieren sich]]-Klasse: beim Repoint Auth nicht verlieren.
4. **`stornoFall`/`adminStornoFall` → `sageAb`** für den Termin-Teil; Fall-Storno/Billing (`transitionFallStatus`/`revertCaseBilling`) bleibt separat (sageAb ist termin-level).
5. **`cache-busy.ts` → `v_belegung`** repointen UND den separaten `belegte`-Read pro Caller entfernen (sonst Doppelzählung).
6. **`freieSlots`-Repoint** (`ladeFreieSlots`/`getAvailableKbSlots` → `freieSlots`) mit den **Parity-Flags aus dem P2.1c-Review:** (a) v_belegung-Status-Allowlist vs Original-Blocklist; (b) KB-Vorlauf 2h window-driven; (c) GFA-`pre_flowlink_reserviert`-Holds + `admin_termine` via `freieSlots(opts.zusaetzlicheBelegung)` injizieren.
7. **Write-Pfade auf fail-closed:** wo Caller `pruefeBelegung` als Buchungs-Gate nutzen → auf `pruefeBelegungStrict` (oder direkt `reserviere`/`bestaetige`).
8. **Typen-Regen** (`generate_typescript_types`) sobald ein typisierter Consumer `quelle`/`bezug_*`/`reserviert_bis` braucht (heute alle loose-cast, aufgeschoben).
9. **Erst NACH dem Reader-Sweep:** `sv_id`/`sv_lead_id`/`lead_id`-Kompat-Spalten droppen + den Normalize-Trigger (`trg_gutachter_termine_normalize_assignee`) entfernen.

### Fallback-Layer (Aaron-Kernpunkt — Phase 3 UI)
Geocoding-Garantie sichert das Ziel am Ursprung; der Fallback läuft über Kunde UND SV (Infra existiert):
- **Kunde:** Tracking-Seite (`kunde_tracking_token`, `sv_eta_minuten`) — sieht „SV ist X Min entfernt" + kann Ort bestätigen/korrigieren.
- **SV:** Feldmodus/Live-Tracking (`sv_unterwegs_seit`/`sv_eta_minuten`/`sv_angekommen_am`).
- **Wichtig:** eine Ziel-Korrektur durch Kunde/SV MUSS `besichtigungsort_*` (geocodet) aktualisieren, damit Route+ETA konsistent bleiben.

### Restpunkte
- **CMM-73:** Daten-Fix steckt in `bestaetige` (legt erstgutachten-Auftrag an). Greift erst, wenn `bestaetige` verdrahtet ist (Phase 3, Schritt 1). Bis dahin bleibt der 1 kosmetische Live-Fall. KEIN `v_claim_phase`-Umbau nötig.
- **reserviereSlot-Prod-Bug** (s. §4) — mit der Self-Service-Session koordinieren.

---

## 4. ⚠️ Gemeldeter Prod-Bug (nicht in dieser Strecke gefixt)

`reserviereSlot` (`src/lib/onboarding/slots.ts:298`, Self-Service-„Köder"-Slot) inserted `typ:'vor_ort'` **und** `status:'pre_flowlink_reserviert'` — **beide verletzen die Live-CHECKs** (`typ` erlaubt nur sv_begutachtung/kb_beratung/konfrontation; `status` kennt pre_flowlink_reserviert nicht). Der Aufruf ist fire-and-forget mit **geschlucktem Error** (`WizardClient.tsx:354`) → diese Slot-Reservierungen **scheitern still in Produktion**. Engine-`reserviere` ist der korrekte Ersatz (Phase-3-Repoint, Schritt 2). NICHT unilateral fixen (fremder GFA-Flow) — mit der Self-Service-Session abstimmen.

---

## 5. Wichtige Fakten / Lessons (spart Recherche)

- **Branch-Modell:** pro Sub-Phase **frisch aus `origin/staging`**. `kitta/unisone-termin-engine` ist stale. **Worktree-Gotcha:** `EnterWorktree`-Default-Base = `origin/main`, aber die Strecke will `origin/staging` → `git worktree add -b <branch> <pfad> origin/staging` + `EnterWorktree --path`. Frischer Worktree hat **kein** `node_modules` → `npm ci` vor tsc/vitest/tsx-Verify (Junction macht laut Memory false TS2307).
- **DDL:** Controller via `apply_migration` (NICHT CLI/raw execute_sql). Danach `list_migrations` (oder gezielt `SELECT version FROM supabase_migrations.schema_migrations WHERE name=…`) → File exakt nach getrackter Version benennen (Twin-Drift). `execute_sql` nur READ.
- **gutachter_termine Live-Fakten:** `status` text+CHECK (aktiv = `bestaetigt/reserviert/verlegt/verlegung_pending`); `typ` text+CHECK (`sv_begutachtung/kb_beratung/konfrontation`); `assignee_typ`/`assignee_id` text+uuid (P1). Constraint `gutachter_termine_no_assignee_overlap` = EXCLUDE gist `(assignee_typ, assignee_id, tstzrange)` WHERE `status-aktiv AND cancelled_at IS NULL`; btree_gist-Opclasses **explizit aus `extensions`** qualifiziert (search_path-unabhängig). Normalize-Trigger füllt `assignee_*` aus `sv_id/sv_lead_id/kb_id` bei jedem Write (KEIN Writer setzt assignee_id sonst — Audit). TTL: `expire_geblockte_termine_ohne_sa()` (Cron `cmm25-expire-geblockte-termine`, */5) erweitert um `reserviert_bis<now()`.
- **Ziel-Auflösung (Geocoding):** `besichtigungsort_*` (Termin/Lead/Fall) + `fahrzeug_standort_*` (Lead) + `schadenort_*` (Claim) haben lat/lng; `kunde_adresse`/`kunde_strasse`+`kunde_plz` sind text-only (geocoden). mapbox `geocodeAdresse` (Routing-Konsistenz) bevorzugt, google `geocodeAddress` Fallback.
- **auftraege:** `fall_id`/`sv_id`/`claim_id` NOT NULL (claim_id füllt Trigger); `createErstgutachtenAuftragWennNoetig(admin, fallId, svId, terminIds)` = idempotenter Helper. typ-CHECK erstgutachten/nachbesichtigung/stellungnahme, status-CHECK termin/besichtigung/gutachten/abgeschlossen.
- **Verify-Pattern:** `scripts/verify-engine-*.mts` (tsx; `loadEnv` aus `verify-engine-belegung.mts`; `cp <main>/.env.local .env.local` → tsx → `rm`; Cleanup try/finally; JSON-VERDICT). **DDL-Beweise** als SQL-DO-Block mit finalem `RAISE` (Rollback, 0 Residue) — sieht man via execute_sql-Error.
- **Build-Gate:** `npx tsc --noEmit` (`next build` OOMt). `**/*.mts` ist im tsconfig-Scope → Verify-Scripts tsc-checken mit.
- **Engine-Test-Stil:** PURE Logik (rowToFenster, resolveBesichtigungsort mit injiziertem geocoder/db, assigneeLegacyPatch, geocodeMitFallback) → Vitest; DB-Orchestrierung (reserviere/bestaetige/verlege/…) → **Live-Verify** ist der eigentliche Beweis (+ schlanke Stub-Tests).
- **Subagent-API-Flakiness (02.06.):** Implementer-Subagenten (sonnet) brachen mehrfach mid-way ab (529 / Socket / ConnectionRefused) nach vielen tool_uses. **Lehre:** per-Task-Commits (Resilienz) + bei reinem Code mit selbst-ausformuliertem Plan ist **Controller-Direkt-Implementierung** zuverlässiger. Bei Subagent-Abbruch: Controller verifiziert (vitest/tsc/Artefakt-Scan), ergänzt index.ts-Exports, committet.
- **[[Write-Tool </content>-Artefakt]]:** nach jedem Write auf literales `</content>` am Ende scannen.

---

## 6. Pointer

- **Spec:** `docs/superpowers/specs/2026-06-01-unisone-termin-engine-design.md`
- **Sub-Phasen-Pläne:** `docs/superpowers/plans/2026-06-0{1,2}-unisone-termin-engine-{phase1,p2-1a-belegung-reads,p2-1b-ausnahmen,p2-1c-…,p2-2-schema-constraint,p2-3a-reservierung,p2-3b-bestaetige-geocoding,p2-3c-sageab-verlege}.md`
- **CMM-73-Handoff:** `docs/01.06.2026/HANDOFF-cmm73-v-claim-phase-gutachter-termine.md`
- **PRs:** #2165 P0 · #2180 P1 · #2196 P2.1a · #2209 P2.1b · #2219 P2.1c · **#2231 P2.2 (offen)** · #2240 P2.3a · #2247 P2.3b · **#2250 P2.3c (offen)**
- **Migrationen (P2.2/P2.3a):** `20260602074032` (schema-adds) · `20260602074225` (normalize-trigger) · `20260602081227` (exclusion-assignee) · `20260602090840` (reservierung-ttl). P2.3b/c = 0 DDL.
- **Memory:** `[[unisone-termin-engine]]` (+ `[[sv-verfuegbarkeit-cache]]` = Phase 0)
- **Engine-Code:** `src/lib/termine/engine/{types,belegung,slots,constants,writes,geocode,besichtigungsort,bestaetige,state-transitions,index}.ts`

---

## 7. Sofort-Nächster Schritt
1. #2231 (P2.2) + #2250 (P2.3c) mergen lassen (Merge-Session, build-grün).
2. **P2.4-Plan** schreiben (`findeBestePerson` auf `organisationen` — Org-Dedup ist via #2232 schon erledigt). ODER direkt **Phase 3 starten** (Consumer-Repoint), falls der Produkt-Nutzen früher gewünscht ist (die Engine ist vollständig genug, um Dispatch/Self-Service zu repointen).
3. Reihenfolge ist verhandelbar — P2.4/P2.5 erweitern die Engine; Phase 3 aktiviert den vorhandenen Wert. Aaron entscheidet die Priorität.
