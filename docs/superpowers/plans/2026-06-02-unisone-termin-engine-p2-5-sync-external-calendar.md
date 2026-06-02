# P2.5 — `syncTerminToExternalCalendar` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine assignee-generische Engine-Op `syncTerminToExternalCalendar(terminId)` (+ Entfernen), die eine Termin-Buchung idempotent in die verbundenen externen Kalender (Google + CalDAV) des Assignees schreibt — generalisiert die heutigen zwei SV-/fall-gekoppelten `sv-termin-sync`-Files.

**Architecture:** Drei kleine Units: (1) `kalender-kontext.ts` — Event-Summary/Description/Location aus `bezug` (claim/fall/lead) + `termin.besichtigungsort_adresse`; (2) `kalender-sync.ts` — ein `KalenderProvider`-Interface + `googleProvider`/`caldavProvider`-Adapter (wiederverwenden der bestehenden Provider-Clients) + Orchestrierung; (3) Tests/Verify. Provider-Injection macht die Orchestrierung ohne echte Kalender-I/O testbar. SV-only konkret (andere assignee-Typen → `skip`); nicht verdrahtet (Phase-3-Repoint). `findBestSV`-/`sv-termin-sync`-Bestand bleibt unangetastet.

**Tech Stack:** TypeScript, Supabase, googleapis (Google Calendar), tsdav via `@/lib/kalender/caldav/client` (CalDAV), `toBerlinWallClock` (TZ-Falle), Vitest (pure + Fake-Provider-Orchestrierung), tsx Live-Verify.

**Scope-Entscheidungen (Aaron, brainstorming 02.06.):**
- **Port** (nicht Wrap): Logik assignee+bezug-generisch in die Engine; deckt Self-Service-Lead-Buchungen (bezug=lead, kein fallId).
- **SV-only**: konkret nur `sachverstaendiger` (Google via profile_id, CalDAV via sv_kalender_verbindungen). Andere assignee-Typen → `skip`. KB/sv_lead/kanzlei deferred.
- **Nicht verdrahtet** (Phase 3 ruft es); fail-soft je Provider; kein Zwei-Wege-Sync.

**Live verifizierte Fakten (02.06., Projekt paizkjajbuxxksdoycev):**
- `gutachter_termine`: `assignee_typ/assignee_id`, `bezug_typ/bezug_id`, `besichtigungsort_adresse/lat/lng`, `google_event_id/google_calendar_id`, `caldav_object_url/caldav_event_uid/caldav_synced_at`, `start_zeit/end_zeit`, `status`, `kanal` — alle vorhanden.
- `leads`: vorname, nachname, telefon, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, besichtigungsort_adresse.
- `claims`: claim_nummer, schadenort_adresse, schadenort_ort (KEIN Fahrzeug/Kunde direkt → via `faelle`-Bridge `claim_id`).
- `faelle`: kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, kunde_id, `claims:claim_id(claim_nummer, schadenort_*)`.
- CalDAV-Client (`@/lib/kalender/caldav/client`): `createCalendarEvent({creds,calendarUrl,event})→{objectUrl,uid}`, `updateCalendarEvent({creds,objectUrl,event:{uid,...}})`, `deleteCalendarEvent({creds,objectUrl})`, `CalDavError`. creds=`{serverUrl,username,password}`. `decrypt` aus `@/lib/kalender/caldav/encryption`.
- Google: `getGoogleOAuthClientForUser(profileId)` aus `@/lib/google/oauth-client` (→ auth | null); `toBerlinWallClock`/`GOOGLE_CALENDAR_TIMEZONE` aus `@/lib/google-calendar/timezone`.
- `sv_kalender_verbindungen`: id, server_url, username, password_encrypted, calendar_url, provider (Filter `provider='caldav'`).

---

## File Structure

- **Create** `src/lib/termine/engine/kalender-kontext.ts` — pure `buildSummary`/`buildDescription` + `resolveTerminKontext(termin, db)` (bezug→Felder, injizierbarer db).
- **Create** `src/lib/termine/engine/kalender-sync.ts` — `KalenderProvider`-Interface, `googleProvider`, `caldavProvider`, `syncTerminToExternalCalendar`, `entferneTerminAusExternemKalender`.
- **Create** `src/lib/termine/engine/__tests__/kalender-sync.test.ts` — Vitest (pure Builder + resolveTerminKontext-Stub-db + Orchestrierung mit Fake-Provider).
- **Create** `scripts/verify-engine-kalender-sync.mts` — Live-Verify (Fake-Provider auf echtem Termin + graceful-no-op echte Provider, guarded; Cleanup).
- **Modify** `src/lib/termine/engine/index.ts` — Exports ergänzen.

**Pre-flight:** `npm ci` im Worktree-Root (frischer Worktree, kein `node_modules`).

---

## Task 1: Event-Kontext (`kalender-kontext.ts`) — TDD

**Files:**
- Create: `src/lib/termine/engine/__tests__/kalender-sync.test.ts`
- Create: `src/lib/termine/engine/kalender-kontext.ts`

- [ ] **Step 1: Pre-flight**

