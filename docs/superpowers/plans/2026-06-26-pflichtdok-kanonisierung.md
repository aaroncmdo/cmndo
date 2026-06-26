# Pflichtdokument-Kanonisierung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `dokument_katalog` (DB) wird die einzige Quelle der Wahrheit für die Pflichtdokument-Bedarfsermittlung; operative Anzeige, Pflichtzeilen-Anlage und Dispatch-Erwartung leiten daraus ab (8 Hardcodes raus).

**Architecture:** Ein kanonischer `buildDokumentKontext(claim, lead)` baut den `EvalContext` aus der Claim-SSoT; `katalog.ts` (`getAlleSlots`/`getSlotsFuerFall`/`getPflichtSlotsFuerFall` + `ruleEvaluator`) ist die Resolution-Schicht; `getOffeneDokumentAnforderungen`/`createPflichtdokumenteFromKatalog`/`berechneErwartung` werden dünne Katalog-Ableitungen.

**Tech Stack:** Next.js 15, Supabase Postgres (apply_migration via MCP), vitest, Playwright, TypeScript.

## Global Constraints

- DDL **nur** via `mcp__plugin_supabase_supabase__apply_migration`; Migration-File-Name == getrackte Version (Twin-Drift, AGENTS.md Regel 2). `execute_sql` nur READ.
- Geteilte prod-DB (staging+prod) → Katalog-DDL erst nach **Aaron-Go** + grünem Katalog-Verify.
- Server-Actions Result-Object (`{ ok }`/`{ success }`), kein throw-Mix; `revalidatePath` bei Writes.
- Branch `kitta/pflichtdok-kanonisierung` (off staging). PR gegen staging, nie main.
- Frontend-Umlaute echt (ä/ö/ü/ß); Backend/Code-Kommentare ASCII ok.
- Gate pro Phase: `npx tsc --noEmit` (neue Files sauber), `vitest run`, betroffene Ratchets.

---

## Phase 1 — Katalog vervollständigen (DDL)

### Task 1: Katalog-Slots ADD + polizeibericht UPDATE

**Files:**
- Create: `supabase/migrations/<V>_pflichtdok_katalog_canon.sql` (Name == getrackte Version)
- Verify: read-only via MCP `execute_sql`

**Interfaces:**
- Produces: Katalog-Rows `gewerbenachweis`, `gf_vollmacht`, `halter_vollmacht`, `halter_ausweis` (alle `uploadbar_von` enthält `kunde`, `pflicht_wenn` gesetzt) + `polizeibericht.pflicht_wenn/freigeschaltet_wenn = {or:[polizei_vor_ort, fahrerflucht]}`. Diese Slots/Regeln sind das, woraus Phase 2/3 ableiten.

- [ ] **Step 1: DDL schreiben + via Plugin anwenden** (nach Aaron-Go)

`apply_migration({ name: "pflichtdok_katalog_canon", query: <DDL> })` mit:

