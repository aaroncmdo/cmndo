# SV Basic-Tier — P0 Datenmodell-Fundament — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das additive Datenmodell-Fundament für den SV-Basic-Tier legen: `sv_leads`-Claim-Verlinkung, `sachverstaendige` für Basic vorbereiten (paket='basic', `verifizierung_status='abgelehnt'`, IBAN nullable, Herkunfts-Marker), und das Matching so anpassen, dass `paket='basic'` unterste Prio bekommt und NICHT durchs Kontingent ausgesiebt wird (kalender-basiert).

**Architecture:** Basic ist kein eigenes Tier-Konstrukt, sondern ein Wert `paket='basic'` in der bestehenden `sachverstaendige`-Tabelle. P0 ist rein additiv (keine Drops, kein Verhaltenswechsel für bestehende Pakete) und damit eigenständig mergebar. Die Matching-Logik bekommt eine pure, getestete Helper-Funktion statt eines Integration-Harness.

**Tech Stack:** Next.js (App Router), Supabase Postgres (DDL **ausschließlich** via Supabase-MCP `apply_migration`), TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-sv-basic-tier-self-service-onboarding-design.md` (§5 Datenmodell, §9 Matching).

**Harte Regeln (AGENTS.md):** DDL nur via Plugin `apply_migration` → `list_migrations` → File exakt nach recorded Version benennen (Twin-Drift). Branch off `staging`, PR gegen `staging`, nie main, nicht selbst mergen. 7-Punkte-Audit im Commit-Body. Vor jeder Migration Live-Schema prüfen (andere Sessions droppen parallel).

---

## File Structure

- **Migrationen** (via Plugin, Files committet unter `supabase/migrations/<recordedVersion>_<name>.sql`):
  - `sv_leads`-Claim-Spalten (Verlinkung Kalt-Pin → Account).
  - `sachverstaendige`-Vorbereitung (onboarding_quelle, paket='basic', verifizierung_status='abgelehnt', IBAN nullable).
- **`src/lib/dispatch/findBestSV.ts`** — `PAKET_PRIO['basic']=0` exportiert + pure Helper `istKontingentBlockiert()` + dessen Einsatz im Kontingent-Gate.
- **`src/lib/dispatch/__tests__/findBestSV.matching.test.ts`** (neu) — Unit-Tests für `PAKET_PRIO`-Ordnung + `istKontingentBlockiert`.

---

## Task 0: Branch anlegen (off staging)

**Files:** keine (nur Git).

- [ ] **Step 1: Frischen Branch off origin/staging anlegen**

Run (im neuen Worktree oder eigenem Checkout):
```bash
git fetch origin staging
git switch -c kitta/sv-basic-p0-datenmodell origin/staging
```
Erwartung: neuer Branch auf staging-Stand. (Falls in einem Worktree gearbeitet wird: via `node scripts/new-session-worktree.mjs sv-basic-p0-datenmodell staging`.)

---

## Task 1: Live-Schema prüfen (vor jeder Migration Pflicht)

**Files:** keine (READ-only via Plugin `execute_sql`).

- [ ] **Step 1: Spalten-Existenz + Constraints abfragen**

Führe via `mcp__plugin_supabase_supabase__execute_sql` (READ) aus:
```sql
-- (a) Existieren die geplanten Spalten schon? (additive Idempotenz)
SELECT table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='sv_leads' AND column_name IN ('konvertiert_zu_sv_id','konvertiert_am','claim_status'))
    OR (table_name='sachverstaendige' AND column_name IN ('onboarding_quelle','paket','verifizierung_status','zahlungsempfaenger_iban')))
ORDER BY table_name, column_name;

-- (b) CHECK-Constraints auf paket / verifizierung_status / claim_status
SELECT con.conname, pg_get_constraintdef(con.oid) AS def
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname='public'
  AND rel.relname IN ('sachverstaendige','sv_leads')
  AND con.contype='c'
  AND pg_get_constraintdef(con.oid) ILIKE ANY (ARRAY['%paket%','%verifizierung_status%','%claim_status%']);
