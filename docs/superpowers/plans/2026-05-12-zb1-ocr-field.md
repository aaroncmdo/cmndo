# ZB1-OCR-Field-Type im DynamicWizard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neuer Field-Typ `zb1-upload` im Onboarding-Wizard, der per Kamera-Capture den Fahrzeugschein fotografiert, via existing Token-Endpoint OCR laufen lässt und die extrahierten Daten in einer editierbaren Preview-Card anzeigt, bevor der Wizard zur nächsten Phase geht.

**Architektur:** Wizard erzeugt beim Server-Render eine `dokument_upload_anfragen`-Row mit slot `fahrzeugschein`, reicht den Token an das neue `Zb1UploadField`. Field nutzt `<input capture="environment">`, callt `uploadDokumentViaAnfrageToken` (bestehend), zeigt 4 editierbare Felder. Korrigierte Werte werden via neuer Server-Action `confirmZb1Korrekturen` als Force-Update zurückgeschrieben. "Neu fotografieren" callt `clearZb1Felder` damit die H6-Regel im Endpoint die neuen Werte schreiben kann.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase Postgres/Storage, Vitest (Unit-Tests für Server-Helpers), Manual-Smoke auf Mobile (UI-Component).

**Spec:** `docs/superpowers/specs/2026-05-12-zb1-ocr-field-design.md`

---

## File Structure

**Neu erstellt:**
- `src/components/onboarding/fields/Zb1UploadField.tsx` — UI-Component (Client). Capture → Upload → Preview → Confirm. Zustands-Maschine.
- `src/lib/onboarding/ensure-zb1-anfrage.ts` — Server-Helper. Idempotenter Token-Resolver für Pending-`dokument_upload_anfragen`.
- `src/app/kunde/onboarding-details/zb1-actions.ts` — Server-Actions `confirmZb1Korrekturen` + `clearZb1Felder` mit Auth-Check.
- `supabase/migrations/<timestamp>_add_fahrzeug_phase.sql` — DB-Migration für neue Phase + Feld.
- `src/lib/onboarding/__tests__/ensure-zb1-anfrage.test.ts` — Vitest für den Server-Helper.

**Geändert:**
- `src/components/onboarding/types.ts` — `FieldTyp` um `'zb1-upload'` erweitern.
- `src/components/onboarding/DynamicWizard.tsx` — bei `zb1-upload`-Feld den Token resolven und an Client reichen.
- `src/components/onboarding/WizardClient.tsx` — Prop `zb1Token` durchreichen, FieldRenderer-Switch um neuen Typ erweitern.
- `src/app/upload/dokumente/[token]/actions.ts` — Zeile 134, Mehrfach-Upload-Block um `fahrzeugschein` lockern.

---

## Task 1: FieldTyp erweitern + DB-Migration

**Files:**
- Modify: `src/components/onboarding/types.ts:1-4`
- Create: `supabase/migrations/<timestamp>_add_fahrzeug_phase.sql`

- [ ] **Step 1: FieldTyp erweitern**

In `src/components/onboarding/types.ts:1-4` ändern:

```typescript
export type FieldTyp =
  | 'text' | 'email' | 'tel' | 'number'
  | 'textarea' | 'segmented' | 'toggle-cards'
  | 'select' | 'slot' | 'signature' | 'file' | 'checkbox'
  | 'zb1-upload'
```

- [ ] **Step 2: Migration erzeugen**

Im Projekt-Root:

```bash
npx supabase migration new add_fahrzeug_phase
```

Erwartete Ausgabe: Pfad zur neuen Migration-Datei.

- [ ] **Step 3: Migration-SQL schreiben**

In die neue `supabase/migrations/<timestamp>_add_fahrzeug_phase.sql`:

```sql
-- AAR-zb1-wizard: fahrzeug-Phase als Step 1 in 'kunde-onboarding' Flow.
-- Existierende Phasen rücken um 1 nach hinten, damit fahrzeug Position 1 hat.
-- Field-Typ 'zb1-upload' triggert kamera-basierten Fahrzeugschein-Upload
-- mit OCR via existing dokument_upload_anfragen-Pipeline.

BEGIN;

-- 1. Existierende Phasen verschieben (höchste reihenfolge zuerst, damit kein UNIQUE-Conflict)
UPDATE onboarding_phasen
SET reihenfolge = reihenfolge + 1
WHERE flow_key = 'kunde-onboarding';

-- 2. Neue fahrzeug-Phase auf Position 1
INSERT INTO onboarding_phasen (flow_key, phase_key, reihenfolge, titel, eyebrow, beschreibung)
VALUES (
  'kunde-onboarding',
  'fahrzeug',
  1,
  'Ihr Fahrzeug',
  'Schritt 1',
  'Fotografieren Sie den Fahrzeugschein — wir lesen Kennzeichen, Hersteller und Halter automatisch aus.'
);

-- 3. Feld fahrzeugschein_foto in die neue Phase einhängen.
--    db_target.spalte = 'kennzeichen' → ladeNoetigePhasen skippt die Phase,
--    sobald leads.kennzeichen befüllt ist (egal ob durch OCR oder Dispatcher).
INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, hint, pflicht, db_target)
SELECT
  id,
  1,
  'fahrzeugschein_foto',
  'zb1-upload',
  'Fahrzeugschein',
  'Vorderseite des Fahrzeugscheins fotografieren — wir extrahieren die Daten automatisch.',
  true,
  jsonb_build_object('tabelle', 'leads', 'spalte', 'kennzeichen')
FROM onboarding_phasen
WHERE flow_key = 'kunde-onboarding' AND phase_key = 'fahrzeug';

COMMIT;
```

- [ ] **Step 4: Migration anwenden (lokal verifizieren)**

```bash
npx supabase db push
```

Erwartete Ausgabe: `Applying migration <timestamp>_add_fahrzeug_phase.sql`, kein Error.

- [ ] **Step 5: Verifikation via Supabase MCP**

Mit `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT reihenfolge, phase_key, titel
FROM onboarding_phasen
WHERE flow_key = 'kunde-onboarding'
ORDER BY reihenfolge;
```

Erwartete Reihenfolge: `1 fahrzeug`, `2 hergang`, `3 service`, `4 kanzlei`, `5 sa` (oder analog je nach DB-Stand).

```sql
SELECT feld_key, typ, db_target, pflicht
FROM onboarding_felder
WHERE feld_key = 'fahrzeugschein_foto';
```

Erwartet: 1 Zeile, `typ='zb1-upload'`, `db_target={"tabelle":"leads","spalte":"kennzeichen"}`, `pflicht=true`.

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/types.ts supabase/migrations/
git commit -m "feat(onboarding): zb1-upload FieldTyp + fahrzeug-Phase Migration

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: ensure-zb1-anfrage Server-Helper

