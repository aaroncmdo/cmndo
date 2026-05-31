# HANDOFF — CMM-64 (Vorschäden/Cardentity) + Cardentity scharf — Session 31.05.2026 (nachts)

**Master:** CMM-44 (Claim-SSoT-Vollmigration / `DROP TABLE faelle CASCADE`, Phase 0–6)
**Strecke heute:** CMM-64 (Vorschäden/Cardentity-Cluster faelle → claims/vehicle) — der vorletzte Spalten-Domänen-Block vor dem faelle-Drop.
**Methode:** Live gegen Prod-Schema `paizkjajbuxxksdoycev` gemessen. DDL via Supabase-Plugin. Eigene Worktrees, PRs gegen `staging`.

---

## ⏭ START HIER — nächste Session

0. **Orientieren (Pflicht):** Dieses Doc + Memory `project_cmm64_vorschaeden_pr1`, `project_cardentity_scharf`, `project_cmm_phase_24_finishing`. Zahlen unten **live re-messen** (`information_schema` / `pg_get_viewdef`) — Schema veraltet <1 Tag, viele parallele Sessions.
1. **Prüfen ob PR #2095 gemergt ist** (Cardentity-Writer). Erst danach ist die Strecke konsistent fortsetzbar.
2. **CMM-64 PR3 bauen** (View-Repoint) — Spec + Entscheidung liegen fertig vor (s. TODO-1). Das ist der nächste echte Strecken-Schritt.
3. **Eigener Worktree** von `origin/staging`: `node scripts/new-session-worktree.mjs <slug> staging`.

---

## Was diese Session gemacht hat (3 PRs)

| PR | Inhalt | Status |
|---|---|---|
| **#2085** | CMM-64 **PR1** — Schema additiv: `vehicle_vorschaeden` (1:N) + `vehicles.cardentity_report` + `claims.{hat_vorschaeden,vorschaden_geprueft,vorschaden_erkannt,vorschaeden_beschreibung}` | ✅ **MERGED** staging (squash `95022b59a`, Mig `20260530233705`) |
| **#2095** | CMM-64 **PR2** — „Cardentity scharf": Auto-Fire raus (11 Sites), ein manueller Button, claim/vehicle-gebundene Writes via `lib/cardentity/run-full.ts` | 🟢 **OFFEN**, tsc EXIT 0, MERGEABLE — wartet auf Aaron-Merge + VPS-Deploy |
| **#2098** | Docs: PR3-Spec + PR1/PR2-Readiness + Handoffs | 🟢 **OFFEN** (rein additiv) |

---

## Live-Stand (31.05. nachts, autoritativ)

```
faelle 278 Spalten / 74 Rows · claims 169 / 75 (1:1-Brücke, 74/74 claim_id, 1 Twin)
FK → faelle.id: 47 (41 nur fall_id)
faelle-lesende Views: 6 (v_claim_full, v_claim_listing, v_claim_phase,
                         v_faelle_mit_aktuellem_termin, faelle_kunde_view, faelle_sv_view)
Vorschaden/Cardentity-Daten: faelle.hat_vorschaeden 74/74 (alle FALSE),
   vorschaden_anzahl 0, cardentity_abfrage_am 0 · claims.hat_vorschaeden 0 (null) ·
   vehicle_vorschaeden 0 Rows · vehicles.cardentity_report 0 · vehicles 0 Rows
```

**Phasen 0–6:** 0✅ · 1✅ (CMM-62 done) · 2✅ · 3🟡 · 4🟡 (4.1 done, CMM-66 Teil2 sv_id done, vorschaden/cardentity = PR3 offen) · 5🔴 · 6🔴 (CMM-49 nie begonnen).

---

## OFFENE TODOs (priorisiert)

