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

---

## ✅ SESSION-2 (fb34de27-Fortsetzung): Finance/Kanzlei-Slice GEBAUT + tsc-grün (0 Errors)

**6 Files migriert (claims-direkt, faelle-frei FORWARD-Reads, `npx tsc --noEmit` = 0 Errors verifiziert):**

| File | Migration | Value-Neutralität (prod-verifiziert) |
|---|---|---|
| `src/lib/finance/fall-finanzen.ts` | faelle-Read → `resolveClaimId` + `claims(sv_id, kanzlei_faelle(regulierung_am))` | accept-loss `wertminderung`+`nutzungsausfall_tagessatz` → `null` (**0-coverage über alle 79** verifiziert → exakt wert-neutral); sv_id 0-diff |
| `src/lib/abrechnung/kanzlei/erstelle-abrechnung.ts` | faelle-List-Anker → **claims-Anker**; `positionen.fall_id`+leads via **`kanzlei_faelle.fall_id`** (native Spalte, 0-null — KEIN Bridge-Reverse) | **+ LATENT-BUG-FIX:** Original las `faelle.fall_nr` = **Phantom-Spalte** (existiert nicht → PostgREST-Reject → jede Kanzlei `fehler++`, Monatsabrechnung tot). Neu: `claims.claim_nummer`. Kein Finanzschaden (0 berechtigt-Claims) |
| `src/app/api/cron/case-billing-batch/route.ts` | Zwei-Schritt (claims→ids→faelle) → **EINE** claims-Query | Orphan-Claim hat **sv_id=NULL** → `.not('sv_id','is',null)` schließt aus; processCaseBilling idempotent (claims.lead_preis_netto-Guard) → outcome-identisch |
| `src/app/api/cron/release-makler-provisionen/route.ts` | faelle-Read → claims via `makler_provisionen.claim_id` (native FK); fallMap bleibt fall_id-gekeyt (downstream+leads unverändert) | makler_provisionen=**0 Rows**; operative_status SSoT (==faelle.status 0-diff bei non-null); **2 null-operative_status-Faelle** verlieren faelle.status-Fallback = CMM-74-Mirror-Gap (dokumentiert, 0-Impact) |
| `src/app/gutachter/abrechnung/page.tsx` | faelle-Anker → claims-Anker; abrMap auf **`gutachter_abrechnungen.claim_id`** re-keyed; gutachten-Embed direkt am claims-Anker | gutachter_abrechnungen=**0 Rows**; sv_id 0-diff; strukturell value-neutral (claim_id-FK + derive-Trigger) |
| `src/lib/kanzlei-wunsch/actions.ts` | 2 Smoke-Helper-FORWARD-Reads (smokeLexDriveSigniert + smokePflicht) → `resolveClaimId` | lead_id 0-diff; matcht das bestehende resolveClaimId-Muster im File (3 Funktionen schon migriert) |

**Schema-Fakten verifiziert (prod, execute_sql READ, sv_id-Disziplin):** alle 4 Child-Tische (gutachter_abrechnungen / makler_provisionen / kanzlei_abrechnung_positionen / kanzlei_faelle) haben **`claim_id`+`fall_id`**; kanzlei_faelle.fall_id 0-null/12 rows; **Orphan-Claim 1 (sv_id=NULL)**; accept-loss wertminderung/tagessatz **0-coverage**; sv_id/lead_id 0-diff (79); operative_status==status (2 null-only); **`faelle.fall_nr` existiert NICHT** (faelle hat gutachten_nummer/mandatsnummer; claims hat claim_nummer); alle 13 genutzten claims-Spalten existieren.

### DEFERS — bewusst NICHT migriert (anderer Owner, NIE naiv swappen)
- **`src/lib/kanzlei/actions.ts` `loadClaimContext`** (1 Read): `from('faelle').eq('claim_id')` **REVERSE-Lookup** für `revalidatePath('/faelle/…')` + sendEmail/emitEvent `fallId`. → **Owner F (Route-Key)**. Bridge-Reverse VERBOTEN; Eliminierung braucht claim-keyed Routes + Branding-Signatur-Refactor.
- **`src/lib/kanzlei-wunsch/actions.ts` (Rest):** 6 REVERSE-Reads (setKanzleiWunsch×2 / reset / updateAnsprechpartner / versende / bestaetigeSelbst — `select('id').eq('claim_id')` für revalidate / pushMandatToKanzlei / auftraege-fallId) → **Owner F**; 1 `select('*')` (smokePflicht → createPflichtdokumenteFromKatalog liest faelle-Stammdaten) → **Owner B (v_claim_full)**; 2 faelle-WRITES (smokeReset status, smokeLexDrive stammdaten) → **P5/Entity-W-track**.
- **`src/app/kanzlei/mandate/page.tsx` + `src/app/kanzlei/kanban/page.tsx`**: lesen `kunde_vorname/kunde_nachname` (geschädigter-Party, **NICHT** claims.halter_*) + `kennzeichen` (vehicle) unter **kanzlei-RLS** → Entity-gated EMBED-Reads = **Owner B (v_claim_full)**; `f.id` als `/kanzlei/fall/[id]`-Route-Key = Owner F.

### → KOORD AN 1eb0febf (Entity-Lane): 3.5 Files der Finance/Kanzlei-Slice sind EUER Revier
mandate + kanban (kunde-PII/kennzeichen via v_claim_full, kanzlei-RLS) + smokePflicht `select('*')` gehören zum Entity-EMBED-Reader-Repoint. kanzlei/actions + die 6 kanzlei-wunsch-Reverse-Reads sind Route-Key (Owner F). Meine Slice deckt die **service-role/intern claims-direkt FORWARD-Reads** (Finance/Billing) — die sind durch.

**PR:** `kitta/cmm49-sweep-finance-kanzlei` → 1 Slice-PR `--base staging` (→ Merge-Session). tsc-grün. **Kein faelle-WRITE angefasst.** Branch jetzt: 2 (process/revert-case-billing) + 6 neue Migrationen + dieser Doc-Update.
