# Werkstatt-Finder-EMBED — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Fundament des Werkstatt-Embed-Rebuilds: Text-KI-Schadenklassifikator, GBP-Spalten auf `werkstaetten`, und die Umstellung der Embed-Suche von der alten Fit-Suche auf die gerankte Matching-Engine (Fahrzeugstandort-Anker).

**Architecture:** Die gerankte Engine (`rank-vorschlaege.ts` + Loader `lade-vorschlaege.ts`) ist seit #4359 auf staging. Phase 1 verdrahtet den bestehenden Embed (`sucheEchteWerkstaetten`) auf den Loader `ladeWerkstattVorschlaege`, ergänzt den Text-Weg der Bedarfsermittlung (analog Foto-Vision), und legt additive GBP-Spalten für den Trust-Chip an. UI-Chips/Karte/Wizard folgen in Phase 2.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (Postgres), Claude Haiku 4.5 (Text/Vision), Vitest.

## Global Constraints

- **Regel 1:** Feature-Branch `kitta/werkstatt-finder-embed-rebuild`, PR gegen `staging`, kein Direct-Push auf `main`.
- **Regel 2:** DDL **nur** via `mcp__plugin_supabase_supabase__apply_migration`; danach `list_migrations` → getrackte Version ablesen → File `supabase/migrations/<V>_<name>.sql` exakt danach benennen. `execute_sql` nur READ.
- **Regel 4:** Nach Prod-Deploy vollständiger Playwright-Smoke; Test-Konten `telefon=NULL`.
- **Ungetypter Admin-Client:** `createAdminClient()` hat kein `<Database>`-Generic → tsc prüft Select-Strings NICHT. Jeden neuen Select-String per `execute_sql` (READ) gegen prod proben (`reference-supabase-select-strings-untyped-admin-client`).
- **Umlaute:** nutzersichtbare Strings mit echten `ä/ö/ü/ß` (hier kaum betroffen — Phase 1 ist Backend).
- **BedarfQuelle-Vokabular** wird über `ERLAUBTE_QUELLEN` (in `bedarf/sanitize.ts`) gegatet, nicht per DB-CHECK.
- **Branch-Koordination:** mehrere Sessions auf `kitta/aar-956-embed-reservierung-rueckruf` (Embed-Nähe) — vor Touch der `embed/werkstatt-finder`-Files Git-Stand abgleichen.

---

### Task 1: Text-KI-Schadenklassifikator

Ein neuer Klassifikator, der aus einer Freitext-Schadenbeschreibung die Reparatur-Gewerke ableitet — analog zum Foto-Vision-Klassifikator, aber mit Text-Content statt Image-Blocks.

**Files:**
- Create: `src/lib/werkstatt/bedarf/schadenbeschreibung-gewerke.ts`
- Test: `src/lib/werkstatt/bedarf/__tests__/schadenbeschreibung-gewerke.test.ts`

**Interfaces:**
- Consumes: `Gewerk`, `istGewerk` aus `./types`; `getAnthropicVisionClient` aus `@/lib/ai/vision/client`; `AI_MODELS` aus `@/lib/ai/models`.
- Produces: `export async function klassifiziereSchadenbeschreibung(beschreibung: string): Promise<{ kategorien: Gewerk[]; confidence: number }>` — gleiches Output-Shape wie `klassifiziereSchadenbild`.

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/werkstatt/bedarf/__tests__/schadenbeschreibung-gewerke.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMock = vi.fn()
vi.mock('@/lib/ai/vision/client', () => ({
  getAnthropicVisionClient: () => ({ messages: { create: createMock } }),
}))
vi.mock('@/lib/ai/models', () => ({ AI_MODELS: { vision_schadenbeschreibung: 'claude-haiku-4-5-20251001' } }))

import { klassifiziereSchadenbeschreibung } from '../schadenbeschreibung-gewerke'

function aiText(json: string) {
  return { content: [{ type: 'text', text: json }] }
}

