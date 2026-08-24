# Gewinnspiel — Kern und Betrieb (P1 + P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein betreibbares Gewinnspiel: Leads mit Haftpflichtschaden werden
automatisch Teilnehmer, der Admin zieht taeglich per Klick bis zu 3 Gewinner,
prueft deren Nachweis und versendet den gewaehlten Gutschein.

**Architecture:** Drei neue Tabellen (Kampagne, Praemien-Katalog, Teilnahmen),
alle service-role-only (RLS an, keine Policies). Die Qualifikations-Regel liegt
als **pure Funktion ohne `server-only`** in einem eigenen File, damit sie im
vitest-Node-Env isoliert testbar ist — Muster: `src/lib/embed/anfrage-columns.ts`.
Die Registrierung haengt an den **zwei** existierenden Lead-Eintrittspunkten
(`createCase` fuer `leads`, `insertAnfrage` fuer `gutachter_finder_anfragen`) und
ist non-fatal: ein Gewinnspiel-Fehler darf nie eine Schadenmeldung verhindern.

**Tech Stack:** Next.js 16, TypeScript, Supabase (Postgres + RLS), vitest,
Tailwind v4, `@/components/primitives` + `@/components/shared`.

**Spec:** `docs/superpowers/specs/2026-08-23-gewinnspiel-tankgutschein-design.md`

**Hinweis zur Genauigkeit dieses Plans:** Task 1–7 und 10 enthalten
vollstaendigen, lauffaehigen Code. **Task 8 und 9 sind vorbild-gebunden** — ihr
Markup haengt an bestehenden Seiten (`admin/marketing/lokal-content/page.tsx`
bzw. `upload/dokumente/[token]/`), die der Umsetzer in Step 1 liest. Dort steht
bewusst die Struktur mit exakten Datei-, Feld- und Komponentennamen statt
erfundenem Code: geratenes Markup gegen ungelesene Vorbilder waere schlechter
als eine praezise Anweisung. Die Interfaces beider Tasks sind vollstaendig
festgelegt.

## Global Constraints

- **Regel 2 — DDL nur ueber MCP:** `mcp__plugin_supabase_supabase__apply_migration`,
  danach `list_migrations`, Migration-File exakt nach der **getrackten** Version
  benennen (`supabase/migrations/<V>_<name>.sql`) und **mitcommitten**. Niemals
  `execute_sql` mit DDL, niemals `npx supabase db push`.
- **Projekt-Ref Prod:** `paizkjajbuxxksdoycev`
- **RLS-Policy-Gate:** jede PERMISSIVE Policy braucht explizites `TO <rolle>`.
  Diese Tabellen bekommen **gar keine** Policies (service-role-only).
- **Silent-Write-Gate (Baseline 0):** jeder Write auf `leads`/`claims`/`tasks`
  prueft `error`. Unter RLS zusaetzlich `.select()` + Zeilenzahl pruefen.
