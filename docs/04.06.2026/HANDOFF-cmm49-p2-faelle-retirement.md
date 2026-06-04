# HANDOFF — CMM-49 faelle-Retirement P2–P5 (Code-Strecke zum `DROP TABLE faelle`)

**Für die nächste Session. Dies ist der alleinige Einstiegspunkt.** Lies zusätzlich nur noch:
`docs/04.06.2026/cmm49-faelle-retirement-plan.md` (Phasen-Plan) + Memory `project_cmm_entity_model.md`.

Stand: 2026-06-04, nach einer großen Session. Ziel der Gesamtstrecke: **`DROP TABLE faelle`** (claim = SSoT, keine Dup-Tabelle). Entscheidung Aaron: **voller Rewrite, KEIN faelle-View-Shim.**

---

## 1. Wie anknüpfen (erste 5 Minuten)
1. Branch: **`kitta/cmm49-faelle-retirement`** (off staging). PR **#2414** = P0+P1+P2-Chokepoint+Bucket-1a.
   - **ZUERST prüfen:** `gh pr view 2414 --json state,mergedAt`. Wenn **MERGED** → neuen Branch off `origin/staging` (die DB-Migrationen sind alle live; die Files in #2414 sind dann auf staging). Wenn **OPEN** → auf `kitta/cmm49-faelle-retirement` weiterarbeiten (rebase auf origin/staging).
2. DB-Stand verstehen: `mcp list_migrations` — alle `cmm49_*` (04.06.) sind live appliziert.
3. Klassifikation der offenen Sites: `node scripts/cmm49-classify-faelle-reads.mjs` (Bucket-Zähler) + `Grep from\(['"]faelle['"]\)` für die Live-Liste.
4. **DB-Projekt:** `paizkjajbuxxksdoycev` (prod+staging shared DB).

## 2. Was FERTIG ist (nicht nochmal anfassen)
- **Entity-Foundation:** PR #2395 (v_claim_full Person+Vehicle aus Entitäten) · #2402 (firmen-Tabelle + claim_parties.firma_id + rolle 'ansprechpartner' + claims.kanzlei_ansprechpartner_person_id + vs_korrespondenz.versicherung_id + Twin-Drift-Heilung der #2395-Korrekturen).
- **P0 Foundation (#2414):** `faelle_claim_bridge.fall_created_at` (Backfill) + `operative_status`-Gap-Backfill.
- **P1 — ALLE 4 faelle-Views faelle-frei (#2414):** `v_claim_full`, `faelle_kunde_view`, `faelle_sv_view`, `v_faelle_mit_aktuellem_termin` (alle claims-ankernd via `faelle_claim_bridge`, value-preserving 0-diff verifiziert, security/definer + Spaltennamen/Typen erhalten). Neue claims-Homes dafür backfilled: `mietwagen_kanzlei_informiert(+_am)`, `konvertiert_am`, `kunde_lat`, `kunde_lng`.
- **P2-Chokepoint (#2414):** `resolveClaimId` (src/lib/claims/get-claim-for-role.ts:194) Step-2-Fallback liest jetzt `faelle_claim_bridge(fall_id)` statt faelle → resolveClaimId + alle Caller faelle-frei. **Dafür neue RLS-Policy `faelle_claim_bridge_select_consolidated`** (Mig 20260604133657), die faelle's Multi-Rollen-Zugriff 1:1 spiegelt (kunde=claims.geschaedigter_user_id / sv=claims.sv_id / kanzlei=service_typ=komplett / makler=makler_fall_consent.fall_id==bridge.fall_id / staff=is_admin/dispatch/KB). `database.types.ts` regeneriert.
- **P2 Bucket-1a (#2414):** 4 lib/claims-Files (touch-recency, owned-claims, get-claim-lifecycle-for-claim, create-for-fall).

## 3. Was BLEIBT — exakt

### P2 Bucket 1 — claim_id-Lookups (56 Files total, 4 davon erledigt)
Vier Muster (per-Site klassifizieren, KEIN blind-sed):
- **(a) PURE_BRIDGE** `from('faelle').select('claim_id').eq('id', fallId)` (Ergebnis GENUTZT) → `const claimId = await resolveClaimId(client, fallId)`; Import `{ resolveClaimId } from '@/lib/claims/get-claim-for-role'` (bzw. `./get-claim-for-role` innerhalb lib/claims). Downstream-Usage von `x?.claim_id` auf `claimId` umstellen.
- **(b) KUNDE_ID** `from('faelle').select('claim_id').eq('kunde_id', userId)` → `from('claims').select('id').eq('geschaedigter_user_id', userId)` (== faelle.kunde_id, CMM-63 0-diff). Downstream `.claim_id` → `.id`.
- **(c) TOTE Reads (18 Stück)** `const { data: _f } = await ...faelle.select('claim_id')...` (Ergebnis UNGENUTZT, `_`-Prefix) → **Zeile löschen** (null Verhalten). Liste:
  `notifications/emit.ts:33`, `api/webhooks/matelso/inbound:111`, `api/aircall/call:55`, `api/ocr/anspruchsschreiben:83`, `copilot/briefing:22`, `email/google/flows:67`+`:253`, `api/webhooks/aircall/inbound:71`, `email/google/client:42`, `faq-bot/analyse:55`+`:191`, `api/lexdrive/bot-callback:56`, `fall/event-stream:348`, `fall/communication-timeline:98`, `lexdrive/process-event:699`, `api/fall-summaries:14`, `components/admin/FaqBotAnalyseCard:28`, `faelle/[id]/ai-actions:163`.
  ⚠️ faq-bot/analyse + email/google/flows haben **identische Doppelzeilen** → Edit mit Kontext oder replace_all+Zähl-Check.
- **(d) mixed-writer** (z.B. create-for-fall): Read=Bucket1 (erledigt), faelle-Write-Back=P3.

### P2 Bucket 2 — echte fall-Daten-Reads (~100 Files)
`from('faelle').select('<echte spalten>')` → `from('v_claim_full')` bzw. `from('claims')`. Pro Site: welche Spalten? → v_claim_full hat fast alles (claim-ankernd, Spaltennamen erhalten); für reine claims-Spalten direkt `claims`. **Key-Mapping:** alte `.eq('id', fallId)` → bei v_claim_full `.eq('fall_id', fallId)` ODER claim_id-basiert via resolveClaimId. **Value-preserving prüfen** (s. §5).

### P3 — Writer (44 Files, `update/insert/delete faelle`)
Pro Writer: schreibt er etwas, das der faelle↔claims-Sync-Trigger eh nach claims spiegelt? → Write streichen (claims=SSoT). Sonst auf `claims` umlenken. (`touchClaimRecency` ist das Vorbild — schreibt claims, nicht faelle.)

### P4 — Funktionen/Trigger (~27)
Sync-Maschinerie (`sync_faelle_claim_bridge`, `trg_fn_fill_claim_id_from_fall`, `kanzlei_faelle_sync_claim_fall`, `sync_claims_sv_id_to_faelle`, `link_lead_data_to_fall`, `trg_fn_sync_kanzlei_paket_to_faelle`) wird obsolet sobald nichts mehr faelle schreibt/liest → droppen. `can_access_fall` → claims-basiert (Aufrufer auf `can_access_claim` umstellen — ⚠️ `can_access_claim` deckt aktuell nur admin/dispatch/KB ab, ist für Multi-Rollen ZU ENG; entweder erweitern oder pro Aufrufer die richtige claim-Fn nehmen). Crons (`cron_konsistenz_check`, `cron_vs_frist_reminder`, `cron_kanzlei_paket_pending_check`), DSGVO, `delete_fall_komplett` auf claims/bridge.

### P5 — DROP TABLE faelle + Smoke
Erst wenn P1–P4 auf **prod** deployed (deploy-safe „Code/View vor Drop"). VOR dem Drop: `pg_depend` + ungekappter `Grep from\(['"]faelle['"]\)` == 0 (Inzident-Lehre, s. §6). Volle Portal-Smoke (Public/Admin/Kunde/SV/Dispatch/Kanzlei) mit Screenshots. `faelle_claim_bridge` BLEIBT (Route-Key-Entkopplung).

## 4. Methode pro DB-View/Migration (bewährt)
`pg_get_viewdef('<view>', true)` → in einem `DO $mig$`-Block gezielte `replace()`/`regexp_replace()` + **Guards** (RAISE EXCEPTION wenn ein Repoint nicht griff / Rest-`f.`-Ref bleibt) → `EXECUTE 'CREATE OR REPLACE VIEW ... AS '||ddl`. CREATE OR REPLACE **kann den Spalten-TYP nicht ändern** → bei Enum/Präzision casten (`::fall_status`, `NULL::numeric(10,2)`). Beispiele: Migs 123438, 125606, 124728.

## 5. Verifikation (Pflicht je Repoint)
- **Code:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` je Batch (Worktree-OOM-sicher).
- **Value-preserving (DB-Repoints):** Live-Diff-Query VOR dem Repoint, z.B.
  `SELECT count(*) FROM claims c LEFT JOIN faelle f ON f.claim_id=c.id WHERE f.<spalte> IS DISTINCT FROM c.<ziel>` → muss 0 sein. (So wurde jeder View-Repoint belegt.)
- **Nach jedem View-CREATE OR REPLACE:** `pg_get_viewdef ~ 'JOIN faelle'` == false, `reloptions` unverändert (security), Zeilenzahl, Stichprobe vs faelle == 0 diff.

## 6. HARTE REGELN / Gotchas (aus Inzidenten dieser + früherer Sessions)
1. **Write IMMER mit vollem Worktree-Pfad** `...claimondo-v2\.claude\worktrees\<wt>\...` — sonst landen Files im Main-Repo (passiert; per mv geheilt). Nach Write `git status` im Worktree prüfen.
2. **DDL nur via Plugin `apply_migration`** (Regel 2). Danach `list_migrations` → getrackte Version ablesen → File `supabase/migrations/<version>_<name>.sql` exakt so benennen.
3. **Nach Korrektur-Push prüfen ob der PR schon gemergt wurde** — die Merge-Session ist autonom+schnell; gemergt → Korrekturen brauchen NEUEN PR (Twin-Drift, passiert mit #2395).
4. **Drop-Verify NIE per Trunc-Grep** — `.from('<obj>')` ungekappt + `pg_depend` (Inzident 03.06. #2343).
5. **flow/* , termine/* , faelle/[id]/_actions/stammdaten.ts = aar-956-Revier** (Session 753d8096) — zuletzt / abgestimmt anfassen.
6. **`</content>`-Write-Artefakt:** nach jedem Write `grep -l "</content>"` scannen.
7. **bridge.fall_id == faelle.id (1:1, 0-diff)** + **claims.geschaedigter_user_id == faelle.kunde_id (0-diff)** + **claims.operative_status == faelle.status (0-diff, Gap gebackfillt)** — die drei tragenden Gleichungen der ganzen Strecke.

## 7. Pointer
- Plan: `docs/04.06.2026/cmm49-faelle-retirement-plan.md`
- Classifier: `scripts/cmm49-classify-faelle-reads.mjs`
- Entity-Gesamtkontext: Memory `project_cmm_entity_model.md` (lang, enthält alle Entscheidungen + Migrations-Versionen)
- Chokepoint-Helper: `src/lib/claims/get-claim-for-role.ts` (`resolveClaimId`)