describe('klassifiziereSchadenbeschreibung', () => {
  beforeEach(() => createMock.mockReset())

  it('leitet Gewerke + confidence aus dem Text ab', async () => {
    createMock.mockResolvedValue(aiText('{"kategorien":["karosserie","lackierung"],"confidence":80}'))
    const r = await klassifiziereSchadenbeschreibung('Stossstange eingedrueckt, Kratzer im Lack')
    expect(r.kategorien).toEqual(['karosserie', 'lackierung'])
    expect(r.confidence).toBe(80)
  })

  it('leerer Text -> kein KI-Call, {[],0}', async () => {
    const r = await klassifiziereSchadenbeschreibung('   ')
    expect(r).toEqual({ kategorien: [], confidence: 0 })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('fail-safe: ungueltige Kategorien werden gefiltert, confidence 0 bei leerer Menge', async () => {
    createMock.mockResolvedValue(aiText('{"kategorien":["quatsch"],"confidence":90}'))
    const r = await klassifiziereSchadenbeschreibung('irgendwas')
    expect(r).toEqual({ kategorien: [], confidence: 0 })
  })

  it('fail-safe: AI-Fehler -> {[],0}', async () => {
    createMock.mockRejectedValue(new Error('boom'))
    const r = await klassifiziereSchadenbeschreibung('Stossstange')
    expect(r).toEqual({ kategorien: [], confidence: 0 })
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/werkstatt/bedarf/__tests__/schadenbeschreibung-gewerke.test.ts`
Expected: FAIL — `Cannot find module '../schadenbeschreibung-gewerke'`.

- [ ] **Step 3: Klassifikator implementieren**

```ts
// src/lib/werkstatt/bedarf/schadenbeschreibung-gewerke.ts
// Text-KI-Schadenklassifikator: leitet Reparatur-Gewerke aus einer Freitext-
// Schadenbeschreibung ab (Claude Haiku 4.5). Analog schadenbild-gewerke.ts, aber
// Text-Content statt Image-Blocks. Fail-safe: kein Client / leerer Text / Parse-
// Fehler / leere Kategorien -> { kategorien: [], confidence: 0 } (nie falsch-positiv).
import type { Gewerk } from './types'
import { istGewerk } from './types'
import { getAnthropicVisionClient } from '@/lib/ai/vision/client'
import { AI_MODELS } from '@/lib/ai/models'

const MODEL = AI_MODELS.vision_schadenbeschreibung
const SYSTEM =
  'Du bist ein KFZ-Schadengutachter-Assistent. Bestimme aus der Schadenbeschreibung, welche Reparatur-Gewerke noetig sind.'
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

function parseJson(text: string): { kategorien?: unknown; confidence?: unknown } | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

export async function klassifiziereSchadenbeschreibung(
  beschreibung: string,
): Promise<{ kategorien: Gewerk[]; confidence: number }> {
  const text = beschreibung?.trim()
  if (!text) return { kategorien: [], confidence: 0 }
  const client = getAnthropicVisionClient()
  if (!client) return { kategorien: [], confidence: 0 }
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `Schadenbeschreibung: "${text}"\n\n` +
                'Welche Gewerke braucht dieser Schaden? Erlaubt: karosserie, lackierung, mechanik, glas, smart_repair. ' +
                'Antworte NUR JSON: {"kategorien":[...],"confidence":0-100}',
            },
          ],
        },
      ],
    })
    const out =
      (res.content.find((c: { type: string }) => c.type === 'text') as { text?: string } | undefined)?.text ?? ''
    const parsed = parseJson(out)
    const kategorien = (Array.isArray(parsed?.kategorien) ? parsed!.kategorien : []).filter(istGewerk) as Gewerk[]
    const confidence = kategorien.length ? clamp(Number(parsed?.confidence) || 0, 0, 100) : 0
    return { kategorien, confidence }
  } catch {
    return { kategorien: [], confidence: 0 }
  }
}
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

Run: `npx vitest run src/lib/werkstatt/bedarf/__tests__/schadenbeschreibung-gewerke.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/werkstatt/bedarf/schadenbeschreibung-gewerke.ts src/lib/werkstatt/bedarf/__tests__/schadenbeschreibung-gewerke.test.ts
git commit -m "feat(werkstatt): Text-KI-Schadenklassifikator (Beschreibung -> Gewerke)"
```

---

### Task 2: `schadenbeschreibung`-Quelle in die Bedarfs-Evidenz

Die neue Quelle im Vokabular registrieren, damit `sanitizeBedarf` sie nicht auf `unbekannt` normalisiert, und den Rang in der Evidenz-Eskalation dokumentieren.

**Files:**
- Modify: `src/lib/werkstatt/bedarf/types.ts` (BedarfQuelle-Type)
- Modify: `src/lib/werkstatt/bedarf/sanitize.ts` (`ERLAUBTE_QUELLEN`)
- Test: `src/lib/werkstatt/bedarf/__tests__/sanitize.test.ts` (falls vorhanden erweitern, sonst neu)

**Interfaces:**
- Produces: `'schadenbeschreibung'` als valider `BedarfQuelle`-Wert; `sanitizeBedarf({quelle:'schadenbeschreibung'})` erhält die Quelle.

- [ ] **Step 1: Failing test schreiben**