- **Intake-Funnel-Gate:** Lead-Anlage nur ueber `createCase`, nie `createLead`.
  In Unit-Tests **`createCase` mocken** (`server-only` wirft sonst beim Import).
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }`, kein `throw`.
  `revalidatePath` nach jeder Mutation. Keine Konstanten/Types aus `'use server'`-Files exportieren (AAR-664).
- **Umlaute:** alle nutzersichtbaren Texte mit echten `ä ö ü ß`. Code-Kommentare duerfen ASCII sein.
- **Komponenten-Set:** `@/components/primitives/*` (Button, Card) und
  `@/components/shared/*` (SectionCard, DataTable, PageHeader) statt handgerolltem Markup.
  Radien nur `rounded-ios-{sm,md,lg,xl}`.
- **Telefon-Normalisierung:** ausschliesslich `toE164` aus `@/lib/format/telefon`.
- **Praemien-Betrag:** 50,00 € · **Preise pro Tag:** 3 (beides Kampagnen-Felder, nicht hartkodiert)
- **Lostopf-Kriterium:** `schuld_einschaetzung = 'unverschuldet'` **ODER** `schuldfrage = 'gegner'`, **und** Telefonnummer vorhanden.
- ⚠ **CHECK-Werte divergieren:** `gutachter_finder_anfragen.schuldfrage` kennt
  `gegner|unklar|teilschuld`, `leads.schuldfrage` kennt `gegner|unklar|eigenverantwortung`.
  Nie unbesehen kopieren — nur `gegner` ist in beiden gueltig.
- **Regel 4:** nach dem Deploy vollstaendiger Prod-Playwright-Smoke ueber die echte UI.

---

### Task 1: Datenbank-Schema

**Files:**
- Create: `supabase/migrations/<V>_gewinnspiel_kern.sql` (Name nach `list_migrations`)

**Interfaces:**
- Consumes: nichts
- Produces: Tabellen `gewinnspiel_kampagnen`, `gewinnspiel_praemien`,
  `gewinnspiel_teilnahmen` sowie die generierten Typen in
  `src/lib/supabase/database.types.ts`

- [ ] **Step 1: Migration anwenden**

Rufe `mcp__plugin_supabase_supabase__apply_migration` mit
`name: "gewinnspiel_kern"`, `project_id: "paizkjajbuxxksdoycev"` und exakt
dieser Query:

```sql
create table public.gewinnspiel_kampagnen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_am date not null,
  ende_am date,
  preise_pro_tag integer not null default 3 check (preise_pro_tag between 1 and 20),
  preis_betrag_eur numeric(10,2) not null default 50.00,
  topbar_text text,
  topbar_cta_text text,
  topbar_aktiv boolean not null default false,
  aktiv boolean not null default false,
  erstellt_am timestamptz not null default now()
);
comment on table public.gewinnspiel_kampagnen is
  'Gewinnspiel-Kampagne. Genau eine Zeile darf aktiv sein (Unique-Index unten).';

-- Nur EINE aktive Kampagne: die Kampagnen-API und der Lostopf gehen von
-- Eindeutigkeit aus. Ohne diesen Index waere "die aktive Kampagne" mehrdeutig.
create unique index gewinnspiel_kampagnen_eine_aktive
  on public.gewinnspiel_kampagnen ((true)) where aktiv;

create table public.gewinnspiel_praemien (
  id uuid primary key default gen_random_uuid(),
  kampagne_id uuid not null references public.gewinnspiel_kampagnen(id) on delete cascade,
  name text not null,
  beschreibung text,
  bild_pfad text,
  betrag_eur numeric(10,2) not null default 50.00,
  sortierung integer not null default 0,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now()
);
comment on table public.gewinnspiel_praemien is
  'Katalog waehlbarer Gutschein-Arten je Kampagne. Der Gewinner waehlt daraus.';

create table public.gewinnspiel_teilnahmen (
  id uuid primary key default gen_random_uuid(),
  kampagne_id uuid not null references public.gewinnspiel_kampagnen(id) on delete cascade,
  anfrage_id uuid references public.gutachter_finder_anfragen(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  telefon_normalisiert text not null,
  whatsapp_gesendet_am timestamptz,
  whatsapp_verifiziert_am timestamptz,
  status text not null default 'offen'
    check (status in ('offen','gezogen','nachweis_offen','bestaetigt','abgelehnt')),
  gewaehlte_praemie_id uuid references public.gewinnspiel_praemien(id) on delete set null,
  gezogen_am timestamptz,
  gezogen_von_user_id uuid references auth.users(id) on delete set null,
  ziehung_lostopf_groesse integer,
  nachweis_token text unique,
  nachweis_datei_pfad text,
  nachweis_hochgeladen_am timestamptz,
  nachweis_geprueft_am timestamptz,
  nachweis_geprueft_von uuid references auth.users(id) on delete set null,
  ablehnung_grund text,
  gutschein_code text,
  gutschein_versendet_am timestamptz,
  erstellt_am timestamptz not null default now(),
  -- Genau eine Herkunft. Ohne das koennte eine Teilnahme an nichts oder an
  -- zwei Objekten haengen, und die Gewinner-Ansprache wuesste nicht, wen sie meint.
  constraint gewinnspiel_teilnahmen_genau_eine_quelle
    check ((anfrage_id is not null)::int + (lead_id is not null)::int = 1)
);
comment on table public.gewinnspiel_teilnahmen is
  'Eine Teilnahme je qualifizierendem Lead. Dedup ueber telefon_normalisiert je Kampagne.';

-- Eine Teilnahme pro Person und Kampagne. Der Dedup-Schluessel ist die
-- E.164-normalisierte Nummer, nicht die Rohform: '0175…' und '+49175…' sind
-- dieselbe Person und duerfen nicht zweimal im Lostopf liegen.
create unique index gewinnspiel_teilnahmen_eine_pro_person
  on public.gewinnspiel_teilnahmen (kampagne_id, telefon_normalisiert);

create index gewinnspiel_teilnahmen_lostopf
  on public.gewinnspiel_teilnahmen (kampagne_id, status, whatsapp_verifiziert_am);

-- RLS an, KEINE Policies: der Zugriff laeuft ausschliesslich ueber service-role
-- (Admin-Actions, Token-Route). Muster: stadt_lokalinhalte. Damit entsteht
-- weder ein anon-Grant noch eine reachable Policy.
alter table public.gewinnspiel_kampagnen enable row level security;
alter table public.gewinnspiel_praemien enable row level security;
alter table public.gewinnspiel_teilnahmen enable row level security;
```

- [ ] **Step 2: Getrackte Version ablesen**

Rufe `mcp__plugin_supabase_supabase__list_migrations` und notiere die **oberste**
Version `<V>` (das Plugin vergibt einen eigenen Timestamp — nicht raten).

- [ ] **Step 3: Migration-File anlegen**

Lege `supabase/migrations/<V>_gewinnspiel_kern.sql` an mit **exakt** dem SQL aus
Step 1. Der Dateiname muss die getrackte Version tragen, sonst Twin-Drift.

- [ ] **Step 4: Verifizieren**

Rufe `mcp__plugin_supabase_supabase__execute_sql` mit:

```sql
select table_name, count(*) as spalten
from information_schema.columns
where table_schema='public' and table_name like 'gewinnspiel_%'
group by 1 order by 1;
```

Erwartung: drei Zeilen — `gewinnspiel_kampagnen`, `gewinnspiel_praemien`,
`gewinnspiel_teilnahmen`.

- [ ] **Step 5: Typen regenerieren**

```bash
SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript \
  --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
```

Prüfe, dass `gewinnspiel_teilnahmen` in der Datei vorkommt.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/ src/lib/supabase/database.types.ts
git commit -m "feat(gewinnspiel): DB-Schema Kampagne, Praemien, Teilnahmen"
```

---

### Task 2: Qualifikations-Regel (pure)

**Files:**
- Create: `src/lib/gewinnspiel/qualifikation.ts`
- Test: `src/lib/gewinnspiel/qualifikation.test.ts`

**Interfaces:**
- Consumes: `toE164` aus `@/lib/format/telefon`
- Produces:
  - `type QualifikationsInput = { telefon?: string | null; schuldfrage?: string | null; schuldEinschaetzung?: string | null }`
  - `function qualifiziertFuerGewinnspiel(input: QualifikationsInput): { qualifiziert: boolean; telefonNormalisiert: string | null; grund: string }`

**Bewusst ohne `server-only`** — diese Datei darf keine DB- und keine
Next-Imports ziehen, damit sie im vitest-Node-Env laeuft. Muster:
`src/lib/embed/anfrage-columns.ts`.

- [ ] **Step 1: Test schreiben**

Erstelle `src/lib/gewinnspiel/qualifikation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { qualifiziertFuerGewinnspiel } from './qualifikation'

describe('qualifiziertFuerGewinnspiel', () => {
  it('qualifiziert bei schuldfrage=gegner mit Telefon', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '0175 1234567', schuldfrage: 'gegner' })
    expect(r.qualifiziert).toBe(true)
    expect(r.telefonNormalisiert).toBe('+491751234567')
  })

  it('qualifiziert bei schuldEinschaetzung=unverschuldet', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '+491751234567', schuldEinschaetzung: 'unverschuldet' })
    expect(r.qualifiziert).toBe(true)
  })

  it('lehnt ohne Telefonnummer ab', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: null, schuldfrage: 'gegner' })
    expect(r.qualifiziert).toBe(false)
    expect(r.grund).toBe('keine_telefonnummer')
  })

  it('lehnt bei Eigenverschulden ab', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '0175 1234567', schuldfrage: 'eigenverantwortung' })
    expect(r.qualifiziert).toBe(false)
    expect(r.grund).toBe('kein_haftpflichtschaden')
  })

  it('lehnt bei unklarer Schuldfrage ab', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '0175 1234567', schuldfrage: 'unklar' })
    expect(r.qualifiziert).toBe(false)
  })

  it('lehnt bei nicht_sicher ab', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '0175 1234567', schuldEinschaetzung: 'nicht_sicher' })
    expect(r.qualifiziert).toBe(false)
  })

  it('lehnt ab, wenn beide Felder fehlen', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '0175 1234567' })
    expect(r.qualifiziert).toBe(false)
    expect(r.grund).toBe('kein_haftpflichtschaden')
  })

  it('behandelt teilschuld NICHT als Haftpflichtschaden', () => {
    // gutachter_finder_anfragen kennt 'teilschuld', leads nicht — und Teilschuld
    // ist kein reiner Haftpflichtschaden.
    const r = qualifiziertFuerGewinnspiel({ telefon: '0175 1234567', schuldfrage: 'teilschuld' })
    expect(r.qualifiziert).toBe(false)
  })

  it('normalisiert 00-Praefix korrekt', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '00491751234567', schuldfrage: 'gegner' })
    expect(r.telefonNormalisiert).toBe('+491751234567')
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

```bash
npx vitest run src/lib/gewinnspiel/qualifikation.test.ts
```

Erwartung: FAIL — `Cannot find module './qualifikation'`.

- [ ] **Step 3: Implementieren**

Erstelle `src/lib/gewinnspiel/qualifikation.ts`:

```typescript
// PURE Qualifikations-Regel fuer die Gewinnspiel-Teilnahme.
//
// Bewusst OHNE server-only / DB / Next-Imports -> im vitest-node-Env isoliert
// testbar (Muster: src/lib/embed/anfrage-columns.ts).
//
// Zwei Felder tragen die Schuldfrage, je nach Kanal:
//   leads.schuldfrage                        gegner | unklar | eigenverantwortung
//   gutachter_finder_anfragen.schuldfrage    gegner | unklar | teilschuld
//   gutachter_finder_anfragen.schuld_einschaetzung  unverschuldet | nicht_sicher
// Nur 'gegner' ist in beiden schuldfrage-CHECKs gueltig; 'teilschuld' zaehlt
// NICHT als Haftpflichtschaden (anteilige Quote, nicht Vollersatz).

import { toE164 } from '@/lib/format/telefon'

export type QualifikationsInput = {
  telefon?: string | null
  schuldfrage?: string | null
  schuldEinschaetzung?: string | null
}

export type QualifikationsErgebnis = {
  qualifiziert: boolean
  telefonNormalisiert: string | null
  /** Maschinenlesbarer Grund fuer Logs/Admin — kein Nutzertext. */
  grund: 'qualifiziert' | 'keine_telefonnummer' | 'kein_haftpflichtschaden'
}

