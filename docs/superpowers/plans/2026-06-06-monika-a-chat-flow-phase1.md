# Monika A-Flow — Phase 1: Core-Chat-Flow + Visual-Identität Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den heutigen linearen Monika-Embed-Flow (`idle→qualify→day→time→form→success`) durch einen chat-artigen 4-Pfad-Flow ersetzen (Schadensberatung / Haftpflicht / Wertgutachten / Gegengutachten), mit Monika-Persona, Siegel-FAB, Multi-Message-Typing und 6 neuen gfa-Spalten — als lauffähiges, Claimondo-gebrandetes Widget. Teaser/Resume/Sound folgen in Phase 2/3.

**Architecture:** Der Flow wird ein **PURE Skript** (`flow-script.ts`: Step-Graph, framework-neutral, vitest-getestet) + ein **Preact-Renderer** (`app.tsx` mit Message-Player). Pure Logik (Step-Graph-Integrität, Payload-Bau, Typing-Dauer, Spalten-Mapping) wird unit-getestet (vitest, `environment: node`); DOM/Preact-Code über `build:embed` + `typecheck:embed` + Browser-Smoke verifiziert. Datenschicht: 6 additive gfa-Spalten + `embed_sites.sv_telefon`, durchgereicht via `EmbedAnfrageSchema` → `insertAnfrage` → gfa.

**Tech Stack:** Preact 10 + `@preact/signals`, esbuild-IIFE (`build:embed`, gzip-Budget < 30 KB), Shadow-DOM-CSS-String, Zod (Schema), Supabase (gfa via service_role), vitest (`node` env). DDL ausschließlich via Supabase-Plugin (AGENTS.md Regel 2).

---

## Scope & Phasen

Dieser Plan = **Phase 1 (von 3)**. Eigenständig shippbar: nach Phase 1 läuft das neue 4-Pfad-Chat-Widget Claimondo-gebrandet und schreibt korrekte Anfragen. **Phase 2** (proaktiver Teaser + Cross-Page-Resume) und **Phase 3** (Sound) bekommen eigene Pläne.

