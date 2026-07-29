# Werkstatt-Onboarding-Aktivierungs-Drip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein DB-getriebener, zeitgetriggerter 6-Mail-Onboarding-Drip, der frisch onboardete Werkstätten zur Aktivierung (erster Fall) führt und stoppt, sobald der erste Fall da ist.

**Architecture:** Zwei werkstatt-spezifische Tabellen (`werkstatt_onboarding_steps` = DB-editierbare Sequenz, `werkstatt_onboarding_enrollments` = Fortschritt je Werkstatt). Ein täglicher Cron scannt fällige Enrollments, prüft Stop-on-erster-Fall, löst Copy + Merge-Vars (inkl. dynamischem SV via `findeBestePerson`) auf, rendert eine react-email-Komponente und sendet transaktional via `sendEmail`. Copy/Timing leben in der DB (kein Deploy), Look/Struktur in react-email-Code.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + RLS), react-email (`@react-email/render`), zod, vitest. Cron via Route + VPS-crontab.

**Design-Spec:** `docs/superpowers/specs/2026-07-29-werkstatt-onboarding-drip-design.md` (verbindlich — jede Task setzt sie um).

## Global Constraints

- **Regel 1:** Nie direkt auf `main`. Feature-Branch `kitta/werkstatt-onboarding-drip` (existiert), PR gegen `staging`.
- **Regel 2 (DDL):** Jede Schema-Änderung via `mcp__plugin_supabase_supabase__apply_migration` → dann `list_migrations` → Version `<V>` ablesen → File committen als `supabase/migrations/<V>_<name>.sql` (Dateiname == getrackte Version). Kein raw `execute_sql`-DDL, keine CLI. Projekt-ID: `paizkjajbuxxksdoycev`.
- **Regel 4:** Nach Prod-Deploy voller Playwright/DB-Smoke (Task 16). Test-Werkstatt mit Test-Email — **nie** an echte Empfänger.
- **Umlaute:** Alle nutzersichtbaren Texte (Mail-Copy in Seed + Templates) mit echten `ä/ö/ü/ß`. Doc-/Code-Kommentare dürfen ASCII sein.
- **Neue CHECK-Werte zuerst per Migration in den CHECK, DANN in den flag-drift-Snapshot** (`status`, `template_key`) — sonst blockt `check:flag-drift` spätere Writes falsch (Task 3).
- **Neue Tabellen granten `authenticated` NICHTS automatisch** (Default-Privilege-Wurzel #4555) → explizite Grants nur für Staff-Lesen/-Schreiben, RLS `TO authenticated USING (is_staff())`, **nie `TO public`** (RLS-Policy-Gate).
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }`, kein `throw` (außer Auth-Guards). Non-critical Sends in try/catch.
- **Staff-Guard-Helper verifizieren:** die kanonische RLS-Staff-Funktion ist vor Task 1 zu bestätigen (`is_staff()` erwartet; falls anders benannt — `is_admin()`/o.ä. — konsistent verwenden). Ein READ: `select proname from pg_proc where proname in ('is_staff','is_admin','is_kundenbetreuer');`

---

## Task 1: Migration — `werkstatt_onboarding_steps` Tabelle

**Files:**
- Create (nach apply): `supabase/migrations/<V1>_werkstatt_onboarding_steps.sql`

**Interfaces:**
- Produces: Tabelle `public.werkstatt_onboarding_steps` mit Spalten `id, position, offset_tage, template_key, betreff, preheader, copy(jsonb), aktiv, erstellt_am, aktualisiert_am`.

- [ ] **Step 1: DDL via apply_migration**

`mcp__plugin_supabase_supabase__apply_migration({ project_id: 'paizkjajbuxxksdoycev', name: 'werkstatt_onboarding_steps', query: <DDL> })` mit:

```sql
create table public.werkstatt_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  position int not null unique check (position > 0),
  offset_tage int not null check (offset_tage >= 0),
  template_key text not null check (template_key = any (array[
    'willkommen','nutzen','sv_vorstellung','kundenstory','bonus','reaktivierung'])),
  betreff text not null,
  preheader text not null default '',
  copy jsonb not null default '{}'::jsonb,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
alter table public.werkstatt_onboarding_steps enable row level security;
grant select, update on public.werkstatt_onboarding_steps to authenticated;
create policy werkstatt_onboarding_steps_staff_ro on public.werkstatt_onboarding_steps
  for select to authenticated using (is_staff());
create policy werkstatt_onboarding_steps_staff_upd on public.werkstatt_onboarding_steps
  for update to authenticated using (is_staff()) with check (is_staff());
```

- [ ] **Step 2: Version ablesen + File committen**

`mcp__plugin_supabase_supabase__list_migrations` → Version `<V1>` von `werkstatt_onboarding_steps` ablesen. Das exakte DDL aus Step 1 in `supabase/migrations/<V1>_werkstatt_onboarding_steps.sql` schreiben.

- [ ] **Step 3: Verifizieren (READ)**

`execute_sql`: `select column_name, data_type from information_schema.columns where table_name='werkstatt_onboarding_steps' order by ordinal_position;`
Expected: 10 Spalten wie oben.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<V1>_werkstatt_onboarding_steps.sql
git commit -m "feat(werkstatt-onboarding): steps-Tabelle (DB-editierbare Sequenz)"
```

---

## Task 2: Migration — `werkstatt_onboarding_enrollments` Tabelle

**Files:**
- Create: `supabase/migrations/<V2>_werkstatt_onboarding_enrollments.sql`

**Interfaces:**
- Produces: Tabelle `public.werkstatt_onboarding_enrollments` (`id, werkstatt_id unique, aktueller_step, next_send_at, status, erstellt_am`) + Due-Scan-Index.

- [ ] **Step 1: DDL via apply_migration**

`apply_migration({ name: 'werkstatt_onboarding_enrollments', query: <DDL> })`:

```sql
create table public.werkstatt_onboarding_enrollments (
  id uuid primary key default gen_random_uuid(),
  werkstatt_id uuid not null unique references public.werkstaetten(id) on delete cascade,
  aktueller_step int not null default 0,
  next_send_at timestamptz,
  status text not null default 'aktiv' check (status = any (array[
    'aktiv','aktiviert','gestoppt','fertig'])),
  erstellt_am timestamptz not null default now()
);
alter table public.werkstatt_onboarding_enrollments enable row level security;
create index werkstatt_onboarding_enr_due_idx
  on public.werkstatt_onboarding_enrollments (next_send_at)
  where status = 'aktiv';
grant select on public.werkstatt_onboarding_enrollments to authenticated;
create policy werkstatt_onboarding_enr_staff_ro on public.werkstatt_onboarding_enrollments
  for select to authenticated using (is_staff());
```

Der Cron nutzt `service_role` (RLS-bypass) — kein authenticated-Write-Grant nötig.

- [ ] **Step 2: Version ablesen + File committen** — `list_migrations` → `<V2>`, File `supabase/migrations/<V2>_werkstatt_onboarding_enrollments.sql`.