```sql
-- 4 Kunde-Pflicht-Slots in den Katalog (waren nur im Code-Supplementaer)
insert into public.dokument_katalog
  (slot_id, label, beschreibung, kategorie, freigeschaltet_wenn, pflicht_wenn,
   sichtbar_fuer, anforderbar_von, uploadbar_von, multi_file, akzeptierte_mime_types,
   max_mb, sort_order, aktiv, steuert_kundensichtbarkeit)
values
 ('halter_vollmacht','Halter-Vollmacht','Vollmacht des Fahrzeughalters wenn Halter != Anrufer.','stammdaten',
   '{"op":"eq","field":"lead.halter_ungleich_fahrer_flag","value":true}'::jsonb,
   '{"op":"eq","field":"lead.halter_ungleich_fahrer_flag","value":true}'::jsonb,
   array['kunde','kundenbetreuer','admin'], array['kundenbetreuer','admin'], array['kunde'],
   false, array['application/pdf','image/jpeg','image/png'], 10, 6, true, false),
 ('halter_ausweis','Halter-Ausweis','Ausweis des Fahrzeughalters wenn Halter != Anrufer.','stammdaten',
   '{"op":"eq","field":"lead.halter_ungleich_fahrer_flag","value":true}'::jsonb,
   '{"op":"eq","field":"lead.halter_ungleich_fahrer_flag","value":true}'::jsonb,
   array['kunde','kundenbetreuer','admin'], array['kundenbetreuer','admin'], array['kunde'],
   false, array['application/pdf','image/jpeg','image/png'], 10, 7, true, false),
 ('gewerbenachweis','Gewerbenachweis','Gewerbeanmeldung bzur Vorsteuer-Pruefung.','stammdaten',
   '{"op":"or","conditions":[{"op":"eq","field":"lead.gewerbe_flag","value":true},{"op":"eq","field":"lead.vorsteuerabzugsberechtigt","value":true}]}'::jsonb,
   '{"op":"or","conditions":[{"op":"eq","field":"lead.gewerbe_flag","value":true},{"op":"eq","field":"lead.vorsteuerabzugsberechtigt","value":true}]}'::jsonb,
   array['kunde','kundenbetreuer','admin'], array['kundenbetreuer','admin'], array['kunde'],
   false, array['application/pdf','image/jpeg','image/png'], 10, 8, true, false),
 ('gf_vollmacht','Geschaeftsfuehrer-Vollmacht','Vollmacht des Geschaeftsfuehrers bei Gewerbe.','stammdaten',
   '{"op":"or","conditions":[{"op":"eq","field":"lead.gewerbe_flag","value":true},{"op":"eq","field":"lead.vorsteuerabzugsberechtigt","value":true}]}'::jsonb,
   '{"op":"or","conditions":[{"op":"eq","field":"lead.gewerbe_flag","value":true},{"op":"eq","field":"lead.vorsteuerabzugsberechtigt","value":true}]}'::jsonb,
   array['kunde','kundenbetreuer','admin'], array['kundenbetreuer','admin'], array['kunde'],
   false, array['application/pdf','image/jpeg','image/png'], 10, 9, true, false)
on conflict (slot_id) do nothing;

-- polizeibericht: Fahrerflucht-Fall aufnehmen (war nur polizei_vor_ort)
update public.dokument_katalog set
  freigeschaltet_wenn = '{"op":"or","conditions":[{"op":"eq","field":"lead.polizei_vor_ort","value":true},{"op":"eq","field":"lead.fahrerflucht","value":true}]}'::jsonb,
  pflicht_wenn        = '{"op":"or","conditions":[{"op":"eq","field":"lead.polizei_vor_ort","value":true},{"op":"eq","field":"lead.fahrerflucht","value":true}]}'::jsonb
where slot_id = 'polizeibericht';
```

- [ ] **Step 2: Getrackte Version ablesen + File committen**

`list_migrations` → Version `<V>` ablesen; File als `supabase/migrations/<V>_pflichtdok_katalog_canon.sql` mit obigem DDL anlegen. `git add` + commit.

- [ ] **Step 3: Verify (READ via execute_sql)**

