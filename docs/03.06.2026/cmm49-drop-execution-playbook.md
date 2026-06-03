# CMM-49 `DROP TABLE faelle` — Execution-Playbook (fürs überwachte Fenster)

**Stand 2026-06-03 (~12:30).** Diese Datei = die ausführbare Reihenfolge für die fokussierte, koordinierte Drop-Session. Erstellt autonom (Aaron unterwegs) als sicherer Capstone — **keine destruktiven Ops ohne Aufsicht + angehaltene Sessions.** SSoT-Plan bleibt `docs/superpowers/plans/2026-06-03-faelle-drop-master.md`.

---

## 0 · Readiness-Snapshot (live, 03.06.)

| Blocker | Menge | Status |
|---|---|---|
| FK-Constraints child→faelle | **40** | P3 (droppen, Spalten bleiben) |
| Views, die faelle referenzieren | **5** | P2 |
| Funktionen, die faelle referenzieren | **23** | P2 |
| Policies, die faelle referenzieren | **24** | P2 |
| Code-Reader `from('faelle')` | **~438** (war 449, 11 entfernt) | P1 |
| Code-Writer faelle (insert/update/delete) | **~25** | P1-Writer (DROP-Blocker!) |
| faelle Rows | 75 | datenarm |

**Diese Session erledigt (gemergt auf staging):** Security anon-Leak #2318 · P1 analytics #2320 · P1 finance #2321 · P1 admin-dashboards #2326. SSoT-Modell-Entscheid: **normalisierte Entities** (claim_parties/vehicles/+künftig werkstätten/mietwägen), claims=Rückgrat. Flat-halter-Pilot #2315 **closed** (verworfen).

---

## 1 · Reader-Taxonomie (warum „nur noch repointen" nicht stimmt)

1. **Anchor-Flips** — faelle nur Aggregations-Anker, Daten via claims-Embed → `from('claims')`. *Weitgehend abgeerntet* (analytics/finance/admin). Vereinzelt übrig (z.B. `lib/mietwagen/cron.ts`).
2. **Key-Flips** — per `lead_id`/anderem Nicht-faelle.id-Key → claims hat den Key. *Selten.*
3. **Bridges** (DOMINANT) — per `faelle.id` gekeyt, weil die `/faelle/[id]`-Route-/Entity-ID reinkommt → `from('faelle').select('claim_id').eq('id', fallId)` (inline resolveClaimId). **Brauchen den Route-Cutover.**
4. **kunde_id-Reader** — lesen `faelle.kunde_id` → Heimat ist `claims.geschaedigter_user_id` (**CMM-63**, separat). Bis dahin geblockt.
5. **faelle-native-Spalten** — `nachname`, `halter_*`, `polizeibericht_pflicht`, `wertminderung`, `nutzungsausfall_tagessatz`, … → P0-Migration in die Heimat (gutachten/claim_parties) ODER sterben mit dem Table-Drop, wenn 0-read.

---

## 2 · faelle-WRITER-Inventar (DROP-Blocker — müssen VOR dem Table-Drop weg)

> Solange irgendein Writer faelle schreibt, kann nicht gedroppt werden. Test/Seed-Writer (seed-test-data, seed-testdata, create-test-fall, cmm48-smoke, lifecycle-seed) sind test-only → mit dem Drop entfernen/stubben.

