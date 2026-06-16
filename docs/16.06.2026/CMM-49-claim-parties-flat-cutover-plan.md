# CMM-49 / Entity Plan-5 — claim_parties Person-Flat-Spalten DROP (Cutover-Plan)

**Status:** Reader-Side KOMPLETT + verifiziert. Dieser Plan ist der **finale Cutover** —
eine irreversible DDL-Operation (`DROP COLUMN` auf einer Kern-Tabelle) + begleitende
Code-/View-Änderungen. **Aaron-gated:** vor Ausführung explizites Go; idealerweise nicht
während paralleler Staging-Sessions (am 16.06. liefen Release- + aar-956-Sessions).

Ziel (Northstar): claim_parties speichert Personen-Daten nicht mehr flach, sondern über
`person_id → personen` (Entity). Die flachen Person-Spalten sind Pre-Entity-Legacy und werden
hier entfernt. Vehicle-Spalten (`kennzeichen`, `fahrzeugtyp_klartext`) bleiben (CMM-50);
Versicherungs-Freitext (`versicherung_klartext`, `versicherungsnummer`, `versicherungs_aktenzeichen`)
bleibt party-/policy-level.

---

## 1. Preconditions — alle erfüllt (Reader-Side, gemergt/offen)

Jeder Reader liest Person-Daten **entity-primär** (personen) mit flat-**Fallback** (transitional):

| Reader | PR | Form | Verifikation |
|---|---|---|---|
| `v_claim_parties_safe` (View) | #2949 (merged) | `COALESCE(p.x, cp.x)` via `LEFT JOIN person_id` | md5 vor==nach (`912d0cd7`), 0 Div/84 Zeilen |
| `v_faelle_mit_aktuellem_termin` cp_g (View) | #2953 | `COALESCE(pe.x, cp.x)` | md5 der 7 kunde_*-Outputs vor==nach (`38da460a`), 0 Div/6 Felder |
| `gutachter/heute/page.tsx` (Code) | #2951 (merged) | personen-Embed + flat-Fallback | voller Build + Ratchets, 0 Div/5 Felder |
| `lib/faelle/kb-assignment.ts` (Code) | #2955 | zwei-hop personen-Suche | tsc grün, 0 Div/80 Kontakt-Rows |
| `v_claim_full` (View) | — (audit-clean) | bereits ~90% entity-primär; parties-jsonb **Usage-Audit clean** | siehe §3 |

**Writer-Audit:** nur **2** Pfade schreiben Person-flat — `convert-lead-to-claim.ts:638`
(`.insert(partyInserts)`: geschädigter/halter/verursacher) und `airdrop/server-actions.ts:126`
(`gegner_airdrop`-Insert). Beide setzen `person_id` via `ensurePersonForData` VOR dem Insert,
und der Snapshot ist **vollständig** (erfasst jedes Flat-Feld → personen bekommt alles). Alle
anderen claim_parties-Writes setzen nur KEPT-Spalten (`user_id`/`person_id`/airdrop-Flags).

---

## 2. Verifikations-Evidenz (warum der DROP daten-sicher ist)

Per `claim_parties cp LEFT JOIN personen p ON p.id = cp.person_id`:

- **0 Divergenz** über alle exponierten Person-Felder: `vorname/nachname/firma/ist_gewerbe/`
  `telefon/email/adresse_strasse/adresse_plz/adresse_ort/geburtsdatum/anrede/mobil` — d.h.
  `p.x == cp.x` für jede person-verknüpfte Zeile (`p.x NOT NULL AND p.x IS DISTINCT FROM cp.x → 0`).
- **Kein flat-only:** für alle 80 kontakt-tragenden person-verknüpften Rows ist `personen.email/`
  `telefon` gesetzt wo cp-flat gesetzt ist (0 case-/value-diff). → personen ist vollständige SSoT.
