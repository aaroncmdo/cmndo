# FlowLink operative Vollständigkeit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FlowLink-Step-Bedingungen von Ein-Feld-Stellvertretern auf echte Erhebungs-Vollständigkeit (`erhebt_felder`) umstellen, sodass Feststellung + Orte + Werkstatt operativ nötige Daten wirklich einsammeln; `nur_gutachter`-Phantom-Szenario löschen.

**Architecture:** Die Szenario-Matrix bleibt DB-driven (`flow_szenarien`/`flow_szenario_steps`), die Logik pure + getestet (`src/lib/self-service/`). Neue Spalte `erhebt_felder text[]` je Step, ausgewertet gegen den `FlowKontext`; ein Step bleibt sichtbar, solange ≥1 gelistete Rohspalte leer ist. Ein Test-Fixture spiegelt den DB-Seed und trägt die Regressions-Absicherung, sodass die Code-Arbeit unabhängig von der Migration testbar ist.

**Tech Stack:** TypeScript, Next.js (self-hosted), Supabase/Postgres, vitest, Node-Ratchet-Scripts.

## Global Constraints

- **Regel 2 (DDL):** Alle Migrationen ausschließlich über das Supabase-Plugin (`apply_migration`), Datei-Name == getrackte Version (`list_migrations`), Types nach jeder DDL regenerieren + committen. Kein raw `execute_sql` mit DDL, keine CLI-DDL. **⚠ Der Supabase-MCP war am 2026-07-21 getrennt — Phase 5 (Migrationen) ist erst ausführbar, wenn er wieder da ist. Phasen 1–4 (Code, Fixture, Ratchet, UI) brauchen ihn NICHT.**
- **Regel 4 (Prod-Smoke):** Nach Deploy jeder betroffene Flow per Playwright gegen `https://app.claimondo.de`, Test-Lead `telefon=NULL`. Task 11.
- **`istLeer`-Semantik unverändert:** `false`/`0` sind WERTE, nicht leer (`flow-szenarien.ts:41`) — schützt `freie_werkstattwahl=false`.
- **Kollision aar-956:** Die UI-Dateien unter `src/app/flow/[token]/` (`FlowWizardKfz.tsx`, `FlowOrtStep.tsx`, `self-service-actions.ts`) werden von aktiven `kitta/aar-956-embed-reservierung-rueckruf`-Sessions bearbeitet. **Vor Phase 4 den aktuellen `origin/staging`-Stand dieser Dateien ziehen + Collision-Hook/aar-956-Marker prüfen.** Die pure-Logik (`src/lib/self-service/*`) ist unkontendiert — Phasen 1–3 zuerst.
- **Reihenfolge-Invariante:** `berechneAktiveSteps` muss `erhebt_felder` VOR dem Fixture-Update honorieren (rückwärtskompatibel: leere Liste = kein Gate). Das `nur_gutachter`-Szenario darf erst gelöscht werden (DB + Fixture), wenn kein Code die Szenario-**id** hardcodet — verifiziert: `matcheSzenario` ist generisch; `service_typ='nur_gutachter'` (der VALUE, gated Downstream LexDrive) ist unabhängig von der Szenario-Row und bleibt.

---

## Phasen-Übersicht

| Phase | Tasks | Braucht MCP? | Kollision? |
|---|---|---|---|
| 1 · Pure Logik | 1–2 | nein | nein (lib/) |
| 2 · Fixture + Regression | 3 | nein | nein |
| 3 · Ratchet + Loader | 4–5 | nein | nein |
| 4 · UI | 6–8 | nein | **ja — aar-956 abgleichen** |
| 5 · Migrationen | 9–10 | **ja** | nein |
| 6 · Verifikation | 11 | — | — |

---

## Task 1: `erhebt_felder` im Typ + `berechneAktiveSteps`

**Files:**
- Modify: `src/lib/self-service/flow-szenarien.ts` (Typ `FlowSzenarioStep`, neue Fn `erhebtNoch`, `berechneAktiveSteps`)
- Test: `src/lib/self-service/__tests__/flow-szenarien.test.ts`

