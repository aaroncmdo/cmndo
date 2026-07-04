# SP2d — Rückruf-CalDAV-Sync — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline).

**Goal:** Rückrufe (`admin_termine`) syncen zusätzlich nach CalDAV (heute nur Google) + Wiring-Lücken schließen.

**Architecture:** 3 CalDAV-Spalten → geteilter `buildAdminEventContent`-Helper → Google-Modul faithful darauf refactoren + CalDAV-Hook → neues CalDAV-Modul (mirror Google) → 2 Staff-Sites wiren.

**Tech Stack:** Next.js 16, Supabase, `apply_migration`, vitest.

## Global Constraints
- Regel 1: Branch `kitta/rueckruf-caldav-sync` (erstellt, stacked auf SP2c), PR gegen SP2c-Branch.
- Regel 2: Migration via `apply_migration`, File==Version. Owner-Gate + fail-soft bewahren. Google-Verhalten inhaltlich unverändert.
- 7-Punkte-Audit. CalDAV-Client-Primitiven wie `caldavProvider`: `createCalendarEvent({creds,calendarUrl,event})→{objectUrl,uid}` · `updateCalendarEvent({creds,objectUrl,event:{uid,...}})` · `deleteCalendarEvent({creds,objectUrl})` · `decrypt` aus `@/lib/kalender/caldav/encryption`. creds = `{serverUrl,username,password}`.

## File Structure
- **Create:** `supabase/migrations/<V>_admin_termine_caldav_spalten.sql`.
- **Create:** `src/lib/kalender/admin-event-content.ts` (+ `__tests__/admin-event-content.test.ts`).
- **Create:** `src/lib/kalender/caldav/admin-event-sync.ts`.
- **Modify:** `src/lib/google-calendar/admin-event-sync.ts` (Helper nutzen + CalDAV-Hook).
- **Modify:** `src/app/dispatch/leads/[id]/_actions/rueckruf.ts` (closeOpenRueckrufTermin), `src/app/faelle/[id]/_sidebar/rueckruf-actions.ts` (4 Sites).

---

### Task 1: Migration — 3 CalDAV-Spalten auf `admin_termine`

- [ ] **Step 1: `apply_migration`** (name `admin_termine_caldav_spalten`):
```sql
-- SP2d: CalDAV-Sync-Spalten fuer admin_termine (Rueckrufe), spiegelt die vorhandenen
-- google_event_id/google_calendar_id/google_event_synced_at. Additiv, nullable.
alter table admin_termine
  add column if not exists caldav_object_url text,
  add column if not exists caldav_event_uid text,
  add column if not exists caldav_synced_at timestamptz;
```
- [ ] **Step 2: `list_migrations`** → Version `<V>`. **Step 3: File** `<V>_admin_termine_caldav_spalten.sql`. **Step 4: READ-Verify** (Spalten existieren). **Step 5: Commit.**

---

### Task 2: Geteilter Content-Builder + Test (TDD)

**Files:** Create `src/lib/kalender/admin-event-content.ts`, `src/lib/kalender/__tests__/admin-event-content.test.ts`.

**Interfaces:** `formatAdminEventContent(t, lead) → { title, description, startIso, endIso }` (pure) + `buildAdminEventContent(t, db)` (I/O).