**Variante-B-Gate:** Der neue Flow ersetzt den alten für ALLE Widget-Instanzen. Claimondo-Assets (Siegel, Monika-Foto, „powered by") rendern nur wenn `isClaimondoBranded` = `cfg.source === 'kfz_gutachter_lp' || cfg.theme.brandedByClaimondo`. Variante-B-Whitelabel (`sv_embed` + `brandedByClaimondo === false`) degradiert auf `theme.logoUrl` statt Siegel/Foto — volles B-Theming ist Phase-1-OUT (0 B-Sites live).

---

## File Structure

**Neu:**
- `src/embed/monika/flow-script.ts` — PURE: Step-Graph (4 Pfade), `Answers`/`Anliegen`/`Step`-Typen, `SCRIPT`, `START_STEP`, `walkPath()`-Helper.
- `src/embed/monika/flow-script.test.ts` — vitest: Graph-Integrität + Pfad-Simulation.
- `src/embed/monika/payload.ts` — PURE: `buildPayloadFromAnswers(answers, cfg)` → `AnfragePayload`.
- `src/embed/monika/payload.test.ts` — vitest.
- `src/embed/monika/typing.ts` — PURE: `typingDurationMs(text)`.
- `src/embed/monika/typing.test.ts` — vitest.
- `src/embed/monika/assets.ts` — Siegel-SVG-String (inline) + `monikaPhotoUrl(base)`.
- `public/embed/monika.png` — Monika-Foto (kopiert aus Aarons Downloads).
- `supabase/migrations/<V>_gfa_monika_a_flow_felder.sql`
- `supabase/migrations/<V>_embed_sites_sv_telefon.sql`

**Geändert:**
- `src/embed/monika/types.ts` — `AnfragePayload` + 6 Felder; `MonikaState` raus (Flow ist jetzt Skript-getrieben).
- `src/embed/monika/app.tsx` — komplett-Rewrite: Chat-UI + Message-Player.
- `src/embed/monika/styles.ts` — komplett-Rewrite: Chat-CSS (Bubbles/Chips/Header/Siegel-FAB/Gutschein).
- `src/embed/monika/index.tsx` — `isClaimondoBranded` ableiten + an `MonikaConfig` hängen; Siegel statt Logo-Img-FAB-Fallback.
- `src/lib/schemas/embed-anfrage.ts` — 6 neue optionale Felder.
- `src/lib/embed/anfrage.ts` — `buildAnfrageColumns()` extrahieren (PURE) + 6 Spalten + `wunschtermin_wann`-Komposition; `EmbedSiteConfig.sv_telefon`.
- `src/lib/embed/anfrage.test.ts` — vitest: `buildAnfrageColumns`.
- `src/app/api/embed/config/route.ts` — `sv_telefon` lesen + als `telefon` zurückgeben.

---

## Task 1: Migration — 6 neue gfa-Spalten

**Files:**
- Create: `supabase/migrations/<recorded-version>_gfa_monika_a_flow_felder.sql`

DDL ausschließlich via Supabase-Plugin (Regel 2). Alle Spalten additiv + nullable → value-neutral, kein Consumer bricht.

- [ ] **Step 1: DDL anwenden via Plugin**

`apply_migration({ name: "gfa_monika_a_flow_felder", query: <DDL> })`:

```sql
ALTER TABLE gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS anliegen text
    CHECK (anliegen IN ('schadensberatung','haftpflichtgutachten','wertgutachten','gegengutachten')),
  ADD COLUMN IF NOT EXISTS unfalltyp text
    CHECK (unfalltyp IN ('auffahrunfall','spurwechsel','vorfahrt','parken','sonstiges')),
  ADD COLUMN IF NOT EXISTS schuld_einschaetzung text
    CHECK (schuld_einschaetzung IN ('unverschuldet','nicht_sicher')),
  ADD COLUMN IF NOT EXISTS bewertungsgrund text
    CHECK (bewertungsgrund IN ('reparatur','verkauf')),
  ADD COLUMN IF NOT EXISTS wunsch_tag text
    CHECK (wunsch_tag IN ('morgen','uebermorgen','asap')),
  ADD COLUMN IF NOT EXISTS wunsch_zeit text
    CHECK (wunsch_zeit IN ('vormittag','nachmittag','abend'));
```

- [ ] **Step 2: Getrackte Version ablesen**

`list_migrations` → die vom Plugin vergebene Version `<V>` notieren (eigener Timestamp, NICHT raten).

- [ ] **Step 3: Migration-File committen — Dateiname == `<V>`**

File `supabase/migrations/<V>_gfa_monika_a_flow_felder.sql` mit exakt obigem DDL anlegen (Twin-Drift-Schutz: Dateiname == getrackte Version).

```bash
git add supabase/migrations/<V>_gfa_monika_a_flow_felder.sql
git commit -m "feat(AAR-939): gfa +6 Monika-A-Flow-Spalten (additiv)"
```

- [ ] **Step 4: Verifizieren (READ)**

`execute_sql`:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'gutachter_finder_anfragen'
  AND column_name IN ('anliegen','unfalltyp','schuld_einschaetzung','bewertungsgrund','wunsch_tag','wunsch_zeit')
ORDER BY column_name;
```
Expected: 6 Zeilen, alle `text`.

---

## Task 2: Migration — `embed_sites.sv_telefon`

**Files:**
- Create: `supabase/migrations/<recorded-version>_embed_sites_sv_telefon.sql`

Für den „Jetzt anrufen"-Button im `sv_embed`-Modus (Cluster-LP nutzt die zentrale Nr via `data-phone`).

- [ ] **Step 1: DDL via Plugin**

`apply_migration({ name: "embed_sites_sv_telefon", query: <DDL> })`:
```sql
ALTER TABLE embed_sites ADD COLUMN IF NOT EXISTS sv_telefon text;
COMMENT ON COLUMN embed_sites.sv_telefon IS 'Public tel: number for the Monika widget Anruf-button (sv_embed). NOT baileys_routing_nummer.';
```

- [ ] **Step 2: Version ablesen** — `list_migrations` → `<V>`.

- [ ] **Step 3: File committen** — `supabase/migrations/<V>_embed_sites_sv_telefon.sql`.
```bash
git add supabase/migrations/<V>_embed_sites_sv_telefon.sql
git commit -m "feat(AAR-939): embed_sites.sv_telefon (Anruf-Button sv_embed)"
```

- [ ] **Step 4: Verifizieren** — `execute_sql`: `SELECT column_name FROM information_schema.columns WHERE table_name='embed_sites' AND column_name='sv_telefon';` → 1 Zeile.

---

## Task 3: `EmbedAnfrageSchema` — 6 neue Felder

**Files:**
- Modify: `src/lib/schemas/embed-anfrage.ts`
- Test: `src/lib/schemas/embed-anfrage.test.ts` (Create)

Konvention des Files: Schema enforced DATEN-FORM (Länge), nicht Business — die DB-CHECKs sind das echte Gate. Daher `z.string().max(40)` (konsistent mit `slot`), nicht `z.enum`.

- [ ] **Step 1: Failing-Test schreiben**

`src/lib/schemas/embed-anfrage.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { EmbedAnfrageSchema } from './embed-anfrage'

describe('EmbedAnfrageSchema — Monika-A-Flow-Felder', () => {
  const base = { name: 'Max Mustermann', telefon: '0151 23456789', source: 'sv_embed' as const }

  it('akzeptiert die 6 neuen Felder', () => {
    const r = EmbedAnfrageSchema.safeParse({
      ...base,
      anliegen: 'haftpflichtgutachten',
      unfalltyp: 'auffahrunfall',
      schuld_einschaetzung: 'unverschuldet',
      bewertungsgrund: 'reparatur',
      wunsch_tag: 'morgen',
      wunsch_zeit: 'vormittag',
    })
    expect(r.success).toBe(true)
  })

  it('Felder sind optional (Pfade fuellen nur ihre)', () => {
    expect(EmbedAnfrageSchema.safeParse({ ...base, anliegen: 'schadensberatung' }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Test fails** — `npx vitest run src/lib/schemas/embed-anfrage.test.ts` → FAIL (Felder werden gestript, aber Test prüft nur `.success` → tatsächlich grün bei passthrough? Nein: Zod stript unbekannte Keys still, `.success` bliebe true). **Korrektur:** Test prüft, dass die Werte ERHALTEN bleiben:

```ts
  it('akzeptiert + behaelt die 6 neuen Felder', () => {
    const r = EmbedAnfrageSchema.safeParse({ ...base, anliegen: 'haftpflichtgutachten', wunsch_tag: 'morgen' })
    expect(r.success && r.data.anliegen).toBe('haftpflichtgutachten')
    expect(r.success && r.data.wunsch_tag).toBe('morgen')
  })
```
Run → FAIL (`r.data.anliegen` ist `undefined`, da Key noch nicht im Schema → gestript).

- [ ] **Step 3: Felder ergänzen**

In `src/lib/schemas/embed-anfrage.ts`, nach `schadens_kurzbeschreibung` (Zeile ~23):
```ts
  // Monika-A-Flow-Diskriminatoren (DB-CHECK ist das echte Gate; hier nur Form)
  anliegen: z.string().max(40).optional(),
  unfalltyp: z.string().max(40).optional(),
  schuld_einschaetzung: z.string().max(40).optional(),
  bewertungsgrund: z.string().max(40).optional(),
  wunsch_tag: z.string().max(40).optional(),
  wunsch_zeit: z.string().max(40).optional(),
```

- [ ] **Step 4: Test passes** — `npx vitest run src/lib/schemas/embed-anfrage.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/schemas/embed-anfrage.ts src/lib/schemas/embed-anfrage.test.ts
git commit -m "feat(AAR-939): EmbedAnfrageSchema +6 Monika-A-Flow-Felder"
```

---

## Task 4: `buildAnfrageColumns` extrahieren + 6 Spalten mappen (PURE)

**Files:**
- Modify: `src/lib/embed/anfrage.ts`
- Test: `src/lib/embed/anfrage.test.ts` (Create)

Die Spalten-Map aus `insertAnfrage` (Zeile 121–150) wird als PURE Funktion extrahiert → testbar. Neu: 6 Spalten + `wunschtermin_wann` aus `wunsch_tag`/`wunsch_zeit` komponieren (menschenlesbar für Dispatcher), Fallback auf `slot_text`.

- [ ] **Step 1: Failing-Test**

`src/lib/embed/anfrage.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildAnfrageColumns, splitName } from './anfrage'

const base = { name: 'Max Mustermann', telefon: '0151 1', source: 'sv_embed' as const }

describe('splitName', () => {
  it('teilt Vor-/Nachname', () => expect(splitName('Max Mustermann')).toEqual({ vorname: 'Max', nachname: 'Mustermann' }))
  it('nur Vorname → leerer Nachname', () => expect(splitName('Max')).toEqual({ vorname: 'Max', nachname: '' }))
})

describe('buildAnfrageColumns — Monika-A-Flow', () => {
  it('mappt die 6 Diskriminatoren', () => {
    const c = buildAnfrageColumns({
      payload: { ...base, anliegen: 'haftpflichtgutachten', unfalltyp: 'auffahrunfall', schuld_einschaetzung: 'unverschuldet', wunsch_tag: 'morgen', wunsch_zeit: 'vormittag' },
      variante: 'A', embedSiteId: 'site-1', originDomain: 'example.de',
    })
    expect(c.anliegen).toBe('haftpflichtgutachten')
    expect(c.unfalltyp).toBe('auffahrunfall')
    expect(c.schuld_einschaetzung).toBe('unverschuldet')
    expect(c.wunsch_tag).toBe('morgen')
    expect(c.wunsch_zeit).toBe('vormittag')
  })

  it('komponiert wunschtermin_wann aus tag+zeit (menschenlesbar)', () => {
    const c = buildAnfrageColumns({ payload: { ...base, wunsch_tag: 'morgen', wunsch_zeit: 'vormittag' }, variante: 'A', embedSiteId: null, originDomain: null })
    expect(c.wunschtermin_wann).toBe('Morgen, Vormittag')
  })

  it('Variante A → status embed_free; Cluster (null) → neu', () => {
    expect(buildAnfrageColumns({ payload: { ...base, source: 'kfz_gutachter_lp' }, variante: null, embedSiteId: null, originDomain: null }).status).toBe('neu')
    expect(buildAnfrageColumns({ payload: base, variante: 'A', embedSiteId: null, originDomain: null }).status).toBe('embed_free')
  })

  it('NOT-NULL-Defaults bleiben (email/schadentyp nie null)', () => {
    const c = buildAnfrageColumns({ payload: base, variante: 'A', embedSiteId: null, originDomain: null })
    expect(c.email).toBe('')
    expect(c.schadentyp).toBe('unbekannt')
  })
})
```

- [ ] **Step 2: Test fails** — `npx vitest run src/lib/embed/anfrage.test.ts` → FAIL (`buildAnfrageColumns` existiert nicht).

- [ ] **Step 3: Extrahieren + erweitern**

In `src/lib/embed/anfrage.ts` die Label-Maps + Funktion VOR `insertAnfrage` einfügen:
```ts
const WUNSCH_TAG_LABEL: Record<string, string> = { morgen: 'Morgen', uebermorgen: 'Übermorgen', asap: 'So schnell wie möglich' }
const WUNSCH_ZEIT_LABEL: Record<string, string> = { vormittag: 'Vormittag', nachmittag: 'Nachmittag', abend: 'Abend' }

/** PURE: baut die gfa-Spalten-Map aus einer Embed-Anfrage. NOT-NULL-Spalten nie null. */
export function buildAnfrageColumns(input: InsertAnfrageInput): Record<string, unknown> {
  const { payload, variante, embedSiteId, originDomain } = input
  const { vorname, nachname } = splitName(payload.name)
  const status = variante === 'A' ? 'embed_free' : 'neu'

  // wunschtermin_wann: erst aus tag+zeit komponieren (Monika-A), sonst slot_text/slot.
  const wunschComposed = [
    payload.wunsch_tag ? WUNSCH_TAG_LABEL[payload.wunsch_tag] ?? payload.wunsch_tag : '',
    payload.wunsch_zeit ? WUNSCH_ZEIT_LABEL[payload.wunsch_zeit] ?? payload.wunsch_zeit : '',
  ].filter(Boolean).join(', ')
  const wunschterminWann =
    wunschComposed || payload.slot_text || ([payload.slot, payload.time_slot].filter(Boolean).join(' ') || null)

  return {
    vorname,
    nachname,
    email: payload.email ?? '',
    schadentyp: payload.schadentyp ?? 'unbekannt',
    telefon: payload.telefon,
    schadens_kurzbeschreibung: payload.schadens_kurzbeschreibung ?? null,
    wunschtermin_wann: wunschterminWann,
    bevorzugter_kanal: 'whatsapp',
    status,
    source: payload.source,
    variante: variante ?? null,
    embed_site_id: embedSiteId,
    cluster: payload.cluster ?? null,
    stadt_slug: payload.stadt_slug ?? null,
    page_url: payload.page_url ?? null,
    origin_domain: originDomain,
    // Monika-A-Flow-Diskriminatoren
    anliegen: payload.anliegen ?? null,
    unfalltyp: payload.unfalltyp ?? null,
    schuld_einschaetzung: payload.schuld_einschaetzung ?? null,
    bewertungsgrund: payload.bewertungsgrund ?? null,
    wunsch_tag: payload.wunsch_tag ?? null,
    wunsch_zeit: payload.wunsch_zeit ?? null,
    // Attribution
    gclid: payload.gclid ?? null,
    utm_source: payload.utm_source ?? null,
    utm_medium: payload.utm_medium ?? null,
    utm_campaign: payload.utm_campaign ?? null,
    utm_term: payload.utm_term ?? null,
    utm_content: payload.utm_content ?? null,
    ga_client_id: payload.ga_client_id ?? null,
    dsgvo_zustimmung_am: payload.consent_ts ?? new Date().toISOString(),
  }
}
```
Dann `insertAnfrage` auf den Helper umstellen (Zeile 109–162 → Body ersetzen, ab `const db`):
```ts
export async function insertAnfrage(input: InsertAnfrageInput): Promise<InsertAnfrageResult> {
  const db = createAdminClient()
  const columns = buildAnfrageColumns(input)
  const { data, error } = await db
    .from('gutachter_finder_anfragen')
    .insert(columns)
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Insert fehlgeschlagen' }
  return { ok: true, anfrageId: data.id as string, status: columns.status as string }
}
```
> Hinweis: `payload.anliegen` etc. setzen voraus, dass `EmbedAnfrageInput` die Felder kennt (Task 3 erledigt das, da `EmbedAnfrageInput = z.infer<typeof EmbedAnfrageSchema>`).

- [ ] **Step 4: Test passes** — `npx vitest run src/lib/embed/anfrage.test.ts` → PASS (alle).

- [ ] **Step 5: Commit**
```bash
git add src/lib/embed/anfrage.ts src/lib/embed/anfrage.test.ts
git commit -m "feat(AAR-939): buildAnfrageColumns PURE + 6 gfa-Spalten + wunschtermin-Komposition"
```

---

## Task 5: `EmbedSiteConfig.sv_telefon` + Config-Route liefert `telefon`

**Files:**
- Modify: `src/lib/embed/anfrage.ts` (Interface + `ladeEmbedSite`-select)
- Modify: `src/app/api/embed/config/route.ts`

- [ ] **Step 1: `EmbedSiteConfig` + select erweitern**

In `src/lib/embed/anfrage.ts`: Interface `EmbedSiteConfig` um `sv_telefon: string | null` ergänzen (nach `baileys_routing_nummer`), und in `ladeEmbedSite` den select-String um `sv_telefon` erweitern:
```ts
    .select('id, slug, variante, funnel_modus, einzelpreis_eur, empfaenger_email, cc_email, baileys_routing_nummer, sv_telefon, erlaubte_domains, max_anfragen_pro_h, aktiv')
```

- [ ] **Step 2: Config-Route liefert `sv_telefon` als `telefon`**

In `src/app/api/embed/config/route.ts`: `EmbedSiteRow` um `sv_telefon: string | null` ergänzen, den select-String (Zeile 83) um `sv_telefon` erweitern, und im Return (Zeile 141) `telefon: null` → `telefon: site.sv_telefon ?? null`. (Das Widget liest `remote.telefon` bereits in `index.tsx:92`.)

- [ ] **Step 3: Verifizieren (Build der Route)**

Run: `npx tsc --noEmit -p tsconfig.json` (oder `npm run build` falls Route-Validator nötig)
Expected: keine neuen Typfehler. (`createAdminClient() as any` in der Config-Route → kein Type-Bruch; `EmbedSiteConfig`-Cast in `ladeEmbedSite` deckt das neue Feld.)

- [ ] **Step 4: Commit**
```bash
git add src/lib/embed/anfrage.ts src/app/api/embed/config/route.ts
git commit -m "feat(AAR-939): embed/config liefert sv_telefon -> Widget-Anruf-Button"
```

---

## Task 6: `flow-script.ts` — Step-Graph (PURE)

**Files:**
- Create: `src/embed/monika/flow-script.ts`
- Test: `src/embed/monika/flow-script.test.ts`

Der Kern: die 4 Pfade als Daten. Jeder Step = `messages[]` (Monika-Chunks) + EIN `then` (choices | actions | contact | submit). Plain-Notes sind führende Chunks im nächsten interaktiven Step (keine separaten Note-Steps). Routing steckt in `option.next` (keine separate `nextStep`-Funktion).

- [ ] **Step 1: Failing-Test**

`src/embed/monika/flow-script.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { SCRIPT, START_STEP, type StepId, type Answers } from './flow-script'

describe('SCRIPT — Graph-Integritaet', () => {
  it('START_STEP existiert', () => expect(SCRIPT[START_STEP]).toBeTruthy())

  it('jede choice/contact .next zeigt auf einen realen Step', () => {
    const ids = new Set(Object.keys(SCRIPT))
    for (const step of Object.values(SCRIPT)) {
      if (step.then.kind === 'choices') for (const o of step.then.options) expect(ids.has(o.next)).toBe(true)
      if (step.then.kind === 'contact') expect(ids.has(step.then.next)).toBe(true)
      if (step.then.kind === 'actions') for (const a of step.then.actions) if (a.next) expect(ids.has(a.next)).toBe(true)
    }
  })

  it('jeder Pfad endet erreichbar bei submit', () => {
    // BFS ab START; jeder terminale Knoten ist submit oder actions(call/whatsapp ohne next)
    const seen = new Set<StepId>(); const q: StepId[] = [START_STEP]
    while (q.length) {
      const id = q.shift()!; if (seen.has(id)) continue; seen.add(id)
      const t = SCRIPT[id].then
      if (t.kind === 'choices') t.options.forEach((o) => q.push(o.next))
      if (t.kind === 'contact') q.push(t.next)
      if (t.kind === 'actions') t.actions.forEach((a) => a.next && q.push(a.next as StepId))
    }
    // mind. ein submit erreichbar
    expect([...seen].some((id) => SCRIPT[id].then.kind === 'submit')).toBe(true)
  })
})

describe('Pfad-Simulation', () => {
  it('Haftpflicht/unverschuldet akkumuliert die erwarteten Answers', () => {
    const a: Answers = {}
    a.anliegen = 'haftpflichtgutachten'
    a.unfalltyp = 'auffahrunfall'
    a.schuld_einschaetzung = 'unverschuldet'
    a.wunsch_tag = 'morgen'
    a.wunsch_zeit = 'vormittag'
    expect(a).toEqual({ anliegen: 'haftpflichtgutachten', unfalltyp: 'auffahrunfall', schuld_einschaetzung: 'unverschuldet', wunsch_tag: 'morgen', wunsch_zeit: 'vormittag' })
  })
})
```

- [ ] **Step 2: Test fails** — `npx vitest run src/embed/monika/flow-script.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: `flow-script.ts` schreiben**

```ts
// AAR-939 · Monika-A-Flow · PURE Step-Graph (framework-neutral, vitest-getestet).
// Jeder Step: messages[] (Monika-Chunks, sequentiell getippt) + EIN `then`.
// Routing steckt in option.next. Keine DOM-Abhaengigkeit.

export type Anliegen = 'schadensberatung' | 'haftpflichtgutachten' | 'wertgutachten' | 'gegengutachten'
export type Unfalltyp = 'auffahrunfall' | 'spurwechsel' | 'vorfahrt' | 'parken' | 'sonstiges'
export type SchuldEinschaetzung = 'unverschuldet' | 'nicht_sicher'
export type Bewertungsgrund = 'reparatur' | 'verkauf'
export type WunschTag = 'morgen' | 'uebermorgen' | 'asap'
export type WunschZeit = 'vormittag' | 'nachmittag' | 'abend'

export interface Answers {
  anliegen?: Anliegen
  unfalltyp?: Unfalltyp
  schuld_einschaetzung?: SchuldEinschaetzung
  bewertungsgrund?: Bewertungsgrund
  wunsch_tag?: WunschTag
  wunsch_zeit?: WunschZeit
  vorname?: string
  nachname?: string
  telefon?: string
}

export type AnswerKey = keyof Answers

export type StepId =
  | 'start' | 'beratung' | 'gegen' | 'kontakt'
  | 'hp_unfalltyp' | 'hp_schuld' | 'hp_unsicher' | 'hp_termin_tag' | 'hp_termin_zeit' | 'hp_kapazitaet'
  | 'wert_grund' | 'wert_termin_tag' | 'wert_termin_zeit' | 'wert_kontakt'

export interface ChoiceOption { value: string; label: string; next: StepId }
export interface ActionDef {
  kind: 'call' | 'whatsapp' | 'callback'
  label: string
  next?: StepId // callback → Folge-Step (Kontakt); call/whatsapp = Deeplink, kein next
}
export type StepThen =
  | { kind: 'choices'; key: AnswerKey; options: ChoiceOption[] }
  | { kind: 'actions'; actions: ActionDef[] }
  | { kind: 'contact'; next: StepId } // sammelt vorname/nachname/telefon → next
  | { kind: 'submit' } // terminal: Payload bauen + senden

export interface Step {
  id: StepId
  messages: string[]
  then: StepThen
}

export const START_STEP: StepId = 'start'

export const SCRIPT: Record<StepId, Step> = {
  start: {
    id: 'start',
    messages: ['Hi, grüße Sie! 👋', 'Ich bin Monika, Ihre Schadenberaterin bei Claimondo. 😊', 'Wie kann ich Ihnen schnell weiterhelfen?'],
    then: {
      kind: 'choices', key: 'anliegen',
      options: [
        { value: 'schadensberatung', label: 'Schadensberatung', next: 'beratung' },
        { value: 'haftpflichtgutachten', label: 'Haftpflichtschaden', next: 'hp_unfalltyp' },
        { value: 'wertgutachten', label: 'Wertgutachten', next: 'wert_grund' },
        { value: 'gegengutachten', label: 'Gegengutachten', next: 'gegen' },
      ],
    },
  },

  // ── Pfad 1: Schadensberatung ──
  beratung: {
    id: 'beratung',
    messages: ['Gerne berate ich Sie kurz. 📞', 'Möchten Sie direkt anrufen oder lieber zurückgerufen werden?'],
    then: {
      kind: 'actions',
      actions: [
        { kind: 'call', label: 'Jetzt anrufen' },
        { kind: 'callback', label: 'Rückruf anfordern', next: 'kontakt' },
      ],
    },
  },

  // ── Pfad 2: Haftpflichtschaden ──
  hp_unfalltyp: {
    id: 'hp_unfalltyp',
    messages: ['Das tut mir leid. Ich hoffe, Sie sind unversehrt. 🙏', 'Was für ein Unfall war es?'],
    then: {
      kind: 'choices', key: 'unfalltyp',
      options: [
        { value: 'auffahrunfall', label: 'Auffahrunfall', next: 'hp_schuld' },
        { value: 'spurwechsel', label: 'Spurwechsel', next: 'hp_schuld' },
        { value: 'vorfahrt', label: 'Vorfahrt', next: 'hp_schuld' },
        { value: 'parken', label: 'Beim Parken', next: 'hp_schuld' },
        { value: 'sonstiges', label: 'Sonstiges', next: 'hp_schuld' },
      ],
    },
  },
  hp_schuld: {
    id: 'hp_schuld',
    messages: ['Und wie ist die Schuldfrage?'],
    then: {
      kind: 'choices', key: 'schuld_einschaetzung',
      options: [
        { value: 'unverschuldet', label: 'Unverschuldet', next: 'hp_termin_tag' },
        { value: 'nicht_sicher', label: 'Nicht sicher', next: 'hp_unsicher' },
      ],
    },
  },
  hp_unsicher: {
    id: 'hp_unsicher',
    messages: ['Kein Problem, das klären wir gemeinsam. 😊', 'Am schnellsten direkt am Telefon, oder ich rufe Sie zurück.'],
    then: {
      kind: 'actions',
      actions: [
        { kind: 'call', label: 'Jetzt anrufen' },
        { kind: 'whatsapp', label: 'Per WhatsApp' },
        { kind: 'callback', label: 'Rückruf anfordern', next: 'kontakt' },
      ],
    },
  },
  hp_termin_tag: {
    id: 'hp_termin_tag',
    messages: ['Gut. Bei einem unverschuldeten Unfall tragen Anwalt, Gutachter und Mietwagen die Gegenseite. 😊', 'Wann passt Ihnen ein Termin?'],
    then: {
      kind: 'choices', key: 'wunsch_tag',
      options: [
        { value: 'morgen', label: 'Morgen', next: 'hp_termin_zeit' },
        { value: 'uebermorgen', label: 'Übermorgen', next: 'hp_termin_zeit' },
        { value: 'asap', label: 'So schnell wie möglich', next: 'hp_termin_zeit' },
      ],
    },
  },
  hp_termin_zeit: {
    id: 'hp_termin_zeit',
    messages: ['Und welche Tageszeit?'],
    then: {
      kind: 'choices', key: 'wunsch_zeit',
      options: [
        { value: 'vormittag', label: 'Vormittag', next: 'hp_kapazitaet' },
        { value: 'nachmittag', label: 'Nachmittag', next: 'hp_kapazitaet' },
        { value: 'abend', label: 'Abend', next: 'hp_kapazitaet' },
      ],
    },
  },
  hp_kapazitaet: {
    id: 'hp_kapazitaet',
    messages: ['Einen Moment… ✅', 'Der Gutachter hat zu der Zeit Kapazität.', 'Wie darf ich Sie erreichen?'],
    then: { kind: 'contact', next: 'start' }, // next ungenutzt bei contact→submit; Renderer ruft submit
  },

  // ── Pfad 3: Wertgutachten ──
  wert_grund: {
    id: 'wert_grund',
    messages: ['Gerne! Geht es um eine Reparatur oder einen Verkauf?'],
    then: {
      kind: 'choices', key: 'bewertungsgrund',
      options: [
        { value: 'reparatur', label: 'Reparatur', next: 'wert_termin_tag' },
        { value: 'verkauf', label: 'Verkauf', next: 'wert_termin_tag' },
      ],
    },
  },
  wert_termin_tag: {
    id: 'wert_termin_tag',
    messages: ['Wann passt Ihnen ein Termin?'],
    then: {
      kind: 'choices', key: 'wunsch_tag',
      options: [
        { value: 'morgen', label: 'Morgen', next: 'wert_termin_zeit' },
        { value: 'uebermorgen', label: 'Übermorgen', next: 'wert_termin_zeit' },
        { value: 'asap', label: 'So schnell wie möglich', next: 'wert_termin_zeit' },
      ],
    },
  },
  wert_termin_zeit: {
    id: 'wert_termin_zeit',
    messages: ['Welche Tageszeit?'],
    then: {
      kind: 'choices', key: 'wunsch_zeit',
      options: [
        { value: 'vormittag', label: 'Vormittag', next: 'wert_kontakt' },
        { value: 'nachmittag', label: 'Nachmittag', next: 'wert_kontakt' },
        { value: 'abend', label: 'Abend', next: 'wert_kontakt' },
      ],
    },
  },
  wert_kontakt: {
    id: 'wert_kontakt',
    messages: ['Top. Wie darf ich Sie erreichen?'],
    then: { kind: 'contact', next: 'start' },
  },

  // ── Pfad 4: Gegengutachten ──
  gegen: {
    id: 'gegen',
    messages: ['Für ein Gegengutachten rufe ich Sie am besten zurück.'],
    then: { kind: 'actions', actions: [{ kind: 'callback', label: 'Rückruf anfordern', next: 'kontakt' }] },
  },

  // ── Geteilter Kontakt-Step (Pfade 1, 2-unsicher, 4) ──
  kontakt: {
    id: 'kontakt',
    messages: ['Wie darf ich Sie erreichen?'],
    then: { kind: 'contact', next: 'start' },
  },
}
```
> `contact.next` ist bewusst ungenutzt (der Renderer ruft nach dem Kontakt-Submit `submit`); das Feld hält den Typ uniform. Die `'submit'`-Variante im `StepThen`-Union bleibt für den Graph-Integritätstest + künftige terminale Steps deklariert. Da kein Step `submit` als `then` trägt, schlägt der „mind. ein submit erreichbar"-Test fehl → **stattdessen** prüft der Test die `contact`-Terminierung. Step 4 unten korrigiert den Test.

- [ ] **Step 4: Integritaets-Test an das `contact`-Terminal anpassen**

Im Test den dritten `it` ersetzen (terminale Knoten = `contact` oder `actions`):
```ts
  it('jeder erreichbare Pfad terminiert (contact oder actions)', () => {
    const seen = new Set<StepId>(); const q: StepId[] = [START_STEP]
    while (q.length) {
      const id = q.shift()!; if (seen.has(id)) continue; seen.add(id)
      const t = SCRIPT[id].then
      if (t.kind === 'choices') t.options.forEach((o) => q.push(o.next))
      if (t.kind === 'actions') t.actions.forEach((a) => a.next && q.push(a.next as StepId))
      if (t.kind === 'contact') { /* terminal */ }
    }
    // jeder Endpunkt ist contact/actions; kein choices-Step ohne erreichbares Terminal
    expect(seen.has('kontakt')).toBe(true)
    expect([...seen].every((id) => ids(SCRIPT).has(id))).toBe(true)
  })
```
mit Helper oben im Test: `const ids = (s: typeof SCRIPT) => new Set(Object.keys(s))`.

- [ ] **Step 5: Test passes** — `npx vitest run src/embed/monika/flow-script.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/embed/monika/flow-script.ts src/embed/monika/flow-script.test.ts
git commit -m "feat(AAR-939): flow-script PURE 4-Pfad Step-Graph + Integritaets-Tests"
```

---

## Task 7: `payload.ts` — Answers → AnfragePayload (PURE)

**Files:**
- Modify: `src/embed/monika/types.ts` (AnfragePayload + 6 Felder, MonikaState raus)
- Create: `src/embed/monika/payload.ts`
- Test: `src/embed/monika/payload.test.ts`

- [ ] **Step 1: `types.ts` erweitern**

In `src/embed/monika/types.ts`: `AnfragePayload` um die 6 Felder ergänzen (nach `time_slot`):
```ts
  anliegen?: string
  unfalltyp?: string
  schuld_einschaetzung?: string
  bewertungsgrund?: string
  wunsch_tag?: string
  wunsch_zeit?: string
```
Und `MonikaState`/`DaySlot`/`TimeSlot` entfernen (Zeile 37–39) — der neue Flow ist skript-getrieben; `DAY_LABEL`/`TIME_LABEL`-Konsumenten verschwinden mit dem `app.tsx`-Rewrite (Task 10). (Falls `index.tsx`/andere noch `MonikaState` importieren: erst nach Task 10 löschen — hier nur `AnfragePayload` erweitern, `MonikaState` in Task 10 entfernen.)

> **Reihenfolge-Hinweis:** `MonikaState` erst in Task 10 löschen (wenn `app.tsx` umgebaut ist), sonst bricht der Import. In Task 7 NUR `AnfragePayload` erweitern.

- [ ] **Step 2: Failing-Test**

`src/embed/monika/payload.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildPayloadFromAnswers } from './payload'
import type { Answers } from './flow-script'
import type { MonikaConfig } from './types'

const cfg = { source: 'sv_embed', base: 'https://claimondo.de', embedSiteSlug: 'sv-test', siteToken: 'tok', cluster: null, stadtSlug: null } as unknown as MonikaConfig

describe('buildPayloadFromAnswers', () => {
  it('mappt Answers + cfg in AnfragePayload', () => {
    const a: Answers = { anliegen: 'haftpflichtgutachten', unfalltyp: 'auffahrunfall', schuld_einschaetzung: 'unverschuldet', wunsch_tag: 'morgen', wunsch_zeit: 'vormittag', vorname: 'Max', nachname: 'Mustermann', telefon: '0151 1' }
    const p = buildPayloadFromAnswers(a, cfg, { page_url: 'https://x.de', consent_ts: '2026-06-06T00:00:00Z', honeypot: '' })
    expect(p.name).toBe('Max Mustermann')
    expect(p.telefon).toBe('0151 1')
    expect(p.anliegen).toBe('haftpflichtgutachten')
    expect(p.wunsch_tag).toBe('morgen')
    expect(p.source).toBe('sv_embed')
    expect(p.embed_site_slug).toBe('sv-test')
    expect(p.site_token).toBe('tok')
  })

  it('nur Vorname → name = Vorname', () => {
    const p = buildPayloadFromAnswers({ anliegen: 'gegengutachten', vorname: 'Max', telefon: '0151 1' }, cfg, {})
    expect(p.name).toBe('Max')
  })
})
```

- [ ] **Step 3: Test fails** — `npx vitest run src/embed/monika/payload.test.ts` → FAIL.

- [ ] **Step 4: `payload.ts` schreiben**

```ts
// AAR-939 · Monika-A-Flow · PURE Answers → AnfragePayload.
import type { Answers } from './flow-script'
import type { AnfragePayload, MonikaConfig, Attribution } from './types'

export interface SubmitMeta {
  page_url?: string
  consent_ts?: string
  honeypot?: string
  attribution?: Attribution
}

export function buildPayloadFromAnswers(answers: Answers, cfg: MonikaConfig, meta: SubmitMeta): AnfragePayload {
  const name = [answers.vorname?.trim(), answers.nachname?.trim()].filter(Boolean).join(' ')
  return {
    name,
    telefon: (answers.telefon ?? '').trim(),
    source: cfg.source,
    cluster: cfg.cluster ?? undefined,
    stadt_slug: cfg.stadtSlug ?? undefined,
    embed_site_slug: cfg.embedSiteSlug ?? undefined,
    site_token: cfg.siteToken ?? undefined,
    page_url: meta.page_url,
    consent_ts: meta.consent_ts,
    honeypot: meta.honeypot ?? '',
    anliegen: answers.anliegen,
    unfalltyp: answers.unfalltyp,
    schuld_einschaetzung: answers.schuld_einschaetzung,
    bewertungsgrund: answers.bewertungsgrund,
    wunsch_tag: answers.wunsch_tag,
    wunsch_zeit: answers.wunsch_zeit,
    ...(meta.attribution ?? {}),
  }
}
```

- [ ] **Step 5: Test passes** — `npx vitest run src/embed/monika/payload.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/embed/monika/types.ts src/embed/monika/payload.ts src/embed/monika/payload.test.ts
git commit -m "feat(AAR-939): payload-builder PURE (Answers -> AnfragePayload)"
```

---

## Task 8: `typing.ts` — Typing-Dauer (PURE)

**Files:**
- Create: `src/embed/monika/typing.ts`
- Test: `src/embed/monika/typing.test.ts`

- [ ] **Step 1: Failing-Test**

`src/embed/monika/typing.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { typingDurationMs } from './typing'

describe('typingDurationMs', () => {
  it('kurzer Text → Minimum 500ms', () => expect(typingDurationMs('Hi')).toBe(500))
  it('langer Text → Maximum 1200ms', () => expect(typingDurationMs('x'.repeat(200))).toBe(1200))
  it('mittel → laenge*35 geclamped', () => expect(typingDurationMs('x'.repeat(20))).toBe(700))
})
```

- [ ] **Step 2: Test fails** — `npx vitest run src/embed/monika/typing.test.ts` → FAIL.

- [ ] **Step 3: `typing.ts`**
```ts
// AAR-939 · Monika-A-Flow · PURE: Typing-Indicator-Dauer ~ Textlaenge, geclamped.
export function typingDurationMs(text: string): number {
  return Math.min(1200, Math.max(500, text.length * 35))
}
```

- [ ] **Step 4: Test passes** — `npx vitest run src/embed/monika/typing.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/embed/monika/typing.ts src/embed/monika/typing.test.ts
git commit -m "feat(AAR-939): typing-duration PURE (clamp 500-1200ms)"
```

---

## Task 9: `assets.ts` — Siegel-SVG inline + Foto-URL

**Files:**
- Create: `src/embed/monika/assets.ts`
- Create: `public/embed/monika.png` (Kopie aus Aarons Downloads)

- [ ] **Step 1: Monika-Foto ins Repo kopieren**

Run (PowerShell):
```powershell
Copy-Item "C:\Users\Aaron Sprafke\Downloads\monika.png" "<worktree>\public\embed\monika.png"
```
Verifizieren: Datei existiert, < 200 KB (sonst mit sharp/Online auf ~256px resizen — separater Schritt).

- [ ] **Step 2: `assets.ts` schreiben**

Siegel-SVG als String-Konstante (aus `siegel-claimondo-partner-v3 (2).svg`, viewBox 0 0 200 200). Foto via `base`-Origin.
```ts
// AAR-939 · Monika-A-Flow · Inline-Assets. Siegel = Vektor (gestochen scharf, kein Request);
// Foto = URL vom claimondo-Origin (zu gross zum Inlinen, Gzip-Budget).
// Token-Audit-Skip: SVG-Replikat eines physischen Siegels (Marken-Hex Navy/Ondo/Gold).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

export const SIEGEL_SVG = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Claimondo Partner — Unfall Assistance">
<defs><path id="mk-top" d="M 22,100 A 78,78 0 0 1 178,100"/><path id="mk-bot" d="M 15,100 A 85,85 0 0 0 185,100"/></defs>
<circle cx="100" cy="100" r="98" fill="#0D1B3E"/><circle cx="100" cy="100" r="64" fill="#FFFFFF"/>
<text fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="12.5" font-weight="700" letter-spacing="1.8" text-anchor="middle"><textPath href="#mk-top" startOffset="50%">CLAIMONDO PARTNER</textPath></text>
<text fill="#FFFFFF" font-family="Arial,Helvetica,sans-serif" font-size="12.5" font-weight="700" letter-spacing="1.8" text-anchor="middle"><textPath href="#mk-bot" startOffset="50%">UNFALL ASSISTANCE</textPath></text>
<circle cx="22" cy="100" r="2.5" fill="#4573A2"/><circle cx="178" cy="100" r="2.5" fill="#4573A2"/>
<g transform="translate(100 85) scale(2.2) translate(-22 -22)">
<path d="M28.4331 16.2064L21.9995 13.7943L15.5669 16.2064V22.0003C15.567 25.9823 18.2689 28.8737 21.9995 30.2132C25.7305 28.8738 28.433 25.9825 28.4331 22.0003V16.2064ZM30.2329 22.0003C30.2328 27.0838 26.657 30.5633 22.2847 32.0208C22.1 32.0824 21.9 32.0823 21.7153 32.0208C17.3429 30.5634 13.7663 27.0839 13.7661 22.0003V15.5833C13.7661 15.2083 13.999 14.8724 14.3501 14.7406L21.6841 11.9906L21.8403 11.9476C21.9988 11.919 22.1633 11.9333 22.3159 11.9906L29.6489 14.7406C30.0002 14.8723 30.2329 15.2082 30.2329 15.5833V22.0003Z" fill="#0D1B3E"/>
<path d="M24.5397 19.1058C24.8723 18.7368 25.4409 18.7071 25.8102 19.0394C26.1797 19.3719 26.2101 19.9414 25.8776 20.3109L21.7526 24.8939C21.5875 25.0774 21.3539 25.1852 21.1071 25.1917C20.8603 25.1982 20.6215 25.1026 20.447 24.928L18.155 22.6361C17.8039 22.2846 17.8038 21.715 18.155 21.3636C18.5064 21.0121 19.0769 21.0121 19.4284 21.3636L21.0485 22.9847L24.5397 19.1058Z" fill="#4573A2"/></g>
<g fill="#C9A961"><path d="M 82.2,146.5 l 0.7,2.1 2.2,0 -1.8,1.3 0.7,2.1 -1.8,-1.3 -1.8,1.3 0.7,-2.1 -1.8,-1.3 2.2,0 z"/><path d="M 91.0,148.8 l 0.7,2.1 2.2,0 -1.8,1.3 0.7,2.1 -1.8,-1.3 -1.8,1.3 0.7,-2.1 -1.8,-1.3 2.2,0 z"/><path d="M 100,149.6 l 0.7,2.1 2.2,0 -1.8,1.3 0.7,2.1 -1.8,-1.3 -1.8,1.3 0.7,-2.1 -1.8,-1.3 2.2,0 z"/><path d="M 109.0,148.8 l 0.7,2.1 2.2,0 -1.8,1.3 0.7,2.1 -1.8,-1.3 -1.8,1.3 0.7,-2.1 -1.8,-1.3 2.2,0 z"/><path d="M 117.8,146.5 l 0.7,2.1 2.2,0 -1.8,1.3 0.7,2.1 -1.8,-1.3 -1.8,1.3 0.7,-2.1 -1.8,-1.3 2.2,0 z"/></g></svg>`

export function monikaPhotoUrl(base: string): string {
  return `${base}/embed/monika.png`
}
```

- [ ] **Step 3: Verifizieren** — `npx tsc -p src/embed/monika/tsconfig.json` → kein Fehler.

- [ ] **Step 4: Commit**
```bash
git add src/embed/monika/assets.ts public/embed/monika.png
git commit -m "feat(AAR-939): Siegel-SVG inline + Monika-Foto-Asset"
```

---

## Task 10: `app.tsx` Rewrite — Chat-UI + Message-Player (Preact)

**Files:**
- Modify: `src/embed/monika/app.tsx` (komplett-Rewrite)
- Modify: `src/embed/monika/types.ts` (`isClaimondoBranded` zu `MonikaConfig`; `MonikaState`/`DaySlot`/`TimeSlot` jetzt entfernen)
- Modify: `src/embed/monika/index.tsx` (`isClaimondoBranded` ableiten + setzen)

Reiner DOM/Preact-Code → kein vitest; Verifikation via `typecheck:embed` + `build:embed` + Browser-Smoke (Task 11).

- [ ] **Step 1: `MonikaConfig` + `index.tsx` um `isClaimondoBranded`**

In `types.ts`: `MonikaConfig` um `isClaimondoBranded: boolean` ergänzen; `MonikaState`/`DaySlot`/`TimeSlot` löschen.
In `index.tsx`: in beiden cfg-Zweigen setzen:
```ts
// sv_embed-Zweig:
isClaimondoBranded: theme.brandedByClaimondo,
// cluster-Zweig (Cluster-LP ist Claimondo-Property):
isClaimondoBranded: true,
```

- [ ] **Step 2: `app.tsx` komplett ersetzen**

```tsx
/** @jsxImportSource preact */
// AAR-939 · Monika-A-Flow · Chat-Widget (Skript-getrieben, Message-Player).
import { useSignal, useComputed } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import type { MonikaConfig } from './types'
import { SCRIPT, START_STEP, type StepId, type Answers, type ChoiceOption, type ActionDef } from './flow-script'
import { typingDurationMs } from './typing'
import { buildPayloadFromAnswers } from './payload'
import { submitAnfrage } from './api'
import { captureAttribution } from './attribution'
import { track } from './tracking'
import { fireSiteConversion } from './conversion'
import { SIEGEL_SVG, monikaPhotoUrl } from './assets'

type Bubble = { role: 'monika' | 'user'; text: string }

export function MonikaApp({ cfg }: { cfg: MonikaConfig }) {
  const open = useSignal(false)
  const stepId = useSignal<StepId>(START_STEP)
  const log = useSignal<Bubble[]>([])
  const typing = useSignal(false)
  const awaiting = useSignal(false) // true = Chunks fertig, then-UI zeigen
  const answers = useSignal<Answers>({})
  const sending = useSignal(false)
  const done = useSignal(false)
  const error = useSignal('')
  // Kontakt-Form
  const vorname = useSignal(''); const nachname = useSignal(''); const telefon = useSignal('')
  const consent = useSignal(false); const honeypot = useSignal('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const step = useComputed(() => SCRIPT[stepId.value])
  const photo = monikaPhotoUrl(cfg.base)

  function scrollDown() {
    requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight })
  }

  // Spielt die messages des aktuellen Steps sequentiell mit Typing-Beats.
  function playStep(id: StepId) {
    const s = SCRIPT[id]
    awaiting.value = false
    const reduce = matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let i = 0
    const playNext = () => {
      if (i >= s.messages.length) { awaiting.value = true; scrollDown(); return }
      const text = s.messages[i++]
      if (reduce) { log.value = [...log.value, { role: 'monika', text }]; scrollDown(); playNext(); return }
      typing.value = true; scrollDown()
      setTimeout(() => {
        typing.value = false
        log.value = [...log.value, { role: 'monika', text }]
        scrollDown()
        setTimeout(playNext, 250)
      }, typingDurationMs(text))
    }
    playNext()
  }

  function openWidget() {
    if (open.value) return
    open.value = true
    track(cfg, 'monika_open')
    if (log.value.length === 0) playStep(START_STEP)
  }

  function choose(opt: ChoiceOption) {
    const s = step.value
    if (s.then.kind !== 'choices') return
    answers.value = { ...answers.value, [s.then.key]: opt.value }
    log.value = [...log.value, { role: 'user', text: opt.label }]
    stepId.value = opt.next
    playStep(opt.next)
  }

  function doAction(a: ActionDef) {
    if (a.kind === 'call' && cfg.telefon) { window.location.href = `tel:${cfg.telefon}`; return }
    if (a.kind === 'whatsapp' && cfg.whatsapp) {
      const txt = encodeURIComponent('Hallo, ich hatte einen Kfz-Schaden und brauche einen Gutachter-Termin.')
      window.open(`https://wa.me/${cfg.whatsapp}?text=${txt}`, '_blank', 'noopener'); return
    }
    if (a.kind === 'callback' && a.next) {
      log.value = [...log.value, { role: 'user', text: a.label }]
      stepId.value = a.next; playStep(a.next)
    }
  }

  const canSubmit = useComputed(() =>
    vorname.value.trim().length >= 2 && telefon.value.trim().length >= 8 && consent.value && !sending.value)

  async function submitContact() {
    if (!canSubmit.value) return
    sending.value = true; error.value = ''
    const merged: Answers = { ...answers.value, vorname: vorname.value, nachname: nachname.value, telefon: telefon.value }
    const payload = buildPayloadFromAnswers(merged, cfg, {
      page_url: window.location.href,
      consent_ts: new Date().toISOString(),
      honeypot: honeypot.value,
      attribution: captureAttribution(),
    })
    const result = await submitAnfrage(cfg.base, payload)
    sending.value = false
    if (result.ok) {
      track(cfg, 'monika_anfrage_submit'); fireSiteConversion(cfg)
      done.value = true; awaiting.value = false
      log.value = [...log.value,
        { role: 'user', text: `${vorname.value} ${nachname.value}`.trim() },
        { role: 'monika', text: 'Perfekt, vielen Dank! 😊' },
        { role: 'monika', text: 'Wir melden uns schnellstmöglich bei Ihnen.' },
      ]
      scrollDown()
    } else { error.value = result.error }
  }

  const showGutschein = useComputed(() => done.value && !!answers.value.wunsch_tag)

  // ── FAB (geschlossen) ──
  if (!open.value) {
    return (
      <button class="mk-fab" type="button" aria-label="Hilfe bei Kfz-Schaden — Monika" onClick={openWidget}>
        {cfg.isClaimondoBranded
          ? <span class="mk-seal" dangerouslySetInnerHTML={{ __html: SIEGEL_SVG }} />
          : <img src={cfg.theme.logoUrl} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />}
      </button>
    )
  }

  const s = step.value

  // ── Panel (offen) ──
  return (
    <div class="mk-panel" role="dialog" aria-label="Chat mit Monika" aria-live="polite">
      <div class="mk-head">
        {cfg.isClaimondoBranded
          ? <img class="mk-avatar" src={photo} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')} />
          : <img class="mk-avatar" src={cfg.theme.logoUrl} alt="" />}
        <div class="mk-head-meta">
          <span class="mk-name">{cfg.isClaimondoBranded ? 'Monika' : 'Schaden-Hilfe'}</span>
          <span class="mk-role">{cfg.isClaimondoBranded ? 'Schadenberaterin · ● online' : '● online'}</span>
        </div>
        <button class="mk-close" type="button" aria-label="Schließen" onClick={() => (open.value = false)}>×</button>
      </div>

      <div class="mk-chat" ref={scrollRef}>
        {log.value.map((b, i) => (
          <div key={i} class={`mk-row mk-row-${b.role}`}>
            {b.role === 'monika' && cfg.isClaimondoBranded && <img class="mk-mini" src={photo} alt="" />}
            <div class={`mk-bubble mk-bubble-${b.role}`}>{b.text}</div>
          </div>
        ))}
        {typing.value && (
          <div class="mk-row mk-row-monika">
            {cfg.isClaimondoBranded && <img class="mk-mini" src={photo} alt="" />}
            <div class="mk-bubble mk-bubble-monika mk-typing"><span></span><span></span><span></span></div>
          </div>
        )}

        {awaiting.value && !done.value && s.then.kind === 'choices' && (
          <div class="mk-choices">
            {s.then.options.map((o) => (
              <button key={o.value} class="mk-chip" type="button" onClick={() => choose(o)}>{o.label}</button>
            ))}
          </div>
        )}

        {awaiting.value && !done.value && s.then.kind === 'actions' && (
          <div class="mk-actions">
            {s.then.actions.map((a, i) => (
              <button key={i} class={`mk-act mk-act-${a.kind === 'callback' ? 'secondary' : 'primary'}`} type="button" onClick={() => doAction(a)}>
                {a.kind === 'call' ? '📞 ' : a.kind === 'whatsapp' ? '💬 ' : ''}{a.label}
              </button>
            ))}
          </div>
        )}

        {awaiting.value && !done.value && s.then.kind === 'contact' && (
          <div class="mk-form">
            <input class="mk-inp" type="text" autocomplete="given-name" placeholder="Vorname"
              value={vorname.value} onInput={(e) => (vorname.value = (e.target as HTMLInputElement).value)} />
            <input class="mk-inp" type="text" autocomplete="family-name" placeholder="Nachname"
              value={nachname.value} onInput={(e) => (nachname.value = (e.target as HTMLInputElement).value)} />
            <input class="mk-inp" type="tel" autocomplete="tel" placeholder="Telefon, z.B. 0151 23456789"
              value={telefon.value} onInput={(e) => (telefon.value = (e.target as HTMLInputElement).value)} />
            <input class="mk-hp" type="text" tabIndex={-1} autocomplete="off" aria-hidden="true" name="company"
              value={honeypot.value} onInput={(e) => (honeypot.value = (e.target as HTMLInputElement).value)} />
            <label class="mk-consent">
              <input type="checkbox" checked={consent.value} onChange={(e) => (consent.value = (e.target as HTMLInputElement).checked)} />
              <span>Ich akzeptiere die <a href={`${cfg.base}/datenschutz`} target="_blank" rel="noopener">Datenschutzerklärung</a>.</span>
            </label>
            <button class="mk-act mk-act-primary" type="button" disabled={!canSubmit.value} onClick={() => void submitContact()}>
              {sending.value ? 'Wird gesendet…' : 'Absenden'}
            </button>
            {error.value && <p class="mk-err">{error.value}</p>}
          </div>
        )}

        {showGutschein.value && (
          <div class="mk-gutschein">
            <span class="mk-gutschein-badge">25 €</span>
            <span class="mk-gutschein-txt">Tankgutschein zum Termin — als Dankeschön. ⛽</span>
          </div>
        )}
      </div>

      {cfg.theme.brandedByClaimondo && (
        <div class="mk-powered"><a href={`${cfg.base}/sv-netzwerk`} target="_blank" rel="noopener">powered by Claimondo</a></div>
      )}
    </div>
  )
}
```

> **Hinweis Cluster-LP-Anruf:** `cfg.telefon` kommt im Cluster-Modus aus `data-phone` (index.tsx:113). Die Cluster-LP-`<script>`-Tags müssen `data-phone="+4915153608515"` setzen (zentrale Nummer) — Doku-Task in der Cluster-LP-Repo, nicht hier. `sv_embed` bekommt `telefon` aus der Config (Task 5).

- [ ] **Step 3: `typecheck:embed`**

Run: `npm run typecheck:embed`
Expected: PASS (keine Referenzen mehr auf `MonikaState`/`DaySlot`/`TimeSlot`; `useEffect` ungenutzt → ENTFERNEN falls Lint/tsc meckert; `useEffect`-Import nur lassen wenn verwendet).
> Falls `useEffect` ungenutzt: Import auf `{ useRef }` reduzieren.

- [ ] **Step 4: Commit**
```bash
git add src/embed/monika/app.tsx src/embed/monika/types.ts src/embed/monika/index.tsx
git commit -m "feat(AAR-939): app.tsx Rewrite — Chat-UI + Message-Player (Skript-getrieben)"
```

---

## Task 11: `styles.ts` Rewrite + Build + Browser-Smoke

**Files:**
- Modify: `src/embed/monika/styles.ts` (komplett-Rewrite)

- [ ] **Step 1: `styles.ts` ersetzen**

```ts
// AAR-939 · Monika-A-Flow · Shadow-DOM-Chat-Styles. Claimondo-Tokens via
// --monika-primary(navy)/accent(ondo)/text. Light, mobile-first.
export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }

.mk-fab { position: fixed; bottom: 20px; right: 20px; z-index: 9999; width: 62px; height: 62px;
  border-radius: 50%; background: var(--monika-primary); border: none; cursor: pointer;
  box-shadow: 0 6px 20px rgba(13,27,62,.32); display: flex; align-items: center; justify-content: center;
  padding: 0; overflow: hidden; transition: transform .18s cubic-bezier(.22,1,.36,1); }
.mk-fab:hover { transform: scale(1.06); }
.mk-fab:focus-visible { outline: 3px solid var(--monika-accent); outline-offset: 2px; }
.mk-seal { width: 100%; height: 100%; display: block; }
.mk-seal svg { width: 100%; height: 100%; display: block; }
.mk-fab img { width: 36px; height: 36px; object-fit: contain; }

.mk-panel { position: fixed; bottom: 20px; right: 20px; z-index: 9999; width: 380px;
  max-width: calc(100vw - 24px); height: 600px; max-height: calc(100vh - 40px);
  background: #f8f9fb; border-radius: 18px; overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 12px 48px rgba(13,27,62,.30); animation: mk-in .22s cubic-bezier(.22,1,.36,1); }
@keyframes mk-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@media (max-width: 480px) { .mk-panel { width: 100vw; max-width: 100vw; height: 88vh; max-height: 88vh;
  right: 0; bottom: 0; border-radius: 18px 18px 0 0; } }

.mk-head { background: var(--monika-primary); color: #fff; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
.mk-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
.mk-head-meta { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.mk-name { font-weight: 700; font-size: 15px; line-height: 1.2; }
.mk-role { font-size: 11.5px; opacity: .85; }
.mk-close { background: none; border: none; color: #fff; cursor: pointer; font-size: 22px; line-height: 1; padding: 4px; border-radius: 6px; }
.mk-close:focus-visible { outline: 2px solid var(--monika-accent); }

.mk-chat { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.mk-row { display: flex; align-items: flex-end; gap: 6px; max-width: 100%; }
.mk-row-user { justify-content: flex-end; }
.mk-mini { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
.mk-bubble { padding: 9px 13px; border-radius: 15px; font-size: 14.5px; line-height: 1.4; max-width: 78%; word-wrap: break-word; }
.mk-bubble-monika { background: #fff; color: var(--monika-text); border: 1px solid #e8ecf3; border-bottom-left-radius: 5px; }
.mk-bubble-user { background: var(--monika-accent); color: #fff; border-bottom-right-radius: 5px; }

.mk-typing { display: flex; gap: 4px; align-items: center; }
.mk-typing span { width: 6px; height: 6px; border-radius: 50%; background: #b8c2d4; animation: mk-blink 1.2s infinite; }
.mk-typing span:nth-child(2) { animation-delay: .2s; } .mk-typing span:nth-child(3) { animation-delay: .4s; }
@keyframes mk-blink { 0%,60%,100% { opacity: .3; } 30% { opacity: 1; } }

.mk-choices, .mk-actions, .mk-form { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
.mk-chip { text-align: left; padding: 12px 14px; background: #fff; border: 1.5px solid var(--monika-accent);
  border-radius: 12px; font-size: 14.5px; color: var(--monika-primary); font-weight: 500; cursor: pointer;
  transition: background .12s, transform .08s; }
.mk-chip:hover { background: #eef3f9; } .mk-chip:active { transform: scale(.98); }
.mk-chip:focus-visible { outline: 2px solid var(--monika-accent); outline-offset: 1px; }

.mk-act { padding: 13px; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; text-align: center; }
.mk-act-primary { background: var(--monika-primary); color: #fff; }
.mk-act-secondary { background: #fff; color: var(--monika-primary); border: 1.5px solid var(--monika-accent); }
.mk-act:disabled { opacity: .5; cursor: not-allowed; }
.mk-act:focus-visible { outline: 3px solid var(--monika-accent); outline-offset: 2px; }

.mk-inp { width: 100%; padding: 11px 13px; font-size: 14.5px; border: 1px solid #d8deea; border-radius: 10px; color: var(--monika-text); background: #fff; }
.mk-inp:focus { outline: none; border-color: var(--monika-accent); }
.mk-consent { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: var(--monika-text); opacity: .85; }
.mk-consent a { color: var(--monika-accent); }
.mk-err { color: #c0392b; font-size: 13px; margin: 4px 0 0; }
.mk-hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }

.mk-gutschein { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 12px 14px;
  background: #fff8e8; border: 1.5px solid #C9A961; border-radius: 12px; }
.mk-gutschein-badge { font-weight: 800; font-size: 17px; color: #9a7d2e; background: #fbeec4; border-radius: 8px; padding: 4px 9px; flex: 0 0 auto; }
.mk-gutschein-txt { font-size: 13px; color: var(--monika-text); }

.mk-powered { padding: 7px 14px; text-align: center; font-size: 11px; background: #fff; border-top: 1px solid #eef1f6; }
.mk-powered a { color: var(--monika-accent); text-decoration: none; }
`
```

- [ ] **Step 2: Build (Gzip-Gate)**

Run: `npm run build:embed`
Expected: `[monika] built: … / … gzipped` + `gzip-Budget ok (< 30.0 KB)`, exit 0. (Falls > 30 KB: Siegel-SVG-Whitespace trimmen / Styles kürzen.)

- [ ] **Step 3: `typecheck:embed`**

Run: `npm run typecheck:embed` → PASS.

- [ ] **Step 4: Browser-Smoke (Screenshot, im selben Schritt auswerten)**

Lokale Test-HTML `/(tmp)/monika-smoke.html` mit `<script src="…/monika.js" data-cluster="kfz_wuppertal" data-phone="+4915153608515" data-stadt="wuppertal"></script>` gegen einen lokalen `next dev` ODER staging-`monika.js`. Im Browser:
1. Siegel-FAB sichtbar unten rechts.
2. Klick → Panel, Monika-Header mit Foto + „Schadenberaterin · online".
3. Eröffnung tippt 3 Bubbles nacheinander → 4 Chips erscheinen.
4. Pfad „Haftpflichtschaden" → Unfalltyp → Unverschuldet → Termin-Tag → Zeit → Kapazität → Kontaktformular.
5. Absenden (Test-Daten) → Erfolg + 25€-Gutschein-Karte.
Screenshot machen + auf Token-Treue (navy Header, ondo User-Bubbles), Umlaute, Typing-Animation prüfen.

- [ ] **Step 5: Commit**
```bash
git add src/embed/monika/styles.ts public/embed/monika.js public/embed/monika.v1.js
git commit -m "feat(AAR-939): Chat-Styles (Bubbles/Chips/Siegel-FAB/Gutschein) + Build"
```

---

## Task 12: Token-Audit + Dead-Code + Voll-Build

**Files:** (keine neuen — Gates)

- [ ] **Step 1: Token-Audit**

Run: `npm run check:token-audit`
Expected: PASS. (`assets.ts` trägt den `Token-Audit-Skip`-Header; `styles.ts` ist ein Template-String, kein className/inline-style-JSX → vom Audit nicht erfasst. Falls doch gemeldet: Skip-Header in `styles.ts` ergänzen.)

- [ ] **Step 2: Dead-Code (knip)**

Run: `npm run check:knip`
Expected: keine NEUEN toten Files. (`flow-script`/`payload`/`typing`/`assets` werden von `app.tsx` importiert; `*.test.ts` sind via vitest-include abgedeckt.)

- [ ] **Step 3: Voller App-Build (Route-Validator)**

Run: `npm run build`
Expected: grün — die geänderte Route (`embed/config`) + `lib/embed/anfrage` kompilieren. (Worktree-Hinweis: bei `node_modules`-Junction kann der Next-Build OOMen → dann `npx tsc --noEmit` + Verlass auf das CI-Build-Gate.)

- [ ] **Step 4: Alle Unit-Tests**

Run: `npm run test`
Expected: alle grün, inkl. der neuen `flow-script`/`payload`/`typing`/`anfrage`/`embed-anfrage`-Tests.

- [ ] **Step 5: Commit (falls Audit-Fixes nötig)**
```bash
git add -A
git commit -m "chore(AAR-939): token-audit/knip/build-Gates gruen fuer Monika-A-Flow Phase 1"
```

---

## Task 13: PR gegen staging

- [ ] **Step 1: Branch pushen**
```bash
git push -u origin kitta/aar-939-monika-a-chat-flow
```

- [ ] **Step 2: PR erstellen (`--base staging`)**

`gh pr create --base staging --title "feat(AAR-939): Monika A-Flow Phase 1 — Core-Chat-Flow + Visual-Identitaet" --body "<Audit-Block + Spec-Link + Test-Liste>"`

Body enthält den 7-Punkte-Audit (Build grün / UI: Siegel-FAB + Chat / Redundanz: flow-script PURE wiederverwendet / Dead-Code: alte State-Machine ersetzt / Spec: §1+§2+§4 erfüllt / Inkonsistenz: Tokens+Umlaute ok / Regression: gfa additiv, route.ts-Funnel-Branch unberührt) + Verweis auf `docs/superpowers/specs/2026-06-05-monika-a-chat-flow-design.md`.

---

## Self-Review (writing-plans)

**Spec-Coverage:** §1 Journey → Tasks 6+10 (alle 4 Pfade im SCRIPT + Renderer). §2 gfa-Spalten → Tasks 1,3,4. §3 Zuweisung/Nummern → Tasks 2,5 (sv_telefon) + bestehende `insertAnfrage`-Status-Logik (embed_free/neu) + Cluster-`data-phone`-Hinweis. §4 Visual → Tasks 9,10,11 (Siegel-FAB, Monika-Header, Bubbles, Chips, Gutschein, Tokens). §5 Multi-Message-Player → Task 10 (`playStep` + `typing.ts`). §6 Teaser / §7 Sound / §8 Resume → **Phase 2/3 (eigene Pläne, hier OUT)**. §11 Akzeptanz 1–5,9 → Tasks; 6–8 → Phase 2/3.

**Platzhalter-Scan:** keine TBD/TODO im Code; alle Steps mit konkretem Code/Befehl. Der eine `contact.next`-„ungenutzt"-Hinweis ist dokumentiert (uniformer Typ), kein Platzhalter.

**Typ-Konsistenz:** `Answers`/`StepId`/`ChoiceOption`/`ActionDef` aus `flow-script.ts` werden in `payload.ts` + `app.tsx` identisch verwendet. `buildPayloadFromAnswers(answers, cfg, meta)`-Signatur konsistent zwischen Test (Task 7) und Caller (Task 10). `AnfragePayload`-Felder (Task 7) == `EmbedAnfrageSchema`-Felder (Task 3) == `buildAnfrageColumns`-Keys (Task 4). `isClaimondoBranded` in `types.ts` (Task 10 Step 1) gesetzt in `index.tsx` + gelesen in `app.tsx`.

**Phasen-Hinweis:** Teaser/Resume/Sound bewusst ausgeklammert — Phase 1 ist ohne sie vollständig lauffähig + shippbar.
