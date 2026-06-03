# CMM-49 P0 — halter-Pilot (faelle-Drop Vorstufe)

**Datum:** 2026-06-03 · **Branch:** `kitta/cmm49-p0-halter-pilot` · **PR:** #2315 (→ staging)
**Migrationen:** `20260603082646` (claims-Spalten + Backfill) · `20260603083632` (v_claim_full-Expose)

Pilot fuer den faelle-DROP (Master-Plan `docs/superpowers/plans/2026-06-03-faelle-drop-master.md`,
Handoff `docs/03.06.2026/HANDOFF-cmm49-faelle-drop.md`). Validiert das **P0→P1-Muster** am
`halter_*`-Cluster (9 Spalten) fuer die ~133 faelle-only Spalten. **KEIN faelle-DROP** (P3).

## 1 · Befund-Audit (vor der Umsetzung)

| Fakt | Wert |
|---|---|
| `faelle.halter_*` Datenpraesenz | **0 non-null / 75 Rows** (alle 9 Spalten leer) |
| `faelle.halter_name` | **GENERATED** (`NULLIF(TRIM(vorname \|\| ' ' \|\| nachname))`) |
| `claims` hatte vorher | nur `halter_ungleich_fahrer` (boolean Flag, anderes Konzept) |
| Normalisierter Halter | `claim_parties.ist_halter=true` — **73 Rows / 73 von 76 Claims, alle benamt** |
| `v_claim_full.parties` | exposed claim_parties bereits als jsonb |
| `leads.halter_*` | nur 2/334 befuellt (OCR-Pfad selten getroffen) |
| Kanonische Konversion | `convert-lead-to-claim.ts` schreibt Halter als `claim_parties`-Row, NICHT flat |

**Konflikt:** Handoff §5 schreibt flach `ADD COLUMN claims.halter_*` + Backfill **aus faelle** vor.
Aber faelle ist leer, `halter_name` ist generated, und der echte Halter liegt bereits normalisiert
+ befuellt in `claim_parties`. Flache Spalten kopieren also nichts und duplizieren `claim_parties`.

**Entscheidung Aaron (2026-06-03):** *"neue columns, so wie das handoff es sagt"* → **flache
claims-Spalten**, bewusst statt Normalisierung. Umgesetzt wie unten.

## 2 · DB (additiv, deploy-safe, via Supabase-Plugin)

- **`20260603082646`** — `claims.halter_{vorname,nachname,strasse,plz,stadt,telefon,email,
  geburtsdatum}` (text/date) + `halter_name` GENERATED (Ausdruck identisch zu faelle).
  Backfill aus faelle (guarded) → **0 Rows kopiert** (faelle leer). File == getrackte Version.
- **`20260603083632`** — `CREATE OR REPLACE VIEW v_claim_full` mit 9 `c.halter_*` angehaengt
  (append-only, Definition verbatim aus `pg_get_viewdef`). `reloptions=null/default` beibehalten
  (kein `WITH`-Clause → kein security-Drift).

## 3 · Code — Writer → claims (kein faelle.halter_*-Write mehr)

| Datei | Aenderung |
|---|---|
| `lib/faelle/claim-duplicate-columns.ts` | 8 writable `halter_*` in `CLAIM_OWNED_DUPLICATE_COLUMNS` → `updateFallField` (Stammdaten-Edit) routet via `splitOrKeepFaelleUpdate` auf claims |
| `app/api/ocr-fahrzeugschein/route.ts` | 5 faelle.halter_*-Writes entfernt — der `claimUpdate`-Block schrieb claims.halter_* **schon** (lief vorher SILENT ins Leere, weil Spalten fehlten → jetzt scharf) |
| `app/api/ocr-trigger/route.ts` | `halter_geburtsdatum` → claims (claim_id aufloesen) statt faelle |
| `lib/leads/convert-lead-to-claim.ts` | halter_* aus dem Lead claims-nativ (untyped UPDATE wie `leasinggeber_name`); `halter_name` GENERATED → nicht geschrieben |
| `lib/lead-fall-mapping.ts` | `halter_*` (+ geburtsdatum) aus `LEAD_TO_FALL_DIRECT_FIELDS` raus (kein faelle-COPY) |

