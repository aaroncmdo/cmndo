# HANDOFF — CMM-49 faelle-DROP — sauberer Einstiegspunkt (Stand 04.06.2026)

> **▶ AN DIE CMM-49-SESSION — zuerst lesen.**
> **Wo das hier liegt:** PR **#2425** · Branch `kitta/cmm49-handoff-clean` · Datei `docs/04.06.2026/HANDOFF-cmm49-faelle-drop-clean.md` (nach Merge auf staging auffindbar). Dein **lebendes Detail-Log bleibt #2423** — diese Datei ist nur die saubere Orientierung + der verifizierte Live-Stand.
>
> **Die EINE Regel, die uns zwei kollisionsfrei hält:** route deine Bucket-2 **Daten-Reads** (Person / Fahrzeug / Gegner / VS) durch **`v_claim_full`** — **nicht** `claims` direkt. Das ist die *Seam*: die Entity-Strecke macht `v_claim_full` später per **einer** View-Def-Migration entity-sourced, **ohne deine Files nochmal anzufassen**. Zeigst du stattdessen auf `claims`-direkt, muss jedes File später re-touched werden. (Nicht-Entity-Felder + ANCHOR-Reads dürfen weiter `claims` sein.) Voll erklärt in **§6 „Seam zur Entity-Strecke"**.
>
> **▶ DER GRUND (Aarons North Star — sonst war die Entity-Arbeit umsonst):** entity-Daten (Person/Fahrzeug/Gegner/Versicherer) **nie flach nach `claims` kopieren** — die gehören in die **Entitäten** (personen/vehicles/versicherungen). Partition: **du ownst claim-native** (status/workflow/refs/dates → `claims`); **Entity ownt entity-bound** (Writer befüllen Entitäten, die View zeigt sie entity-sourced). Speziell **P3-Writer von entity-Daten NICHT flach auf `claims` umlenken** — die gehen via Entity-Writer in die Entitäten (mit Entity abstimmen). Ziel = **one-pass in die finale Heimat, KEIN flat→claims→entity** — sonst ist das flache Modell nur von `faelle` nach `claims` verschoben. **Und Dedup:** entity-Daten laufen durch die *find-or-create*-Entity-Writer → **eine Entität pro realem Mensch/Fahrzeug/Versicherer über alle Claims, KEINE Dupes** (flach-per-Claim würde genau Dupes erzeugen — derselbe Mensch N-mal).
>
> **Wir editieren NIE dasselbe File** — du fährst die per-File-Strecke, ich besitze die View-Quelle + die Entitäten; wir treffen uns in `v_claim_full`. Bei den **Termin-Tabellen** (3-fach-Hotspot) ownt die termin-engine-Session die Konsolidierung — FK-Rekey dort abstimmen (§5/§6).

**Was das ist:** Saubere, von **staging auffindbare** Orientierung für die CMM-49-Strecke (Ziel: `DROP TABLE faelle`, claim = SSoT). Orientiert + verlinkt — ersetzt die in-flight-Detail-Logs **nicht**.

**Lebende Arbeits-Detail-Logs (Bucket-für-Bucket, churnt täglich):**
- **In-flight Detail-Handoff = PR #2423** → `docs/04.06.2026/HANDOFF-cmm49-p2-faelle-retirement.md` (Branch `kitta/cmm49-p2-claim-id-lookups`).
- **Phasen-Plan** → `docs/04.06.2026/cmm49-faelle-retirement-plan.md` (auf staging).
- **Entity-Kontext** → Memory `project_cmm_entity_model.md`.

---

## 0. North Star + Aaron-Entscheidungen (bindend)

- **Ziel:** `DROP TABLE faelle`. **Voller Rewrite, KEIN faelle-View-Shim** (Aaron).
- **04.06: `fall_id` stirbt als DATEN-Key.** Intern überall `claim_id`. `fall_id` überlebt **nur** als URL-Parameter der Bookmark-Route `/faelle/[id]` — aufgelöst via `resolveClaimId` + `faelle_claim_bridge` (die Bridge bleibt **permanent** als reine Route-Key-Map).
- **Harte Richtungsregel:** **NIEMALS `claim_id → fall_id`** (auch nicht über die Bridge) — das hält die Dopplung am Leben. Nur die EINE Richtung `fall_id → claim_id` ist erlaubt, und nur am Route-Eingang (`resolveClaimId`). Reverse-Lookups (ANCHOR-Klasse) verschwinden dadurch von selbst, NICHT per Bridge-Swap „reparieren".
- **KUNDE_ID-Klasse gehört NICHT zu CMM-49** → das ist **CMM-63** (kunde_id → `claims.geschaedigter_user_id` Ownership-Umbau). Hier nicht anfassen.

