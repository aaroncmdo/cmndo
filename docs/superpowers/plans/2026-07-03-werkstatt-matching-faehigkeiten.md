# Werkstatt-Matching: Fähigkeiten + Schadenskategorie (SP1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (empfohlen) oder superpowers:executing-plans. Steps nutzen `- [ ]` Checkbox-Syntax.

**Goal:** Fachliches Werkstatt-Matching: Kunde gibt physische Schadenskategorie an, Werkstätten tragen Fähigkeiten, Picker rankt passende Werkstätten zuerst (nie leer).

**Architecture:** Additive DB-Spalten (`werkstaetten.faehigkeiten`, `leads/claims.schadenskategorie`) + neues `onboarding_felder`-Chip-Feld (Kunde) + `rankWerkstaetten` um `passt`-Score erweitert (rückwärtskompatibel) + Admin-Fähigkeiten-Erfassung. KEIN neuer RPC.

**Tech Stack:** Next.js 15 Server-Actions, Supabase (apply_migration/Plugin), vitest, react-email n/a.

## Global Constraints (aus der Spec, verbatim)

- **Vokabular** (Kategorie = Fähigkeit, gleiche Tokens): `karosserie` · `lackierung` · `mechanik` · `glas` · `smart_repair` (+ `unbekannt` nur für schadenskategorie).
- **`werkstaetten.faehigkeiten` leer/NULL = Vollservice** (alle Kategorien) → Bestandspartner nicht ausgeschlossen.
- **DDL nur via Plugin** (`apply_migration` → `list_migrations` → File==Version). `execute_sql` nur READ. **`onboarding_felder`-Insert via `apply_migration`** (getrackte Daten-Migration).
- **`onboarding_felder`-`phase_id` NIE hardcoden** → dynamisch via `(select id from onboarding_phasen where flow_key='lead-erfassung' and phase_key='schaden')` (Lehre 1069c2a2/c4bfe730a).
- **Koordination 1069c2a2** (finder.ts/vermittlung-server.ts/convert-lead-to-claim.ts, #3433+#3498 auf prod): strikt additiv; `buildZuweisungPatch(userId:string|null)` NICHT anfassen (kein `?? ''`); fiktiv-Gate = SP4.
- Server-Actions: Result-Object `{ ok, error? }`. UI echte Umlaute. Branch `kitta/werkstatt-matching-faehigkeiten` (off staging).

---

### Task 1: DB-Spalten (faehigkeiten + schadenskategorie)

**Files:**
- Create: `supabase/migrations/<V1>_werkstaetten_faehigkeiten.sql`
- Create: `supabase/migrations/<V2>_leads_claims_schadenskategorie.sql`

- [ ] **Step 1: Migration faehigkeiten anwenden**

`apply_migration({ name: "werkstaetten_faehigkeiten", query: <DDL> })`:
```sql
ALTER TABLE public.werkstaetten ADD COLUMN IF NOT EXISTS faehigkeiten text[];
COMMENT ON COLUMN public.werkstaetten.faehigkeiten IS
  'Werkstatt-Faehigkeiten (karosserie/lackierung/mechanik/glas/smart_repair); NULL/leer = Vollservice = alle Kategorien.';
```

- [ ] **Step 2: Migration schadenskategorie anwenden**

`apply_migration({ name: "leads_claims_schadenskategorie", query: <DDL> })`:
```sql
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS schadenskategorie text;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS schadenskategorie text;
ALTER TABLE public.leads ADD CONSTRAINT leads_schadenskategorie_check
  CHECK (schadenskategorie IS NULL OR schadenskategorie = ANY(ARRAY['karosserie','lackierung','mechanik','glas','smart_repair','unbekannt']));
ALTER TABLE public.claims ADD CONSTRAINT claims_schadenskategorie_check
  CHECK (schadenskategorie IS NULL OR schadenskategorie = ANY(ARRAY['karosserie','lackierung','mechanik','glas','smart_repair','unbekannt']));
```

- [ ] **Step 3: Versionen ablesen + Files committen**

`execute_sql`: `select version, name from supabase_migrations.schema_migrations where name in ('werkstaetten_faehigkeiten','leads_claims_schadenskategorie') order by version desc;` → `<V1>`/`<V2>` ablesen, Files exakt danach benennen (Regel 2 Schritt 3+4).

- [ ] **Step 4: Verifizieren (READ)**

`execute_sql`: `select column_name from information_schema.columns where table_name='werkstaetten' and column_name='faehigkeiten';` + Constraint-Defs prüfen (`pg_get_constraintdef`).

- [ ] **Step 5: Commit** (7-Punkte-Audit; Build: n/a DDL, tsc im Folge-Task).

---

### Task 2: onboarding_feld `schadenskategorie` (Kunde-Chip)

**Files:**
- Create: `supabase/migrations/<V3>_onboarding_feld_schadenskategorie.sql`

**Interfaces:**
- Consumes: `onboarding_phasen (flow_key='lead-erfassung', phase_key='schaden')` (verifiziert), `leads.schadenskategorie` (Task 1).

- [ ] **Step 1: Insert via apply_migration (phase_id DYNAMISCH)**

`apply_migration({ name: "onboarding_feld_schadenskategorie", query: <DDL> })`:
```sql
INSERT INTO public.onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, pflicht, optionen, db_target, conditional_on, audience, sektion)
SELECT
  p.id, 145, 'schadenskategorie', 'toggle-cards',
  'Was ist an deinem Fahrzeug beschädigt?', false,
  '[{"label":"Karosserie / Blech","value":"karosserie"},{"label":"Lackierung / Kratzer","value":"lackierung"},{"label":"Mechanik / Motor","value":"mechanik"},{"label":"Glas","value":"glas"},{"label":"Weiß ich nicht","value":"unbekannt"}]'::jsonb,
  '{"tabelle":"leads","spalte":"schadenskategorie"}'::jsonb,
  '{"feld":"reparaturwunsch","gleich":"reparatur"}'::jsonb,
  'beide', 'schaden'
FROM public.onboarding_phasen p
WHERE p.flow_key = 'lead-erfassung' AND p.phase_key = 'schaden'
ON CONFLICT DO NOTHING;
```
**Hinweis Plan-Implementer:** die exakte `conditional_on`-jsonb-Form (oben `{"feld":...,"gleich":...}`) VOR dem Insert gegen ein bestehendes conditional-Feld verifizieren:
`select feld_key, conditional_on from onboarding_felder where conditional_on is not null limit 3;` → Form angleichen falls abweichend (z.B. `{"field":...,"equals":...}` oder anderes Schema). FieldRenderer-Logik (`src/components/onboarding/FieldRenderer.tsx`) bestätigt den Key-Namen.

- [ ] **Step 2: Version ablesen + File committen** (`<V3>`).

- [ ] **Step 3: Verifizieren (READ)**

`execute_sql`: `select feld_key, typ, phase_id, conditional_on, db_target from onboarding_felder where feld_key='schadenskategorie';` → phase_id ist die resolved schaden-id (nicht NULL), conditional_on gesetzt.

- [ ] **Step 4: Commit** (Audit; UI: Feld erscheint im Flow-Feststellungs-Step wenn reparaturwunsch='reparatur').

---

### Task 3: Carry-over Lead→Claim (schadenskategorie)

**Files:**
- Modify: `src/lib/leads/convert-lead-to-claim.ts` (bei den anderen reparatur-Carry-over-Zeilen, ~Z. 460)

**Interfaces:**
- Consumes: `leads.schadenskategorie`, `claims.schadenskategorie` (Task 1).

- [ ] **Step 1: Additive Carry-over-Zeile**

Bei den bestehenden `reparaturwunsch`/`reparatur_vermittlung_status`-Carry-over-Zeilen ergänzen (Muster identisch):
```ts
;(claimsInsert as Record<string, unknown>).schadenskategorie =
    (lead.schadenskategorie as string | null) ?? null
```
Falls `lead` typisiert selektiert wird und `schadenskategorie` fehlt: die Select-Spaltenliste des Lead-Fetch um `schadenskategorie` ergänzen (additiv).

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` → grün (0 Fehler).

- [ ] **Step 3: Commit** (Audit; ⚠ Koordination: 1069c2a2-File, additive Zeile).

---

### Task 4: Matching — `rankWerkstaetten` + `passt` (TDD-Kern)

**Files:**
- Modify: `src/lib/werkstatt/finder.ts`
- Modify: `src/lib/werkstatt/vermittlung-server.ts` (`findReparaturWerkstaettenForTarget`)
- Test: `src/lib/werkstatt/__tests__/finder.test.ts` (existiert → erweitern)

**Interfaces:**
- Produces: `WerkstattFinderRow` += `faehigkeiten: string[] | null` + `passt: boolean`; `rankWerkstaetten(rows, origin, kategorie?)`; `findWerkstaetten({..., kategorie?})`; `computePasst(faehigkeiten, kategorie)`.

- [ ] **Step 1: Failing Tests** — in `finder.test.ts` ergänzen:
```ts
import { rankWerkstaetten } from '../finder'

const base = (over: Partial<{ id: string; faehigkeiten: string[] | null; lat: number; lng: number }>) => ({
  id: over.id ?? 'w', name: over.id ?? 'W', adresse_strasse: null, adresse_plz: null,
  adresse_ort: null, telefon: null, lat: over.lat ?? 50.9, lng: over.lng ?? 6.9,
  status: 'aktiv', faehigkeiten: over.faehigkeiten ?? null,
})
const ORIGIN = { lat: 50.94, lng: 6.96 } // Köln

describe('rankWerkstaetten + Kategorie', () => {
  it('ohne kategorie: reine Distanz-Sortierung (Regression)', () => {
    const nah = base({ id: 'nah', lat: 50.94, lng: 6.96 })
    const fern = base({ id: 'fern', lat: 52.5, lng: 13.4 })
    const r = rankWerkstaetten([fern, nah], ORIGIN)
    expect(r.map((x) => x.id)).toEqual(['nah', 'fern'])
    expect(r[0].passt).toBe(true)
  })
  it('faehigkeiten leer = Vollservice -> passt=true', () => {
    const r = rankWerkstaetten([base({ id: 'voll', faehigkeiten: [] })], ORIGIN, 'karosserie')
    expect(r[0].passt).toBe(true)
  })
  it('kategorie nicht in faehigkeiten -> passt=false, hinter passenden', () => {
    const glas = base({ id: 'glas', faehigkeiten: ['glas'], lat: 50.94, lng: 6.96 }) // näher
    const voll = base({ id: 'voll', faehigkeiten: ['karosserie', 'lackierung'], lat: 51.2, lng: 6.8 }) // ferner
    const r = rankWerkstaetten([glas, voll], ORIGIN, 'karosserie')
    expect(r.map((x) => x.id)).toEqual(['voll', 'glas']) // passt zuerst, trotz größerer Distanz
    expect(r.find((x) => x.id === 'glas')!.passt).toBe(false)
  })
  it('alle unpassend -> Liste trotzdem nicht leer', () => {
    const r = rankWerkstaetten([base({ id: 'glas', faehigkeiten: ['glas'] })], ORIGIN, 'karosserie')
    expect(r).toHaveLength(1)
    expect(r[0].passt).toBe(false)
  })
  it("kategorie 'unbekannt' -> kein Filter (alle passt=true)", () => {
    const r = rankWerkstaetten([base({ id: 'glas', faehigkeiten: ['glas'] })], ORIGIN, 'unbekannt')
    expect(r[0].passt).toBe(true)
  })
})
```

- [ ] **Step 2: Test → FAIL**

Run: `npx vitest run src/lib/werkstatt/__tests__/finder.test.ts`
Expected: FAIL (`passt` existiert nicht / rankWerkstaetten nimmt keinen 3. Param).

- [ ] **Step 3: finder.ts erweitern**

`WerkstattFinderRow`-Typ (Z. 11-22) um `faehigkeiten: string[] | null` (vor `distanz_km`) + `passt: boolean` (nach `distanz_km`). Helper + rankWerkstaetten ersetzen:
```ts
/** Deckt die Werkstatt die Schadenskategorie ab? Leer/kein-Filter = ja. */
export function computePasst(faehigkeiten: string[] | null | undefined, kategorie?: string | null): boolean {
  if (kategorie == null || kategorie === 'unbekannt') return true
  if (!faehigkeiten || faehigkeiten.length === 0) return true
  return faehigkeiten.includes(kategorie)
}

export function rankWerkstaetten(
  rows: Array<Omit<WerkstattFinderRow, 'distanz_km' | 'passt'>>,
  origin: { lat: number; lng: number },
  kategorie?: string | null,
): WerkstattFinderRow[] {
  return rows
    .filter((r) => r.status === STATUS_AKTIV)
    .map((r) => ({
      ...r,
      distanz_km:
        r.lat !== null && r.lng !== null
          ? haversineKm(origin.lat, origin.lng, r.lat, r.lng)
          : Infinity,
      passt: computePasst(r.faehigkeiten, kategorie),
    }))
    .sort((a, b) => (a.passt === b.passt ? a.distanz_km - b.distanz_km : a.passt ? -1 : 1))
}
```
`SELECT_COLS` (Z. 52) um `,faehigkeiten` ergänzen. `findWerkstaetten`-Signatur um `kategorie?: string | null` erweitern + an `rankWerkstaetten(rows, {lat,lng}, input.kategorie)` durchreichen (Z. 82). Im PLZ-Fallback (Z. 87-90) jede Row um `passt: computePasst(r.faehigkeiten, input.kategorie)` ergänzen.

- [ ] **Step 4: Test → PASS**

Run: `npx vitest run src/lib/werkstatt/__tests__/finder.test.ts` → PASS (alle, inkl. bestehende).

- [ ] **Step 5: vermittlung-server.ts — Kategorie durchreichen**

In `findReparaturWerkstaettenForTarget` (`vermittlung-server.ts`): den Lead-/Claim-Select um `schadenskategorie` erweitern, die geladene Kategorie merken und an `findWerkstaetten({ lat, lng, plz, kategorie, limit: 5 })` (Z. 75) übergeben. Additiv (kein bestehendes Verhalten geändert).

- [ ] **Step 6: tsc + Commit**

`npx tsc --noEmit` grün. Commit (Audit; ⚠ 1069c2a2-Files additiv).

---

### Task 5: Admin — Fähigkeiten erfassen (createWerkstatt + Editor)

**Files:**
- Modify: `src/app/admin/werkstaetten/actions.ts` (createWerkstatt-Insert + neue Action `setWerkstattFaehigkeiten`)
- Modify: `src/app/admin/werkstaetten/WerkstaettenClient.tsx` (Multi-Select im Create-Dialog + Fähigkeiten-Editor-Modal)
- Test: `src/app/admin/werkstaetten/__tests__/actions.test.ts` (erweitern)

**Interfaces:**
- Produces: `setWerkstattFaehigkeiten(werkstattId: string, faehigkeiten: string[]): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Failing Test** — in `actions.test.ts` ergänzen. Admin-Mock (aus SP-Login-Mail-Arbeit vorhanden: werkstaetten.update/eq) nutzen:
```ts
describe('setWerkstattFaehigkeiten', () => {
  it('gibt ok:false wenn nicht Admin', async () => {
    mockConfig.authUser = { id: 'u' }; mockConfig.profileRolle = 'dispatch'
    const { setWerkstattFaehigkeiten } = await import('../actions')
    expect((await setWerkstattFaehigkeiten('w-1', ['glas'])).ok).toBe(false)
  })
  it('admin -> ok:true', async () => {
    mockConfig.authUser = { id: 'a' }; mockConfig.profileRolle = 'admin'
    const { setWerkstattFaehigkeiten } = await import('../actions')
    expect((await setWerkstattFaehigkeiten('w-1', ['karosserie','lackierung'])).ok).toBe(true)
  })
})
```
(Falls der werkstaetten-Admin-Mock kein `.update().eq()` das resolved: minimal ergänzen — `update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null })`.)

- [ ] **Step 2: Test → FAIL**

Run: `npx vitest run src/app/admin/werkstaetten/__tests__/actions.test.ts` → FAIL (`setWerkstattFaehigkeiten` nicht exportiert).

- [ ] **Step 3: Action + createWerkstatt-Erweiterung**

In `actions.ts`:
```ts
const FAEHIGKEITEN_VALUES = ['karosserie', 'lackierung', 'mechanik', 'glas', 'smart_repair'] as const

export async function setWerkstattFaehigkeiten(
  werkstattId: string,
  faehigkeiten: string[],
): Promise<{ ok: boolean; error?: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Fähigkeiten setzen.' }
  const clean = faehigkeiten.filter((f) => (FAEHIGKEITEN_VALUES as readonly string[]).includes(f))
  const admin = createAdminClient()
  const { error } = await admin.from('werkstaetten').update({ faehigkeiten: clean }).eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}
```
`createWerkstatt`: FormData `faehigkeiten` (mehrfach) lesen + in den werkstaetten-Insert:
```ts
const faehigkeiten = formData.getAll('faehigkeiten').map(String).filter((f) => (FAEHIGKEITEN_VALUES as readonly string[]).includes(f))
```
und `faehigkeiten` (nur wenn `.length` > 0, sonst weglassen = NULL = Vollservice) in das `.insert({...})`-Objekt.

- [ ] **Step 4: Test → PASS**

Run: `npx vitest run src/app/admin/werkstaetten/__tests__/actions.test.ts` → PASS.

- [ ] **Step 5: UI — Multi-Select + Editor**

`WerkstaettenClient.tsx`: (a) im Create-Dialog eine Chip-Multi-Select-Gruppe (5 Fähigkeiten, `name="faehigkeiten"` je Chip als Checkbox → FormData `getAll`); (b) Button „Fähigkeiten" pro Zeile (analog „Staffel"/„QR", `Layers3Icon`→`WrenchIcon`) → Modal mit Chip-Toggles → `setWerkstattFaehigkeiten(w.id, selected)` → toast. Werte-Labels: Karosserie/Blech · Lackierung/Kratzer · Mechanik/Motor · Glas · Smart-Repair. Echte Umlaute, `primitives.Button`/`Modal`, Claimondo-Tokens.

- [ ] **Step 6: tsc + Build + Commit**

`npx tsc --noEmit` grün, `npm run build` (8GB, Route/Action-Change). Commit (Audit).

---

### Task 6: Gesamt-Verifikation + Prod-Smoke + PR

- [ ] **Step 1: Volle Test-Suite der berührten Files**

Run: `npx vitest run src/lib/werkstatt src/app/admin/werkstaetten` → grün (finder + vermittlung-core + admin actions).

- [ ] **Step 2: Ratchets**

`npm run check:token-audit` + `npm run check:component-set -- --warn` (nur neue Files prüfen — keine neue Verletzung).

- [ ] **Step 3: Prod-Smoke (echte Rolle, nie service-role-0)**

`execute_sql` mit gesetzten Fixtures: eine Test-Werkstatt `faehigkeiten=['glas']`, eine zweite Vollservice (leer), ein Claim `schadenskategorie='karosserie'` → `findWerkstaetten`-Logik via SQL-Nachbau ODER (besser) über die Lib gegen prod: verifizieren, dass Vollservice `passt=true` vor Glas-only (`passt=false`) rankt. Fixtures danach zurücksetzen (Werte auf NULL). (Kein echter Kunde/Partner-Send.)

- [ ] **Step 4: Push + PR gegen staging + Marker**

Push `kitta/werkstatt-matching-faehigkeiten`. PR-Body: SP1-Feature + ⚠ Koordination 1069c2a2 (additive Files) + Post-Deploy-Smoke (Kunde-Chip im Flow rendern, Werkstatt-Ranking). Marker `COORDINATION-kunde-werkstatt-vermittlung-4sp.md` auf „SP1 gebaut, PR #XXXX" + SP2 als nächstes.

---

## Self-Review (writing-plans)

- **Spec-Coverage:** Vokabular (Global Constraints) ✓ · werkstaetten.faehigkeiten + schadenskategorie-Spalten (Task 1) ✓ · Kunde-Chip onboarding_feld dynamic phase_id (Task 2) ✓ · Carry-over (Task 3) ✓ · Matching passt-Sort + rückwärtskompatibel (Task 4) ✓ · Admin create + Editor (Task 5) ✓ · Testing/Prod-Smoke/Koordination (Task 6 + je Task) ✓. Out-of-Scope (marken/SP2/3/4) nicht eingebaut ✓.
- **Platzhalter:** Ein bewusster Plan-Verify (conditional_on-jsonb-Form) mit konkretem Ableitungsweg — kein blindes TODO. Migrations-Versionen `<V1..V3>` sind Plugin-vergeben (Regel 2, kein Rateweg). Sonst vollständiger Code.
- **Typ-Konsistenz:** `rankWerkstaetten(rows, origin, kategorie?)` + `computePasst(faehigkeiten, kategorie)` + `WerkstattFinderRow.passt/faehigkeiten` identisch Task 4 (def) + Test. `setWerkstattFaehigkeiten(werkstattId, faehigkeiten) → {ok,error?}` identisch Task 5 (def) + Test. Vokabular-Tokens identisch über Migration-CHECK, optionen-values, FAEHIGKEITEN_VALUES, computePasst.
- **Koordination:** finder.ts/vermittlung-server.ts/convert-lead-to-claim.ts (1069c2a2) nur additiv; `buildZuweisungPatch` unangetastet; kein `?? ''`.
