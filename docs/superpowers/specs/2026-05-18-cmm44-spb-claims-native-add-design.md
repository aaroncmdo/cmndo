# CMM-44 SP-B — Claims-native ADD (64 `faelle`-Spalten → `claims`)

**Datum:** 2026-05-18 · **Status:** Design — abgestimmt
**Master:** CMM-44 (Claim-SSoT-Vollmigration / `faelle`-Drop)
**Strategie:** `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` §4 (Phasen 3–4)
**Dekomposition:** `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` (Sub-Projekt SP-B)
**Muster-Vorlage:** SP-A2 (`docs/superpowers/specs/2026-05-17-cmm44-spa2-semantik-duplikate-design.md`), SP-A3 (additive Views)
**Branch:** `kitta/cmm-44-spb`
**Live-Messung:** `scripts/cmm44-spb-measure.sql` (Prod-DB, 2026-05-18)

---

## 1 · Ziel & Scope

SP-B bringt die **64 claim-globalen `faelle`-Spalten** (Phase-1-Verdikt `CLAIMS`) auf die SSoT-Tabelle `claims` und stellt alle Leser **und** Schreiber von `faelle` auf `claims` um.

**Anders als SP-A/A2/A3:** Die waren *Drop*-Projekte — sie entfernten DUP-Spalten, deren `claims`-Gegenstück bereits existierte. SP-B ist **rein additiv**: die 64 Spalten haben *kein* `claims`-Gegenstück und müssen dort erst *angelegt* werden. Die `faelle`-Originale bleiben stehen und sterben — wie die Strategie es vorsieht — gesammelt mit `DROP TABLE faelle CASCADE` in Phase 6 (Sub-Projekt SP-L).

### In Scope
- 64× `ADD COLUMN` auf `claims` — Typ/Default/NOT-NULL exakt von `faelle` gespiegelt.
- Backfill `claims` aus `faelle` (Initial in PR1 + Catch-up in PR3).
- Reader- **und** Writer-Sweep der 64 Spalten von `faelle` auf `claims`.
- Additive Ergänzung der `v_claim_*`-Views, soweit Reader der 64 Spalten über Views gehen.