Run (Worktree-Root): `npm ci`
Expected: ok.

- [ ] **Step 2: Failing test schreiben**

Create `src/lib/termine/engine/__tests__/kalender-sync.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSummary, buildDescription, resolveTerminKontext, type KontextFelder } from '../kalender-kontext'

const LEER: KontextFelder = {
  claimNummer: null, fahrzeugHersteller: null, fahrzeugModell: null, kennzeichen: null,
  kundeName: null, kundeTelefon: null, schadenortAdresse: null, fallId: null,
}

describe('buildSummary', () => {
  it('Fahrzeug + Kennzeichen + Ort + Claim-Nr', () => {
    const s = buildSummary({ ...LEER, fahrzeugHersteller: 'VW', fahrzeugModell: 'Golf', kennzeichen: 'K-AB 123', claimNummer: 'CL-1' }, 'Domkloster 4, Köln')
    expect(s).toBe('VW Golf (K-AB 123) — Domkloster 4, Köln · CL-1')
  })
  it('Fallback Schadenbesichtigung ohne Fahrzeug', () => {
    expect(buildSummary(LEER, null)).toBe('Schadenbesichtigung')
  })
})

describe('buildDescription', () => {
  it('enthält Kunde/Telefon/Adresse + Fallakte-Link nur bei fallId', () => {
    const d = buildDescription({ ...LEER, kundeName: 'Max M', kundeTelefon: '0151', fallId: 'f1' }, 'Köln', 'https://app.test')
    expect(d).toContain('Kunde: Max M')
    expect(d).toContain('Telefon: 0151')
    expect(d).toContain('Adresse: Köln')
    expect(d).toContain('Fallakte: https://app.test/gutachter/fall/f1')
  })
  it('kein Fallakte-Link ohne fallId (Lead-bezug)', () => {
    expect(buildDescription(LEER, null, 'https://app.test')).not.toContain('Fallakte:')
  })
})

describe('resolveTerminKontext', () => {
  // Stub-db: pro Tabelle eine konfigurierte maybeSingle-Antwort.
  function stubDb(rows: Record<string, unknown>) {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: function () { return this },
          maybeSingle: async () => ({ data: rows[table] ?? null }),
        }),
      }),
    } as unknown as Parameters<typeof resolveTerminKontext>[1]
  }

  it('lead-bezug → Felder + Location aus termin.besichtigungsort_adresse', async () => {
    const db = stubDb({ leads: { vorname: 'Max', nachname: 'M', telefon: '0151', kennzeichen: 'K-AB 1', fahrzeug_hersteller: 'VW', fahrzeug_modell: 'Golf', besichtigungsort_adresse: 'Lead-Ort' } })
    const k = await resolveTerminKontext({ bezug_typ: 'lead', bezug_id: 'l1', besichtigungsort_adresse: 'Termin-Ort' }, db)
    expect(k.location).toBe('Termin-Ort')
    expect(k.summary).toContain('VW Golf')
    expect(k.description).toContain('Kunde: Max M')
  })

  it('kein bezug → generische Schadenbesichtigung', async () => {
    const db = stubDb({})
    const k = await resolveTerminKontext({ bezug_typ: null, bezug_id: null, besichtigungsort_adresse: null }, db)
    expect(k.summary).toBe('Schadenbesichtigung')
    expect(k.location).toBeUndefined()
  })
})
```

- [ ] **Step 3: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run src/lib/termine/engine/__tests__/kalender-sync.test.ts`
Expected: FAIL — „Cannot find module '../kalender-kontext'".

- [ ] **Step 4: Implementierung schreiben**

Create `src/lib/termine/engine/kalender-kontext.ts`:

```ts
// P2.5 — Event-Kontext fuer externe Kalender-Syncs, assignee-/bezug-generisch.
// resolveTerminKontext baut Summary/Description/Location aus dem bezug (claim/fall/lead)
// + dem in P2.3b gecachten termin.besichtigungsort_adresse. Pure Builder sind testbar.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface KontextFelder {
  claimNummer: string | null
  fahrzeugHersteller: string | null
  fahrzeugModell: string | null
  kennzeichen: string | null
  kundeName: string | null
  kundeTelefon: string | null
  schadenortAdresse: string | null
  fallId: string | null // fuer den Fallakte-Deep-Link; null bei reinem Lead
}

export interface TerminKontext {
  summary: string
  description: string
  location: string | undefined
}

const LEER: KontextFelder = {
  claimNummer: null, fahrzeugHersteller: null, fahrzeugModell: null, kennzeichen: null,
  kundeName: null, kundeTelefon: null, schadenortAdresse: null, fallId: null,
}

/** Event-Titel: Fahrzeug (+Kennzeichen) — Ort · Claim-Nr. Pure. */
export function buildSummary(f: KontextFelder, location: string | null): string {
  const auto = [f.fahrzeugHersteller, f.fahrzeugModell].filter(Boolean).join(' ')
  const kennz = f.kennzeichen ? ` (${f.kennzeichen})` : ''
  const head = auto ? `${auto}${kennz}` : 'Schadenbesichtigung'
  const ort = location ?? f.schadenortAdresse ?? ''
  const ref = f.claimNummer ? ` · ${f.claimNummer}` : ''
  return `${head}${ort ? ' — ' + ort : ''}${ref}`.trim()
}