```ts
// src/lib/werkstatt/bedarf/__tests__/sanitize.test.ts  (Case ergänzen; describe ggf. neu)
import { describe, it, expect } from 'vitest'
import { sanitizeBedarf } from '../sanitize'

describe('sanitizeBedarf — schadenbeschreibung-Quelle', () => {
  it('erhaelt quelle=schadenbeschreibung', () => {
    const r = sanitizeBedarf({ kategorien: ['karosserie'], quelle: 'schadenbeschreibung', confidence: 70 })
    expect(r.quelle).toBe('schadenbeschreibung')
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/lib/werkstatt/bedarf/__tests__/sanitize.test.ts`
Expected: FAIL — `quelle` wird auf `'unbekannt'` normalisiert (nicht in `ERLAUBTE_QUELLEN`).

- [ ] **Step 3: Vokabular ergänzen**

In `src/lib/werkstatt/bedarf/types.ts`: den `BedarfQuelle`-Union um `'schadenbeschreibung'` erweitern (neben `'schadenbild'`/`'manuell'`/`'gutachten'`/`'unbekannt'`).
In `src/lib/werkstatt/bedarf/sanitize.ts`: `'schadenbeschreibung'` in das `ERLAUBTE_QUELLEN`-Array aufnehmen.

Zuerst die Ist-Werte lesen (kein Blind-Edit):
```bash
sed -n '1,40p' src/lib/werkstatt/bedarf/types.ts
sed -n '1,40p' src/lib/werkstatt/bedarf/sanitize.ts
```
Dann `'schadenbeschreibung'` in BEIDE (Union + `ERLAUBTE_QUELLEN`) einfügen.

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

Run: `npx vitest run src/lib/werkstatt/bedarf/__tests__/sanitize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/werkstatt/bedarf/types.ts src/lib/werkstatt/bedarf/sanitize.ts src/lib/werkstatt/bedarf/__tests__/sanitize.test.ts
git commit -m "feat(werkstatt): 'schadenbeschreibung' als Bedarfs-Quelle (Text-KI-Evidenz)"
```

> Evidenz-Rang (`ermittle-bedarf.ts`) — Gutachten(100) > Foto-KI > Text-KI > manuell(40) > unbekannt — wird erst relevant, wenn der Embed die Text-Quelle persistiert (Phase 2/3). Hier nur das Vokabular; die Eskalations-Verdrahtung kommt mit dem Consumer.

---

### Task 3: GBP-Spalten auf `werkstaetten` (additive Migration)

Google-Business-Profile-Felder für den Trust-Chip — Pattern von der SV gespiegelt (`sachverstaendige.standort_place_id`). Rating **gecacht**, nicht live pro Render.

**Files:**
- Create (via Plugin): Migration `<V>_werkstaetten_gbp_felder.sql`

**Interfaces:**
- Produces: `werkstaetten.google_place_id text`, `google_rating numeric(2,1)`, `google_review_count int`, `google_rating_am timestamptz` — nullable, additiv.

- [ ] **Step 1: DDL via Plugin anwenden**

`mcp__plugin_supabase_supabase__apply_migration({ project_id: "paizkjajbuxxksdoycev", name: "werkstaetten_gbp_felder", query: "<DDL>" })` mit:
```sql
-- GBP (Google Business Profile) fuer den Werkstatt-Trust-Chip. Pattern gespiegelt von
-- sachverstaendige.standort_place_id + GoogleBusinessFeld. Rating gecacht (kein Live-Fetch
-- pro Finder-Render); Refresh in der Datenpflege / periodisch.
ALTER TABLE public.werkstaetten
  ADD COLUMN IF NOT EXISTS google_place_id     text,
  ADD COLUMN IF NOT EXISTS google_rating       numeric(2,1),
  ADD COLUMN IF NOT EXISTS google_review_count integer,
  ADD COLUMN IF NOT EXISTS google_rating_am    timestamptz;
```

- [ ] **Step 2: Getrackte Version ablesen + File committen**

`mcp__plugin_supabase_supabase__list_migrations` → die vergebene Version `<V>` (eigener Timestamp!) ablesen.
File `supabase/migrations/<V>_werkstaetten_gbp_felder.sql` mit exakt dem DDL anlegen (Dateiname == getrackte Version — Twin-Drift-Vermeidung, Regel 2).

- [ ] **Step 3: Spalten verifizieren (READ)**