**Files:**
- Create: `src/lib/onboarding/ensure-zb1-anfrage.ts`
- Create: `src/lib/onboarding/__tests__/ensure-zb1-anfrage.test.ts`

- [ ] **Step 1: Test schreiben (failing)**

Datei `src/lib/onboarding/__tests__/ensure-zb1-anfrage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureZb1Anfrage } from '../ensure-zb1-anfrage'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

describe('ensureZb1Anfrage', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returnt Token einer bestehenden Pending-Anfrage', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const mockDb = mockClientWithPending('lead-1', 'tok-existing')
    vi.mocked(createAdminClient).mockReturnValue(mockDb as never)

    const res = await ensureZb1Anfrage('lead-1')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.token).toBe('tok-existing')
  })

  it('legt neue Anfrage an wenn keine Pending existiert', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const mockDb = mockClientNoPending('lead-2', 'tok-new')
    vi.mocked(createAdminClient).mockReturnValue(mockDb as never)

    const res = await ensureZb1Anfrage('lead-2')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.token).toBe('tok-new')
  })

  it('returnt error wenn Insert fehlschlägt', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const mockDb = mockClientInsertFails()
    vi.mocked(createAdminClient).mockReturnValue(mockDb as never)

    const res = await ensureZb1Anfrage('lead-3')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/Anfrage konnte nicht erstellt werden/)
  })
})

// ─── Mock-Helpers ─────────────────────────────────────────────────────

function mockClientWithPending(leadId: string, token: string) {
  return {
    from: (table: string) => {
      if (table !== 'dokument_upload_anfragen') throw new Error(`Unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                contains: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: { token, lead_id: leadId } }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }
    },
  }
}

function mockClientNoPending(leadId: string, newToken: string) {
  let insertCalled = false
  return {
    from: (table: string) => {
      if (table !== 'dokument_upload_anfragen') throw new Error(`Unexpected table ${table}`)
      if (!insertCalled) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  contains: () => ({
                    order: () => ({
                      limit: () => ({ maybeSingle: async () => ({ data: null }) }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: () => {
            insertCalled = true
            return {
              select: () => ({
                single: async () => ({ data: { token: newToken, lead_id: leadId } }),
              }),
            }
          },
        }
      }
      throw new Error('insert called twice')
    },
  }
}

function mockClientInsertFails() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              contains: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data: null }) }),
                }),
              }),
            }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { message: 'boom' } }),
        }),
      }),
    }),
  }
}
```

- [ ] **Step 2: Test laufen lassen — erwartet failing**

```bash
npx vitest run src/lib/onboarding/__tests__/ensure-zb1-anfrage.test.ts
```

Erwartet: 3× FAIL ("Cannot find module ../ensure-zb1-anfrage").

- [ ] **Step 3: Implementierung schreiben**

Datei `src/lib/onboarding/ensure-zb1-anfrage.ts`:

```typescript
'use server'

// AAR-zb1-wizard: Server-Helper. Findet eine bestehende Pending-Anfrage
// für (lead_id, slot='fahrzeugschein') mit ocr=true oder legt eine neue
// an. Idempotent gegenüber Page-Reload — der Wizard kann den Helper
// beim Render mehrfach rufen ohne Token-Müll zu produzieren.
//
// Eine Anfrage gilt als "Pending" wenn:
//   - status IN ('gesendet', 'teilweise')
//   - expires_at in der Zukunft
//   - slots-Array enthält Eintrag mit slot_id='fahrzeugschein' und ocr=true

import { createAdminClient } from '@/lib/supabase/admin'

export type EnsureZb1Result =
  | { ok: true; token: string }
  | { ok: false; error: string }

export async function ensureZb1Anfrage(leadId: string): Promise<EnsureZb1Result> {
  if (!leadId) return { ok: false, error: 'leadId fehlt' }

  const db = createAdminClient()

  // 1. Lookup: gibt es eine pending Anfrage mit fahrzeugschein-Slot?
  const { data: existing } = await db
    .from('dokument_upload_anfragen')
    .select('token, lead_id')
    .eq('lead_id', leadId)
    .in('status', ['gesendet', 'teilweise'])
    .gte('expires_at', new Date().toISOString())
    .contains('slots', [{ slot_id: 'fahrzeugschein', ocr: true }])
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing && (existing as { token?: string }).token) {
    return { ok: true, token: (existing as { token: string }).token }
  }

  // 2. Neue Anfrage anlegen. Token = crypto.randomUUID() ist okay,
  //    die existing Token-Spalte erwartet >= 16 chars und Eindeutigkeit.
  const token = crypto.randomUUID().replace(/-/g, '')
  const slots = [
    {
      slot_id: 'fahrzeugschein',
      label: 'Fahrzeugschein (Vorderseite)',
      ocr: true,
      hochgeladen: false,
      doc_url: null,
      hochgeladen_am: null,
    },
  ]
  // expires_at = +7 Tage. Das Onboarding dauert idR Minuten, aber bei
  // Page-Reload nach z.B. 2 Tagen soll dieselbe Anfrage weiter
  // verwendbar sein.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: created, error } = await db
    .from('dokument_upload_anfragen')
    .insert({
      lead_id: leadId,
      token,
      slots,
      status: 'gesendet',
      expires_at: expiresAt,
      kanal: 'onboarding-wizard',
    })
    .select('token')
    .single()

  if (error || !created) {
    return { ok: false, error: `Anfrage konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}` }
  }

  return { ok: true, token: (created as { token: string }).token }
}
```

- [ ] **Step 4: Test erneut laufen lassen**

```bash
npx vitest run src/lib/onboarding/__tests__/ensure-zb1-anfrage.test.ts
```

Erwartet: 3× PASS.

- [ ] **Step 5: Schema-Check der `kanal`-Spalte**

Mit `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'dokument_upload_anfragen'
  AND column_name IN ('kanal', 'erstellt_am', 'expires_at', 'slots');
