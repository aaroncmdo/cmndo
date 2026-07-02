# Flow-Wunschtermin-Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dem Kunden im kanonischen FlowLink (`/flow/[token]`) erlauben, optional einen Wunschtermin anzugeben, sodass die bestehende Matching-Funktion die Gutachter-Slots danach rankt.

**Architecture:** Der `FlowSlotStep` bekommt im `ort_abfragen`-Schritt einen (wiederverwendeten) `WunschterminPicker`. Beim Ort-Bestätigen wird der Berlin-Wall-Clock-Wert an die erweiterte Server-Action `speichereBesichtigungsortFlow` gereicht, die ihn über eine pure Helper-Funktion (`resolveWunschterminIso`) in UTC-ISO wandelt und in `lead.wunschtermin` persistiert. Das **unveränderte** `ladeMatchingFlow` liest `lead.wunschtermin` bereits und rankt die Slots. Keine Engine-Änderung, keine Migration.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase (admin client), vitest, next-intl, `@/lib/google-calendar/timezone` (`berlinWallClockToUtc`).

## Global Constraints

- **Additiv only** — `FlowSlotStep.tsx` + `self-service-actions.ts` sind aar-956-Hot-Zone (mehrere aktive Sessions auf `kitta/aar-956-embed-reservierung-rueckruf`). Keine Signatur-Brüche (nur optionaler 3. Param), kein Move/Edit an `FinderWizard.tsx` oder anderen aar-956-Files.
- **Server-Action-Pattern:** Result-Object `{ ok: boolean; error?: string }`, **kein** `throw`. Kein Export von Konstanten/Non-async-Funktionen aus `'use server'`-Files → die pure Helper-Funktion lebt in einem eigenen Modul (`wunschtermin.ts`), nicht in `self-service-actions.ts`.
- **TZ:** `WunschterminPicker` liefert Berlin-Wall-Clock `"YYYY-MM-DDTHH:MM"`. IMMER über `berlinWallClockToUtc` → UTC-ISO, bevor es in `lead.wunschtermin` (timestamptz) landet. Sonst 2h-Drift.
- **UI-Text:** Deutsch mit echten Umlauten (`ä`/`ö`/`ü`/`ß`). Wunschtermin-Label + Hint werden **hardcoded** (wie im Embed-`FinderWizard`) — `request.ts` lädt per-Locale-JSON ohne Key-Fallback, ein fehlender i18n-Key würde einen Nicht-`de`-Kunden crashen.
- **Design-Tokens:** `claimondo-*`-Farben + Standard-Tailwind-Größen (kein `text-[Npx]`-Bracket-Magic). Der `WunschterminPicker` ist bereits token-gebunden.
- **Keine Migration** — `lead.wunschtermin` existiert (wird von `ladeMatchingFlow` gelesen).
- **Build/Gates:** voller `npm run build` mit `NODE_OPTIONS=--max-old-space-size=8192` (Route-Change → Next-Validator); `check:token-audit` / `check:component-set` / `check:knip` grün.

---

## File Structure

| File | Verantwortung | Änderung |
|---|---|---|
| `src/app/flow/[token]/wunschtermin.ts` | Pure Konvertierung Wunschtermin-Picker-Wert → UTC-ISO (defensiv, wirft nie) | **Create** |
| `src/app/flow/[token]/wunschtermin.test.ts` | Unit-Tests für `resolveWunschterminIso` | **Create** |
| `src/app/flow/[token]/self-service-actions.ts` | `speichereBesichtigungsortFlow` um optionalen `wunschterminLokal` erweitern | **Modify** (Z. 388–410) |
| `src/app/flow/[token]/FlowSlotStep.tsx` | `WunschterminPicker` im `ort_abfragen`-Schritt + Wert an die Action reichen | **Modify** |

**Wiederverwendet (nicht kopieren, nicht verschieben):**
- `WunschterminPicker` aus `@/app/embed/gutachter-finder/_components/WunschterminPicker` (self-contained: `{ value: string; onChange: (v: string) => void }`).
- `berlinWallClockToUtc` aus `@/lib/google-calendar/timezone`.
- `ladeMatchingFlow`, `bucheTerminFlow`, `speichereBesichtigungsortFlow` (letztere erweitert) — bestehende `/flow`-Actions.

---

### Task 1: Pure Helper `resolveWunschterminIso`

**Files:**
- Create: `src/app/flow/[token]/wunschtermin.ts`
- Test: `src/app/flow/[token]/wunschtermin.test.ts`