- [ ] **Step 1: Failing test:**
```ts
import { describe, it, expect } from 'vitest'
import { formatAdminEventContent } from '../admin-event-content'
const BASE = { typ: 'rueckruf', titel: 'Rückruf', beschreibung: null, notizen: null, lead_id: null, fall_id: null, start_zeit: '2026-07-10T08:00:00.000Z', end_zeit: null as string | null }
describe('formatAdminEventContent', () => {
  it('Titel + Kunde/Telefon aus Lead', () => {
    const c = formatAdminEventContent(BASE, { vorname: 'Max', nachname: 'M', telefon: '0151' })
    expect(c.title).toContain('Claimondo · Rückruf')
    expect(c.description).toContain('Kunde: Max M')
    expect(c.description).toContain('Telefon: 0151')
  })
  it('end-Fallback +15min wenn kein end_zeit', () => {
    const c = formatAdminEventContent(BASE, null)
    expect(c.startIso).toBe('2026-07-10T08:00:00.000Z')
    expect(c.endIso).toBe('2026-07-10T08:15:00.000Z')
  })
})
```
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** `admin-event-content.ts`:
```ts
// SP2d: geteilter Content-Builder fuer admin_termine-Kalender-Events (Google + CalDAV).
// Extrahiert aus google-calendar/admin-event-sync.ts, damit beide Provider identische
// Titel/Beschreibung/Zeiten nutzen.
import type { createAdminClient } from '@/lib/supabase/admin'

export type AdminEventInput = {
  typ: string; titel: string; beschreibung: string | null; notizen: string | null
  lead_id: string | null; fall_id: string | null; start_zeit: string; end_zeit: string | null
}
export type AdminEventContent = { title: string; description: string; startIso: string; endIso: string }

const TYP_LABEL: Record<string, string> = {
  rueckruf: 'Rückruf', kunde: 'Kundentermin', intern: 'Intern', kb_beratung: 'KB-Beratung',
}

/** Pure: Termin (+ optional Lead) -> Titel/Description/Zeiten. startIso/endIso = rohe UTC-ISO. */
export function formatAdminEventContent(
  t: AdminEventInput,
  lead: { vorname: string | null; nachname: string | null; telefon: string | null } | null,
): AdminEventContent {
  const leadInfo = lead ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') : ''
  const leadTel = lead?.telefon ?? ''
  const typLabel = TYP_LABEL[t.typ] ?? t.typ
  const title = `Claimondo · ${typLabel}${t.titel && t.titel !== leadInfo ? ` · ${t.titel}` : leadInfo ? ` · ${leadInfo}` : ''}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const description = [
    t.beschreibung,
    leadInfo ? `Kunde: ${leadInfo}` : null,
    leadTel ? `Telefon: ${leadTel}` : null,
    t.notizen ? `Notiz: ${t.notizen}` : null,
    t.lead_id ? `Lead: ${appUrl}/dispatch/leads/${t.lead_id}` : null,
    t.fall_id ? `Fall: ${appUrl}/faelle/${t.fall_id}` : null,
  ].filter(Boolean).join('\n')
  const startDate = new Date(t.start_zeit)
  const endIso = t.end_zeit ?? new Date(startDate.getTime() + 15 * 60 * 1000).toISOString()
  return { title, description, startIso: t.start_zeit, endIso }
}

/** I/O: holt Lead-Kontext (falls lead_id) + formatiert. */
export async function buildAdminEventContent(
  t: AdminEventInput, db: ReturnType<typeof createAdminClient>,
): Promise<AdminEventContent> {
  let lead: { vorname: string | null; nachname: string | null; telefon: string | null } | null = null
  if (t.lead_id) {
    const { data } = await db.from('leads').select('vorname, nachname, telefon').eq('id', t.lead_id).maybeSingle()
    lead = (data as typeof lead) ?? null
  }
  return formatAdminEventContent(t, lead)
}
```
- [ ] **Step 4: Run → pass. Step 5: tsc (0). Step 6: Commit.**

---

### Task 3: CalDAV-Modul + Google-Modul refactoren

**Files:** Create `src/lib/kalender/caldav/admin-event-sync.ts`; Modify `src/lib/google-calendar/admin-event-sync.ts`.

- [ ] **Step 1: CalDAV-Modul** `src/lib/kalender/caldav/admin-event-sync.ts`:
```ts
// SP2d: CalDAV-Sync fuer admin_termine (Rueckrufe). Spiegelt google-calendar/admin-event-sync,
// keyed auf zugewiesen_an -> dessen kalender_verbindungen-CalDAV-Verbindung. Owner-gated, fail-soft.
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/kalender/caldav/encryption'
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '@/lib/kalender/caldav/client'
import { buildAdminEventContent, type AdminEventInput } from '@/lib/kalender/admin-event-content'

type Row = AdminEventInput & {
  id: string; status: string | null; zugewiesen_an: string | null
  caldav_object_url: string | null; caldav_event_uid: string | null
}

