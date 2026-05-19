# anfragen-Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Supabase-Inbox-Tabelle `public.anfragen` einführen, eine atomare `convert_anfrage_zu_lead()`-Function bauen und die kfzgutachter-Ads-LP-Server-Action so umstellen, dass sie zuerst die Anfrage persistiert, dann den Lead erzeugt — Single-Source-of-Truth statt externer Webhook.

**Architecture:**
- Zwei Forward-Only-Migrationen (Tabelle + Function) via Supabase-CLI (`npx supabase migration new` + `npx supabase db push`)
- Server-Action `submitKfzgutachterLead` schreibt zuerst `anfragen.insert()`, dann RPC `convert_anfrage_zu_lead(uuid)` — beide Operationen sequenziell, Anfrage bleibt auch bei Convert-Failure persistent
- `LiveCountPill` zählt jetzt LP-eigene Anfragen (`quelle='kfzgutachter-ads-lp' AND konvertier_status='success'`) statt platform-weite Leads
- `LeadFormClient` parst UTM-Parameter aus `window.location.search` und packt sie als hidden FormData ins Submit

**Tech Stack:** Postgres 15 (Supabase) · TypeScript · Next.js 16 Server Actions · Vitest · Supabase-JS

**Source:** `docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md`

**Branch:** `kitta/aar-kfzgutachter-ads-lp` (PR-Ziel `staging`)

**Project conventions (read once before starting):**
- **AGENTS.md Regel 2 — DDL nur via Supabase-CLI:** Schema-Änderungen ausschließlich via `npx supabase migration new <name>` + `npx supabase db push`. Niemals direkt im Studio. Niemals via Management-API. Niemals via `db query --linked --file` für Tabellen-DDL (das ist ausschließlich für Recovery-Drift).
- **AGENTS.md §Sprache:** Deutsche Umlaute in Kommentaren + Commits (`ä/ö/ü/ß`). Pre-Commit-Hook blockt ASCII-Ersatz.
- **AGENTS.md §Post-Task-Audit:** Jeder Commit hat einen 7-Punkte-Audit-Block im Body (Build, UI, Redundanz, Dead-Code, Spec, Inkonsistenz, Regression). Co-Authored-By-Line am Ende.
- **AGENTS.md §Server-Actions / Result-Object:** Server-Actions liefern `{ ok: boolean; error?: string; ... }` — keine `throw`. Non-critical Sub-Operations (Tracking, Logging) in lokalen try/catch.
- **Pre-existing TS-Error:** `.next/types/validator.ts(971,39): Cannot find module '../../src/app/kanzlei/dashboard/page.js'` — preexisting, NICHT versuchen zu fixen.
- **Branch isolation:** `git status` zeigt viele untracked `docs/15.05.2026/...` aus anderen Sessions. Niemals `git add .` — immer explizite Pfade aus den Step-Anleitungen.

---

## Task 1 · Migration anlegen — `anfragen`-Tabelle + Indexes + RLS

**Files:**
- Create: `supabase/migrations/<TIMESTAMP>_anfragen_inbox.sql` (Pfad wird von der CLI generiert — siehe Step 1)

- [ ] **Step 1: Migration-Datei via Supabase-CLI anlegen**

Run:
```bash
npx supabase migration new anfragen_inbox
```

Expected output: `Created new migration at supabase/migrations/<TIMESTAMP>_anfragen_inbox.sql`. Notiere den vollen Pfad — Schritt 2 schreibt da rein.

- [ ] **Step 2: SQL in die generierte Datei schreiben**

Komplett-Inhalt des Files (ersetze evtl. vorhandenes Boilerplate):