**Interfaces:**
- Produces: `erhebtNoch(felder: string[] | null | undefined, kontext: FlowKontext): boolean` (true = Step bleibt sichtbar). `FlowSzenarioStep` erhält `erhebt_felder?: string[] | null`.
- Consumes: bestehendes `istLeer` (privat, gleiche Datei), `FlowKontext`.

- [ ] **Step 1: Failing test** — in `flow-szenarien.test.ts`, neuer `describe`-Block:

```typescript
import { erhebtNoch } from '../flow-szenarien'

describe('erhebtNoch (erhebt_felder — Erhebungs-Vollständigkeit)', () => {
  it('leere/fehlende Liste -> kein Gate (Step bleibt sichtbar)', () => {
    expect(erhebtNoch(null, {})).toBe(true)
    expect(erhebtNoch([], { kennzeichen: 'B-XY-123' })).toBe(true)
  })
  it('sichtbar solange >=1 Feld leer', () => {
    expect(erhebtNoch(['kennzeichen', 'unfallhergang'], { kennzeichen: 'B-XY-123', unfallhergang: null })).toBe(true)
    expect(erhebtNoch(['kennzeichen'], { kennzeichen: '' })).toBe(true)
  })
  it('unsichtbar wenn ALLE gelisteten Felder gefüllt', () => {
    expect(erhebtNoch(['kennzeichen', 'unfallhergang'], { kennzeichen: 'B-XY-123', unfallhergang: 'Auffahrunfall' })).toBe(false)
  })
  it('false ist ein WERT, kein Leerwert (hat_vorschaeden=false zählt als erhoben)', () => {
    expect(erhebtNoch(['hat_vorschaeden'], { hat_vorschaeden: false })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/lib/self-service/__tests__/flow-szenarien.test.ts -t erhebtNoch`
Expected: FAIL — `erhebtNoch is not a function`.

- [ ] **Step 3: Implement** — in `flow-szenarien.ts`, `FlowSzenarioStep` erweitern und Fn ergänzen:

```typescript
export type FlowSzenarioStep = {
  szenario_id: string
  step_id: string
  reihenfolge: number
  bedingung: Record<string, unknown> | null
  /**
   * Operative Rohspalten, die dieser Step einsammelt. Der Step bleibt sichtbar, solange
   * MINDESTENS EINE davon leer ist. Leer/fehlend = kein Erhebungs-Gate (nur `bedingung` zählt).
   * NUR Rohspalten (kein DB-Default, kein *_effektiv) — der check:flow-erhebt-felder-Ratchet erzwingt das.
   */
  erhebt_felder?: string[] | null
  aktiv?: boolean
}

/**
 * Erhebungs-Gate: true, solange der Step noch operative Daten braucht (>=1 Feld leer)
 * oder keine erhebt_felder trägt. Gegenstück zu erfuelltBedingung (Zuständigkeit).
 */
export function erhebtNoch(felder: string[] | null | undefined, kontext: FlowKontext): boolean {
  if (!felder || felder.length === 0) return true
  return felder.some((f) => istLeer(kontext[f]))
}
```

Und `berechneAktiveSteps` um den Gate ergänzen:

```typescript
export function berechneAktiveSteps(
  steps: FlowSzenarioStep[],
  szenarioId: string,
  kontext: FlowKontext,
): string[] {
  return steps
    .filter((s) => s.szenario_id === szenarioId && s.aktiv !== false)
    .sort((a, b) => a.reihenfolge - b.reihenfolge)
    .filter((s) => erfuelltBedingung(s.bedingung, kontext))
    .filter((s) => erhebtNoch(s.erhebt_felder, kontext))
    .map((s) => s.step_id)
}
```

- [ ] **Step 4: Run tests, verify pass** (neuer Block + alle bestehenden — leere `erhebt_felder` = kein Verhaltenswechsel)

Run: `npx vitest run src/lib/self-service/__tests__/flow-szenarien.test.ts`
Expected: PASS (alle).

- [ ] **Step 5: Commit**

```bash
git add src/lib/self-service/flow-szenarien.ts src/lib/self-service/__tests__/flow-szenarien.test.ts
git commit -m "feat(flow): erhebt_felder-Gate in berechneAktiveSteps (rückwärtskompatibel)"
```

