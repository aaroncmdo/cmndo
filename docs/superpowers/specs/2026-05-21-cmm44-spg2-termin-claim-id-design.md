# CMM-44 SP-G2 — gutachter_termine.claim_id als faelle-entkoppelte SSoT

**Datum:** 2026-05-21
**Sub-Projekt:** CMM-44 SP-G2 (Phase-2-proper, gutachter_termine)
**Master:** docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md
**Vorgaenger:** CMM-58 (Migration 20260516141502, PR #1385/#1389 — Struktur gelegt)

---

## 1 · Kontext

`gutachter_termine` ist die Termin-Sub-Tabelle (1:N pro Claim) der Claim-SSoT-Architektur.
CMM-58 hat die **strukturelle Grundlage** bereits gelegt und ist auf staging + main live:

- `ADD COLUMN claim_id uuid REFERENCES claims(id) ON DELETE SET NULL` (nullable — 12 von 18
  Rows waren beim Backfill `fall_id = NULL`, claim-lose Admin-/Konfrontations-Termine).
- `CREATE INDEX idx_gutachter_termine_claim_id`.
- Einmal-Backfill `claim_id = faelle.claim_id` ueber `fall_id`.
- Trigger `sync_gutachter_termine_claim_id` (`BEFORE INSERT OR UPDATE OF fall_id`,
  SECURITY DEFINER): leitet `claim_id` aus `fall_id` ab, indem er **`faelle` liest**.

CMM-58 hat explizit deferred (Zitat Migration-Header): *"Die Reader/Writer-Migration und die
View-Anpassung (`v_faelle_mit_aktuellem_termin`) folgen als eigener Schritt (Phase 2)."*

**Das ist SP-G2.** Es schliesst die in CMM-58 offen gelassene Phase-2-Arbeit ab.

### Das Kernproblem

CMM-58s Trigger liest `faelle`. In CMM-44 Phase 6 wird `faelle` per `DROP TABLE` entfernt.
Solange `claim_id` ueber den faelle-lesenden Trigger befuellt wird, ist `gutachter_termine`
**nicht Phase-6-ready**: der Trigger (und der View-Join via `fall_id`) bricht beim faelle-Drop.

SP-G2 macht `claim_id` **writer-getragen** und entfernt jede `faelle`-Abhaengigkeit aus dem
Termin-Schreib-/Lesepfad.

---

## 2 · Entscheidung (mit Aaron, 2026-05-21)

**Option B — Trigger jetzt umverdrahten.** Writer setzen `claim_id` selbst; CMM-58s
faelle-lesender Ableitungs-Trigger faellt weg. Bewusst aggressiver als „nur Reader/View",
weil es `gutachter_termine` jetzt Phase-6-ready macht statt die faelle-Kopplung in Phase 5/6
mitzuschleppen.

**Safety-Net: Validierungs-Trigger mit RAISE.** Nach Drop des Ableitungs-Triggers gibt es keine
faelle-freie Quelle, aus der `claim_id` abgeleitet werden koennte — die einzige Absicherung
gegen einen vergessenen Writer ist *fail-loud*. Ein schlanker Trigger wirft `RAISE EXCEPTION`
**nur** bei `fall_id IS NOT NULL AND claim_id IS NULL`. Macht stilles Daten-Drift zu einem
sofortigen, sichtbaren Fehler; claim-lose Termine (`fall_id IS NULL`) bleiben unberuehrt; liest
`faelle` **nicht**.

---

## 3 · Scope

### 3.1 Writer (PR1)

Genau die Schreibpfade, die `claim_id` befuellen muessen. **Nur INSERTs** sind relevant — der
paren-balanced Sweep hat **keine** `UPDATE OF fall_id`-Re-Link-Pfade auf `gutachter_termine`
gefunden, d.h. es gibt keine Stelle, die `fall_id` nachtraeglich aendert (und damit `claim_id`
stale machen koennte). Status-/Reminder-Updates (`reminder_sent_at`, `status`, …) schreiben auf
eine Row, die `claim_id` bereits traegt → nicht betroffen.

Bekannte INSERT-Sites (PR1 verifiziert die Vollstaendigkeit per exhaustivem paren-balanced
Sweep, dynamische Writes eingeschlossen — SP-B-Lesson):

| Site | Art | claim_id-Quelle |
|---|---|---|
| `src/lib/termine/kb-booking.ts:152` | **Prod-Booking** | aus Fall/Claim-Kontext (hat `fallId`) |
| `src/app/kunde/re-termin/[token]/actions.ts:69` | Prod (Re-Termin) | vom Ursprungs-Termin (traegt `claim_id`) |
| `src/app/api/admin/create-test-fall/route.ts:163` | Test | aus erzeugtem Claim |
| `src/app/api/seed-testdata/route.ts:617` | Seed | aus erzeugtem Claim |
| `src/lib/smoke/lifecycle-seed.ts:277` | Smoke | aus erzeugtem Claim |

Zusaetzlich im Sweep zu pruefen (moegliche Slot-/Spontan-/Gegenvorschlag-Inserts):
`src/app/dispatch/kalender/_actions/spontan.ts`, `src/lib/termine/sv-gegenvorschlag.ts`,
`src/lib/termine/kb-slots.ts`, `src/lib/termine/slot-grid.ts`.

**Regel:** Jeder INSERT, der `fall_id` setzt, setzt zusaetzlich `claim_id` explizit. Inserts ohne
`fall_id` (claim-native Termine) setzen `claim_id` direkt aus dem Claim-Kontext. Inserts ohne
jeden Claim-Bezug (reine Admin-/Konfrontations-Termine) lassen beide NULL — legitim.

Waehrend PR1 ist der CMM-58-Trigger **noch aktiv**: setzt ein Writer `fall_id`, ueberschreibt
der Trigger `claim_id` ohnehin mit `faelle.claim_id` (belt-and-suspenders). PR1 ist damit
**verhaltensneutral und voll rueckwaertskompatibel** — claim_id bleibt korrekt, egal ob der
Writer es schon setzt oder nicht.

### 3.2 Reader (PR1)

**Eng abgegrenzt:** Nur Reader, die termin→**claim** aufloesen (heute via
`gt.fall_id` → `faelle.claim_id`), werden auf `gt.claim_id` direkt umgestellt.

**Nicht betroffen** (bleibt `fall_id`, stirbt erst in Phase 6): fall-skopierte Reads —
Timeline-Inserts (`timeline.fall_id`), Fall-Page-Links, Notifications die per Fall keyen,
`fall_id`-Selects fuer reine Fall-Zuordnung. `fall_id` bleibt bis Phase 6 eine gueltige Spalte;
SP-G2 reisst sie **nicht** flaechig heraus (YAGNI, kein Over-Scope).

### 3.3 Views (PR2)

**Zwei** Views koppeln den Termin→Claim-Pfad an `faelle` (live bestaetigt 2026-05-21) — beide
werden re-keyed:

1. **`v_faelle_mit_aktuellem_termin`**: der LATERAL-Join `WHERE gt.fall_id = f.id` wird auf
   `gt.claim_id = c.id` umgestellt (`c` = bereits vorhandener `claims`-Alias:
   `LEFT JOIN claims c ON c.id = f.claim_id`). Funktional heute identisch, da der CMM-58-Backfill
   `gt.claim_id = faelle.claim_id` gesetzt hat. Output-Typen stabil halten → **Precision-Casts**
   wo noetig (SP-G-Lesson, Fehlercode `42P16`).
2. **`v_claim_timeline`**: der Termin-UNION-Branch lautet heute
   `… f.claim_id … FROM gutachter_termine gt JOIN faelle f ON f.id = gt.fall_id WHERE f.claim_id IS NOT NULL`.
   Umstellen auf `… gt.claim_id … FROM gutachter_termine gt WHERE gt.claim_id IS NOT NULL` (den
   `JOIN faelle` in genau diesem Branch entfernen). `gt.claim_id` und `f.claim_id` sind beide
   `uuid` → keine Typ-/Precision-Frage. Verhaltensidentisch (die 12 claim-losen Termine waren
   schon vorher ausgeschlossen). **Nur dieser eine Branch** — die uebrigen `JOIN faelle`-Branches
   von `v_claim_timeline` gehoeren anderen Sub-Projekten/Phase 6, nicht SP-G2.

Beide Views bleiben ansonsten `faelle`-gestuetzt — die vollstaendige claim-native Neufassung ist
Phase-4/6-Arbeit, **nicht** SP-G2. SP-G2 entfernt nur die *Termin*-Kopplung an `faelle`.

### 3.4 Trigger (PR2)

- `DROP TRIGGER trg_sync_gutachter_termine_claim_id ON gutachter_termine`
- `DROP FUNCTION sync_gutachter_termine_claim_id()`
- **Neu:** `validate_gutachter_termine_claim_id()` (`BEFORE INSERT OR UPDATE OF fall_id, claim_id`),
  wirft `RAISE EXCEPTION` nur bei `NEW.fall_id IS NOT NULL AND NEW.claim_id IS NULL`. Liest faelle
  nicht. SECURITY DEFINER nicht noetig (kein Cross-Table-Read). **Scope-Begruendung:** `OF fall_id,
  claim_id` statt aller Spalten — der Trigger feuert nur, wenn einer der beiden FK-Werte
  geschrieben wird (jeder INSERT, plus jedes UPDATE das fall_id/claim_id im SET hat). Status-/
  Reminder-Updates (die Masse der Writes) loesen ihn nicht aus; ein evtl. spaeter driftender Row
  bricht damit kein unbezogenes UPDATE in Prod. Die FK-Integritaet (`claim_id REFERENCES claims`)
  uebernimmt der Constraint, nicht der Trigger.

**Korrektheits-Annahme — live bestaetigt (2026-05-21):** Jeder `faelle`-Row mit gesetztem Bezug
hat `claim_id` (claims = SSoT, CMM-60 abgeschlossen). Live-Messung: 43 faelle, **0** mit
`claim_id` NULL; **0** doppelte `claim_id` (1:1); **0** RAISE-Trap-Rows (`fall_id` gesetzt +
aufgeloestes `faelle.claim_id` NULL); **0** aktuelle Verstoesse; 18 Termine (12 claim-los mit
`fall_id` NULL, 6 fall-verknuepft — alle mit `claim_id`). Damit impliziert ein gesetztes `fall_id`
ein gesetztes `claim_id` — die RAISE-Bedingung feuert nur bei echtem Writer-Bug, nicht bei
legitimen Daten, und der View-Re-Key (`gt.fall_id` → `gt.claim_id`) ist verhaltensidentisch.

---

## 4 · PR-Struktur & Ordering

**2 PRs** (nicht 3 wie SP-G/SP-H — die additive Struktur-PR = CMM-58, bereits live).

### PR1 — Writer + Reader (Code, additiv-sicher)
- INSERTs setzen `claim_id`; claim-resolving Reader auf `gt.claim_id`.
- CMM-58-Trigger bleibt aktiv → kein Verhaltens-Change.
- Build/tsc gruen, Portal-Smoke (Termin-Buchung, Re-Termin, SV-Tagesplan, Kunde-Termin).
- PR `--base staging`.

### PR2 — Migration (DDL), **gated auf PR1-prod-live**
- DROP Ableitungs-Trigger + Funktion; neuer Validierungs-Trigger (RAISE).
- View-LATERAL-Re-Key auf `gt.claim_id`.
- Verify: `COUNT(*) WHERE fall_id IS NOT NULL AND claim_id IS NULL` = 0 (sonst Catch-up-UPDATE
  vor dem Validierungs-Trigger).
- Migration via supabase-CLI (AGENTS.md Regel 2); ggf. Targeted-Apply + `migration repair` bei
  Drift (handoff §4-Pattern).

### Kritische Ordering-Regel
PR2-Migration wird **erst** auf die DB appliziert, **nachdem PR1-Code auf prod live** ist.
Andernfalls Fenster „Trigger weg, alter Writer ohne claim_id" → stilles NULL (AAR-599-Klasse,
AGENTS.md Regel 3: DB darf dem Code nicht vorauseilen). Daher **invertierte Gating-Reihenfolge**
ggue. SP-G/SP-H (dort PR1 = additive Migration → PR2 = Reader; hier PR1 = Writer → PR2 = Drop).