export function qualifiziertFuerGewinnspiel(
  input: QualifikationsInput,
): QualifikationsErgebnis {
  const telefonNormalisiert = toE164(input.telefon)
  if (!telefonNormalisiert) {
    return { qualifiziert: false, telefonNormalisiert: null, grund: 'keine_telefonnummer' }
  }

  const istHaftpflicht =
    input.schuldfrage === 'gegner' || input.schuldEinschaetzung === 'unverschuldet'

  if (!istHaftpflicht) {
    return { qualifiziert: false, telefonNormalisiert, grund: 'kein_haftpflichtschaden' }
  }

  return { qualifiziert: true, telefonNormalisiert, grund: 'qualifiziert' }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestaetigen**

```bash
npx vitest run src/lib/gewinnspiel/qualifikation.test.ts
```

Erwartung: PASS, 9 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gewinnspiel/qualifikation.ts src/lib/gewinnspiel/qualifikation.test.ts
git commit -m "feat(gewinnspiel): pure Qualifikations-Regel mit Tests"
```

---

### Task 3: Teilnahme-Registrierung (Writer)

**Files:**
- Create: `src/lib/gewinnspiel/registriere-teilnahme.ts`
- Test: `src/lib/gewinnspiel/__tests__/registriere-teilnahme.test.ts`

**Interfaces:**
- Consumes: `qualifiziertFuerGewinnspiel` (Task 2), `createAdminClient` aus `@/lib/supabase/admin`
- Produces:
  - `function registriereTeilnahme(input: RegistriereInput): Promise<{ ok: boolean; teilnahmeId?: string; uebersprungen?: string }>`
  - `type RegistriereInput = { quelle: { anfrageId: string } | { leadId: string }; telefon?: string | null; schuldfrage?: string | null; schuldEinschaetzung?: string | null }`

- [ ] **Step 1: Test schreiben**

Erstelle `src/lib/gewinnspiel/__tests__/registriere-teilnahme.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertMock = vi.fn()
const maybeSingleMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabelle: string) => {
      if (tabelle === 'gewinnspiel_kampagnen') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
        }
      }
      return {
        insert: (werte: unknown) => {
          insertMock(werte)
          return { select: () => ({ single: () => ({ data: { id: 'teilnahme-1' }, error: null }) }) }
        },
      }
    },
  }),
}))

import { registriereTeilnahme } from '../registriere-teilnahme'

beforeEach(() => {
  insertMock.mockClear()
  maybeSingleMock.mockReset()
  maybeSingleMock.mockResolvedValue({ data: { id: 'kampagne-1' }, error: null })
})

