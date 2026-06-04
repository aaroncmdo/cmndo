# HANDOFF — CMM-49 faelle-Retirement (Code-Strecke zum `DROP TABLE faelle`)

**Für die nächste Session. Alleiniger Einstiegspunkt.** Zusätzlich nur:
`docs/04.06.2026/cmm49-faelle-retirement-plan.md` (Phasen-Plan, liegt auf staging) + Memory `project_cmm_entity_model.md`.

Stand: 2026-06-04, **zweite Session** (nach der grossen ersten). Ziel: **`DROP TABLE faelle`** (claim = SSoT). Entscheidung Aaron: **voller Rewrite, KEIN faelle-View-Shim.**

---

## 0. WICHTIGE KORREKTUR zum alten Handoff (lies das zuerst)

Der erste Handoff schrieb „PR #2414 = P0+P1+P2-Chokepoint+Bucket-1a". **Das stimmte NICHT.** Verifiziert (`git show --stat 4263414f7`): **#2414 (squash) enthielt NUR den Plan-Doc + 5 Migrations-Files (P0 bridge_fall_created_at + operative_status-Backfill, P1a v_claim_full, P1b kunde/sv-view). NULL App-Code.**

Chokepoint (`resolveClaimId`→bridge), Bucket-1a (5 lib/claims-Files), 3 Migrations (125324/125606/133657) + Types-Regen wurden auf `kitta/cmm49-faelle-retirement` **NACH** dem 12:57-Merge committet → landeten NIE auf staging. Dieser Branch ist inzwischen **hinter** staging (ein direktes Weiterarbeiten darauf würde portal-i18n + cluster/marketing-CI zurückrollen — NICHT tun).

**Lehre:** Squash-Merge macht die Original-SHAs nie zu Ancestors → `git merge-base --is-ancestor` allein ist irreführend. Immer **File-Inhalt** prüfen (`git show --stat <squash>` + `git diff --stat origin/staging <branch>`). Siehe Memory `feedback_pr_state_nicht_production_stand`.

---

## 0b. ENTSCHEIDUNG Aaron 04.06. — `fall_id` ist semantische Dopplung, soll als DATEN-Key sterben

**Endzustand:** intern überall **`claim_id`**, ALLE `fall_id`-Spalten droppen. `fall_id` überlebt **nur** als URL-Parameter der Bookmark-Route `/faelle/[id]` — via `resolveClaimId`+`faelle_claim_bridge` (bridge bleibt permanent als reine Route-Key-Map). `fall_id` ist dann KEIN Daten-Key mehr, nirgends.

**Daraus die harte Regel für den Rest der Strecke (Bucket-2 / P3):**
- **NIEMALS `claim_id → fall_id`** (Reverse-Lookup, auch nicht über die Bridge) — das hält die Dopplung am Leben. Nur die EINE Richtung `fall_id → claim_id` ist erlaubt, und nur am Route-Eingang (`resolveClaimId`).
- **Interne `from('<tabelle>').eq('fall_id', x)`-Reads/Writes → `.eq('claim_id', claimId)`** umstellen. `claim_id` ist auf den meisten Tabellen schon da: `timeline`, `fall_dokumente`, `pflichtdokumente`, `nachrichten`, `tasks`, `gutachter_termine`, `phase_transitions`, `webhook_events`, `email_log` (alle fall_id+claim_id); `aircall_calls`/`fall_summaries`/`ki_gespraeche` sind schon fall_id-frei. **NUR** `mitteilungen`/`dokument_upload_anfragen` keyen anders (kein claim_id) — separat ansehen.
- **Value-preserving Pflicht** bevor man einen fall_id-Read auf claim_id dreht: prüfen dass `<tabelle>.claim_id` für die relevanten Rows lückenlos backfilled ist (sonst Row-Verlust). Erst dann fall_id-Spalte droppen (P4/P5).
- Dadurch verschwinden die **Reverse-Lookups (ANCHOR-Klasse) von selbst** — NICHT per Bridge-Swap „reparieren". Ausnahme = echter Route-Key (`revalidatePath('/faelle/${fallId}')`, Navigation zu `/faelle/[id]`): braucht fall_id legitim → über `resolveClaimId`/bridge, bleibt.

