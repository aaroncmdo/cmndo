# Handoff — claims-Normalisierung Slice 2+3 + Claim-Detail #2 (D-admin) · 2026-07-11

Session `470d55c9`. Alles unten ist **gemergt auf `staging`** (5 PRs, alle `build: pass`).
Detail-Marker (Memory, nicht git): `COORDINATION-normalisierung-slices2-3-470d55c9-owned`,
`COORDINATION-claim-case-program-470d55c9-owned`, `BROADCAST-normalisierung-0daten-false-dead-korrektur`.

---

## TL;DR

- **claims-Normalisierung Slice 2+3 = FERTIG.** Von 10 Register-„droppbaren" Restspalten: **5 wirklich gedroppt**, **5 waren false-dead** (live-dormant → behalten), Types angeglichen, ein Twin-Drift gefixt. node_modules (shared) geheilt.
- **Claim-Detail #2 (Admin/KB getClaimDetail-Migration): D1 fertig, D2 bewusst NICHT forciert** (Impedance-Mismatch, s.u.).
- **Nächste Programm-Workstreams:** #3 Fälle-Hub-Konvergenz, #4 ops-cockpit Phase 3/4 — je eine fokussierte Session, mit den Nachbar-Lanes koordiniert.

---

## 1 · Was gelandet ist (staging)

### 1a · claims-Normalisierung Slice 2+3
| PR | Inhalt |
|---|---|
| #4058 | `letzter_no_show_am` + `letzter_sv_no_show_am` gedroppt (v_claim_sv shape-preserving) |
| #4063 | `gegnerisches_vehicle_id` gedroppt (v_claim_base+v_claim_sv DO-block) |
| #4073 | `kunde_lat` + `kunde_lng` **re-land** (Twin-Drift-Fix — s. §2c) |
| #4076 | database.types.ts: die 5 gedroppten Spalten aus dem claims-**Tabellen**-Typ raus (Views behalten sie) |
| #4080 | Claim-Detail D1 (s. §1b) |

**Netto 10 Spalten:** gedroppt = `letzter_no_show_am`, `letzter_sv_no_show_am`, `gegnerisches_vehicle_id`, `kunde_lat`, `kunde_lng`. **KEEP (false-dead)** = `eskaliert_am`, `eskaliert_grund` (CMM-48 claim-owned SSoT), `reparatur_freigegeben_von` (repair-approval), `vorschaden_mit_vs_abgerechnet` (onboarding), `brn` (live OCR).

Migrationen (prod-appliziert via `apply_migration`): `20260710160507/160800` (letzter), `20260710172215/172528` (gegnerisches), `20260710175305/175328` (kunde_lat/lng).

### 1b · Claim-Detail #2 D1 (PR #4080)
Der staff-Branch der `getClaimDetail`-Facade (`src/lib/claims/detail/get-claim-detail.ts`) nutzte `getClaimForRole` (v_claim_full, **claim_id**-keyed, `ClaimFull`) — falsch für die Admin-Route, die **faelle.id** übergibt. Swap auf **`getFallById`** (v_faelle_mit_aktuellem_termin, faelle.id-keyed, flaches Record) = genau die Ladung, die die Admin-Fallakte heute selbst nutzt. Löst den D-admin-Keying-TODO (pflicht faelle.id-korrekt). Staff-Core-Type `ClaimFull`→`ClaimDetailCoreStaff`(Record). **Zero Blast-Radius** (kein realer staff-Consumer der Facade). Verifiziert: opt-in Integration-Test PASS (`c1PflichtParity=3`, `c1Distinguishing=true`).

**Facade-Keying (jetzt dokumentiert, per-Rolle):** kunde = claim_id (CMM-63); sv + staff = faelle.id.

---

## 2 · Wiederverwendbare Lektionen (WICHTIG für weitere Slices/Migrationen)

### 2a · „0-Daten ≠ tot" — Code-Verify ist PFLICHT vor jedem claims-Spalten-Drop
Das Normalisierungs-Register klassifizierte per 0-Daten. **5 von 10 „toten" Restspalten waren live-dormant** (0-Daten NUR weil das Feature in prod noch nicht gefeuert hat). Ursache = **CMM-48-Routing**: `src/lib/faelle/claim-duplicate-columns.ts` `CLAIM_OWNED_DUPLICATE_COLUMNS` routet Writer via `splitOrKeepFaelleUpdate` nach claims → jede dort gelistete claims-Spalte ist live. **Regel:** vor JEDEM Drop grep Writer/Reader + `claim-duplicate-columns.ts` + pg_proc/pg_trigger. (Byproduct-Fund für 6f60c510: `marketing_provision` = false-dead, `fall-finanzen.ts:101/112` liest sie — Register sagte „0-refs".)

### 2b · Shape-preserving View-Rewrite via self-verifying DO-block (für große Views)
Um eine Spalte zu droppen, die eine View projiziert: die View so umbauen, dass sie die Spalte NICHT mehr liest (`NULL::<typ> AS <col>`), dann `DROP COLUMN`. Für **große Views** (v_claim_base = 34 KB) NICHT hand-transkribieren — stattdessen ein DO-block, der `pg_get_viewdef` liest, gezielt `replace()`t, mit `RAISE` asserted, und via `EXECUTE 'CREATE OR REPLACE VIEW … AS ' || v_new` neu baut. Reproduzierbar, self-verifying, kein Silent-Corruption-Risiko. Vorlage: Migration `20260710172215`. **reloptions je View exakt erhalten** (`security_invoker`), vor Drop `views_still_dep=[]` verifizieren.

