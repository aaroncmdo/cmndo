# Partner-Onboarding-Termine (③) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Aus einem `partner_leads`-Prospect heraus einen Onboarding-Termin legen (online = Auto-Google-Meet 30 Min, oder vor Ort = geokodierte Adresse); Prospect bekommt eine ICS-Einladung, der Termin liegt im Admin-Kalender.

**Architecture:** Anker ist die bestehende `admin_termine`-Tabelle (hat Kalender-Sync + Rendering). Additive DDL (partner_lead_id/kanal/video_link/treffpunkt_*). Neue Server-Action `legePartnerOnboardingTermin` orchestriert Insert → (online) `createMeetEvent` / (vor Ort) `geocodeAddress` + `syncAdminTerminCalendarEvent` → Auto-Log → ICS-Einladungsmail. UI = „Termin legen"-Button + Modal im bestehenden `DetailDrawer`.

**Tech Stack:** Next.js Server-Actions, Supabase (`createAdminClient`), Google Calendar (`createMeetEvent`, `googleapis`), `@/lib/ical` (`buildIcs`), `@react-email/render` + `sendEmail`, vitest.

**Branch:** `kitta/partner-onboarding-termine`, gestackt auf `kitta/partner-csv-mapping` (④, PR #3972). Nach ④-Merge auf staging rebasen (`git rebase --onto origin/staging kitta/partner-csv-mapping`).

## Global Constraints

- **Regel 2:** DDL NUR via Supabase-Plugin `apply_migration`; Migration-File-Name == recorded Version (Twin-Drift vermeiden). **Task 1 macht der Controller** (kein Subagent führt DDL aus).
- Server-Actions liefern `{ ok, error? }` / `{ ok: true; warnung? }`, **kein throw**; `revalidatePath('/admin/partner-leads')` bei Writes.
- Auth-Guard `requireVertriebStaff()` (existiert in actions.ts:73) für die neue Action.
- **Non-critical Sub-Ops** (Google Meet, Geocode, Kalender-Sync, Einladungsmail) in lokalem `try/catch` — ein Google-/Mail-Fehler darf den `admin_termine`-Insert NIE atomar brechen. Bei Meet-Fehler: Termin bleibt, `warnung` zurückgeben.
- **Umlaute** in allen UI-Strings + Email-Template (echte `ä/ö/ü/ß`). Backend-Logs/Comments ASCII egal.
- **Komponenten-Set:** Buttons = `Button`, Selects = `SelectField`, Inputs = `TextField`, Modal = `Modal`. Kein neues handgerolltes Button/Card/Table-Markup (Ratchet). Layout-Divs/`ul`/`dl` mit Tokens sind erlaubt.
- **Design-Tokens:** `claimondo-*` / `success`/`warning`/`danger`-Tokens, keine raw Tailwind-Scales/Hex.
- 4 Ratchets `npm run check:token-audit -- --ratchet`, `check:component-set -- --ratchet`, `check:knip -- --ratchet`, `check:status-registry -- --ratchet` = **0-neu**.
- `src/lib/partner/onboarding-termin.ts` bleibt **pure/isomorphic** (kein `'server-only'`; wird für Typen + Anzeige-Helper auch vom Client importiert).

## File Structure

- `supabase/migrations/<recorded>_partner_onboarding_termine.sql` — **Create** (Task 1, Controller).
- `src/lib/partner/onboarding-termin.ts` — **Create** (Task 2): reine Helper + Typen (`OnboardingTerminInput`, `PartnerOnboardingTerminRow`, `berechneEndzeit`, `baueTerminTitel`, `baueTerminBeschreibung`, `baueTerminAktivitaetText`, `formatTerminZeitpunkt`, `baueOnboardingIcs`).
- `src/lib/partner/__tests__/onboarding-termin.test.ts` — **Create** (Task 2).
- `src/lib/email/google/templates/PartnerOnboardingEinladung.tsx` — **Create** (Task 3): react-email Template.
- `src/lib/email/google/flows.ts` — **Modify** (Task 3): `sendePartnerOnboardingEinladung(...)` ergänzen.
- `src/app/admin/partner-leads/actions.ts` — **Modify** (Task 4): `legePartnerOnboardingTermin(...)` ergänzen.
- `src/app/admin/partner-leads/types.ts` — **Modify** (Task 5): `PartnerOnboardingTerminRow`-Re-Export + `strasse` auf `PartnerLeadRow`.
- `src/app/admin/partner-leads/page.tsx` — **Modify** (Task 5): `strasse` in Select + service-role Termine-Load + `termine`-Prop.
- `src/app/admin/partner-leads/PartnerLeadsClient.tsx` — **Modify** (Task 6): DetailDrawer-Termine-Sektion + `TerminModal` + Verdrahtung.

---

### Task 1: DDL-Migration `admin_termine` (Controller, via `apply_migration`)

**Files:** Create `supabase/migrations/<recorded>_partner_onboarding_termine.sql`

**Ist-Zustand (live verifiziert, prod `paizkjajbuxxksdoycev`):** `admin_termine` hat `typ` (text, CHECK `['rueckruf','kunde','intern']`), `lead_id` (FKt claim-`leads`, NICHT partner_leads), `google_event_id`/`google_calendar_id`/`google_event_synced_at`, `caldav_*`, `ms_event_id`, `zugewiesen_an`, `erstellt_von`. **Fehlt:** `partner_lead_id`, `kanal`, `video_link`, `treffpunkt_adresse`, `treffpunkt_lat`, `treffpunkt_lng`. `partner_leads.id` = uuid PK.

DDL (rein additiv; typ-Check wird um `partner_onboarding` erweitert, Bestand erhalten):

```sql
-- (3) Partner-Onboarding-Termine: additive Spalten + typ/kanal-Checks auf admin_termine.
ALTER TABLE public.admin_termine
  ADD COLUMN IF NOT EXISTS partner_lead_id uuid REFERENCES public.partner_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kanal text,
  ADD COLUMN IF NOT EXISTS video_link text,
  ADD COLUMN IF NOT EXISTS treffpunkt_adresse text,
  ADD COLUMN IF NOT EXISTS treffpunkt_lat double precision,
  ADD COLUMN IF NOT EXISTS treffpunkt_lng double precision;

-- typ-Check um 'partner_onboarding' erweitern (Bestand ['rueckruf','kunde','intern'] bleibt gueltig).
ALTER TABLE public.admin_termine DROP CONSTRAINT IF EXISTS admin_termine_typ_check;
ALTER TABLE public.admin_termine ADD CONSTRAINT admin_termine_typ_check
  CHECK (typ = ANY (ARRAY['rueckruf'::text, 'kunde'::text, 'intern'::text, 'partner_onboarding'::text]));

-- kanal-Domain (nur online/vor_ort; NULL fuer Nicht-Onboarding-Termine).
ALTER TABLE public.admin_termine DROP CONSTRAINT IF EXISTS admin_termine_kanal_check;
ALTER TABLE public.admin_termine ADD CONSTRAINT admin_termine_kanal_check
  CHECK (kanal IS NULL OR kanal = ANY (ARRAY['online'::text, 'vor_ort'::text]));

-- Index fuer den Loader (.in('partner_lead_id', leadIds)).
CREATE INDEX IF NOT EXISTS idx_admin_termine_partner_lead_id
  ON public.admin_termine (partner_lead_id) WHERE partner_lead_id IS NOT NULL;
```

- [ ] **Step 1:** `apply_migration({ project_id: 'paizkjajbuxxksdoycev', name: 'partner_onboarding_termine', query: <DDL oben> })`.
- [ ] **Step 2:** `list_migrations` → recorded Version `<V>` ablesen.
- [ ] **Step 3:** File `supabase/migrations/<V>_partner_onboarding_termine.sql` mit exakt der DDL committen (Name == `<V>`).
- [ ] **Step 4:** `execute_sql` READ verifizieren: `select column_name from information_schema.columns where table_name='admin_termine' and column_name in ('partner_lead_id','kanal','video_link','treffpunkt_adresse','treffpunkt_lat','treffpunkt_lng')` → 6 Zeilen; + `pg_get_constraintdef` des typ-Checks enthält `partner_onboarding`.
- [ ] **Step 5:** Typen-Regenerierung aufschieben (Types dürfen hinterherhinken; die Action castet die Insert-Payload lokal). Commit.

---

### Task 2: Reine Termin-Helper + Typen (pure lib)

**Files:** Create `src/lib/partner/onboarding-termin.ts` · Test `src/lib/partner/__tests__/onboarding-termin.test.ts`

**Interfaces (produce):**
```ts
export type OnboardingTerminKanal = 'online' | 'vor_ort'
export type OnboardingTerminInput = { startIso: string; kanal: OnboardingTerminKanal; treffpunktAdresse?: string | null }
export type PartnerOnboardingTerminRow = {
  id: string; partner_lead_id: string; start_zeit: string; end_zeit: string | null
  kanal: OnboardingTerminKanal | null; video_link: string | null
  treffpunkt_adresse: string | null; status: string | null; titel: string
}
export const ONBOARDING_TERMIN_DAUER_MIN = 30
export function berechneEndzeit(startIso: string, dauerMinuten?: number): string
export function baueTerminTitel(firma: string | null): string
export function baueTerminBeschreibung(input: { kanal: OnboardingTerminKanal; videoLink?: string | null; treffpunktAdresse?: string | null }): string
export function baueTerminAktivitaetText(startIso: string, kanal: OnboardingTerminKanal): string
export function formatTerminZeitpunkt(startIso: string): string
export function baueOnboardingIcs(input: { terminId: string; firma: string | null; kanal: OnboardingTerminKanal; startIso: string; endIso: string; videoLink: string | null; treffpunktAdresse: string | null }): string
```

- [ ] **Step 1: Failing tests** — `src/lib/partner/__tests__/onboarding-termin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  berechneEndzeit, baueTerminTitel, baueTerminBeschreibung,
  baueTerminAktivitaetText, formatTerminZeitpunkt, baueOnboardingIcs,
  ONBOARDING_TERMIN_DAUER_MIN,
} from '../onboarding-termin'

describe('berechneEndzeit', () => {
  it('addiert 30 Minuten als Default', () => {
    expect(berechneEndzeit('2026-07-10T12:00:00.000Z')).toBe('2026-07-10T12:30:00.000Z')
  })
  it('respektiert eine explizite Dauer', () => {
    expect(berechneEndzeit('2026-07-10T12:00:00.000Z', 45)).toBe('2026-07-10T12:45:00.000Z')
  })
  it('wirft bei ungueltigem Datum', () => {
    expect(() => berechneEndzeit('kaputt')).toThrow()
  })
})

describe('baueTerminTitel', () => {
  it('nutzt die Firma', () => { expect(baueTerminTitel('Kfz Meier')).toBe('Onboarding: Kfz Meier') })
  it('faellt bei leerer Firma auf Default zurueck', () => { expect(baueTerminTitel(null)).toBe('Partner-Onboarding') })
})

describe('baueTerminBeschreibung', () => {
  it('online mit Link', () => {
    expect(baueTerminBeschreibung({ kanal: 'online', videoLink: 'https://meet.google.com/abc' })).toContain('https://meet.google.com/abc')
  })
  it('online ohne Link', () => {
    expect(baueTerminBeschreibung({ kanal: 'online' })).toContain('folgt')
  })
  it('vor Ort mit Adresse', () => {
    expect(baueTerminBeschreibung({ kanal: 'vor_ort', treffpunktAdresse: 'Domplatz 1, 50667 Köln' })).toContain('Domplatz 1')
  })
})

describe('baueTerminAktivitaetText', () => {
  it('nennt Video-Kanal', () => {
    expect(baueTerminAktivitaetText('2026-07-10T12:00:00.000Z', 'online')).toContain('Video')
  })
  it('nennt vor-Ort-Kanal', () => {
    expect(baueTerminAktivitaetText('2026-07-10T12:00:00.000Z', 'vor_ort')).toContain('vor Ort')
  })
})

describe('formatTerminZeitpunkt', () => {
  it('formatiert deterministisch in Berlin-Zeit', () => {
    // 12:00 UTC = 14:00 Berlin (Sommerzeit)
    expect(formatTerminZeitpunkt('2026-07-10T12:00:00.000Z')).toContain('14:00')
  })
})

describe('baueOnboardingIcs', () => {
  it('erzeugt ein VEVENT mit Meet-Link als Location (online)', () => {
    const ics = baueOnboardingIcs({
      terminId: 't1', firma: 'Kfz Meier', kanal: 'online',
      startIso: '2026-07-10T12:00:00.000Z', endIso: '2026-07-10T12:30:00.000Z',
      videoLink: 'https://meet.google.com/abc', treffpunktAdresse: null,
    })
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('SUMMARY:Onboarding: Kfz Meier')
    expect(ics).toContain('DTSTART:20260710T120000Z')
    expect(ics).toContain('meet.google.com/abc')
  })
  it('nutzt die Adresse als Location (vor Ort)', () => {
    const ics = baueOnboardingIcs({
      terminId: 't2', firma: null, kanal: 'vor_ort',
      startIso: '2026-07-10T12:00:00.000Z', endIso: '2026-07-10T12:30:00.000Z',
      videoLink: null, treffpunktAdresse: 'Domplatz 1, 50667 Köln',
    })
    expect(ics).toContain('LOCATION:Domplatz 1')
  })
})

it('ONBOARDING_TERMIN_DAUER_MIN ist 30', () => { expect(ONBOARDING_TERMIN_DAUER_MIN).toBe(30) })
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/lib/partner/__tests__/onboarding-termin.test.ts`).
- [ ] **Step 3: Implementierung** `src/lib/partner/onboarding-termin.ts`:

```ts
// (3) Partner-Onboarding-Termine — reine Helper (Titel/Beschreibung/Endzeit/ICS/Anzeige).
// Impure Orchestrierung (Google Meet, Geocode, Mailversand) liegt in der Server-Action
// bzw. in flows.ts. Diese Datei bleibt pure/isomorphic (auch vom Client importierbar).
import { buildIcs } from '@/lib/ical'

export type OnboardingTerminKanal = 'online' | 'vor_ort'

export type OnboardingTerminInput = {
  startIso: string
  kanal: OnboardingTerminKanal
  treffpunktAdresse?: string | null
}

/** admin_termine-Zeile (typ='partner_onboarding') wie der Drawer sie anzeigt. */
export type PartnerOnboardingTerminRow = {
  id: string
  partner_lead_id: string
  start_zeit: string
  end_zeit: string | null
  kanal: OnboardingTerminKanal | null
  video_link: string | null
  treffpunkt_adresse: string | null
  status: string | null
  titel: string
}

export const ONBOARDING_TERMIN_DAUER_MIN = 30

export function berechneEndzeit(startIso: string, dauerMinuten = ONBOARDING_TERMIN_DAUER_MIN): string {
  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) throw new Error('Ungueltiges Startdatum')
  return new Date(start.getTime() + dauerMinuten * 60 * 1000).toISOString()
}

export function baueTerminTitel(firma: string | null): string {
  const name = (firma ?? '').trim()
  return name ? `Onboarding: ${name}` : 'Partner-Onboarding'
}

export function baueTerminBeschreibung(input: {
  kanal: OnboardingTerminKanal
  videoLink?: string | null
  treffpunktAdresse?: string | null
}): string {
  if (input.kanal === 'online') {
    return input.videoLink
      ? `Video-Onboarding via Google Meet: ${input.videoLink}`
      : 'Video-Onboarding (Google-Meet-Link folgt).'
  }
  return input.treffpunktAdresse
    ? `Onboarding vor Ort: ${input.treffpunktAdresse}`
    : 'Onboarding vor Ort.'
}

export function formatTerminZeitpunkt(startIso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(startIso))
}

export function baueTerminAktivitaetText(startIso: string, kanal: OnboardingTerminKanal): string {
  const wann = formatTerminZeitpunkt(startIso)
  const wie = kanal === 'online' ? 'Video' : 'vor Ort'
  return `Onboarding-Termin angelegt: ${wann} (${wie}).`
}

export function baueOnboardingIcs(input: {
  terminId: string
  firma: string | null
  kanal: OnboardingTerminKanal
  startIso: string
  endIso: string
  videoLink: string | null
  treffpunktAdresse: string | null
}): string {
  return buildIcs({
    uid: `partner-onboarding-${input.terminId}`,
    summary: baueTerminTitel(input.firma),
    description: baueTerminBeschreibung({
      kanal: input.kanal,
      videoLink: input.videoLink,
      treffpunktAdresse: input.treffpunktAdresse,
    }),
    location: input.kanal === 'online'
      ? (input.videoLink ?? undefined)
      : (input.treffpunktAdresse ?? undefined),
    startsAt: new Date(input.startIso),
    endsAt: new Date(input.endIso),
    organizerName: 'Claimondo',
    organizerEmail: 'no-reply@claimondo.de',
  })
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(partner-crm): onboarding-termin pure Helper (Titel/Endzeit/ICS/Anzeige) + Tests`