```sql
-- 2026-05-18: Inbox-Tabelle fuer rohe Eingangs-Anfragen aller Channels.
-- Eine Anfrage wird atomar mit Insert via convert_anfrage_zu_lead() in
-- einen Lead konvertiert (siehe naechste Migration). Die Anfrage bleibt
-- auch bei Convert-Failure persistent — Audit-Trail.
--
-- Quellen-Slugs (Beispiele): 'kfzgutachter-ads-lp', 'rueckruf-modal',
-- 'telefon-aircall', 'gutachter-finder-termin', 'makler-partner-form'.
--
-- Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md

CREATE TABLE public.anfragen (
  -- Identitaet
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Channel-Identifikation (Pflicht-Ursprung)
  quelle            text NOT NULL,
  quelle_variant    text,
  quelle_url        text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_term          text,
  utm_content       text,

  -- Kontakt-Felder (kanaluebergreifend)
  kontakt_name           text,
  kontakt_telefon        text,
  kontakt_email          text,
  kontakt_plz_oder_stadt text,

  -- Channel-spezifischer Rohdaten-Puffer
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Audit / Spam-Detection
  client_ip  inet,
  user_agent text,

  -- Convert-Spur
  lead_id                uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  konvertiert_am         timestamptz,
  konvertier_status      text NOT NULL DEFAULT 'pending',
  konvertier_fehler      text,
  disqualifiziert_grund  text,
  disqualifiziert_am     timestamptz,
  disqualifiziert_durch  uuid REFERENCES auth.users(id),

  CONSTRAINT anfragen_konvertier_status_check
    CHECK (konvertier_status IN ('pending', 'success', 'failed', 'disqualifiziert'))
);

COMMENT ON TABLE public.anfragen IS
  'Inbox fuer rohe Eingangs-Anfragen aus allen Channels (LP-Forms, Rueckruf-Modal, Telefon-Bot, WA, Partner-APIs). Atomar konvertiert zu leads via convert_anfrage_zu_lead(). Audit-Trail-Tabelle, niemals DELETE — nur disqualifizieren.';

COMMENT ON COLUMN public.anfragen.quelle IS
  'Maschinenlesbarer Channel-Slug. Eine Quelle = ein Slug (z.B. kfzgutachter-ads-lp).';
COMMENT ON COLUMN public.anfragen.payload IS
  'Channel-spezifischer Rohdaten-Puffer. Felder die regelmaessig abgefragt werden, sollten spaeter zu echten Spalten promoviert werden.';
COMMENT ON COLUMN public.anfragen.konvertier_status IS
  'pending | success | failed | disqualifiziert — vollstaendiger Convert-Audit-Trail inkl. Fehlerfaellen.';

-- Indexes (Partial-Strategy fuer schlanke Footprints)
CREATE INDEX anfragen_created_at_idx ON public.anfragen (created_at DESC);
CREATE INDEX anfragen_quelle_idx     ON public.anfragen (quelle, created_at DESC);
CREATE INDEX anfragen_status_idx     ON public.anfragen (konvertier_status)
  WHERE konvertier_status <> 'success';
CREATE INDEX anfragen_lead_id_idx    ON public.anfragen (lead_id)
  WHERE lead_id IS NOT NULL;
CREATE INDEX anfragen_telefon_idx    ON public.anfragen (kontakt_telefon)
  WHERE kontakt_telefon IS NOT NULL;

-- RLS aktivieren
ALTER TABLE public.anfragen ENABLE ROW LEVEL SECURITY;

-- service_role bypasst RLS automatisch (Server-Action-INSERTs)
-- authenticated Users: nur Admin + Dispatch duerfen lesen
CREATE POLICY anfragen_select_admin_dispatch
  ON public.anfragen
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.rolle IN ('admin', 'dispatch')
    )
  );

-- Admin + Dispatch duerfen disqualifizieren / Notizen ergaenzen
CREATE POLICY anfragen_update_admin_dispatch
  ON public.anfragen
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.rolle IN ('admin', 'dispatch')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid()
         AND profiles.rolle IN ('admin', 'dispatch')
    )
  );

-- KEINE INSERT-Policy fuer authenticated → Inserts nur via service_role.
-- KEINE DELETE-Policy → Anfragen werden nie geloescht (Audit-Trail).
```

- [ ] **Step 3: Migration anwenden**

Run:
```bash
npx supabase db push
```

Expected: Migration läuft sauber durch, output bestätigt das neue Migration-File.

Falls die CLI fragt ob remote-Migrations gegen lokale gechecked werden sollen → bestätigen mit `y`. Bei einem Fehler wie "linked project not found" oder Auth-Problemen sofort STOPPEN und Aaron fragen (kein Workaround via `db query --file`).

- [ ] **Step 4: Verifikation der Tabelle**

Run:
```bash
npx supabase db query --linked "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'anfragen' ORDER BY ordinal_position;"
```

Expected: 21 Zeilen (id, created_at, quelle, quelle_variant, quelle_url, utm_source/medium/campaign/term/content, kontakt_name/telefon/email/plz_oder_stadt, payload, client_ip, user_agent, lead_id, konvertiert_am, konvertier_status, konvertier_fehler, disqualifiziert_grund/am/durch).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): anfragen-Inbox-Tabelle + Indexes + RLS-Policies

Neue Tabelle public.anfragen als kanaluebergreifende Inbox fuer rohe
Eingangs-Anfragen. Pflicht-Ursprung (quelle text NOT NULL), Audit-Spur
fuer Convert (konvertier_status: pending/success/failed/disqualifiziert),
Spam-Detection-Felder (client_ip, user_agent). 5 Partial-Indexes nach
Supabase-query-partial-indexes-Best-Practice.

RLS: service_role bypasst (Server-Action-Inserts), authenticated nur fuer
Admin + Dispatch (SELECT + UPDATE). Keine INSERT-Policy fuer authenticated,
keine DELETE-Policy ueberhaupt — Audit bleibt vollstaendig.

Audit:
- Build: tsc --noEmit greift erst nach Type-Regen (Task 3)
- UI: keine Aenderung
- Redundanz: kein bestehendes anfragen/inbox-Schema im Projekt
- Dead-Code: n/a
- Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md §3 + §5
- Inkonsistenz: konvertier_status-CHECK matched Server-Action-Logik
- Regression: nur additiv

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 · Migration — `convert_anfrage_zu_lead()`-Function

**Files:**
- Create: `supabase/migrations/<TIMESTAMP>_convert_anfrage_zu_lead.sql`

- [ ] **Step 1: Migration anlegen**

Run:
```bash
npx supabase migration new convert_anfrage_zu_lead
```

Notiere den Pfad.

- [ ] **Step 2: SQL in die Datei schreiben**

