# C2a — `createCase`-Modul + Wizard-A-1-Adapter — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein `createCase`-Modul (`src/lib/intake/create-case.ts`), das jede Fallanlage kapselt und die Pflicht-Nachwirkungen garantiert + idempotent ausführt; als Beweis läuft der Haupt-Wizard A-1 (`meldeNeuenSchaden`) über das Modul.

**Architecture:** Strangler-Fig — das Modul ORCHESTRIERT die bestehenden, bereits result-objekt-basierten Bausteine (`createLead` · `ensureCanonicalFlowLinkForLead` · `convertLeadToFall`) und schließt deren zwei Lücken (FlowLink fehlt im direct-claim-Pfad; Dedup fehlt/uneinheitlich). Ein generischer Intake-Dedup-Key (Person+Schaden+Zeitfenster) verallgemeinert die source-channel-spezifischen `findRecent*`-Helfer. Der Wizard behält seine Mapping-Schicht (`buildSchadenLeadInput`) + `ensureVehicleForClaim`; nur `createLead`+`convertLeadToFall` werden durch **einen** `createCase`-Call ersetzt.

**Tech Stack:** TypeScript, Next.js 15 Server-Actions, Supabase-JS (Admin-Client), vitest (pure-unit).

## Global Constraints (verbatim aus AGENTS.md / FUNDAMENT)

- **Kein Direct-Push auf `main`** (Regel 1) · PR gegen `staging`.
- **DDL nur über Supabase-MCP** (Regel 2) — **C2a braucht KEINE DDL** (nur bestehende Tabellen `leads`/`claims`/`flow_links`).
- **Server-Action-Pattern:** Result-Object `{ ok; error? }`, kein `throw` mischen; Non-Critical-Sends in try/catch (AGENTS.md §Server-Actions). `createCase` liefert ein Result-Object.
- **Verfassung §2:** Kein direkter `operative_status`-Write — C2 legt über `convertLeadToFall`→`convertLeadToClaim` an (initialer Cursor im Kern); **kein WILD-Write aus C2**.
- **7-Punkte-Audit** vor jedem Commit; **Regel-4** Prod-Smoke nach Deploy.
- **Umlaute** in nutzersichtbaren Strings (hier v.a. Error-Messages, die im UI landen).

## Adoptierte DECISIONS (siehe `docs/fundament/DECISIONS.md`, 2026-08-04 · C2)

- **§7#1 Muster-L-Erstnotif → garantierter Kanal:** `createCase` sichert für JEDE Meldung einen Kunde-Kanal. Umsetzung C2a: **FlowLink IMMER** (idempotent, harmlos, ein Magic-Link-Fallback auch für direct-claim); der Voll-Send bleibt bis C3 der Wrapper-`sendFallCommunication` (direct-claim) bzw. der FlowLink-Send (lead-first). (§1-Prinzip 8/10.)
- **§7#2 Gegner-Flow-Pflichtdok → ja, im Kern:** relevant erst für C2b (A-3 Gegner) — hier dokumentiert, nicht C2a-Code.
- **§9#2 /flow-Reconcile:** C2a extrahiert die /flow-Garantien NICHT ins Modul und rewired /flow NICHT. `/flow` bleibt der Konversions-Konvergenzpunkt; `createCase` (mode='lead-first') SPEIST ihn (Lead+FlowLink). Eine spätere Reconcile-Tranche kann /flow selbst auf `createCase` heben. (Hält C2a bounded + kollisionsfrei zur heißen aar-956-Intake-Lane.)
- **§7#3 Marketing-Wizard:** deferred an C2c (Scope-Frage, offen für Aaron).

## Kollisions-Sequencing (Marker `coordination-fundament-c2-create-case-CLAIM`)

C2a = neues Modul (kollisionsfrei) + Wizard **A-1** (`kunde/schaden-melden`, ≠ Embed B-1). **aar-956-orthogonal.** C2b+ (Embed/Aircall/Gegner) kollidiert mit der aar-956-Lane → nach deren Settle.

---

## File Structure