/** Event-Beschreibung (Kunde/Telefon/Fahrzeug/Adresse/Fallakte-Link). Pure. */
export function buildDescription(f: KontextFelder, location: string | null, appUrl: string): string {
  const lines: string[] = ['Claimondo-Auftrag — Schadenbesichtigung', '']
  if (f.kundeName) lines.push(`Kunde: ${f.kundeName}`)
  if (f.kundeTelefon) lines.push(`Telefon: ${f.kundeTelefon}`)
  if (f.kennzeichen) lines.push(`Kennzeichen: ${f.kennzeichen}`)
  const auto = [f.fahrzeugHersteller, f.fahrzeugModell].filter(Boolean).join(' ')
  if (auto) lines.push(`Fahrzeug: ${auto}`)
  const adresse = location ?? f.schadenortAdresse
  if (adresse) lines.push(`Adresse: ${adresse}`)
  if (f.fallId) {
    lines.push('')
    lines.push(`Fallakte: ${appUrl}/gutachter/fall/${f.fallId}`)
  }
  return lines.join('\n')
}

async function ladeKunde(
  db: SupabaseClient, leadId: string | null, kundeId: string | null,
): Promise<{ name: string | null; telefon: string | null }> {
  if (leadId) {
    const { data: lead } = await db.from('leads').select('vorname, nachname, telefon').eq('id', leadId).maybeSingle()
    if (lead) return { name: [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null, telefon: (lead.telefon as string | null) ?? null }
  }
  if (kundeId) {
    const { data: p } = await db.from('profiles').select('vorname, nachname, telefon').eq('id', kundeId).maybeSingle()
    if (p) return { name: [p.vorname, p.nachname].filter(Boolean).join(' ') || null, telefon: (p.telefon as string | null) ?? null }
  }
  return { name: null, telefon: null }
}

async function ladeFallFelder(db: SupabaseClient, fallId: string): Promise<KontextFelder> {
  const { data: fall } = await db
    .from('faelle')
    .select('id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, kunde_id, claims:claim_id(claim_nummer, schadenort_adresse, schadenort_ort)')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return { ...LEER, fallId }
  const claim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  const kunde = await ladeKunde(db, (fall.lead_id as string | null) ?? null, (fall.kunde_id as string | null) ?? null)
  return {
    claimNummer: (claim?.claim_nummer as string | null) ?? null,
    fahrzeugHersteller: (fall.fahrzeug_hersteller as string | null) ?? null,
    fahrzeugModell: (fall.fahrzeug_modell as string | null) ?? null,
    kennzeichen: (fall.kennzeichen as string | null) ?? null,
    kundeName: kunde.name,
    kundeTelefon: kunde.telefon,
    schadenortAdresse: (claim?.schadenort_adresse as string | null) ?? (claim?.schadenort_ort as string | null) ?? null,
    fallId,
  }
}

async function ladeLeadFelder(db: SupabaseClient, leadId: string): Promise<KontextFelder> {
  const { data: lead } = await db
    .from('leads')
    .select('vorname, nachname, telefon, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, besichtigungsort_adresse')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return LEER
  return {
    claimNummer: null,
    fahrzeugHersteller: (lead.fahrzeug_hersteller as string | null) ?? null,
    fahrzeugModell: (lead.fahrzeug_modell as string | null) ?? null,
    kennzeichen: (lead.kennzeichen as string | null) ?? null,
    kundeName: [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null,
    kundeTelefon: (lead.telefon as string | null) ?? null,
    schadenortAdresse: (lead.besichtigungsort_adresse as string | null) ?? null,
    fallId: null,
  }
}

/**
 * Baut den Event-Kontext aus dem bezug des Termins. Location bevorzugt das
 * (in P2.3b gecachte) termin.besichtigungsort_adresse, sonst den Schadenort.
 * claim-bezug geht ueber die faelle-Bridge (claim_id) fuer Fahrzeug/Kunde,
 * sonst minimal aus claims.
 */
export async function resolveTerminKontext(
  termin: { bezug_typ: string | null; bezug_id: string | null; besichtigungsort_adresse: string | null },
  db: SupabaseClient,
): Promise<TerminKontext> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  let felder: KontextFelder = LEER
  if (termin.bezug_id) {
    if (termin.bezug_typ === 'fall') {
      felder = await ladeFallFelder(db, termin.bezug_id)
    } else if (termin.bezug_typ === 'lead') {
      felder = await ladeLeadFelder(db, termin.bezug_id)
    } else if (termin.bezug_typ === 'claim') {
      const { data: bridge } = await db.from('faelle').select('id').eq('claim_id', termin.bezug_id).maybeSingle()
      if (bridge?.id) {
        felder = await ladeFallFelder(db, bridge.id as string)
      } else {
        const { data: c } = await db.from('claims').select('claim_nummer, schadenort_adresse, schadenort_ort').eq('id', termin.bezug_id).maybeSingle()
        felder = { ...LEER, claimNummer: (c?.claim_nummer as string | null) ?? null, schadenortAdresse: (c?.schadenort_adresse as string | null) ?? (c?.schadenort_ort as string | null) ?? null }
      }
    }
  }
  const location = termin.besichtigungsort_adresse ?? felder.schadenortAdresse ?? null
  return {
    summary: buildSummary(felder, location),
    description: buildDescription(felder, location, appUrl),
    location: location ?? undefined,
  }
}
```

- [ ] **Step 5: Test laufen lassen — grün**

Run: `npx vitest run src/lib/termine/engine/__tests__/kalender-sync.test.ts`
Expected: PASS (Task-1-Teil grün).

- [ ] **Step 6: `</content>`-Scan + Commit**

Scan beide Dateien auf literales `</content>` am Ende, entfernen falls vorhanden.

```bash
git add src/lib/termine/engine/kalender-kontext.ts src/lib/termine/engine/__tests__/kalender-sync.test.ts
git commit -m "feat(termin-engine): P2.5 Teil 1 — Event-Kontext (bezug claim/fall/lead) fuer Kalender-Sync"
```

---

## Task 2: Provider + Orchestrierung (`kalender-sync.ts`) + index

**Files:**
- Create: `src/lib/termine/engine/kalender-sync.ts`
- Modify: `src/lib/termine/engine/index.ts`
- Modify: `src/lib/termine/engine/__tests__/kalender-sync.test.ts` (Orchestrierungs-Tests anhängen)

- [ ] **Step 1: Implementierung schreiben**

Create `src/lib/termine/engine/kalender-sync.ts`:

```ts
// P2.5 — syncTerminToExternalCalendar: assignee-generische externe-Kalender-Sync-Op.
// Generalisiert die zwei SV-/fall-gekoppelten sv-termin-sync (Google + CalDAV) zu einer
// Engine-Op ueber ein KalenderProvider-Interface. SV-only konkret (andere assignee-Typen
// → 'skip'). fail-soft je Provider (non-critical Sub-Op). NICHT verdrahtet (Phase-3-Repoint).
// Die alten sv-termin-sync.ts bleiben bis dahin (kein Doppel-Send).
import type { SupabaseClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { getGoogleOAuthClientForUser } from '@/lib/google/oauth-client'
import { GOOGLE_CALENDAR_TIMEZONE, toBerlinWallClock } from '@/lib/google-calendar/timezone'
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/kalender/caldav/client'
import { decrypt } from '@/lib/kalender/caldav/encryption'
import { resolveTerminKontext, type TerminKontext } from './kalender-kontext'

export type SyncStatus = 'created' | 'updated' | 'skip' | 'error'

export interface TerminSyncRow {
  id: string
  assignee_typ: string | null
  assignee_id: string | null
  start_zeit: string
  end_zeit: string
  status: string
  bezug_typ: string | null
  bezug_id: string | null
  besichtigungsort_adresse: string | null
  google_event_id: string | null
  google_calendar_id: string | null
  caldav_object_url: string | null
  caldav_event_uid: string | null
}

export interface KalenderProvider {
  name: string
  upsert(termin: TerminSyncRow, kontext: TerminKontext, db: SupabaseClient): Promise<SyncStatus>
  remove(termin: TerminSyncRow, db: SupabaseClient): Promise<SyncStatus>
}

export interface SyncResult {
  ok: boolean
  results: Record<string, SyncStatus>
  error?: string
}

const SYNC_SELECT =
  'id, assignee_typ, assignee_id, start_zeit, end_zeit, status, bezug_typ, bezug_id, ' +
  'besichtigungsort_adresse, google_event_id, google_calendar_id, caldav_object_url, caldav_event_uid'
const AKTIV_STATUS = ['reserviert', 'bestaetigt', 'verlegung_pending']

async function svProfileId(db: SupabaseClient, svId: string): Promise<string | null> {
  const { data } = await db.from('sachverstaendige').select('profile_id').eq('id', svId).maybeSingle()
  return (data?.profile_id as string | null) ?? null
}

// ─── Google ──────────────────────────────────────────────────────────────
export const googleProvider: KalenderProvider = {
  name: 'google',
  async upsert(termin, kontext, db) {
    if (termin.assignee_typ !== 'sachverstaendiger' || !termin.assignee_id) return 'skip'
    const profileId = await svProfileId(db, termin.assignee_id)
    if (!profileId) return 'skip'
    const auth = await getGoogleOAuthClientForUser(profileId)
    if (!auth) return 'skip'
    const calendar = google.calendar({ version: 'v3', auth })
    const eventBody = {
      summary: kontext.summary,
      description: kontext.description,
      location: kontext.location,
      start: { dateTime: toBerlinWallClock(termin.start_zeit), timeZone: GOOGLE_CALENDAR_TIMEZONE },
      end: { dateTime: toBerlinWallClock(termin.end_zeit), timeZone: GOOGLE_CALENDAR_TIMEZONE },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 15 }] },
    }
    if (termin.google_event_id) {
      await calendar.events.update({ calendarId: termin.google_calendar_id ?? 'primary', eventId: termin.google_event_id, requestBody: eventBody })
      return 'updated'
    }
    const resp = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody })
    const eventId = resp.data.id
    if (eventId) {
      await db.from('gutachter_termine').update({ google_event_id: eventId, google_calendar_id: 'primary' }).eq('id', termin.id)
    }
    return 'created'
  },
  async remove(termin, db) {
    if (termin.assignee_typ !== 'sachverstaendiger' || !termin.assignee_id || !termin.google_event_id) return 'skip'
    const profileId = await svProfileId(db, termin.assignee_id)
    if (!profileId) return 'skip'
    const auth = await getGoogleOAuthClientForUser(profileId)
    if (!auth) return 'skip'
    const calendar = google.calendar({ version: 'v3', auth })
    try {
      await calendar.events.delete({ calendarId: termin.google_calendar_id ?? 'primary', eventId: termin.google_event_id })
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      if (!/404|not.?found/i.test(m)) throw err
    }
    await db.from('gutachter_termine').update({ google_event_id: null, google_calendar_id: null }).eq('id', termin.id)
    return 'updated'
  },
}