```sql
-- 2026-05-18: Atomare Convert-Function Anfrage → Lead.
-- SECURITY DEFINER, FOR UPDATE-Lock, Idempotenz, Exception-Handler
-- persistiert konvertier_status='failed' bevor er die Exception
-- nach oben propagiert. Channel-spezifische Side-Effects in IF-Bloecken.
--
-- Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md §4

CREATE OR REPLACE FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anfrage   public.anfragen;
  v_lead_id   uuid;
  v_vorname   text;
  v_nachname  text;
  v_telefon   text;
BEGIN
  -- 1. Anfrage holen mit Row-Lock (verhindert parallele Convert-Race)
  SELECT * INTO v_anfrage
  FROM public.anfragen
  WHERE id = p_anfrage_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anfrage % nicht gefunden', p_anfrage_id;
  END IF;

  -- Idempotenz: bereits konvertierte Anfragen geben bestehende lead_id zurueck
  IF v_anfrage.lead_id IS NOT NULL THEN
    RETURN v_anfrage.lead_id;
  END IF;

  -- 2. Name-Split "Max Mustermann" → vorname="Max", nachname="Mustermann"
  v_vorname  := split_part(trim(coalesce(v_anfrage.kontakt_name, '')), ' ', 1);
  v_nachname := NULLIF(
                  substr(trim(coalesce(v_anfrage.kontakt_name, '')),
                         length(v_vorname) + 2),
                  ''
                );
  v_telefon := trim(coalesce(v_anfrage.kontakt_telefon, ''));

  -- 3. Lead anlegen
  INSERT INTO public.leads (vorname, nachname, telefon, email, kunde_plz)
  VALUES (
    NULLIF(v_vorname, ''),
    v_nachname,
    NULLIF(v_telefon, ''),
    v_anfrage.kontakt_email,
    v_anfrage.kontakt_plz_oder_stadt
  )
  RETURNING id INTO v_lead_id;

  -- 4. Channel-spezifische Side-Effects
  -- Gutachter-Termin-Form: reservierten Slot in admin_termine uebernehmen
  IF v_anfrage.quelle = 'gutachter-finder-termin'
     AND v_anfrage.payload ? 'vorgesehener_gutachter_id'
     AND v_anfrage.payload ? 'termin_start' THEN
    INSERT INTO public.admin_termine (
      typ, titel, lead_id, sv_id, start_zeit, end_zeit, status, erstellt_von
    ) VALUES (
      'vor-ort-besichtigung',
      'Besichtigung (aus Anfrage)',
      v_lead_id,
      (v_anfrage.payload->>'vorgesehener_gutachter_id')::uuid,
      (v_anfrage.payload->>'termin_start')::timestamptz,
      (v_anfrage.payload->>'termin_start')::timestamptz + interval '1 hour',
      'offen',
      auth.uid()
    );
  END IF;

  -- Makler-Channel: aktuell DEAKTIVIERT, weil leads.vermittelnder_makler_id
  -- nicht existiert. Beim Anlegen der Spalte (separate Migration) den Block
  -- unten aktivieren. Bis dahin wuerde die Function bei
  -- quelle='makler-partner-form' mit ungueltigem Spalten-Verweis crashen.
  --
  -- IF v_anfrage.quelle = 'makler-partner-form'
  --    AND v_anfrage.payload ? 'vermittelnder_makler_id' THEN
  --   UPDATE public.leads
  --      SET vermittelnder_makler_id = (v_anfrage.payload->>'vermittelnder_makler_id')::uuid
  --    WHERE id = v_lead_id;
  -- END IF;

  -- 5. Anfrage als konvertiert markieren
  UPDATE public.anfragen
     SET lead_id           = v_lead_id,
         konvertiert_am    = now(),
         konvertier_status = 'success'
   WHERE id = p_anfrage_id;

  RETURN v_lead_id;

EXCEPTION WHEN OTHERS THEN
  -- Convert-Failure: Anfrage bleibt persistent, Status auf 'failed'
  UPDATE public.anfragen
     SET konvertier_status = 'failed',
         konvertier_fehler = SQLERRM
   WHERE id = p_anfrage_id;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.convert_anfrage_zu_lead(uuid) IS
  'Atomic Convert Anfrage → Lead. Idempotent (re-runs returnen lead_id). Bei Failure: anfragen.konvertier_status=failed + konvertier_fehler=SQLERRM persistiert, dann Exception re-raised.';

GRANT EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid)
  TO authenticated, service_role;
```

- [ ] **Step 3: Migration anwenden**

Run:
```bash
npx supabase db push
```

Expected: Function entsteht ohne Fehler.

- [ ] **Step 4: DB-Smoke — Happy-Path**

Lege manuell eine Test-Anfrage an + ruf die Function:

```bash
npx supabase db query --linked "
INSERT INTO public.anfragen
  (quelle, kontakt_name, kontakt_telefon, kontakt_plz_oder_stadt)
VALUES
  ('kfzgutachter-ads-lp', 'Smoke Test', '015100000000', 'Köln')
RETURNING id;"
```

Expected: eine UUID wird zurückgegeben. Notiere sie als `<ANFRAGE_ID>`.

Run:
```bash
npx supabase db query --linked "SELECT public.convert_anfrage_zu_lead('<ANFRAGE_ID>');"
```

Expected: eine `lead_id`-UUID wird zurückgegeben.

Run:
```bash
npx supabase db query --linked "SELECT id, lead_id, konvertier_status, konvertiert_am FROM public.anfragen WHERE id = '<ANFRAGE_ID>';"
```

Expected: `lead_id` ist gesetzt, `konvertier_status = 'success'`, `konvertiert_am` ist nicht NULL.

Run:
```bash
npx supabase db query --linked "SELECT id, vorname, nachname, telefon, kunde_plz FROM public.leads WHERE id = (SELECT lead_id FROM public.anfragen WHERE id = '<ANFRAGE_ID>');"
```

Expected: `vorname='Smoke'`, `nachname='Test'`, `telefon='015100000000'`, `kunde_plz='Köln'`.

- [ ] **Step 5: DB-Smoke — Idempotenz**

Rufe die Function ein zweites Mal mit derselben Anfrage:

```bash
npx supabase db query --linked "SELECT public.convert_anfrage_zu_lead('<ANFRAGE_ID>');"
```

Expected: gibt dieselbe `lead_id` zurück (kein neuer Lead).

Verifizieren — Anzahl Leads mit dieser Telefonnummer:
```bash
npx supabase db query --linked "SELECT count(*) FROM public.leads WHERE telefon = '015100000000';"
```

Expected: `1` (nicht 2 — Idempotenz funktioniert).

- [ ] **Step 6: Test-Daten aufräumen**

```bash
npx supabase db query --linked "DELETE FROM public.leads WHERE telefon = '015100000000';"
npx supabase db query --linked "DELETE FROM public.anfragen WHERE id = '<ANFRAGE_ID>';"
```

(Beide löschen: erst leads, dann anfragen — die Reverse-FK `anfragen.lead_id` hat `ON DELETE SET NULL`, blockt also nicht; aber der Test-Lead darf nicht in der DB bleiben.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): convert_anfrage_zu_lead() — atomic Anfrage→Lead

SECURITY DEFINER + SET search_path. FOR UPDATE-Lock gegen parallele
Convert-Race. Idempotent: bereits konvertierte Anfragen returnen
bestehende lead_id. Exception-Handler persistiert konvertier_status=failed
bevor er die Exception nach oben propagiert. Channel-spezifische
Side-Effects in IF-Bloecken (gutachter-finder-termin aktiv,
makler-partner-form auskommentiert bis Spalte existiert).

GRANT EXECUTE TO authenticated, service_role — service_role nutzt das
direkt aus der Server-Action, authenticated-Grant erlaubt spaeter
Dispatch-UI-Re-Convert-Actions.

Audit:
- Build: tsc --noEmit greift erst nach Type-Regen (Task 3)
- UI: keine Aenderung
- Redundanz: keine bestehende Convert-Function
- Dead-Code: makler-Branch bewusst auskommentiert, Kommentar erklaert wann aktivieren
- Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md §4
- Inkonsistenz: konvertier_status-Werte matchen CHECK aus Task 1
- Regression: DB-Smoke (Happy-Path + Idempotenz) gruen

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 · TypeScript-Typen regenerieren

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (auto-generated, vollständig überschrieben)

- [ ] **Step 1: Types regenerieren**

Run:
```bash
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

Expected: Datei wird vollständig neu geschrieben. Die neue `anfragen`-Tabelle erscheint mit Row/Insert/Update/Relationships, die `convert_anfrage_zu_lead`-Function unter `Functions:`.

- [ ] **Step 2: Verifikation**

Run:
```bash
grep -n "anfragen:" src/lib/supabase/database.types.ts | head -3
grep -n "convert_anfrage_zu_lead" src/lib/supabase/database.types.ts | head -3
```

Expected: jeweils mindestens ein Treffer. Wenn ein Grep keinen Hit liefert → STOPPEN, vermutlich Linkage zur falschen DB-Branch.

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: nur der pre-existing Kanzlei-Fehler `.next/types/validator.ts(971,39)`. Keine neuen Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(db-types): regenerate nach anfragen-Inbox-Migration

npx supabase gen types typescript --linked. Bringt anfragen-Tabelle +
convert_anfrage_zu_lead-Function-Typing in den Client.

Audit:
- Build: tsc --noEmit unveraendert (nur Kanzlei-Pre-Existing)
- UI: n/a
- Redundanz: n/a (auto-generated)
- Dead-Code: n/a
- Spec: Task 3 aus docs/superpowers/plans/2026-05-18-anfragen-inbox-implementation.md
- Inkonsistenz: n/a
- Regression: bestehende Verwendungsstellen weiter type-sicher

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 · Server-Action `submitKfzgutachterLead` refactor (TDD)

**Files:**
- Modify: `src/app/kfzgutachter-lp/actions.ts` (komplett-refactor)
- Create: `src/app/kfzgutachter-lp/__tests__/actions.test.ts`

- [ ] **Step 1: Failing Test schreiben**

Datei `src/app/kfzgutachter-lp/__tests__/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/headers — vor jedem Test frisch
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map<string, string>([
    ['x-forwarded-for', '203.0.113.45'],
    ['user-agent', 'Mozilla/5.0 (Test)'],
    ['referer', 'https://kfzgutachter.claimondo.de/?utm_source=test'],
  ])),
}))

// Mock next/cache
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Mock Service-Client — zentrale Mock-Factory
const mockInsert = vi.fn()
const mockRpc = vi.fn()
const mockFrom = vi.fn().mockReturnValue({
  insert: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: () => mockInsert(),
    }),
  }),
})
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: mockFrom, rpc: mockRpc }),
}))

import { submitKfzgutachterLead } from '../actions'

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('name', overrides.name ?? 'Max Mustermann')
  fd.set('phone', overrides.phone ?? '015100000000')
  fd.set('city', overrides.city ?? 'Köln')
  if (overrides.utm_source) fd.set('utm_source', overrides.utm_source)
  return fd
}

