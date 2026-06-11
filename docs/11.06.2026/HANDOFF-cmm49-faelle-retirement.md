# HANDOFF — CMM-49 faelle-Retirement (Stand 11.06.2026, Session fb34de27)

## TL;DR
CMM-49 = `DROP TABLE faelle` (claim als SSoT). Heute sind die **zwei Schema-Long-Poles durch** (40-FK-Anker + Lossless-Gate GRÜN) + der **Step-4 claims→bridge-Trigger live**. Der kritische Pfad ist jetzt der **170-Reader-Sweep** (App-Code liest faelle direkt → muss auf claims). Danach: Step 5 (stop-faelle) → RLS/Trigger-Repoints → DROP.

## Heute prod-live gebracht (via `apply_migration`, Regel 2 — DB ist voraus, PRs syncen das Repo)
| Was | Migration | PR | Status |
|---|---|---|---|
| sv_id-Termin-Welle (DROP `gutachter_termine.sv_id`) | 20260611131431 + 131524 | #2674 | MERGED staging+main, triple-verifiziert (DB/Runtime/Types) |
| UNIQUE(claim_id) auf `faelle_claim_bridge` (Fan-out-Guardrail) | 20260611152714 | #2686 | prod-live, PR offen `--base staging` |
| 40 Child-FK → `faelle_claim_bridge(fall_id)` | 20260611153320 | #2688 | prod-live, PR offen |
| claims→bridge-Trigger (Step 4) | 20260611180646 | #2703 | prod-live, PR offen |

**→ #2686/#2688/#2703 liegen bei der Merge-Session (`--base staging`); prod-DB ist schon voraus (apply_migration), die PRs bringen nur das Repo in Sync. KEIN Repo-hinter-DB-Drift-Risiko, aber mergen.**