`mcp__plugin_supabase_supabase__execute_sql` (READ):
```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_name='werkstaetten' and column_name like 'google_%' order by column_name;
```
Expected: 4 Zeilen (google_place_id/text, google_rating/numeric, google_review_count/integer, google_rating_am/timestamp with time zone).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<V>_werkstaetten_gbp_felder.sql
git commit -m "feat(werkstatt): GBP-Spalten (google_place_id/rating/review_count) additiv"
```

> Anzeige (Trust-Chip) + Datenpflege-UI (`GoogleBusinessFeld` in `/admin/werkstaetten/[id]`) + Refresh-Verfahren aus `lib/actions/sv/google-business.ts` sind Phase 2 / Task #10. Hier nur das Schema.

---

### Task 4: Embed-Suche auf die gerankte Engine umstellen

`sucheEchteWerkstaetten` / `sucheWerkstaettenNachOrt` liefern statt `findWerkstaetten`+`qualifiziere` die gerankten `WerkstattVorschlag[]` (Marke→Gewerke→Gruppe→Distanz, mit `gruende`), am **Fahrzeugstandort-Anker** (den Koordinaten der Suche). Marke/Fahrzeugklasse bleiben in Phase 1 `null` (kommen mit dem Wizard in Phase 2) → die Engine rankt dann nach Gewerke+Distanz, alle Werkstätten als `frei`.

**Files:**
- Modify: `src/app/embed/werkstatt-finder/actions.ts` (`sucheEchteWerkstaetten`, `sucheWerkstaettenNachOrt`)
- Modify: `src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx` (Row-Typ `WerkstattFinderRow` → `WerkstattVorschlag`)
- Test: `src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts` (erweitern)

**Interfaces:**
- Consumes: `ladeWerkstattVorschlaege({ fahrzeugklasse, marke, bedarf, bedarfConfidence, anker, limit, nurEchte })` aus `@/lib/werkstatt/matching/lade-vorschlaege`; `WerkstattVorschlag` aus `@/lib/werkstatt/matching/rank-vorschlaege`.
- Produces: `sucheEchteWerkstaetten(input) → { werkstaetten: WerkstattVorschlag[]; keineSpezialisierte: boolean }` (Rückgabe-Shape-kompatibel: `WerkstattVorschlag` trägt `passt`/`verifiziert` als Superset der alten `WerkstattFinderRow`).

- [ ] **Step 1: Ist-Stand der Action lesen**

```bash
sed -n '45,90p' src/app/embed/werkstatt-finder/actions.ts   # sucheEchteWerkstaetten / sucheWerkstaettenNachOrt
```
Merken: heute `findWerkstaetten({lat,lng,plz,nurEchte,limit})` + optional `qualifiziereWerkstaetten`. Geo kommt aus `{lat,lng}` bzw. Geocode von `sucheWerkstaettenNachOrt`.

- [ ] **Step 2: Failing test — Action liefert gerankte Vorschläge**

```ts
// src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts (Case ergänzen)
import { describe, it, expect, vi } from 'vitest'

const ladeMock = vi.fn()
vi.mock('@/lib/werkstatt/matching/lade-vorschlaege', () => ({ ladeWerkstattVorschlaege: ladeMock }))

import { sucheEchteWerkstaetten } from '../actions'