describe('submitKfzgutachterLead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Validation-Fehler: gibt field=phone bei ungültigem Telefon', async () => {
    const fd = buildFormData({ phone: 'abc' })
    const result = await submitKfzgutachterLead(fd)
    expect(result).toEqual({
      ok: false,
      error: 'Ungültige Telefonnummer',
      field: 'phone',
    })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('Happy-Path: schreibt Anfrage + ruft Convert + gibt leadId/anfrageId', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'anfrage-uuid' }, error: null })
    mockRpc.mockResolvedValue({ data: 'lead-uuid', error: null })

    const fd = buildFormData()
    const result = await submitKfzgutachterLead(fd)

    expect(result).toEqual({
      ok: true,
      leadId: 'lead-uuid',
      anfrageId: 'anfrage-uuid',
    })
    expect(mockFrom).toHaveBeenCalledWith('anfragen')
    expect(mockRpc).toHaveBeenCalledWith('convert_anfrage_zu_lead', {
      p_anfrage_id: 'anfrage-uuid',
    })
  })

  it('Anfrage-Insert-Failure: kein RPC, generischer Tel-Fallback-Error', async () => {
    mockInsert.mockResolvedValue({ data: null, error: { message: 'DB unreachable' } })

    const fd = buildFormData()
    const result = await submitKfzgutachterLead(fd)

    expect(result).toEqual({
      ok: false,
      error: 'Konfigurationsfehler — bitte rufen Sie an: 0221 25906530',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('Convert-Failure: Anfrage existiert, Soft-Error mit anfrageId', async () => {
    mockInsert.mockResolvedValue({ data: { id: 'anfrage-uuid' }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'lead-insert NOT NULL' } })

    const fd = buildFormData()
    const result = await submitKfzgutachterLead(fd)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.anfrageId).toBe('anfrage-uuid')
      expect(result.error).toContain('Verarbeitung')
    }
  })
})
```

- [ ] **Step 2: Test laufen lassen, FAIL erwarten**

Run:
```bash
npx vitest run src/app/kfzgutachter-lp/__tests__/actions.test.ts
```

Expected: 4 Tests FAIL — der bisherige `actions.ts` macht ein `fetch(webhookUrl)` statt `from('anfragen').insert(...)`, also matchen die Mocks nicht.

- [ ] **Step 3: `actions.ts` komplett refactorisieren**

Ersetze den gesamten Inhalt von `src/app/kfzgutachter-lp/actions.ts`:

```ts
'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

// Lead-Server-Action fuer die kfzgutachter-Ads-Landeseite.
// Schreibt zuerst eine anfragen-Zeile (Inbox/Audit), ruft dann atomic
// convert_anfrage_zu_lead(uuid). Bei Convert-Failure bleibt die Anfrage
// persistent (Audit-Trail) und die Action liefert Soft-Error mit
// anfrageId zur spaeteren Nachverfolgung.
// Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md

const SOURCE_SLUG = 'kfzgutachter-ads-lp'
const VARIANT_SLUG = 'test_b'

const LeadSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  phone: z.string().regex(/[\+0-9\s\-\(\)]{8,}/, 'Ungültige Telefonnummer'),
  city: z.string().min(2).max(100).trim(),
})

type Field = 'name' | 'phone' | 'city'

export async function submitKfzgutachterLead(
  formData: FormData,
): Promise<
  | { ok: true; leadId: string; anfrageId: string }
  | { ok: false; error: string; field?: Field; anfrageId?: string }
> {
  // 1. Zod-Validation
  const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Eingaben unvollständig',
      field: (issue?.path[0] as Field | undefined) ?? undefined,
    }
  }

  // 2. Headers (Audit) + UTMs (aus FormData via Client-Hidden-Inputs)
  const h = await headers()
  const xff = h.get('x-forwarded-for') ?? ''
  const clientIp = (xff.split(',')[0] ?? '').trim() || h.get('x-real-ip') || null
  const userAgent = h.get('user-agent') ?? null
  const refererUrl = h.get('referer') ?? null

  const utm = {
    utm_source:   String(formData.get('utm_source')   ?? '') || null,
    utm_medium:   String(formData.get('utm_medium')   ?? '') || null,
    utm_campaign: String(formData.get('utm_campaign') ?? '') || null,
    utm_term:     String(formData.get('utm_term')     ?? '') || null,
    utm_content:  String(formData.get('utm_content')  ?? '') || null,
  }

  const sb = createServiceClient()

  // 3. Anfrage anlegen
  const { data: anfrage, error: anfErr } = await sb
    .from('anfragen')
    .insert({
      quelle: SOURCE_SLUG,
      quelle_variant: VARIANT_SLUG,
      quelle_url: refererUrl,
      ...utm,
      kontakt_name: parsed.data.name,
      kontakt_telefon: parsed.data.phone,
      kontakt_plz_oder_stadt: parsed.data.city,
      payload: {},
      client_ip: clientIp,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (anfErr || !anfrage) {
    console.error('[kfzgutachter-lp] Anfrage-Insert fehlgeschlagen:', anfErr?.message)
    return {
      ok: false,
      error: 'Konfigurationsfehler — bitte rufen Sie an: 0221 25906530',
    }
  }

  // 4. Atomic Convert via RPC
  const { data: leadId, error: convErr } = await sb.rpc(
    'convert_anfrage_zu_lead',
    { p_anfrage_id: anfrage.id },
  )

  if (convErr || !leadId) {
    console.error(
      '[kfzgutachter-lp] Convert fehlgeschlagen:',
      convErr?.message,
      'anfrageId:',
      anfrage.id,
    )
    return {
      ok: false,
      error:
        'Übermittlung erhalten — Verarbeitung läuft. Wir melden uns auch ohne Sofort-Bestätigung.',
      anfrageId: anfrage.id,
    }
  }

  // 5. Revalidate Dispatch-Views (auch wenn /dispatch/anfragen heute noch nicht existiert)
  revalidatePath('/admin/leads')
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/anfragen')

  return { ok: true, leadId: String(leadId), anfrageId: anfrage.id }
}
```

- [ ] **Step 4: Test laufen lassen, PASS erwarten**

Run:
```bash
npx vitest run src/app/kfzgutachter-lp/__tests__/actions.test.ts
```

Expected: 4/4 PASS.

- [ ] **Step 5: Volle Vitest-Suite (Regression-Check)**

Run:
```bash
npx vitest run src/app/kfzgutachter-lp/__tests__/
```

Expected: ≥ 9 Tests passed (5 alte `track.test.ts` + 4 neue `actions.test.ts`). Keine Fehlerprints.

- [ ] **Step 6: Typecheck**

Run:
```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: nur der pre-existing Kanzlei-Fehler.

- [ ] **Step 7: Caller-Anpassung in `LeadFormClient`**

In `src/app/kfzgutachter-lp/LeadFormClient.tsx` — die `handleSubmit`-Logik nutzt aktuell `result.ok` und `result.field`. Der neue Return-Type ergänzt `anfrageId` (optional). Verifiziere dass das bestehende Pattern weiter compileert:

Run:
```bash
grep -n "submitKfzgutachterLead\|result.ok\|result.field" src/app/kfzgutachter-lp/LeadFormClient.tsx
```

Expected: 3–5 Matches. Da der neue Return-Type den alten als Subset enthält (`field` und `error` sind unverändert), ist keine Code-Anpassung in `LeadFormClient.tsx` nötig.

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "actions\|LeadFormClient" || echo "TS clean"
```

Expected: `TS clean`.

- [ ] **Step 8: Commit**

```bash
git add src/app/kfzgutachter-lp/actions.ts src/app/kfzgutachter-lp/__tests__/actions.test.ts
git commit -m "feat(kfzgutachter-lp): Server-Action schreibt Anfrage + Convert RPC

submitKfzgutachterLead ersetzt den externen Webhook (LEAD_WEBHOOK_URL)
durch zwei Supabase-Calls: 1) anfragen-Insert mit Headers + UTMs + Channel-
Metadaten, 2) RPC convert_anfrage_zu_lead. Bei Convert-Failure bleibt die
Anfrage erhalten (Audit-Trail), Soft-Error gibt anfrageId fuer Nachverfolgung
zurueck. Vitest deckt vier Pfade ab: Validation-Fehler, Happy-Path,
Anfrage-Insert-Failure, Convert-Failure.