// ─── CalDAV ──────────────────────────────────────────────────────────────
type CalDavConn = { server_url: string; username: string; password_encrypted: string; calendar_url: string | null }

async function caldavConn(db: SupabaseClient, svId: string): Promise<CalDavConn | null> {
  const { data } = await db
    .from('sv_kalender_verbindungen')
    .select('server_url, username, password_encrypted, calendar_url')
    .eq('sv_id', svId)
    .eq('provider', 'caldav')
    .maybeSingle()
  if (!data || !data.calendar_url) return null
  return data as CalDavConn
}

export const caldavProvider: KalenderProvider = {
  name: 'caldav',
  async upsert(termin, kontext, db) {
    if (termin.assignee_typ !== 'sachverstaendiger' || !termin.assignee_id) return 'skip'
    const conn = await caldavConn(db, termin.assignee_id)
    if (!conn || !conn.calendar_url) return 'skip'
    const password = decrypt(conn.password_encrypted)
    const creds = { serverUrl: conn.server_url, username: conn.username, password }
    if (termin.caldav_object_url && termin.caldav_event_uid) {
      await updateCalendarEvent({
        creds,
        objectUrl: termin.caldav_object_url,
        event: { uid: termin.caldav_event_uid, summary: kontext.summary, description: kontext.description, location: kontext.location, startIso: termin.start_zeit, endIso: termin.end_zeit },
      })
      await db.from('gutachter_termine').update({ caldav_synced_at: new Date().toISOString() }).eq('id', termin.id)
      return 'updated'
    }
    const result = await createCalendarEvent({
      creds,
      calendarUrl: conn.calendar_url,
      event: { summary: kontext.summary, description: kontext.description, location: kontext.location, startIso: termin.start_zeit, endIso: termin.end_zeit },
    })
    await db.from('gutachter_termine').update({ caldav_object_url: result.objectUrl, caldav_event_uid: result.uid, caldav_synced_at: new Date().toISOString() }).eq('id', termin.id)
    return 'created'
  },
  async remove(termin, db) {
    if (termin.assignee_typ !== 'sachverstaendiger' || !termin.assignee_id || !termin.caldav_object_url) return 'skip'
    const conn = await caldavConn(db, termin.assignee_id)
    if (!conn) return 'skip'
    const password = decrypt(conn.password_encrypted)
    await deleteCalendarEvent({ creds: { serverUrl: conn.server_url, username: conn.username, password }, objectUrl: termin.caldav_object_url })
    await db.from('gutachter_termine').update({ caldav_object_url: null, caldav_event_uid: null, caldav_synced_at: null }).eq('id', termin.id)
    return 'updated'
  },
}

