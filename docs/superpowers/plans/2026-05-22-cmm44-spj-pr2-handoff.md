# CMM-44 SP-J — PR2/PR3 Handoff (frische Session nach PR1-staging-Merge)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (oder subagent-driven-development). Dieses Handoff bridged PR1→PR2 — die **Task-für-Task-Detailschritte stehen im Haupt-Plan** `docs/superpowers/plans/2026-05-22-cmm44-spj-payment-split.md` (Task 3–7). Dieses Dokument fixiert den Stand + die live-gemessenen Fakten, damit du NICHT neu misst, und korrigiert die offenen Platzhalter des Plans.

**Goal:** SP-J abschließen — PR2 (Code-Sweep: Bucket A → `claim_payments`-Reroute + Bucket B Reader/Writer + Bucket C drop-marker), dann PR3 (Catch-up) + Task 7 (Abschluss/Memory).

**Architecture:** PR1 (Bucket B = 8 ADD auf `claims` + Backfill + 3 View-Repoints) ist **fertig + auf der geteilten DB appliziert**. PR2 ist reiner Code (kein DDL außer evtl. Nachzug), gegated auf PR1-staging-Merge (für Types-Regen).

**Tech Stack:** Next.js 16, TS, supabase-js, Supabase CLI, Postgres, vitest, Playwright.

---

## ✅ GATE — OFFEN (PR1 ist auf staging)

**Stand 2026-05-22:** PR #1545 (PR1) ist **MERGED** (14:15 UTC, mergeCommit `67072e81` = staging-HEAD). Inhaltscheck bestätigt: `origin/staging:database.types.ts` hat die 8 claims-Spalten (10× `guthaben_verrechnet_netto`, 2× `claims_kanzlei_abrechnung_id_fkey`). **PR2 kann sofort off `origin/staging` starten.**

Trotzdem als Routine vor PR2 (staging bewegt sich ständig — Merge-Watcher/Sync aktiv):
- [ ] `git fetch origin && git cat-file -e origin/staging:supabase/migrations/20260522133422_cmm44_spj_add_claims_columns.sql && echo "PR1 da"` — Inhaltscheck, nicht nur PR-Status (Memory `feedback_pr_state_nicht_production_stand`).
- [ ] `git show origin/staging:src/lib/supabase/database.types.ts | grep -c guthaben_verrechnet_netto` ≥ 1.

---

## Was PR1 hinterlassen hat (PR #1545 MERGED auf staging 2026-05-22 14:15, alles LIVE auf DB `paizkjajbuxxksdoycev`)

### Auf `claims` (additiv, appliziert via Migration `20260522133422`, repaired):
8 neue Spalten, Typen exakt aus faelle gespiegelt:
```
guthaben_verrechnet_netto            numeric(10,2) NOT NULL DEFAULT 0
schlussabrechnung_am                 timestamptz
auszahlung_gutachter_betrag          numeric                       -- unconstrained, KEIN (10,2)
auszahlung_gutachter_eingegangen_am  timestamptz
auszahlung_zahlungsweg               text
sv_nachzahlung_netto                 numeric(10,2)
abrechnung_id                        uuid                          -- KEIN FK (faelle hatte keinen)
kanzlei_abrechnung_id                uuid REFERENCES kanzlei_abrechnungen(id)  -- NICHT abrechnungen!
```
Backfill `claims<-faelle` lief (49 Rows, 0 mismatches; guthaben-Werte alle 0 = NOT-NULL-Default, keine echten Finanzdaten pre-launch).

### Views (CREATE OR REPLACE, live):
- `v_faelle_mit_aktuellem_termin`: 8 Bucket-B aus `c.<col>`; **3 Bucket-A (`zahlung_eingegangen_am`/`zahlung_betrag`/`zahlungsweg`) sind jetzt `NULL::<typ>`-Platzhalter** im View; Bucket-C `f.zahlung_erwartet_am` unverändert.
- `faelle_kunde_view` (`auszahlung_zahlungsweg`→`c.`), `faelle_sv_view` (`auszahlung_gutachter_eingegangen_am`→`c.`).
- **WICHTIG:** `faelle` behält weiterhin ALLE 12 Spalten (Drop erst Phase 6). Reads/Writes laufen im Code noch auf `faelle` bis du sie in PR2 umstellst.