Audit:
- Build: tsc --noEmit gruen (nur preexisting Kanzlei-Fehler)
- UI: keine Aenderung — Return-Type ergaenzt nur optional anfrageId
- Redundanz: Webhook-fetch ersetzt, eine Quelle fuer LP-Leads
- Dead-Code: LEAD_WEBHOOK_URL-Env wird nicht mehr gelesen (kann spaeter entsorgt werden)
- Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md §6 + §8
- Inkonsistenz: RPC-Param matched function-Signatur p_anfrage_id
- Regression: 9/9 Vitests gruen (5 track + 4 actions)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 · `LiveCountPill` auf anfragen-Quelle umstellen

**Files:**
- Modify: `src/app/kfzgutachter-lp/live-stats.ts`

- [ ] **Step 1: Query umstellen**

Öffne `src/app/kfzgutachter-lp/live-stats.ts`. Finde die `fetchLeadsWindow`-Funktion (vorhandener Code zählt leads). Ersetze die innere Supabase-Query.

Vorher (etwa diese Zeilen):
```ts
const { count, error } = await sb
  .from('leads')
  .select('id', { count: 'exact', head: true })
  .gte('created_at', since)
  .or('disqualifiziert.is.null,disqualifiziert.eq.false')
  .not('vorname', 'ilike', '%test%')
```

Nachher:
```ts
const { count, error } = await sb
  .from('anfragen')
  .select('id', { count: 'exact', head: true })
  .eq('quelle', 'kfzgutachter-ads-lp')
  .eq('konvertier_status', 'success')
  .gte('created_at', since)
  .not('kontakt_name', 'ilike', '%test%')
```

Begründung:
- `from('anfragen')` statt `from('leads')` — LP-spezifischer Counter statt platform-weit
- `eq('quelle', 'kfzgutachter-ads-lp')` — nur diese LP, keine anderen Channels
- `eq('konvertier_status', 'success')` — nur erfolgreich konvertierte (faktische Leads)
- `not('kontakt_name', 'ilike', '%test%')` — Test-Hygiene (analog zu vorher mit `vorname`)