---

## Task 2: Rohspalten in den FlowKontext

**Files:**
- Modify: `src/lib/self-service/flow-kontext.ts` (`LeadFuerKontext`, `bauFlowKontext`)
- Test: `src/lib/self-service/__tests__/flow-kontext.test.ts` (existiert? sonst anlegen)

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `bauFlowKontext` trägt zusätzlich die Rohspalten `kennzeichen`, `gegner_versicherung`, `hat_vorschaeden`, `schadentyp`, `fahrzeug_standort_adresse`, `besichtigungsort_adresse` im Output-Kontext (roh, NEBEN den bestehenden `*_effektiv`-Feldern).

- [ ] **Step 1: Failing test** — `flow-kontext.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { bauFlowKontext } from '../flow-kontext'

describe('bauFlowKontext — Rohspalten für erhebt_felder', () => {
  it('trägt die operativen Rohspalten UND die abgeleiteten *_effektiv-Felder', () => {
    const k = bauFlowKontext(
      { schuldfrage: 'gegner', unfallort: 'Köln', fahrzeug_standort_adresse: null, kennzeichen: 'K-AB-12', hat_vorschaeden: false },
      false,
    )
    // Rohspalte leer -> erhebt_felder sieht sie als offen (Symptom 2: nicht per unfallort-Fallback maskiert)
    expect(k.fahrzeug_standort_adresse).toBeNull()
    // abgeleitetes Feld bleibt für Prefill/bedingung (Fallback auf unfallort)
    expect(k.fahrzeug_standort_effektiv).toBe('Köln')
    expect(k.kennzeichen).toBe('K-AB-12')
    expect(k.hat_vorschaeden).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/lib/self-service/__tests__/flow-kontext.test.ts`
Expected: FAIL — `k.fahrzeug_standort_adresse` undefined (heute nur `*_effektiv` im Output).

- [ ] **Step 3: Implement** — `LeadFuerKontext` um die neuen Rohfelder erweitern (`kennzeichen?`, `gegner_versicherung?`, `hat_vorschaeden?`, `schadentyp?` — `besichtigungsort_adresse`/`fahrzeug_standort_adresse` sind bereits drin), und im `bauFlowKontext`-Return die Rohwerte zusätzlich ausgeben:

```typescript
  return {
    schuldfrage,
    eigene_versicherung: eigeneVersicherung,
    service_typ: lead.service_typ ?? null,
    unfallhergang: lead.unfallhergang ?? null,
    fahrzeugschaden_beschreibung: lead.fahrzeugschaden_beschreibung ?? null,
    disqualifiziert: lead.disqualifiziert ?? null,
    // Rohspalten für erhebt_felder (roh = echte Erhebung, NICHT die *_effektiv-Fallback-Kette).
    kennzeichen: lead.kennzeichen ?? null,
    gegner_versicherung: lead.gegner_versicherung ?? null,
    hat_vorschaeden: lead.hat_vorschaeden ?? null,
    schadentyp: lead.schadentyp ?? null,
    unfallort: lead.unfallort ?? null,
    fahrzeug_standort_adresse: lead.fahrzeug_standort_adresse ?? null,
    besichtigungsort_adresse: lead.besichtigungsort_adresse ?? null,
    freie_werkstattwahl: lead.freie_werkstattwahl ?? null,
    sv_id: svHatTermin ? 'gesetzt' : null,
    reparatur_werkstatt_id: lead.reparatur_werkstatt_id ?? lead.werkstatt_id ?? null,
    // ... bestehende *_effektiv-Felder unverändert darunter
```

⚠ `hat_vorschaeden`/`freie_werkstattwahl` sind boolean — `?? null` bewahrt `false` (kein `||`). `LeadFuerKontext` bekommt `hat_vorschaeden?: boolean | null`, `freie_werkstattwahl?: boolean | null`, `kennzeichen?: string | null`, `gegner_versicherung?: string | null`, `schadentyp?: string | null`.

- [ ] **Step 4: Run, verify pass** (+ bestehende flow-Tests unberührt)