- **Seed-Gaps (akzeptiert, kein Backfill — Aaron):** 3 synthetische Claims ohne `person_id`
  (`bbbb`-Test-UUIDs, u.a. „Aaron Sprafke"/`quelle=manuell_kb`). Für die ändert der Cutover den
  Output `flat → NULL`. Echte Daten 100% entity-gedeckt.

Konsequenz: alle COALESCE/Fallbacks sind heute **md5-identisch**; der Pure-Entity-Flip ändert den
Output **nur für die akzeptierten Seed-Rows**.

---

## 3. v_claim_full — parties-jsonb Usage-Audit (kein Overlay-Ausbau nötig)

`v_claim_full.parties` ist typisiert als `ClaimParty[]` = volle `claim_parties['Row']`. Die jsonb
liefert `to_jsonb(cp.*)` (alle cp-Spalten) `|| jsonb_build_object(vorname/nachname/adresse_*/`
`telefon/email/geburtsdatum aus p, 'person', to_jsonb(p.*))`.

**Befund (Grep src):** Die `parties`-jsonb wird in **genau einer** Stelle gelesen —
`OnboardingWizard.tsx:606` (verursacher-Party), und nur für `rolle` (KEPT) + `vorname`/`nachname`
(overlayt aus p ✓) + `versicherung_klartext`/`kennzeichen` (kein Person-Bucket). **Kein** Consumer
liest die Non-Overlay-Person-Keys (`mobil`/`firma`/`anrede`/`titel`/`ist_gewerbe`/`ust_id`/
`adresse_land`/`fuehrerschein*`) top-level. → `to_jsonb(cp.*)` darf diese Keys beim DROP verlieren,
**0 Regression, kein Overlay-Ausbau nötig.**

---

## 4. Cutover-Schritte (in einer koordinierten Operation)

### 4a. View-Flips pure-entity (DDL via Supabase-Plugin `apply_migration`, fail-loud regexp_replace)

Alle drei reversibel (`CREATE OR REPLACE VIEW`, reloptions bleiben). Output ändert sich nur auf
Seed-Rows (s. §2).

- **`v_claim_parties_safe`** — die 8 Person-Spalten `COALESCE(p.x, cp.x) → p.x`. vehicle/
  versicherungsnummer bleiben `cp.*`.
- **`v_faelle_mit_aktuellem_termin`** cp_g — `COALESCE(pe.x, cp.x) → pe.x` (6 Felder).
- **`v_claim_full`:**
  - kunde_p: `COALESCE(kpe.vorname, kcp.vorname) → kpe.vorname` (analog nachname/adresse_strasse/
    adresse_plz/adresse_ort); `COALESCE(kpe.telefon, kcp.telefon, kcp.mobil) → COALESCE(kpe.telefon, kpe.mobil)`;
    `COALESCE(kfi.name, kcp.firma, kpe.firma) → COALESCE(kfi.name, kpe.firma)`. `kcp.ist_halter` bleibt (KEPT).
  - gegner_name: `COALESCE(gf.name, NULLIF(TRIM(gpp.vorname||' '||gpp.nachname),''), gp.nachname)`
    → `COALESCE(gf.name, NULLIF(TRIM(gpp.vorname||' '||gpp.nachname),''))` (gp.nachname raus).
  - gp-LATERAL: `vp.vorname`, `vp.nachname` aus dem SELECT entfernen (KEEP: firma_id/person_id/
    vehicle_id/fahrzeugtyp_klartext/kennzeichen/versicherung_klartext).
  - parties-jsonb: **keine Änderung** — `to_jsonb(cp.*)` adaptiert automatisch; Overlay (p.*) + nested
    `person` liefern weiter.

Jede Migration per Plugin applien → `list_migrations` → File `<version>_<name>.sql` exakt benennen
(Regel 2, kein Twin-Drift). Verifikation: für jede View md5 der betroffenen Outputs — erwartet
identisch außer den Seed-Rows.

### 4b. Code: Reader-Fallback-Removal

- **`gutachter/heute/page.tsx`**: Embed-Fallback entfernen — `(person?.x ?? p.x) ?? null → person?.x ?? null`;
  die flachen Spalten aus dem `.select(...)` streichen (nur `claim_id, rolle, user_id, reihenfolge,
  personen!claim_parties_person_id_fkey(vorname, nachname, anrede, telefon, mobil)`).
- **`kb-assignment.ts`**: bereits pure (zwei-hop personen) — kein Change.

### 4c. Code: Writer-Strip (Person-flat nicht mehr schreiben)

- **`convert-lead-to-claim.ts`**: nach der `ensurePersonForData`-Schleife (Snapshot bleibt
  vollständig → personen kriegt alles) die Person-flat-Keys aus jedem `partyInserts`-Element
  entfernen vor dem `.insert`. Lean-Payload = `claim_id, rolle, reihenfolge, user_id, person_id,`
  `firma_id, ist_halter, ist_fahrer, ist_aktiv, ist_anonymisiert, ist_eingeladen_via_airdrop,`
  `hat_personenschaden, vehicle_id, kennzeichen, quelle, created_by_user_id`.
- **`airdrop/server-actions.ts:126`**: gegner_airdrop-Insert lean (person_id + struktur + kennzeichen
  + airdrop-Flags; `nachname/firma/telefon/email/ist_gewerbe` raus — via ensurePerson in personen).

### 4d. ⚠ POLICY-ENTSCHEIDUNG (Aaron): ensurePerson-Härtung — Vorbedingung für 4c

Heute ist der personen-Link **non-fatal**: schlägt `ensurePersonForData` fehl, bleibt `person_id`
NULL und die **flachen Spalten waren das Resilienz-Fallback** (Konversion lief weiter). Nach 4c+DROP
gibt es dieses Netz nicht mehr → ein fehlgeschlagener Link bei einer **identitätstragenden** Partei
würde Name/Kontakt **permanent verlieren**. Vor 4c muss daher eine von zwei Strategien gewählt werden:

- **(A) Fail-hard + cleanup:** bei `!personRes.ok` für eine identitätstragende Partei
  `cleanupAndFail(...)` (Konversion bricht sauber ab, retrybar). Daten-sicher, aber eine seltene
  personen-Störung kann eine Konversion blocken (Availability-Tradeoff auf dem kritischsten Pfad).
- **(B) Retry + Alarm:** ensurePerson mit Retry härten (Idempotenz beachten — `personen.user_id`
  ohne Unique-Constraint → Retry-Insert kann duplizieren; ggf. erst Constraint/Upsert) + strukturierter
  Error wenn person_id NULL bleibt. Weniger invasiv, garantiert person_id aber nicht 100%.

Empfehlung: (A) für identitätstragende Parteien (geschädigter/halter mit Name), `skipped`-Fälle
(z.B. Gegner nur per KZ/Versicherung) bleiben tolerant.

### 4e. DROP (irreversibel, Aaron-Go)

```sql
ALTER TABLE public.claim_parties
  DROP COLUMN vorname, DROP COLUMN nachname, DROP COLUMN firma,
  DROP COLUMN ist_gewerbe, DROP COLUMN geburtsdatum, DROP COLUMN anrede,
  DROP COLUMN titel, DROP COLUMN ust_id, DROP COLUMN telefon, DROP COLUMN mobil,
  DROP COLUMN email, DROP COLUMN adresse_strasse, DROP COLUMN adresse_plz,
  DROP COLUMN adresse_ort, DROP COLUMN adresse_land,
  DROP COLUMN fuehrerscheinklassen, DROP COLUMN fuehrerscheinnummer;
```

**KEEP** (nicht droppen): `id, claim_id, rolle, reihenfolge, user_id, person_id, previous_person_id,`
`firma_id, vehicle_id, versicherung_id, ist_halter, ist_fahrer, ist_fahrzeuginsasse,`
`hat_personenschaden, verletzungsart, krankenhaus_name, arbeitsunfaehig_seit/_bis,`
`ist_eingeladen_via_airdrop, airdrop_token, airdrop_eingeladen_am, airdrop_response_am,`
`beziehung_zum_halter, ist_aktiv, ist_anonymisiert, anonymisiert_am, quelle, notiz,`
`created_at, updated_at, created_by_user_id` + Vehicle-flat `kennzeichen, kennzeichen_kreis/`
`_buchstaben/_zahl/_suffix, fahrzeugtyp_klartext` (CMM-50) + Versicherungs-Freitext
`versicherung_klartext, versicherungsnummer, versicherungs_aktenzeichen` (party/policy-level).

### 4f. Nachbereitung

- **Vor dem DROP:** frische `pg_depend`-Re-Scan (named-col-deps von ALLEN Views/Regeln auf
  claim_parties) → bestätigen dass nach 4a nur noch die zu droppenden Spalten via `to_jsonb(cp.*)`-
  Wholerow referenziert werden, keine named refs mehr. `ensure-person.ts` liest nur
  `id, person_id, user_id` (kein flat — bestätigt). `PersonSnapshot`-Typ spiegelt nur (kein Read).
- **Nach dem DROP:** `generate_typescript_types` regenerieren; tsc/build/Ratchets grün; Portal-Smoke
  (gutachter/heute, kunde-Onboarding-Review, kb-assignment-Zuweisung, Konversion end-to-end).

---

## 5. Reihenfolge & Rollback

Sichere Reihenfolge: **4d (ensurePerson-Härtung) → 4b/4c (Code-PR) → 4a (View-Flips) → 4e (DROP)**,
atomar/zeitnah, nicht über Tage verteilt (sonst Resilienz-Lücke / stale). Rollback bis 4a inklusive
trivial (Code revert, `CREATE OR REPLACE VIEW` zurück auf COALESCE). Nach 4e (DROP) ist Rollback nur
über Re-`ADD COLUMN` + Backfill aus personen möglich (Daten via personen rekonstruierbar, da SSoT) —
aber als irreversibel behandeln.

## 6. Referenzen

- Working-Map (laufend): memory `coordination-faelle-entity-residuals-map` Schritt 4.
- Reader-Side-PRs: #2949, #2951, #2953, #2955.
- Entity-Northstar: `docs/superpowers/specs/2026-05-31-claimondo-datenmodell-northstar.md`.
