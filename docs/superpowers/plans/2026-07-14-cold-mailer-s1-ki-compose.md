# Cold-Mailer S1 — KI-Composer (DB-unabhängiger Vorzug) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Die KI-Generierung einer Cold-Mail-Vorlage (Betreff + HTML-Body) je Lead-Rolle — reine LLM-Funktion, DB-unabhängig, damit sie **jetzt** baubar ist, während die S0-DDL am (fleet-weit 404) Supabase-Plugin blockiert ist.

**Architecture:** Ein Leaf-Lib `src/lib/cold-mail/compose-ki.ts` nach dem etablierten `src/lib/linkedin/compose.ts`-Muster (inline Anthropic-Client + **dependency-injected `generate`-Fn** für Testbarkeit ohne SDK-Mock + fail-soft). Neuer `AI_MODELS.cold_mail_compose` (Sonnet 4.6, deutsche Vertriebstext-Qualität, Spec §2/§5).

**Tech Stack:** `@anthropic-ai/sdk`, `AI_MODELS`, vitest.

## Global Constraints

Wie S0 (`2026-07-14-cold-mailer-s0-fundament.md`): kein `const/type`-Export aus 'use server' (diese Lib ist KEIN 'use server' → Exporte ok); Result-Object `{ok,...}`; Umlaute in nutzersichtbaren/Mail-Texten (der System-Prompt erzeugt Kundentext → korrekte ä/ö/ü/ß im Prompt); YAGNI; vitest grün + tsc grün; eigener Commit.

## Scope-Split (wichtig)