---

## 5 · Verifikation

- **Writer-Sweep:** exhaustiv, paren-balanced; Comment-False-Positives pro Hit aufschlagen
  (SP-G-Lesson d).
- **Live-Recheck (PR2 Task-0):** `information_schema` + Trigger-Existenz + Backfill-Coverage
  live abfragen, bevor die Migration geschrieben wird (andere Sessions migrieren parallel —
  feedback_information_schema_check).
- **Portal-Smoke nach PR2** auf allen Termin-relevanten Portalen mit Screenshot
  (feedback_post_drop_smoke, feedback_smoke_screenshot_pflicht): Termin buchen (kb-booking),
  Re-Termin, SV-Tagesplan, Kunde-Terminseite, Admin-Kalender.
- **View-Verify:** `pg_get_viewdef(v_faelle_mit_aktuellem_termin)` zeigt `gt.claim_id` im
  LATERAL; Stichprobe: `aktueller_termin_id` fuer einen bekannten Claim unveraendert ggue. vorher.

---

## 6 · Non-Goals (YAGNI)

- **Keine** flaechige `fall_id`-Entfernung aus Termin-Readern — `fall_id` bleibt bis Phase 6.
- **Keine** claim-native Neufassung von `v_faelle_mit_aktuellem_termin` (`FROM faelle f` bleibt) —
  Phase-4/6.
- **Kein** per-Spalten-Drop an `faelle` — SP-G2 ist (ausser dem Trigger-Drop) nicht-destruktiv
  ggue. Daten; `faelle` stirbt gesammelt in Phase 6.
- **Keine** RLS-Policy-Umstellung der vier `gutachter_termine`-Policies auf `claim_id` — separater
  Schritt (RLS-Audit), nicht in SP-G2 (Risiko: SECURITY-DEFINER-Grant-Verlust,
  feedback_rls_function_grants / AAR-894).

---

## 7 · Referenzen

- CMM-58 Migration: `supabase/migrations/20260516141502_cmm58_gutachter_termine_claim_id.sql`
- Phase-0-Handoff: `docs/16.05.2026/handoff-2026-05-16-cmm-phase0-abschluss.md` §3/§6
- Phase-1-Dekomposition: `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` (SP-G2/SP-D)
- Muster: SP-G (`docs/20.05.2026/handoff-cmm44-spg-abschluss.md`), SP-H Spec/Plan
- Lessons: feedback_information_schema_check, feedback_post_drop_smoke,
  feedback_rls_function_grants, feedback_kein_auto_merge, feedback_draft_pr_nicht_release_sicher