describe('registriereTeilnahme', () => {
  it('legt eine Teilnahme fuer einen qualifizierten Lead an', async () => {
    const r = await registriereTeilnahme({
      quelle: { leadId: 'lead-1' },
      telefon: '0175 1234567',
      schuldfrage: 'gegner',
    })
    expect(r.ok).toBe(true)
    expect(r.teilnahmeId).toBe('teilnahme-1')
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kampagne_id: 'kampagne-1',
        lead_id: 'lead-1',
        telefon_normalisiert: '+491751234567',
        status: 'offen',
      }),
    )
  })

  it('ueberspringt nicht qualifizierte Leads ohne Insert', async () => {
    const r = await registriereTeilnahme({
      quelle: { leadId: 'lead-2' },
      telefon: '0175 1234567',
      schuldfrage: 'eigenverantwortung',
    })
    expect(r.ok).toBe(true)
    expect(r.uebersprungen).toBe('kein_haftpflichtschaden')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('ueberspringt, wenn keine Kampagne aktiv ist', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    const r = await registriereTeilnahme({
      quelle: { leadId: 'lead-3' },
      telefon: '0175 1234567',
      schuldfrage: 'gegner',
    })
    expect(r.ok).toBe(true)
    expect(r.uebersprungen).toBe('keine_aktive_kampagne')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('setzt anfrage_id statt lead_id bei Finder-Anfragen', async () => {
    await registriereTeilnahme({
      quelle: { anfrageId: 'anfrage-1' },
      telefon: '0175 1234567',
      schuldEinschaetzung: 'unverschuldet',
    })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ anfrage_id: 'anfrage-1', lead_id: null }),
    )
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

```bash
npx vitest run src/lib/gewinnspiel/__tests__/registriere-teilnahme.test.ts
```

Erwartung: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Implementieren**

Erstelle `src/lib/gewinnspiel/registriere-teilnahme.ts`:

```typescript
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { qualifiziertFuerGewinnspiel } from './qualifikation'

export type RegistriereInput = {
  quelle: { anfrageId: string } | { leadId: string }
  telefon?: string | null
  schuldfrage?: string | null
  schuldEinschaetzung?: string | null
}

export type RegistriereErgebnis = {
  ok: boolean
  teilnahmeId?: string
  /** Gesetzt, wenn bewusst nichts angelegt wurde (kein Fehler). */
  uebersprungen?: string
  error?: string
}

/**
 * Legt fuer einen qualifizierenden Lead eine Gewinnspiel-Teilnahme an.
 *
 * NON-FATAL by design: Jeder Aufrufer ist ein Schadenmeldungs-Pfad. Ein Fehler
 * hier darf die Meldung nie verhindern — deshalb liefert die Funktion immer ein
 * Result-Object und wirft nie.
 *
 * Dedup laeuft ueber den Unique-Index (kampagne_id, telefon_normalisiert): ein
 * Zweit-Insert derselben Nummer schlaegt mit 23505 fehl und wird als
 * 'bereits_teilgenommen' behandelt, nicht als Fehler.
 */
export async function registriereTeilnahme(
  input: RegistriereInput,
): Promise<RegistriereErgebnis> {
  const qual = qualifiziertFuerGewinnspiel({
    telefon: input.telefon,
    schuldfrage: input.schuldfrage,
    schuldEinschaetzung: input.schuldEinschaetzung,
  })
  if (!qual.qualifiziert) return { ok: true, uebersprungen: qual.grund }

  const supabase = createAdminClient()

  const { data: kampagne, error: kampagneError } = await supabase
    .from('gewinnspiel_kampagnen')
    .select('id')
    .eq('aktiv', true)
    .maybeSingle()

  if (kampagneError) {
    console.error('[gewinnspiel] Kampagne lesen:', kampagneError)
    return { ok: false, error: kampagneError.message }
  }
  if (!kampagne) return { ok: true, uebersprungen: 'keine_aktive_kampagne' }

  const { data, error } = await supabase
    .from('gewinnspiel_teilnahmen')
    .insert({
      kampagne_id: kampagne.id,
      anfrage_id: 'anfrageId' in input.quelle ? input.quelle.anfrageId : null,
      lead_id: 'leadId' in input.quelle ? input.quelle.leadId : null,
      telefon_normalisiert: qual.telefonNormalisiert!,
      status: 'offen',
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = Unique-Verletzung: diese Nummer nimmt schon teil. Kein Fehler.
    if (error.code === '23505') return { ok: true, uebersprungen: 'bereits_teilgenommen' }
    console.error('[gewinnspiel] Teilnahme anlegen:', error)
    return { ok: false, error: error.message }
  }

  return { ok: true, teilnahmeId: data.id }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestaetigen**

```bash
npx vitest run src/lib/gewinnspiel/__tests__/registriere-teilnahme.test.ts
```

Erwartung: PASS, 4 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gewinnspiel/registriere-teilnahme.ts src/lib/gewinnspiel/__tests__/
git commit -m "feat(gewinnspiel): Teilnahme-Registrierung mit Dedup"
```

---

### Task 4: Verdrahtung an den zwei Lead-Eintrittspunkten

**Files:**
- Modify: `src/lib/intake/create-case.ts` (nach dem FlowLink-Block, vor dem `direct-claim`-Zweig)
- Modify: `src/lib/embed/anfrage.ts` (in `insertAnfrage`, nach erfolgreichem Insert)
- Test: `src/lib/gewinnspiel/__tests__/verdrahtung.test.ts`

**Interfaces:**
- Consumes: `registriereTeilnahme` (Task 3)
- Produces: keine neuen Exporte — nur Seiteneffekte an bestehenden Eintrittspunkten

⚠ Beide Aufrufe sind **non-fatal**: `registriereTeilnahme` wirft nicht, und ihr
Ergebnis wird bewusst nicht in den Rueckgabewert des Intake gehoben.

- [ ] **Step 1: Test schreiben**

Erstelle `src/lib/gewinnspiel/__tests__/verdrahtung.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const registriereMock = vi.fn().mockResolvedValue({ ok: true, teilnahmeId: 't-1' })
vi.mock('@/lib/gewinnspiel/registriere-teilnahme', () => ({
  registriereTeilnahme: registriereMock,
}))
vi.mock('@/lib/leads/create-lead', () => ({
  createLead: vi.fn().mockResolvedValue({ ok: true, leadId: 'lead-1' }),
}))
vi.mock('@/lib/start-link/ensure-flowlink-for-lead', () => ({
  ensureCanonicalFlowLinkForLead: vi.fn().mockResolvedValue({ ok: true, token: 'tok' }),
}))
vi.mock('@/lib/leads/convert-lead-to-fall', () => ({ convertLeadToFall: vi.fn() }))
vi.mock('@/lib/intake/recent-intake-lead', () => ({
  findRecentIntakeLead: vi.fn().mockResolvedValue(null),
}))
vi.mock('server-only', () => ({}))

import { createCase } from '@/lib/intake/create-case'

beforeEach(() => registriereMock.mockClear())

describe('createCase -> Gewinnspiel', () => {
  it('registriert eine Teilnahme mit Telefon und Schuldfrage', async () => {
    const r = await createCase({} as never, {
      mode: 'lead-first',
      base: { source_channel: 'test', status: 'neu', telefon: '0175 1234567' },
      extra: { schuldfrage: 'gegner' },
    })
    expect(r.ok).toBe(true)
    expect(registriereMock).toHaveBeenCalledWith({
      quelle: { leadId: 'lead-1' },
      telefon: '0175 1234567',
      schuldfrage: 'gegner',
      schuldEinschaetzung: null,
    })
  })

  it('bricht den Intake nicht ab, wenn die Registrierung scheitert', async () => {
    registriereMock.mockRejectedValueOnce(new Error('DB weg'))
    const r = await createCase({} as never, {
      mode: 'lead-first',
      base: { source_channel: 'test', status: 'neu', telefon: '0175 1234567' },
      extra: { schuldfrage: 'gegner' },
    })
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

```bash
npx vitest run src/lib/gewinnspiel/__tests__/verdrahtung.test.ts
```

Erwartung: FAIL — `registriereMock` wurde nicht aufgerufen.

- [ ] **Step 3: `create-case.ts` erweitern**

Ergänze den Import oben:

```typescript
import { registriereTeilnahme } from '@/lib/gewinnspiel/registriere-teilnahme'
```

Füge **direkt nach** dem FlowLink-Block (nach der Zeile
`if (!fl.ok) console.error('[intake/createCase] FlowLink fehlgeschlagen (non-fatal):', fl.error)`)
ein:

```typescript
  // 3b. Gewinnspiel-Teilnahme (non-fatal). Kein Aufrufer darf hieran scheitern:
  //     jeder Pfad hierher ist eine Schadenmeldung.
  try {
    await registriereTeilnahme({
      quelle: { leadId },
      telefon: input.base.telefon,
      schuldfrage: (input.extra?.schuldfrage as string | null | undefined) ?? null,
      schuldEinschaetzung: null,
    })
  } catch (err) {
    console.error('[intake/createCase] Gewinnspiel-Teilnahme (non-fatal):', err)
  }
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestaetigen**

```bash
npx vitest run src/lib/gewinnspiel/__tests__/verdrahtung.test.ts
```

Erwartung: PASS, 2 Tests.

- [ ] **Step 5: `insertAnfrage` erweitern**

Öffne `src/lib/embed/anfrage.ts`, finde in `insertAnfrage` die Stelle **nach**
dem erfolgreichen Insert (dort, wo die neue Anfrage-ID vorliegt), und ergänze:

```typescript
  // Gewinnspiel-Teilnahme (non-fatal) — siehe create-case.ts 3b.
  try {
    await registriereTeilnahme({
      quelle: { anfrageId: neueAnfrageId },
      telefon: payload.telefon,
      schuldfrage: null,
      schuldEinschaetzung: payload.schuld_einschaetzung ?? null,
    })
  } catch (err) {
    console.error('[embed/insertAnfrage] Gewinnspiel-Teilnahme (non-fatal):', err)
  }
```

Import oben ergänzen:

```typescript
import { registriereTeilnahme } from '@/lib/gewinnspiel/registriere-teilnahme'
```

⚠ Ersetze `neueAnfrageId` durch den tatsächlichen Variablennamen der eingefügten
Zeilen-ID in dieser Funktion. **Nachlesen, nicht raten** — die Funktion liegt in
derselben Datei.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Erwartung: keine neuen Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/lib/intake/create-case.ts src/lib/embed/anfrage.ts src/lib/gewinnspiel/__tests__/verdrahtung.test.ts
git commit -m "feat(gewinnspiel): Teilnahme an beiden Lead-Eintrittspunkten verdrahtet"
```

---

### Task 5: WhatsApp-Welcome und Verifikation

**Files:**
- Create: `src/lib/gewinnspiel/welcome-nachricht.ts`
- Test: `src/lib/gewinnspiel/__tests__/welcome-nachricht.test.ts`

**Interfaces:**
- Consumes: `sendWhatsApp` aus `@/lib/whatsapp/send` (Signatur vor dem Bau in
  der Datei nachlesen), `createAdminClient`
- Produces: `function sendeWelcomeFuerOffeneTeilnahmen(limit?: number): Promise<{ ok: boolean; gesendet: number; error?: string }>`

Batch-Funktion statt Einzelversand: der Aufruf erfolgt aus der Admin-Seite und
ist damit rate-limitiert durch den Menschen. `limit` deckelt zusaetzlich
(Default 25) — Baileys ist eine inoffizielle Anbindung, Massen-Outbound ist der
klassische Sperr-Ausloeser.

- [ ] **Step 1: Sende-Signatur nachlesen**

```bash
grep -n "export async function\|export function" src/lib/whatsapp/send.ts | head -10
```

Notiere die exakte Signatur — der folgende Code muss sie verwenden.

- [ ] **Step 2: Test schreiben**

Erstelle `src/lib/gewinnspiel/__tests__/welcome-nachricht.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ ok: true })
const updateMock = vi.fn().mockResolvedValue({ error: null })
const offeneTeilnahmen = [
  { id: 't-1', telefon_normalisiert: '+491751111111' },
  { id: 't-2', telefon_normalisiert: '+491752222222' },
]