---

### Task 3: Einladungs-Mail (Template + `sendePartnerOnboardingEinladung`)

**Files:** Create `src/lib/email/google/templates/PartnerOnboardingEinladung.tsx` · Modify `src/lib/email/google/flows.ts`

**Referenz-Muster (zur Implementierzeit lesen):** ein bestehendes einfaches Template + sein Send in `flows.ts` — z.B. `WillkommenWerkstattEmail` (Template) und die Send-Funktion bei `flows.ts:823` (`const html = await render(WillkommenWerkstattEmail(props)); await sendEmail({...})`). Import: `import { render } from '@react-email/render'`. Branding/react-email-Primitives (Html/Body/Container/Heading/Text/Button/Link) genau aus dem Referenz-Template übernehmen.

**Interfaces (produce):**
```ts
// in flows.ts
export async function sendePartnerOnboardingEinladung(input: {
  empfaengerEmail: string | null
  firma: string | null
  ansprechpartner: string | null
  kanal: OnboardingTerminKanal
  startIso: string
  endIso: string
  videoLink: string | null
  treffpunktAdresse: string | null
  terminId: string
}): Promise<void>
```

- [ ] **Step 1:** Template `PartnerOnboardingEinladung.tsx` — Props `{ firma: string | null; ansprechpartner: string | null; zeitpunktText: string; kanal: 'online' | 'vor_ort'; videoLink: string | null; treffpunktAdresse: string | null }`. Deutsche Texte mit Umlauten: Anrede (`Guten Tag${ansprechpartner ? ' ' + ansprechpartner : ''}`), Kern „wir freuen uns auf Ihr Onboarding-Gespräch mit Claimondo", Zeitpunkt-Zeile, bei `online` ein „Video-Call beitreten"-Button/Link auf `videoLink` (falls vorhanden, sonst Hinweis „Den Link erhalten Sie separat per Kalendereinladung."), bei `vor_ort` die Adresse. Hinweis auf angehängte `.ics`-Datei. Struktur/Farben aus dem Referenz-Template. Kein raw Hex (react-email darf inline-`var(--brand-primary, #0D1B3E)` — aber hier NICHT gebrandet nötig, Claimondo-Standard reicht; falls das Referenz-Template `// Token-Audit-Skip`-Header hat, übernehmen).
- [ ] **Step 2:** `sendePartnerOnboardingEinladung` in `flows.ts` (Imports oben ergänzen: `baueOnboardingIcs` + `OnboardingTerminKanal` + `formatTerminZeitpunkt` aus `@/lib/partner/onboarding-termin`, `PartnerOnboardingEinladung` aus `./templates/PartnerOnboardingEinladung`):

```ts
export async function sendePartnerOnboardingEinladung(input: {
  empfaengerEmail: string | null
  firma: string | null
  ansprechpartner: string | null
  kanal: OnboardingTerminKanal
  startIso: string
  endIso: string
  videoLink: string | null
  treffpunktAdresse: string | null
  terminId: string
}): Promise<void> {
  if (!input.empfaengerEmail) return // ohne Postfach keine Einladung
  const ics = baueOnboardingIcs({
    terminId: input.terminId,
    firma: input.firma,
    kanal: input.kanal,
    startIso: input.startIso,
    endIso: input.endIso,
    videoLink: input.videoLink,
    treffpunktAdresse: input.treffpunktAdresse,
  })
  const html = await render(
    PartnerOnboardingEinladung({
      firma: input.firma,
      ansprechpartner: input.ansprechpartner,
      zeitpunktText: formatTerminZeitpunkt(input.startIso),
      kanal: input.kanal,
      videoLink: input.videoLink,
      treffpunktAdresse: input.treffpunktAdresse,
    }),
  )
  await sendEmail({
    to: input.empfaengerEmail,
    subject: 'Ihr Onboarding-Termin bei Claimondo',
    html,
    attachments: [
      { filename: 'onboarding-termin.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=PUBLISH' },
    ],
    empfaengerTyp: 'admin',
  })
}
```

- [ ] **Step 3:** Failing test `src/lib/email/google/__tests__/partner-onboarding-einladung.test.tsx` (falls im Repo react-email-Templates getestet werden — prüfe ob es `__tests__` neben templates gibt; sonst überspringen und nur `render()` im Build validieren): rendert das Template und prüft, dass der Firmenname + „Onboarding" im HTML steht und bei `online` mit `videoLink` ein `href` mit dem Link erscheint. (`const html = await render(PartnerOnboardingEinladung({...}))`.)
- [ ] **Step 4:** `npx tsc --noEmit` clean · `npm run build` grün.
- [ ] **Step 5: Commit** `feat(partner-crm): Onboarding-Einladungsmail (Template + ICS-Anhang via flows.sendePartnerOnboardingEinladung)`

---

### Task 4: Server-Action `legePartnerOnboardingTermin`

**Files:** Modify `src/app/admin/partner-leads/actions.ts`

**Consumes:** Task 2 (`baueTerminTitel`/`berechneEndzeit`/`baueTerminBeschreibung`/`baueTerminAktivitaetText`, `ONBOARDING_TERMIN_DAUER_MIN`, `OnboardingTerminInput`), Task 3 (`sendePartnerOnboardingEinladung`), `createMeetEvent` (`@/lib/google-calendar/events`), `geocodeAddress` (`@/lib/google-geocoding/geocode-address`), `syncAdminTerminCalendarEvent` (dynamic import), `requireVertriebStaff`/`createAdminClient`/`revalidatePath` (im File vorhanden).

**Verifizierte Signaturen:** `createMeetEvent(input): Promise<{ eventId; calendarId; meetLink: string|null; htmlLink }>` — **THROWT**, wenn der Host keinen Google-OAuth hat → try/catch Pflicht. `geocodeAddress(raw): Promise<{ ok: true; data: { lat; lng; formatted_address; place_id } } | { ok: false; error }>`. `syncAdminTerminCalendarEvent(terminId): Promise<void>` (fail-silent, upsertet in den Kalender von `zugewiesen_an`).

**Produces:**
```ts
export async function legePartnerOnboardingTermin(
  leadId: string,
  input: OnboardingTerminInput,
): Promise<{ ok: true; warnung?: string } | { ok: false; error: string }>
```

- [ ] **Step 1:** Imports ergänzen (oben in actions.ts):

```ts
import { createMeetEvent } from '@/lib/google-calendar/events'
import { geocodeAddress } from '@/lib/google-geocoding/geocode-address'
import {
  baueTerminTitel, berechneEndzeit, baueTerminBeschreibung,
  baueTerminAktivitaetText, ONBOARDING_TERMIN_DAUER_MIN,
  type OnboardingTerminInput,
} from '@/lib/partner/onboarding-termin'
import { sendePartnerOnboardingEinladung } from '@/lib/email/google/flows'
```

- [ ] **Step 2:** Action ans Ende von actions.ts:

```ts
export async function legePartnerOnboardingTermin(
  leadId: string,
  input: OnboardingTerminInput,
): Promise<{ ok: true; warnung?: string } | { ok: false; error: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Termine anlegen.' }

  const kanal = input.kanal
  if (kanal !== 'online' && kanal !== 'vor_ort') {
    return { ok: false, error: 'Bitte einen Kanal wählen (online oder vor Ort).' }
  }
  const start = new Date(input.startIso)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Bitte ein gültiges Datum wählen.' }
  if (start.getTime() < Date.now() - 60_000) return { ok: false, error: 'Der Termin liegt in der Vergangenheit.' }

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('partner_leads')
    .select('id, firma, email, ansprechpartner_vorname, ansprechpartner_nachname')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Prospect nicht gefunden.' }

  const firma = (lead.firma as string | null) ?? null
  const leadEmail = ((lead.email as string | null) ?? '').trim() || null
  const ansprechpartner =
    [lead.ansprechpartner_vorname, lead.ansprechpartner_nachname].filter(Boolean).join(' ') || null
  const titel = baueTerminTitel(firma)
  const endIso = berechneEndzeit(input.startIso)
  const treffpunktAdresse =
    kanal === 'vor_ort' ? (input.treffpunktAdresse ?? '').trim() || null : null

  // Basis-Insert (Kanal-Felder folgen per Update, sobald Meet/Geocode da ist).
  const { data: inserted, error: insErr } = await admin
    .from('admin_termine')
    .insert({
      typ: 'partner_onboarding',
      titel,
      beschreibung: baueTerminBeschreibung({ kanal, treffpunktAdresse }),
      start_zeit: input.startIso,
      end_zeit: endIso,
      status: 'offen',
      kanal,
      partner_lead_id: leadId,
      treffpunkt_adresse: treffpunktAdresse,
      zugewiesen_an: staff.id,
      erstellt_von: staff.id,
      erinnerung_min_vorher: 60,
    } as never)
    .select('id')
    .single()
  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message ?? 'Termin konnte nicht angelegt werden.' }
  }
  const terminId = (inserted as { id: string }).id

  let warnung: string | undefined
  let videoLink: string | null = null

  if (kanal === 'online') {
    try {
      const { data: staffProfile } = await admin
        .from('profiles').select('email').eq('id', staff.id).maybeSingle()
      const staffEmail = (staffProfile?.email as string | null)?.trim() || null
      if (!staffEmail) throw new Error('Kein Bearbeiter-Postfach hinterlegt.')
      const attendees: Array<{ email: string; displayName?: string }> = [{ email: staffEmail }]
      if (leadEmail) attendees.push({ email: leadEmail, displayName: ansprechpartner ?? undefined })

      const meet = await createMeetEvent({
        ownerUserId: staff.id,
        attendees,
        title: titel,
        description: `Onboarding-Gespräch mit ${firma ?? 'dem Partner'}.`,
        startISO: input.startIso,
        dauerMinuten: ONBOARDING_TERMIN_DAUER_MIN,
        withMeet: true,
        idempotencyKey: terminId,
      })
      videoLink = meet.meetLink
      await admin.from('admin_termine').update({
        video_link: meet.meetLink,
        beschreibung: baueTerminBeschreibung({ kanal, videoLink: meet.meetLink }),
        google_event_id: meet.eventId,
        google_calendar_id: meet.calendarId,
        google_event_synced_at: new Date().toISOString(),
      } as never).eq('id', terminId)
    } catch (err) {
      console.error('[legePartnerOnboardingTermin] Meet (non-critical):', err)
      warnung =
        'Termin angelegt, aber kein Google-Meet-Link — Bearbeiter ist nicht mit Google verbunden (/admin/einstellungen/google).'
    }
  } else {
    if (treffpunktAdresse) {
      try {
        const geo = await geocodeAddress(treffpunktAdresse)
        if (geo.ok) {
          await admin.from('admin_termine').update({
            treffpunkt_adresse: geo.data.formatted_address,
            treffpunkt_lat: geo.data.lat,
            treffpunkt_lng: geo.data.lng,
          } as never).eq('id', terminId)
        }
      } catch (err) {
        console.error('[legePartnerOnboardingTermin] Geocode (non-critical):', err)
      }
    }
    try {
      const { syncAdminTerminCalendarEvent } = await import('@/lib/google-calendar/admin-event-sync')
      await syncAdminTerminCalendarEvent(terminId)
    } catch (err) {
      console.error('[legePartnerOnboardingTermin] Kalender-Sync (non-critical):', err)
    }
  }

  // Auto-Log als Aktivitaet (typ='sonstiges' ist in partner_lead_aktivitaeten_typ_check erlaubt).
  try {
    await admin.from('partner_lead_aktivitaeten').insert({
      partner_lead_id: leadId,
      typ: 'sonstiges',
      text: baueTerminAktivitaetText(input.startIso, kanal),
      erstellt_von: staff.id,
    })
  } catch (err) {
    console.error('[legePartnerOnboardingTermin] Aktivitaets-Log (non-critical):', err)
  }

  // Einladung an den Prospect (best-effort).
  try {
    await sendePartnerOnboardingEinladung({
      empfaengerEmail: leadEmail,
      firma,
      ansprechpartner,
      kanal,
      startIso: input.startIso,
      endIso,
      videoLink,
      treffpunktAdresse,
      terminId,
    })
  } catch (err) {
    console.error('[legePartnerOnboardingTermin] Einladung (non-critical):', err)
  }

  revalidatePath('/admin/partner-leads')
  return warnung ? { ok: true, warnung } : { ok: true }
}
```

> Anmerkung: `as never`-Casts auf den Insert/Update-Payloads, weil die generierten Supabase-Typen die neuen Spalten (Task 1) noch nicht kennen (Types dürfen der DB hinterherhinken). Sobald `generate_typescript_types` läuft, können sie entfernt werden — kein Blocker.

- [ ] **Step 3:** `npx tsc --noEmit` clean · `npm run build` grün. (Server-Action, kein Unit-Test — Logik-Kerne sind in Task 2 getestet.)
- [ ] **Step 4: Commit** `feat(partner-crm): legePartnerOnboardingTermin (Insert + Auto-Meet/Geocode + Sync + Log + Einladung)`

---

### Task 5: Page-Loader + Typen (`termine`-Prop)

**Files:** Modify `src/app/admin/partner-leads/types.ts` · `src/app/admin/partner-leads/page.tsx`

**Kontext:** `admin_termine`-RLS (`admin_dispatch_access`) deckt nur admin/dispatch (oder eigenen `zugewiesen_an`) — **NICHT leadbearbeiter**. Der bestehende RLS-Client im Loader würde für leadbearbeiter Zeilen verschlucken. Deshalb Termine per **service-role** (`createAdminClient`) laden — nach dem bereits vorhandenen `VERTRIEB_ROLLEN`-Guard (+ /admin-Layout-Hard-Gate auf admin). Scope: nur `typ='partner_onboarding'` + sichtbare `partner_lead_id`s.

- [ ] **Step 1:** `types.ts` — `strasse` zu `PartnerLeadRow` ergänzen (nach `plz`/`ort`) und `PartnerOnboardingTerminRow` re-exportieren:

```ts
// oben bei den Imports:
export type { PartnerOnboardingTerminRow } from '@/lib/partner/onboarding-termin'

// in PartnerLeadRow, bei den Adressfeldern:
  strasse: string | null
```

- [ ] **Step 2:** `page.tsx` — im `partner_leads`-Select `strasse` ergänzen (String-Liste erweitern: `... plz, ort, strasse, source_channel ...`).
- [ ] **Step 3:** `page.tsx` — nach dem `aktivitaeten`-Laden, Termine per service-role laden und mappen:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { PartnerLeadRow, StaffOption, PartnerLeadAktivitaetRow, PartnerOnboardingTerminRow } from './types'
// ...
// Onboarding-Termine (admin_termine.typ='partner_onboarding') per service-role:
// admin_termine-RLS deckt leadbearbeiter nicht; die Seite ist bereits rollen-gegatet.
const termine: PartnerOnboardingTerminRow[] = []
if (leadIds.length) {
  const svc = createAdminClient()
  const { data: termineRaw } = await svc
    .from('admin_termine')
    .select('id, partner_lead_id, start_zeit, end_zeit, kanal, video_link, treffpunkt_adresse, status, titel')
    .eq('typ', 'partner_onboarding')
    .in('partner_lead_id', leadIds)
    .order('start_zeit', { ascending: true })
  for (const t of termineRaw ?? []) {
    termine.push({
      id: t.id as string,
      partner_lead_id: t.partner_lead_id as string,
      start_zeit: t.start_zeit as string,
      end_zeit: (t.end_zeit as string | null) ?? null,
      kanal: (t.kanal as 'online' | 'vor_ort' | null) ?? null,
      video_link: (t.video_link as string | null) ?? null,
      treffpunkt_adresse: (t.treffpunkt_adresse as string | null) ?? null,
      status: (t.status as string | null) ?? null,
      titel: t.titel as string,
    })
  }
}
```

- [ ] **Step 4:** `page.tsx` — `termine` an den Client durchreichen: `<PartnerLeadsClient leads={leads} staff={staff} aktivitaeten={aktivitaeten} termine={termine} />`.
- [ ] **Step 5:** `npm run build` grün. **Commit** `feat(partner-crm): Onboarding-Termine im Loader (service-role) + strasse in PartnerLeadRow`

---

### Task 6: UI — „Termin legen" + TerminModal + Termine-Liste im DetailDrawer

**Files:** Modify `src/app/admin/partner-leads/PartnerLeadsClient.tsx`

**Kontext:** `PartnerLeadsClient` (default, ~146) hält `aktivitaeten` und filtert `detailAktivitaeten` per `detailId`; reicht sie an `<DetailDrawer>` (~412). `DetailDrawer` (836) rendert Kontakt/Triage/Save/Aktivitäten/Konvertierung. `ScrapeModal` (1214) ist das Modal-Muster (Modal + State + Action + toast). `formatTerminZeitpunkt` aus Task 2.

- [ ] **Step 1: Imports + Parent-Verdrahtung** in `PartnerLeadsClient`:
  - Import: `import { legePartnerOnboardingTermin } from './actions'` (zur bestehenden actions-Import-Zeile hinzufügen), `import type { PartnerOnboardingTerminRow } from './types'`, `import { formatTerminZeitpunkt, type OnboardingTerminKanal } from '@/lib/partner/onboarding-termin'`.
  - Prop `termine: PartnerOnboardingTerminRow[]` zum Component-Signatur-Typ + Destructuring ergänzen.
  - `const detailTermine = useMemo(() => (detailId ? termine.filter((t) => t.partner_lead_id === detailId) : []), [termine, detailId])`.
  - `<DetailDrawer ... termine={detailTermine} />` (Prop durchreichen).

- [ ] **Step 2: DetailDrawer** — Prop `termine: PartnerOnboardingTerminRow[]` zum Typ + Destructuring ergänzen; lokalen State `const [showTermin, setShowTermin] = useState(false)`. **Nach** dem Save/Close-Button-Block (aktuell endet ~Zeile 1046, vor `{/* Aktivitaets-Log */}`) diese Sektion einfügen:

```tsx
{/* Onboarding-Termine */}
<div className="mt-6 border-t border-claimondo-border pt-4">
  <div className="mb-3 flex items-center justify-between">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
      Onboarding-Termine
    </h3>
    <Button variant="ghost" onClick={() => setShowTermin(true)} disabled={saving || converting}>
      Termin legen
    </Button>
  </div>
  {termine.length === 0 ? (
    <p className="text-sm text-claimondo-shield">Noch keine Onboarding-Termine.</p>
  ) : (
    <ul className="space-y-2">
      {termine.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between gap-2 rounded-ios-md border border-claimondo-border bg-claimondo-bg/50 px-3 py-2 text-sm"
        >
          <div>
            <span className="font-medium text-claimondo-navy">{formatTerminZeitpunkt(t.start_zeit)}</span>
            <span className="ml-2 text-xs text-claimondo-ondo">
              {t.kanal === 'online' ? 'Video' : 'vor Ort'}
            </span>
          </div>
          {t.kanal === 'online' && t.video_link ? (
            <a
              href={t.video_link}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-medium text-claimondo-ondo hover:underline"
            >
              Meet öffnen
            </a>
          ) : t.treffpunkt_adresse ? (
            <span className="shrink-0 truncate text-xs text-claimondo-shield">{t.treffpunkt_adresse}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )}
</div>
<TerminModal
  open={showTermin}
  onClose={() => setShowTermin(false)}
  lead={lead}
  onCreated={onChanged}
/>
```

- [ ] **Step 3: TerminModal** — neue Komponente (nach `ScrapeModal` einfügen), Muster = ScrapeModal:

```tsx
function TerminModal({
  open,
  onClose,
  lead,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  lead: PartnerLeadRow
  onCreated: () => void
}) {
  const [datum, setDatum] = useState('')
  const [kanal, setKanal] = useState<OnboardingTerminKanal>('online')
  const [treffpunkt, setTreffpunkt] = useState(
    [lead.strasse, [lead.plz, lead.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  )
  const [saving, setSaving] = useState(false)

  function handleClose() {
    setDatum('')
    setKanal('online')
    setSaving(false)
    onClose()
  }

  async function handleSubmit() {
    if (!datum) {
      toast.error('Bitte Datum und Uhrzeit wählen.')
      return
    }
    const start = new Date(datum)
    if (Number.isNaN(start.getTime())) {
      toast.error('Ungültiges Datum.')
      return
    }
    if (kanal === 'vor_ort' && treffpunkt.trim().length < 4) {
      toast.error('Bitte eine Adresse für den Vor-Ort-Termin angeben.')
      return
    }
    setSaving(true)
    try {
      const res = await legePartnerOnboardingTermin(lead.id, {
        startIso: start.toISOString(),
        kanal,
        treffpunktAdresse: kanal === 'vor_ort' ? treffpunkt.trim() : undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.warnung) toast.warning(res.warnung)
      else toast.success('Onboarding-Termin angelegt.')
      onCreated()
      handleClose()
    } catch {
      toast.error('Termin anlegen fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} maxWidth={520} ariaLabel="Onboarding-Termin legen">
      <h2 className="text-claimondo-navy font-semibold text-lg mb-1">Onboarding-Termin legen</h2>
      <p className="text-sm text-claimondo-ondo mb-4">
        30-Minuten-Termin mit {lead.firma ?? 'dem Prospect'}. Online erzeugt automatisch einen
        Google-Meet-Link; vor Ort wird die Adresse geokodiert.
      </p>
      <div className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-claimondo-shield">Datum & Uhrzeit</label>
          <input
            type="datetime-local"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
          />
        </div>
        <SelectField
          label="Kanal"
          value={kanal}
          onChange={(e) => setKanal(e.target.value as OnboardingTerminKanal)}
          options={[
            { value: 'online', label: 'Online (Google Meet)' },
            { value: 'vor_ort', label: 'Vor Ort' },
          ]}
        />
        {kanal === 'vor_ort' ? (
          <TextField
            label="Treffpunkt-Adresse"
            value={treffpunkt}
            onChange={(e) => setTreffpunkt(e.target.value)}
            placeholder="Straße Nr., PLZ Ort"
          />
        ) : (
          <p className="rounded-ios-md bg-info-soft px-3 py-2 text-xs text-info-strong">
            Der Google-Meet-Link wird automatisch erzeugt (Google-Konto des Bearbeiters unter
            /admin/einstellungen/google erforderlich). Ohne Verbindung wird der Termin trotzdem
            angelegt — ohne Link.
          </p>
        )}
        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={handleClose} type="button">
            Abbrechen
          </Button>
          <Button variant="navy" fullWidth onClick={handleSubmit} loading={saving} disabled={saving || !datum}>
            Termin anlegen
          </Button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4:** `npm run build` grün; **4 Ratchets `--ratchet` 0-neu** (`Button`/`SelectField`/`TextField`/`Modal` + Token-Klassen; `datetime-local`-Input hat kein Primitive → roher Input mit Token-Klassen wie das Notiz-Textarea nebenan, kein Ratchet-Verstoß).
- [ ] **Step 5: Commit** `feat(partner-crm): DetailDrawer Onboarding-Termine (Liste + TerminModal + Auto-Meet/Vor-Ort)`

---

### Task 7: Verify + PR (Controller)

- [ ] `npx vitest run src/lib/partner` grün · `npm run build` grün · 4 Ratchets `--ratchet` 0-neu.
- [ ] Final Whole-Branch-Review (opus) über den ganzen Branch (`scripts/review-package $(git merge-base origin/staging HEAD) HEAD`).
- [ ] Critical/Important-Findings via EIN Fix-Subagent beheben, re-review.
- [ ] PR base=staging (gestackt bis ④/#3972 gemergt): „feat(partner-crm): Onboarding-Termine (③) — Auto-Google-Meet 30 Min / Vor-Ort-Geocode + ICS-Einladung". Audit-Block im PR-Body (7 Punkte).

## Self-Review

- **Spec-Coverage (③):** Termin legen online/vor Ort (Task 6 Modal) ✓ · admin_termine-Anker + additive DDL (Task 1) ✓ · Auto-Google-Meet 30 Min + `video_link` aus API (Task 4 online-Branch) ✓ · vor-Ort-Geocode via ⑤-`geocodeAddress` (Task 4 else-Branch) ✓ · Auto-Log `partner_lead_aktivitaeten` typ='sonstiges' (Task 4) ✓ · ICS-Einladung an Prospect (Task 3 + Task 4) ✓ · Anzeige offener Termine im Drawer (Task 5 Loader + Task 6 Liste) + Admin-Kalender (bestehend, via admin_termine) ✓ · Fallback ohne Google → Termin bleibt + Warnung (Task 4 `warnung`, Task 6 `toast.warning`) ✓.
- **Placeholder-Scan:** kein TBD; alle Code-Blöcke vollständig; Signaturen exakt (live/Datei-verifiziert).
- **Typ-Konsistenz:** `OnboardingTerminKanal`/`PartnerOnboardingTerminRow` zentral in Task 2, re-exportiert in types.ts (Task 5), konsumiert in page.tsx/PartnerLeadsClient (Task 5/6). `legePartnerOnboardingTermin`-Signatur identisch in Task 4 (produce) und Task 6 (consume).
- **DRY/Reuse:** `createMeetEvent`/`buildIcs`/`sendEmail`/`syncAdminTerminCalendarEvent`/`geocodeAddress`/`requireVertriebStaff`/`createAdminClient` — alles bestehend, nichts nachgebaut.
- **Reihenfolge-Abhängigkeit:** Task 3 (Email-Modul) VOR Task 4 (Action importiert es statisch). Task 2 vor Task 3+4. Task 5 vor Task 6 (Prop-Typ). Task 1 (DDL) zuerst (Spalten müssen existieren, sonst Insert-Fehler zur Laufzeit).

## Follow-on
- Optional: Termin absagen/verschieben aus dem Drawer (heute nur anlegen). Nicht im Spec — separater Wunsch.
- Optional: für online die doppelte Einladung (Google-Auto-Invite + Claimondo-ICS) entkoppeln, falls Aaron das als Rauschen empfindet.