Run: `npx vitest run src/lib/self-service/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/self-service/flow-kontext.ts src/lib/self-service/__tests__/flow-kontext.test.ts
git commit -m "feat(flow): Rohspalten im FlowKontext (erhebt_felder liest roh, nicht *_effektiv)"
```

---

## Task 3: Ziel-Fixture + Regressions-Tests (Symptome 1/2/4)

**Files:**
- Modify: `src/lib/self-service/__tests__/flow-config-fixture.ts` (Ziel-Matrix)
- Modify: `src/lib/self-service/__tests__/flow-szenarien.test.ts` (Regression)

**Interfaces:**
- Consumes: `FlowSzenarioStep.erhebt_felder` (Task 1).

- [ ] **Step 1: Failing test** — Regression in `flow-szenarien.test.ts`:

```typescript
import { berechneAktiveSteps } from '../flow-szenarien'
import { STEPS_FIXTURE as STEPS } from './flow-config-fixture'

describe('erhebt_felder-Regression (Symptome 1/2/4)', () => {
  const base = { schuldfrage: 'eigenverantwortung', eigene_versicherung: 'ja' }
  it('Symptom 1: Kasko-Feststellung erscheint trotz hat_vorschaeden=false, solange kennzeichen leer', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', { ...base, hat_vorschaeden: false, kennzeichen: null, schadentyp: null })
    expect(steps).toContain('feststellung')
  })
  it('Symptom 2: ort_fahrzeug erscheint bei gesetztem unfallort aber leerer Rohspalte', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', {
      ...base, hat_vorschaeden: false, kennzeichen: 'K-1', schadentyp: 'kollision',
      fahrzeug_standort_adresse: null, fahrzeug_standort_effektiv: 'Köln',
    })
    expect(steps).toContain('ort_fahrzeug')
  })
  it('Symptom 4: gesetzte Werkstatt -> werkstatt_anzeige sichtbar, werkstatt (Picker) nicht', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', {
      ...base, hat_vorschaeden: false, kennzeichen: 'K-1', schadentyp: 'kollision',
      fahrzeug_standort_adresse: 'Köln', reparatur_werkstatt_id: 'w-1',
    })
    expect(steps).toContain('werkstatt_anzeige')
    expect(steps).not.toContain('werkstatt')
  })
  it('Kasko-Werkstattbindung-Gate: werkstattbindung_check erscheint solange freie_werkstattwahl NULL', () => {
    const steps = berechneAktiveSteps(STEPS, 'kasko', { ...base, kennzeichen: 'K-1', schadentyp: 'kollision', hat_vorschaeden: true, fahrzeug_standort_adresse: 'Köln', freie_werkstattwahl: null })
    expect(steps).toContain('werkstattbindung_check')
  })
  it('nur_gutachter ist gelöscht', () => {
    expect(berechneAktiveSteps(STEPS, 'nur_gutachter', {})).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/lib/self-service/__tests__/flow-szenarien.test.ts -t erhebt_felder-Regression`
Expected: FAIL (Fixture trägt noch die alten Bedingungen + nur_gutachter).

- [ ] **Step 3: Implement** — `flow-config-fixture.ts` auf die Ziel-Matrix bringen:
  1. `SZENARIEN_FIXTURE`: `nur_gutachter`-Zeile **entfernen**.
  2. `STEPS_FIXTURE`: alle `nur_gutachter`-Zeilen **entfernen**.
  3. `haftpflicht`: `feststellung` bedingung `null`, `erhebt_felder: ['kennzeichen','unfallhergang','unfallort','gegner_versicherung']`; `ort_besichtigung` bedingung `null`, `erhebt_felder: ['besichtigungsort_adresse']`; `ort_fahrzeug` bedingung `null`, `erhebt_felder: ['fahrzeug_standort_adresse']`; nach `werkstatt` neu `{ szenario_id:'haftpflicht', step_id:'werkstatt_anzeige', reihenfolge:7.5→neu nummerieren, bedingung:{ reparatur_werkstatt_id:'$gesetzt' } }`.
  4. `kasko`/`selbstzahler`: `feststellung` bedingung `null`, `erhebt_felder: ['kennzeichen','schadentyp']`; NEU `werkstattbindung_check` (reihenfolge nach feststellung) `bedingung:{ freie_werkstattwahl:null }`; `ort_fahrzeug` bedingung `null`, `erhebt_felder:['fahrzeug_standort_adresse']`; nach `werkstatt` neu `werkstatt_anzeige` `bedingung:{ reparatur_werkstatt_id:'$gesetzt' }`. Reihenfolgen konsistent neu durchnummerieren.