**KUNDE_ID-Klasse ist NICHT in dieser Strecke:** Code-Kommentar `lib/sla/kanzlei-mahnungen.ts:252` — `kunde_id`→`claims.geschaedigter_user_id` läuft über **CMM-63** (kunde_id-Ownership-Umbau), nicht hier. Außerdem ist `claims.geschaedigter_user_id == faelle.kunde_id` (0-diff) die Brücke, aber der Repoint gehört zu CMM-63.

(Diese Session hatte kurz ANCHOR `claim_id→fall_id` via Bridge gebaut — von Aaron als Dopplungs-Erhalt zurückgewiesen, verworfen. #2423 ist davon unberührt: es ist reine Vorwärtsrichtung und bleibt korrekt.)

---

## 1. Branch- & DB-Stand (erste 5 Minuten)
1. **Diese Session arbeitete auf `kitta/cmm49-p2-claim-id-lookups`** (frisch off `origin/staging`). **PR #2423** gegen staging.
2. **ZUERST prüfen:** `gh pr view <PR> --json state,mergedAt`. MERGED → neuer Branch off `origin/staging`. OPEN → drauf weiter (rebase origin/staging).
3. DB: `mcp list_migrations` — alle `cmm49_*` (bis `20260604133657`) sind live. **Keine neuen Migrations in dieser Session** (reiner Code-Repoint; die 3 re-gelandeten Migration-Files waren schon DB-appliziert, nur File-Hygiene).
4. Klassifikation: `node scripts/cmm49-classify-faelle-reads.mjs` + `node scripts/cmm49-classify-faelle-reads.mjs --list <KLASSE>`. DB-Projekt `paizkjajbuxxksdoycev`.

## 2. Was FERTIG ist (nicht nochmal anfassen)
- **Entity-Foundation:** #2395, #2402 (s. Memory).
- **#2414 (auf staging):** P0-Migrations + P1a v_claim_full + P1b kunde/sv-view (nur Migration-Files).
- **DIESE Session (`kitta/cmm49-p2-claim-id-lookups`, 5 Commits):**
  1. **Re-Land Foundation:** Chokepoint `resolveClaimId` (Step-2 → `faelle_claim_bridge`), Bucket-1a (`create-for-fall`/`get-claim-lifecycle`/`owned-claims`/`touch-recency`), 3 Migration-Files (125324/125606/133657), `database.types.ts` frisch aus Live-DB regeneriert (hat jetzt `faelle_claim_bridge`+`fall_created_at`, `claims.operative_status`).
  2. **P2 Bucket-1 PURE_BRIDGE KOMPLETT (alle non-aar956):** ~57 Sites in lib/* (11 Files), api/* (11), faelle/_actions+gutachter/kunde/admin/components (16), lib/actions+auftrag+beleg-review+communications+faelle+kanzlei-wunsch (9). Jeder `from('faelle').select('claim_id').eq('id',x)`+Extract → `resolveClaimId(client, x)`. `stripe/webhook` Batch-`.in()` → `faelle_claim_bridge.in('fall_id', …)`.
  - **WICHTIG — die im alten Handoff als „18 TOTE Reads" gelistete Löschliste war FALSCH.** Alle `_`-prefixed Reads (emit/briefing/event-stream/client/flows/analyse/…) nutzen ihr Ergebnis sehr wohl als `claimId` (Folgezeile). Sie wurden zu `resolveClaimId` repointet, **NICHT gelöscht**. (Lehre: `_`-Prefix ≠ ungenutzt. Per-Site lesen, kein blind-sed — exakt wie der alte Handoff warnte.)
  - tsc nach jedem Batch grün; `</content>`-Scan sauber.

## 3. Was BLEIBT — exakt (Klassifikator-Stand NACH dieser Session)
`total 379` · PURE_BRIDGE **7** · KUNDE_ID 26 · EMBED 168 · ANCHOR 24 · KEY_OTHER 20 · EXISTENCE 5 · OTHER 77 · WRITER 44

### P2 Bucket 1 — Rest = nur noch **7 PURE_BRIDGE, alle aar-956-Revier** (bewusst aufgeschoben, §6.5 alt)
`stammdaten.ts:192,319` · `flow/[token]/actions.ts:132,438,1320` · `gutachter/termine/[id]/actions.ts:375` · `lib/termine/embed-b-dispatcher-actions.ts:92`. **Mit aar-956-Session abstimmen** (war 753d8096; aktuell `kitta/aar-956-*`-Sessions). Transformation trivial (= `resolveClaimId`), nur Kollisions-Koordination nötig.

### P2 Bucket 1b — KUNDE_ID (26) — **NICHT der einheitliche Pattern-b!**
Klassifikator-KUNDE_ID = „select-Liste **enthält** `kunde_id`" — heterogen, NICHT nur `.eq('kunde_id',u)`. Per-Site:
- **echt keyed-by-kunde_id** (`.eq('kunde_id', userId)`, sel=claim_id) → `from('claims').select('id').eq('geschaedigter_user_id', userId)` (CMM-63 0-diff), downstream `.claim_id`→`.id`.
- **select enthält kunde_id, keyed-by-id** → eher Bucket 2 (v_claim_full / claims / bridge je nach Spalten).
- Viele liegen im aar-956-Revier (4 termin-reminder-Crons `kb-termin-reminder(+-1h)`, `termin-erinnerungen`, `termin-morgen-erinnerung`; `lib/actions/termin-actions`+`termin-verlegung-actions`; `lib/termine/kb-booking`; `flow/*`). Diese mit-abstimmen.

### P2 Bucket 2 — echte fall-Daten-Reads (~EMBED 168 + ANCHOR 24 + KEY_OTHER 20 + EXISTENCE 5 + OTHER 77)
`from('faelle').select('<echte spalten>')` bzw. `claims:claim_id(...)`-Embeds → `from('v_claim_full')` (Key `.eq('fall_id', x)`) bzw. `from('claims')`. ANCHOR (`.eq('claim_id', x)` = faelle BY claim) → `from('claims')`/bridge. **Value-preserving prüfen** (§5).

### P3 — Writer (44, `update/insert/delete faelle`)
Pro Writer: spiegelt der Sync-Trigger das eh nach claims? → Write streichen. Sonst auf `claims` umlenken. `touchClaimRecency` ist Vorbild. **Mixed-Writer** (core/eskalation-actions/kanzlei-paket/admin-abrechnungen/mietwagen/create-for-fall): Read ist schon repointet, nur der faelle-Write-Back bleibt hier zu erledigen.

### P4 — Funktionen/Trigger (~27) · P5 — DROP TABLE faelle + Smoke
Unverändert ggü. altem Handoff (Sync-Maschinerie droppen sobald nichts mehr faelle schreibt/liest; `can_access_fall`→claims; Crons/DSGVO/`delete_fall_komplett`). P5 erst wenn P1–P4 auf **prod** deployed; vor Drop `pg_depend` + ungekappter `Grep from('faelle')` == 0; volle Portal-Smoke. `faelle_claim_bridge` BLEIBT (Route-Key-Entkopplung).

## 4–6. Methode / Verifikation / Gotchas
Unverändert ggü. altem Handoff — **plus**:
- **`resolveClaimId(client, fallId)` ist DER Bucket-1-Hebel** (`src/lib/claims/get-claim-for-role.ts`). Liest `claims.id`==x ODER `faelle_claim_bridge.fall_id`==x. Akzeptiert alle Client-Typen (admin/server/`SupabaseClient<any>`/Browser-Client — tsc-verifiziert). Pure/type-only-Modul → auch in Client-Components importierbar (OcrAutoFillModal).
- **Squash-Drift** (§0): re-gelandete Files immer per File-Inhalt verifizieren, nicht per SHA-Ancestry.
- **3 tragende 0-diff-Gleichungen:** `bridge.fall_id==faelle.id` · `claims.geschaedigter_user_id==faelle.kunde_id` · `claims.operative_status==faelle.status`.
- tsc im Worktree: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (node_modules ist hier echtes Verzeichnis, keine Junction → sauber).

## 7. Pointer
- Plan: `docs/04.06.2026/cmm49-faelle-retirement-plan.md`
- Classifier: `scripts/cmm49-classify-faelle-reads.mjs`
- Chokepoint: `src/lib/claims/get-claim-for-role.ts` (`resolveClaimId`)
- Entity-Kontext: Memory `project_cmm_entity_model.md`