Funktions-/Variablen-Namen können bleiben (`fetchLeadsWindow`, `getLiveStats` etc.) — die Semantik passt weiterhin („Live-Leads"), nur die Datenquelle wechselt. Falls die Engineer-Hand juckt: Umbenennung wäre eine eigene Task, gehört nicht hier rein (YAGNI).

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "live-stats" || echo "TS clean"
```

Expected: `TS clean`. Falls nicht: vermutlich ein typed-Tabellen-Mismatch — dann den oben generierten `database.types.ts` (Task 3) als Quelle der Wahrheit benutzen.

- [ ] **Step 3: Verifikation der Counter-Logik (optional, manuell)**

Falls Dev-Server läuft, kurz im Browser `http://localhost:3000/kfzgutachter-lp` → DevTools Network → `RSC`-Response der Page sollte den Counter mit echten Daten enthalten (oder null wenn < 5 Anfragen).

DB-seitig verifizierbar:
```bash
npx supabase db query --linked "
SELECT count(*) FROM public.anfragen
WHERE quelle = 'kfzgutachter-ads-lp'
  AND konvertier_status = 'success'
  AND created_at >= now() - interval '30 days'
  AND (kontakt_name IS NULL OR kontakt_name NOT ILIKE '%test%');"
```

Expected: eine kleine Zahl (0 bei frischer Tabelle, steigt mit echtem Traffic).

- [ ] **Step 4: Commit**

```bash
git add src/app/kfzgutachter-lp/live-stats.ts
git commit -m "feat(kfzgutachter-lp): LiveCountPill zaehlt LP-eigene Anfragen statt platform-weite Leads

live-stats.ts umgestellt: anfragen-Tabelle mit quelle='kfzgutachter-ads-lp'
+ konvertier_status='success'. Die Pille zeigt jetzt 'Letzte 30 Tage: X
Anfragen' fuer GENAU diese Landeseite — UWG-konform, weil abgegrenzter
ehrlicher Wert. Vorher: platform-weit Leads, irrefuehrend fuer LP-Conversion.

Audit:
- Build: tsc --noEmit gruen
- UI: gleicher Render-Pfad, jetzt mit aussagekraeftigerer Zahl
- Redundanz: n/a
- Dead-Code: n/a
- Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md §7
- Inkonsistenz: Test-Filter analog zum vorherigen vorname-Pattern
- Regression: getLiveStats-Signatur unveraendert, LiveCountPill-Render-Pfad gleich

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 · UTM-Hidden-Inputs in `LeadFormClient`

**Files:**
- Modify: `src/app/kfzgutachter-lp/LeadFormClient.tsx`

- [ ] **Step 1: UTM-Helper in handleSubmit ergänzen**

Öffne `src/app/kfzgutachter-lp/LeadFormClient.tsx`. Finde die `handleSubmit`-Funktion. Direkt nach der `event.preventDefault()`-Zeile und vor dem `startTransition(...)`-Aufruf, füge ein:

```tsx
// UTMs aus dem aktuellen URL in die FormData kopieren — damit die
// Server-Action sie in anfragen.utm_* persistieren kann (Spec §6.1).
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search)
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const v = params.get(key)
    if (v) fd.set(key, v)
  }
}
```

Der Block sitzt zwischen den bestehenden Zeilen `const fd = new FormData(form)` und `startTransition(async () => {`. Keine anderen Änderungen.

- [ ] **Step 2: Verifikations-Test im Vitest erweitern (optional)**

Nicht zwingend für diesen Plan — die UTM-Logic ist client-only und lässt sich nicht in der bestehenden Server-Action-Test-Suite testen. Manueller Smoke-Test in Step 4 deckt das ab.

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -i "LeadFormClient" || echo "TS clean"
```

Expected: `TS clean`.

- [ ] **Step 4: Manueller Browser-Smoke (falls Dev-Server läuft)**

Run (falls noch nicht laufend):
```bash
npm run dev
```

Im Browser: `http://localhost:3000/kfzgutachter-lp?utm_source=test-manual&utm_campaign=smoke&utm_content=plan-task-6`

Formular ausfüllen (Name `Smoke Six`, Telefon `015100000006`, Stadt `Köln`) → Submit.

Verifiziere in Supabase:
```bash
npx supabase db query --linked "
SELECT quelle, utm_source, utm_campaign, utm_content, konvertier_status, lead_id
FROM public.anfragen
WHERE kontakt_telefon = '015100000006'
ORDER BY created_at DESC LIMIT 1;"
```

Expected: `quelle='kfzgutachter-ads-lp'`, `utm_source='test-manual'`, `utm_campaign='smoke'`, `utm_content='plan-task-6'`, `konvertier_status='success'`, `lead_id` gesetzt.

Aufräumen:
```bash
npx supabase db query --linked "
DELETE FROM public.leads WHERE telefon = '015100000006';
DELETE FROM public.anfragen WHERE kontakt_telefon = '015100000006';"
```

- [ ] **Step 5: Commit**

```bash
git add src/app/kfzgutachter-lp/LeadFormClient.tsx
git commit -m "feat(kfzgutachter-lp): UTM-Hidden-Inputs in handleSubmit

LeadFormClient.handleSubmit kopiert vor dem Server-Action-Call die fuenf
UTM-Parameter (utm_source/medium/campaign/term/content) aus window.location
.search in die FormData. Server-Action persistiert sie in anfragen.utm_*.

Pflichtmechanismus damit A/B-Test- und Ads-Attribution funktionieren —
ohne diesen Block bekommen wir die Anfragen ohne Werbe-Tracking-Spalten
in die DB.

Audit:
- Build: tsc --noEmit gruen
- UI: keine sichtbare Aenderung
- Redundanz: n/a
- Dead-Code: n/a
- Spec: docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md §6.1
- Inkonsistenz: 5 UTM-Keys matchen exakt die anfragen-Tabellen-Spalten
- Regression: Submit-Pfad unveraendert wenn keine UTMs vorhanden (no-op)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 · Full Build + Final Smoke

**Files:** (none — verification only)

- [ ] **Step 1: Vitest-Suite komplett**

Run:
```bash
npx vitest run
```

Expected: alle Suites green. Mindestens die LP-Suite (`src/app/kfzgutachter-lp/__tests__/`) zeigt 9/9.

- [ ] **Step 2: Production-Build**

Run:
```bash
npm run build
```

Expected: build succeeds. Warnings akzeptabel, Errors müssen zero sein. Die LP-Route `/kfzgutachter-lp` muss in der Build-Summary auftauchen (dynamic, da `searchParams` genutzt).

Wenn der Build wegen pre-existing Kanzlei-Modul-Fehler scheitert: STOPPEN und Aaron fragen — der ist nicht von diesem Plan verursacht, war aber bisher nur tsc-warning.

- [ ] **Step 3: Final End-to-End-Smoke**

Falls Dev-Server noch läuft, sonst:
```bash
npm run dev
```

Im Browser zwei Pfade testen:

1. **Happy-Path:** `http://localhost:3000/kfzgutachter-lp?utm_source=e2e&utm_campaign=final-smoke` → Form ausfüllen (`Final Smoke`, `015100000007`, `Köln`) → Submit → Success-Card erscheint mit „Danke, Final".

2. **Validation-Fehler:** `http://localhost:3000/kfzgutachter-lp` → ungültige Telefonnummer (`abc`) eintragen → Submit → rote Border + Inline-Message „Ungültige Telefonnummer". Keine Anfrage in DB.

DB-Verifikation:
```bash
npx supabase db query --linked "
SELECT id, quelle, utm_source, utm_campaign, konvertier_status, lead_id
FROM public.anfragen
WHERE kontakt_telefon = '015100000007';"
```

Expected: eine Zeile mit `konvertier_status='success'` und `lead_id` ≠ NULL.

Aufräumen:
```bash
npx supabase db query --linked "
DELETE FROM public.leads WHERE telefon = '015100000007';
DELETE FROM public.anfragen WHERE kontakt_telefon = '015100000007';"
```

- [ ] **Step 4: Branch-Status final prüfen**

Run:
```bash
git status --short --untracked-files=no
git log --oneline origin/staging..HEAD
```

Expected:
- `git status` ist clean (alle Tasks committed)
- Commit-Log zeigt 7+ neue Commits seit Branch-Start (incl. die Pre-Plan-Catchups)

Wenn `git status` Modifikationen anzeigt: nicht pushen, erst klären.

- [ ] **Step 5: Push + PR-Body vorbereiten**

Run:
```bash
git push -u origin kitta/aar-kfzgutachter-ads-lp
```

PR gegen `staging` (NICHT main) — Titel:
```
feat(kfzgutachter-lp + db): anfragen-Inbox + Convert-Function + LP-Refactor
```

PR-Body:
```markdown
# anfragen-Inbox-Schema + LP-Refactor

Setzt die Spec `docs/superpowers/specs/2026-05-18-anfragen-inbox-schema-design.md` um:

**DB-Migrationen (2):**
- `public.anfragen` Tabelle (Inbox, 21 Spalten, 5 Partial-Indexes, RLS)
- `public.convert_anfrage_zu_lead(uuid)` Function (SECURITY DEFINER, atomic Convert)

**App-Code:**
- `submitKfzgutachterLead` schreibt Anfrage + RPC-Convert statt externer Webhook
- `LiveCountPill` zählt jetzt LP-eigene Anfragen (`quelle='kfzgutachter-ads-lp' AND konvertier_status='success'`)
- `LeadFormClient.handleSubmit` kopiert UTMs aus `window.location.search` in FormData

**Tests:**
- 4 neue Vitest-Tests für die Server-Action (Validation, Happy-Path, Anfrage-Failure, Convert-Failure)
- DB-Smoke (manuell): Happy + Idempotenz, beide grün
- Final End-to-End-Smoke (manuell): UTM-Trace, Success-Card, Validation-Fehler

**Out of Scope (separater Backlog):**
- Migration bestehender `erstelleOeffentlichenRueckruf` + `submitStadtLead` auf das Anfrage-Pattern
- `/dispatch/anfragen` UI für Dispatch-Inbox
- Rate-Limit + Spam-Detection auf Basis von `client_ip` + `user_agent`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Anhang · Zusammenfassung der Touchpoints

| File | Tasks | Art |
|---|---|---|
| `supabase/migrations/<TS>_anfragen_inbox.sql` | T1 | NEU |
| `supabase/migrations/<TS>_convert_anfrage_zu_lead.sql` | T2 | NEU |
| `src/lib/supabase/database.types.ts` | T3 | REGEN (auto) |
| `src/app/kfzgutachter-lp/actions.ts` | T4 | REFACTOR |
| `src/app/kfzgutachter-lp/__tests__/actions.test.ts` | T4 | NEU |
| `src/app/kfzgutachter-lp/live-stats.ts` | T5 | MODIFY |
| `src/app/kfzgutachter-lp/LeadFormClient.tsx` | T6 | MODIFY (handleSubmit-Block) |

**Geschätzter Aufwand:** 3–5 h netto (DB-Migrations sind die unbekanntesten Schritte — wenn Aaron's `npx supabase` linked und auth ist, alles glatt).

**Reihenfolge ist verpflichtend:** T1 → T2 → T3 → T4 → T5 → T6 → T7. T3 (Types) hängt von T1+T2, T4 (Action) hängt von T3, T5+T6 hängen von T4 funktional (aber nicht typed). T7 ist Verification + Push.

---

## Anhang · Bewusste No-Ops in dieser Iteration

Aus Spec-§1 „Explizit Out of Scope":
- Migration von `erstelleOeffentlichenRueckruf` und `submitStadtLead`
- `/dispatch/anfragen` UI
- Spam-/Rate-Limit-Logik
- Multi-Channel-Sub-Tables (Verworfen im Brainstorm)
- PLZ-Pattern-Match in der Convert-Function (heute: Roh-String, Dispatcher räumt nach)