export async function syncAdminTerminToCalDav(terminId: string): Promise<void> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('admin_termine')
      .select('id, typ, titel, beschreibung, notizen, start_zeit, end_zeit, status, zugewiesen_an, lead_id, fall_id, caldav_object_url, caldav_event_uid')
      .eq('id', terminId)
      .maybeSingle()
    if (!data) return
    const t = data as unknown as Row
    if (!t.zugewiesen_an) return // Pool-Rueckruf ohne Owner -> skip

    const shouldDelete = t.status === 'erledigt' || t.status === 'abgesagt' || t.status === 'storniert'
    const shouldUpsert = !shouldDelete && t.status === 'offen'

    const { data: conn } = await db
      .from('kalender_verbindungen')
      .select('server_url, username, password_encrypted, calendar_url')
      .eq('profile_id', t.zugewiesen_an)
      .eq('provider', 'caldav')
      .maybeSingle()

    if (shouldDelete) {
      if (t.caldav_object_url && conn) {
        const password = decrypt(conn.password_encrypted as string)
        await deleteCalendarEvent({
          creds: { serverUrl: conn.server_url as string, username: conn.username as string, password },
          objectUrl: t.caldav_object_url,
        }).catch((err) => console.warn('[admin-caldav] delete:', err instanceof Error ? err.message : err))
      }
      if (t.caldav_object_url) {
        await db.from('admin_termine').update({ caldav_object_url: null, caldav_event_uid: null, caldav_synced_at: new Date().toISOString() }).eq('id', terminId)
      }
      return
    }
    if (!shouldUpsert || !conn || !conn.calendar_url) return

    const password = decrypt(conn.password_encrypted as string)
    const creds = { serverUrl: conn.server_url as string, username: conn.username as string, password }
    const { title, description, startIso, endIso } = await buildAdminEventContent(t, db)

    if (t.caldav_object_url && t.caldav_event_uid) {
      await updateCalendarEvent({ creds, objectUrl: t.caldav_object_url, event: { uid: t.caldav_event_uid, summary: title, description, startIso, endIso } })
      await db.from('admin_termine').update({ caldav_synced_at: new Date().toISOString() }).eq('id', terminId)
    } else {
      const result = await createCalendarEvent({ creds, calendarUrl: conn.calendar_url as string, event: { summary: title, description, startIso, endIso } })
      await db.from('admin_termine').update({ caldav_object_url: result.objectUrl, caldav_event_uid: result.uid, caldav_synced_at: new Date().toISOString() }).eq('id', terminId)
    }
  } catch (err) {
    console.warn('[admin-caldav] sync fuer', terminId, 'fehlgeschlagen:', err instanceof Error ? err.message : err)
  }
}
```
(CalDAV-Client-Event-Shape gegen `caldav/client` verifizieren — ggf. `location` optional ergänzen; Rückrufe telefonisch → keine location.)
- [ ] **Step 2: Google-Modul refactoren** — `syncAdminTerminCalendarEvent`: (a) oben nach dem `t`-Cast die Hook-Zeile `await import('@/lib/kalender/caldav/admin-event-sync').then((m) => m.syncAdminTerminToCalDav(terminId)).catch(() => {})` (CalDAV parallel, fail-soft, läuft auch bei delete/skip); (b) die Inline-Content-Logik (leadInfo-Fetch/title/descLines/startDate/endDate) ersetzen durch `const { title, description, startIso, endIso } = await buildAdminEventContent(t, db)`; (c) im events.update/insert `descLines.join('\n')`→`description`, `toBerlinWallClock(startDate.toISOString())`→`toBerlinWallClock(startIso)`, `endDate.toISOString()`→`toBerlinWallClock(endIso)`; TYP_LABEL-const im Google-File entfernen (jetzt im Helper). Google-Insert/Update/Delete-Logik sonst unverändert.
- [ ] **Step 3: tsc (0).** **Step 4: Commit.**

---

### Task 4: Wiring-Lücken (closeOpenRueckrufTermin + Fallakte)

**Files:** Modify `src/app/dispatch/leads/[id]/_actions/rueckruf.ts`, `src/app/faelle/[id]/_sidebar/rueckruf-actions.ts`.

- [ ] **Step 1: `closeOpenRueckrufTermin`** (dispatch/rueckruf.ts) — nach dem Status-Update (`erledigt`/`abgesagt`) `await syncAdminTerminCalendarEvent(<terminId>)` (die betroffene admin_termin-id; Import aus `@/lib/google-calendar/admin-event-sync`). Fail-soft (Funktion ist intern fail-silent).
- [ ] **Step 2: Fallakte `rueckruf-actions.ts`** — an den 4 Sites (`saveFallRueckruf` insert/update/storno + `markFallRueckrufErledigt`) nach dem Write `await syncAdminTerminCalendarEvent(<terminId>)`. Die jeweilige admin_termin-id aus dem Write/Read übernehmen.
- [ ] **Step 3: tsc (0) + Full-Build** (Server-Actions betroffen). **Step 4: Commit.**

---

### Task 5: Verifikation + PR

- [ ] **Step 1:** tsc 0 · Full-Build 0 · vitest (admin-event-content + Domain) · 3 Ratchets 0 neue.
- [ ] **Step 2: Prod-Smoke (READ):** 3 Spalten live; für einen Rückruf mit Owner die kalender_verbindungen-caldav-Query (aktuell 0 → skip sauber). Google-Sync-Extract per Build abgesichert.
- [ ] **Step 3: 7-Punkte-Audit + Session-Abschluss-Check.**
- [ ] **Step 4: Push + PR** gegen `kitta/kb-termine-kalender-sync` (SP2c-Branch, stacked).
- [ ] **Step 5: Marker + MEMORY.md** (SP2d gebaut → Feature komplett).

## Self-Review
- Spec-Coverage: Migration(T1), Helper(T2), CalDAV+Google-Refactor(T3), Wiring(T4), Verify(T5).
- Platzhalter: `<terminId>` je Site = vorhandene id-Variable (beim Ausführen gelesen). CalDAV-Client-Shape gegen `caldav/client` verifizieren (Step-3-Note).
- Typ-Konsistenz: `AdminEventInput`/`AdminEventContent` geteilt; `buildAdminEventContent(t, db)`; `syncAdminTerminToCalDav(terminId)`.
- Risiko: Google-Extract faithful (Build+Smoke); CalDAV additiv+owner-gated+fail-soft.