---

## 1. Live-Stand (verifiziert 04.06., project `paizkjajbuxxksdoycev`)

- `faelle` **78** Rows · `claims` **79** · `faelle_claim_bridge` **78** (1:1 Route-Key-Map, bleibt permanent).
- **Views sind faelle-frei** (live verifiziert — keine View referenziert die `faelle`-Tabelle mehr; 04.06-Migs `v_claim_full_faelle_frei`, `faelle_kunde/sv_view_claims_ankernd`).
- **Noch 39 Tabellen mit FK → `faelle`** = der eigentliche Drop-Blocker. Müssen auf `claim_id` rekeyed werden, dann fall_id-FK droppen, dann `faelle`:
  `abrechnung_positionen, admin_termine, auftraege, email_log, fall_dokumente, fall_read_state, flow_links, forderungspositionen, gutachter_abrechnungen(+positionen), gutachter_finder_anfragen, gutachter_mitteilungen, gutachter_termine, gutschriften, kanzlei_abrechnung_positionen, kanzlei_admin_termine, kanzlei_faelle, kunde_gutachten_requests, leads, makler_fall_consent, makler_provisionen, nachrichten, notification_events, parteien, personenschaden_personen, pflichtdokumente, phase_transitions, qc_checkliste, regulierungs_klassifizierung, reklamationen, schadenspositionen, sla_tracking, sv_live_location, tasks, termine, timeline, webhook_events, whatsapp_inbound_messages, zahlungseingaenge, zahlungspositionen`.