### 2c · Twin-Drift nach Squash-Merge — NICHT nach PR-Merge auf den Branch pushen
PR #4063 wurde (squash) gemergt, als nur `gegnerisches` drauf war; der danach gepushte `kunde_lat/lng`-Commit landete NIE in staging, während die Spalten auf prod schon gedroppt waren (prod voraus, Repo zurück = AAR-599-Klasse). Fix = **re-land-PR** (#4073, Muster wie #4064/#4065 „ledger-align, prod already applied"). **Lehre:** nach einem Squash-Merge ist der Branch tot — neue Commits brauchen einen neuen PR.

### 2d · Facade-Impedance-Mismatch (warum D2 NICHT forciert wurde)
`getClaimDetail` bündelt core+lifecycle+auftraege+pflicht unter EINER `rolle`. `Rolle = {kunde,sv,kb,admin,kanzlei}` — **kein `dispatch`**. Die Admin-Route (`/faelle/[id]`) bedient aber auch `dispatch` und mappt **kanzlei+dispatch → 'kunde'** für pflicht (viewerRoleForTimeline). Die single-rolle-Bundle-Facade passt auf single-role-Consumer (kunde/sv ✓), NICHT auf die multi-role Admin-Page mit nuanciertem pflicht. Forcieren = Facade verschlechtern (dispatch-Placeholder + pflichtRolle-Override) ODER Doppel-pflicht-Load. **Die Admin-Page funktioniert heute korrekt** → D1 ist der Wert, D2 nicht forcieren. **Lehre:** eine Bundle-Facade ist kein Muss für jede Detail-Page; multi-role-Pages mit Feld-Nuancen dürfen explizit bleiben.

---

## 3 · Der Weg weiter (Programm Claim/Case-Management, [[program-claim-case-management-map]])

- **#2 Admin/KB-Detail:** ✅ D1 gelandet. **D2 = NICHT forcieren** (§2d). Falls volle Facade-Konsistenz je gewollt: bewusster Design-Schritt mit der **Produkt-Frage** „sollen kanzlei/dispatch role-specific pflicht statt 'kunde' sehen?" — NICHT blind swappen.
- **#3 Fälle-Hub-Konvergenz** (`/admin/faelle`): 5-Tab-Kleber (1 nativ `FaelleKanban` + 4 Re-Export-Tools/Doppel-Header) → EINE shared Case-Shell auf der workstate-Foundation. E1–E3 (Aaron) entschieden: Cockpit aus `/admin` → `/admin/faelle` ziehen; 4 Tools als Tabs; Detail-Ops ergänzt FallakteShell. **Co-Design mit `v_claim_workstate`/`WorkItemCard` (ops-Foundation, prod).** ⚠ Nachbar-Lanes: `386b3bd8` (vertrieb-konsolidierung = Lead-Achse-Schwester, teilt WorkItem-Muster), `62dd5486` (kunde-claim-detail-rebuild).
- **#4 ops-cockpit Phase 3/4:** Dispatch-UI (`v_lead_workstate` steht) + Detail-Ops-Hero (Edit-Basis existiert schon — `_stammdaten/Sections` InlineEdit + `canEditField`, Admin/KB kein Whitelist; nur ORGANISATION in einen Fluss, kein Neubau).
- **Normalisierung Rest-Slices (NICHT diese Lane):** Slice 4 money = `6f60c510` (⚠ `marketing_provision`-false-dead-Fund weitergeben); Slice 5 vorschaeden = CMM-64. Für ALLE gilt §2a (Code-Verify-Pflicht).

---

## 4 · Setup / Verify-Rezept
- **Worktree** teilt `node_modules` (Symlink auf `claimondo-v2/node_modules`) — parallele npm-Aktivität kann es zerschießen; heilen = `npm install --prefix <main-checkout>` (restaurierte 1499 pkgs 10.07.).
- **tsc:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` — 2 bekannte Worktree-Modul-Noise-Fehler (`jsqr`, `@turf/union`), sonst grün.
- **Opt-in Integration-Test** (getClaimDetail): `RUN_PARITY=1` + `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (CRLF-safe aus main `.env.local`) → `npx vitest run src/lib/claims/detail/__tests__/get-claim-detail.test.ts`.
- **DDL:** NUR via `apply_migration` (Regel 2); danach `list_migrations` → File nach getrackter Version benennen (anti Twin-Drift). project_id = `paizkjajbuxxksdoycev`.
- **Route-Changes:** CI-`build` ist autoritativ (Next-15-Validator, lokal nicht baubar). Prod-Smoke nur Test-Accounts. Bekannter CI-Blocker: `Supabase Preview` failt für ALLE SQL-PRs (ungated `v_claim_workstate` DEFINER-View) — nicht der eigene Fehler, `build: pass` reicht.

---

## 5 · Session-Bilanz
5 PRs, alle gemergt. Normalisierung Slice 2+3 abgeschlossen, Claim-Detail #2 D1 gelandet, node_modules geheilt, Twin-Drift gefixt, ein false-dead-Fund an 6f60c510 gemeldet. Programm-Ownership (#2/#3/#4) getrackt in `COORDINATION-claim-case-program-470d55c9-owned`. Sauberer Milestone; #3/#4 = fokussierte Folge-Sessions.