```sql
select slot_id, freigeschaltet_wenn::text, pflicht_wenn::text, uploadbar_von
from dokument_katalog
where slot_id in ('halter_vollmacht','halter_ausweis','gewerbenachweis','gf_vollmacht','polizeibericht')
order by slot_id;
```
Expected: 4 neue Slots mit `kunde` in uploadbar_von + gesetztem pflicht_wenn; polizeibericht mit OR-Regel.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/<V>_pflichtdok_katalog_canon.sql
git commit -m "feat(pflichtdok-canon): Katalog vervollstaendigt (gewerbe/halter-Slots + polizeibericht-fahrerflucht-Regel)"
```

---

## Phase 2 — Kontext + operative Anzeige aus Katalog

### Task 2: `buildDokumentKontext` (kanonischer EvalContext)

**Files:**
- Create: `src/lib/dokumente/build-kontext.ts`
- Test: `src/lib/dokumente/build-kontext.test.ts`

**Interfaces:**
- Consumes: `EvalContext` aus `./ruleEvaluator`.
- Produces: `buildDokumentKontext(args: { claim?: Record<string,unknown>|null; lead?: Record<string,unknown>|null }): EvalContext` — Keys `lead.*`/`fall.*` wie von den Katalog-Regeln referenziert. Claim-SSoT gewinnt vor Lead.

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { buildDokumentKontext } from './build-kontext'

describe('buildDokumentKontext', () => {
  it('mappt Claim-SSoT auf Katalog-Regel-Keys', () => {
    const ctx = buildDokumentKontext({
      claim: { hat_personenschaden: true, halter_ungleich_fahrer: true, polizei_vor_ort: false, fahrerflucht: true, finanzierung_leasing: 'leasing' },
      lead: { zb1_status: 'offen' },
    })
    expect(ctx['lead.personenschaden_flag']).toBe(true)
    expect(ctx['lead.halter_ungleich_fahrer_flag']).toBe(true)
    expect(ctx['lead.fahrerflucht']).toBe(true)
    expect(ctx['lead.finanzierung_leasing']).toBe('leasing')
    expect(ctx['lead.zb1_status']).toBe('offen')
  })
  it('Claim gewinnt vor Lead bei Konflikt', () => {
    const ctx = buildDokumentKontext({ claim: { hat_sachschaden: true }, lead: { sachschaden_flag: false } })
    expect(ctx['lead.sachschaden_flag']).toBe(true)
  })
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest run src/lib/dokumente/build-kontext.test.ts` (Expected: "buildDokumentKontext is not a function")

- [ ] **Step 3: Implement**
```ts
// Kanonischer EvalContext fuer dokument_katalog-Regeln aus der Claim-SSoT.
// Claim gewinnt vor Lead; Keys spiegeln die lead.*/fall.*-Referenzen der Seeds.
import type { EvalContext } from './ruleEvaluator'

type Row = Record<string, unknown> | null | undefined
const pick = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null) ?? null

export function buildDokumentKontext(args: { claim?: Row; lead?: Row }): EvalContext {
  const c = (args.claim ?? {}) as Record<string, unknown>
  const l = (args.lead ?? {}) as Record<string, unknown>
  return {
    'lead.zb1_status': pick(l.zb1_status),
    'lead.polizei_vor_ort': pick(c.polizei_vor_ort, l.polizei_vor_ort),
    'lead.fahrerflucht': pick(c.fahrerflucht, l.fahrerflucht),
    'lead.personenschaden_flag': pick(c.hat_personenschaden, l.personenschaden_flag),
    'lead.sachschaden_flag': pick(c.hat_sachschaden, l.sachschaden_flag),
    'lead.gewerbe_flag': pick(c.gewerbe_flag, l.gewerbe_flag),
    'lead.vorsteuerabzugsberechtigt': pick(c.vorsteuerabzugsberechtigt, l.vorsteuerabzugsberechtigt),
    'lead.finanzierung_leasing': pick(c.finanzierung_leasing, l.finanzierung_leasing),
    'lead.halter_ungleich_fahrer_flag': pick(c.halter_ungleich_fahrer, l.halter_ungleich_fahrer_flag),
    'lead.zeugen_vorhanden': pick(c.zeugen_vorhanden, l.zeugen_vorhanden),
    'lead.mietwagen_flag': pick(c.hat_mietwagen, l.mietwagen_flag),
    'lead.nutzungsausfall': pick(c.hat_nutzungsausfall, l.nutzungsausfall),
    'fall.zeugen_vorhanden': pick(c.zeugen_vorhanden),
    'fall.vorschaden_erkannt': pick(c.vorschaden_erkannt),
    'fall.technische_stellungnahme_status': pick(c.technische_stellungnahme_status),
    'fall.nachbesichtigung_status': pick(c.nachbesichtigung_status),
  }
}
```