## Lossless-Column-Gate: GRÜN (0 harte Blocker)
faelle=278 Spalten → 167 faelle-only → **46 populated** → 121 dead (droppbar). Von den 46: **14 homed-divergence-0 verifiziert** (kunde_id→claims.geschaedigter_user_id; source_channel/wunschtermin→leads; mandatsnummer→kanzlei_faelle; fin_vin→vehicles; re_termin_token→gutachter_termine; + 8 entity kunde-PII/gegner via claim_parties/personen, cross-checked). Rest = dead/info-less/**accept-loss (Aaron ratifiziert)**: `sv_briefing_*`, `gutachter_honorar`, `ocr_*`, `dispatch_id`, reminder-flags, `kunde_adresse`, `kennzeichen_kreis/zahl`, besichtigungsort-1-stale-row. → werden beim finalen DROP info-loss-frei mit-gedroppt. Detail: Marker `COORDINATION-cmm49-faelle-drop-dependency-map.md` §Lossless-Worksheet.

## Korrigierte End-Sequenz (▶ = aktuelle Position)
1. Step 1 UNIQUE-Guardrail ✅ · Step 2 40-FK-Anker ✅ · Step 3 Identity-Converter ✅ (Entity #2692, **prod-deployed** Release #2698, switch 17:34:32Z) · Step 4 claims→bridge-Trigger ✅ (#2703)
2. ▶ **Reader-Sweep** (170 `from('faelle').select` / 105 Files → claims) — Entity-Lane (1eb0febf) fährt den Bulk; fb34de27-Slice = Finance/Kanzlei (**2/11 done**).
3. Step 5 stop-faelle (Entity, **gated auf Reader-Sweep** — sonst faelle-lose Claims → Reader leer + State-Machine bricht; kein claims→faelle-Trigger existiert, bewusst).
4. fb34de27: **25 RLS-Repoints + 7 Trigger-Migration** (post-cutover, **NOCH NICHT GESTARTET**).
5. Lossless-Gate final grün → **DROP TABLE faelle** (NO CASCADE; Gate: pg_depend@faelle leer ∧ pg_policies-faelle=0 ∧ Lossless ∧ Portal-Smoke ∧ **Aaron-GO**, irreversibel).

## Offene Arbeit + Owner
- **Reader-Sweep** (kritischer Pfad): Entity-Lane Bulk. **fb34de27-Finance/Kanzlei-Slice** = Branch `kitta/cmm49-sweep-finance-kanzlei` (2/11), Resume in `COORDINATION-cmm49-sweep-finance-kanzlei.md` (Recipe + Per-File-Notizen). Convention: **claims-direkt via `resolveClaimId(db, fallId)`** (`@/lib/claims/get-claim-for-role`).
- **25 RLS-Repoints + 7 Trigger-Migration** (fb34de27, post-cutover, ungestartet): die 25 faelle-referenzierenden Policies auf claims/bridge repointen; 3 Notification-Trigger (on_filmcheck_done/on_gutachten_eingegangen/on_regulierung) lesen faelle → auf claims/v_claim_full. Listen im Dependency-Map-Marker §RLS/§Trigger. **RLS-Repoint ist NON-gated auf den Sweep** → kann parallel laufen.
- **DROP TABLE faelle**: final, Aaron-GO.
- **Merge**: #2686/#2688/#2703 → Merge-Session.

## Kritische Lehren/Gotchas (nicht wiederholen)
- **Step-4-Trigger war DEPLOY-gated, nicht MERGE** (merged≠deployed; alter Binary mintet non-identity (F,C) → UNIQUE-Throw auf JEDE Lead-Konversion). Vor irreversiblen Schritten: prod-DEPLOY abwarten + eigene funktionale Prod-Probe (nicht vacuous).
- **`resolveClaimId`** für fall_id→claim_id, NIE `fall_id==claim_id` annehmen (77 Legacy non-identity; Identity nur für neue Rows ab Step 3).
- **RLS-Klasse**: `pg_depend` (View-Join) zeigt RLS-Policies NICHT — separat `pg_policies WHERE qual/with_check ilike '%faelle%'` scannen + per-Policy value-neutral-Probe (sonst unsichtbare Daten/Leak nach Repoint, sv_id-Catch).
- **Reader-Sweep ⇄ Write-Track-Entanglement**: viele Files lesen UND schreiben faelle. Reader-Slice migriert NUR Reads (claims-direkt); Writes via `splitOrKeepFaelleUpdate` (CLAIM_OWNED-Felder routen schon auf claims, faelleUpdate dead-guarded) = Entity-W-track. **faelle.update in der Reader-Slice NICHT anfassen.**
- **DDL nur via `apply_migration`** (Regel 2); File==recorded-version (Twin-Drift vermeiden).

## Branches (fb34de27, alle gepusht)
- `kitta/cmm49-bridge-claimid-unique` → #2686
- `kitta/cmm49-faelle-fk-to-bridge` → #2688
- `kitta/cmm49-claims-bridge-trigger` → #2703
- `kitta/cmm49-sweep-finance-kanzlei` → 2 Commits (process- + revert-case-billing), **PR pending** (nach voller Slice)

## Marker (Detail-State, in `…/memory/`)
- `COORDINATION-cmm49-faelle-drop-dependency-map.md` — **DIE Vollkarte** (40 FK + 25 RLS + 7 Trigger + Lossless-Worksheet + ganze Sequenz + Entity-Koordinations-Thread).
- `COORDINATION-cmm49-sweep-finance-kanzlei.md` — Reader-Sweep-Slice-Resume (Recipe + Per-File + verifizierte Fakten).
- `COORDINATION-svid-drop-endstrecke.md` + `COORDINATION-cmm49-svid-befund.md` — sv_id-Achse (komplett durch).

## Resume — nächste Session, in dieser Reihenfolge
1. **Reader-Sweep-Slice weiter** (mein Hauptstrang): `COORDINATION-cmm49-sweep-finance-kanzlei.md` lesen → `git checkout kitta/cmm49-sweep-finance-kanzlei` → nächstes File `fall-finanzen.ts` (Plan im Slice-Marker, accept-loss-null) → erstelle-abrechnung (intricate, List+Embed) → app/cron/display-Files → tsc-gegated → **eine** Slice-PR `--base staging`.
2. **Optional parallel**: RLS-Repoint-Track starten (non-gated, sv_id-RLS-Disziplin).
3. **Koordinieren mit 1eb0febf** (Sweep-Fortschritt + Step-5-Timing) + Merge-Session (#2686/#2688/#2703).

**Hygiene-Stand Session-Ende:** Working-Tree clean, alle Branches gepusht, kein eigener Stash. 3 Migrationen prod-appliziert + getrackt.