vi.mock('@/lib/whatsapp/send', () => ({ sendWhatsApp: sendMock }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({ limit: () => ({ data: offeneTeilnahmen, error: null }) }),
        }),
      }),
      update: (werte: unknown) => {
        updateMock(werte)
        return { eq: () => ({ select: () => ({ data: [{ id: 't-1' }], error: null }) }) }
      },
    }),
  }),
}))

import { sendeWelcomeFuerOffeneTeilnahmen } from '../welcome-nachricht'

beforeEach(() => {
  sendMock.mockClear()
  updateMock.mockClear()
})

describe('sendeWelcomeFuerOffeneTeilnahmen', () => {
  it('sendet an jede offene Teilnahme genau einmal', async () => {
    const r = await sendeWelcomeFuerOffeneTeilnahmen()
    expect(r.ok).toBe(true)
    expect(r.gesendet).toBe(2)
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('markiert den Sendezeitpunkt', async () => {
    await sendeWelcomeFuerOffeneTeilnahmen()
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp_gesendet_am: expect.any(String) }),
    )
  })

  it('zaehlt einen Sende-Fehler nicht als gesendet', async () => {
    sendMock.mockResolvedValueOnce({ ok: false, error: 'nicht erreichbar' })
    const r = await sendeWelcomeFuerOffeneTeilnahmen()
    expect(r.gesendet).toBe(1)
  })
})
```

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestaetigen**

```bash
npx vitest run src/lib/gewinnspiel/__tests__/welcome-nachricht.test.ts
```

Erwartung: FAIL — Modul nicht gefunden.

- [ ] **Step 4: Implementieren**

Erstelle `src/lib/gewinnspiel/welcome-nachricht.ts`. Passe `sendWhatsApp` an die
in Step 1 abgelesene Signatur an:

```typescript
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsApp } from '@/lib/whatsapp/send'

/** Deckel pro Lauf. Baileys ist inoffiziell — Massen-Outbound sperrt die Nummer,
 *  und die traegt auch die operative Fall-Kommunikation. */
const STANDARD_LIMIT = 25

const WELCOME_TEXT =
  'Hallo! Sie sind für unser tägliches Gewinnspiel registriert — täglich verlosen ' +
  'wir 3× einen 50-€-Gutschein unter allen Teilnehmern mit unverschuldetem Unfall. ' +
  'Antworten Sie kurz auf diese Nachricht, dann ist Ihre Teilnahme bestätigt. ' +
  'Viel Glück!'

export async function sendeWelcomeFuerOffeneTeilnahmen(
  limit: number = STANDARD_LIMIT,
): Promise<{ ok: boolean; gesendet: number; error?: string }> {
  const supabase = createAdminClient()

  const { data: offene, error } = await supabase
    .from('gewinnspiel_teilnahmen')
    .select('id, telefon_normalisiert')
    .eq('status', 'offen')
    .is('whatsapp_gesendet_am', null)
    .limit(limit)

  if (error) {
    console.error('[gewinnspiel] offene Teilnahmen lesen:', error)
    return { ok: false, gesendet: 0, error: error.message }
  }

  let gesendet = 0
  for (const teilnahme of offene ?? []) {
    const res = await sendWhatsApp(teilnahme.telefon_normalisiert, WELCOME_TEXT)
    if (!res?.ok) {
      console.error('[gewinnspiel] Welcome fehlgeschlagen:', teilnahme.id, res?.error)
      continue
    }
    gesendet += 1

    const { error: updateError } = await supabase
      .from('gewinnspiel_teilnahmen')
      .update({ whatsapp_gesendet_am: new Date().toISOString() })
      .eq('id', teilnahme.id)
      .select('id')

    if (updateError) {
      console.error('[gewinnspiel] Sendezeitpunkt markieren:', teilnahme.id, updateError)
    }
  }

  return { ok: true, gesendet }
}
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestaetigen**

```bash
npx vitest run src/lib/gewinnspiel/__tests__/welcome-nachricht.test.ts
```

Erwartung: PASS, 3 Tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gewinnspiel/welcome-nachricht.ts src/lib/gewinnspiel/__tests__/welcome-nachricht.test.ts
git commit -m "feat(gewinnspiel): WhatsApp-Welcome mit Sende-Deckel"
```

---

### Task 6: Ziehung

**Files:**
- Create: `src/lib/gewinnspiel/ziehung.ts`
- Test: `src/lib/gewinnspiel/__tests__/ziehung.test.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `randomInt` aus `node:crypto`
- Produces:
  - `function waehleGewinner<T>(lostopf: T[], anzahl: number): T[]` (pure, exportiert fuer Tests)
  - `function fuehreZiehungDurch(userId: string): Promise<{ ok: boolean; gezogen: number; error?: string }>`

`randomInt` aus `node:crypto` statt `Math.random()`: eine Ziehung um Geldwerte
muss kryptographisch zufaellig und im Streitfall verteidigbar sein.

- [ ] **Step 1: Test schreiben**