### Out of Scope
- **`DROP COLUMN faelle.<col>`** — bewusst *nicht* in SP-B (Begründung §3). Die 64 `faelle`-Spalten fallen gesammelt mit `DROP TABLE faelle` in Phase 6 / SP-L.
- Die TBD-Einzelfälle mit vermuteter Heimat `claims` (`dispatch_id`, `organisation_id`, `kunde_lat/lng`, `lead_preis_*`, `marketing_*`, `source_channel`) — ihr Verdikt braucht je einen Reader-/Vertikal-Audit (Phase-1 §6 „TBD nicht raten"); manche gehören evtl. zu `leads` oder sind DROP. Eigene Klärung.
- Alle DUP/MOVE-Spalten → SP-C..L.

## 2 · Ausgangslage (Live-DB, 2026-05-18)

Gemessen mit `scripts/cmm44-spb-measure.sql` gegen die Prod-DB:

- `faelle` = **278 Spalten**, `claims` = **82 Spalten**. Nach SP-B: `claims` = 146.
- **Alle 64 Spalten auf `faelle` vorhanden, 0 Kollisionen auf `claims`** — die Prämisse „noch nicht auf claims" hält vollständig.
- **Kein `faelle`↔`claims`-Vollspalten-Sync-Trigger mehr** (SP-A hat das Paar gedroppt — per Live-Trigger-Messung bestätigt). Übrig ist nur das CMM-60-`sv_id`-Paar (`trg_sync_faelle_sv_id_to_claims` / `trg_sync_claims_sv_id_to_faelle`) — keine SP-B-Spalte betroffen. **Folge:** SP-B pflegt keinen Trigger, aber jeder Writer muss direkt `claims` treffen — es propagiert nichts.

### Schema-Besonderheiten
- **2 Enum-Spalten:** `betreuungspaket` (Typ `betreuungspaket`), `bkat_unfallart` (Typ `bkat_unfallart`). Enum-Typen existieren global → `ADD COLUMN` direkt, keine Typ-Anlage nötig.
- **5 NOT-NULL-Spalten — alle mit Default:** `service_typ`, `kundenbetreuer_fallback_flag`, `mietwagen_rechnung_vorhanden`, `mietwagen_argumentations_puffer`, `zeugen_vorhanden`. `ADD COLUMN … NOT NULL DEFAULT …` füllt die 30 Bestands-Claims atomar — kein NULL-Verstoß.
- **18 Spalten mit explizitem Default** (Tabellen unten) — auf `claims` mitzuspiegeln.

### Die 64 Spalten — gruppiert nach PR2-Cluster

**PR2a — Workflow/Status + Zuweisung + Herkunft (27):**

| Spalte | Typ (`udt`) | NULL | Default |
|---|---|---|---|
| `makler_id` | uuid | YES | — |
| `betreuungspaket` | betreuungspaket *(enum)* | YES | `'vollservice'` |
| `notizen` | text | YES | — |
| `prioritaet` | text | YES | `'normal'` |
| `onboarding_complete` | bool | YES | `false` |
| `status_changed_at` | timestamptz | YES | `now()` |
| `google_review_gesendet` | bool | YES | `false` |
| `datenschutz_akzeptiert` | bool | YES | `false` |
| `datenschutz_akzeptiert_am` | timestamptz | YES | — |
| `interne_notizen` | text | YES | — |
| `ist_aktiv` | bool | YES | `true` |
| `deaktiviert_am` | timestamptz | YES | — |
| `deaktiviert_grund` | text | YES | — |
| `deaktiviert_notiz` | text | YES | — |
| `szenario` | text | YES | `'normalfall'` |
| `service_typ` | text | **NO** | `'komplett'` |
| `geschlossen_grund` | text | YES | — |
| `bevorzugter_kanal` | text | YES | — |
| `sprache` | text | YES | `'de'` |
| `fallakte_angelegt_am` | timestamptz | YES | — |
| `google_review_prompt_gezeigt_am` | timestamptz | YES | — |
| `sv_zugewiesen_am` | timestamptz | YES | — |
| `kundenbetreuer_fallback_flag` | bool | **NO** | `false` |
| `kundenbetreuer_zugewiesen_am` | timestamptz | YES | — |
| `eskaliert_an_admin_id` | uuid | YES | — |
| `eskaliert_am` | timestamptz | YES | — |
| `eskaliert_grund` | text | YES | — |

**PR2b — Dokumente / SA / Vollmacht (13):**

| Spalte | Typ (`udt`) | NULL | Default |
|---|---|---|---|
| `abtretung_pdf` | text | YES | — |
| `vollmacht_pdf` | text | YES | — |
| `abtretung_signiert_am` | timestamptz | YES | — |
| `vollmacht_signiert_am` | timestamptz | YES | — |
| `sa_unterschrieben` | bool | YES | `false` |
| `sa_unterschrieben_am` | timestamptz | YES | — |
| `sa_pdf_url` | text | YES | — |
| `sa_unterschrift_url` | text | YES | — |
| `vollmacht_status` | text | YES | `'ausstehend'` |
| `vollmacht_geprueft_am` | timestamptz | YES | — |
| `vollmacht_geprueft_von` | text | YES | — |
| `vollmacht_pruefung_status` | text | YES | — |
| `vollmacht_pruefung_begruendung` | text | YES | — |

**PR2c — Mietwagen + Unfall-Rest + Fahrzeug-Schaden + Abrechnungsart + Reminder + Einzel (24):**

| Spalte | Typ (`udt`) | NULL | Default |
|---|---|---|---|
| `mietwagen_seit_datum` | date | YES | — |
| `mietwagen_limit_tage` | int4 | YES | — |
| `mietwagen_limit_grund` | text | YES | — |
| `mietwagen_rechnung_vorhanden` | bool | **NO** | `false` |
| `mietwagen_rechnung_url` | text | YES | — |
| `mietwagen_argumentations_puffer` | int4 | **NO** | `3` |
| `mietwagen_vermieter` | text | YES | — |
| `schadens_hoehe_netto` | numeric | YES | — |
| `schadens_ursache` | text | YES | — |
| `zeugen_vorhanden` | bool | **NO** | `false` |
| `bkat_unfallart` | bkat_unfallart *(enum)* | YES | — |
| `werkstatt_seit_datum` | date | YES | — |
| `fahrzeug_fahrbereit` | bool | YES | — |
| `fahrzeugschaden_beschreibung` | text | YES | — |
| `abrechnungsart_besprochen` | text | YES | — |
| `abrechnungsart_notiz` | text | YES | — |
| `abrechnungsart_besprochen_am` | timestamptz | YES | — |
| `unfallmitteilung_status` | text | YES | `'nicht_erforderlich'` |
| `dokumente_vollstaendig_fuer_phase` | text | YES | — |
| `dokumente_vollstaendig_am_phase` | timestamptz | YES | — |
| `dokumente_reminder_whatsapp_letzte_sendung` | timestamptz | YES | — |
| `zb1_status` | text | YES | — |
| `kanzlei_ansprechpartner_position` | text | YES | — |
| `leasinggeber_informiert` | bool | YES | `false` |

> Cluster-Grenzen folgen den Phase-1-Domänen; sie sind die PR2-Schnittlinien (§4). Die genaue Datei-Inventur pro Cluster ist ein Plan-Schritt (§4 PR2).

## 3 · Architektur-Entscheidung — kein per-Spalten-Drop in SP-B

Die Strategie §4 ist eindeutig: `faelle` stirbt **einmal, ganz, am Ende** — Phase 6 `DROP TABLE faelle CASCADE`. Es gibt **kein** `DROP COLUMN faelle` pro Sub-Projekt im Strategie-Modell. Leitprinzip wörtlich: „claims-first, faelle stirbt zuletzt … dann `faelle` DROP. Kein Big-Bang."

**Warum SP-A/A2/A3 trotzdem gedroppt haben** — und warum das SP-B *nicht* betrifft: Das waren reine **Duplikat**-Cleanups. Eine DUP-Spalte liegt auf `faelle` *und* `claims`, vom Sync-Trigger gleichgehalten. SP-A hat das Sync-Trigger-Paar gedroppt → die DUP-Spalten auf `faelle` waren danach entkoppelte Dubletten = genau der „Zwitter-Zustand", den Strategie §1 weghaben will. Sie *mussten* weg. Das ist ein Sonderfall der DUP-Klasse.

**SP-Bs 64 Spalten sind keine Duplikate** — nie im Sync-Trigger, kein `claims`-Gegenstück. Nach ADD + Sweep sind sie schlicht tote `faelle`-Spalten ohne Drift-Partner. Sie sterben per `DROP TABLE` in Phase 6 — exakt wie die Strategie es vorsieht.

**Konsequenz — SP-B ist additiv, kein destruktives DDL:**
- Keine `DROP COLUMN`-Migration → die AAR-599-Sequencing-Gefahr (destruktive Migration läuft Code voraus) entfällt vollständig.
- Kein Dependency-Audit (`pg_depend` / `pg_proc.prosrc` / Trigger-Funktions-Bodies). Diese Abhängigkeiten räumt `DROP TABLE … CASCADE` in Phase 6 gebündelt ab. SP-As „Lektion a" war ein Fast-Prod-RLS-Lockout aus genau so einem Audit — diesen Aufwand + dieses Risiko spart SP-B sich.

## 4 · PR-Struktur

3 Stufen: **PR1** (additive Migration) → **PR2a/b/c** (Code-Sweep) → **PR3** (Catch-up-Backfill, additive Migration). Kein PR enthält destruktives DDL.

### PR1 — ADD-Migration (additiv)

Eine CLI-Migration (`npx supabase migration new`), `BEGIN/COMMIT`:

1. **64× `ALTER TABLE public.claims ADD COLUMN`** — Typ/Default/NOT-NULL exakt von `faelle` gespiegelt. Die `ADD COLUMN`-Statements werden **deterministisch aus `pg_catalog` generiert** (Generator-Script, Muster `scripts/_build-spa2-views.mjs`) — kein Hand-Abtippen der 64 Definitionen.
   - Enum-Spalten (`betreuungspaket`, `bkat_unfallart`): Typen existieren → direkter ADD.
   - Die 5 NOT-NULL-Spalten: `ADD COLUMN … NOT NULL DEFAULT …` (Default deckt die 30 Bestands-Claims atomar).
2. **Initial-Backfill:** `UPDATE public.claims c SET <col> = f.<col> FROM public.faelle f WHERE f.claim_id = c.id` für alle 64 Spalten. **Pflicht** — die PR2-Reader lesen danach `claims`; ohne Backfill sähen sie NULL.
3. **`v_claim_*`-Views additiv ergänzen**, soweit Reader der 64 Spalten über Views gehen (analog SP-A3 PR1). Welche Spalten view-gelesen werden, ermittelt die Plan-Inventur — sind es 0, entfällt dieser Schritt.

Additiv, nicht brechend, jederzeit sicher applizierbar. `types regen` nach PR1 (`claims`-Typen wachsen um 64 Felder → `database.types.ts`, damit PR2-Code `claims.<col>` referenzieren kann).

### PR2 — Reader/Writer-Sweep (code-only, gechunkt)

Kein DDL. Alle `faelle`-seitigen Reads **und** Writes der 64 Spalten → `claims`. **Schlüssel:** kein Sync-Trigger → ein übersehener Writer auf `faelle` führt zu stiller `claims`-Staleness (Datenverlust droht nicht — `faelle` behält den Wert bis Phase 6).

Gechunkt nach Domänen-Cluster (§2), je einzeln reviewbar / deploybar / smoke-bar:
- **PR2a** — Workflow/Status + Zuweisung + Herkunft (27 Spalten)
- **PR2b** — Dokumente/SA/Vollmacht (13 Spalten)
- **PR2c** — Mietwagen + Unfall-Rest + Fahrzeug-Schaden + Abrechnungsart + Reminder + Einzel (24 Spalten)

PR2a/b/c sind untereinander unabhängig (disjunkte Spaltenmengen) → parallelisierbar. Vorgehen je PR:
1. **Inventur pro Spalte** — `grep` jedes Cluster-Spaltennamens in `src/`; pro Call-Site klären: `.from('faelle')`, `v_*`-View oder `select('faelle(...)')`-Join? (Muster: SP-A2-Plan-Inventur.)
2. **Reads umstellen** — `faelle.<col>` → `claims.<col>` (gleicher Name, andere Tabelle). Reader-Quelle dem bestehenden Portal-Pattern folgen (`claims` direkt vs. `v_claim_*`-View) — kein neuer View-Typ.
3. **Writes umstellen** — `.from('faelle').update/insert({<col>})` → `claims`. Jeder Write muss direkt `claims` treffen.
4. **CMM-48-Abgleich** — Writer, die im `cmm-48-writer-stellen-audit.md` stehen, im PR-Commit-Body markieren, damit CMM-48 sie nicht erneut migriert.
5. **Verifikation** — `npm run build` grün (Routen/Server-Actions betroffen → voller Build); Re-Grep pro Spaltenname einzeln = 0 `faelle`-seitige Treffer; Portal-Smoke.

Finale Chunk-Grenzen + Datei-Inventur = Plan-Schritt. Falls ein Cluster zu viele Files für einen Review trägt, im Plan feiner schneiden.

### PR3 — Catch-up-Backfill (additive Migration)

Eine kleine CLI-Migration, **kein Drop** — eine reine `UPDATE`-Migration:
`UPDATE public.claims c SET <col> = f.<col> FROM public.faelle f WHERE f.claim_id = c.id` für die 64 Spalten, angewendet **nachdem PR2a/b/c auf `main` sind**. Fängt `faelle`-Writes, die im Fenster zwischen PR1-Backfill und PR2-Writer-Deploy noch auf `faelle` liefen. Idempotent, additiv, ohne Zeitdruck (`faelle` behält die Daten bis Phase 6).

### Sequencing

PR1 (additiv) jederzeit applizierbar. PR2a/b/c → `staging` → `main`-Release. PR3 nach PR2-`main`-Release. Kein destruktives DDL → die strenge „Migration darf Code nicht vorauslaufen"-Sequenzierung von SP-A/A2/A3 entfällt; PR3 ist additiv und unkritisch.

## 5 · Migrations-Vorgehen (bewährt aus SP-A2/A3)

1. Vor jeder Migration Live-DB messen (`information_schema`) — Fremd-Drift (`feedback_information_schema_check`).
2. Migrationen in `BEGIN/COMMIT`; vor dem Apply Dry-Run (`BEGIN; … ROLLBACK;`).
3. Apply via `npx supabase db query --linked --file <sql>` + `npx supabase migration repair --status applied <version>` — **kein** `db push`.
4. `information_schema`-Verify nach jedem Schritt; `types regen` nach PR1.
5. AGENTS.md Regel 2 (DDL nur CLI) + Regel 3 (kein unbegleiteter Stash).

## 6 · Tests & Erfolgskriterium

Portal-Smoke auf 5 Portalen (Public / Admin / Dispatch / SV / Kunde) mit Screenshots nach jedem PR2-Chunk und nach PR3 — alle betroffenen UI-Werte (Fallakte-Blöcke, Status, Mietwagen, Vollmacht/SA, Eskalation) unverändert. Smoke-Skript analog `scripts/smoke-cmm44-spa2-pr2.mjs`.

**Erfolg, wenn:**
- `information_schema.columns` zeigt alle 64 Spalten auf `claims`.
- `git grep` jedes der 64 Spaltennamen → 0 `faelle`-seitige Reads/Writes in `src/` (pro Namen einzeln geprüft).
- `npm run build` grün.
- Portal-Smoke: 0 Hard-Fails; jeder datenabhängige Block erscheint mit unverändertem Wert.

## 7 · Risiken

| Risiko | Mitigation |
|---|---|
| Dynamische `fall[feld]`-Reads, die `grep` nicht fängt | Portal-Smoke auf allen 5 Portalen, nicht nur Grep |
| Writer übersehen → `claims`-Staleness (kein Sync-Trigger) | Re-Grep pro Spaltenname einzeln + Smoke; PR3-Catch-up-Backfill heilt Reste |
| Reader liest über `v_claim_*`-View, die die SP-B-Spalte nicht führt | PR1 ergänzt die Views additiv (Inventur im Plan) |
| Staleness-Fenster PR1-Backfill → PR2-Writer-Deploy | PR3-Catch-up-Backfill; pre-launch (30 Test-Fälle) ohnehin gering |
| Fremd-Drift (Parallel-Sessions droppen/ändern `faelle`) | `information_schema` live direkt vor PR1 nachmessen |
| NOT-NULL-Spalte: Backfill schreibt NULL in NOT-NULL-`claims`-Spalte | Die 5 Spalten sind auch `faelle`-seitig NOT NULL → nie NULL; `claims`-Zeilen ohne `faelle`-Partner behalten den ADD-Default |
| PR2-Chunk zu groß für einen Review | Plan schneidet bei zu hoher Datei-Zahl feiner |

---

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