⚠ `hat_vorschaeden` gehört NICHT in `erhebt_felder` — es hat `column_default='false'` (Live-DB verifiziert 2026-07-21) und würde vom `check:flow-erhebt-felder`-Ratchet (Task 4) abgelehnt. Genau deshalb war es als Gate untauglich (Symptom 1). Es wird weiterhin im Feststellung-Wizard als Mikro-Step erhoben, gatet aber nicht. ⚠ Die übrigen `erhebt_felder`-Listen sind der Aaron-Reviewpunkt §8.1 der Spec — falls Aaron sie anpasst, HIER + in der Migration (Task 10) gespiegelt ändern.

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/lib/self-service/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/self-service/__tests__/
git commit -m "test(flow): Ziel-Matrix im Fixture (erhebt_felder, werkstatt_anzeige, werkstattbindung_check, nur_gutachter raus)"
```

---

## Task 4: CI-Ratchet `check:flow-erhebt-felder`

**Files:**
- Create: `scripts/lib/flow-erhebt-felder-scan.mjs` (pure)
- Create: `scripts/lib/leads-column-defaults.json` (Snapshot: Rohspalte -> hasDefault)
- Create: `scripts/check-flow-erhebt-felder.mjs`
- Create: `scripts/lib/__tests__/flow-erhebt-felder-scan.test.mjs`
- Modify: `package.json` (`check:flow-erhebt-felder`), `.github/workflows/ci.yml` (Step)

**Interfaces:**
- Produces: `scanErhebtFelder(fixtureSteps, columnDefaults): string[]` — Liste von Verletzern (`step:feld:grund`), Gründe: `unbekannte-spalte`, `hat-default`, `abgeleitet`.

- [ ] **Step 1: Failing test** — `flow-erhebt-felder-scan.test.mjs`:

```javascript
import { describe, it, expect } from 'vitest'
import { scanErhebtFelder } from '../flow-erhebt-felder-scan.mjs'