**Kritisch (Live-Pfade):**
- **`lib/leads/convert-lead-to-claim.ts:~523`** — INSERT der faelle-Row via `buildFallInsertFromLead` (lead-fall-mapping.ts). **DAS ist der zentrale Writer** (jede Konversion + jedes Monika-Embed legt eine faelle-Row an). Phase-6: `buildFallInsertFromLead` löschen, faelle-Insert entfernen. **Die aktiven aar-939-Embed-Sessions hängen hier dran → erst wenn die migriert/pausiert sind.**
- `lib/claims/create-for-fall.ts:141` — `update faelle.claim_id` (Bridge-Link).
- `lib/kunde/auto-claim.ts:40` — `update faelle.kunde_id` (→ CMM-63).
- `lib/faelle/state-machine.ts:189` — Status/Workflow-Update (b″ fror status ein; Rest prüfen).
- Stammdaten/Edit: `app/faelle/[id]/_actions/stammdaten.ts:283/365` (updateFallField/saveFinVin), `core.ts:88/124`, `components/faelle/OcrAutoFillModal.tsx:122`, `_sidebar/eskalation-actions.ts:66/108`, `_actions/kanzlei-paket.ts:300`.
- Workflow: `sv-zuweisung/route.ts:248`, `actions/sv-lead-ablehn-actions.ts:96`, `actions/termin-actions.ts:211`, `termine/verlege-nach-no-show.ts:105`, `gutachter/termine/[id]/actions.ts:388`, `kunde/faelle/[id]/_actions/besichtigungsort.ts:72`, `components/VorOrtPanel.tsx:65`, `kanzlei-wunsch/actions.ts:559/636`.
- Finance: `lib/abrechnung/{revert,reissue,process}-case-billing.ts`.
- OCR: `api/ocr-gutachten/route.ts:157`, `api/ocr-fahrzeugschein/route.ts:82` (Rest-non-halter), `api/ocr-trigger/route.ts:138` (halter_geburtsdatum — Repoint war in #2315, das closed → noch faelle).
- LexDrive: `lib/lexdrive/process-event.ts:770/862`.
- Delete-Cascade: `app/faelle/[id]/_actions/core.ts:52` (delete) + `delete_fall_komplett`-Funktion.

**Muster pro Writer:** Spalten via `splitOrKeepFaelleUpdate` → claims; faelle-native Spalten in ihre Heimat; Bridge-Keys (fallId) via Route-Cutover auf claimId. Workflow/Status-Spalten sind meist schon claims-gespiegelt (b″/SP-A/B) → der faelle-Write ist toter/redundanter Write → entfernen.

---

## 3 · Der Hebel: Route-Cutover `/faelle/[id] → claim.id`

Die meisten Bridges existieren, weil die App-Routen `faelle.id` als URL-/Entity-Key führen und intern `resolveClaimId(fallId)` (liest faelle) auflösen. **Solange das so ist, bleibt faelle gelesen.** Zwei Wege:

- **(A) URL-Key wechseln** `/faelle/[id]` führt `claim.id` → alle Link-Generatoren + Bookmarks betroffen (groß, aber sauber). Legacy-Redirect faelle.id→claim.id beibehalten (über eine Mapping-Tabelle, da faelle.id≠claims.id — die Map MUSS vor dem faelle-Drop persistiert werden, sonst sind alte Bookmarks tot!).
- **(B) resolveClaimId als EINZIGE faelle-Bridge belassen**, alles andere auf claims migrieren, dann ganz zum Schluss resolveClaimId + die `/faelle/[id]`-Routen in einem Rutsch auf eine **persistente faelle.id→claim.id-Map** (eigene kleine Tabelle, vor dem Drop befüllt) umstellen. **Empfohlen** — isoliert den faelle-Read auf einen Punkt.

→ Entscheidung A vs B = Architektur-Call (Aaron). B ist risikoärmer + macht den Drop atomar(er).

---

## 4 · P2 — DB-Objekte faelle-frei (Preview-gated, idempotent)

- **5 Views:** `faelle_kunde_view`, `faelle_sv_view` (Legacy — prüfen ob 0-Consumer → droppen), `v_claim_full` (LEFT JOIN faelle f + f.*-Spalten: fall_id/fall_status/gegner_anzahl_beteiligte/organisation_id/dispatch_id/kunde_id/kennzeichen-coalesce → diese Spalten erst homen [claims/vehicles] dann faelle-Join raus), `v_claim_listing`, `v_faelle_mit_aktuellem_termin` (faelle-Anker → claims).
- **23 Funktionen:** u.a. `delete_fall_komplett` (claim-fähig machen; `v_fall_tables` per fall_id → claim_id), `link_lead_data_to_fall` (Rest-Zeilen), Sync-Trigger claims↔faelle (werden moot → entfernen), `derive_claim_id_from_fall`/`trg_fn_fill_claim_id_from_fall` (Bridge-Trigger).
- **24 Policies:** `can_access_fall(fall_id)` → `can_access_claim(claim_id)`; alle Policies mit `\mfaelle\M`-Expr idempotent repointen.

**Regel:** jede getrackte Migration idempotent + **grüner Fresh-Replay-Preview** (frischer Branch — Edit-in-place wird geskippt!) BEVOR „ready". `pol=0`-live ≠ replay-safe (untracked Baseline-Repoints).

---

## 5 · P3 — FK-Cutover + DROP (eine Migration, im ruhigen Fenster)

1. **Voraussetzung:** 0 deployte faelle-Reader/Writer (staging UND main — geteilte DB!), alle P2-Objekte faelle-frei, **alle faelle-schreibenden Sessions angehalten** (insb. aar-939-Embed).
2. **40 FK-Constraints droppen:** `ALTER TABLE <child> DROP CONSTRAINT <child>_fall_id_fkey` (Spalten bleiben verwaist; P4-Kosmetik).
3. Letzte faelle-Referenzen (Default-Trigger) entfernen.
4. `DROP TABLE public.faelle;`
5. **Post-Drop-Portal-Smoke PFLICHT:** Public + Admin + Kunde + SV + Kanzlei, mit Screenshots.

---

## 6 · Externe Abhängigkeiten / Reihenfolge

- **CMM-63** (`faelle.kunde_id` → `claims.geschaedigter_user_id`): blockt die kunde_id-Reader/Writer (anforderung/konditional-tasks/zuordnung/auto-claim/…). Muss vor deren Repoint.
- **P0-native Spalten** (nachname/halter_*/polizeibericht_pflicht/wertminderung/nutzungsausfall_tagessatz…): in Heimat migrieren ODER als 0-read mit Drop fallen lassen (pro Spalte `count() + grep` prüfen).
- **Reihenfolge gesamt:** CMM-63 + P0-native → P1 Reader/Writer (Bridges via Route-Cutover) → P2 DB-Objekte → P3 FK+DROP+Smoke.
- **HARTE Regeln:** nie direkt auf main (Regel 1); DDL nur via Plugin apply_migration (Regel 2); kein unbegleiteter Stash (Regel 3); Drop-PR Draft bis grüner Fresh-Replay; nicht interleaved mit rel-Wellen/parallelen Sessions.

---

## 7 · Realistische Aufwandsschätzung
Kein Ein-Fenster-Job. **Route-Cutover (B)** = 1 fokussierter Brick. **P2** = 1–2 Sessions (Preview-gated). **P3** = 1 Session (1 Migration + Smoke), im ruhigen Fenster mit angehaltenen Sessions. CMM-63 + P0-native sind Vor-Bricks. Jeder Schritt einzeln sicher; der Weg konvergiert (anders als per-Spalte-Hauen).
