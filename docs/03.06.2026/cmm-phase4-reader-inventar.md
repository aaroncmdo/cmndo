# CMM Entity-Model — Phase 4 Reader-Inventar (READ-ONLY Prep)

**Stand 2026-06-03 EOD. Autor: Phase-4-Prep-Session (Worktree `kitta/cmm-entity-phase4-prep`, off staging @ #2368).**
**Verändert NICHTS** — reine Analyse. Erfüllt den einzigen JETZT-sicheren Schritt aus HANDOFF §9-C (read-only Phase-4-Prep, „Reader-Inventar erstellen") bei heißem aar-939-Hotpath. Schwester-Dokumente: `HANDOFF-identity-writer-wiring-und-entity-reststrecke.md` (Branch `kitta/cmm-identity-slice-b`), `cmm-entity-model-target-spec.md` (#2348), `cmm49-drop-execution-playbook.md`.

> **Warum dieses Doc existiert:** HANDOFF §9-A nennt **Phase 4 (Reader-Repoint) den eigentlichen Konvergenzpunkt der Gesamtstrecke** — nicht den 4.-Prio-Nachklapp. Das Risiko ist, dass die glänzendere Identitäts-Arbeit (Writer-Wiring, §5) als Parallelschicht weiterwächst, während Phase 4 dauerverschoben wird → das Modell konvergiert nie. Dieses Inventar macht Phase 4 **plan- und terminierbar**, damit ein geschütztes ruhiges Fenster sie in klar geschnittenen, verifizierbaren Slices abräumen kann.

---

## 1. `from('faelle')`-Landschaft (Klassifizierer-Histogramm)

Reproduzierbar: `node scripts/cmm49-classify-faelle-reads.mjs [--list KLASSE]` (rein statisch, kein DB-Zugriff).

**Total: 436 `from('faelle')`-Stellen** in `src/**/*.ts(x)` @ staging #2368.

| Klasse | n | Klassifizierer-Regel (exakt) | Phase-4-Disposition |
|---|---:|---|---|
| **PURE_BRIDGE** | 72 | `select('claim_id')` **+** Filter `.eq('id', …)` | 🟢 **Mechanisch codemod-bar** → `resolveClaimId(faelleId)`. Reiner `faelle.id → claim_id`-Lookup, keine Sachdaten. Größter sicherer Sofort-Happen. |
| **EMBED** | 168 | `select` enthält `claims:` / `:claim_id(…)` (FK-Join) | 🔴 **Per-Hand.** Liest Claim-Daten *durch* faelle (nested embed). Koppelt faelle↔claims; Teilmenge ist CMM-63/LP-Embed-gated (bleibt). Größter Brocken. |
| **OTHER** | 77 | Rest (kein erkennbarer Bridge-/Embed-/Key-Shape) | 🟡 Einzelfall-Triage. |
| **KUNDE_ID** | 26 | `select` enthält `kunde_id` | 🟡 An Personen/Kunde-Entity hängen (→ `personen`/`claim_parties.user_id`). |
| **ANCHOR** | 24 | Filter-Key `claim_id` | 🟡 Liest faelle gefiltert nach `claim_id` — meist auf `claims`/View umstellbar. |
| **KEY_OTHER** | 20 | Filter-Key ≠ `id` und ≠ `claim_id` | 🟡 Einzelfall (z. B. Filter nach Geschäftsfeld-Spalte). |
| **EXISTENCE** | 5 | `select('id')` (Existenz-Check) | 🟢 Trivial / oft entfernbar. |

**Erwartungs-Korrektur:** Phase 4 eliminiert **nicht** alle 436 faelle-Reads. EMBED (168 ≈ 38 %) + ein Teil von OTHER bleiben bewusst (Claims-Embed / CMM-63-gated / LP-Embed). Konvergenz-Ziel = die **flachen Entitäts-Felder** (Person/Fahrzeug/Gegner/VS) auf die globalen Entitäten umzuleiten, nicht 100 % faelle-Reads zu töten.

---

## 2. Entitäts-spezifische Reader-Oberfläche (die echten Phase-4-Repoint-Ziele)

Counts `types.ts`-bereinigt (Lehre `feedback_drop_verification_grep`: generierte Types verzerren rohe Greps — `v_claim_full` roh = 133 Hits, real = **23 Reader-Files**).

### 2.1 `v_claim_full` — **23 Reader-Files** (höchster Hebel) 🎯
Repoint der **View-Definition** (Person/Fahrzeug-Spalten aus `personen`/`vehicles`/Links statt flach aus faelle/claim_parties) ⇒ alle 23 Consumer bekommen Entitäts-Daten **ohne Code-Change**. **Verifizieren:** exponiert `v_claim_full` heute die flachen Person-/Fahrzeug-Felder, die wir umhängen wollen? (View-Def via `pg_get_viewdef` lesen, NICHT raten.)

Reader: `admin/statistiken`, `admin/team{,/leaderboard,/[id]}`, 6 Crons (`pflichtdokumente-reminder`, `re-termin-eskalation`, `sa-reminder`, `vollmacht-reminder`, `vs-korrespondenz-review`, `vs-timer`), `dispatch/leads/[id]` (+`_actions/bkat-inference`,`kunden-match`,`stammdaten`), `flow/[token]/actions`, `mitarbeiter/{faelle,isochrone,nachrichten,performance,reklamationen,page}`, `lib/claims/{get-claim-for-role,get-kunde-faelle}`.

### 2.2 `claim_parties` — **13 Files / 23 Hits** (Person-Felder → `personen`)
Träger der flachen Person-Felder, die `personen` ablöst. Repoint-Kandidaten (echte Consumer, Tests/Personen-Lib ausgenommen):
`dispatch/leads/[id]/_actions/sv-termin`, `flow/[token]/actions`, `gutachter/heute/page`, `lib/airdrop/server-actions`, `lib/claims/{get-kunde-faelle,kunde-ownership,owned-claims}`, `lib/faelle/kb-assignment`, `lib/leads/convert-lead-to-claim`.
Bereits Entity-aware (slice-B-Fundament): `lib/personen/{ensure-person,confirm-orphan-match}` (+2 Tests).

### 2.3 `parteien` — **5 Files / 7 Hits** (Legacy-Tabelle, **stirbt**)
`admin/kanzlei-board/page`, `api/pdf/kanzlei-paket/[id]/route`, `gutachter/fall/[id]/page`, `lib/email/google/flows`, `lib/termine/get-by-token`.
Kleinste Oberfläche → erst diese 5 auf `claim_parties`/`personen` umstellen, dann `parteien` Phase-5-droppen.

### 2.4 Ziel-Entitäten (schon gelesen)
`personen` 5 Files / 16 Hits · `vehicles` 8 Files / 12 Hits. Wachsen mit jedem Repoint.

---

## 3. Empfohlene Phase-4-Slicing (für das geschützte ruhige Fenster)

Jeder Slice = eigener PR gegen staging, supervised, mit Smoke. Reihenfolge nach Risiko/Hebel:

1. **Slice 4a — PURE_BRIDGE-Codemod (72):** `from('faelle').select('claim_id').eq('id', x)` → `resolveClaimId(x)`. Mechanisch, keine Sachdaten, hoher Count/geringes Risiko. Idealer Einstieg.
2. **Slice 4b — `v_claim_full`-View-Repoint (entsperrt 23 Reader auf einen Schlag):** View-Def auf Entitäts-Quellen umhängen, Consumer unverändert. **Gate:** View-Def + Spalten-Mapping zuerst verifizieren.
3. **Slice 4c — `claim_parties`-Person-Felder → `personen` (8 echte Consumer):** Reader auf `personen` (via Link) umstellen. **Gate §13-D:** NICHT bevor `personen` die *bestätigte* Lese-Quelle der Match-Engine ist.
4. **Slice 4d — `parteien`-Retirement (5 Files):** auf `claim_parties`/`personen` umstellen → dann Phase-5-Drop von `parteien`.
5. **EMBED (168) + OTHER (77):** Einzelfall-Triage, größtenteils nach 4a–4d; CMM-63/LP-Embed-gated bleibt.

Danach **Phase 5 (Flat-Drop):** `claim_parties`-Personfelder, `parteien`-Tabelle, faelle-Spalten — Pre-Drop-Verify **ungekappt** Pflicht + Post-Drop-Smoke (Public+Admin+Kunde+SV).

---

## 4. Gates / Constraints (unverhandelbar)

- **§13-D:** `personen` muss bestätigte Lese-Quelle der Match-Engine sein, BEVOR flache Person-Felder gedroppt werden.
- **§2-Invariante:** kein Access-Check je auf `person_id` — Zugriff immer `user_id`/Party-Membership.
- **Pre-Drop ungekappt verifizieren** (`from\(['"]<obj>['"]\)` ohne types.ts) + DB-Dependency-Check + Post-Drop-Smoke (`feedback_drop_verification_grep`, Incident #2343).
- **`faelle.id ≠ claims.id`** — Route-Key via `faelle_claim_bridge` / `resolveClaimId`.
- **DDL nur via `apply_migration`** (Regel 2); File == getrackte Version. Nie main; PR gegen staging; nicht selbst mergen.
- **Phase-4-Execution = SUPERVISED** im ruhigen aar-939-Fenster (Hotpath-Lehre 03.06.).

---

## 5. Offene Aaron-Entscheidungen (gaten Phase-3-Reste, NICHT Phase 4)

Aus HANDOFF §3/§9-D — Berater-Empfehlung jeweils additiv/risikoarm:
- `vehicles.fin` **NULLABLE** → entsperrt Gegner-Fahrzeug (oft nur Kennzeichen).
- `claim_parties.rolle`-CHECK **+`'halter'`** → reiner Halter (Leasing/Firma ≠ Geschädigter).
- `repairs.claim_id` **NULLABLE** → „nur normale Reparatur" ohne Claim.
- Größer/später: Ansprechpartner-Verdrahtung · Admin-Merge-Tool · #8 Termin-Tabellen-Konsolidierung.

---

## 6. Nächster Schritt

**Aktiv ein ruhiges aar-939-Fenster für Phase 4 schützen** (§9-A). Einstieg = Slice 4a (PURE_BRIDGE-Codemod, niedrigstes Risiko). Davor: `v_claim_full`-View-Def lesen (Slice-4b-Gate). Identitäts-Arbeit (Writer-Wiring, §5) darf die Wartezeit füllen — aber Phase 4 ist das Ziel, nicht der Nachklapp.