- [ ] **Step 4: Run → PASS** `npx vitest run src/lib/dokumente/build-kontext.test.ts`
- [ ] **Step 5: Commit** `git commit -am "feat(pflichtdok-canon): buildDokumentKontext (Claim-SSoT -> EvalContext)"`

### Task 3: `getOffeneDokumentAnforderungen` aus Katalog ableiten + Smoke flippen

**Files:**
- Modify: `src/lib/claims/data-requirements.ts` (DOC_DEFINITIONS + SLOT_REIHENFOLGE löschen; Signatur ändern)
- Modify: `src/lib/dokumente/pflichtdok-konsistenz.test.ts` (4 `it.fails` → reguläre `it`)
- Test: bestehende `pflichtdok-konsistenz.test.ts`

**Interfaces:**
- Consumes: `DokumentKatalogRow` (`@/lib/dokumente/katalog`), `EvalContext` + `evaluateKatalogRule` (`@/lib/dokumente/ruleEvaluator`), `buildDokumentKontext`.
- Produces: `getOffeneDokumentAnforderungen(katalogRows: DokumentKatalogRow[], ctx: EvalContext, pflichtDocs: PflichtdokumentStand[], rolle?: string): DokumentAnforderung[]` — rein. Default `rolle='kunde'`. `DokumentAnforderung` Shape unverändert (`slot_id,label,beschreibung,pflicht,status,pflichtdoc`).

- [ ] **Step 1: Smoke umstellen (RED→soll grün werden)** — die 4 `it.fails` in `pflichtdok-konsistenz.test.ts` zu `it` machen + den Vergleich auf die NEUE katalog-abgeleitete Funktion ziehen (statt der 8-Hardcode-Version). Helper `dataReqPflicht` ruft jetzt `getOffeneDokumentAnforderungen(KATALOG_FIXTURES, buildDokumentKontext({claim}), [])`. KATALOG_FIXTURES = die relevanten Live-Katalog-Rows als Konstante im Test (freigabe_bank/polizeibericht[OR]/zeugenbericht/diagnosebericht/aerztliches_attest/fahrzeugschein/schadensfotos/unfallfotos/sachschaden_*).

- [ ] **Step 2: Run → FAIL** `npx vitest run src/lib/dokumente/pflichtdok-konsistenz.test.ts` (die Ex-it.fails schlagen jetzt als regulär fehl, weil data-requirements noch die Hardcodes nutzt)