S1 = „Vorlagen + KI-Editor" zerfällt in:
- **DB-unabhängig, JETZT baubar:** der KI-Composer (dieser Plan, Task 1).
- **DDL-gated (nach S0-DDL + Plugin-Reconnect, separat zu detaillieren):** Tabelle `cold_mail_vorlagen`, `speichereVorlage`/`generiereVorlageKi`-Server-Actions, Editor-UI im Cockpit (Betreff+Body+Merge-Var-Chips, „Von KI erstellen"-Button). Diese hängen an denselben Gates wie S0-Tasks 5/6.

---

### Task 1: `AI_MODELS.cold_mail_compose` + `compose-ki.ts`

**Files:**
- Modify: `src/lib/ai/models.ts` (ein additiver Key — Achtung: geteiltes File, nur anhängen)
- Create: `src/lib/cold-mail/compose-ki.ts`
- Test: `src/lib/cold-mail/__tests__/compose-ki.test.ts`

**Interfaces:**
- Produces:
  - `type ColdMailRolle = 'makler' | 'werkstatt' | 'sachverstaendiger'`
  - `type ComposeInput = { rolle: ColdMailRolle; ziel: string; tonalitaet?: string }`
  - `type ComposeResult = { ok: true; betreff: string; body_html: string } | { ok: false; error: string }`
  - `type GenerateFn = (system: string, user: string) => Promise<string>`
  - `generiereColdMailVorlage(input: ComposeInput, deps?: { generate?: GenerateFn }): Promise<ComposeResult>`

- [ ] **Step 1: `AI_MODELS.cold_mail_compose` hinzufügen** — in `src/lib/ai/models.ts` im `AI_MODELS`-Objekt (vor `} as const`) additiv einfügen:
```typescript
  /**
   * Cold-Mailer S1: KI-Generierung von Cold-Mail-Vorlagen (Betreff + HTML-Body) je
   * Lead-Rolle. Deutsche B2B-Vertriebstexte, Qualität > Speed → Sonnet 4.6.
   */
  cold_mail_compose: 'claude-sonnet-4-6',
```

- [ ] **Step 2: Failing test — `compose-ki.test.ts`** (DI der generate-Fn, kein SDK-Mock)
```typescript
import { describe, it, expect } from 'vitest'
import { generiereColdMailVorlage } from '../compose-ki'

describe('generiereColdMailVorlage', () => {
  it('parst JSON aus der KI-Antwort', async () => {
    const generate = async () => '{"betreff":"Partnerschaft","body_html":"<p>Hallo {Ansprechpartner}</p>"}'
    const res = await generiereColdMailVorlage({ rolle: 'makler', ziel: 'Termin' }, { generate })
    expect(res).toEqual({ ok: true, betreff: 'Partnerschaft', body_html: '<p>Hallo {Ansprechpartner}</p>' })
  })
  it('toleriert Prosa um das JSON herum', async () => {
    const generate = async () => 'Klar!\n{"betreff":"X","body_html":"<p>Y</p>"}\nViel Erfolg.'
    const res = await generiereColdMailVorlage({ rolle: 'werkstatt', ziel: 'z' }, { generate })
    expect(res).toEqual({ ok: true, betreff: 'X', body_html: '<p>Y</p>' })
  })
  it('liefert ok:false bei unparsebarer Antwort', async () => {
    const res = await generiereColdMailVorlage({ rolle: 'makler', ziel: 'z' }, { generate: async () => 'kein json' })
    expect(res.ok).toBe(false)
  })
  it('liefert ok:false wenn generate wirft', async () => {
    const res = await generiereColdMailVorlage({ rolle: 'makler', ziel: 'z' }, { generate: async () => { throw new Error('boom') } })
    expect(res).toEqual({ ok: false, error: 'boom' })
  })
  it('reicht rollen-spezifischen System-Prompt + Ziel/Tonalität an generate', async () => {
    let sys = '', usr = ''
    const generate = async (s: string, u: string) => { sys = s; usr = u; return '{"betreff":"a","body_html":"b"}' }
    await generiereColdMailVorlage({ rolle: 'sachverstaendiger', ziel: 'Gutachtenaufträge', tonalitaet: 'seriös' }, { generate })
    expect(sys).toContain('Sachverständiger')
    expect(usr).toContain('Gutachtenaufträge')
    expect(usr).toContain('seriös')
  })
})
```

- [ ] **Step 3: Run → FAIL** (`npx vitest run src/lib/cold-mail/__tests__/compose-ki.test.ts`).

- [ ] **Step 4: Implement `src/lib/cold-mail/compose-ki.ts`**
```typescript
// KI-Generierung von Cold-Mail-Vorlagen (Betreff + HTML-Body) je Lead-Rolle.
// Muster analog src/lib/linkedin/compose.ts: inline Anthropic-Client + DI-fähige generate-Fn
// (Testbarkeit ohne SDK-Mock). Fail-soft als Result-Object — der Admin ist im Loop,
// also Fehler zurückgeben statt still einen Fallback zu produzieren.
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'

export type ColdMailRolle = 'makler' | 'werkstatt' | 'sachverstaendiger'
export type ComposeInput = { rolle: ColdMailRolle; ziel: string; tonalitaet?: string }
export type ComposeResult =
  | { ok: true; betreff: string; body_html: string }
  | { ok: false; error: string }
export type GenerateFn = (system: string, user: string) => Promise<string>

const ROLLEN_KONTEXT: Record<ColdMailRolle, string> = {
  makler:
    'Empfänger ist ein Versicherungsmakler. Claimondo nimmt ihm die komplette Kfz-Schadenabwicklung seiner Mandanten ab (Gutachter-Vermittlung, Werkstatt, Anwaltsanbindung) — er behält den Kunden, spart Zeit, wirkt kompetenter.',
  werkstatt:
    'Empfänger ist eine Kfz-Werkstatt. Claimondo bringt ihr regulierte Reparaturaufträge (unverschuldete Unfälle, § 249 BGB, keine Kürzung) und übernimmt Gutachten + Abrechnung.',
  sachverstaendiger:
    'Empfänger ist ein Kfz-Sachverständiger/Gutachter. Claimondo bringt ihm qualifizierte Gutachtenaufträge in seiner Region und digitalisiert die Auftragsannahme.',
}

function buildSystem(rolle: ColdMailRolle): string {
  return [
    'Du schreibst eine professionelle deutsche Erstkontakt-Email (Cold Outreach) für das Claimondo Partnernetzwerk.',
    'Claimondo ist Deutschlands Plattform für Kfz-Schadensregulierung.',
    ROLLEN_KONTEXT[rolle],
    'Ton: sachlich-kompetent, seriös, B2B — KEIN reißerischer Werbeslang. Kurz (Body max ~1200 Zeichen).',
    'Nutze wo sinnvoll die Merge-Platzhalter GENAU so: {Ansprechpartner}, {Firma}, {Ort}, {Vorname}. Erfinde keine Namen.',
    'Der Body ist schlichtes HTML (<p>, <br>, <strong>, <ul><li>) — KEIN <html>/<head>/<body>, kein CSS, keine Bilder. Den Abmeldelink NICHT einbauen (wird separat angehängt).',
    'Antworte AUSSCHLIESSLICH mit einem JSON-Objekt: {"betreff": "...", "body_html": "..."} — kein Markdown, kein Text davor oder danach.',
  ].join('\n')
}

function extractJson(raw: string): { betreff: string; body_html: string } | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    if (typeof parsed?.betreff === 'string' && typeof parsed?.body_html === 'string') {
      return { betreff: parsed.betreff, body_html: parsed.body_html }
    }
    return null
  } catch {
    return null
  }
}

async function generateWithClaude(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY ist nicht konfiguriert.')
  const client = new Anthropic({ apiKey })
  const res = await client.messages.create({
    model: AI_MODELS.cold_mail_compose,
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const block = res.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}

export async function generiereColdMailVorlage(
  input: ComposeInput,
  deps: { generate?: GenerateFn } = {},
): Promise<ComposeResult> {
  const generate = deps.generate ?? generateWithClaude
  const system = buildSystem(input.rolle)
  const user = [
    `Ziel der Email: ${input.ziel}`,
    input.tonalitaet ? `Tonalität: ${input.tonalitaet}` : '',
  ].filter(Boolean).join('\n')
  let raw: string
  try {
    raw = await generate(system, user)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'KI-Generierung fehlgeschlagen.' }
  }
  const parsed = extractJson(raw)
  if (!parsed) return { ok: false, error: 'KI-Antwort konnte nicht als Vorlage gelesen werden. Bitte erneut versuchen.' }
  return { ok: true, betreff: parsed.betreff, body_html: parsed.body_html }
}
```

- [ ] **Step 5: Run → PASS** (5/5).

- [ ] **Step 6: Typecheck** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` grün für die neuen/geänderten Files.

- [ ] **Step 7: Commit**
```bash
git add src/lib/ai/models.ts src/lib/cold-mail/compose-ki.ts src/lib/cold-mail/__tests__/compose-ki.test.ts
git commit -m "feat(cold-mailer): S1 KI-Composer — Vorlagen-Generierung je Rolle (DB-unabhaengig)"
```

## Danach (DDL-gated, separat detailliert nach S0-DDL)
`cold_mail_vorlagen`-Tabelle + `generiereVorlageKi`/`speichereVorlage`-Actions (Wrapper um diese Lib + Persistenz) + Editor-UI (Betreff/Body/Merge-Chips + „Von KI erstellen") + Rollen-Filter.