const DEFAULT_PROVIDERS: KalenderProvider[] = [googleProvider, caldavProvider]

async function ladeTermin(db: SupabaseClient, terminId: string): Promise<TerminSyncRow | null> {
  const { data } = await db.from('gutachter_termine').select(SYNC_SELECT).eq('id', terminId).maybeSingle()
  return (data as unknown as TerminSyncRow | null) ?? null
}

function alleSkip(providers: KalenderProvider[]): Record<string, SyncStatus> {
  return Object.fromEntries(providers.map((p) => [p.name, 'skip' as SyncStatus]))
}

/**
 * Schreibt/aktualisiert die Buchung in die verbundenen Kalender des Assignees
 * (idempotent via gespeicherte Refs). SV-only; nicht-aktiver Status → skip
 * (Entfernen via entferneTerminAusExternemKalender). fail-soft je Provider.
 */
export async function syncTerminToExternalCalendar(
  terminId: string,
  opts?: { db?: SupabaseClient; providers?: KalenderProvider[] },
): Promise<SyncResult> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const providers = opts?.providers ?? DEFAULT_PROVIDERS
  const termin = await ladeTermin(db, terminId)
  if (!termin) return { ok: false, results: {}, error: 'Termin nicht gefunden' }
  if (termin.assignee_typ !== 'sachverstaendiger') return { ok: true, results: alleSkip(providers) }
  if (!AKTIV_STATUS.includes(termin.status)) return { ok: true, results: alleSkip(providers) }

  const kontext = await resolveTerminKontext(termin, db)
  const results: Record<string, SyncStatus> = {}
  for (const p of providers) {
    try {
      results[p.name] = await p.upsert(termin, kontext, db)
    } catch (err) {
      results[p.name] = 'error'
      console.error(`[kalender-sync] ${p.name} upsert fehlgeschlagen fuer Termin ${terminId}:`, err instanceof Error ? err.message : err)
    }
  }
  return { ok: true, results }
}