- [ ] **Step 3: Implement Rewrite**
```ts
import type { DokumentKatalogRow } from '@/lib/dokumente/katalog'
import { evaluateKatalogRule, type EvalContext } from '@/lib/dokumente/ruleEvaluator'
import type { PflichtdokumentStand } from '@/app/kunde/onboarding/actions'

export type DokumentStatus = 'offen' | 'erfuellt' | 'spaeter' | 'nicht_relevant'
export type DokumentAnforderung = { slot_id: string; label: string; beschreibung: string; pflicht: boolean; status: DokumentStatus; pflichtdoc?: PflichtdokumentStand }

export function getOffeneDokumentAnforderungen(
  katalogRows: DokumentKatalogRow[],
  ctx: EvalContext,
  pflichtDocs: PflichtdokumentStand[],
  rolle: string = 'kunde',
): DokumentAnforderung[] {
  const result: DokumentAnforderung[] = []
  for (const slot of katalogRows) {
    if (!slot.uploadbar_von?.includes(rolle)) continue
    if (!evaluateKatalogRule(slot.freigeschaltet_wenn, ctx)) continue
    const pflichtdoc = pflichtDocs.find((d) => d.slot_id === slot.slot_id)
    const pflicht = !!(pflichtdoc?.pflicht || (slot.pflicht_wenn != null && evaluateKatalogRule(slot.pflicht_wenn, ctx)))
    let status: DokumentStatus
    if (pflichtdoc?.dokument_url) status = 'erfuellt'
    else if (pflichtdoc?.status === 'spaeter') status = 'spaeter'
    else status = 'offen'
    result.push({ slot_id: slot.slot_id, label: slot.label, beschreibung: slot.beschreibung ?? '', pflicht, status, pflichtdoc })
  }
  // Legacy/KB-DB-Slots die nicht im Katalog sind, weiterhin durchreichen
  const seen = new Set(result.map((r) => r.slot_id))
  for (const pd of pflichtDocs) {
    if (seen.has(pd.slot_id)) continue
    let status: DokumentStatus = pd.dokument_url ? 'erfuellt' : pd.status === 'spaeter' ? 'spaeter' : 'offen'
    result.push({ slot_id: pd.slot_id, label: pd.label ?? pd.slot_id, beschreibung: pd.beschreibung ?? '', pflicht: !!pd.pflicht, status, pflichtdoc: pd })
  }
  result.sort((a, b) => {
    const oa = katalogRows.find((s) => s.slot_id === a.slot_id)?.sort_order ?? 999
    const ob = katalogRows.find((s) => s.slot_id === b.slot_id)?.sort_order ?? 999
    return oa - ob || (a.label ?? '').localeCompare(b.label ?? '', 'de')
  })
  return result
}
export function countOffenePflicht(a: DokumentAnforderung[]): number {
  return a.filter((x) => x.pflicht && x.status !== 'erfuellt').length
}
```

- [ ] **Step 4: Run → PASS** `npx vitest run src/lib/dokumente/pflichtdok-konsistenz.test.ts` (6+4 jetzt alle grün)
- [ ] **Step 5: Commit** `git commit -am "feat(pflichtdok-canon): getOffeneDokumentAnforderungen aus Katalog (8 Hardcodes raus); Smoke gruen"`

### Task 4: Call-Sites auf neue Signatur threaden

**Files:**
- Modify: `src/lib/claims/pflicht-for-fall.ts:117` (server: `getAlleSlots` + `buildDokumentKontext` + neue Signatur)
- Modify: `src/app/kunde/onboarding/page.tsx` (server) → Katalog-Rows + ctx als Prop an `OnboardingWizard`
- Modify: `src/app/kunde/onboarding/OnboardingWizard.tsx:249` (client: Props statt direkter Aufruf-Args)
- Modify: `src/components/kunde/OffeneDatenBanner.tsx:47` + Server-Parent
- Modify: `src/components/gutachter/AuftragDokumenteBanner.tsx:110` + Server-Parent

**Interfaces:**
- Consumes: `getOffeneDokumentAnforderungen` (neue Signatur, Task 3), `getAlleSlots` + `buildDokumentKontext`.

- [ ] **Step 1:** Pro Call-Site: server-seitig `const katalogRows = await getAlleSlots(supabase)` + `const ctx = buildDokumentKontext({ claim, lead })`, dann `getOffeneDokumentAnforderungen(katalogRows, ctx, pflichtDocs, rolle)`. Client-Komponenten erhalten `katalogRows` + `ctx` (oder direkt das Ergebnis) als Prop vom Server-Parent.
- [ ] **Step 2: Build** `npm run build` (Routen/Layout betroffen → voller Build, nicht nur tsc). Expected: grün.
- [ ] **Step 3: Commit** `git commit -am "refactor(pflichtdok-canon): Call-Sites auf Katalog-abgeleitete Anforderungen"`

### Task 5: Before/After-Harness über Live-Claims (MCP READ)

**Files:** kein Code — Verifikation via `execute_sql` (read-only), Ergebnis in `docs/26.06.2026/onboarding-pflichtdok-smoke/SMOKE.md` notieren.