## 4 · Code — Reader → claims via v_claim_full

| Datei | Aenderung |
|---|---|
| `lib/claims/get-claim-for-role.ts` | `halter_*` in `COLUMNS_SV` + `COLUMNS_KUNDE` (admin/kb via `*`) → StammdatenReadSection (SV/Kunde) bekommt sie aus claims |
| `lib/stammdaten/schema.ts` | `halter_*`-`getValue` liest **claim-first** (`c.halter_*`) mit faelle-Fallback → admin SchemaFields (uebergibt `claim`) liest claims |

**Bewusst NICHT angefasst** (kein Collision-Risiko mit den aar-939-Gutachter-Sessions):
`StammdatenReadSection`, `StammdatenCard` (SV), `FallDetailSections` (Kunde), `ClaimSummary` —
sie reichen das `fall`/`data`-Objekt nur durch; die Repoint-Aenderung sitzt in den lib-Loadern.

## 5 · Verifikation

- claims hat alle 9 `halter_*` (`halter_name` generated) — Supabase-MCP `information_schema`.
- `v_claim_full` exposed alle 9 — `information_schema` **und** Runtime-`SELECT` (Read-Path-Proof).
- Backfill = 0 (faelle leer, erwartet).
- **`npx tsc --noEmit` = exit 0** (clean, tsbuildinfo vorher geloescht). Der untyped
  `.select('halter_geburtsdatum')` / `Record<string,unknown>`-Update-Pfad kompiliert (Codebase-
  Praezedenz `operative_status`) → **kein `database.types.ts`-Regen noetig**.
- Voller `next build`: via CI (Worktree-OOM bekannt). Kein Replay-Risiko (rein additiv, keine
  Drop-Migration).
- Daten-Smoke (UI) zeigt aktuell leer (0 Halter-Daten) — echte Anzeige-Validierung kommt sobald
  ein abweichender Halter erfasst wird (admin Stammdaten-Edit → claims → v_claim_full → Anzeige).

## 6 · P0-Muster fuer die restlichen Cluster (Template)

1. **Datenpraesenz + Heimat pruefen ZUERST** (`count(col)` + `claim_parties`/`vehicles`/claims-
   Alias). Viele "faelle-only live-read"-Spalten sind faelle-leer und liegen normalisiert woanders.
   Entscheidung flat-vs-normalisiert ist Aaron's (hier: flat).
2. `ADD COLUMN` auf claims (+ generated wo faelle generated war) + guarded Backfill aus faelle.
3. `CREATE OR REPLACE v_claim_full` append-only, `reloptions` beibehalten.
4. Writer: gleichnamig → `CLAIM_OWNED_DUPLICATE_COLUMNS`; Insert-Pfade (convert-lead-to-claim)
   untyped Record-UPDATE; faelle-COPY (lead-fall-mapping) entfernen.
5. Reader: `get-claim-for-role`-Whitelists (SV/Kunde) + ggf. `schema.ts`-`getValue` claim-first.
6. `tsc` + PR gegen staging, **kein DROP** (P3).

## 7 · Offene Faeden / Follow-ups

- **Kunde-Detail-Record** (`get-kunde-faelle.ts:getKundeFallDetailRecord`) + `ClaimSummary`
  fuehren `halter_*` aktuell gar nicht (undefined, kein faelle-Read) — kein Drop-Blocker, kein
  Regress. Optional spaeter aus claims befuellen, falls Kunde abweichenden Halter sehen soll.
- `StammdatenReadSection` gate liest `fall.halter_ungleich_fahrer_flag` (faelle-Name); claims hat
  `halter_ungleich_fahrer`. Pre-existing, orthogonal zum Drop. Bei Bedarf separat fixen.
- Restliche ~132 Spalten / Cluster nach dem Template oben (kunde_*, gegner_*, eskalation_tag_*,
  vs_*, ruege_*, nachbesichtigung_*, sv_briefing_*, …) — parallelisierbar via Subagenten.