**Interfaces:**
- Consumes: `berlinWallClockToUtc(wall: string): string` aus `@/lib/google-calendar/timezone` (wirft bei ungültigem Input).
- Produces: `resolveWunschterminIso(wunschterminLokal: string | null | undefined): string | null` — Berlin-Wall-Clock `"YYYY-MM-DDTHH:MM"` → UTC-ISO; leer/ungültig → `null` (wirft nie).

- [ ] **Step 1: Write the failing test**

Create `src/app/flow/[token]/wunschtermin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveWunschterminIso } from './wunschtermin'

describe('resolveWunschterminIso', () => {
  it('Sommerzeit (CEST, +2h): 09:00 Berlin -> 07:00Z', () => {
    expect(resolveWunschterminIso('2026-06-03T09:00')).toBe('2026-06-03T07:00:00.000Z')
  })
  it('Winterzeit (CET, +1h): 09:00 Berlin -> 08:00Z', () => {
    expect(resolveWunschterminIso('2026-01-15T09:00')).toBe('2026-01-15T08:00:00.000Z')
  })
  it('leerer String -> null', () => {
    expect(resolveWunschterminIso('')).toBeNull()
  })
  it('null -> null', () => {
    expect(resolveWunschterminIso(null)).toBeNull()
  })
  it('undefined -> null', () => {
    expect(resolveWunschterminIso(undefined)).toBeNull()
  })
  it('ungueltiger String -> null (wirft nicht)', () => {
    expect(resolveWunschterminIso('quatsch')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run wunschtermin`
Expected: FAIL — `resolveWunschterminIso` ist kein Export / Modul existiert nicht.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/flow/[token]/wunschtermin.ts`:

```ts
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'

/**
 * Wandelt einen optionalen Wunschtermin-Wert aus dem WunschterminPicker
 * (Berlin-Wall-Clock "YYYY-MM-DDTHH:MM" oder "") in ein UTC-ISO fuer lead.wunschtermin.
 * Leer/ungueltig -> null (defensiv, wirft nie -> keine 500 in der Server-Action).
 */