/** Entfernt die Buchung aus den verbundenen Kalendern (Storno/Ablehnung/Verlegung). fail-soft. */
export async function entferneTerminAusExternemKalender(
  terminId: string,
  opts?: { db?: SupabaseClient; providers?: KalenderProvider[] },
): Promise<SyncResult> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const providers = opts?.providers ?? DEFAULT_PROVIDERS
  const termin = await ladeTermin(db, terminId)
  if (!termin) return { ok: false, results: {}, error: 'Termin nicht gefunden' }
  const results: Record<string, SyncStatus> = {}
  for (const p of providers) {
    try {
      results[p.name] = await p.remove(termin, db)
    } catch (err) {
      results[p.name] = 'error'
      console.error(`[kalender-sync] ${p.name} remove fehlgeschlagen fuer Termin ${terminId}:`, err instanceof Error ? err.message : err)
    }
  }
  return { ok: true, results }
}
```

- [ ] **Step 2: Exports in `index.ts` ergänzen**

Append to `src/lib/termine/engine/index.ts`:

```ts
// P2.5 — externe Kalender-Sync (Google + CalDAV), assignee-generisch.
export { syncTerminToExternalCalendar, entferneTerminAusExternemKalender, googleProvider, caldavProvider } from './kalender-sync'
export type { KalenderProvider, SyncStatus, SyncResult, TerminSyncRow } from './kalender-sync'
export { resolveTerminKontext, buildSummary, buildDescription } from './kalender-kontext'
export type { TerminKontext, KontextFelder } from './kalender-kontext'
```

- [ ] **Step 3: Orchestrierungs-Tests anhängen (Fake-Provider, Stub-db)**

Append to `src/lib/termine/engine/__tests__/kalender-sync.test.ts`:

```ts
import { syncTerminToExternalCalendar, entferneTerminAusExternemKalender, type KalenderProvider } from '../kalender-sync'

describe('syncTerminToExternalCalendar — Orchestrierung (Fake-Provider, kein I/O)', () => {
  function stubDbMitTermin(termin: Record<string, unknown> | null) {
    return {
      from: (table: string) => ({
        select: () => ({
          eq: function () { return this },
          maybeSingle: async () => ({ data: table === 'gutachter_termine' ? termin : null }),
        }),
      }),
    } as unknown as Parameters<typeof syncTerminToExternalCalendar>[1] extends infer O ? (O extends { db?: infer D } ? D : never) : never
  }
  const fakeProvider = (status: 'created' | 'updated' | 'skip'): KalenderProvider => ({
    name: 'fake',
    upsert: async () => status,
    remove: async () => 'updated',
  })
  const aktiverTermin = {
    id: 't1', assignee_typ: 'sachverstaendiger', assignee_id: 'sv1', start_zeit: '2026-06-10T08:00:00Z',
    end_zeit: '2026-06-10T08:45:00Z', status: 'reserviert', bezug_typ: null, bezug_id: null,
    besichtigungsort_adresse: null, google_event_id: null, google_calendar_id: null,
    caldav_object_url: null, caldav_event_uid: null,
  }

  it('aktiver SV-Termin → Provider-Ergebnis durchgereicht', async () => {
    const r = await syncTerminToExternalCalendar('t1', { db: stubDbMitTermin(aktiverTermin), providers: [fakeProvider('created')] })
    expect(r.ok).toBe(true)
    expect(r.results.fake).toBe('created')
  })

  it('nicht-SV assignee → skip (Provider nicht aufgerufen)', async () => {
    let called = false
    const spy: KalenderProvider = { name: 'fake', upsert: async () => { called = true; return 'created' }, remove: async () => 'updated' }
    const r = await syncTerminToExternalCalendar('t1', { db: stubDbMitTermin({ ...aktiverTermin, assignee_typ: 'kanzlei' }), providers: [spy] })
    expect(r.results.fake).toBe('skip')
    expect(called).toBe(false)
  })

  it('nicht-aktiver Status → skip', async () => {
    const r = await syncTerminToExternalCalendar('t1', { db: stubDbMitTermin({ ...aktiverTermin, status: 'abgesagt' }), providers: [fakeProvider('created')] })
    expect(r.results.fake).toBe('skip')
  })

  it('Termin nicht gefunden → ok:false', async () => {
    const r = await syncTerminToExternalCalendar('t1', { db: stubDbMitTermin(null), providers: [fakeProvider('created')] })
    expect(r.ok).toBe(false)
  })

  it('entfernen ruft provider.remove', async () => {
    const r = await entferneTerminAusExternemKalender('t1', { db: stubDbMitTermin(aktiverTermin), providers: [fakeProvider('skip')] })
    expect(r.results.fake).toBe('updated')
  })
})
```

- [ ] **Step 4: Tests laufen lassen — grün**

Run: `npx vitest run src/lib/termine/engine/__tests__/kalender-sync.test.ts`
Expected: PASS (pure + Orchestrierung).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 6: `</content>`-Scan + Commit**

Scan `kalender-sync.ts` + `index.ts` + Test auf `</content>`, entfernen falls vorhanden.

```bash
git add src/lib/termine/engine/kalender-sync.ts src/lib/termine/engine/index.ts src/lib/termine/engine/__tests__/kalender-sync.test.ts
git commit -m "feat(termin-engine): P2.5 Teil 2 — syncTerminToExternalCalendar (Google+CalDAV Provider, SV-only)"
```

---

## Task 3: Live-Verify (`scripts/verify-engine-kalender-sync.mts`)

**Files:**
- Create: `scripts/verify-engine-kalender-sync.mts`

> **Safety:** KEIN ungebetenes Schreiben in echte SV-Privat-Kalender. Fake-Provider beweist die Orchestrierung auf echtem DB-Termin; der echte-Provider-Lauf wird NUR ausgeführt, wenn der SV nachweislich keine Google-/CalDAV-Verbindung hat (→ erwartet skip/skip).

- [ ] **Step 1: Verify-Script schreiben**

Create `scripts/verify-engine-kalender-sync.mts`:

```ts
// P2.5 Verify: syncTerminToExternalCalendar live. Fake-Provider beweist Orchestrierung +
// Kontext-Resolution auf echtem Termin (kein echtes Kalender-I/O); echter-Provider-Lauf nur
// bei SV OHNE Verbindung (→ skip/skip, graceful no-op). Temp-Termin via engine reserviere + Cleanup.
// Run: cp <main>/.env.local .env.local && npx tsx scripts/verify-engine-kalender-sync.mts && rm -f .env.local
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv(){const p=join(ROOT,'.env.local');if(!existsSync(p))return;for(const l of readFileSync(p,'utf-8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<0)continue;const k=t.slice(0,i).trim();const v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');if(!(k in process.env))process.env[k]=v}}
loadEnv()