```

Falls `kanal` fehlt oder `erstellt_am` anders heißt: Insert-Payload + Order-Spalte in `ensure-zb1-anfrage.ts` anpassen. Häufig heißt die Timestamp-Spalte `created_at` statt `erstellt_am`. **Wenn die Spalte tatsächlich `created_at` heißt, im Insert + Order-Statement nachziehen.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding/ensure-zb1-anfrage.ts src/lib/onboarding/__tests__/
git commit -m "feat(onboarding): ensureZb1Anfrage Server-Helper

Idempotenter Token-Resolver für Pending-Fahrzeugschein-Anfragen.
Sucht bestehende dokument_upload_anfragen mit slot=fahrzeugschein +
ocr=true oder legt neue an (expires_at +7 Tage). Schreibt
kanal='onboarding-wizard' für Source-Tracking.

Audit:
- Build: tsc grün
- UI: n/a (Lib-Modul)
- Redundanz: neuer Helper, kein bestehender für diesen Use-Case
- Dead-Code: n/a
- Spec: docs/superpowers/specs/2026-05-12-zb1-ocr-field-design.md §Komponenten
- Inkonsistenz: ok=Pattern, Umlaute ok
- Regression: keine — neue Datei

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Server-Actions confirmZb1Korrekturen + clearZb1Felder

**Files:**
- Create: `src/app/kunde/onboarding-details/zb1-actions.ts`

- [ ] **Step 1: Datei anlegen mit beiden Actions**

```typescript
'use server'

// AAR-zb1-wizard: Server-Actions für das Zb1UploadField im Wizard.
//
// confirmZb1Korrekturen — wenn der Kunde im Preview Werte editiert hat,
//   schreibt diese Action die korrigierten Werte als Force-Update auf
//   leads (H6-Regel des OCR-Endpoints wird hier bewusst umgangen).
//
// clearZb1Felder — wird vor "Neu fotografieren" gerufen, damit die
//   H6-Regel im OCR-Endpoint die neuen Werte tatsächlich schreiben kann
//   (sie überschreibt nur null/leere Felder).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type Zb1Korrekturen = {
  kennzeichen?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  // halter_name = "Vorname Nachname" — wird beim Schreiben gesplittet
  halter_name?: string | null
}

export type Zb1ActionResult = { ok: true } | { ok: false; error: string }