### TODO-0 — Aaron: #2095 mergen + Cardentity prod-scharf  ⚠️ NICHT Code, sondern Deploy
- **#2095 reviewen + mergen** (Writer-Strecke, tsc grün).
- **VPS prod + staging:** `CARDENTITY_CLIENT_ID` + `CARDENTITY_CLIENT_SECRET` in `/etc/claimondo/.env.local` (beide Slots) ergänzen, dann `pm2 reload claimondo-v2 --update-env` + `pm2 reload claimondo-v2-staging --update-env`. **Ohne das bleibt Cardentity in prod/staging stumm** (lokal `.env.local` ist gesetzt).
- **Secret rotieren** (lief durch den Chat) — im Cardentity-Dashboard neu, dann lokal + VPS ersetzen.
- **Paid-Smoke** (~15 €/Call) NICHT gelaufen — bei Bedarf mit Test-FIN gegen `api.cardentity.eu` (Free-OAuth ist verifiziert: Token erhalten).

### TODO-1 — CMM-64 PR3: View-Repoint (nach #2095-Merge)  🟢 baubereit
**Spec:** `docs/superpowers/specs/2026-05-31-cmm64-pr3-view-repoint.md` (in #2098).
`v_claim_full` + `v_faelle_mit_aktuellem_termin` lesen vorschaden/cardentity noch aus faelle (live verifiziert: beide `reads_f_* = true`).

**Entscheidung steht (Aaron 31.05.): Option 2 — Backfill + Repoint.**
1. Migration via Plugin: `UPDATE claims c SET hat_vorschaeden = f.hat_vorschaeden FROM faelle f WHERE f.claim_id = c.id AND c.hat_vorschaeden IS NULL` → gap=0 verifizieren. (Warum nötig: `faelle.hat_vorschaeden` false×74 vs `claims` null×75 → simpler Repoint wäre NICHT EXCEPT-0/0. Semantik-Merge Kunden-Selbstauskunft + CarDentity-Check im COMMENT dokumentieren.)
2. Beide Views repointen (Mapping-Tabelle §2 der Spec): `f.hat_vorschaeden`→`c.`, `f.vorschaden_geprueft/erkannt/beschreibung`→`c.`, `vorschaden_anzahl`/`letzter_datum`→LATERAL-Aggregat auf `vehicle_vorschaeden` via `claims.vehicle_id`, `vorschaden_typ_*`/`cardentity_*`→`veh.cardentity_report`(jsonb-Pfade)+`veh.cardentity_letzter_pull`.
3. **Pattern:** server-seitiger `replace()`-Transform der Live-Viewdef (Vorlage Mig `20260530205453` / `20260530222551`). Self-Assert (0× `f.vorschaden`/`f.cardentity`/`f.hat_vorschaeden`) + **Output-Hash-EXCEPT-0/0-Guard** + **reloptions-Re-Check** (beide Views haben `reloptions=NULL`, CREATE OR REPLACE bewahrt das).
4. `npx tsc --noEmit` (Consumer-Feldnamen unverändert → kein Code-Change erwartet) + Portal-Smoke (Stammdaten-Vorschaden-Block admin/SV/kunde).
5. **Live-Re-Check vor Apply Pflicht** — sobald #2095 live ist, erzeugt Cardentity echte Daten → Coverage kann sich ändern.

### TODO-2 — CMM-67: Halter-Snapshot faelle → claim_parties  🟡 Writer+Reader-Sweep
`faelle.ist_fahrzeughalter` (74/74 gesetzt) / `firma_name` (0) / `ust_id` (0) → `claim_parties.ist_halter`/`firma`/`ust_id` (Zielspalten existieren bereits). **Kollisionsrisiko:** berührt Stammdaten-Edit-Writer → mit den AAR-939-Sessions koordinieren (heute Nacht 4–6 aktiv). Eigenes Ticket CMM-67.

### TODO-3 — v_claim_full Rest-Gap-Map (jeweils eigene Entscheidung/Strecke)
`f.id AS fall_id` (→ Aaron FK-Architektur §7.1: 41 fall_id-Tabellen re-keyen vs Bridge) · `f.status` (Lifecycle/AAR-939) · `f.created_at` · `f.organisation_id`/`f.dispatch_id` (Ownership-Klärung, evtl. CMM-65) · `f.gegner_anzahl_beteiligte`/`f.gegner_fahrzeugtyp` (claim_parties-Ableitung vs claims-Spalten) · `f.kunde_id` (CMM-63-Reconcile, 1 Divergenz) · `COALESCE(veh,f.*)`-Fahrzeug-Fallback (CMM-50-Cutover).

### TODO-4 — danach Richtung DROP (CMM-49, blockt noch lange)
5 echte-Daten-Domänen-Diff (meist redundant, s. strecke-stand §3) → 96 Bridge-Reads (1 Architektur-Entscheidung) → 41 FK-Re-Keys (Batch) → Sync-Trigger-Drop → `DROP TABLE faelle CASCADE` + voller Portal-Smoke.

---

## Code-Landkarte Cardentity (nach PR2)
- **`lib/cardentity/run-full.ts`** = `runCardentityCheck(scope:'fall'|'lead', id)` — EIN Report-Pull (kostenpflichtig), schreibt claim/vehicle-gebunden. Idempotent (cached → kein Re-Call), alle vehicle/claims-Writes non-fatal.
- **`lib/cardentity/client.ts`** = echter OAuth2-Client (`api.cardentity.eu`), UNVERÄNDERT.
- **`components/cardentity/CardentityButton.tsx`** = ein Button + `window.confirm(~15€)`. An dispatch Phase4 / faelle Sections / gutachter StammdatenCard.
- **Gelöscht:** `api/cardentity/typ-a|typ-b` (Mock), `lib/cardentity/typ-b.ts`, `enrich-fahrzeug.ts`, `CardentityTypBButton.tsx`.
- **Wrapper** (Rollen-Guards, claim-gebunden): `faelle/_actions/dokumente.ts` (triggerFinCallForFall + requestCardentityTypBForFall), `gutachter/cardentity-actions.ts` (SV), `dispatch/_actions/cardentity.ts` (Lead; `enrichLeadCardentity` = Alias).
- **vehicles-Anlage** (`ensureVehicleFromFin`, gratis) bleibt automatisch bei FIN — nur der kostenpflichtige Report-Pull wurde manuell gegated.

## Branches / Worktrees
```
kitta/cmm-ssot-strecke-31-05   → PR #2098 (docs: PR3-Spec + Handoffs). Worktree .claude/worktrees/cmm-ssot-strecke-31-05
kitta/cmm64-cardentity-scharf  → PR #2095 (Writer, tsc grün). Worktree .claude/worktrees/cmm64-cardentity-scharf
```
Beide clean, alles gepusht, kein Session-Stash. (stash@{0} ist fremd: kitta/aar-kunde-gutachten-werte — dokumentiert, nicht von dieser Session.)

## Lessons (lesson-fest)
1. **„Mock" war Teil-Wahrheit** — nur die 2 typ-a/typ-b-Routen waren Mock; client.ts/typ-b.ts/enrich echt. Immer pro-File prüfen welcher Pfad echt/Mock ist.
2. **Stale-Base-Trap (2×!)** — Worktree war hinter staging → PR-Diff zeigte Fremd-Deletions (marketing-split, billing). Vor JEDEM PR `git rebase origin/staging` + Diff-Stat auf 0 Fremd-Deletions prüfen. [[feedback_pr_state_nicht_production_stand]]
3. **Edit-String-Mismatch an Box-Drawing-Zeichen (`───`)** → 2 Removal-Edits schlugen still fehl, ich pushte einen kaputten Build (orphan-Funktion, TS2304). **tsc EXIT-Code IMMER final prüfen bevor Tasks als done markiert werden** — nicht auf Edit-„success" allein vertrauen.
4. **EXCEPT-0/0 braucht Daten-Semantik-Check, nicht nur Struktur** — false×74 vs null×75 sieht „gleich leer" aus, ist es aber nicht.