const defaults = { kennzeichen: false, hat_vorschaeden: true, unfallort: false }
describe('scanErhebtFelder', () => {
  it('sauber -> keine Verletzer', () => {
    expect(scanErhebtFelder([{ step_id: 'x', erhebt_felder: ['kennzeichen', 'unfallort'] }], defaults)).toEqual([])
  })
  it('DB-Default -> Verletzer', () => {
    expect(scanErhebtFelder([{ step_id: 'x', erhebt_felder: ['hat_vorschaeden'] }], defaults))
      .toEqual(['x:hat_vorschaeden:hat-default'])
  })
  it('abgeleitetes *_effektiv -> Verletzer', () => {
    expect(scanErhebtFelder([{ step_id: 'x', erhebt_felder: ['fahrzeug_standort_effektiv'] }], defaults))
      .toEqual(['x:fahrzeug_standort_effektiv:abgeleitet'])
  })
  it('unbekannte Spalte -> Verletzer', () => {
    expect(scanErhebtFelder([{ step_id: 'x', erhebt_felder: ['tippfehler'] }], defaults))
      .toEqual(['x:tippfehler:unbekannte-spalte'])
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run scripts/lib/__tests__/flow-erhebt-felder-scan.test.mjs`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implement** — `flow-erhebt-felder-scan.mjs`:

```javascript
// Pure Prüf-Logik für check:flow-erhebt-felder. Ein erhebt_felder-Eintrag muss eine
// echte, NICHT default-behaftete, NICHT abgeleitete leads-Rohspalte sein.
export function scanErhebtFelder(steps, columnDefaults) {
  const verletzer = []
  for (const s of steps) {
    for (const f of s.erhebt_felder ?? []) {
      if (f.endsWith('_effektiv')) verletzer.push(`${s.step_id}:${f}:abgeleitet`)
      else if (!(f in columnDefaults)) verletzer.push(`${s.step_id}:${f}:unbekannte-spalte`)
      else if (columnDefaults[f] === true) verletzer.push(`${s.step_id}:${f}:hat-default`)
    }
  }
  return verletzer
}
```

Dann `check-flow-erhebt-felder.mjs` (Muster `check-flag-drift.mjs`): liest die Ziel-Fixture (`STEPS_FIXTURE`, per dynamic import des kompilierten Fixtures ODER JSON-Spiegel), lädt `leads-column-defaults.json`, ruft `scanErhebtFelder`, `--warn`/`--ratchet`/`--update-baseline` (Baseline = `scripts/flow-erhebt-felder-baseline.json`, Ziel 0). `leads-column-defaults.json` initial per READ-SQL erzeugen (Header-Kommentar analog `status-check-constraints.json`):

```sql
SELECT column_name, (column_default IS NOT NULL) AS has_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='leads' ORDER BY column_name;
```

⚠ Bis der Supabase-MCP wieder da ist, den Snapshot aus den Migrationen (`ADD COLUMN ... DEFAULT`) ableiten — mind. `hat_vorschaeden: true`, `freie_werkstattwahl: false`, `kennzeichen: false`, `unfallhergang: false`, `unfallort: false`, `gegner_versicherung: false`, `schadentyp: false`, `fahrzeug_standort_adresse: false`, `besichtigungsort_adresse: false`. Beim ersten MCP-Zugriff (Task 9) vollständig regenerieren.

- [ ] **Step 4: Run, verify pass** — Scan-Test grün + Ratchet gegen die Ziel-Fixture 0 Verletzer:

Run: `npx vitest run scripts/lib/__tests__/flow-erhebt-felder-scan.test.mjs && node scripts/check-flow-erhebt-felder.mjs`
Expected: Tests PASS, Ratchet „0 Verletzer".

- [ ] **Step 5: Commit**

```bash
git add scripts/ package.json .github/workflows/ci.yml
git commit -m "feat(ci): check:flow-erhebt-felder — blockt Default-/abgeleitete/unbekannte erhebt_felder"
```

---

## Task 5: Loader lädt `erhebt_felder`

**Files:**
- Modify: `src/lib/self-service/lade-flow-szenarien.ts:29` (Select-String)

- [ ] **Step 1: Implement** — im `ladeFlowConfig`-Select `erhebt_felder` ergänzen:

```typescript
    svc
      .from('flow_szenario_steps')
      .select('szenario_id, step_id, reihenfolge, bedingung, erhebt_felder, aktiv')
      .eq('aktiv', true)
      .order('reihenfolge', { ascending: true }),
```

- [ ] **Step 2: Verify tsc** (der Select ist ungetypt bis Types-Regen; kein tsc-Bruch, da `FlowSzenarioStep.erhebt_felder` optional ist)

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/lib/self-service/lade-flow-szenarien.ts
git commit -m "feat(flow): Loader liest erhebt_felder mit"
```

---

## Phase 4 — UI (⚠ ZUERST aar-956 abgleichen)

**Vor Phase 4:** `git fetch origin staging`, die drei Dateien `FlowWizardKfz.tsx` / `FlowOrtStep.tsx` / `self-service-actions.ts` auf aktuellen Stand ziehen, Collision-Hook + aar-956-Marker prüfen. Bei aktivem Konflikt: mit der aar-956-Session koordinieren, ggf. diese Tasks als Marker an sie übergeben.

## Task 6: Ort-Step-Vorbefüllung aus `*_effektiv`

**Files:**
- Modify: `src/app/flow/[token]/FlowOrtStep.tsx`

- [ ] **Step 1:** Das Adressfeld erhält als Default den `*_effektiv`-Wert (Prop aus `page.tsx`/`FlowWizardKfz.tsx` durchreichen — `besichtigungsort_effektiv` bzw. `fahrzeug_standort_effektiv`), sichtbar als vorbefüllter, editierbarer Vorschlag. Der Step bleibt bis zur Bestätigung sichtbar (Gate = Rohspalte leer, Task 1/3).
- [ ] **Step 2:** Manuelle Verifikation im `npm run dev` (prod-Mirror-env): Ort-Step zeigt den Unfallort vorbefüllt, Speichern schreibt die Rohspalte (`speichereOrtFlow`, unverändert).
- [ ] **Step 3: Commit** `feat(flow): Ort-Step mit *_effektiv vorbefüllen (Fallback wird Vorschlag statt Tor)`

## Task 7: `werkstatt_anzeige`-Render-Block

**Files:**
- Create: `src/app/flow/[token]/FlowWerkstattAnzeige.tsx` (Anzeige der gewählten Werkstatt, Muster `gutachterAnzeige`)
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx` (Render-Block `case 'werkstatt_anzeige'`)

- [ ] **Step 1:** `FlowWerkstattAnzeige.tsx` rendert Name/Adresse/Gewerke der `reparatur_werkstatt_id`-Werkstatt (read-only, „Werkstatt ändern"-Link → zurück zum Picker analog Gutachter-Umbuchung).
- [ ] **Step 2:** In `FlowWizardKfz.tsx` den Step `werkstatt_anzeige` rendern.
- [ ] **Step 3:** tsc grün + `npm run check:component-set -- --ratchet` + `check:token-audit` + `check:status-registry -- --ratchet` (Pflicht bei neuer .tsx).
- [ ] **Step 4: Commit** `feat(flow): werkstatt_anzeige-Step (gewählte Werkstatt anzeigen statt verschwinden)`

## Task 8: `werkstattbindung_check`-Gate (Kasko/Selbstzahler)

**Files:**
- Create: `src/app/flow/[token]/FlowWerkstattbindungStep.tsx` (Bestätigungs-UI, Muster Quali-`werkstattbindung`-Phase `FlowQualiStep.tsx:156`)
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx` (Render-Block)
- Modify/Reuse: `src/app/flow/[token]/self-service-actions.ts` (Action `bestaetigeWerkstattwahl(token, frei: boolean)` → `freie_werkstattwahl` setzen; bei `false` Disqualifikation über den bestehenden `werkstattbindung`-Pfad)

- [ ] **Step 1: Failing test** (Action-Ebene, falls testbar isoliert; sonst Logik in eine pure Fn ziehen): „frei=true → freie_werkstattwahl=true, kein Abbruch"; „frei=false → freie_werkstattwahl=false + Disqualifikation-Grund werkstattbindung".
- [ ] **Step 2:** Run, verify fail.
- [ ] **Step 3:** UI + Action implementieren (Wiederverwendung der Quali-Texte/-Buttons).
- [ ] **Step 4:** Tests + tsc + Ratchets grün.
- [ ] **Step 5: Commit** `feat(flow): Kasko-Werkstattbindung-Gate garantiert (auch wenn Quali übersprungen)`

---

## Phase 5 — Migrationen (⚠ braucht Supabase-Plugin; Regel 2)

## Task 9: M1 — Spalte `erhebt_felder` + Snapshot-Regen

- [ ] **Step 1:** `apply_migration({ name: 'flow_szenario_steps_erhebt_felder', query: "ALTER TABLE public.flow_szenario_steps ADD COLUMN IF NOT EXISTS erhebt_felder text[] NOT NULL DEFAULT '{}'::text[];" })`
- [ ] **Step 2:** `list_migrations` → getrackte Version `<V>` ablesen; File committen als `supabase/migrations/<V>_flow_szenario_steps_erhebt_felder.sql`.
- [ ] **Step 3:** `execute_sql` (READ) verifizieren: Spalte existiert. `leads-column-defaults.json` (Task 4) vollständig aus der Live-DB regenerieren + `check:flow-erhebt-felder` erneut grün.
- [ ] **Step 4:** Types regenerieren (`generate_typescript_types`) + committen; `npm run check:query-drift -- --update-baseline` falls Baseline schrumpft.
- [ ] **Step 5: Commit** (Migration-File + Types)

## Task 10: M2–M5 — Matrix befüllen, Steps ergänzen, Phantom löschen

- [ ] **Step 1:** Eine `apply_migration` (`flow_matrix_erhebt_felder_target`) mit den Data-Statements — **exakt gespiegelt zur Fixture (Task 3)**:
  - `UPDATE flow_szenario_steps SET erhebt_felder = ARRAY[...], bedingung = NULL WHERE szenario_id='haftpflicht' AND step_id='feststellung'` (analog ort_*).
  - `UPDATE ... SET erhebt_felder = ARRAY['besichtigungsort_adresse'] WHERE ... step_id='ort_besichtigung'` usw.
  - `INSERT INTO flow_szenario_steps (szenario_id, step_id, reihenfolge, bedingung, erhebt_felder, aktiv) VALUES (...)` für `werkstatt_anzeige` (haftpflicht/kasko/selbstzahler, bedingung `{"reparatur_werkstatt_id":"$gesetzt"}`) + `werkstattbindung_check` (kasko/selbstzahler, bedingung `{"freie_werkstattwahl":null}`).
  - `DELETE FROM flow_szenario_steps WHERE szenario_id='nur_gutachter'; DELETE FROM flow_szenarien WHERE id='nur_gutachter';`
- [ ] **Step 2:** `list_migrations` → File committen als `supabase/migrations/<V>_flow_matrix_erhebt_felder_target.sql`.
- [ ] **Step 3:** `execute_sql` (READ) — die Live-Matrix gegen die Fixture diffen (gleiche Steps, gleiche erhebt_felder, kein nur_gutachter).
- [ ] **Step 4: Commit** (Migration-File)

---

## Task 11: Regel-4 Prod-Smoke je Szenario

**Files:** keine (Verifikation)

- [ ] **Step 1:** Nach Deploy je Test-Lead (`telefon=NULL`) über den echten Flow:
  - **Kasko:** Feststellung erscheint (Symptom 1 ✓); Werkstattbindungs-Häkchen erscheint; Fahrzeugstandort wird erfragt (nicht per unfallort maskiert, Symptom 2 ✓); Werkstatt-Finder findet Treffer; nach Wahl `werkstatt_anzeige` (Symptom 4 ✓).
  - **Haftpflicht:** beide Orte werden erfragt/vorbefüllt; Werkstatt wird nach Wahl angezeigt; Kanzlei-Weiche am SA — Partnerkanzlei → LexDrive/Vollmacht getriggert, „nur Gutachten" → nicht.
  - **Selbstzahler:** wie Kasko ohne VS.
- [ ] **Step 2:** Ergebnis (grün/rot + Screenshots/Assertions + DB-Delta) im PR-Body + Marker dokumentieren. Rot → Fix-PR, Task bleibt offen.

---

## Self-Review (durchgeführt)

**Spec-Coverage:** §2.1 erhebt_felder → Task 1/3/5; §2.1 Rohspalten/Prefill → Task 2/6; §2.2 Feststellung scharf → Task 3 (Fixture) + Task 10 (DB); §2.3 werkstatt_anzeige → Task 7/10; §2.4 Werkstattbindung-Gate → Task 8/10; §2.5 nur_gutachter löschen → Task 3/10 (Downstream service_typ unberührt, Global Constraints); §2.6 Ratchet → Task 4/9; §3 Migrationen → Task 9/10; §5 Kontext → Task 2; §7 Tests → Task 1–4 + Task 11. Kein §8-Reviewpunkt ist gebaut (2-Wege bleibt, service_typ bleibt) — bewusst, Aaron „go" mit Minimal-Default.

**Placeholder-Scan:** Task 6/8 UI-Steps sind bewusst kürzer (kontendiert, aar-956-Abgleich zuerst) — die Interfaces + Muster-Referenzen (`gutachterAnzeige`, Quali-`werkstattbindung`-Phase) sind konkret genannt; kein „TBD".

**Typ-Konsistenz:** `erhebt_felder?: string[] | null` (Task 1) == Loader-Select (Task 5) == Fixture (Task 3) == Scan (Task 4). `erhebtNoch`/`scanErhebtFelder`-Signaturen durchgängig.