- **Tragende Gleichungen** (Fundament der Repoints): `bridge.fall_id == faelle.id` (0-diff) · `claims.geschaedigter_user_id == faelle.kunde_id` (0-diff). **⚠️ `claims.operative_status ≈ faelle.status` ist NICHT clean** (CMM-49-Finding 04.06., live verifiziert): 77/78 gleich, **1 Backfill-Loch** (op_status NULL bei gesetztem faelle.status, Claim `6f2b9b40…`; `cmm49_backfill_operative_status_gap` hat's verfehlt) + Typ-Diff (`operative_status` text vs `faelle.status` enum `fall_status`). **Vor dem faelle.status-Drop das Loch füllen.**

---

## 2. Was FERTIG ist (nicht nochmal anfassen)

- Entity-Foundation #2395 / #2402 (Memory).
- **#2414 (auf staging):** P0-Migs (bridge `fall_created_at`, operative_status-Backfill) + P1a `v_claim_full` + P1b kunde/sv-view — **nur Migration-Files, KEIN App-Code** (Squash-Drift, s. §4).
- **#2423 (OPEN, in-flight, `kitta/cmm49-p2-claim-id-lookups`):** Re-Land Foundation (`resolveClaimId`-Chokepoint → bridge, Bucket-1a, 3 Migs, `database.types.ts`-Regen) + **P2 Bucket-1 PURE_BRIDGE komplett** (~57 Sites, alle non-aar956): jeder `from('faelle').select('claim_id').eq('id',x)`+Extract → `resolveClaimId(client, x)`. tsc grün, `</content>`-Scan sauber.

---

## 3. Was BLEIBT (Klassifikator-Stand laut #2423; staging trailt bis #2423 merged)

`node scripts/cmm49-classify-faelle-reads.mjs [--list KLASSE]` → **total 379** · PURE_BRIDGE **7** · KUNDE_ID 26 · EMBED 168 · ANCHOR 24 · KEY_OTHER 20 · EXISTENCE 5 · OTHER 77 · WRITER 44.

- **Bucket-1 Rest = 7 PURE_BRIDGE, alle im aar-956-Revier** (`stammdaten.ts`, `flow/[token]/actions.ts`, `gutachter/termine/[id]/actions.ts`, `lib/termine/embed-b-dispatcher-actions.ts`). Transformation trivial (`resolveClaimId`) — nur **Kollisions-Koordination mit aar-956-Session** nötig.
- **KUNDE_ID 26 → CMM-63** (nicht hier). Heterogen: Klassifikator-KUNDE_ID = „select-Liste *enthält* kunde_id", NICHT nur `.eq('kunde_id',u)` — per-Site lesen.
- **Bucket-2 = echte fall-Daten-Reads** (EMBED 168 + ANCHOR 24 + KEY_OTHER 20 + EXISTENCE 5 + OTHER 77): `from('faelle').select('<echte spalten>')` bzw. `claims:claim_id(...)`-Embeds → `from('v_claim_full')` (Key `.eq('fall_id', x)`) bzw. `from('claims')`. ANCHOR (`.eq('claim_id', x)`) → `claims` **direkt** (NICHT über bridge — das wäre Reverse-Lookup, verboten per §0). **Value-preserving Pflicht:** vor dem Dreh prüfen, dass `<tabelle>.claim_id` für die Rows lückenlos backfilled ist (sonst Row-Verlust).
- **P3 Writer 44** (`update/insert/delete faelle`): spiegelt der Sync-Trigger das eh nach claims? → Write streichen. Sonst auf `claims` umlenken (`touchClaimRecency` = Vorbild). Mixed-Writer (core/eskalation-actions/kanzlei-paket/admin-abrechnungen/mietwagen/create-for-fall): Read schon repointet, nur der faelle-Write-Back bleibt.
- **P4 Funktionen/Trigger (~27):** Sync-Maschinerie droppen sobald nichts mehr faelle schreibt/liest; `can_access_fall` → claims; Crons/DSGVO/`delete_fall_komplett`.
- **P5 `DROP TABLE faelle` + Smoke:** erst wenn P1–P4 auf **prod** deployed. Vor Drop: `pg_depend` leer + **ungekappter** `Grep from('faelle')` == 0 + FK-Count == 0 + volle Portal-Smoke (Public+Admin+Kunde+SV). `faelle_claim_bridge` BLEIBT.

---

## 4. Harte Regeln (unverhandelbar)

- **Nur `fall_id → claim_id`**, nie reverse (§0) — auch nicht „elegant" über die Bridge.
- **Pre-Drop ungekappt verifizieren:** `from\(['"]faelle['"]\)` ohne `types.ts` + `pg_depend` + Post-Drop-Smoke. (Incident #2343, `feedback_drop_verification_grep` — getrunkter Grep verzerrt durch `types.ts`.)
- **Squash-Drift:** re-gelandete/gemergte Files **per File-Inhalt** prüfen (`git show --stat <squash>` + `git diff --stat origin/staging <branch>`), NICHT per SHA-Ancestry (`git merge-base --is-ancestor` ist nach Squash irreführend; `feedback_pr_state_nicht_production_stand`).
- **DDL nur via `apply_migration`** (Regel 2), File == getrackte Version. **Nie main; PR gegen staging; nicht selbst mergen.**
- tsc im Worktree: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`.

---

## 5. Koordination (Stand 04.06., viele parallele Sessions)

- **#2423 zuerst prüfen:** `gh pr view 2423 --json state,mergedAt`. MERGED → neuer Branch off `origin/staging`. OPEN → drauf weiter (rebase `origin/staging`).
- **7 PURE_BRIDGE-Rest = aar-956-Revier** → mit aar-956-Sessions abstimmen (Files: stammdaten/flow/gutachter-termine/embed-b-dispatcher).
- **KUNDE_ID = CMM-63** → eigene Strecke, nicht hier.
- **Termin-Tabellen** (`gutachter_termine`/`admin_termine`/`termine`/`kanzlei_admin_termine` haben alle FK→faelle) liegen zusätzlich in der laufenden **assignee/`v_belegung`-Termin-Vereinheitlichung** (termin-engine-Strecke). Bevor du deren faelle-FK rekeyed → mit der Termin-Session abstimmen (sonst doppelte/kollidierende Schema-Arbeit).

---

## 6. Verwandte Strecken (NICHT verwechseln)

- **CMM-49 (DAS hier):** die `faelle`-Tabelle stirbt; alles auf `claims` + `faelle_claim_bridge`.
- **Entity-Model (separat):** globale Entitäten `personen`/`vehicles`/… + Identitäts-Engine. Der Phase-4-Reader-Repoint nutzt **denselben Klassifikator** → **`docs/03.06.2026/cmm-phase4-reader-inventar.md` (PR #2372)** ist die komplementäre faelle-read-Map (4-Slice-Plan; `v_claim_full` = 23 Reader = höchster Hebel, types-bereinigt). Trio additive = #2375. Memory `project_cmm_entity_model.md`.
- **CMM-63:** kunde_id-Ownership-Umbau (die KUNDE_ID-Klasse von oben).

### ▶ Seam zur Entity-Strecke — so kollidieren die zwei Strecken NICHT am File
**`v_claim_full` ist der Vertrag zwischen CMM-49 und Entity.** Konkret:
- **CMM-49 (diese Strecke):** routet Bucket-2 **Daten-Reads** (Person/Fahrzeug/Gegner/VS) durch **`v_claim_full`** statt `claims` direkt. (Nicht-Entity-Felder/ANCHOR dürfen weiter `claims` sein.)
- **Entity-Strecke:** repointet SPÄTER die View-**Definition** von `v_claim_full` auf die Entitäten (`personen`/`vehicles`) — **eine** Migration, berührt **keine** App-Files. Jeder `v_claim_full`-Reader bekommt dann Entity-Daten transparent, **ohne** dass eure per-File-Repoints nochmal angefasst werden.
- **Resultat:** kein per-File-Doppel-Touch. Ihr (CMM-49) lauft die per-File-Marathon-Strecke; Entity besitzt die View-Quelle + die Entitäten; **niemand editiert dasselbe File.** Voraussetzung Entity-Seite (Entitäten befüllt = writer-wiring, supervised/deferred) läuft UNTER euren Reads und **blockt euch nicht**.
- **Termin-Tabellen = 3-fach-Hotspot** (FK→faelle hier + assignee/`v_belegung`-Vereinheitlichung der termin-engine-Strecke + Entity-Call-3 „alles in eine"): **die termin-engine-Session ownt die Termin-Konsolidierung** — CMM-49 stimmt den faelle-FK-Rekey dort ab, Entity-Call-3 faltet sich in deren Richtung ein.

### FK-Ownership-Split + Spalten-Partition (bestätigt 04.06.)
- **Spalten-Partition (gegen Flat-Modell-Recreation, Aaron 04.06. — der eigentliche Sinn der Seam):** **entity-bound** Spalten (Person/Fahrzeug/Gegner/Versicherer) → Entitäten (Entity ownt via Writer + View), **nie flach nach `claims`**; **claim-native** (status/workflow/refs/dates) → `claims` (CMM-49). **P3-Writer von entity-Daten → Entity-Writer** (`ensurePersonForData` etc.; `person_id`-Wiring ist live in `convert-lead-to-claim`/`flow`/`airdrop`), **nicht** flach-`claims`. Diese Writer **dedupen** (find-or-create per kanonischem Key: `ensurePersonForData` via `user_id`+`match_person_candidates`, `ensureVehicleFromFin` upsert-by-FIN, versicherungen/werkstaetten by-id) → **eine Entität pro realem Ding über alle Claims, kein Dupe**. So entsteht weder ein flat→claims→entity-Doppelpass NOCH Dupes; flach-per-Claim-Writes erzeugten beides. Backstop für durchgerutschte Dupes = Identity-Engine (`verified_contacts`/`match_person_candidates`) + read-only Dublettenliste (#2382).
- **Entity ownt das `fall_id`-FK-Retirement von `parteien`** (Legacy → stirbt, ersetzt durch `claim_parties`/`personen`) **+ `personenschaden_personen`** (→ `personen`). CMM-49 fasst diese 2 NICHT an. ⚠️ Sie liegen damit auf dem **kritischen Pfad für den finalen `DROP TABLE faelle`** (FK==0 braucht sie) → Entity sequenziert sie als Phase-5 so, dass sie den Drop nicht blocken; **vor dem finalen Drop mit Entity abstimmen**. Alle übrigen ~38 FK-Tabellen = CMM-49.
- **v_claim_full-Spalten eingefroren (Seam-Vertrag):** beim Entity-Sourcing der View-Def werden bestehende Spalten-Namen + Typen NIE umbenannt/umgetypt — nur additiv. So bleibt jeder CMM-49-Reader gültig.
- **Gegner/VS-Seam (Finding 04.06.):** `gegner_*` ist **schon normalisiert** — KEINE flachen `gegner_name`/`gegner_versicherung_name` (weder claims noch v_claim_full), nur ids/refs, aktuell **data-inert** (0 gegner-Parties / 0 `gegner_versicherung_id`). `halter_*`/`fahrzeug_*`/`kennzeichen` SIND flach (Seam dort sauber). **Plan:** Entity ergänzt flache `gegner_name` (aus `claim_parties` rolle=`verursacher` → `personen`) + `gegner_versicherung_name` (aus `versicherungen` via `gegner_versicherung_id`) additiv in v_claim_full (Phase-4, JOIN-basiert). Bis dahin: gegner-Reader auf die vorhandenen ids/refs routen, **nicht** id→name im App-Code auflösen (Seam wahren).

---

## 7. Pointer (Quick-Start)

| Was | Wo |
|---|---|
| In-flight Detail-Handoff | PR #2423 → `docs/04.06.2026/HANDOFF-cmm49-p2-faelle-retirement.md` |
| Phasen-Plan | `docs/04.06.2026/cmm49-faelle-retirement-plan.md` |
| Chokepoint (DER Bucket-1-Hebel) | `src/lib/claims/get-claim-for-role.ts` → `resolveClaimId(client, fallId)` |
| Klassifikator | `scripts/cmm49-classify-faelle-reads.mjs [--list KLASSE]` |
| Komplementäre faelle-read-Map | #2372 → `docs/03.06.2026/cmm-phase4-reader-inventar.md` |
| Incident-Lehren | `feedback_drop_verification_grep`, `feedback_pr_state_nicht_production_stand` |