const { createAdminClient } = await import('@/lib/supabase/admin')
const { reserviere, syncTerminToExternalCalendar, entferneTerminAusExternemKalender } = await import('@/lib/termine/engine')
const db = createAdminClient()

const out: Record<string, unknown> = {}
let terminId: string | null = null
try {
  const { data: sv } = await db.from('sachverstaendige')
    .select('id, profile_id').eq('ist_aktiv', true).eq('portal_zugang_freigeschaltet', true)
    .is('gesperrt_seit', null).is('geloescht_am', null).limit(1).maybeSingle()
  const { data: lead } = await db.from('leads').select('id').limit(1).maybeSingle()
  if (!sv?.id || !lead?.id) {
    out.VERDICT = 'SKIPPED (kein dispatchbarer SV oder kein lead)'
  } else {
    // Temp-Termin (weit in der Zukunft, eindeutiges Fenster) via engine reserviere.
    const von = new Date(Date.now() + 90 * 24 * 60 * 60_000); von.setHours(9, 0, 0, 0)
    const bis = new Date(von.getTime() + 45 * 60_000)
    const res = await reserviere({ assignee: { typ: 'sachverstaendiger', id: sv.id as string }, von: von.toISOString(), bis: bis.toISOString(), quelle: 'manuell', bezug: { typ: 'lead', id: lead.id as string }, db })
    if (!res.ok) { out.VERDICT = `FEHLER (reserviere: ${res.error})`; }
    else {
      terminId = res.terminId
      // (1) Fake-Provider: Orchestrierung + Kontext-Resolution, KEIN echtes I/O.
      let upserted: Record<string, unknown> | null = null
      const fake = { name: 'fake', upsert: async (_t: unknown, k: unknown) => { upserted = k as Record<string, unknown>; return 'created' as const }, remove: async () => 'updated' as const }
      const r1 = await syncTerminToExternalCalendar(terminId, { db, providers: [fake] })
      out.fake = { results: r1.results, summary: upserted ? (upserted as { summary?: string }).summary : null }

      // (2) Echte Provider nur wenn SV KEINE Verbindung hat → erwartet skip/skip.
      const hatGoogle = !!(await db.from('profiles').select('google_refresh_token').eq('id', sv.profile_id as string).maybeSingle()).data?.google_refresh_token
      const hatCaldav = !!(await db.from('sv_kalender_verbindungen').select('id').eq('sv_id', sv.id as string).eq('provider', 'caldav').maybeSingle()).data
      if (!hatGoogle && !hatCaldav) {
        const r2 = await syncTerminToExternalCalendar(terminId, { db })
        out.echteProvider = r2.results
        out.echterLaufOk = r2.results.google === 'skip' && r2.results.caldav === 'skip'
      } else {
        out.echteProvider = 'SKIPPED (SV hat Verbindung — kein ungebetenes Schreiben)'
        out.echterLaufOk = true
      }

      const fakeOk = r1.ok && r1.results.fake === 'created'
      out.VERDICT = fakeOk && out.echterLaufOk ? 'GRUEN' : 'FEHLER'
    }
  }
} finally {
  if (terminId) {
    const { error } = await db.from('gutachter_termine').delete().eq('id', terminId)
    out.cleanup = error ? `FEHLER: ${error.message}` : `geloescht ${terminId}`
  }
}
console.log(JSON.stringify(out, null, 2))
```

- [ ] **Step 2: Verify laufen lassen**

Run (Worktree-Root): `cp "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local" .env.local && npx tsx scripts/verify-engine-kalender-sync.mts && rm -f .env.local`
Expected: `"VERDICT": "GRUEN"`, `fake.results.fake = "created"`, `fake.summary` gesetzt (Kontext aufgelöst), `echteProvider` = skip/skip oder SKIPPED, `cleanup: "geloescht …"`.

- [ ] **Step 3: tsc inkl. .mts**

Run: `npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 4: `</content>`-Scan + Commit**