- [ ] **Step 1:** Read-only Query: pro Claim die OLD operative Pflicht-Menge (8 Hardcodes als CASE) vs die NEW Katalog-Menge (CASE über die Live-Regeln: fahrzeugschein[zb1!=bestaetigt], schadensfotos/unfallfotos[immer], polizeibericht[polizei_vor_ort OR fahrerflucht], aerztliches_attest+diagnosebericht[personenschaden], sachschaden_*[sachschaden], freigabe_bank[leasing/finanzierung], gewerbe-/halter-Slots, zeugenbericht[zeugen]) — diff je Claim.
- [ ] **Step 2:** Erwartung: Diffs = nur Zugewinne (Leasing→freigabe_bank, fahrerflucht→polizeibericht, zeugen, gewerbe/halter). **Keine** Slots die ein Claim VERLIERT (insb. Halter-Docs durch Wegfall des Nachname-Band-Aids). Falls Verlust → Eskalation an Aaron (Daten-Fix) bevor P2 merged.

---

## Phase 3 — Anlage + Dispatch

### Task 6: `createPflichtdokumenteFromKatalog` aus Katalog

**Files:**
- Modify: `src/lib/dokumente/create-pflicht.ts` (Supplementär-Hardcodes raus; Katalog-Loop rein)
- Test: `src/lib/dokumente/create-pflicht.test.ts` (neu)

**Interfaces:**
- Consumes: `getPflichtSlotsFuerFall` (`@/lib/dokumente/katalog`), `buildDokumentKontext`.

- [ ] **Step 1: Failing test** — Mock-Supabase liefert Katalog-Rows; bei `{claim:{finanzierung_leasing:'leasing'}}` wird `freigabe_bank` als pflichtdokumente-Row angelegt (idempotent: bestehende nicht doppelt).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** — `const ctx = buildDokumentKontext({lead, fall}); const slots = await getPflichtSlotsFuerFall(supabase, ctx)`; pro Slot Row anlegen wenn nicht existent (bestehende `existingSlots`-Idempotenz behalten). Supplementär-Block + ungenutzten `berechneErwartung`-Import entfernen.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat(pflichtdok-canon): create-pflicht legt Rows aus Katalog an"`

### Task 7: `berechneErwartung` Katalog-Wrapper + slot-id-Reconcile

**Files:**
- Modify: `src/lib/dokumente/erwartung.ts` (berechneErwartung → Katalog-Ableitung ODER `DokumenteAnfordernCard` direkt auf Katalog; `zeugenaussage` raus)
- Modify: `src/app/dispatch/leads/[id]/_phases/DokumenteAnfordernCard.tsx` (falls direkt)

**Interfaces:**
- Consumes: Katalog-Helper, `buildDokumentKontext`.

- [ ] **Step 1:** Prüfen ob Live-Daten den Slot `zeugenaussage` in `pflichtdokumente`/`fall_dokumente` haben (READ): `select count(*) from pflichtdokumente where dokument_typ='zeugenaussage';` — falls >0: Daten-Migration zu `zeugenbericht` (apply_migration). Falls 0: nur Code.
- [ ] **Step 2:** `DokumenteAnfordernCard` zieht die Erwartung aus dem Katalog (server-geladene Rows + `buildDokumentKontext(lead)`); `berechneErwartung` wird Wrapper oder entfällt (knip-Check). `zeugenaussage`-Pfad raus.
- [ ] **Step 3: Build** `npm run build` + `npx vitest run`
- [ ] **Step 4: Commit** `git commit -am "feat(pflichtdok-canon): berechneErwartung Katalog-Wrapper + zeugen-slot-id reconcile"`

---

## Abschluss
- `npm run build` + `npx vitest run` + Playwright-Smoke (PR #3202 spec) grün.
- Before/After-Harness (Task 5) dokumentiert.
- `finishing-a-development-branch` → PR gegen staging (Katalog-DDL ist schon prod-applied; PR = Code + Migration-File).