| File | Verantwortung | Art |
|---|---|---|
| `src/lib/intake/dedup-key.ts` | Pure Normalisierung + Match-Prädikat des Intake-Dedup-Keys (Person+Schaden). Unit-testbar. | Create |
| `src/lib/intake/dedup-key.test.ts` | vitest-Unit für `normalizeDedupKey` / `dedupKeyIsUsable`. | Create |
| `src/lib/intake/recent-intake-lead.ts` | `findRecentIntakeLead(key, window)` — generischer DB-Reader (verallgemeinert `findRecentMcpLead`/`findRecentGegnerLead`). | Create |
| `src/lib/intake/create-case.ts` | `createCase(client, input)` — die Orchestrierung (Dedup→Lead→FlowLink→[Convert]). | Create |
| `src/app/kunde/schaden-melden/actions.ts:17-68` | Wizard A-1 → dünner Adapter auf `createCase`. | Modify |

Kein DDL, keine neuen Tabellen, keine gelöschten Files (C2a fügt nur hinzu + verdrahtet den Wizard um).

---

## Task 1: Intake-Dedup-Key (pure) + Reader

**Files:**
- Create: `src/lib/intake/dedup-key.ts`
- Test: `src/lib/intake/dedup-key.test.ts`
- Create: `src/lib/intake/recent-intake-lead.ts`

**Interfaces:**
- Produces:
  - `type DedupKeyInput = { telefon?: string | null; email?: string | null; kennzeichen?: string | null }`
  - `type NormalizedDedupKey = { telefon: string | null; email: string | null; kennzeichen: string | null }`
  - `function normalizeDedupKey(input: DedupKeyInput): NormalizedDedupKey` (trim; email lowercase; leer→null)
  - `function dedupKeyIsUsable(key: NormalizedDedupKey): boolean` (mind. eine Person-Kennung (telefon|email) UND … siehe unten)
  - `function findRecentIntakeLead(input: DedupKeyInput, opts?: { windowMs?: number }): Promise<{ leadId: string; claimId: string | null } | null>`

- [ ] **Step 1: Failing test für `normalizeDedupKey` + `dedupKeyIsUsable`**

`src/lib/intake/dedup-key.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeDedupKey, dedupKeyIsUsable } from './dedup-key'

describe('normalizeDedupKey', () => {
  it('trimmt + lowercased email, leere Strings -> null', () => {
    expect(normalizeDedupKey({ telefon: ' 0170 1 ', email: ' A@B.DE ', kennzeichen: '' }))
      .toEqual({ telefon: '0170 1', email: 'a@b.de', kennzeichen: null })
  })
  it('undefined/null -> null', () => {
    expect(normalizeDedupKey({})).toEqual({ telefon: null, email: null, kennzeichen: null })
  })
})

describe('dedupKeyIsUsable', () => {
  it('braucht Person (telefon|email) UND kennzeichen', () => {
    expect(dedupKeyIsUsable({ telefon: '0170', email: null, kennzeichen: 'B-XX 1' })).toBe(true)
    expect(dedupKeyIsUsable({ telefon: null, email: 'a@b.de', kennzeichen: 'B-XX 1' })).toBe(true)
    expect(dedupKeyIsUsable({ telefon: '0170', email: null, kennzeichen: null })).toBe(false) // keine Schadenkennung
    expect(dedupKeyIsUsable({ telefon: null, email: null, kennzeichen: 'B-XX 1' })).toBe(false) // keine Person
  })
})
```
> Begründung `dedupKeyIsUsable` = Person UND Kennzeichen: der Prep §5 verlangt Person+Schadenkennung; ohne beide ist der Key zu breit (würde fremde Meldungen zusammenlegen). Fehlt eine Achse → Dedup wird übersprungen (lieber neu anlegen als falsch zusammenführen — dieselbe Best-effort-Direktive wie in `recent-lead-dedup.ts`).

- [ ] **Step 2: Test läuft rot**