- [ ] **Step 3: Verifizieren** — `execute_sql`: `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.werkstatt_onboarding_enrollments'::regclass;` → unique(werkstatt_id) + status-CHECK vorhanden.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<V2>_werkstatt_onboarding_enrollments.sql
git commit -m "feat(werkstatt-onboarding): enrollments-Tabelle + Due-Scan-Index"
```

---

## Task 3: Typen + flag-drift-Snapshot nachziehen

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (generiert)
- Modify: `scripts/lib/status-check-constraints.json`

**Interfaces:**
- Consumes: die CHECK-Spalten `werkstatt_onboarding_steps.template_key`, `werkstatt_onboarding_enrollments.status` aus Task 1/2.
- Produces: getypte Row-Interfaces + aktueller flag-drift-Snapshot (sonst blockt `check:flag-drift` Writes mit den neuen Literalen als „nicht im CHECK").

- [ ] **Step 1: Typen regenerieren**

```bash
SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
```

- [ ] **Step 2: flag-drift-Snapshot regenerieren**

```bash
node --env-file=.env.local scripts/build-flag-drift-snapshot.mjs
```
Expected: „geschrieben" mit `werkstatt_onboarding_steps.template_key` + `werkstatt_onboarding_enrollments.status` neu in `scripts/lib/status-check-constraints.json`.
(Falls das Script noch nicht gemergt ist: das Header-SQL aus `scripts/check-flag-drift.mjs` manuell laufen + die zwei Spalten in die `columns`-Map eintragen.)

- [ ] **Step 3: Gate grün prüfen**

```bash
node scripts/check-flag-drift.mjs --ratchet
```
Expected: `exit 0`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/database.types.ts scripts/lib/status-check-constraints.json
git commit -m "chore(werkstatt-onboarding): types + flag-drift-Snapshot fuer neue CHECKs"
```

---

## Task 4: Copy-Schemas + Template-Registry (zod, alle 6)

**Files:**
- Create: `src/lib/email/google/templates/aktivierung/copy-schemas.ts`
- Create: `src/lib/email/google/templates/aktivierung/types.ts`
- Test: `src/lib/email/google/templates/aktivierung/__tests__/copy-schemas.test.ts`

**Interfaces:**
- Produces: `WerkstattMergeVars` (types.ts) + `copySchemas` (Record<template_key, ZodType>) + `TEMPLATE_KEYS`. Später konsumiert von Templates (Task 5/6) + merge/send (Task 8/11).

- [ ] **Step 1: types.ts — Merge-Vars**

```ts
// src/lib/email/google/templates/aktivierung/types.ts
export type SvProfil = { name: string; region: string; photoUrl?: string; contact?: string }
export type WerkstattMergeVars = {
  werkstattName: string
  ansprechpartner: string   // Nicolas
  tel: string
  portalLink: string
  sv?: SvProfil | null      // nur fuer sv_vorstellung aufgeloest
}
export const TEMPLATE_KEYS = ['willkommen','nutzen','sv_vorstellung','kundenstory','bonus','reaktivierung'] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]
```

- [ ] **Step 2: Write failing test**

```ts
// __tests__/copy-schemas.test.ts
import { describe, it, expect } from 'vitest'
import { copySchemas } from '../copy-schemas'
describe('copySchemas', () => {
  it('nutzen: 4 Bloecke verlangt', () => {
    const bad = { headline: 'h', bloecke: [{ titel: 't', text: 'x' }], schluss: 's', cta_label: 'c' }
    expect(copySchemas.nutzen.safeParse(bad).success).toBe(false)
    const good = { headline: 'h', bloecke: Array.from({length:4},()=>({titel:'t',text:'x'})), schluss: 's', cta_label: 'c' }
    expect(copySchemas.nutzen.safeParse(good).success).toBe(true)
  })
  it('willkommen: Pflichtfelder', () => {
    expect(copySchemas.willkommen.safeParse({}).success).toBe(false)
  })
})
```