```bash
git add scripts/verify-engine-kalender-sync.mts
git commit -m "test(termin-engine): P2.5 Verify — syncTerminToExternalCalendar live (Fake-Provider + graceful no-op + Cleanup)"
```

---

## Task 4: 7-Punkte-Audit + PR gegen `staging`

- [ ] **Step 1: Build-Gate**

Run: `npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 2: Regression-/Redundanz-Beleg**

- Konsumenten von `syncTerminToExternalCalendar`: **noch keine** (additiv; Phase-3-Repoint verdrahtet). Bestehende `sv-termin-sync.ts` (Google + CalDAV) unverändert → 0 Regression.
- Redundanz: Provider-Clients (googleapis/caldav-client) + `toBerlinWallClock` importiert, nicht re-derived; Event-Builder generalisiert (Port). Run zum Beleg: `git -C . grep -n "syncTerminToExternalCalendar" src/ | cat` → nur Engine-intern + index.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin kitta/termin-engine-p2-5
gh pr create --base staging --title "feat(termin-engine): P2.5 — syncTerminToExternalCalendar (Google+CalDAV, assignee-generisch)" --body "<Audit-Body unten>"
```

PR-Body Audit-Block:
```
Audit:
- Build: grün (npx tsc --noEmit; kein Routen-Change → kein next build)
- UI: n/a (Engine-lib; verdrahtet via Phase-3-Repoint)
- Redundanz: Provider-Clients + toBerlinWallClock wiederverwendet; sv-termin-sync unberührt
- Dead-Code: nichts gelöscht; additiv (3 neue Files + index-Export)
- Spec: §5/§6 Strecke-Design; Port + SV-only (Aaron 02.06.); KB/sv_lead/kanzlei + Zwei-Wege-Sync deferred
- Inkonsistenz: Result-Object {ok,results}; DB-Spalten live verifiziert; TZ via toBerlinWallClock (Google), ISO (CalDAV)
- Regression: 0 Consumer (grep); sv-termin-sync/Dispatch unberührt; vitest grün; Live-Verify GRUEN
```

- [ ] **Step 4: NICHT mergen** — nicht die Merge-Session; PR offen lassen.

---

## Self-Review (Plan gegen Spec)

**Spec-Coverage** (Strecke-Design §5 `syncTerminToExternalCalendar` + Handoff §P2.5):
- „generalisiert sv-termin-sync (Google + CalDAV) → schreibt Engine-Buchung in den verbundenen Kalender des Assignees" → Task 2 (beide Provider). ✓
- „toBerlinWallClock nutzen (2h-Falle)" → googleProvider nutzt toBerlinWallClock + timeZone. ✓ (CalDAV nutzt ISO direkt, wie Bestand.)
- assignee-generische Signatur, SV-only konkret → ja; andere Typen `skip`. ✓
- idempotent (Refs), fail-soft je Provider, status-gated, Entfernen-Variante → ja. ✓
- Event-Kontext aus bezug (claim/fall/lead) + termin.besichtigungsort → Task 1. ✓

**Placeholder-Scan:** kein TBD/TODO; jeder Step hat realen Code + Command + erwartete Ausgabe. ✓

**Typ-Konsistenz:** `TerminSyncRow`/`TerminKontext`/`KontextFelder`/`SyncStatus`/`KalenderProvider` konsistent zwischen kalender-kontext.ts, kalender-sync.ts, Tests, Verify. `resolveTerminKontext`-Signatur (termin-Teilform + db) == Aufruf in kalender-sync. ✓

**Bewusste Grenzen (dokumentiert):**
- KB-Google trivial später (getGoogleOAuthClientForUser(assignee.id)); CalDAV bleibt SV-only.
- Provider-Write live nur indirekt verifiziert (kein ungebetenes Schreiben in Privat-Kalender) — über prod-bewährte Clients + Fake-Provider-Tests.
- claim-bezug nutzt faelle-Bridge (claim_id) für Fahrzeug/Kunde; reiner claim ohne fall → minimal (claim_nummer + schadenort).