```

- [ ] **Step 2: Ergebnis festhalten + Migrations-Zweige festlegen**

Notiere für die folgenden Tasks:
- **paket-CHECK:** Falls ein CHECK auf `paket` existiert (z.B. `paket IN ('starter-10','standard-25','pro','premium', …)`) → in Task 3 **DROP + RECREATE inkl. `'basic'`** (exakte bestehende Werte aus `def` übernehmen + `'basic'` ergänzen). Falls **kein** CHECK existiert → keine Constraint-Änderung für paket nötig (nur Konvention).
- **verifizierung_status-CHECK:** analog — falls CHECK existiert → DROP + RECREATE inkl. `'abgelehnt'`; sonst nichts.
- **zahlungsempfaenger_iban:** `is_nullable` aus (a). Falls `NO` → in Task 3 `DROP NOT NULL`. Falls `YES` → überspringen.
- **Spalten aus (a) die schon existieren** → in der Migration via `IF NOT EXISTS` ohnehin idempotent.

Es gibt keinen Commit in dieser Task (reine Read-Erkundung).

---

## Task 2: Migration `sv_leads`-Claim-Verlinkung

**Files:**
- Create: `supabase/migrations/<recordedVersion>_sv_basic_sv_leads_claim_link.sql`

- [ ] **Step 1: Migration via Plugin anwenden**

`mcp__plugin_supabase_supabase__apply_migration({ name: "sv_basic_sv_leads_claim_link", query: <SQL> })` mit:
```sql
ALTER TABLE public.sv_leads
  ADD COLUMN IF NOT EXISTS konvertiert_zu_sv_id uuid REFERENCES public.sachverstaendige(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS konvertiert_am timestamptz,
  ADD COLUMN IF NOT EXISTS claim_status text NOT NULL DEFAULT 'offen';

-- CHECK idempotent (ADD CONSTRAINT kennt kein IF NOT EXISTS → Guard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sv_leads_claim_status_check'
  ) THEN
    ALTER TABLE public.sv_leads
      ADD CONSTRAINT sv_leads_claim_status_check
      CHECK (claim_status IN ('offen','beansprucht_pending','konvertiert'));
  END IF;
END $$;

COMMENT ON COLUMN public.sv_leads.konvertiert_zu_sv_id IS 'Gesetzt beim GMB-Claim: verlinkt den Kalt-Pin auf den entstandenen sachverstaendige-Account.';
COMMENT ON COLUMN public.sv_leads.claim_status IS 'offen=frei beanspruchbar; beansprucht_pending=Account angelegt, Verifizierung offen; konvertiert=live.';
```

- [ ] **Step 2: Recorded Version ablesen**

`mcp__plugin_supabase_supabase__list_migrations` → die zuletzt vergebene `version` (Timestamp) für `sv_basic_sv_leads_claim_link` notieren = `<recordedVersion>`.

- [ ] **Step 3: Migration-File committen (Name == recordedVersion)**

Lege `supabase/migrations/<recordedVersion>_sv_basic_sv_leads_claim_link.sql` mit **exakt demselben SQL** an.

- [ ] **Step 4: Verifizieren (READ)**

`execute_sql`:
```sql
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name='sv_leads' AND column_name IN ('konvertiert_zu_sv_id','konvertiert_am','claim_status');
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='sv_leads_claim_status_check';
```
Erwartung: 3 Spalten vorhanden; CHECK-def listet die 3 claim_status-Werte.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<recordedVersion>_sv_basic_sv_leads_claim_link.sql
git commit -m "feat(sv-basic-p0): sv_leads Claim-Verlinkung (konvertiert_zu_sv_id, claim_status)"
```

---

## Task 3: Migration `sachverstaendige`-Basic-Vorbereitung

**Files:**
- Create: `supabase/migrations/<recordedVersion>_sv_basic_sachverstaendige_prep.sql`

- [ ] **Step 1: Migration-SQL bauen (Zweige aus Task 1 einsetzen)**

Basis (immer):
```sql
ALTER TABLE public.sachverstaendige
  ADD COLUMN IF NOT EXISTS onboarding_quelle text;
COMMENT ON COLUMN public.sachverstaendige.onboarding_quelle IS 'self_service_claim | self_service_neu | admin — Herkunft des SV-Accounts.';
```

Nur falls Task-1 `zahlungsempfaenger_iban.is_nullable = 'NO'`:
```sql
ALTER TABLE public.sachverstaendige ALTER COLUMN zahlungsempfaenger_iban DROP NOT NULL;
```

Nur falls Task-1 ein **paket-CHECK** existiert — DROP + RECREATE inkl. `'basic'` (Werte aus der gefundenen `def` 1:1 übernehmen + `'basic'` anhängen). Beispiel-Template (echte Werte einsetzen!):
```sql
ALTER TABLE public.sachverstaendige DROP CONSTRAINT <paket_check_conname>;
ALTER TABLE public.sachverstaendige
  ADD CONSTRAINT <paket_check_conname>
  CHECK (paket IN (<bestehende Werte aus def>, 'basic'));
```

Nur falls Task-1 ein **verifizierung_status-CHECK** existiert — analog inkl. `'abgelehnt'`:
```sql
ALTER TABLE public.sachverstaendige DROP CONSTRAINT <verifstatus_check_conname>;
ALTER TABLE public.sachverstaendige
  ADD CONSTRAINT <verifstatus_check_conname>
  CHECK (verifizierung_status IN (<bestehende Werte aus def>, 'abgelehnt'));
```

> Falls **kein** CHECK existiert: den jeweiligen Block weglassen (Wert ist dann reine Konvention, kein DDL nötig).

- [ ] **Step 2: Anwenden + Recorded Version + File + Verify** (wie Task 2 Steps 1–4)

`apply_migration({ name: "sv_basic_sachverstaendige_prep", query: <SQL> })` → `list_migrations` → File `supabase/migrations/<recordedVersion>_sv_basic_sachverstaendige_prep.sql`.

Verify (READ):
```sql
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name='sachverstaendige' AND column_name IN ('onboarding_quelle','zahlungsempfaenger_iban');
-- Test, dass 'basic' / 'abgelehnt' jetzt erlaubt sind (ROLLBACK = kein Drift):
BEGIN;
  UPDATE public.sachverstaendige SET paket='basic' WHERE false;            -- prüft nur Constraint-Parsebarkeit
ROLLBACK;
```
Erwartung: `onboarding_quelle` vorhanden; `zahlungsempfaenger_iban.is_nullable='YES'`; kein CHECK-Fehler.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/<recordedVersion>_sv_basic_sachverstaendige_prep.sql
git commit -m "feat(sv-basic-p0): sachverstaendige fuer Basic (paket=basic, verif abgelehnt, iban nullable, onboarding_quelle)"
```

---

## Task 4: `PAKET_PRIO['basic']=0` (Matching unterste Prio)

**Files:**
- Modify: `src/lib/dispatch/findBestSV.ts:62-66`
- Test: `src/lib/dispatch/__tests__/findBestSV.matching.test.ts` (neu)

- [ ] **Step 1: Failing Test schreiben**

`src/lib/dispatch/__tests__/findBestSV.matching.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { PAKET_PRIO } from '../findBestSV'

describe('PAKET_PRIO', () => {
  it('Basic hat die unterste Paket-Prio (0)', () => {
    expect(PAKET_PRIO['basic']).toBe(0)
  })
  it('Basic rankt unter standard/pro/premium', () => {
    expect(PAKET_PRIO['basic']).toBeLessThan(PAKET_PRIO['standard'])
    expect(PAKET_PRIO['basic']).toBeLessThan(PAKET_PRIO['pro'])
    expect(PAKET_PRIO['basic']).toBeLessThan(PAKET_PRIO['premium'])
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/dispatch/__tests__/findBestSV.matching.test.ts`
Erwartung: FAIL — entweder `PAKET_PRIO` nicht exportiert (Import-Error) oder `PAKET_PRIO['basic']` ist `undefined`.

- [ ] **Step 3: `PAKET_PRIO` exportieren + `basic: 0` ergänzen**

In `src/lib/dispatch/findBestSV.ts` den Block bei Zeile 62:
```ts
export const PAKET_PRIO: Record<string, number> = {
  premium: 3, 'premium-50': 3,
  pro: 2, 'standard-25': 2,
  standard: 1, 'starter-10': 1,
  basic: 0,
}
```
(`?? 1`-Default bei `findBestSV.ts:348` bleibt — `basic` ist jetzt explizit definiert, greift also `0`, nicht den Default.)

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run src/lib/dispatch/__tests__/findBestSV.matching.test.ts`
Erwartung: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dispatch/findBestSV.ts src/lib/dispatch/__tests__/findBestSV.matching.test.ts
git commit -m "feat(sv-basic-p0): PAKET_PRIO basic=0 (Fallback-Ranking)"
```

---

## Task 5: Kontingent-Bypass für Basic (kalender-basiert)

**Files:**
- Modify: `src/lib/dispatch/findBestSV.ts` (Helper neu + Kontingent-Gate ~Zeile 309-313 + paket frühziehen)
- Test: `src/lib/dispatch/__tests__/findBestSV.matching.test.ts` (erweitern)

- [ ] **Step 1: Failing Test ergänzen**

In `src/lib/dispatch/__tests__/findBestSV.matching.test.ts` anhängen:
```ts
import { istKontingentBlockiert } from '../findBestSV'

describe('istKontingentBlockiert', () => {
  it('Basic wird NIE durch Kontingent ausgesiebt (kalender-basiert)', () => {
    expect(istKontingentBlockiert('basic', 0)).toBe(false)
    expect(istKontingentBlockiert('basic', -3)).toBe(false)
  })
  it('Nicht-Basic wird bei 0 freien Faellen ausgesiebt', () => {
    expect(istKontingentBlockiert('standard', 0)).toBe(true)
    expect(istKontingentBlockiert('pro', -1)).toBe(true)
  })
  it('Nicht-Basic mit freiem Kontingent bleibt drin', () => {
    expect(istKontingentBlockiert('pro', 5)).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/dispatch/__tests__/findBestSV.matching.test.ts`
Erwartung: FAIL — `istKontingentBlockiert` ist nicht exportiert/definiert.

- [ ] **Step 3: Pure Helper hinzufügen**

In `src/lib/dispatch/findBestSV.ts` direkt unter dem `PAKET_PRIO`-Block:
```ts
/**
 * Basic-SVs (paket='basic') haben kein Fall-Kontingent — sie werden rein
 * kalender-/verfuegbarkeitsbasiert beruecksichtigt und pro Lead abgerechnet.
 * Alle anderen Pakete: kein freies Kontingent => raus.
 */
export function istKontingentBlockiert(paket: string, kontingentFrei: number): boolean {
  if (paket === 'basic') return false
  return kontingentFrei <= 0
}
```

- [ ] **Step 4: Kontingent-Gate in der Schleife umstellen**

In `findBestSV.ts` den Block bei ~Zeile 309-313. **Vorher:**
```ts
    // Kontingent-Check
    const kontingentGesamt = Number(sv.paket_faelle_gesamt) || 10
    const kontingentGenutzt = Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0
    const kontingentFrei = kontingentGesamt - kontingentGenutzt
    if (kontingentFrei <= 0) continue
```
**Nachher** (paket frühziehen + Helper nutzen):
```ts
    // Kontingent-Check (Basic: kalender-basiert, kein Limit)
    const paket = (sv.paket as string) || 'standard'
    const kontingentGesamt = Number(sv.paket_faelle_gesamt) || 10
    const kontingentGenutzt = Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0
    const kontingentFrei = kontingentGesamt - kontingentGenutzt
    if (istKontingentBlockiert(paket, kontingentFrei)) continue
```
Dann die **spätere** Deklaration `const paket = (sv.paket as string) || 'standard'` bei ~Zeile 347 **entfernen** (jetzt oben deklariert — sonst `redeclare`-Fehler). Die Nutzung von `paket` bei `PAKET_PRIO[paket]` (ehem. Zeile 348) bleibt unverändert.

- [ ] **Step 5: Tests + Typecheck laufen lassen**

Run:
```bash
npx vitest run src/lib/dispatch/__tests__/findBestSV.matching.test.ts
npx tsc --noEmit
```
Erwartung: Tests PASS; `tsc` 0 Fehler (insb. keine `paket`-Redeclaration).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dispatch/findBestSV.ts src/lib/dispatch/__tests__/findBestSV.matching.test.ts
git commit -m "feat(sv-basic-p0): Kontingent-Bypass fuer paket=basic (kalender-basiert)"
```

---

## Task 6: Typen regenerieren (nur wenn ein Consumer die neuen Spalten schon nutzt)

**Files:**
- Modify (optional): `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Entscheiden**

P0 referenziert die neuen Spalten noch nicht aus TS (Consumer kommen in P1+). Laut AGENTS.md dürfen Typen der DB hinterherhinken. → **Regeneration aufschieben** (passiert in P1, sobald die Claim-Action die Spalten schreibt). Falls doch gewünscht: `mcp__plugin_supabase_supabase__generate_typescript_types` → Output in `src/lib/supabase/database.types.ts` ersetzen → `npx tsc --noEmit`.

Kein Commit nötig wenn aufgeschoben.

---

## Task 7: Integrations-Smoke (manuell geseedeter Basic-SV auf staging)

> P0 hat noch keinen Claim-Flow (P1) → für den Smoke wird **temporär reversibel** ein Basic-SV geseedet, das Matching geprüft, danach restlos aufgeräumt.

**Files:** keine (Smoke gegen staging-DB via `execute_sql`, reversibel).

- [ ] **Step 1: Reversibler Seed (READ/WRITE in Transaktion-Denke, mit Cleanup-Plan)**

Wähle einen existierenden aktiven Test-SV als Vorlage oder lege einen `@claimondo.test`-Basic-SV an (profile + sachverstaendige, `paket='basic'`, `ist_aktiv=true`, `portal_zugang_freigeschaltet=true`, `verifiziert=true`, gültige `standort_lat/lng`, `paket_faelle_gesamt=0`). Notiere die erzeugten IDs für den Cleanup.

- [ ] **Step 2: Matching gegen einen Fall-Standort im Gebiet prüfen**

Rufe `findBestSV` über einen bestehenden Dispatch-/Smoke-Pfad ODER repliziere die Query gegen die staging-DB mit Fall-Coords nahe dem Basic-SV:
- Erwartung A: Wenn **ein bezahlter SV** im Gebiet ist → der Basic-SV erscheint **hinter** ihm (niedrigerer Score).
- Erwartung B: Wenn **kein** bezahlter SV im Gebiet ist → der Basic-SV erscheint trotzdem als Kandidat (NICHT durch Kontingent 0 ausgesiebt).

- [ ] **Step 3: Screenshot/Output festhalten** (Memory-Regel: Smoke = Beleg) unter `docs/<DD.MM.YYYY>/smoke-sv-basic-p0/`.

- [ ] **Step 4: Cleanup (Pflicht)**

Lösche den geseedeten Basic-SV + profile + zugehörige Test-Reste (FK-Reihenfolge beachten). Verifiziere via `execute_sql`, dass 0 Test-Reste übrig sind.

Kein Commit (Smoke-Doc optional committen).

---

## Task 8: Build-Gate + PR

- [ ] **Step 1: Volles Gate lokal**

Run:
```bash
npx tsc --noEmit
npx vitest run src/lib/dispatch/__tests__/findBestSV.matching.test.ts
npm run check:token-audit
npm run check:component-set
npm run check:knip
```
Erwartung: alle grün. (Kein UI/kein Token/keine neue Komponente in P0 → token-audit/component-set trivially grün.)

- [ ] **Step 2: Push + PR gegen staging (NICHT selbst mergen)**

```bash
git push origin kitta/sv-basic-p0-datenmodell:kitta/sv-basic-p0-datenmodell
gh pr create --base staging --head kitta/sv-basic-p0-datenmodell \
  --title "feat(sv-basic-p0): Datenmodell-Fundament Basic-Tier" \
  --body "<7-Punkte-Audit + Verweis auf Spec + Smoke-Ergebnis>"
```

- [ ] **Step 3: Commit-Body 7-Punkte-Audit** (Pflicht):
```
Audit:
- Build: gruen (tsc --noEmit, vitest)
- UI: n/a (kein UI-Change in P0)
- Redundanz: PAKET_PRIO/Kontingent in findBestSV wiederverwendet, Helper extrahiert (DRY)
- Dead-Code: keine
- Spec: §5 Datenmodell + §9 Matching-Fundament erfuellt
- Inkonsistenz: DB-Spalten via information_schema verifiziert; Migration-File == recorded Version
- Regression: bestehende Pakete unveraendert (additiv); Kontingent-Gate fuer Nicht-Basic identisch
```

---

## Self-Review (vom Plan-Autor durchgeführt)

- **Spec-Coverage P0:** §5.1 (paket=basic, verifizierung_status abgelehnt, IBAN nullable, onboarding_quelle) → Task 3 ✓. §5.2 (sv_leads konvertiert_zu_sv_id/claim_status) → Task 2 ✓. §5.3 (PAKET_PRIO basic=0 + Kontingent-Bypass) → Task 4+5 ✓. `konvertiert_am` → Task 2 ✓.
- **Placeholder-Scan:** Migrations-Constraint-Werte sind bewusst Task-1-abhängig (verify-then-act, beide Zweige spezifiziert) — kein TBD. Smoke-IDs sind laufzeit-erzeugt (kein Platzhalter im Code).
- **Typ-Konsistenz:** `istKontingentBlockiert(paket: string, kontingentFrei: number)` identisch in Task 5 Test + Impl; `PAKET_PRIO` Export identisch in Task 4 + Task 5-Test.
- **Offen aus Spec §12 (gehört NICHT in P0):** exakte Schadenhöhe-Spalte (P5), gutachter_abrechnungen-Richtung (P5), Route-Name (P1), Kundenbetreuer (P5).

---

## Nächste Pläne (Folge-Phasen)

- **P1** — GMB-Claim-Flow (Public-Route im Haupt-App, Claim-Action service-role, Prefill, pending Account, RLS) → eigener Plan.
- **P2** — Unified Dynamic Onboarding (WizardClient/`onboarding_phasen`, neue Feld-Typen, Magic-Link+Phone/WA-Verify).
- **P3** — Discretionary Verification (verifizierung_status-Queue, 48h, approve/reject).
- **P4** — Fallback-Matching-Feinschliff + Karten-Darstellung (anon-GRANT #2177 wahren).
- **P5** — Per-Lead-Billing (leadpreis.ts 30% inbound, Stripe, nach Schadenhöhe-Erfassung).