### `faelle`-Spalten die PR2 noch umstellen muss: alle 11 (3 A + 8 B). `zahlung_erwartet_am` (C) NICHT.

---

## 🔑 Die in PR1 live-gemessenen Fakten, die der Haupt-Plan in „Task 0" offen ließ

Der Haupt-Plan Task 4 Step 3 sagt „status NUR setzen wenn Enum aus Task 0 bekannt". **Es ist jetzt bekannt:**

**`claim_payments`-Schema (live, 0 Rows, 1:N pro claim, KEIN UNIQUE auf claim_id):**
```
id uuid, claim_id uuid, status text, forderungsbetrag numeric, erhaltener_betrag numeric,
differenz_betrag numeric, zahlungseingang_am timestamptz, zahlungsweg text,
zahlungsreferenz text, notiz text, created_at timestamptz, updated_at timestamptz,
created_by_user_id uuid
```
**`claim_payments.status` = `text NOT NULL DEFAULT 'ausstehend'`, CHECK `IN ('ausstehend','teilweise','erhalten','final','abgelehnt')`.**

→ **Konsequenz für den Bucket-A-Writer (Plan Task 4 Step 3):** Beim Zahlungseingang `status: 'erhalten'` setzen (NICHT weglassen → würde via INSERT-Default 'ausstehend' werden = semantisch falsch für eine eingegangene Zahlung; und beim UPDATE einer bestehenden Row bliebe der alte Status). Konkret das Payload-Objekt im Plan-Code erweitern:
```typescript
const payload = { erhaltener_betrag: metadata.betrag, zahlungseingang_am: now2, status: 'erhalten' as const }
```
Beim INSERT zusätzlich `claim_id` + `created_by_user_id` (wie im Plan). „Aktuelle Row" = `order('created_at',{ascending:false}).limit(1).maybeSingle()` (kein UNIQUE → create-or-update).

**Bucket-A → claim_payments Rename-Mapping (steht so im Plan/Spec, hier nochmal als Quick-Ref):**
| faelle | claim_payments |
|---|---|
| `zahlung_eingegangen_am` | `zahlungseingang_am` |
| `zahlung_betrag` | `erhaltener_betrag` |
| `zahlungsweg` | `zahlungsweg` |

---

## Korrekturen am Haupt-Plan (durch PR1-Live-Befund)

1. **Plan Task 1 Step 4 ADD-Skelett ist überholt** — PR1 hat die Typen bereits korrekt appliziert (numeric(10,2)/NOT NULL/kein-FK/kanzlei_abrechnungen). PR1 ist durch; ignoriere Task 1/2.
2. **`abrechnung_id` hat KEINEN FK, `kanzlei_abrechnung_id`→`kanzlei_abrechnungen`** — relevant falls ein PR2-Reader/Writer FK-Annahmen trifft (tut er normal nicht).
3. **Bucket B ist DB-seitig fertig** — in PR2 nur noch: die 8 in `CLAIM_OWNED_DUPLICATE_COLUMNS` aufnehmen (Plan Task 4 Step 1) + B-Reads/Writes (Step 5). Die Spalten existieren auf claims + in den staging-Types (nach Merge).

---

## matelso_calls — ERLEDIGT (auf staging), in PR2 NICHT strippen

**Update 2026-05-22:** `matelso_calls` ist inzwischen **auf staging** — Migration `20260522122643_matelso_calls_table.sql` + Types (identischer Blob wie `kitta/matelso-integration`). In PR1 hatte ich es gestrippt, weil PR1s Basis (vor dem matelso-Merge) es nicht hatte; der 3-Wege-Merge hat staging's matelso sauber behalten. **Für PR2: `gen types --linked` zieht matelso_calls legitim mit → DRIN LASSEN (nicht strippen).** Es gehört jetzt zu staging.

**Phase-6-Vorsicht (CMM-44, an Phase-6-Owner):** `matelso_calls.fall_id → faelle(id) ON DELETE SET NULL`. Beim faelle-Drop (Phase 6) bricht dieser FK → vorher auf `claims(id)` umhängen (oder fall_id wie der Rest migrieren).

---

## PR2 — Startsequenz (dann weiter im Haupt-Plan Task 3–6)