export function resolveWunschterminIso(
  wunschterminLokal: string | null | undefined,
): string | null {
  if (!wunschterminLokal || typeof wunschterminLokal !== 'string') return null
  try {
    return berlinWallClockToUtc(wunschterminLokal)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run wunschtermin`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add "src/app/flow/[token]/wunschtermin.ts" "src/app/flow/[token]/wunschtermin.test.ts"
git commit -m "feat(flow-wunschtermin): resolveWunschterminIso pure helper (Berlin-Wall-Clock -> UTC-ISO)"
```

---

### Task 2: `speichereBesichtigungsortFlow` um Wunschtermin erweitern

**Files:**
- Modify: `src/app/flow/[token]/self-service-actions.ts` (Funktion `speichereBesichtigungsortFlow`, aktuell Z. 388–410)

**Interfaces:**
- Consumes: `resolveWunschterminIso` aus `./wunschtermin` (Task 1).
- Produces: `speichereBesichtigungsortFlow(token: string, ort: { adresse: string; lat: number; lng: number }, wunschterminLokal?: string | null): Promise<{ ok: boolean; error?: string }>` — der neue **optionale** 3. Parameter. Bei `undefined` bleibt `lead.wunschtermin` unberührt (backward-kompatibel); bei `string`/`null` wird `lead.wunschtermin = resolveWunschterminIso(wunschterminLokal)` gesetzt (`null` löscht).

- [ ] **Step 1: Grep confirm sole caller (safety)**

Run: `grep -rn "speichereBesichtigungsortFlow" "src/"`
Expected: Definition in `self-service-actions.ts` + Import/Call nur in `FlowSlotStep.tsx`. (Der neue Param ist optional → selbst weitere Caller blieben unberührt.)

- [ ] **Step 2: Add the import**

In `src/app/flow/[token]/self-service-actions.ts`, bei den bestehenden lokalen Imports (z.B. neben anderen `./`-Imports) ergänzen:

```ts
import { resolveWunschterminIso } from './wunschtermin'
```

- [ ] **Step 3: Replace the function body**

Ersetze die komplette Funktion `speichereBesichtigungsortFlow` (aktuell Z. 388–410) durch:

```ts
export async function speichereBesichtigungsortFlow(
  token: string,
  ort: { adresse: string; lat: number; lng: number },
  wunschterminLokal?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!ort || typeof ort.lat !== 'number' || typeof ort.lng !== 'number') {
    return { ok: false, error: 'Bitte wählen Sie eine Adresse aus den Vorschlägen.' }
  }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const update: {
    besichtigungsort_adresse: string
    besichtigungsort_lat: number
    besichtigungsort_lng: number
    updated_at: string
    wunschtermin?: string | null
  } = {
    besichtigungsort_adresse: ort.adresse,
    besichtigungsort_lat: ort.lat,
    besichtigungsort_lng: ort.lng,
    updated_at: new Date().toISOString(),
  }
  // AAR-956: optionaler Wunschtermin aus dem /flow-Slot-Step (Berlin-Wall-Clock -> UTC-ISO).
  // Nur setzen, wenn der Caller den Parameter uebergibt (undefined = alte Caller, unberuehrt).
  // ladeMatchingFlow liest lead.wunschtermin und rankt die Slots danach.
  if (wunschterminLokal !== undefined) {
    update.wunschtermin = resolveWunschterminIso(wunschterminLokal)
  }

  const { error: updErr } = await admin.from('leads').update(update).eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (keine neuen Fehler).

- [ ] **Step 5: Commit**

```bash
git add "src/app/flow/[token]/self-service-actions.ts"
git commit -m "feat(flow-wunschtermin): speichereBesichtigungsortFlow persistiert optionalen Wunschtermin (lead.wunschtermin)"
```

---

### Task 3: `WunschterminPicker` in den `ort_abfragen`-Schritt

**Files:**
- Modify: `src/app/flow/[token]/FlowSlotStep.tsx`

**Interfaces:**
- Consumes: `WunschterminPicker` (`{ value: string; onChange: (v: string) => void }`) aus `@/app/embed/gutachter-finder/_components/WunschterminPicker`; `speichereBesichtigungsortFlow(token, ort, wunschterminLokal?)` (Task 2).
- Produces: — (Blatt-Komponente, kein weiterer Consumer).

- [ ] **Step 1: Add the import**

In `src/app/flow/[token]/FlowSlotStep.tsx`, nach dem bestehenden `GooglePlaceAutocomplete`-Import (Z. 13) ergänzen:

```ts
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'
```

- [ ] **Step 2: Add the state**

Nach `const [ortSpeichern, setOrtSpeichern] = useState(false)` (Z. 49) ergänzen:

```ts
// AAR-956: optionaler Wunschtermin (Berlin-Wall-Clock "YYYY-MM-DDTHH:MM" oder "").
// Wird beim Ort-Bestaetigen an speichereBesichtigungsortFlow gereicht -> lead.wunschtermin
// -> ladeMatchingFlow rankt die Slots danach. Leer = naechste freie Termine.
const [wunschterminLokal, setWunschterminLokal] = useState('')
```

- [ ] **Step 3: Pass the Wunschtermin into the persist call**

In `speichereOrtUndMatch` (Z. 108–119) den Action-Aufruf anpassen:

Vorher:
```ts
    const r = await speichereBesichtigungsortFlow(token, ort)
```
Nachher:
```ts
    const r = await speichereBesichtigungsortFlow(token, ort, wunschterminLokal || null)
```

- [ ] **Step 4: Render the picker in the `ort_abfragen` step**

Im `ort_abfragen`-Return (Z. 150–182), **direkt nach** dem Hinweis-Absatz `<p className="text-sm text-claimondo-ondo mb-4">{t('ort.hinweis')}</p>` (Z. 154) und **vor** dem `{vorschlagOrt && (`-Block, einfügen:

```tsx
        {/* AAR-956: optionaler Wunschtermin — rankt die Gutachter-Slots (lead.wunschtermin
            -> ladeMatchingFlow). Hardcoded-DE wie im Embed-Finder (per-Locale-JSON ohne
            Key-Fallback -> fehlender i18n-Key wuerde Nicht-de-Kunden crashen). */}
        <div className="mb-5">
          <h2 className="text-base font-semibold text-claimondo-navy">Ihr Wunschtermin</h2>
          <p className="mt-0.5 mb-2 text-sm text-claimondo-ondo">
            Optional — wählen Sie Ihren Wunschtag und die Uhrzeit.
          </p>
          <WunschterminPicker value={wunschterminLokal} onChange={setWunschterminLokal} />
        </div>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/flow/[token]/FlowSlotStep.tsx"
git commit -m "feat(flow-wunschtermin): WunschterminPicker im /flow ort_abfragen-Schritt (optional, DB-getrieben)"
```

---

### Task 4: Verifikation & Gates

**Files:** keine (nur Prüfläufe).

- [ ] **Step 1: Unit-Tests grün**

Run: `npx vitest run wunschtermin`
Expected: PASS (6/6).

- [ ] **Step 2: Ratchets grün**

Run: `npm run check:token-audit`
Run: `npm run check:component-set`
Run: `npm run check:knip`
Expected: alle exit 0 (Änderung ist additiv, `WunschterminPicker` bereits token-gebunden, keine neuen toten Files/Deps).

- [ ] **Step 3: Voller Build**

Run (PowerShell): `$env:NODE_OPTIONS="--max-old-space-size=8192"; npm run build`
Expected: Build erfolgreich (Route `/flow/[token]` kompiliert ohne Next-Validator-Fehler).

- [ ] **Step 4: Lokaler E2E-Smoke (Controller-geführt)**

Verifiziert den echten Pfad gegen echte lib-Funktionen. Mechanik = Go-Live-Re-Walk (siehe `memory/project_aar956_canonical_golive.md`):

1. Dev-Server mit `CANONICAL_FLOWLINK_ENABLED=true` starten.
2. Synthetischer schaden-melden-Lead (nur Kontakt, **kein** Ort/Termin) + kanonischer FlowLink-Token via `issueCanonicalFlowLinkForAnfrage` bzw. Test-gfa mit `zugeordneter_sv_id` = Test-SV `1da11741-a406-45ce-a27b-c041576cccbb` (Köln). **Nur Test-SVs** (signSAandCreateFall benachrichtigt den SV).
3. `/flow/[token]` → `ort_abfragen`-Schritt: `WunschterminPicker` sichtbar über der Besichtigungsort-Eingabe.
4. Wunschtermin wählen (z.B. Datum + „10:00") + Besichtigungsort bestätigen.
5. DB-Assert (Supabase MCP, READ): `select wunschtermin from leads where id = '<leadId>'` → UTC-ISO, TZ-korrekt (Berlin 10:00 Sommer → `08:00:00+00`).
6. Slots werden angezeigt + nach dem Wunschtermin gerankt (erster Slot ≈ Wunschzeit, sofern verfügbar).
7. Gegenprobe: neuer Lead, **kein** Wunschtermin → Ort bestätigen → `lead.wunschtermin` bleibt `null`, Slots in normaler Reihenfolge, kein Fehler.
8. Testdaten 0-Rest cleanen (Lead + evtl. `gutachter_termine`-Reservierung + gfa).

Expected: `lead.wunschtermin` TZ-korrekt persistiert, Slots gerankt, leerer Fall funktioniert, 0 Testdaten-Reste, zero 5xx.

---

## Self-Review

**1. Spec coverage:**
- Wunschtermin-Input im `ort_abfragen` → Task 3. ✅
- DB-getrieben (persist `lead.wunschtermin` → `ladeMatchingFlow` liest) → Task 2 + unverändertes `ladeMatchingFlow`. ✅
- Reuse `WunschterminPicker` / `berlinWallClockToUtc` / `ladeMatchingFlow` → Tasks 1–3. ✅
- TZ-Korrektheit → Task 1 (`resolveWunschterminIso` → `berlinWallClockToUtc`) + Smoke Step 5. ✅
- Optionale Semantik (leer = normal) → Task 1 (`''`→`null`) + Task 2 (`null`-Set) + Smoke Step 7. ✅
- Kein Migration / keine Engine-Änderung → bestätigt. ✅
- Scope-Grenze (Leads, die `ort_abfragen` überspringen) → bewusst nicht adressiert (Spec dokumentiert). ✅
- Koordination additiv → optionaler Param + neuer UI-Block, kein aar-956-File-Move. ✅

**2. Placeholder scan:** Keine TBD/TODO; alle Code-Blöcke vollständig. ✅

**3. Type consistency:** `resolveWunschterminIso(string|null|undefined): string|null` konsistent zwischen Task 1 (Definition), Task 2 (Consumer). `speichereBesichtigungsortFlow(..., wunschterminLokal?: string|null)` konsistent zwischen Task 2 (Definition) + Task 3 (Aufruf mit `wunschterminLokal || null`). `WunschterminPicker`-Props (`value`/`onChange`) konsistent mit dem echten Component-Export. ✅