- [ ] **Step 3: Run — FAIL** (`npx vitest run src/lib/email/google/templates/aktivierung` → „copySchemas not defined").

- [ ] **Step 4: copy-schemas.ts implementieren**

```ts
// src/lib/email/google/templates/aktivierung/copy-schemas.ts
import { z } from 'zod'
const block = z.object({ titel: z.string(), text: z.string() })
export const copySchemas = {
  willkommen: z.object({ headline: z.string(), absaetze: z.array(z.string()).min(1), so_laeufts: z.array(z.string()).min(1), cta_label: z.string() }),
  nutzen: z.object({ headline: z.string(), bloecke: z.array(block).length(4), schluss: z.string(), cta_label: z.string() }),
  sv_vorstellung: z.object({ headline: z.string(), absaetze: z.array(z.string()).min(1), cta_label: z.string() }),
  kundenstory: z.object({ headline: z.string(), intro: z.string(), zitat: z.string(), schluss: z.array(z.string()).min(1), cta_label: z.string() }),
  bonus: z.object({ headline: z.string(), absaetze: z.array(z.string()).min(1), cta_label: z.string(), fussnote: z.string() }),
  reaktivierung: z.object({ headline: z.string(), intro: z.string(), punkte: z.array(z.string()).length(3), schluss: z.string(), cta_label: z.string() }),
} as const
export type CopyFor<K extends keyof typeof copySchemas> = z.infer<(typeof copySchemas)[K]>
```

- [ ] **Step 5: Run — PASS.** Commit:

```bash
git add src/lib/email/google/templates/aktivierung/
git commit -m "feat(werkstatt-onboarding): copy-schemas + merge-var-typen"
```

---

## Task 5: Template `SvVorstellung` (Mail 3, mit BeraterCard) + Registry-Anfang

**Files:**
- Create: `src/lib/email/google/templates/aktivierung/SvVorstellung.tsx`
- Create: `src/lib/email/google/templates/aktivierung/registry.ts`
- Test: `.../__tests__/SvVorstellung.test.tsx`

**Interfaces:**
- Consumes: `copySchemas.sv_vorstellung`, `WerkstattMergeVars`, `@/lib/email/components` (`EmailShell, Hero, Paragraph, Button, BeraterCard, Footer`).
- Produces: `SvVorstellungEmail({ copy, merge })` React-Komponente + `registry` (`Record<TemplateKey, { Component; copySchema }>`), zunächst nur `sv_vorstellung` befüllt (Task 6 füllt den Rest).

- [ ] **Step 1: Failing render test**

```tsx
// __tests__/SvVorstellung.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { SvVorstellungEmail } from '../SvVorstellung'
describe('SvVorstellungEmail', () => {
  it('rendert SV-Namen + Region aus merge.sv', async () => {
    const html = await render(SvVorstellungEmail({
      copy: { headline: 'Dein Gutachter in [Region]', absaetze: ['a1'], cta_label: 'Ersten Fall anlegen' },
      merge: { werkstattName: 'W', ansprechpartner: 'Nicolas', tel: '+49', portalLink: 'https://x',
        sv: { name: 'Kelvin Gall', region: 'Köln', contact: '+49 221' } },
    }))
    expect(html).toContain('Kelvin Gall'); expect(html).toContain('Köln')
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Komponente implementieren**

```tsx
// SvVorstellung.tsx
import { EmailShell, Hero, Paragraph, Button, BeraterCard, Footer } from '@/lib/email/components'
import type { WerkstattMergeVars } from './types'
import type { CopyFor } from './copy-schemas'
export function SvVorstellungEmail({ copy, merge }: { copy: CopyFor<'sv_vorstellung'>; merge: WerkstattMergeVars }) {
  return (
    <EmailShell preheader={merge.werkstattName}>
      <Hero>{copy.headline.replace('[Region]', merge.sv?.region ?? '')}</Hero>
      {merge.sv && <BeraterCard name={merge.sv.name} photoUrl={merge.sv.photoUrl} contact={merge.sv.contact ?? ''} label={`Dein Gutachter in ${merge.sv.region}`} />}
      {copy.absaetze.map((a, i) => <Paragraph key={i}>{a.replace('[Gutachter-Name]', merge.sv?.name ?? '')}</Paragraph>)}
      <Button href={merge.portalLink}>{copy.cta_label}</Button>
      <Footer ansprechpartner={merge.ansprechpartner} tel={merge.tel} />
    </EmailShell>
  )
}
export function subject(copy: CopyFor<'sv_vorstellung'>, merge: WerkstattMergeVars) {
  return `Dein Gutachter in ${merge.sv?.region ?? 'deiner Region'}: ${merge.sv?.name ?? ''}`.trim()
}
```

> **Hinweis Bausteine:** die exakten Prop-Namen von `EmailShell/Hero/Paragraph/Button/BeraterCard/Footer` aus `src/lib/email/components/index.ts` bestätigen (Spec §12); `BeraterCard`-Props sind `{ name, photoUrl?, contact, label }` (Spec §B8). Falls ein Baustein anders heißt (`Card`/`Text` statt `Paragraph`), konsistent anpassen.

- [ ] **Step 4: registry.ts**

```ts
// registry.ts
import { copySchemas } from './copy-schemas'
import { SvVorstellungEmail, subject as svSubject } from './SvVorstellung'
export const registry = {
  sv_vorstellung: { Component: SvVorstellungEmail, copySchema: copySchemas.sv_vorstellung, subject: svSubject },
  // willkommen/nutzen/kundenstory/bonus/reaktivierung: Task 6
} as const
```

- [ ] **Step 5: Run — PASS.** Commit `feat(werkstatt-onboarding): SvVorstellung-Template (BeraterCard) + registry`.

---

## Task 6: Templates `Willkommen`, `Nutzen`, `Kundenstory`, `Bonus`, `Reaktivierung`

**Files:**
- Create: `.../Willkommen.tsx`, `.../Nutzen.tsx`, `.../Kundenstory.tsx`, `.../Bonus.tsx`, `.../Reaktivierung.tsx`
- Modify: `.../registry.ts` (alle 5 eintragen)
- Test: `.../__tests__/templates-render.test.tsx`

**Interfaces:**
- Consumes: `copySchemas`, `WerkstattMergeVars`, Bausteine wie Task 5.
- Produces: 5 `*Email({ copy, merge })`-Komponenten + vollständige `registry` (alle 6 `TemplateKey`).

- [ ] **Step 1: Failing test (registry vollständig + jede rendert)**

```tsx
// __tests__/templates-render.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { registry } from '../registry'
import { TEMPLATE_KEYS } from '../types'
const mergeBase = { werkstattName: 'Muster GmbH', ansprechpartner: 'Nicolas', tel: '+49 170', portalLink: 'https://app.claimondo.de/werkstatt', sv: null }
describe('registry', () => {
  it('hat alle 6 Keys', () => { for (const k of TEMPLATE_KEYS) expect(registry[k]).toBeDefined() })
  it('jede Vorlage rendert mit Default-Copy + Werkstattnamen', async () => {
    for (const k of TEMPLATE_KEYS) {
      if (k === 'sv_vorstellung') continue
      const { Component, copySchema } = registry[k]
      const copy = copySchema.parse(DEFAULT_COPY[k])
      const html = await render(Component({ copy, merge: mergeBase }))
      expect(html).toContain('Muster GmbH')
    }
  })
})
// DEFAULT_COPY: minimal-valide Copy je Key (aus copy-schemas abgeleitet) — im Test inline definieren.
```

Definiere `DEFAULT_COPY` inline im Test: je Key ein minimal-valides Objekt (z. B. `nutzen`: `{ headline:'x', bloecke:[4×{titel,text}], schluss:'x', cta_label:'x' }`). Jede Komponente muss `merge.werkstattName` irgendwo ausgeben (Anrede „Hallo [Name]" → `Hallo ${merge.werkstattName}`).

- [ ] **Step 2: Run — FAIL** (Komponenten/registry-Einträge fehlen).

- [ ] **Step 3: Die 5 Komponenten implementieren** (Muster exakt wie `SvVorstellung.tsx` Task 5, aber ohne BeraterCard):
  - `Willkommen`: `Hero(copy.headline)` + Anrede `Hallo ${merge.werkstattName}` + `copy.absaetze` als `Paragraph` + `copy.so_laeufts` als Liste + `Button(href=merge.portalLink)` (CTA: „Bei Fragen anrufen" → `href=tel:${merge.tel}`) + `Footer`.
  - `Nutzen`: Anrede + `copy.bloecke.map` (Titel fett + Text) + `copy.schluss` + `Button(portalLink)`.
  - `Kundenstory`: Anrede + `copy.intro` + Zitat-Block (`copy.zitat`, kursiv/eingerückt) + `copy.schluss` + `Button`.
  - `Bonus`: Anrede + `copy.absaetze` + `Button(portalLink)` + `copy.fussnote` (klein, grau).
  - `Reaktivierung`: Anrede + `copy.intro` + `copy.punkte` (nummeriert) + `copy.schluss` + `Button`.
  Jede exportiert zusätzlich `subject(copy, merge)` (Default = ein sinnvoller Betreff; im Betrieb überschreibt `steps.betreff`).

- [ ] **Step 4: registry.ts komplettieren** (alle 5 importieren + eintragen, analog Task-5-Muster).

- [ ] **Step 5: Run — PASS.** Commit `feat(werkstatt-onboarding): 5 restliche Aktivierungs-Templates + registry komplett`.

---

## Task 7: Seed-Migration — die 6 Steps

**Files:**
- Create: `supabase/migrations/<V3>_werkstatt_onboarding_seed.sql`

**Interfaces:**
- Consumes: `werkstatt_onboarding_steps` (Task 1) + die `copy`-Struktur je `template_key` (Task 4-Schemas).
- Produces: 6 Zeilen — die versandfertige Sequenz.

- [ ] **Step 1: Seed-DDL via apply_migration**

`apply_migration({ name: 'werkstatt_onboarding_seed', query: <INSERT> })`. Copy-`jsonb` je Zeile passend zum jeweiligen `copySchema`, Texte 1:1 aus dem Markdown (echte Umlaute, du-Form, `{{werkstattName}}`/`[Region]`/`[Gutachter-Name]`-Platzhalter wo im Design vorgesehen). Struktur:

```sql
insert into public.werkstatt_onboarding_steps (position, offset_tage, template_key, betreff, preheader, copy, aktiv) values
(1, 0,  'willkommen',    'Willkommen bei Claimondo – so startet dein erster Fall', 'Kein Aufwand für dich – dein Kunde scannt, wir übernehmen den Rest.', $$ {"headline":"Willkommen bei Claimondo","absaetze":["willkommen bei Claimondo – schön, dass du dabei bist. Dein Zugang ist freigeschaltet, und dein QR-Aufsteller steht bereits bei dir an der Theke.","Ab jetzt kann jeder Kunde mit einem Haftpflichtschaden seinen Fall selbst starten: Er scannt einfach den Code auf dem Aufsteller, gibt seine Daten ein – wir übernehmen die komplette Abwicklung.","Und kurz zu mir: Ich bin Nicolas, dein persönlicher Ansprechpartner. Bei allen Fragen einfach direkt anrufen."],"so_laeufts":["Standard: Kunde scannt den Aufsteller → Fall startet automatisch","Optional: du legst den Fall selbst im Portal an (Kundendaten · Termin · Besichtigungsort)"],"cta_label":"Bei Fragen anrufen"} $$::jsonb, true),
(2, 3,  'nutzen',        'Deine Rechnung – voll, nicht gekürzt', 'Volles Honorar, der Auftrag bleibt bei dir, der Kunde ist versorgt.', $$ {"headline":"Warum sich dein erster Fall konkret rechnet","bloecke":[{"titel":"Dein Honorar ist abgesichert.","text":"Das Werkstattrisiko tragen unsere Anwälte – deine Rechnung wird in voller Höhe durchgesetzt."},{"titel":"Der Auftrag bleibt bei dir.","text":"Kein Weglenken zur Partnerwerkstatt der Versicherung – der Kunde repariert bei dir."},{"titel":"Dein Kunde ist versorgt.","text":"Nutzungsausfall oder Mietwagen holen wir für ihn raus – ohne dass du dich kümmern musst."},{"titel":"Wir bringen dir zusätzliche Aufträge.","text":"Bei freier Kapazität steuern wir Schäden aus unserem Netzwerk gezielt in deine Werkstatt."}],"schluss":"Der nächste Haftpflichtschaden, der bei dir reinkommt, ist der perfekte erste Fall.","cta_label":"Ersten Fall anlegen"} $$::jsonb, true),
(3, 6,  'sv_vorstellung','Dein Gutachter in [Region]: [Gutachter-Name]', 'Ein echter Sachverständiger vor Ort – direkt erreichbar.', $$ {"headline":"Dein Gutachter in [Region]: [Gutachter-Name]","absaetze":["viele Werkstätten fragen sich zu Recht: „Wer begutachtet eigentlich meine Schäden?\" Deshalb stelle ich dir kurz [Gutachter-Name] vor.","[Gutachter-Name] ist unser Sachverständiger für [Region] – vor Ort, direkt erreichbar, und erstellt einen KVA meist innerhalb von 24 Stunden.","Sobald ein Fall angelegt ist, kommt [Gutachter-Name] zur Besichtigung am vereinbarten Ort."],"cta_label":"Ersten Fall anlegen"} $$::jsonb, true),
(4, 9,  'kundenstory',   '„Ich musste mich um nichts kümmern" – wie deine Kunden das erleben', 'Eine kurze Kundenstory – und was sie über deine Werkstatt sagt.', $$ {"headline":"Wie sich Claimondo für deine Kunden anfühlt","intro":"Ein Kunde hatte einen unverschuldeten Unfall. An der Theke sah er den QR-Aufsteller, scannte ihn und gab in wenigen Minuten seine Daten ein. Den Rest hat Claimondo übernommen – Gutachter, Anwalt, Mietwagen, Nutzungsausfall.","zitat":"Ich dachte, so ein Unfall bedeutet wochenlangen Papierkram. Stattdessen habe ich einen Code gescannt und mich um gar nichts kümmern müssen. Dass meine Werkstatt sowas Modernes anbietet, hat mich echt überrascht.","schluss":["Der Aufsteller regelt nicht nur den Schaden – er lässt deine Werkstatt modern und professionell dastehen.","Und für dich ist es denkbar einfach: Der Aufsteller steht schon an der Theke – dein Kunde scannt, fertig."],"cta_label":"Bei Fragen anrufen"} $$::jsonb, true),
(5, 13, 'bonus',         '200 € für deinen ersten Fall ab 4.000 €', 'Kleiner Anschub für den Start – für den ersten Fall in 30 Tagen.', $$ {"headline":"Ein Anschub für deinen Start","absaetze":["Für deinen ersten Haftpflichtfall mit einer Schadenhöhe ab 4.000 € schreiben wir dir 200 € als Aufwandsentschädigung für die Schadenaufnahme gut.","Das gilt für den ersten Fall, den du in den nächsten 30 Tagen anlegst."],"cta_label":"Fall anlegen & 200 € sichern","fussnote":"Aufwandsentschädigung für die dokumentierte Schadenaufnahme."} $$::jsonb, false),
(6, 20, 'reaktivierung', 'Noch keinen Fall? Meist ist es nur eine Kleinigkeit', 'Meist reicht ein kurzer Hinweis an den Kunden.', $$ {"headline":"Noch keinen Fall? Meist ist es nur eine Kleinigkeit","intro":"du bist seit ein paar Wochen dabei, aber ich sehe noch keinen Fall von dir – kein Problem. Das liegt fast immer an einer von drei Kleinigkeiten:","punkte":["Es kam noch kein passender Haftpflichtschaden – völlig normal.","Die Kunden nutzen den Aufsteller noch nicht von allein – ein kurzer Hinweis wirkt Wunder.","Eine Frage ist offen – dann ruf mich einfach an."],"schluss":"Was trifft's bei dir? Ein kurzer Anruf oder eine kurze Antwort genügt.","cta_label":"Ersten Fall zusammen machen"} $$::jsonb, true);
```

**Bonus-Step (position 5) startet `aktiv=false`** (Legal-Gate).

- [ ] **Step 2: Version ablesen + File committen** — `list_migrations` → `<V3>`, File `supabase/migrations/<V3>_werkstatt_onboarding_seed.sql`.

- [ ] **Step 3: Verifizieren** — `execute_sql`: `select position, offset_tage, template_key, aktiv from werkstatt_onboarding_steps order by position;` → 6 Zeilen, position 5 `aktiv=false`. Zusätzlich je Zeile: `copy` gegen das jeweilige `copySchema` in einem Node-Snippet parsen (Sicherheit, dass Seed-JSON valide ist).

- [ ] **Step 4: Commit** `feat(werkstatt-onboarding): Seed der 6 Aktivierungs-Steps (Bonus aus)`.

---

## Task 8: `hatErstenFall` — Stop-Signal

**Files:**
- Create: `src/lib/werkstatt-onboarding/erster-fall.ts`
- Test: `src/lib/werkstatt-onboarding/__tests__/erster-fall.test.ts`

**Interfaces:**
- Produces: `hatErstenFall(db, werkstattId): Promise<boolean>` — true bei ≥1 `partner_provisionen`(partner_typ='werkstatt') ODER ≥1 `claims.reparatur_werkstatt_id`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { hatErstenFall } from '../erster-fall'
function mockDb(provCount: number, claimCount: number) {
  const head = (count: number) => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ count }) }) }) })
  return { from: (t: string) => (t === 'partner_provisionen' ? head(provCount) : { select: () => ({ eq: () => Promise.resolve({ count: claimCount }) }) }) } as any
}
describe('hatErstenFall', () => {
  it('true bei Provision', async () => { expect(await hatErstenFall(mockDb(1,0), 'w')).toBe(true) })
  it('true bei reparatur_werkstatt_id', async () => { expect(await hatErstenFall(mockDb(0,1), 'w')).toBe(true) })
  it('false ohne beides', async () => { expect(await hatErstenFall(mockDb(0,0), 'w')).toBe(false) })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implementieren**

```ts
// erster-fall.ts
import type { SupabaseClient } from '@supabase/supabase-js'
export async function hatErstenFall(db: SupabaseClient, werkstattId: string): Promise<boolean> {
  const { count: prov } = await db.from('partner_provisionen')
    .select('id', { count: 'exact', head: true })
    .eq('partner_typ', 'werkstatt').eq('partner_id', werkstattId)
  if ((prov ?? 0) > 0) return true
  const { count: claim } = await db.from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('reparatur_werkstatt_id', werkstattId)
  return (claim ?? 0) > 0
}
```

- [ ] **Step 4: Run — PASS.** Commit `feat(werkstatt-onboarding): hatErstenFall Stop-Signal`.

---

## Task 9: `advance` — nächster aktiver Step + next_send_at (pure)

**Files:**
- Create: `src/lib/werkstatt-onboarding/advance.ts`
- Test: `src/lib/werkstatt-onboarding/__tests__/advance.test.ts`

**Interfaces:**
- Consumes: Step-Shape `{ position: number; offset_tage: number; aktiv: boolean }`.
- Produces: `naechsterAktiverStep(steps, aktuellerStep): Step | null` · `berechneNextSendAt(aktiviertAm: Date, step): Date`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { naechsterAktiverStep, berechneNextSendAt } from '../advance'
const steps = [
  { position: 1, offset_tage: 0, aktiv: true },
  { position: 2, offset_tage: 3, aktiv: true },
  { position: 5, offset_tage: 13, aktiv: false }, // Bonus aus
  { position: 6, offset_tage: 20, aktiv: true },
]
describe('advance', () => {
  it('ueberspringt inaktive Steps', () => {
    expect(naechsterAktiverStep(steps, 2)?.position).toBe(6) // 5 ist aktiv=false
  })
  it('null wenn keiner mehr', () => { expect(naechsterAktiverStep(steps, 6)).toBeNull() })
  it('absolute next_send_at ab aktiviert_am', () => {
    const t0 = new Date('2026-01-01T00:00:00Z')
    expect(berechneNextSendAt(t0, { position: 2, offset_tage: 3, aktiv: true }).toISOString()).toBe('2026-01-04T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implementieren**

```ts
// advance.ts
export type StepLite = { position: number; offset_tage: number; aktiv: boolean }
const TAG_MS = 24 * 60 * 60 * 1000
export function naechsterAktiverStep<T extends StepLite>(steps: T[], aktuellerStep: number): T | null {
  return steps.filter(s => s.aktiv && s.position > aktuellerStep).sort((a, b) => a.position - b.position)[0] ?? null
}
export function berechneNextSendAt(aktiviertAm: Date, step: StepLite): Date {
  return new Date(aktiviertAm.getTime() + step.offset_tage * TAG_MS)
}
```

- [ ] **Step 4: Run — PASS.** Commit `feat(werkstatt-onboarding): advance (absolute offsets + step-skipping)`.

---

## Task 10: `buildWerkstattMergeVars` + SV-Resolver-Adapter

**Files:**
- Create: `src/lib/werkstatt-onboarding/merge-vars.ts`
- Test: `src/lib/werkstatt-onboarding/__tests__/merge-vars.test.ts`

**Interfaces:**
- Consumes: `WerkstattMergeVars` (Task 4), `findeBestePerson`/`toOeffentlichesSvProfil` (`@/lib/termine/engine` bzw. `@/lib/sv-matching-modul`), eine Werkstatt-Row (`{ id, name, adresse_ort, lat, lng }`).
- Produces: `buildWerkstattMergeVars({ db, werkstatt, templateKey, config }): Promise<WerkstattMergeVars>` — löst `sv` **nur** für `sv_vorstellung` auf; `sv=null` wenn kein Match.

- [ ] **Step 1: Failing test** (SV-Auflösung nur bei sv_vorstellung; Fallback null)

```ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/termine/engine', () => ({ findeBestePerson: vi.fn() }))
vi.mock('@/lib/sv-matching-modul', () => ({ toOeffentlichesSvProfil: vi.fn() }))
import { findeBestePerson } from '@/lib/termine/engine'
import { toOeffentlichesSvProfil } from '@/lib/sv-matching-modul'
import { buildWerkstattMergeVars } from '../merge-vars'
const wk = { id: 'w1', name: 'Muster GmbH', adresse_ort: 'Köln', lat: 50.9, lng: 6.9 }
const config = { ansprechpartner: 'Nicolas', tel: '+49 170', portalBaseUrl: 'https://app.claimondo.de' }
describe('buildWerkstattMergeVars', () => {
  it('loest SV NUR bei sv_vorstellung', async () => {
    ;(findeBestePerson as any).mockResolvedValue({ candidate: {} })
    ;(toOeffentlichesSvProfil as any).mockReturnValue({ name: 'Kelvin Gall', region: 'Köln' })
    const nutzen = await buildWerkstattMergeVars({ db: {} as any, werkstatt: wk, templateKey: 'nutzen', config })
    expect(nutzen.sv).toBeUndefined()
    expect(findeBestePerson).not.toHaveBeenCalled()
    const sv = await buildWerkstattMergeVars({ db: {} as any, werkstatt: wk, templateKey: 'sv_vorstellung', config })
    expect(sv.sv?.name).toBe('Kelvin Gall'); expect(sv.werkstattName).toBe('Muster GmbH')
  })
  it('sv=null wenn kein Match', async () => {
    ;(findeBestePerson as any).mockResolvedValue(null)
    const sv = await buildWerkstattMergeVars({ db: {} as any, werkstatt: wk, templateKey: 'sv_vorstellung', config })
    expect(sv.sv).toBeNull()
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implementieren** (⚠ die genaue Signatur von `findeBestePerson` beim Bau gegen `@/lib/termine/engine` prüfen — Input-Shape „Standort/Bezug"; hier Adapter aus `werkstatt.lat/lng/adresse_ort`. `toOeffentlichesSvProfil` liefert die leak-sichere `{name, region, photoUrl?, contact?}`-Projektion.)

```ts
// merge-vars.ts
import { findeBestePerson } from '@/lib/termine/engine'
import { toOeffentlichesSvProfil } from '@/lib/sv-matching-modul'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WerkstattMergeVars, TemplateKey } from '@/lib/email/google/templates/aktivierung/types'
export type WerkstattRow = { id: string; name: string; adresse_ort: string | null; lat: number | null; lng: number | null }
export type DripConfig = { ansprechpartner: string; tel: string; portalBaseUrl: string }
export async function buildWerkstattMergeVars(args: {
  db: SupabaseClient; werkstatt: WerkstattRow; templateKey: TemplateKey; config: DripConfig
}): Promise<WerkstattMergeVars> {
  const { db, werkstatt, templateKey, config } = args
  const base: WerkstattMergeVars = {
    werkstattName: werkstatt.name, ansprechpartner: config.ansprechpartner, tel: config.tel,
    portalLink: `${config.portalBaseUrl}/werkstatt`,
  }
  if (templateKey !== 'sv_vorstellung') return base
  // Standort → bester SV (Adapter-Input beim Bau an findeBestePerson angleichen)
  const match = await findeBestePerson({ db, standort: { lat: werkstatt.lat, lng: werkstatt.lng, ort: werkstatt.adresse_ort }, modus: 'nur_vorschlagen' } as any).catch(() => null)
  const profil = match ? toOeffentlichesSvProfil(match) : null
  return { ...base, sv: profil ? { name: profil.name, region: profil.region, photoUrl: profil.photoUrl, contact: profil.contact } : null }
}
```

- [ ] **Step 4: Run — PASS.** Commit `feat(werkstatt-onboarding): merge-vars + dynamischer SV-Resolver`.

---

## Task 11: `sendeStep` — einen Step rendern + senden

**Files:**
- Create: `src/lib/werkstatt-onboarding/send-step.ts`
- Test: `src/lib/werkstatt-onboarding/__tests__/send-step.test.ts`

**Interfaces:**
- Consumes: `registry` (Task 5/6), `sendEmail` (`@/lib/email/google/client`), `render` (`@react-email/render`).
- Produces: `sendeStep({ empfaengerEmail, step, merge }): Promise<{ ok: boolean; skipped?: 'kein_sv' | 'copy_invalid'; error?: string }>`.

- [ ] **Step 1: Failing test** (skip bei sv_vorstellung ohne SV; skip bei invalider Copy; sonst sendEmail-Aufruf)

```ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/email/google/client', () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true }) }))
import { sendEmail } from '@/lib/email/google/client'
import { sendeStep } from '../send-step'
const stepSv = { position: 3, template_key: 'sv_vorstellung', betreff: 'B', preheader: 'P', copy: { headline: 'h', absaetze: ['a'], cta_label: 'c' } }
const merge = { werkstattName: 'W', ansprechpartner: 'N', tel: '+49', portalLink: 'https://x' }
describe('sendeStep', () => {
  it('skip kein_sv bei sv_vorstellung ohne merge.sv', async () => {
    const r = await sendeStep({ empfaengerEmail: 'w@test.de', step: stepSv as any, merge: { ...merge, sv: null } })
    expect(r.skipped).toBe('kein_sv'); expect(sendEmail).not.toHaveBeenCalled()
  })
  it('sendet sonst', async () => {
    const r = await sendeStep({ empfaengerEmail: 'w@test.de', step: stepSv as any, merge: { ...merge, sv: { name: 'K', region: 'Köln' } } })
    expect(r.ok).toBe(true); expect(sendEmail).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implementieren**

```ts
// send-step.ts
import { render } from '@react-email/render'
import { sendEmail } from '@/lib/email/google/client'
import { registry } from '@/lib/email/google/templates/aktivierung/registry'
import type { WerkstattMergeVars } from '@/lib/email/google/templates/aktivierung/types'
export async function sendeStep(args: {
  empfaengerEmail: string
  step: { position: number; template_key: keyof typeof registry; betreff: string; preheader: string; copy: unknown }
  merge: WerkstattMergeVars
}): Promise<{ ok: boolean; skipped?: 'kein_sv' | 'copy_invalid'; error?: string }> {
  const { empfaengerEmail, step, merge } = args
  if (step.template_key === 'sv_vorstellung' && !merge.sv) return { ok: true, skipped: 'kein_sv' }
  const entry = registry[step.template_key]
  const parsed = entry.copySchema.safeParse(step.copy)
  if (!parsed.success) { console.error('[werkstatt-onboarding] copy invalid', step.position, parsed.error.message); return { ok: false, skipped: 'copy_invalid' } }
  const html = await render(entry.Component({ copy: parsed.data as any, merge }))
  const res = await sendEmail({
    to: empfaengerEmail, subject: step.betreff, html,
    template: `werkstatt_aktivierung_${step.template_key}`,
    fromName: merge.ansprechpartner, listUnsubscribe: true,
  } as any)
  return res?.ok === false ? { ok: false, error: res.error } : { ok: true }
}
```

> **Hinweis:** `sendEmail`-Optionsnamen (`fromName`/`from`, `listUnsubscribe`) beim Bau gegen `src/lib/email/google/client.ts` bestätigen (Spec §B6).

- [ ] **Step 4: Run — PASS.** Commit `feat(werkstatt-onboarding): sendeStep (render + sendEmail, skip-Faelle)`.

---

## Task 12: `enrolleWerkstatt` (idempotent) + Trigger-Verdrahtung

**Files:**
- Create: `src/lib/werkstatt-onboarding/enroll.ts`
- Test: `src/lib/werkstatt-onboarding/__tests__/enroll.test.ts`
- Modify: `src/app/admin/partner-leads/actions.ts` (nach `konvertierePartnerLead`-Freischaltung)
- Modify: `src/app/werkstatt/registrieren/actions.ts`
- Modify: `src/app/admin/werkstaetten/actions.ts`

**Interfaces:**
- Consumes: `werkstatt_onboarding_steps` (position 1 → offset 0).
- Produces: `enrolleWerkstatt(db, werkstattId): Promise<{ ok: boolean }>` — idempotenter Upsert (`on conflict (werkstatt_id) do nothing`); `next_send_at = now + step1.offset_tage`. **Sequenz-Anker = `erstellt_am` (DB-Default now)** — der Cron rechnet Folge-Offsets dagegen; damit sind Onboarding UND Backfill (Task 16) identisch (Anker = Enroll-Zeit, nicht altes `aktiviert_am`).

- [ ] **Step 1: Failing test** (idempotent — Upsert mit ignoreDuplicates)

```ts
import { describe, it, expect, vi } from 'vitest'
import { enrolleWerkstatt } from '../enroll'
function mockDb(step1Offset = 0) {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  return { _upsert: upsert, from: (t: string) => t === 'werkstatt_onboarding_steps'
    ? { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { offset_tage: step1Offset } }) }) }) }
    : { upsert } } as any
}
describe('enrolleWerkstatt', () => {
  it('upsert on conflict do nothing', async () => {
    const db = mockDb(0)
    const r = await enrolleWerkstatt(db, 'w1')
    expect(r.ok).toBe(true)
    expect(db._upsert).toHaveBeenCalledWith(expect.objectContaining({ werkstatt_id: 'w1', aktueller_step: 0, status: 'aktiv' }), expect.objectContaining({ onConflict: 'werkstatt_id', ignoreDuplicates: true }))
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implementieren**

```ts
// enroll.ts
import type { SupabaseClient } from '@supabase/supabase-js'
export async function enrolleWerkstatt(db: SupabaseClient, werkstattId: string): Promise<{ ok: boolean }> {
  const { data: step1 } = await db.from('werkstatt_onboarding_steps').select('offset_tage').eq('position', 1).single()
  const offset = step1?.offset_tage ?? 0
  const nextSend = new Date(Date.now() + offset * 86400000)  // Anker = jetzt (= erstellt_am DB-Default)
  const { error } = await db.from('werkstatt_onboarding_enrollments')
    .upsert({ werkstatt_id: werkstattId, aktueller_step: 0, next_send_at: nextSend.toISOString(), status: 'aktiv' },
            { onConflict: 'werkstatt_id', ignoreDuplicates: true })
  return { ok: !error }
}
```

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: An 3 Onboarding-Punkten aufrufen** — jeweils NACH dem erfolgreichen Setzen von `werkstaetten.status='aktiv'`, non-critical (try/catch, Fehler nur loggen — ein Enroll-Fehler darf das Onboarding nicht brechen):

```ts
try { const { enrolleWerkstatt } = await import('@/lib/werkstatt-onboarding/enroll'); await enrolleWerkstatt(admin, werkstattId) } catch (e) { console.error('[enroll] werkstatt-onboarding', e) }
```
Einfügen in: `konvertierePartnerLead` (`admin/partner-leads/actions.ts`), Self-Register (`werkstatt/registrieren/actions.ts`), Admin-Anlage (`admin/werkstaetten/actions.ts`) — genaue Zeile: direkt nach dem `werkstaetten`-Insert/Update mit `status:'aktiv'`.

- [ ] **Step 6: Build grün** (`npm run build` — Server-Actions-Routen-Validierung). Commit `feat(werkstatt-onboarding): enrolleWerkstatt + Trigger an 3 Onboarding-Punkten`.

---

## Task 13: Cron-Route `werkstatt-onboarding-drip`

**Files:**
- Create: `src/app/api/cron/werkstatt-onboarding-drip/route.ts`
- Modify: `docs/…/vps-crontab.md` (crontab-Eintrag dokumentieren)

**Interfaces:**
- Consumes: `assertCronAuth`, `createAdminClient`, `hatErstenFall` (T8), `naechsterAktiverStep`/`berechneNextSendAt` (T9), `buildWerkstattMergeVars` (T10), `sendeStep` (T11), `cold_mail_suppression`.
- Produces: HTTP-Route (täglich getriggert), die fällige Enrollments abarbeitet.

- [ ] **Step 1: Route implementieren** (die pure Logik ist in T8–T11 getestet; die Route ist der dünne Orchestrator)

```ts
// route.ts
import { assertCronAuth } from '@/lib/cron/auth'   // exakten Pfad gegen bestehende Crons verifizieren
import { createAdminClient } from '@/lib/supabase/admin'
import { hatErstenFall } from '@/lib/werkstatt-onboarding/erster-fall'
import { naechsterAktiverStep, berechneNextSendAt } from '@/lib/werkstatt-onboarding/advance'
import { buildWerkstattMergeVars } from '@/lib/werkstatt-onboarding/merge-vars'
import { sendeStep } from '@/lib/werkstatt-onboarding/send-step'
const BATCH_CAP = 100
const CONFIG = { ansprechpartner: 'Nicolas Kitta', tel: process.env.WERKSTATT_ANSPRECHPARTNER_TEL ?? '', portalBaseUrl: 'https://app.claimondo.de' }
export async function GET(req: Request) {
  const auth = assertCronAuth(req); if (!auth.ok) return auth.response
  const db = createAdminClient()
  const jetzt = new Date()
  const { data: due } = await db.from('werkstatt_onboarding_enrollments')
    .select('id, werkstatt_id, aktueller_step, erstellt_am, werkstaetten!inner(id, name, email, adresse_ort, lat, lng)')
    .eq('status', 'aktiv').lte('next_send_at', jetzt.toISOString()).limit(BATCH_CAP)
  const { data: steps } = await db.from('werkstatt_onboarding_steps').select('*').order('position')
  let gesendet = 0, gestoppt = 0
  for (const e of due ?? []) {
    const wk = Array.isArray(e.werkstaetten) ? e.werkstaetten[0] : e.werkstaetten
    if (await hatErstenFall(db, e.werkstatt_id)) {
      await db.from('werkstatt_onboarding_enrollments').update({ status: 'aktiviert', next_send_at: null }).eq('id', e.id); gestoppt++; continue
    }
    if (wk.email) {
      const { count } = await db.from('cold_mail_suppression').select('email', { count: 'exact', head: true }).eq('email', wk.email)
      if ((count ?? 0) > 0) { await db.from('werkstatt_onboarding_enrollments').update({ status: 'gestoppt', next_send_at: null }).eq('id', e.id); continue }
    }
    let cursor = e.aktueller_step
    // naechsten sendbaren Step finden (skip inaktiv + skip sv ohne Match)
    for (;;) {
      const step = naechsterAktiverStep(steps ?? [], cursor)
      if (!step) { await db.from('werkstatt_onboarding_enrollments').update({ status: 'fertig', next_send_at: null }).eq('id', e.id); break }
      const merge = await buildWerkstattMergeVars({ db, werkstatt: wk, templateKey: step.template_key, config: CONFIG })
      const res = await sendeStep({ empfaengerEmail: wk.email, step, merge })
      const naechster = naechsterAktiverStep(steps ?? [], step.position)
      // Anker = enrollment.erstellt_am (Sequenz-Start) — NICHT werkstaetten.aktiviert_am
      // (sonst feuern Backfill-Enrollments alle Offsets sofort, s. Task 16).
      const patch = naechster
        ? { aktueller_step: step.position, next_send_at: berechneNextSendAt(new Date(e.erstellt_am), naechster).toISOString() }
        : { aktueller_step: step.position, status: 'fertig' as const, next_send_at: null }
      await db.from('werkstatt_onboarding_enrollments').update(patch).eq('id', e.id)
      if (res.skipped === 'kein_sv') { cursor = step.position; continue }  // SV-Mail uebersprungen → direkt naechsten versuchen
      if (res.ok && !res.skipped) gesendet++
      break
    }
  }
  return Response.json({ ok: true, gesendet, gestoppt, faellig: due?.length ?? 0 })
}
```

> **Verifizieren beim Bau:** exakte Pfade `assertCronAuth` + `createAdminClient` + der Nested-Select-Join zu `werkstaetten` (Array-vs-Objekt via `Array.isArray` normalisieren — AGENTS.md Nested-FK-Regel, hier bereits gemacht). `werkstaetten.email`-Spalte bestätigen (sonst Kontakt-Feld anpassen).

- [ ] **Step 2: Build grün** (`npm run build` — Route-Validierung).

- [ ] **Step 3: crontab-Eintrag** dokumentieren (Etc/UTC, täglich früh, Muster `send-lead-reminders`): `0 6 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/werkstatt-onboarding-drip`.

- [ ] **Step 4: Commit** `feat(werkstatt-onboarding): taeglicher Drip-Cron + crontab-Eintrag`.

---

## Task 14: Admin-Edit-Seite (MVP-minimal)

**Files:**
- Create: `src/app/admin/vertrieb/werkstatt-onboarding/page.tsx`
- Create: `src/app/admin/vertrieb/werkstatt-onboarding/actions.ts`

**Interfaces:**
- Consumes: `werkstatt_onboarding_steps` (RLS staff-update), `copySchemas` (Validierung).
- Produces: Liste der 6 Steps mit editierbarem `betreff`, `preheader`, `offset_tage`, `aktiv`-Toggle + Copy-Slots (Textareas je `copySchema`-Feld). Save-Action validiert gegen `copySchemas` und schreibt zurück.

- [ ] **Step 1: Server-Action `updateStep`** (Result-Object, zod-Validierung gegen das template-`copySchema`, RLS erzwingt Staff):

```ts
'use server'
// actions.ts
import { createClient } from '@/lib/supabase/server'
import { copySchemas } from '@/lib/email/google/templates/aktivierung/copy-schemas'
import { revalidatePath } from 'next/cache'
export async function updateStep(input: { id: string; template_key: keyof typeof copySchemas; betreff: string; preheader: string; offset_tage: number; aktiv: boolean; copy: unknown }): Promise<{ ok: boolean; error?: string }> {
  const parsed = copySchemas[input.template_key].safeParse(input.copy)
  if (!parsed.success) return { ok: false, error: 'Copy ungültig: ' + parsed.error.issues[0]?.message }
  const supabase = await createClient()
  const { error } = await supabase.from('werkstatt_onboarding_steps')
    .update({ betreff: input.betreff, preheader: input.preheader, offset_tage: input.offset_tage, aktiv: input.aktiv, copy: parsed.data, aktualisiert_am: new Date().toISOString() })
    .eq('id', input.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/vertrieb/werkstatt-onboarding')
  return { ok: true }
}
```

- [ ] **Step 2: `page.tsx`** — Server-Component: Steps laden (`order('position')`), je Step ein Formular (Muster: bestehende Admin-Vertrieb-Seiten / `shared/forms/TextField`). Bonus-`aktiv`-Toggle sichtbar. UI-Strings mit Umlauten.

- [ ] **Step 3: UI-Erreichbarkeit** — Nav-Eintrag/Link im Admin-Vertrieb-Bereich (Muster: bestehende `admin/vertrieb`-Navigation), Rolle admin/kb.

- [ ] **Step 4: Build grün** + Commit `feat(werkstatt-onboarding): Admin-Edit-Seite fuer die Sequenz`.

> **Degradation:** Falls diese Task den MVP sprengt (Zeit/Reviewer), auslassen — die Engine läuft mit Studio-/SQL-Edit der `werkstatt_onboarding_steps`-Zeilen. Dann diese Task als „Fast-Follow"-PR nachziehen. Kein Blocker für Task 1–13/15.

---

## Task 15: Regel-4 Prod-Smoke

**Files:** keine (Verifikation nach Deploy)

- [ ] **Step 1: Test-Werkstatt vorbereiten** — via Admin eine Test-Werkstatt mit Test-Email (kein realer Empfänger), Standort in einer SV-abgedeckten Region; sicherstellen `aktiviert_am` gesetzt + Enrollment existiert (sonst manuell via `enrolleWerkstatt` in einer Konsole).
- [ ] **Step 2: Cron manuell triggern** — `curl -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/werkstatt-onboarding-drip` → `{ok, gesendet≥1}`.
- [ ] **Step 3: Verifizieren** — `email_log`-Row für Mail 1 (`template='werkstatt_aktivierung_willkommen'`), Enrollment `aktueller_step=1`, `next_send_at` = aktiviert_am+3.
- [ ] **Step 4: SV-Mail** — `next_send_at` der Test-Werkstatt auf jetzt setzen, `aktueller_step=2`, Cron → Mail 3 mit erwartetem SV in `BeraterCard`; zweite Test-Werkstatt ohne SV-Region → Mail 3 übersprungen (kein `email_log`, `aktueller_step` springt weiter).
- [ ] **Step 5: Stop testen** — Test-`partner_provisionen`(partner_typ='werkstatt', partner_id=Test-Werkstatt, claim_id=Test-Claim) oder `claims.reparatur_werkstatt_id` setzen → Cron → Enrollment `status='aktiviert'`, kein weiterer Send.
- [ ] **Step 6: Ergebnis im PR/Marker** dokumentieren (grün/rot + email_log-Belege). Test-Daten aufräumen.

---

## Task 16: Backfill bestehender Werkstätten (einmalig, Launch)

**Files:**
- Create: `scripts/werkstatt-onboarding-backfill.mjs`

**Interfaces:**
- Consumes: `werkstaetten` (status='aktiv', mit `email`), `hatErstenFall` (T8), `enrolleWerkstatt` (T12).
- Produces: Enrollments für bestehende aktive Werkstätten **ohne** ersten Fall. Anker = heute (via `enrolleWerkstatt` → `erstellt_am`=now) → Mail 1 heute, Mail 2 in 3 Tagen usw. — **nicht** rückwirkend.

- [ ] **Step 1: Skript** (`--dry-run` default; `--live` scharf)

```js
// scripts/werkstatt-onboarding-backfill.mjs — node --env-file=.env.local scripts/werkstatt-onboarding-backfill.mjs [--live]
import { createClient } from '@supabase/supabase-js'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const LIVE = process.argv.includes('--live')
const { data: wks } = await db.from('werkstaetten').select('id, name, email').eq('status', 'aktiv').not('email', 'is', null)
let kandidaten = 0, enrolled = 0
for (const w of wks ?? []) {
  const { count: prov } = await db.from('partner_provisionen').select('id', { count: 'exact', head: true }).eq('partner_typ', 'werkstatt').eq('partner_id', w.id)
  const { count: claim } = await db.from('claims').select('id', { count: 'exact', head: true }).eq('reparatur_werkstatt_id', w.id)
  if ((prov ?? 0) > 0 || (claim ?? 0) > 0) continue   // hat schon einen Fall → nicht enrollen
  const { count: schon } = await db.from('werkstatt_onboarding_enrollments').select('id', { count: 'exact', head: true }).eq('werkstatt_id', w.id)
  if ((schon ?? 0) > 0) continue                       // schon enrolled
  kandidaten++
  if (LIVE) {
    const { data: s1 } = await db.from('werkstatt_onboarding_steps').select('offset_tage').eq('position', 1).single()
    const { error } = await db.from('werkstatt_onboarding_enrollments').upsert(
      { werkstatt_id: w.id, aktueller_step: 0, next_send_at: new Date(Date.now() + (s1?.offset_tage ?? 0) * 86400000).toISOString(), status: 'aktiv' },
      { onConflict: 'werkstatt_id', ignoreDuplicates: true })
    if (!error) enrolled++
  }
}
console.log(LIVE ? `enrolled ${enrolled}/${kandidaten}` : `dry-run: ${kandidaten} Kandidaten (aktiv, kein Fall, nicht enrolled)`)
```

- [ ] **Step 2: Dry-run** — `node --env-file=.env.local scripts/werkstatt-onboarding-backfill.mjs` → Kandidaten-Zahl prüfen (plausibel?).
- [ ] **Step 3: Scharf (nach Aaron-OK)** — `--live`. ⚠ Löst in den Folgetagen **echte** Mails an **echte** Werkstätten aus → Aaron muss die Copy final freigeben + der Absender/`WERKSTATT_ANSPRECHPARTNER_TEL`-Env muss gesetzt sein. Bonus-Mail bleibt `aktiv=false`.
- [ ] **Step 4: Commit** des Skripts (`chore(werkstatt-onboarding): Backfill-Skript bestehender Werkstaetten`). Die scharfe Ausführung ist Ops, kein Deploy.

---

## Self-Review-Notiz (Autor)

- **Spec-Coverage:** §4 Datenmodell → T1/T2; §5 Templates → T4–T6; §6 Merge/SV → T10; §8 Timing/Cron → T9/T13; §9 Seed → T7; §10 Trigger → T12 (+ Backfill → T16); §11 Stop → T8; §7 Admin → T14; §13 Test → T8–T11 (unit) + T15 (Regel 4); flag-drift/Types → T3. Alle Spec-Abschnitte haben eine Task.
- **Anker-Konsistenz (Type-Review):** Sequenz-Anker ist durchgängig `enrollment.erstellt_am` (Enroll-Zeit) — in T12 (enrolleWerkstatt setzt next_send_at=now+offset), T13 (Cron rechnet Folge-Offsets gegen `e.erstellt_am`) und T16 (Backfill = Enroll heute). NICHT `werkstaetten.aktiviert_am` (das würde Backfill rückwirkend feuern lassen).
- **Integration-Punkte zum Bau-Zeitpunkt zu bestätigen** (existierende APIs, Code steht): `findeBestePerson`-Input-Shape (T10), `sendEmail`-Optionsnamen (T11), `assertCronAuth`/`createAdminClient`-Pfade + `werkstaetten.email`-Spalte (T13), Component-Prop-Namen des email-Kits (T5). Kein Design-Placeholder — jeweils der erste Schritt der Task.
- **Non-Goals** (Verhaltens-Trigger, A/B-Betreff, generischer Engine, Legal-Framing) bewusst ausgelassen.