- [ ] **Step 1: Worktree + Branch.** Neuen Worktree (`using-git-worktrees`), `.env.local` + `supabase/.temp/` reinkopieren (gitignored — von einem bestehenden Worktree kopieren), eigenes `npm install` (KEINE junction). Branch: `git checkout -b kitta/cmm-44-spj-pr2-sweep origin/staging`.
- [ ] **Step 2: Drift-Recheck (Finance-Domain in Flux — billing/finance-hub/stripe).** `npx supabase db query --linked --file scripts/cmm44-spj-verify.sql` → muss `8` sein (Bucket B noch da). Plus `claim_payments`-Schema gegenchecken (s.o.), falls eine andere Session es angefasst hat.
- [ ] **Step 3: Grep-Inventur (Plan Task 3).** `scripts/cmm44-spj-grep.mjs` aus `scripts/cmm44-sph-grep.mjs` ableiten, `COLS` = die **11** A+B-Spalten (NICHT `zahlung_erwartet_am`). stripSubEmbeds zusätzlich `claims(...)` + `claim_payments(...)`. Pro Site Bucket (A/B/C) + Pattern in `docs/<DD.MM.YYYY>/cmm44-spj-inventory.md`.
- [ ] **Step 4: Sweep (Plan Task 4).** Bucket A = manueller claim_payments-Reroute (Rename + create-or-update + state-machine, status:'erhalten' s.o.) — **NIE** über `CLAIM_OWNED_DUPLICATE_COLUMNS`. Bucket B = 8 ins Set + B-Reads (`claims:claim_id(<col>)`-Embed, Array-normalisieren) + B-Writes. Bucket C = `zahlung_erwartet_am`-Reader auf `null`/Entfernung mit Kommentar. vitest (Plan Task 4 Step 2): Routing-Case B + Assertion „die 3 A NICHT im Set".
- [ ] **Step 5: tsc + Re-Grep 0 + Build.** Wie Plan Task 4 Step 7. Build: `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (lokales Windows-EBUSY im standalone-copy ist Worktree-Artefakt, kein Fehler — Linux-CI ist die Wahrheit).
- [ ] **Step 6: PR --base staging** nach 2-Stufen-Review (Spec+Quality). Dann Plan Task 5 (Smoke), Task 6 (PR3 Catch-up), Task 7 (Abschluss + Memory `project_cmm44_spj_status.md` + `COORDINATION-active-spj.md` löschen).

---

## Koordination (Stand 2026-05-22)

- **Geteilter View `v_faelle_mit_aktuellem_termin`:** wird auch von SP-C1/SP-D/SP-G2 angefasst. Meine PR1-Repoints sind live drin. Falls PR2 den View nochmal anfasst (unwahrscheinlich — PR2 ist Code): LIVE-Def holen + Generator-Pattern (`scripts/cmm44-spj-gen-migration.mjs`, Occurrence-Assertion) wiederverwenden, nie blind die committete Def nehmen.
- **SP-C1-Sessions** (`kitta/cmm-44-spc1-kunde-geschaedigter`, `…-pr2-sweep`) arbeiten an `claim_parties` (geschaedigter), berühren Finance-Spalten NICHT. Geteiltes File `claim-duplicate-columns.ts`: SP-C1 PR2 könnte es anfassen — beim Merge checken, dass deine 8 Bucket-B-Einträge + SP-C1s Einträge koexistieren (additive Set-Ergänzung, normal kein Konflikt).
- Live-Marker: `…/memory/COORDINATION-active-spj.md`.

---

## Self-Review (Handoff vs. Haupt-Plan + Spec)

- **claim_payments.status-Platzhalter aufgelöst** (Plan Task 4 Step 3 „falls Enum bekannt") → `status:'erhalten'`, konkreter Code-Diff angegeben. ✅
- **Gate explizit + verifizierbar** (Inhaltscheck statt PR-Status, Memory-Lesson). ✅
- **Bucket-Zuordnung + Rename-Mapping** wiederholt (Engineer liest evtl. nur dies). ✅
- **matelso-Re-Strip-Anweisung** für gen types. ✅
- **Keine Platzhalter:** PR2-Detailschritte verweisen auf den vorhandenen, vollständigen Haupt-Plan Task 3–7 (kein Dup, kein „TODO"); die hier ergänzten Fakten/Korrekturen sind konkret. ✅
- **Typ-Konsistenz:** Spaltennamen/Typen identisch zu PR1-Migration + Spec. ✅

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