describe('sucheEchteWerkstaetten — gerankte Engine', () => {
  it('ruft ladeWerkstattVorschlaege mit anker aus lat/lng, nurEchte=true', async () => {
    ladeMock.mockResolvedValue([{ id: 'w1', name: 'A', passt: true, gruende: [] }])
    const r = await sucheEchteWerkstaetten({ lat: 50.9, lng: 6.9, bedarf: { kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 70 } })
    expect(ladeMock).toHaveBeenCalledWith(expect.objectContaining({
      anker: { lat: 50.9, lng: 6.9 }, bedarf: ['karosserie'], bedarfConfidence: 70, nurEchte: true,
    }))
    expect(r.werkstaetten[0].id).toBe('w1')
  })
})
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts`
Expected: FAIL — `sucheEchteWerkstaetten` ruft noch `findWerkstaetten`, nicht `ladeWerkstattVorschlaege`.

- [ ] **Step 4: Action umstellen**

`sucheEchteWerkstaetten` neu (Kern):
```ts
export async function sucheEchteWerkstaetten(input: {
  lat?: number; lng?: number; plz?: string; bedarf?: Reparaturbedarf
}): Promise<{ werkstaetten: WerkstattVorschlag[]; keineSpezialisierte: boolean }> {
  const anker = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null
  const b = input.bedarf ? sanitizeBedarf(input.bedarf) : { kategorien: [], quelle: 'unbekannt' as const, confidence: 0 }
  const werkstaetten = await ladeWerkstattVorschlaege({
    fahrzeugklasse: null,   // Phase 2: aus dem Wizard (Fahrzeugtyp)
    marke: null,            // Phase 2: aus dem Wizard (Hersteller)
    bedarf: b.kategorien,
    bedarfConfidence: b.confidence,
    anker,
    limit: 5,
    nurEchte: true,
  })
  // keineSpezialisierte: Hart-Filter (conf>=60) hat 0 passende -> Engine liefert trotzdem (frei/unbekannt),
  // Signal fuer die UI: keine spezialisierte gefunden. Hier: alle 'passt_nicht' => true.
  const keineSpezialisierte =
    b.confidence >= 60 && b.kategorien.length > 0 && werkstaetten.every((w) => w.gewerkeFit === 'passt_nicht')
  return { werkstaetten, keineSpezialisierte }
}
```
`sucheWerkstaettenNachOrt(query, bedarf)`: den Geocode beibehalten (`geocodeAdresse`), dann `ladeWerkstattVorschlaege({ ..., anker: geo ? {lat,lng} : null })` statt `findWerkstaetten`. `center` = das Geocode-Ergebnis wie bisher.
Imports ergänzen: `ladeWerkstattVorschlaege`, `type WerkstattVorschlag`, `sanitizeBedarf` (bereits importiert prüfen).

- [ ] **Step 5: Client-Typ nachziehen**

In `WerkstattFinderEmbedClient.tsx`: `WerkstattFinderRow` → `WerkstattVorschlag` (Import aus `@/lib/werkstatt/matching/rank-vorschlaege`). Da `WerkstattVorschlag` ein Superset ist (`passt`, `verifiziert`, `adresse_ort`, `id`, `name`, `lat`, `lng`), bleiben die bestehenden Zugriffe gültig; `fit` wird zu `gewerkeFit` — die Fit-Anzeige ggf. auf `w.gewerkeFit` umbiegen. Chips (`gruende`) rendern erst Phase 2.

- [ ] **Step 6: Tests + tsc + Build**

Run: `npx vitest run src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts` → PASS.
Run: `npx tsc --noEmit` (Worktree braucht node_modules-Junction; `Select-String "error TS"` = 0). Alternativ IDE-Diagnostics auf den 2 geänderten Files = 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/embed/werkstatt-finder/actions.ts src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx src/app/embed/werkstatt-finder/__tests__/embed-actions.test.ts
git commit -m "feat(werkstatt-embed): Suche auf gerankte Matching-Engine (Fahrzeugstandort-Anker)"
```

---

### Task 5: Phase-1-Verifikation (Regel 4, nach Deploy)

**Files:** keine (Smoke).

- [ ] **Step 1: Prod-Smoke planen + im PR dokumentieren**

Nach Merge+Deploy: `https://app.claimondo.de/embed/werkstatt-finder?plz=50937` öffnen → es müssen **Werkstätten erscheinen** (behebt „findet keine Werkstätten": jetzt via Engine-Loader + Anker aus den Koordinaten). Foto/Bedarf → Re-Rank sichtbar. Test-Foto-Lead (`telefon=NULL`) → Redirect in `/flow`. Ergebnis (grün/rot + Screenshot) im PR vermerken. Task bleibt offen bis grüner Smoke.

---

## Self-Review

**Spec-Coverage:** Text-KI (§14) → Task 1+2. GBP-Spalten (§6) → Task 3. Engine-Verdrahtung + Anker + „findet keine Werkstätten" (§2 P1, §5, §15) → Task 4+5. **Nicht in Phase 1** (bewusst, eigene Pläne): Karte/Glass-Card/Wizard/Google-Places/Bottom-Sheet (§4/§7/§8, Phase 2), db-driven Übergabe + Doppel-Lead (§9/§10, Phase 3), Entry-Point (§11, Phase 4), Datenpflege-UI (#10), KVA/Kalender/Tiers (§13).
**Placeholder-Scan:** kein „TBD"; Task 2 Step 3 liest die Ist-Werte statt sie zu raten (Union/Array-Inhalt variiert); GBP-Anzeige + Refresh bewusst als Phase-2-Verweis, nicht als Platzhalter in einem Task.
**Typ-Konsistenz:** `ladeWerkstattVorschlaege`-Signatur + `WerkstattVorschlag`-Felder (`gewerkeFit`, `gruende`, `passt`) 1:1 aus `lade-vorschlaege.ts`/`rank-vorschlaege.ts` (gelesen). `klassifiziereSchadenbeschreibung`-Output == `klassifiziereSchadenbild`-Output.

---

## Execution Handoff

Nach Speichern → Ausführung: **Subagent-Driven** (frischer Subagent je Task, Review dazwischen) oder **Inline** (executing-plans, Batch mit Checkpoints).