Run: `npx vitest run src/lib/intake/dedup-key.test.ts`
Expected: FAIL („Cannot find module './dedup-key'").

- [ ] **Step 3: `dedup-key.ts` implementieren**

`src/lib/intake/dedup-key.ts`:
```ts
// C2 (Fundament, Ein Intake): der generische Intake-Dedup-Key — Person (telefon|email) + Schaden
// (kennzeichen) in einem Zeitfenster. Verallgemeinert die source-channel-spezifischen findRecent*-
// Helfer (recent-lead-dedup.ts) auf EINEN Key, den jeder createCase-Adapter mitgibt.

export type DedupKeyInput = {
  telefon?: string | null
  email?: string | null
  kennzeichen?: string | null
}

export type NormalizedDedupKey = {
  telefon: string | null
  email: string | null
  kennzeichen: string | null
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

export function normalizeDedupKey(input: DedupKeyInput): NormalizedDedupKey {
  const email = clean(input.email)
  return {
    telefon: clean(input.telefon),
    email: email ? email.toLowerCase() : null,
    kennzeichen: clean(input.kennzeichen),
  }
}

/** Nutzbar nur wenn eine Person-Kennung (telefon ODER email) UND die Schadenkennung (kennzeichen)
 *  vorliegen — sonst wäre der Key zu breit. Fehlt eine Achse -> Caller überspringt den Dedup. */
export function dedupKeyIsUsable(input: DedupKeyInput): boolean {
  const k = normalizeDedupKey(input)
  const hatPerson = k.telefon !== null || k.email !== null
  return hatPerson && k.kennzeichen !== null
}
```

- [ ] **Step 4: Test läuft grün**

Run: `npx vitest run src/lib/intake/dedup-key.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: `recent-intake-lead.ts` implementieren** (DB-Reader, kein Unit-Test — DB-Verhalten = Prod-Smoke Task 4)

`src/lib/intake/recent-intake-lead.ts`:
```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeDedupKey, dedupKeyIsUsable, type DedupKeyInput } from './dedup-key'

const DEFAULT_WINDOW_MS = 10 * 60_000 // 10 min — analog recent-lead-dedup.ts

/**
 * Findet einen frischen Lead, der zu Person (telefon ODER email) UND kennzeichen im Fenster passt.
 * Best-effort: bei nicht-nutzbarem Key ODER DB-Fehler -> null (lieber neu anlegen als falsch mergen).
 * Gibt die schon konvertierte claim-id mit zurück, damit der Caller den bestehenden Vorgang reuse-t.
 */
export async function findRecentIntakeLead(
  input: DedupKeyInput,
  opts?: { windowMs?: number },
): Promise<{ leadId: string; claimId: string | null } | null> {
  if (!dedupKeyIsUsable(input)) return null
  const k = normalizeDedupKey(input)
  const sinceIso = new Date(Date.now() - (opts?.windowMs ?? DEFAULT_WINDOW_MS)).toISOString()
  const admin = createAdminClient()

  // Person-Achse als PostgREST-or (telefon.eq ODER email.eq) + kennzeichen (AND) + Fenster.
  const orParts: string[] = []
  if (k.telefon) orParts.push(`telefon.eq.${k.telefon}`)
  if (k.email) orParts.push(`email.eq.${k.email}`)

  let q = admin
    .from('leads')
    .select('id, konvertiert_zu_claim_id')
    .eq('kennzeichen', k.kennzeichen as string)
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
  q = q.or(orParts.join(','))

  const { data, error } = await q.maybeSingle()
  if (error) {
    console.error('[intake/dedup] findRecentIntakeLead fehlgeschlagen:', error.message)
    return null
  }
  return data
    ? { leadId: data.id as string, claimId: (data.konvertiert_zu_claim_id as string | null) ?? null }
    : null
}
```
> ⚠ **§10-Verifikation vor Code:** `leads`-Spalten `kennzeichen`, `email`, `telefon`, `konvertiert_zu_claim_id`, `created_at` gegen den dann-aktuellen Schema-Snapshot (`src/lib/supabase/database.types.ts`) prüfen — `recent-lead-dedup.ts` nutzt `konvertiert_zu_claim_id` + `created_at`, daher belegt.

- [ ] **Step 6: Commit**
```bash
git add src/lib/intake/dedup-key.ts src/lib/intake/dedup-key.test.ts src/lib/intake/recent-intake-lead.ts
git commit -m "feat(fundament-C2a): generischer Intake-Dedup-Key + Reader"
```

---

## Task 2: `createCase`-Modul

**Files:**
- Create: `src/lib/intake/create-case.ts`

**Interfaces:**
- Consumes (bestehende, Ist-verifiziert 04.08.):
  - `createLead(client, base: LeadBase, extra?: LeadExtra): Promise<{ ok:true; leadId } | { ok:false; error }>` (`@/lib/leads/create-lead`)
  - `ensureCanonicalFlowLinkForLead(leadId, opts?: { serviceTyp?; sprache? }): Promise<{ ok:true; token; wiederverwendet } | { ok:false; error }>` (`@/lib/start-link/ensure-flowlink-for-lead`)
  - `convertLeadToFall(supabase, leadId, userId): Promise<{ fallId; linked }>` **(WIRFT)** (`@/lib/leads/convert-lead-to-fall`) — macht Kern+Pflichtdok+Kunde-WA+KB. `fallId === claim-id`.
  - `findRecentIntakeLead` (Task 1)
- Produces:
  - `type CreateCaseInput = { mode: 'lead-first' | 'direct-claim'; base: LeadBase; extra?: LeadExtra; triggerByUserId: string; dedup?: DedupKeyInput; flowLink?: { serviceTyp?: string | null; sprache?: string | null } }`
  - `type CreateCaseResult = { ok: true; leadId: string; claimId: string | null; flowLinkToken: string | null; deduped: boolean } | { ok: false; error: string }`
  - `createCase(client: SupabaseClient<Database>, input: CreateCaseInput): Promise<CreateCaseResult>`

- [ ] **Step 1: `create-case.ts` implementieren** (DB-orchestrierend → Verifikation via Prod-Smoke Task 4, nicht Unit)

`src/lib/intake/create-case.ts`:
```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { createLead, type LeadBase, type LeadExtra } from '@/lib/leads/create-lead'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { convertLeadToFall } from '@/lib/leads/convert-lead-to-fall'
import { findRecentIntakeLead } from './recent-intake-lead'
import type { DedupKeyInput } from './dedup-key'