Erstelle `src/lib/gewinnspiel/__tests__/ziehung.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { waehleGewinner } from '../ziehung'

describe('waehleGewinner', () => {
  it('zieht die gewuenschte Anzahl', () => {
    const gewinner = waehleGewinner(['a', 'b', 'c', 'd', 'e'], 3)
    expect(gewinner).toHaveLength(3)
  })

  it('zieht ohne Zuruecklegen (keine Dubletten)', () => {
    const gewinner = waehleGewinner(['a', 'b', 'c', 'd', 'e'], 5)
    expect(new Set(gewinner).size).toBe(5)
  })

  it('gibt bei Unterdeckung alle zurueck, nicht mehr', () => {
    const gewinner = waehleGewinner(['a', 'b'], 3)
    expect(gewinner).toHaveLength(2)
  })

  it('kommt mit leerem Lostopf klar', () => {
    expect(waehleGewinner([], 3)).toEqual([])
  })

  it('veraendert den Eingabe-Array nicht', () => {
    const lostopf = ['a', 'b', 'c']
    waehleGewinner(lostopf, 2)
    expect(lostopf).toEqual(['a', 'b', 'c'])
  })

  it('streut ueber viele Laeufe (kein konstantes Ergebnis)', () => {
    const gesehen = new Set<string>()
    for (let i = 0; i < 60; i++) gesehen.add(waehleGewinner(['a', 'b', 'c', 'd'], 1)[0])
    expect(gesehen.size).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

```bash
npx vitest run src/lib/gewinnspiel/__tests__/ziehung.test.ts
```

Erwartung: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Implementieren**

Erstelle `src/lib/gewinnspiel/ziehung.ts`:

```typescript
import 'server-only'
import { randomInt, randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Fisher-Yates auf einer Kopie, gespeist aus node:crypto.
 *
 * Bewusst NICHT Math.random(): hier werden Geldwerte verteilt. Die Ziehung muss
 * kryptographisch zufaellig und im Streitfall verteidigbar sein.
 * Exportiert, damit die Auswahl ohne DB testbar ist.
 */
export function waehleGewinner<T>(lostopf: T[], anzahl: number): T[] {
  const kopie = [...lostopf]
  const ziel = Math.min(anzahl, kopie.length)
  for (let i = 0; i < ziel; i++) {
    const j = i + randomInt(kopie.length - i)
    ;[kopie[i], kopie[j]] = [kopie[j], kopie[i]]
  }
  return kopie.slice(0, ziel)
}

/**
 * Zieht bis zu `preise_pro_tag` Gewinner aus den verifizierten, offenen
 * Teilnahmen der aktiven Kampagne.
 *
 * "Bis zu": bei Unterdeckung werden weniger gezogen. Die Teilnahmebedingungen
 * sind entsprechend formuliert — bei aktuell ~0,2 Leads/Tag ist Unterdeckung
 * der Normalfall, nicht die Ausnahme.
 */
export async function fuehreZiehungDurch(
  userId: string,
): Promise<{ ok: boolean; gezogen: number; error?: string }> {
  const supabase = createAdminClient()

  const { data: kampagne, error: kampagneError } = await supabase
    .from('gewinnspiel_kampagnen')
    .select('id, preise_pro_tag')
    .eq('aktiv', true)
    .maybeSingle()

  if (kampagneError) return { ok: false, gezogen: 0, error: kampagneError.message }
  if (!kampagne) return { ok: false, gezogen: 0, error: 'Keine aktive Kampagne.' }

  const { data: lostopf, error: lostopfError } = await supabase
    .from('gewinnspiel_teilnahmen')
    .select('id')
    .eq('kampagne_id', kampagne.id)
    .eq('status', 'offen')
    .not('whatsapp_verifiziert_am', 'is', null)

  if (lostopfError) return { ok: false, gezogen: 0, error: lostopfError.message }

  const kandidaten = lostopf ?? []
  if (kandidaten.length === 0) return { ok: true, gezogen: 0 }

  const gewinner = waehleGewinner(kandidaten, kampagne.preise_pro_tag)
  const jetzt = new Date().toISOString()

  let gezogen = 0
  for (const g of gewinner) {
    const { data, error } = await supabase
      .from('gewinnspiel_teilnahmen')
      .update({
        status: 'nachweis_offen',
        gezogen_am: jetzt,
        gezogen_von_user_id: userId,
        ziehung_lostopf_groesse: kandidaten.length,
        nachweis_token: randomUUID(),
      })
      .eq('id', g.id)
      .eq('status', 'offen') // Schutz gegen Doppelziehung bei Parallel-Klick
      .select('id')

    if (error) {
      console.error('[gewinnspiel] Gewinner markieren:', g.id, error)
      continue
    }
    if (!data || data.length === 0) continue // war bereits gezogen
    gezogen += 1
  }

  return { ok: true, gezogen }
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestaetigen**

```bash
npx vitest run src/lib/gewinnspiel/__tests__/ziehung.test.ts
```

Erwartung: PASS, 6 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gewinnspiel/ziehung.ts src/lib/gewinnspiel/__tests__/ziehung.test.ts
git commit -m "feat(gewinnspiel): kryptographische Ziehung mit Doppelklick-Schutz"
```

---

### Task 7: Admin-Server-Actions

**Files:**
- Create: `src/app/admin/marketing/gewinnspiel/actions.ts`

**Interfaces:**
- Consumes: `requireRole` aus `@/lib/auth/guards`, `createAdminClient`,
  `fuehreZiehungDurch` (Task 6), `sendeWelcomeFuerOffeneTeilnahmen` (Task 5)
- Produces (alle `Promise<{ ok: boolean; error?: string }>` sofern nicht anders angegeben):
  - `speichereKampagne(formData: FormData)`
  - `setzeKampagneAktiv(id: string, aktiv: boolean)`
  - `speicherePraemie(formData: FormData)`
  - `loeschePraemie(id: string)`
  - `zieheHeute(): Promise<{ ok: boolean; gezogen?: number; error?: string }>`
  - `sendeWelcomes(): Promise<{ ok: boolean; gesendet?: number; error?: string }>`
  - `bestaetigeNachweis(teilnahmeId: string, gutscheinCode: string)`
  - `lehneNachweisAb(teilnahmeId: string, grund: string)`

- [ ] **Step 1: Guard-Muster nachlesen**

```bash
grep -n "requireRole" src/app/admin/marketing/lokal-content/actions.ts | head -5
```

Notiere, wie das Ergebnis geprüft wird (`.success`, wirft **nicht**).

- [ ] **Step 2: Actions schreiben**

Erstelle `src/app/admin/marketing/gewinnspiel/actions.ts`:

```typescript
'use server'

// Gewinnspiel-Verwaltung. Muster 1:1 aus admin/marketing/lokal-content/actions.ts:
//   requireRole(['admin']) -> .success pruefen (wirft NICHT)
//   createAdminClient() (service-role) — die Tabellen haben RLS an und KEINE Policies
//   Ergebnis { ok, error? }, revalidatePath nach jeder Mutation
// Keine Konstanten/Types aus diesem File exportieren (AAR-664).

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { fuehreZiehungDurch } from '@/lib/gewinnspiel/ziehung'
import { sendeWelcomeFuerOffeneTeilnahmen } from '@/lib/gewinnspiel/welcome-nachricht'

const ADMIN_PFAD = '/admin/marketing/gewinnspiel'

export async function speichereKampagne(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const id = formData.get('id') as string | null
  const werte = {
    name: String(formData.get('name') ?? '').trim(),
    start_am: String(formData.get('start_am') ?? ''),
    ende_am: (formData.get('ende_am') as string) || null,
    preise_pro_tag: Number(formData.get('preise_pro_tag') ?? 3),
    preis_betrag_eur: Number(formData.get('preis_betrag_eur') ?? 50),
    topbar_text: (formData.get('topbar_text') as string) || null,
    topbar_cta_text: (formData.get('topbar_cta_text') as string) || null,
    topbar_aktiv: formData.get('topbar_aktiv') === 'on',
  }

  if (!werte.name) return { ok: false, error: 'Bitte einen Namen angeben.' }
  if (!werte.start_am) return { ok: false, error: 'Bitte ein Startdatum angeben.' }

  const supabase = createAdminClient()
  const { error } = id
    ? await supabase.from('gewinnspiel_kampagnen').update(werte).eq('id', id)
    : await supabase.from('gewinnspiel_kampagnen').insert(werte)

  if (error) return { ok: false, error: error.message }
  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

export async function setzeKampagneAktiv(
  id: string,
  aktiv: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const supabase = createAdminClient()

  // Der Unique-Index laesst nur EINE aktive Kampagne zu -> vorher alle deaktivieren.
  if (aktiv) {
    const { error: deaktivError } = await supabase
      .from('gewinnspiel_kampagnen')
      .update({ aktiv: false })
      .eq('aktiv', true)
    if (deaktivError) return { ok: false, error: deaktivError.message }
  }

  const { error } = await supabase.from('gewinnspiel_kampagnen').update({ aktiv }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

export async function speicherePraemie(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const id = formData.get('id') as string | null
  const werte = {
    kampagne_id: String(formData.get('kampagne_id') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    beschreibung: (formData.get('beschreibung') as string) || null,
    bild_pfad: (formData.get('bild_pfad') as string) || null,
    betrag_eur: Number(formData.get('betrag_eur') ?? 50),
    sortierung: Number(formData.get('sortierung') ?? 0),
    aktiv: formData.get('aktiv') !== 'off',
  }

  if (!werte.name) return { ok: false, error: 'Bitte einen Namen angeben.' }
  if (!werte.kampagne_id) return { ok: false, error: 'Keine Kampagne zugeordnet.' }

  const supabase = createAdminClient()
  const { error } = id
    ? await supabase.from('gewinnspiel_praemien').update(werte).eq('id', id)
    : await supabase.from('gewinnspiel_praemien').insert(werte)

  if (error) return { ok: false, error: error.message }
  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

export async function loeschePraemie(id: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const supabase = createAdminClient()
  const { error } = await supabase.from('gewinnspiel_praemien').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

export async function zieheHeute(): Promise<{ ok: boolean; gezogen?: number; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const res = await fuehreZiehungDurch(auth.user.id)
  revalidatePath(ADMIN_PFAD)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, gezogen: res.gezogen }
}

export async function sendeWelcomes(): Promise<{ ok: boolean; gesendet?: number; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const res = await sendeWelcomeFuerOffeneTeilnahmen()
  revalidatePath(ADMIN_PFAD)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, gesendet: res.gesendet }
}

export async function bestaetigeNachweis(
  teilnahmeId: string,
  gutscheinCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }
  if (!gutscheinCode.trim()) return { ok: false, error: 'Bitte einen Gutschein-Code eintragen.' }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('gewinnspiel_teilnahmen')
    .update({
      status: 'bestaetigt',
      nachweis_geprueft_am: new Date().toISOString(),
      nachweis_geprueft_von: auth.user.id,
      gutschein_code: gutscheinCode.trim(),
      gutschein_versendet_am: new Date().toISOString(),
    })
    .eq('id', teilnahmeId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Teilnahme nicht gefunden.' }

  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

export async function lehneNachweisAb(
  teilnahmeId: string,
  grund: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Keine Berechtigung.' }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('gewinnspiel_teilnahmen')
    .update({
      status: 'abgelehnt',
      nachweis_geprueft_am: new Date().toISOString(),
      nachweis_geprueft_von: auth.user.id,
      ablehnung_grund: grund.trim() || null,
    })
    .eq('id', teilnahmeId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Teilnahme nicht gefunden.' }

  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}
```

⚠ Prüfe in Step 1, wie das `requireRole`-Ergebnis die User-ID trägt. Falls nicht
`auth.user.id`, passe die drei Verwendungen an.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Erwartung: keine neuen Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/marketing/gewinnspiel/actions.ts
git commit -m "feat(gewinnspiel): Admin-Server-Actions"
```

---

### Task 8: Admin-Oberflaeche

**Files:**
- Create: `src/app/admin/marketing/gewinnspiel/page.tsx`
- Create: `src/app/admin/marketing/gewinnspiel/GewinnspielClient.tsx`
- Modify: `src/app/admin/marketing/page.tsx` (Kachel/Link ergaenzen)

**Interfaces:**
- Consumes: alle Actions aus Task 7
- Produces: erreichbare Route `/admin/marketing/gewinnspiel`

Die Seite hat drei Bereiche: **Kampagne** (Formular), **Praemien-Katalog**
(Liste + Formular), **Heute** (Kennzahlen, „Welcomes senden", „Jetzt ziehen",
Pruef-Queue).

- [ ] **Step 1: Vorbild-Seite lesen**

```bash
cat src/app/admin/marketing/lokal-content/page.tsx
```

Übernimm daraus: Server-Component-Struktur, Datenladen, `PageHeader`-Verwendung,
wie der Client-Teil eingebunden wird.

- [ ] **Step 2: Server-Component schreiben**

Erstelle `src/app/admin/marketing/gewinnspiel/page.tsx`. Sie lädt per
`createAdminClient()`:

- die aktive Kampagne (`gewinnspiel_kampagnen`, `aktiv=true`) plus alle Kampagnen für die Auswahl
- deren Prämien (`gewinnspiel_praemien`, nach `sortierung`)
- Kennzahlen: Anzahl `status='offen'`, davon mit `whatsapp_verifiziert_am is not null`, Anzahl `status='nachweis_offen'`
- die Pruef-Queue: alle mit `status='nachweis_offen'` samt `nachweis_datei_pfad`, `gewaehlte_praemie_id`, `telefon_normalisiert`

und reicht alles an `<GewinnspielClient …/>` weiter. Nutze `PageHeader` aus
`@/components/shared` und `SectionCard` für die drei Bereiche.

- [ ] **Step 3: Client-Component schreiben**

Erstelle `src/app/admin/marketing/gewinnspiel/GewinnspielClient.tsx` mit
`'use client'`. Verwende:

- `Button` aus `@/components/primitives` (Props: `onClick`, `variant`, `loading`)
- `DataTable`-Set aus `@/components/shared/DataTable` für die Pruef-Queue
- `toast` aus `sonner` für Rückmeldungen

Jede Action wird per Result-Check aufgerufen, nie in try/catch:

```typescript
const res = await zieheHeute()
if (!res.ok) { toast.error(res.error ?? 'Fehler bei der Ziehung.'); return }
toast.success(`${res.gezogen} Gewinner gezogen.`)
```

Alle nutzersichtbaren Texte mit echten Umlauten: „Jetzt ziehen", „Prämien",
„Nachweis prüfen", „Gutschein-Code", „Ablehnen", „Bestätigen".

- [ ] **Step 4: Einstiegspunkt ergaenzen**

Öffne `src/app/admin/marketing/page.tsx` und ergänze eine Kachel/einen Link auf
`/admin/marketing/gewinnspiel` im selben Muster wie die vorhandenen Einträge
(Audit-Punkt 2: UI-Erreichbarkeit).

- [ ] **Step 5: Build**

```bash
npm run build
```

Erwartung: grün. Bei Routen-/Layout-Änderungen reicht `tsc` **nicht** —
Next.js findet hier Validator-Fehler zur Build-Zeit.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/marketing/gewinnspiel/ src/app/admin/marketing/page.tsx
git commit -m "feat(gewinnspiel): Admin-Oberflaeche mit Ziehung und Pruef-Queue"
```

---

### Task 9: Gewinner-Seite (Nachweis und Praemien-Wahl)

**Files:**
- Create: `src/app/gewinn/[token]/page.tsx`
- Create: `src/app/gewinn/[token]/GewinnClient.tsx`
- Create: `src/app/gewinn/[token]/actions.ts`

**Interfaces:**
- Consumes: `gewinnspiel_teilnahmen.nachweis_token` (Task 1), Prämien-Katalog
- Produces:
  - `waehlePraemie(token: string, praemieId: string): Promise<{ ok: boolean; error?: string }>`
  - `speichereNachweis(token: string, formData: FormData): Promise<{ ok: boolean; error?: string }>`

Die Route ist **oeffentlich per Token** (kein Login). Vorbild fuer Aufbau,
Token-Aufloesung und Upload:
`src/app/upload/dokumente/[token]/{page.tsx,actions.ts}` — vor dem Bau lesen.

- [ ] **Step 1: Vorbild lesen**

```bash
cat src/app/upload/dokumente/[token]/page.tsx
cat src/app/upload/dokumente/[token]/actions.ts
```

Notiere: wie das Token aufgelöst wird, in welchen Storage-Bucket geschrieben
wird, wie ungültige Tokens behandelt werden.

- [ ] **Step 2: Server-Component schreiben**

Erstelle `src/app/gewinn/[token]/page.tsx`:

- Token per `createAdminClient()` gegen `gewinnspiel_teilnahmen.nachweis_token` auflösen
- Kein Treffer → `notFound()`
- `status !== 'nachweis_offen'` → Hinweisseite („Dieser Link wurde bereits verwendet.")
- Prämien der Kampagne laden (`aktiv=true`, nach `sortierung`)
- Alles an `<GewinnClient …/>` reichen

- [ ] **Step 3: Actions schreiben**

Erstelle `src/app/gewinn/[token]/actions.ts` mit `'use server'`. Beide Actions
lösen zuerst das Token auf und prüfen `status='nachweis_offen'` — **kein**
`requireRole`, die Route ist öffentlich, das Token ist die Berechtigung.

`speichereNachweis` legt die Datei im Storage ab, schreibt
`nachweis_datei_pfad` + `nachweis_hochgeladen_am` und prüft den Write per
`.select()` auf Zeilenzahl.

`waehlePraemie` setzt `gewaehlte_praemie_id` nach Prüfung, dass die Prämie zur
Kampagne der Teilnahme gehört (sonst könnte ein manipulierter Aufruf eine fremde
Prämie setzen).

- [ ] **Step 4: Client-Component schreiben**

Erstelle `src/app/gewinn/[token]/GewinnClient.tsx` mit `'use client'`. Aufbau:

1. Gewinn-Bestätigung: „Sie haben gewonnen!" mit dem Betrag
2. Prämien-Wahl: die Karten des Katalogs als antippbare Auswahl
3. Nachweis-Upload: Foto/PDF des Haftpflichtschadens
4. Abschluss-Hinweis: „Wir prüfen Ihren Nachweis und senden den Gutschein per WhatsApp."

Deutsche Texte mit echten Umlauten. Mobil zuerst — Gewinner öffnen den Link
praktisch immer am Handy.

- [ ] **Step 5: Build**

```bash
npm run build
```

Erwartung: grün.

- [ ] **Step 6: Commit**

```bash
git add src/app/gewinn/
git commit -m "feat(gewinnspiel): Gewinner-Seite mit Nachweis-Upload und Praemien-Wahl"
```

---

### Task 10: Zweckhinweis in den teilnehmenden Formularen (Spec 6.3)

**Files:**
- Modify: `claimondo-marketing/app/[locale]/schaden-melden/MiniWizardClient.tsx`
- Modify: die Formular-Komponente des nativen Gutachter-Finders
- Modify: `claimondo-marketing/i18n/messages/{de,en,tr,pl,ru,ar}.json`

**Interfaces:**
- Consumes: nichts
- Produces: i18n-Key `gewinnspiel.teilnahme_hinweis` in allen 6 Locales

Dass ein Lead automatisch am Gewinnspiel teilnimmt, ist eine Verarbeitung zu
einem **neuen Zweck**. Stillschweigend geht das nicht. Der Hinweis ist kurz und
steht dort, wo abgeschickt wird — er ersetzt **nicht** die getrennte
Telefon-Einwilligung nach § 7 UWG (die gehoert zum LP-Formular in Plan B).

⚠ Ein neuer Key nur in `de.json` reisst das i18n-Paritaets-Gate. **Alle 6
Locales**, sonst blockt CI.

- [ ] **Step 1: Key in allen Locales anlegen**

In `claimondo-marketing/i18n/messages/de.json` unter dem passenden Namespace:

```json
"gewinnspiel": {
  "teilnahme_hinweis": "Mit dem Absenden nehmen Sie automatisch an unserem täglichen Gewinnspiel teil (3 × 50 € Gutschein). Teilnahmebedingungen ansehen."
}
```

Dieselbe Struktur in `en.json`, `tr.json`, `pl.json`, `ru.json`, `ar.json` mit
übersetztem Text.

- [ ] **Step 2: Hinweis im Mini-Wizard einbauen**

In `MiniWizardClient.tsx` direkt über dem Absende-Button, in derselben
Typo-Stufe wie die vorhandenen Rechtshinweise (`text-body-xs`), mit Link auf die
Teilnahmebedingungen.

- [ ] **Step 3: Hinweis im nativen Finder einbauen**

Finde die Formular-Komponente des nativen Gutachter-Finders:

```bash
git grep -ln "anfrage-from-lp" claimondo-marketing/ | head
```

Denselben Hinweis an derselben Position einsetzen.

- [ ] **Step 4: i18n-Gate pruefen**

```bash
npm run check:i18n
```

Erwartung: grün (Parität über alle 6 Locales).

- [ ] **Step 5: Build**

```bash
npm run build
```

Erwartung: grün.

- [ ] **Step 6: Commit**

```bash
git add claimondo-marketing/
git commit -m "feat(gewinnspiel): Zweckhinweis zur automatischen Teilnahme (6 Locales)"
```

---

### Task 11: Operatives Soll und Prod-Smoke (Regel 4)

**Files:**
- Create: `docs/superpowers/plans/2026-08-23-gewinnspiel-operatives-soll.md`
- Create: `tests/e2e/flows/gewinnspiel-admin-smoke.spec.ts`

**Interfaces:**
- Consumes: alle vorherigen Tasks
- Produces: dokumentiertes Soll + gruener Prod-Smoke

⚠ Das Soll wird **vor** dem Smoke geschrieben und **mit Aaron abgestimmt** — es
ist die Referenz, gegen die geprüft wird, nicht der Code.

- [ ] **Step 1: Operatives Soll schreiben**

Erstelle das Dokument mit der Nutzer-Schrittfolge in Prosa, hergeleitet aus der
Fachlogik (nicht aus dem Code gelesen):

1. Admin legt eine Kampagne an und aktiviert sie.
2. Admin pflegt mindestens zwei Prämien in den Katalog.
3. Ein Kunde meldet über den Gutachter-Finder einen unverschuldeten Unfall mit
   Telefonnummer → er erscheint als Teilnahme mit Status „offen".
4. Ein Kunde ohne Telefonnummer oder mit Eigenverschulden erscheint **nicht**.
5. Admin sendet die Welcomes; der Teilnehmer erhält genau eine WhatsApp.
6. Nach Verifikation zieht der Admin; bis zu 3 Gewinner wechseln auf
   „nachweis_offen" und erhalten einen Link.
7. Der Gewinner wählt eine Prämie und lädt den Nachweis hoch.
8. Admin bestätigt, trägt den Gutschein-Code ein → Status „bestaetigt".
9. Admin lehnt einen zweiten Nachweis ab → Status „abgelehnt", Nachziehen möglich.

- [ ] **Step 2: Soll mit Aaron abstimmen**

Vorlegen und Freigabe abwarten. **Erst danach** den Smoke schreiben.

- [ ] **Step 3: Playwright-Spec schreiben**

Erstelle `tests/e2e/flows/gewinnspiel-admin-smoke.spec.ts`. Deckt Schritt 1, 2, 6,
8 und 9 über die **echte UI** ab (Login als `test-admin@claimondo.de`).

⚠ **Kein `readFileSync` auf Modul-Ebene** (E2E-Toplevel-FS-Gate) — Seed-Reads
gehören in ein `try/catch` mit `test.skip(!seed, …)` im Test-Body.

⚠ Test-Konten mit `telefon = NULL` verwenden, damit keine echten Nachrichten
rausgehen.

- [ ] **Step 4: Smoke gegen Prod fahren**

Nach dem Deploy:

```bash
PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test tests/e2e/flows/gewinnspiel-admin-smoke.spec.ts
```

⚠ `PLAYWRIGHT_BASE_URL` allein genügt nicht für alle Specs — Specs, die
`_golden-path-lib` nutzen, bauen ihre `baseURL` aus `GOLDEN_APP_URL`. Prüfe im
Zweifel am Zugriffslog der Instanz, dass wirklich Prod getroffen wurde.

- [ ] **Step 5: Ergebnis dokumentieren**

Kommando + Output in den PR. Rot → Fix nachziehen, **nicht** als erledigt melden.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-08-23-gewinnspiel-operatives-soll.md tests/e2e/flows/gewinnspiel-admin-smoke.spec.ts
git commit -m "test(gewinnspiel): operatives Soll + Admin-Prod-Smoke"
```

---

## Nach diesem Plan

**Nicht enthalten, folgt in Plan B (P3):**
- Kampagnen-API `GET /api/kampagne/aktiv` (B2)
- Topbar in den 7 Builds (B3)
- Gewinnspiel-Landingpage (B4)

**Weiterhin offen aus der Spec:**
- O2 Gutschein-Anbieter und Produktbilder
- O4 Meta-/TikTok-Pixel im GTM-Container
- O5 Teilnahmebedingungen (Freigabe extern) — **Launch-Blocker**, kein Bau-Blocker