export async function confirmZb1Korrekturen(
  fallId: string,
  corrections: Zb1Korrekturen,
): Promise<Zb1ActionResult> {
  if (!fallId) return { ok: false, error: 'fallId fehlt' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // Auth-Check: gehört der Fall dem eingeloggten Kunden?
  const admin = createAdminClient()
  const leadId = await resolveLeadIdForKunde(admin, fallId, user.id, user.email)
  if (!leadId) return { ok: false, error: 'Kein Zugriff auf diesen Fall' }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (corrections.kennzeichen !== undefined) update.kennzeichen = corrections.kennzeichen
  if (corrections.fahrzeug_hersteller !== undefined) update.fahrzeug_hersteller = corrections.fahrzeug_hersteller
  if (corrections.fahrzeug_modell !== undefined) update.fahrzeug_modell = corrections.fahrzeug_modell
  if (corrections.halter_name !== undefined) {
    const split = splitHalterName(corrections.halter_name)
    update.halter_vorname = split.vorname
    update.halter_nachname = split.nachname
  }

  if (Object.keys(update).length === 1) {
    // Nur updated_at — keine Korrekturen vorhanden, früher Exit
    return { ok: true }
  }

  const { error } = await admin.from('leads').update(update).eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/kunde/onboarding-details`)
  revalidatePath(`/kunde/faelle/${fallId}`)
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { ok: true }
}

export async function clearZb1Felder(fallId: string): Promise<Zb1ActionResult> {
  if (!fallId) return { ok: false, error: 'fallId fehlt' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const leadId = await resolveLeadIdForKunde(admin, fallId, user.id, user.email)
  if (!leadId) return { ok: false, error: 'Kein Zugriff auf diesen Fall' }

  const { error } = await admin.from('leads').update({
    kennzeichen: null,
    fin: null,
    fahrzeug_hersteller: null,
    fahrzeug_modell: null,
    fahrzeug_baujahr: null,
    erstzulassung: null,
    hsn: null,
    tsn: null,
    halter_vorname: null,
    halter_nachname: null,
    halter_strasse: null,
    halter_plz: null,
    halter_stadt: null,
    zb1_status: null,
    updated_at: new Date().toISOString(),
  }).eq('id', leadId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── Helpers ────────────────────────────────────────────────────────

type AdminDb = ReturnType<typeof createAdminClient>

async function resolveLeadIdForKunde(
  admin: AdminDb,
  fallId: string,
  userId: string,
  userEmail: string | undefined,
): Promise<string | null> {
  const { data: fall } = await admin
    .from('faelle')
    .select('id, lead_id, kunde_user_id')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return null
  const leadId = (fall as { lead_id?: string | null }).lead_id ?? null
  if (!leadId) return null

  // Primär: kunde_user_id-Match auf faelle
  if ((fall as { kunde_user_id?: string | null }).kunde_user_id === userId) {
    return leadId
  }

  // Fallback: Email-Match auf leads (für Pre-Auth-Konvertierungen)
  if (userEmail) {
    const { data: lead } = await admin
      .from('leads')
      .select('id, email')
      .eq('id', leadId)
      .maybeSingle()
    if (lead && (lead as { email?: string | null }).email?.toLowerCase() === userEmail.toLowerCase()) {
      return leadId
    }
  }

  return null
}

function splitHalterName(name: string | null | undefined): { vorname: string | null; nachname: string | null } {
  if (!name) return { vorname: null, nachname: null }
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { vorname: null, nachname: null }
  if (parts.length === 1) return { vorname: null, nachname: parts[0] }
  return { vorname: parts[0], nachname: parts.slice(1).join(' ') }
}
```

- [ ] **Step 2: Schema-Verifikation `faelle.kunde_user_id`**

Mit `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'faelle' AND column_name IN ('kunde_user_id', 'lead_id');
```

Erwartet: beide Spalten vorhanden. Falls `kunde_user_id` anders heißt (z.B. `kunde_id`), `resolveLeadIdForKunde` anpassen.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Erwartet: 0 Errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/kunde/onboarding-details/zb1-actions.ts
git commit -m "feat(onboarding): confirmZb1Korrekturen + clearZb1Felder

Server-Actions für editierbare ZB1-Preview im Wizard.
confirmZb1Korrekturen schreibt Kunde-Korrekturen als Force-Update auf
leads (umgeht H6-Regel). clearZb1Felder resettet alle ZB1-Felder, damit
Neu-Fotografieren-Flow funktioniert. Beide mit Auth-Check via
faelle.kunde_user_id oder Email-Fallback.

Audit:
- Build: tsc grün
- UI: n/a
- Redundanz: neue Actions, kein Overlap mit existing
- Dead-Code: n/a
- Spec: §Security-Erwägungen, §Edge-Cases
- Inkonsistenz: { ok, error } Pattern; Umlaute ok
- Regression: keine — neue Datei

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Endpoint-Anpassung für Mehrfach-Upload

**Files:**
- Modify: `src/app/upload/dokumente/[token]/actions.ts:131-136`

- [ ] **Step 1: Block lockern**

In `src/app/upload/dokumente/[token]/actions.ts` Zeile 131-136 ändern. **Alt:**

```typescript
  // AAR-unfallfotos: Multi-File-Slot — weitere Fotos werden angehängt statt
  // abgelehnt. Einzeldokument-Slots (fahrzeugschein/polizeibericht/sonstiges)
  // bleiben Single-Upload.
  if (slot.hochgeladen && slotId !== 'unfallfotos') {
    return { success: false, error: 'Dieses Dokument wurde bereits empfangen' }
  }
```

**Neu:**

```typescript
  // AAR-unfallfotos: Multi-File-Slot — weitere Fotos werden angehängt.
  // AAR-zb1-wizard: fahrzeugschein erlaubt Mehrfach-Upload, damit der
  // Kunde im Wizard "Neu fotografieren" klicken kann nach OCR-Fehler
  // oder bei sichtbar falsch ausgelesenen Werten.
  // Andere Single-Slots (polizeibericht/sonstiges/…) bleiben blockiert.
  const erlaubtMehrfach = slotId === 'unfallfotos' || slotId === 'fahrzeugschein'
  if (slot.hochgeladen && !erlaubtMehrfach) {
    return { success: false, error: 'Dieses Dokument wurde bereits empfangen' }
  }
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Erwartet: 0 Errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/upload/dokumente/[token]/actions.ts
git commit -m "feat(upload): fahrzeugschein Mehrfach-Upload erlauben

Damit der ZB1-Wizard-Flow 'Neu fotografieren' nach OCR-Fail oder
falsch ausgelesenen Werten funktioniert. unfallfotos bleibt analog
multi-fähig; alle anderen Slots bleiben single.

Audit:
- Build: tsc grün
- UI: n/a (Backend-Anpassung)
- Redundanz: keine
- Dead-Code: n/a
- Spec: §Edge-Cases / Neu fotografieren
- Inkonsistenz: keine
- Regression: unfallfotos Pfad unverändert, andere Slots unverändert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Zb1UploadField-Component

**Files:**
- Create: `src/components/onboarding/fields/Zb1UploadField.tsx`

- [ ] **Step 1: Component schreiben**

```tsx
'use client'

// AAR-zb1-wizard: Kamera-basierter Fahrzeugschein-Upload mit OCR + editierbarer Preview.
//
// Zustands-Maschine: idle → capturing → uploading → preview (editierbar) → confirmed
// Fehler-Zweig:     uploading → error → idle (Retry) … nach 2 Fails: Skip-Link
//
// Daten-Flow:
//   1. Foto via <input capture="environment"> oder Galerie
//   2. base64 → uploadDokumentViaAnfrageToken(token, 'fahrzeugschein', base64)
//   3. OCR + leads-Update läuft serverseitig (H6-Regel, schreibt nur leere Felder)
//   4. extracted-Payload prefilled Preview-Inputs
//   5. Kunde editiert/bestätigt → onChange triggert ggf. confirmZb1Korrekturen

import { useRef, useState } from 'react'
import type { OnboardingFeld } from '../types'
import { uploadDokumentViaAnfrageToken } from '@/app/upload/dokumente/[token]/actions'
import { confirmZb1Korrekturen, clearZb1Felder } from '@/app/kunde/onboarding-details/zb1-actions'

type Status = 'idle' | 'uploading' | 'preview' | 'error' | 'skipped'

type Extracted = {
  kennzeichen: string
  fahrzeug_hersteller: string
  fahrzeug_modell: string
  halter_name: string
}

const MAX_VERSUCHE = 2

interface Props {
  feld: OnboardingFeld
  value: unknown
  onChange: (val: unknown) => void
  disabled?: boolean
  // Vom DynamicWizard injiziert
  token: string | null
  fallId: string | null
}

export function Zb1UploadField({ feld, value, onChange, disabled, token, fallId }: Props) {
  const [status, setStatus] = useState<Status>(value ? 'preview' : 'idle')
  const [extracted, setExtracted] = useState<Extracted | null>(() => readExtractedFromValue(value))
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [versuche, setVersuche] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Editierbare Felder = lokaler Form-State
  const [edit, setEdit] = useState<Extracted>(() => extracted ?? leereExtracted())

  async function handleFile(file: File) {
    if (!token) {
      setStatus('error')
      setErrorMsg('Upload-Token fehlt. Bitte Seite neu laden.')
      return
    }
    setStatus('uploading')
    setErrorMsg(null)

    const base64 = await fileToBase64(file)
    if (!base64) {
      setStatus('error')
      setErrorMsg('Foto konnte nicht gelesen werden.')
      return
    }

    const res = await uploadDokumentViaAnfrageToken(token, 'fahrzeugschein', base64, file.type || 'image/jpeg')
    if (!res.success) {
      setVersuche(v => v + 1)
      setStatus('error')
      setErrorMsg(res.error ?? 'OCR fehlgeschlagen — bitte erneut versuchen.')
      return
    }

    const ex: Extracted = {
      kennzeichen: res.extracted?.kennzeichen ?? '',
      fahrzeug_hersteller: res.extracted?.fahrzeug_hersteller ?? '',
      fahrzeug_modell: res.extracted?.fahrzeug_modell ?? '',
      halter_name: res.extracted?.halter_name ?? '',
    }
    setExtracted(ex)
    setEdit(ex)
    setStatus('preview')
    // Wizard-Wert = Marker, dass Field erledigt ist (für Pflicht-Validierung).
    // Der eigentliche DB-Write ist schon durch den OCR-Endpoint passiert.
    onChange({ status: 'ok', extracted: ex })
  }

  async function handleNeuFotografieren() {
    if (!fallId) {
      setStatus('idle')
      return
    }
    // Reset leads-Felder, damit zweiter OCR-Run die neuen Werte schreiben kann
    await clearZb1Felder(fallId)
    setExtracted(null)
    setEdit(leereExtracted())
    setErrorMsg(null)
    setStatus('idle')
    onChange(null)
    inputRef.current?.click()
  }

  async function handleBestaetigen() {
    if (!fallId || !extracted) return
    // Diff bauen: nur geänderte Felder schicken
    const diff: Parameters<typeof confirmZb1Korrekturen>[1] = {}
    if (edit.kennzeichen !== extracted.kennzeichen) diff.kennzeichen = edit.kennzeichen || null
    if (edit.fahrzeug_hersteller !== extracted.fahrzeug_hersteller) diff.fahrzeug_hersteller = edit.fahrzeug_hersteller || null
    if (edit.fahrzeug_modell !== extracted.fahrzeug_modell) diff.fahrzeug_modell = edit.fahrzeug_modell || null
    if (edit.halter_name !== extracted.halter_name) diff.halter_name = edit.halter_name || null

    if (Object.keys(diff).length > 0) {
      const res = await confirmZb1Korrekturen(fallId, diff)
      if (!res.ok) {
        // Nicht-blockierend: Wizard navigiert weiter, KB kann später korrigieren
        console.error('[zb1-field] Korrektur fehlgeschlagen:', res.error)
      }
    }
    onChange({ status: 'confirmed', extracted: edit })
  }

  function handleSkip() {
    setStatus('skipped')
    // Pflicht-Validierung benötigt einen truthy Wert → 'skipped'-Marker
    onChange({ status: 'skipped' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--claimondo-navy)', letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
        {feld.label}
        {feld.pflicht && <span style={{ color: '#FF9F0A', fontSize: 13 }}>*</span>}
      </label>
      {feld.hint && status === 'idle' && (
        <span style={{ fontSize: 13, color: 'var(--wiz-text-3)', marginTop: -2 }}>
          {feld.hint}
        </span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />

      {(status === 'idle' || status === 'error') && (
        <CaptureButtons
          disabled={!!disabled}
          onCamera={() => inputRef.current?.click()}
          onGallery={() => {
            // gleicher Input, aber ohne capture-Hint → Browser zeigt Galerie
            if (!inputRef.current) return
            inputRef.current.removeAttribute('capture')
            inputRef.current.click()
            // capture wieder setzen für nächsten Klick auf Kamera-Button
            setTimeout(() => inputRef.current?.setAttribute('capture', 'environment'), 100)
          }}
        />
      )}

      {status === 'uploading' && (
        <div style={infoBoxStyle('info')}>
          <Spinner /> Foto wird ausgewertet …
        </div>
      )}

      {status === 'error' && errorMsg && (
        <div style={infoBoxStyle('error')}>{errorMsg}</div>
      )}

      {status === 'error' && versuche >= MAX_VERSUCHE && (
        <button type="button" onClick={handleSkip} style={skipLinkStyle}>
          Daten später manuell eingeben →
        </button>
      )}

      {status === 'preview' && (
        <PreviewCard
          edit={edit}
          onChange={setEdit}
          onConfirm={handleBestaetigen}
          onRetake={handleNeuFotografieren}
        />
      )}

      {status === 'skipped' && (
        <div style={infoBoxStyle('warn')}>
          Übersprungen. Wir fragen die Daten später nochmal beim Service-Mitarbeiter ab.
        </div>
      )}
    </div>
  )
}

// ─── Sub-Components ───────────────────────────────────────────────────

function CaptureButtons({ disabled, onCamera, onGallery }: { disabled: boolean; onCamera: () => void; onGallery: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={onCamera}
        style={{
          background: 'var(--claimondo-ondo)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--wiz-r-md)',
          padding: '18px 16px',
          fontSize: 16,
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          letterSpacing: '-.01em',
          boxShadow: '0 4px 12px rgba(69,115,162,.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}
      >
        <span style={{ fontSize: 22 }}>📷</span>
        Fahrzeugschein fotografieren
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onGallery}
        style={{
          background: 'transparent',
          color: 'var(--claimondo-ondo)',
          border: 'none',
          padding: '8px',
          fontSize: 14,
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          textDecoration: 'underline',
          fontFamily: 'inherit',
        }}
      >
        oder Foto aus Galerie wählen
      </button>
    </div>
  )
}

function PreviewCard({
  edit, onChange, onConfirm, onRetake,
}: {
  edit: Extracted
  onChange: (e: Extracted) => void
  onConfirm: () => void
  onRetake: () => void
}) {
  return (
    <div style={{
      background: 'rgba(52,199,89,.06)',
      border: '1px solid rgba(52,199,89,.25)',
      borderRadius: 'var(--wiz-r-md)',
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a7a35', letterSpacing: '-.005em' }}>
        ✓ Daten ausgelesen — bitte prüfen und ggf. korrigieren
      </div>
      <EditRow label="Kennzeichen" value={edit.kennzeichen} onChange={v => onChange({ ...edit, kennzeichen: v })} />
      <EditRow label="Hersteller" value={edit.fahrzeug_hersteller} onChange={v => onChange({ ...edit, fahrzeug_hersteller: v })} />
      <EditRow label="Modell" value={edit.fahrzeug_modell} onChange={v => onChange({ ...edit, fahrzeug_modell: v })} />
      <EditRow label="Halter" value={edit.halter_name} onChange={v => onChange({ ...edit, halter_name: v })} />
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onRetake}
          style={{
            background: 'var(--wiz-fill)',
            color: 'var(--claimondo-navy)',
            border: 'none',
            borderRadius: 999,
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Neu fotografieren
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            background: '#1a7a35',
            color: '#fff',
            border: 'none',
            borderRadius: 999,
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            marginLeft: 'auto',
          }}
        >
          Übernehmen
        </button>
      </div>
    </div>
  )
}

function EditRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--wiz-text-3)', letterSpacing: '-.005em' }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: '#fff',
          border: '1px solid var(--wiz-separator)',
          borderRadius: 'var(--wiz-r-sm)',
          padding: '10px 12px',
          fontSize: 15,
          fontFamily: 'inherit',
          color: 'var(--claimondo-navy)',
          letterSpacing: '-.005em',
        }}
      />
    </div>
  )
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  )
}

const skipLinkStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--claimondo-ondo)',
  border: 'none',
  padding: '6px 0',
  fontSize: 14,
  fontWeight: 500,
  textDecoration: 'underline',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
}