// C2 (Fundament, Ein Intake): kapselt DIE Meldung mit garantierten, idempotenten Nachwirkungen.
// mode='lead-first' -> Lead + FlowLink (Muster L: Konversion später via /flow).
// mode='direct-claim' -> zusätzlich Claim (via convertLeadToFall = Kern + Pflichtdok + Kunde-WA + KB).
// FlowLink IMMER (DECISIONS 2026-08-04 · C2 §7#1): idempotenter Kunde-Kanal-Fallback.
// Reihenfolge + Non-Fatalität je Sub-Effekt wie im Wrapper; Dedup zuerst.

export type CreateCaseInput = {
  mode: 'lead-first' | 'direct-claim'
  base: LeadBase
  extra?: LeadExtra
  /** Für die direct-claim-Konversion (KB-Zuweisung, Timeline-Actor). */
  triggerByUserId: string
  /** Optionaler Dedup-Key (Person+Schaden). Fehlt/unbrauchbar -> kein Dedup. */
  dedup?: DedupKeyInput
  flowLink?: { serviceTyp?: string | null; sprache?: string | null }
}

export type CreateCaseResult =
  | { ok: true; leadId: string; claimId: string | null; flowLinkToken: string | null; deduped: boolean }
  | { ok: false; error: string }

export async function createCase(
  client: SupabaseClient<Database>,
  input: CreateCaseInput,
): Promise<CreateCaseResult> {
  // 1. Dedup — existierender frischer Lead/Claim zum selben Key? -> denselben zurück, kein Zweit-Insert.
  if (input.dedup) {
    const hit = await findRecentIntakeLead(input.dedup)
    if (hit) {
      return { ok: true, leadId: hit.leadId, claimId: hit.claimId, flowLinkToken: null, deduped: true }
    }
  }

  // 2. Lead (createLead erzwingt source_channel + gültigen status via LeadBase).
  const created = await createLead(client, input.base, input.extra)
  if (!created.ok) return { ok: false, error: created.error }
  const leadId = created.leadId

  // 3. FlowLink IMMER (schließt die B-2/C-4-„kein Kunde-Kanal"-Lücke). Non-fatal: bei Fehler
  //    trotzdem weiter — der Fall/Lead steht, der Link ist nachziehbar (idempotent).
  const fl = await ensureCanonicalFlowLinkForLead(leadId, {
    serviceTyp: input.flowLink?.serviceTyp ?? null,
    sprache: input.flowLink?.sprache ?? null,
  })
  const flowLinkToken = fl.ok ? fl.token : null
  if (!fl.ok) console.error('[intake/createCase] FlowLink fehlgeschlagen (non-fatal):', fl.error)

  // 4. direct-claim: Konversion über den Wrapper (Kern + Pflichtdok + Kunde-WA + KB + link-data).
  //    convertLeadToFall WIRFT -> hier abfangen und in ein Result-Object übersetzen.
  let claimId: string | null = null
  if (input.mode === 'direct-claim') {
    try {
      const conv = await convertLeadToFall(client, leadId, input.triggerByUserId)
      claimId = conv.fallId // claims = SSoT, fall-id === claim-id
    } catch (err) {
      console.error('[intake/createCase] convertLeadToFall:', err)
      return { ok: false, error: 'Beim Anlegen des Falls ist etwas schiefgelaufen. Bitte versuche es erneut.' }
    }
  }

  return { ok: true, leadId, claimId, flowLinkToken, deduped: false }
}
```

- [ ] **Step 2: tsc-Check** (keine Runtime-Tests hier — DB-Verhalten in Task 4)

Run (CI-äquivalent, lokal nur wenn node_modules vollständig): `npm run build`
Expected: grün. (Lokal 0 node_modules → CI ist das Gate; siehe Regel-4-Notiz.)

- [ ] **Step 3: Commit**
```bash
git add src/lib/intake/create-case.ts
git commit -m "feat(fundament-C2a): createCase-Modul (dedup->lead->flowlink->[convert])"
```

---

## Task 3: Wizard A-1 → Adapter auf `createCase`

**Files:**
- Modify: `src/app/kunde/schaden-melden/actions.ts:17-68` (`meldeNeuenSchaden`)

**Interfaces:**
- Consumes: `createCase` (Task 2), `buildSchadenLeadInput` (bleibt: liefert `{ ok; base: LeadBase; extra: LeadExtra }`).
- Produces: unveränderte Signatur `meldeNeuenSchaden(form): { ok:true; fallId } | { ok:false; error }`.

- [ ] **Step 1: Adapter umschreiben**

`meldeNeuenSchaden` — ersetze den `createLead`+`convertLeadToFall`-Block (aktuell :40-55) durch **einen** `createCase`-Call. Imports: `convertLeadToFall`+`createLead` raus, `createCase` rein.

Neuer Block (ersetzt Zeilen 40-55, Rest wie gehabt):
```ts
  // C2a (Fundament, Ein Intake): der Wizard ist jetzt ein dünner Adapter auf createCase.
  // Modus 'direct-claim' (Muster D — sofort Claim). createCase garantiert: Dedup (Doppel-Submit
  // -> 1 Claim), Lead, FlowLink (Kunde-Kanal), Konversion inkl. Pflichtdok/Kunde-WA/KB.
  const result = await createCase(db, {
    mode: 'direct-claim',
    base: built.base,
    extra: built.extra,
    triggerByUserId: user.id,
    dedup: {
      telefon: built.base.telefon ?? null,
      email: built.base.email ?? null,
      kennzeichen: (built.extra.kennzeichen as string | null | undefined) ?? null,
    },
    flowLink: { sprache: (prof?.sprache as string | null) ?? null },
  })
  if (!result.ok) return { ok: false, error: result.error }
  const fallId = result.claimId ?? result.leadId