function infoBoxStyle(kind: 'info' | 'error' | 'warn'): React.CSSProperties {
  const palette = {
    info:  { bg: 'rgba(69,115,162,.08)',  fg: 'var(--claimondo-navy)' },
    error: { bg: 'rgba(255,59,48,.08)',   fg: '#c0392b' },
    warn:  { bg: 'rgba(255,159,10,.10)',  fg: '#a8650a' },
  }[kind]
  return {
    background: palette.bg,
    color: palette.fg,
    padding: '14px 16px',
    borderRadius: 'var(--wiz-r-sm)',
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: '-.005em',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function leereExtracted(): Extracted {
  return { kennzeichen: '', fahrzeug_hersteller: '', fahrzeug_modell: '', halter_name: '' }
}

function readExtractedFromValue(value: unknown): Extracted | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { extracted?: Partial<Extracted> }
  if (!v.extracted) return null
  return {
    kennzeichen: v.extracted.kennzeichen ?? '',
    fahrzeug_hersteller: v.extracted.fahrzeug_hersteller ?? '',
    fahrzeug_modell: v.extracted.fahrzeug_modell ?? '',
    halter_name: v.extracted.halter_name ?? '',
  }
}

async function fileToBase64(file: File): Promise<string | null> {
  try {
    const reader = new FileReader()
    return await new Promise((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string
        // result = "data:image/jpeg;base64,/9j/4AAQ..." → nur base64 nach ',' nehmen
        const idx = result.indexOf(',')
        resolve(idx >= 0 ? result.slice(idx + 1) : result)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Erwartet: 0 Errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/fields/Zb1UploadField.tsx
git commit -m "feat(onboarding): Zb1UploadField mit Kamera + OCR + editierbarer Preview

Kamera-Capture (capture=environment) mit Galerie-Fallback, ruft
existing uploadDokumentViaAnfrageToken, zeigt 4-Felder-Preview
(Kennzeichen/Hersteller/Modell/Halter), 'Neu fotografieren' resettet
via clearZb1Felder, 'Übernehmen' schickt Diff via
confirmZb1Korrekturen. Nach 2 OCR-Fails: Skip-Link.

Audit:
- Build: tsc grün
- UI: neuer Field-Renderer, integriert sich in DynamicWizard
- Redundanz: keine — neue Component
- Dead-Code: n/a
- Spec: §Komponenten, §Daten-Flow, §Edge-Cases
- Inkonsistenz: Claimondo-Tokens (ondo, navy, wiz-*), Umlaute ok
- Regression: keine — neue Datei

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: DynamicWizard + WizardClient Integration

**Files:**
- Modify: `src/components/onboarding/DynamicWizard.tsx`
- Modify: `src/components/onboarding/WizardClient.tsx`

- [ ] **Step 1: DynamicWizard erweitern — Token + fallId resolven**

`src/components/onboarding/DynamicWizard.tsx` komplett ersetzen:

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WizardClient } from './WizardClient'
import { ensureZb1Anfrage } from '@/lib/onboarding/ensure-zb1-anfrage'
import type { OnboardingPhase, OnboardingFeld, FieldOption, DbTarget, ConditionalOn } from './types'

interface Props {
  flowKey: string
  // Optional: vom Caller bereits resolved (z.B. von /kunde/onboarding-details).
  // Wenn gesetzt, wird für zb1-upload-Felder der Token vorab geholt.
  fallId?: string | null
}

// Server-Component: lädt Phasen + Felder, resolved bei Bedarf den ZB1-Token.
export async function DynamicWizard({ flowKey, fallId = null }: Props) {
  const supabase = await createClient()

  const { data: phasenRows, error } = await supabase
    .from('onboarding_phasen')
    .select(`
      id, flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on,
      onboarding_felder (
        id, phase_id, reihenfolge, feld_key, typ, label, hint, placeholder,
        pflicht, optionen, validation, db_target, conditional_on
      )
    `)
    .eq('flow_key', flowKey)
    .order('reihenfolge', { ascending: true })

  if (error || !phasenRows) {
    return (
      <div className="rounded-xl bg-red-50 p-6 text-red-700 text-sm font-medium">
        Wizard-Konfiguration konnte nicht geladen werden ({error?.message ?? 'Unbekannter Fehler'})
      </div>
    )
  }

  const phases: OnboardingPhase[] = phasenRows.map(p => {
    const felderRaw = Array.isArray(p.onboarding_felder) ? p.onboarding_felder : []
    const felder: OnboardingFeld[] = (felderRaw as typeof felderRaw)
      .sort((a: { reihenfolge: number }, b: { reihenfolge: number }) => a.reihenfolge - b.reihenfolge)
      .map((f: {
        id: string; phase_id: string; reihenfolge: number; feld_key: string; typ: string;
        label: string; hint: string | null; placeholder: string | null; pflicht: boolean;
        optionen: unknown; validation: unknown; db_target: unknown; conditional_on: unknown;
      }) => ({
        id: f.id,
        phase_id: f.phase_id,
        reihenfolge: f.reihenfolge,
        feld_key: f.feld_key,
        typ: f.typ as OnboardingFeld['typ'],
        label: f.label,
        hint: f.hint,
        placeholder: f.placeholder,
        pflicht: f.pflicht,
        optionen: (f.optionen as FieldOption[] | null) ?? null,
        validation: (f.validation as Record<string, unknown> | null) ?? null,
        db_target: f.db_target as DbTarget,
        conditional_on: (f.conditional_on as ConditionalOn | null) ?? null,
      }))

    return {
      id: p.id,
      flow_key: p.flow_key,
      reihenfolge: p.reihenfolge,
      phase_key: p.phase_key,
      titel: p.titel,
      eyebrow: p.eyebrow ?? null,
      beschreibung: p.beschreibung ?? null,
      conditional_on: (p.conditional_on as ConditionalOn | null) ?? null,
      felder,
    }
  })

  if (phases.length === 0) {
    return (
      <div className="rounded-xl bg-amber-50 p-6 text-amber-700 text-sm font-medium">
        Keine Phasen für Flow „{flowKey}" konfiguriert.
      </div>
    )
  }

  // AAR-zb1-wizard: wenn eine Phase ein 'zb1-upload'-Feld enthält UND wir
  // einen fallId haben, resolven wir den Upload-Token serverseitig vorab
  // damit das Field beim Render direkt verwendbar ist.
  let zb1Token: string | null = null
  const hatZb1Feld = phases.some(p => p.felder.some(f => f.typ === 'zb1-upload'))
  if (hatZb1Feld && fallId) {
    const admin = createAdminClient()
    const { data: fall } = await admin
      .from('faelle')
      .select('lead_id')
      .eq('id', fallId)
      .maybeSingle()
    const leadId = (fall as { lead_id?: string | null } | null)?.lead_id ?? null
    if (leadId) {
      const res = await ensureZb1Anfrage(leadId)
      if (res.ok) zb1Token = res.token
    }
  }

  return <WizardClient phases={phases} flowKey={flowKey} fallId={fallId} zb1Token={zb1Token} />
}
```

- [ ] **Step 2: WizardClient Props erweitern**

In `src/components/onboarding/WizardClient.tsx`:

Zeile 18 (Import): nach `import { FileField } …` einfügen:

```typescript
import { Zb1UploadField } from './fields/Zb1UploadField'
```

Zeilen 45-53 (Props-Interface) erweitern:

```typescript
interface Props {
  phases: OnboardingPhase[]
  flowKey: string
  prefilledValues?: Record<string, unknown>
  // AAR-zb1-wizard: vom DynamicWizard injizierte Werte für das Zb1UploadField.
  fallId?: string | null
  zb1Token?: string | null
}
```

Zeile 57: Function-Signatur erweitern:

```typescript
export function WizardClient({ phases, flowKey, prefilledValues, fallId, zb1Token }: Props) {
```

Zeilen 381-393 (Field-Map mit FieldRenderer-Call) — die Felder-Schleife passend erweitern:

```tsx
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {felder.map(feld => (
            <FieldRenderer
              key={feld.id}
              feld={feld}
              value={values[feld.feld_key]}
              onChange={val => setField(feld.feld_key, val)}
              disabled={isSaving}
              svId={svId}
              anfrageId={anfrageId}
              preSelectedSvLeadId={preSelectedSvLeadId}
              fallId={fallId}
              zb1Token={zb1Token}
            />
          ))}
        </div>
```

Zeilen 476-492 (FieldRenderer-Props) erweitern:

```typescript
function FieldRenderer({
  feld,
  value,
  onChange,
  disabled,
  svId,
  anfrageId,
  preSelectedSvLeadId,
  fallId,
  zb1Token,
}: {
  feld: OnboardingFeld
  value: unknown
  onChange: (val: unknown) => void
  disabled: boolean
  svId?: string | null
  anfrageId?: string | null
  preSelectedSvLeadId?: string | null
  fallId?: string | null
  zb1Token?: string | null
}) {
```

Im Switch (Zeilen 493-585) vor `default:` neuen Case einfügen:

```tsx
    case 'zb1-upload':
      return (
        <Zb1UploadField
          feld={feld}
          value={value}
          onChange={onChange}
          disabled={disabled}
          token={zb1Token ?? null}
          fallId={fallId ?? null}
        />
      )
```

- [ ] **Step 3: onboarding-details Page anpassen**

In `src/app/kunde/onboarding-details/page.tsx` Zeile 93-97 — `WizardClient` durch `DynamicWizard` ersetzen wäre Refactor, stattdessen `fallId` und `zb1Token` direkt vorab resolven und an `WizardClient` weiterreichen. **Alt:**

```tsx
        <WizardClient
          phases={wizardState.phases}
          flowKey="kunde-onboarding"
          prefilledValues={wizardState.prefilledValues}
        />
```

**Neu:**

```tsx
        <WizardClient
          phases={wizardState.phases}
          flowKey="kunde-onboarding"
          prefilledValues={wizardState.prefilledValues}
          fallId={fallId}
          zb1Token={zb1TokenForWizard}
        />
```

Davor (zwischen Zeile 59 `if (wizardState.phases.length === 0)` und Zeile 61 `return`) den Token resolven:

```tsx
  // AAR-zb1-wizard: wenn eine Wizard-Phase ein 'zb1-upload'-Feld enthält,
  // Token vorab holen. ladeNoetigePhasen liefert die schon gefilterten
  // Phasen — wenn fahrzeug per kennzeichen-Skip schon raus ist, brauchen
  // wir auch keinen Token.
  const hatZb1Feld = wizardState.phases.some(p => p.felder.some(f => f.typ === 'zb1-upload'))
  let zb1TokenForWizard: string | null = null
  if (hatZb1Feld) {
    const { createAdminClient: createAdmin } = await import('@/lib/supabase/admin')
    const adminDb = createAdmin()
    const { data: fall } = await adminDb
      .from('faelle')
      .select('lead_id')
      .eq('id', fallId)
      .maybeSingle()
    const leadId = (fall as { lead_id?: string | null } | null)?.lead_id ?? null
    if (leadId) {
      const { ensureZb1Anfrage } = await import('@/lib/onboarding/ensure-zb1-anfrage')
      const res = await ensureZb1Anfrage(leadId)
      if (res.ok) zb1TokenForWizard = res.token
    }
  }
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Erwartet: 0 Errors.

- [ ] **Step 5: Build**

```bash
npm run build
```

Erwartet: `✓ Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/DynamicWizard.tsx src/components/onboarding/WizardClient.tsx src/app/kunde/onboarding-details/page.tsx
git commit -m "feat(onboarding): Zb1UploadField in DynamicWizard verdrahten

DynamicWizard nimmt optional fallId, resolved Token via
ensureZb1Anfrage wenn eine Phase ein zb1-upload-Feld hat. WizardClient
reicht fallId + zb1Token an FieldRenderer durch. onboarding-details-
Page resolved Token vorab. Skip-via-leads.kennzeichen läuft schon
über die generische ladeNoetigePhasen-Logik.

Audit:
- Build: npm run build grün
- UI: ZB1-Upload erscheint in fahrzeug-Phase Step 1
- Redundanz: ensureZb1Anfrage-Logik in beiden Stellen lazy-imported
- Dead-Code: keine
- Spec: §Komponenten, §Daten-Flow
- Inkonsistenz: Token-Resolution-Pfad konsistent (admin client)
- Regression: andere Flows (gutachter-finden) ohne fallId → kein Token-Resolve, kein Verhalten geändert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Manual-Smoke + Finalisierung

**Files:**
- Modify: `docs/11.05.2026/backlog-status-funnel-v3.md`

- [ ] **Step 1: Lokaler Smoke-Test Vorbereitung**

```bash
npm run dev
```

Erwartet: Server läuft auf `localhost:3000`.

- [ ] **Step 2: Test-User mit existierendem Fall vorbereiten**

Via `mcp__plugin_supabase_supabase__execute_sql` einen Test-Fall identifizieren:

```sql
SELECT f.id AS fall_id, f.lead_id, l.email, l.kennzeichen
FROM faelle f
JOIN leads l ON l.id = f.lead_id
WHERE l.kennzeichen IS NULL
ORDER BY f.created_at DESC
LIMIT 5;
```

Falls keine Treffer (sehr unwahrscheinlich): einen Test-Fall via UI im Dispatch anlegen und `leads.kennzeichen = NULL` setzen.

- [ ] **Step 3: Magic-Link für Test-Kunde generieren**

Manuell via Supabase Studio → Authentication → User → "Send magic link" für die Test-Email, oder via Dispatch-UI.

- [ ] **Step 4: Smoke-Path 1 — Happy Path**

1. Magic-Link öffnen → Redirect zu `/kunde/onboarding-details`
2. Verifizieren: Wizard startet bei Phase 1 = "Ihr Fahrzeug", Eyebrow "Schritt 1"
3. "Fahrzeugschein fotografieren" → Datei wählen (echtes ZB1-Foto)
4. Spinner "Foto wird ausgewertet …"
5. Preview-Card erscheint mit Kennzeichen/Hersteller/Modell/Halter
6. "Übernehmen" → Wizard navigiert zu Phase 2

DB-Check via Supabase MCP:

```sql
SELECT kennzeichen, fahrzeug_hersteller, fahrzeug_modell, zb1_status, halter_nachname
FROM leads WHERE id = '<test-lead-id>';
```

Erwartet: alle Felder befüllt, `zb1_status='hochgeladen'`.

- [ ] **Step 5: Smoke-Path 2 — Korrektur**

1. Wieder neuer Test-Kunde / Reset.
2. Bis Preview-Card durchklicken.
3. Im "Hersteller"-Feld manuell "Audi" eintippen (egal was OCR gelesen hat).
4. "Übernehmen" → Wizard navigiert weiter.

DB-Check:

```sql
SELECT fahrzeug_hersteller FROM leads WHERE id = '<test-lead-id>';
```

Erwartet: `fahrzeug_hersteller = 'Audi'`.

- [ ] **Step 6: Smoke-Path 3 — OCR-Fail mit Skip**

1. Test-Kunde reset.
2. Statt ZB1 ein komplett anderes Foto wählen (z.B. Selfie).
3. Erste Fehleranzeige rot.
4. Nochmal probieren — zweiter Fail.
5. Skip-Link erscheint, anklicken.
6. Wizard navigiert zu Phase 2.

DB-Check:

```sql
SELECT zb1_status, zb1_upload_versuche FROM leads WHERE id = '<test-lead-id>';
```

Erwartet: `zb1_status='fehlgeschlagen'`, `zb1_upload_versuche >= 2`.

- [ ] **Step 7: Smoke-Path 4 — Skip via existing Daten**

1. Test-Kunde mit bereits gesetztem `leads.kennzeichen` nehmen.
2. Magic-Link → `/kunde/onboarding-details`.
3. Wizard startet NICHT bei "Ihr Fahrzeug", sondern bei Phase 2 (Hergang oder analog).

DB-Check: Vorab via SQL `kennzeichen` auf nicht-null setzen.

- [ ] **Step 8: Backlog-Doc updaten**

In `docs/11.05.2026/backlog-status-funnel-v3.md` die Zeile

```markdown
| — | **ZB1-OCR-Field-Type im Wizard** | ⏳ pending (~3h) |
```

ersetzen durch (PR-Nummer nach Merge einsetzen):

```markdown
| #<PR-NR> | **ZB1-OCR-Field-Type im Wizard** | ✅ merged |
```

- [ ] **Step 9: PR erstellen**

```bash
git push -u origin kitta/aar-backlog-zb1-ocr-field
gh pr create --base staging --title "feat(onboarding): ZB1-OCR-Field-Type im DynamicWizard" --body "$(cat <<'EOF'
## Summary
- Neuer Field-Typ `zb1-upload` im DynamicWizard mit Kamera-Capture + OCR + editierbarer Preview
- Reused den bestehenden `uploadDokumentViaAnfrageToken`-Endpoint (Token-basiert)
- `ensureZb1Anfrage`-Helper resolved idempotent eine Pending-Anfrage pro Lead
- Neue Server-Actions `confirmZb1Korrekturen` (Force-Override) + `clearZb1Felder` (Reset für Neu-Foto)
- DB-Migration: fahrzeug-Phase als Step 1 in `kunde-onboarding` Flow

## Spec
`docs/superpowers/specs/2026-05-12-zb1-ocr-field-design.md`

## Test plan
- [ ] Magic-Link-Login → Wizard startet bei "Ihr Fahrzeug"
- [ ] Foto aufnehmen → OCR-Preview erscheint
- [ ] Kennzeichen/Hersteller etc. lesbar
- [ ] Werte editieren → "Übernehmen" → DB-Check Override
- [ ] Schlechtes Foto → 2 Fails → Skip-Link → Phase 2
- [ ] Fall mit gesetztem leads.kennzeichen → fahrzeug-Phase wird übersprungen

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 10: Memory ggf. ergänzen**

Wenn beim Smoke etwas Überraschendes passiert ist (z.B. anderes DB-Spalten-Naming als erwartet, ein Edge-Case): kurze Memory-Notiz schreiben. Sonst überspringen.

---

## Self-Review

**Spec-Coverage:**
- §Architektur → Task 1 (Type) + Task 6 (Verdrahtung) ✓
- §Komponenten/Files → alle Files mappen auf Tasks 1-6 ✓
- §Daten-Flow → Tasks 2 (ensureZb1Anfrage), 5 (Field), 6 (Wiring) ✓
- §Edge-Cases Retry → Task 5 (versuche-State + MAX_VERSUCHE) ✓
- §Edge-Cases Neu fotografieren → Task 3 (clearZb1Felder) + Task 4 (Endpoint-Lockerung) ✓
- §Edge-Cases User-Editierung → Task 3 (confirmZb1Korrekturen + Diff-Logik) + Task 5 (PreviewCard) ✓
- §Edge-Cases Reload → Task 2 (idempotenter Lookup) ✓
- §Edge-Cases Skip via existing → Task 1 (`db_target.spalte='kennzeichen'`) — die generische `ladeNoetigePhasen` macht den Rest ✓
- §Error-Handling → Task 3 ({ ok, error }-Pattern), Task 5 (inline Fehler-UI) ✓
- §Security → Task 3 (`resolveLeadIdForKunde` mit kunde_user_id + Email-Fallback) ✓
- §Tests → Task 7 (4 Smoke-Pfade) + Task 2 (Vitest für Helper) ✓

**Placeholder-Scan:** Keine TBD/TODO/handle edge cases vorhanden. Alle Code-Blöcke sind komplett. ✓

**Type-Konsistenz:**
- `ensureZb1Anfrage` returnt `{ ok: true; token: string } | { ok: false; error: string }` — in Task 6 wird `if (res.ok) zb1Token = res.token` korrekt verwendet ✓
- `confirmZb1Korrekturen(fallId, corrections)` Signatur ist konsistent zwischen Task 3 (Definition) und Task 5 (Call-Site) ✓
- `clearZb1Felder(fallId)` Signatur konsistent ✓
- `Zb1UploadField` Props `{ feld, value, onChange, disabled, token, fallId }` — passt zum FieldRenderer-Switch in Task 6 ✓
- `Extracted`-Type lebt nur im Field; was im wizard-state landet ist `{ status, extracted }` — wird beim PflichtCheck als truthy erkannt ✓

**Scope:** Plan fokussiert auf ZB1-OCR-Field. Andere Onboarding-Phasen sind explizit out-of-scope und im Backlog separat geführt. ✓

---

## Execution Handoff

Plan komplett und gespeichert in `docs/superpowers/plans/2026-05-12-zb1-ocr-field.md`. Zwei Ausführungs-Optionen:

**1. Subagent-Driven (empfohlen)** — Ich dispatche einen frischen Subagent pro Task, wir reviewen zwischen den Tasks, schnelle Iteration.

**2. Inline Execution** — Tasks in dieser Session ausführen via `executing-plans`, Batch mit Checkpoints.

**Welcher Weg?**