```
> `fallId = result.claimId ?? result.leadId`: bei direct-claim ist `claimId` immer gesetzt (außer Dedup-Hit auf einen noch-nicht-konvertierten Lead — dann Lead-id; die UI leitet auf `/kunde` um und der Fall erscheint nach Konversion). Der Return-Kontrakt (`{ ok; fallId }`) bleibt.

- [ ] **Step 2: Import-Zeilen anpassen** (`:12-13`)
```ts
// ENTFERNEN: import { createLead } from '@/lib/leads/create-lead'
// ENTFERNEN: import { convertLeadToFall } from '@/lib/leads/convert-lead-to-fall'
// HINZUFÜGEN:
import { createCase } from '@/lib/intake/create-case'
```
> ⚠ `buildSchadenLeadInput`-Import bleibt (die Mapping-Schicht). `ensureVehicleForClaim`-Aufruf (`:57-64`) bleibt UNVERÄNDERT nach dem createCase-Call.

- [ ] **Step 3: Dead-Code-Check** (§4 Audit)

Run: `git grep -n "createLead\|convertLeadToFall" src/app/kunde/schaden-melden/actions.ts`
Expected: 0 Treffer (beide raus, nur noch `createCase`).

- [ ] **Step 4: Commit**
```bash
git add src/app/kunde/schaden-melden/actions.ts
git commit -m "feat(fundament-C2a): Wizard A-1 (meldeNeuenSchaden) -> createCase-Adapter"
```

---

## Task 4: DoD — Verifikation (CI + Regel-4-Prod-Smoke)

**Interfaces:** keine — reine Verifikation.

- [ ] **Step 1: CI grün** (build/tsc + vitest incl. `dedup-key.test.ts` + alle Ratchets). PR gegen `staging`, Body nennt den Smoke-Plan.

- [ ] **Step 2: Regel-4-Prod-Smoke** (nach Deploy, gegen `https://app.claimondo.de`, Test-Kunde `telefon=NULL`):
  - **J2-Weg A-1:** eingeloggt als Test-Kunde `/kunde/schaden-melden` → Schaden melden → assert: 1 Claim angelegt (`/kunde` zeigt den Fall).
  - **Idempotenz (P1 #3):** denselben Schaden (gleiche Person+Kennzeichen) < 10 min ERNEUT melden → assert: **kein zweiter Claim** (Dedup greift; `deduped`-Pfad) — via Live-DB-Verifikation (`leads` zählt 1, nicht 2) begründet im Marker.
  - **FlowLink-Garantie:** assert `flow_links`-Zeile zum Lead existiert (Live-DB).
  - **Pflichtdok-Garantie (unverändert):** assert `fall_dokumente`/Pflichtdok-Slots existieren (der Wrapper-Pfad, jetzt via createCase).
- [ ] **Step 3:** Ergebnis (grün/rot + Assertions) im PR/Marker dokumentieren. Rot → Fix-PR, nicht als erledigt markieren.

**DoD-Grep (C2-Gesamt, hier NUR A-1):** `meldeNeuenSchaden` legt keine Lead-/Claim-Anlage mehr selbst an (nur `createCase`). Register-Zelle A-1 in `docs/fundament/entry-points.md` → ✓ (Folge-PR oder hier mitziehen).

---

## Nicht-Ziele (Scope-Zaun, FUNDAMENT §5 C2)

- Keine weiteren Eingänge (C2b: Embed/Aircall/Gegner — nach aar-956-Settle).
- Keine neuen Meldekanäle, keine Wizard-UX-Umbauten.
- Keine /flow-Rewire (DECISIONS §9#2 → spätere Reconcile-Tranche).
- Keine DDL, kein Dedup-DB-Unique-Index (App-Level reicht für den Doppel-Submit-Threat; exakt-gleichzeitige Races out-of-scope, wie `recent-lead-dedup.ts`).

## Self-Review

- **Spec-Coverage (Prep §2 6 Nachwirkungen):** Dedup ✓(T1/T2) · Lead ✓(T2) · FlowLink ✓(T2, immer) · Claim+Pflichtdok ✓(T2 via Wrapper) · Erstnotif ✓(Wrapper-WA, bis C3) · Reservierung — **A-1 hat keinen Slot** (kein Reservierungs-Eingang) → für C2a n/a, im Modul als späterer Input-Zweig offen (C2b Embed hat Reservierung).
- **Type-Konsistenz:** `LeadBase`/`LeadExtra` aus `create-lead.ts` durchgereicht (keine Neu-Definition); `convertLeadToFall`-`fallId`===claim-id konsistent als `claimId` gemappt; `DedupKeyInput` in T1 definiert, in T2/T3 konsumiert.
- **Placeholder-Scan:** kein TBD/TODO; jeder Code-Step hat vollständigen Code.
- **Ist-Drift-Vorbehalt (§10):** vor Ausführung `create-lead.ts`/`convert-lead-to-fall.ts`/`ensure-flowlink-for-lead.ts`/`schaden-melden/actions.ts` gegen den DANN-aktuellen `origin/staging` neu verifizieren (aar-956-Lane aktiv).
