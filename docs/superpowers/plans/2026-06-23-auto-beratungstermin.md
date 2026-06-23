# Auto-Beratungstermin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder neue, in-scope Lead bekommt DB-nativ automatisch einen `kb_beratung`-Termin mit einem Pool-Kundenbetreuer; der Kunde sieht ihn im `/flow` und kann ihn bestätigen oder frei verschieben.

**Architecture:** (1) Ein `AFTER INSERT ON leads`-Trigger ruft `create_auto_beratungstermin()` (plpgsql), das einen strikten Pool-KB least-loaded auswählt, `leads.zugewiesen_an` setzt (nur wenn NULL) und eine `gutachter_termine`-Zeile (`typ='kb_beratung'`, `status='reserviert'`, Default nächster Werktag 10:00) einfügt. (2) Drei token-basierte Server-Actions in `self-service-actions.ts` laden/bestätigen/verschieben den Termin. (3) Eine `BeratungsterminCard` im Abschluss-Schritt des `FlowWizardKfz` rendert den Termin mit „Passt mir"/„Verschieben".

**Tech Stack:** Next.js 16 (App Router, RSC + Server Actions), Supabase Postgres (plpgsql Trigger), TypeScript, vitest, Tailwind v4 + Claimondo-Tokens.

## Global Constraints

- **Regel 2 — DDL nur über das Supabase-Plugin** (`mcp__plugin_supabase_supabase__apply_migration`), dann `list_migrations` → recorded Version ablesen → File `supabase/migrations/<V>_<name>.sql` exakt danach benennen + committen. `execute_sql` nur READ.
- **Server-Actions** liefern Result-Objects `{ ok: boolean; error?: string }` / `{ ok: true; data } | { ok: false; error }` — kein `throw`. Konsistent `ok` (nicht `success`).
- **Keine Types/Konstanten aus `'use server'`-Files exportieren** (AAR-664) — nur `async`-Funktionen.
- **Frontend-Umlaute Pflicht** (UI-Strings: echte `ä/ö/ü/ß`). Code-Kommentare/SQL dürfen ASCII sein.
- **Komponenten-Set:** Wiederverwenden statt neu bauen — `SheetCard` (Container), bestehende `WunschterminPicker`-Komponente (Datum/Zeit), Button-Muster aus `FlowWizardKfz` (token-gebundenes Tailwind, kein neuer Handroll-Verstoß). Keine neuen raw-Hex/Status-Scales (token-audit Ratchet).
- **Pool STRIKT `rolle='kundenbetreuer' AND aktiv=true`** — NICHT `{kundenbetreuer, admin}` (der `gutachter_termine_validate_assignee`-Trigger wirft bei Admin-Assignee unter `assignee_typ='kundenbetreuer'`).
- **Scope-Gate:** `status='neu' AND disqualifiziert IS NOT TRUE AND source_channel <> 'test' AND (telefon IS NOT NULL OR email IS NOT NULL)`.
- **Insert lässt `fall_id`/`claim_id` NULL** (kein Claim zur Lead-Zeit; vom `validate_gutachter_termine_claim_id`-Trigger erlaubt). Setzt `assignee_id` UND `kb_id` (= v_kb, Legacy-Reader-Kompat).
- **Reschedule = In-Place-UPDATE** (`start_zeit`/`end_zeit`/`status`/`verlegung_initiator_kunde`), NICHT die SV-`verlege`-Engine.
- **Trigger darf die Lead-Anlage nie brechen** → ganzer Body in `EXCEPTION WHEN OTHERS THEN RAISE WARNING; RETURN NEW`.
- **Spec:** `docs/superpowers/specs/2026-06-23-auto-beratungstermin-design.md`.
- **Koordination:** additiv zur CMM-49-`leads`-Lane (68d0795a); **`convert-lead-to-claim.ts` NICHT anfassen**; geteilter Hot-File `FlowWizardKfz.tsx` (additive Karte). Marker `COORDINATION-auto-beratungstermin.md`.

---

## File Structure

| Datei | Aktion | Verantwortung |
|---|---|---|
| `supabase/migrations/<V>_auto_beratungstermin_trigger.sql` | Create | Trigger-Funktion + Trigger (Task 1) |
| `src/app/flow/[token]/self-service-actions.ts` | Modify | 3 neue token-basierte Beratungstermin-Actions (Task 2) |
| `src/app/flow/[token]/__tests__/beratungstermin-actions.test.ts` | Create | vitest für die Actions (Task 2) |
| `src/app/flow/[token]/BeratungsterminCard.tsx` | Create | Client-Karte: Anzeige + Bestätigen + Verschieben (Task 3) |
| `src/app/flow/[token]/FlowWizardKfz.tsx` | Modify | `beratungstermin`-Prop + Karte im `account`-Step (Task 3) |
| `src/app/flow/[token]/page.tsx` | Modify | Lädt den `kb_beratung`-Termin + KB-Vorname, reicht als Prop durch (Task 3) |

---

## Task 1: DB-Trigger `create_auto_beratungstermin()`

**Files:**
- Create (via Plugin + committen): `supabase/migrations/<V>_auto_beratungstermin_trigger.sql`

**Interfaces:**
- Produces: Trigger `trg_auto_beratungstermin_on_lead` (AFTER INSERT ON leads) → für jeden in-scope Lead genau eine `gutachter_termine`-Zeile (`typ='kb_beratung'`, `lead_id=NEW.id`, `assignee_id`=Pool-KB) + ggf. `leads.zugewiesen_an`.
- Consumes: `profiles(id, rolle, aktiv)`, `gutachter_termine`, `leads`.

- [ ] **Step 1: DDL schreiben + via Plugin anwenden**

`apply_migration({ name: "auto_beratungstermin_trigger", query: <DDL unten> })`. Exaktes DDL:

```sql
CREATE OR REPLACE FUNCTION public.create_auto_beratungstermin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_kb uuid;
  v_tag date;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  -- Scope-Gate: nur frische, kontaktierbare, nicht-disqualifizierte, nicht-Test-Leads.
  IF NEW.status IS DISTINCT FROM 'neu'
     OR NEW.disqualifiziert IS TRUE
     OR NEW.source_channel = 'test'
     OR (NEW.telefon IS NULL AND NEW.email IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Idempotenz: kein zweiter Auto-Termin pro Lead.
  IF EXISTS (SELECT 1 FROM public.gutachter_termine WHERE lead_id = NEW.id AND typ = 'kb_beratung') THEN
    RETURN NEW;
  END IF;

  -- Beratungs-KB bestimmen. STRIKT rolle='kundenbetreuer' (validate_assignee verbietet Admin).
  -- Bestehenden KB-Owner wiederverwenden, sonst least-loaded Pool-KB (Tie-Break id).
  IF NEW.zugewiesen_an IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = NEW.zugewiesen_an AND rolle = 'kundenbetreuer' AND aktiv = true) THEN
    v_kb := NEW.zugewiesen_an;
  ELSE
    SELECT p.id INTO v_kb
    FROM public.profiles p
    WHERE p.rolle = 'kundenbetreuer' AND p.aktiv = true
    ORDER BY (
      SELECT count(*) FROM public.gutachter_termine t
      WHERE t.assignee_id = p.id AND t.typ = 'kb_beratung'
        AND t.status IN ('reserviert','bestaetigt')
    ) ASC, p.id
    LIMIT 1;
  END IF;

  -- Schadenberater setzen, nur wenn unbesetzt (Dispatch-Owner nicht ueberschreiben).
  IF NEW.zugewiesen_an IS NULL AND v_kb IS NOT NULL THEN
    UPDATE public.leads SET zugewiesen_an = v_kb WHERE id = NEW.id;
  END IF;

  -- Default-Zeit: naechster Werktag 10:00 Europe/Berlin.
  v_tag := (now() AT TIME ZONE 'Europe/Berlin')::date + 1;
  IF extract(dow from v_tag) = 6 THEN v_tag := v_tag + 2;      -- Sa -> Mo
  ELSIF extract(dow from v_tag) = 0 THEN v_tag := v_tag + 1;   -- So -> Mo
  END IF;
  v_start := (v_tag + time '10:00') AT TIME ZONE 'Europe/Berlin';
  v_end := v_start + interval '30 minutes';

  -- Insert. fall_id/claim_id bleiben NULL (kein Claim zur Lead-Zeit -> validate_claim_id erlaubt das).
  -- 0-KB-Fallback: assignee_typ + assignee_id + kb_id alle NULL (Dispatch-Queue).
  INSERT INTO public.gutachter_termine
    (lead_id, typ, assignee_typ, assignee_id, kb_id, status, kanal, start_zeit, end_zeit)
  VALUES
    (NEW.id, 'kb_beratung',
     CASE WHEN v_kb IS NULL THEN NULL ELSE 'kundenbetreuer' END,
     v_kb, v_kb,
     'reserviert', 'telefon', v_start, v_end);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ein Beratungstermin-Fehler darf die Lead-Anlage NIE brechen.
  RAISE WARNING 'create_auto_beratungstermin failed for lead %: %', NEW.id, SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_beratungstermin_on_lead ON public.leads;
CREATE TRIGGER trg_auto_beratungstermin_on_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.create_auto_beratungstermin();
```

- [ ] **Step 2: Recorded Version ablesen + File committen**

`list_migrations` → die vom Plugin vergebene Version `<V>` ablesen. File anlegen als `supabase/migrations/<V>_auto_beratungstermin_trigger.sql` mit **exakt** obigem DDL. `git add` + (Commit am Task-Ende).

- [ ] **Step 3: Happy-Path verifizieren (auto-rollback via Exception)**

Über `execute_sql` ausführen. Der abschließende `RAISE EXCEPTION` rollt den Test-Insert zurück (kein echter Lead bleibt) und trägt das Ergebnis in die Fehlermeldung:

```sql
DO $$
DECLARE v_lead uuid; v_cnt int; v_typ text; v_assignee uuid; v_kanal text; v_status text; v_start timestamptz;
BEGIN
  INSERT INTO public.leads (vorname, nachname, email, status, source_channel)
  VALUES ('SMOKE','Beratung','smoke-beratung@test.invalid','neu','self_service')
  RETURNING id INTO v_lead;

  SELECT count(*) INTO v_cnt FROM public.gutachter_termine WHERE lead_id = v_lead AND typ='kb_beratung';
  SELECT assignee_typ, assignee_id, kanal, status, start_zeit
    INTO v_typ, v_assignee, v_kanal, v_status, v_start
    FROM public.gutachter_termine WHERE lead_id = v_lead AND typ='kb_beratung' LIMIT 1;

  RAISE EXCEPTION 'SMOKE_OK cnt=% typ=% assignee=% kanal=% status=% start=%',
    v_cnt, v_typ, v_assignee, v_kanal, v_status, v_start;
END $$;
```
Expected (in der Fehlermeldung): `cnt=1`, `typ=kundenbetreuer`, `assignee=<eine KB-uuid>`, `kanal=telefon`, `status=reserviert`, `start=<naechster Werktag 10:00 Berlin>`.

- [ ] **Step 4: Out-of-scope verifizieren (Test-Lead → kein Termin)**

```sql
DO $$
DECLARE v_lead uuid; v_cnt int;
BEGIN
  INSERT INTO public.leads (vorname, nachname, email, status, source_channel)
  VALUES ('SMOKE','Test','smoke2@test.invalid','neu','test') RETURNING id INTO v_lead;
  SELECT count(*) INTO v_cnt FROM public.gutachter_termine WHERE lead_id = v_lead AND typ='kb_beratung';
  RAISE EXCEPTION 'SMOKE_OOS cnt=%', v_cnt;
END $$;
```
Expected: `cnt=0` (source_channel='test' ausgeschlossen). Zusätzlich gegenchecken: ein Lead mit `status='neu'`, `source_channel='self_service'`, aber `disqualifiziert=true` → ebenfalls `cnt=0` (gleiche DO-Block-Vorlage, `disqualifiziert` mit einsetzen).

- [ ] **Step 5: 0-KB-Pfad per Code-Review bestätigen**

Auf prod sind ≥2 aktive KB → 0-KB nicht live testbar. Per Review bestätigen: bei `v_kb IS NULL` setzt der `CASE` `assignee_typ=NULL`, `assignee_id=NULL`, `kb_id=NULL` → `validate_assignee` greift den Early-Return (`assignee_id IS NULL`), Insert geht durch, Termin landet ohne Owner (Dispatch-Queue). Im Task-Report dokumentieren.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/<V>_auto_beratungstermin_trigger.sql
git commit   # Message mit 7-Punkte-Audit + Co-Authored-By
```

---

## Task 2: Token-basierte `/flow`-Server-Actions

**Files:**
- Modify: `src/app/flow/[token]/self-service-actions.ts` (3 Funktionen anhängen; bestehendes `resolveFlowLead` wiederverwenden)
- Test: `src/app/flow/[token]/__tests__/beratungstermin-actions.test.ts`

**Interfaces:**
- Consumes: `resolveFlowLead(token)` (bereits im File, Zeilen 24–44: lädt `flow_links.lead_id`, Fallback Token=lead_id), `createAdminClient`, `revalidatePath`.
- Produces:
  - `ladeBeratungsterminFlow(token: string): Promise<{ ok: true; termin: { id: string; startZeit: string; status: string; kbVorname: string | null } | null } | { ok: false; error: string }>`
  - `bestaetigeBeratungsterminFlow(token: string): Promise<{ ok: boolean; error?: string }>`
  - `verschiebeBeratungsterminFlow(token: string, neuStartIso: string): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: Failing test schreiben**

`src/app/flow/[token]/__tests__/beratungstermin-actions.test.ts` — Mock-Idiom an `src/lib/sv-leads/__tests__/actions.test.ts` orientieren (mockt `@/lib/supabase/admin` + `next/cache`). Test-Fälle:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chainable Supabase-Mock: jede Methode gibt das Builder-Objekt zurueck; terminale
// Methoden (maybeSingle/single) liefern { data }. Pro Test ueber mockReturn gesteuert.
const builder: Record<string, ReturnType<typeof vi.fn>> = {}
const make = () => {
  const b: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of ['from','select','eq','or','in','order','limit','update','insert']) b[m] = vi.fn(() => b)
  b.maybeSingle = vi.fn()
  Object.assign(builder, b)
  return b
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => make() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  ladeBeratungsterminFlow, bestaetigeBeratungsterminFlow, verschiebeBeratungsterminFlow,
} from '../self-service-actions'

beforeEach(() => { vi.clearAllMocks() })

describe('ladeBeratungsterminFlow', () => {
  it('liefert null wenn kein kb_beratung-Termin existiert', async () => {
    make()
    // flow_links -> lead_id; termin-Lookup -> null
    builder.maybeSingle
      .mockResolvedValueOnce({ data: { lead_id: 'lead-1', expires_at: null } }) // resolveFlowLead
      .mockResolvedValueOnce({ data: null }) // termin
    const r = await ladeBeratungsterminFlow('tok')
    expect(r).toEqual({ ok: true, termin: null })
  })

  it('liefert Termin + KB-Vorname', async () => {
    make()
    builder.maybeSingle
      .mockResolvedValueOnce({ data: { lead_id: 'lead-1', expires_at: null } })
      .mockResolvedValueOnce({ data: { id: 't1', start_zeit: '2026-06-24T08:00:00Z', status: 'reserviert', assignee_id: 'kb-1' } })
      .mockResolvedValueOnce({ data: { vorname: 'Mara' } }) // KB profile
    const r = await ladeBeratungsterminFlow('tok')
    expect(r).toMatchObject({ ok: true, termin: { id: 't1', kbVorname: 'Mara', status: 'reserviert' } })
  })
})

describe('bestaetigeBeratungsterminFlow', () => {
  it('setzt status auf bestaetigt und gibt ok', async () => {
    make()
    builder.maybeSingle
      .mockResolvedValueOnce({ data: { lead_id: 'lead-1', expires_at: null } })
      .mockResolvedValueOnce({ data: { id: 't1', status: 'reserviert' } })
    builder.update.mockReturnValueOnce(builder)
    builder.eq.mockReturnValue(builder)
    // letzter eq() in der update-Kette liefert { error: null }
    builder.eq.mockReturnValueOnce(builder).mockResolvedValueOnce({ error: null })
    const r = await bestaetigeBeratungsterminFlow('tok')
    expect(r.ok).toBe(true)
  })

  it('ok:false bei ungueltigem Token', async () => {
    make()
    builder.maybeSingle.mockResolvedValueOnce({ data: null }) // flow_links nicht gefunden -> Fallback leadId=token; aber dann kein Termin
    builder.maybeSingle.mockResolvedValueOnce({ data: null }) // kein Termin
    const r = await bestaetigeBeratungsterminFlow('')
    expect(r.ok).toBe(false)
  })
})

describe('verschiebeBeratungsterminFlow', () => {
  it('berechnet end = start + 30min und updatet in place', async () => {
    make()
    builder.maybeSingle
      .mockResolvedValueOnce({ data: { lead_id: 'lead-1', expires_at: null } })
      .mockResolvedValueOnce({ data: { id: 't1', status: 'reserviert' } })
    builder.eq.mockReturnValue(builder)
    builder.eq.mockReturnValueOnce(builder).mockResolvedValueOnce({ error: null })
    const r = await verschiebeBeratungsterminFlow('tok', '2026-06-25T13:00:00.000Z')
    expect(r.ok).toBe(true)
    // Pruefen, dass update mit end_zeit = start + 30min aufgerufen wurde:
    const updateArg = builder.update.mock.calls.at(-1)?.[0]
    expect(updateArg).toMatchObject({ start_zeit: '2026-06-25T13:00:00.000Z', status: 'bestaetigt', verlegung_initiator_kunde: true })
    expect(new Date(updateArg.end_zeit).getTime() - new Date(updateArg.start_zeit).getTime()).toBe(30 * 60 * 1000)
  })
})
```

- [ ] **Step 2: Test rot laufen lassen**

Run: `npx vitest run src/app/flow/[token]/__tests__/beratungstermin-actions.test.ts`
Expected: FAIL (Funktionen existieren noch nicht).

- [ ] **Step 3: Die 3 Actions implementieren**

In `src/app/flow/[token]/self-service-actions.ts` anhängen (das File hat `'use server'` + `resolveFlowLead` + `createAdminClient`-Import + `revalidatePath` bereits):

```typescript
const BERATUNG_DAUER_MIN = 30

/** Lädt den kb_beratung-Termin des Leads (Anzeige im /flow). */
export async function ladeBeratungsterminFlow(
  token: string,
): Promise<{ ok: true; termin: { id: string; startZeit: string; status: string; kbVorname: string | null } | null } | { ok: false; error: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }
  const { data: t } = await admin
    .from('gutachter_termine')
    .select('id, start_zeit, status, assignee_id')
    .eq('lead_id', leadId)
    .eq('typ', 'kb_beratung')
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!t) return { ok: true, termin: null }
  let kbVorname: string | null = null
  if (t.assignee_id) {
    const { data: kb } = await admin.from('profiles').select('vorname').eq('id', t.assignee_id as string).maybeSingle()
    kbVorname = (kb?.vorname as string | null) ?? null
  }
  return {
    ok: true,
    termin: { id: t.id as string, startZeit: t.start_zeit as string, status: t.status as string, kbVorname },
  }
}

async function ladeAktivenBeratungstermin(
  admin: ReturnType<typeof createAdminClient>,
  leadId: string,
): Promise<{ id: string; status: string } | null> {
  const { data: t } = await admin
    .from('gutachter_termine')
    .select('id, status')
    .eq('lead_id', leadId)
    .eq('typ', 'kb_beratung')
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: false })
    .limit(1)
    .maybeSingle()
  return t ? { id: t.id as string, status: t.status as string } : null
}

/** „Passt mir" → bestätigt den Beratungstermin. */
export async function bestaetigeBeratungsterminFlow(
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }
  const termin = await ladeAktivenBeratungstermin(admin, leadId)
  if (!termin) return { ok: false, error: 'Kein Beratungstermin gefunden.' }
  const { error: updErr } = await admin
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('id', termin.id)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true }
}

/** „Verschieben" → freier In-Place-Move (Kunde ist König, keine Verfügbarkeitsprüfung). */
export async function verschiebeBeratungsterminFlow(
  token: string,
  neuStartIso: string,
): Promise<{ ok: boolean; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }
  const start = new Date(neuStartIso)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Ungültige Zeit.' }
  if (start.getTime() < Date.now()) return { ok: false, error: 'Bitte einen Termin in der Zukunft wählen.' }
  const termin = await ladeAktivenBeratungstermin(admin, leadId)
  if (!termin) return { ok: false, error: 'Kein Beratungstermin gefunden.' }
  const end = new Date(start.getTime() + BERATUNG_DAUER_MIN * 60 * 1000)
  const { error: updErr } = await admin
    .from('gutachter_termine')
    .update({
      start_zeit: start.toISOString(),
      end_zeit: end.toISOString(),
      status: 'bestaetigt',
      verlegung_initiator_kunde: true,
    })
    .eq('id', termin.id)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true }
}
```

(Hinweis: `BERATUNG_DAUER_MIN` ist eine **lokale** const in diesem `'use server'`-File — sie wird NICHT exportiert, daher AAR-664-konform.)

- [ ] **Step 4: Test grün laufen lassen**

Run: `npx vitest run src/app/flow/[token]/__tests__/beratungstermin-actions.test.ts`
Expected: PASS (alle Fälle). Falls das Mock-Chaining für die `update().eq()`-Kette hakt, den terminalen `eq`-Mock an das tatsächliche Idiom in `src/lib/sv-leads/__tests__/actions.test.ts` angleichen (dort wird dasselbe Supabase-Chaining gemockt).

- [ ] **Step 5: Commit**

```bash
git add src/app/flow/[token]/self-service-actions.ts src/app/flow/[token]/__tests__/beratungstermin-actions.test.ts
git commit   # 7-Punkte-Audit + Co-Authored-By
```

---

## Task 3: `BeratungsterminCard` + page.tsx-Load + FlowWizardKfz-Wiring

**Files:**
- Create: `src/app/flow/[token]/BeratungsterminCard.tsx`
- Modify: `src/app/flow/[token]/FlowWizardKfz.tsx` (Prop + Render im `account`-Step)
- Modify: `src/app/flow/[token]/page.tsx` (Termin laden + Prop durchreichen)

**Interfaces:**
- Consumes: `bestaetigeBeratungsterminFlow`, `verschiebeBeratungsterminFlow` (Task 2); `WunschterminPicker` aus `@/app/embed/gutachter-finder/_components/WunschterminPicker`.
- Produces: Prop `beratungstermin?: { id: string; startZeit: string; status: string; kbVorname: string | null } | null` auf `FlowWizardKfz`.

- [ ] **Step 1: `BeratungsterminCard.tsx` erstellen**

```tsx
'use client'

import { useState } from 'react'
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'
import { bestaetigeBeratungsterminFlow, verschiebeBeratungsterminFlow } from './self-service-actions'

type Props = {
  token: string
  termin: { id: string; startZeit: string; status: string; kbVorname: string | null }
}

function fmt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Berlin',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

// Berlin-Wall-Clock aus <input datetime-local> (WunschterminPicker liefert 'YYYY-MM-DDTHH:mm')
// als ISO interpretieren — der Picker erzeugt lokale Zeit; wir senden sie als ISO an die Action,
// die sie als Termin-Zeitpunkt speichert (gleiche Konvention wie der Embed-Wunschtermin).
function lokalToIso(lokal: string): string {
  return new Date(lokal).toISOString()
}

export function BeratungsterminCard({ token, termin }: Props) {
  const [startZeit, setStartZeit] = useState(termin.startZeit)
  const [status, setStatus] = useState(termin.status)
  const [verschieben, setVerschieben] = useState(false)
  const [neuLokal, setNeuLokal] = useState('')
  const [pending, setPending] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function bestaetigen() {
    setPending(true); setFehler(null)
    try {
      const r = await bestaetigeBeratungsterminFlow(token)
      if (!r.ok) { setFehler(r.error ?? 'Fehler'); return }
      setStatus('bestaetigt')
    } finally { setPending(false) }
  }

  async function speichern() {
    if (!neuLokal) return
    setPending(true); setFehler(null)
    try {
      const iso = lokalToIso(neuLokal)
      const r = await verschiebeBeratungsterminFlow(token, iso)
      if (!r.ok) { setFehler(r.error ?? 'Fehler'); return }
      setStartZeit(iso); setStatus('bestaetigt'); setVerschieben(false)
    } finally { setPending(false) }
  }

  return (
    <div className="mb-5 rounded-ios-md border border-claimondo-ondo/20 bg-claimondo-ondo/[0.06] p-5">
      <p className="text-xs uppercase tracking-wider text-claimondo-ondo mb-1">Ihr Beratungstermin</p>
      <p className="text-base font-semibold text-claimondo-navy">{fmt(startZeit)}</p>
      {termin.kbVorname && (
        <p className="text-sm text-claimondo-ondo mb-1">mit {termin.kbVorname}</p>
      )}
      <p className="text-xs text-claimondo-shield/80 mb-3">
        {status === 'bestaetigt' ? 'Bestätigt — wir rufen Sie zur vereinbarten Zeit an.' : 'Passt Ihnen dieser Termin?'}
      </p>

      {fehler && <p className="text-sm text-danger-strong mb-2">{fehler}</p>}

      {!verschieben ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {status !== 'bestaetigt' && (
            <button
              onClick={bestaetigen}
              disabled={pending}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm disabled:opacity-60 transition-colors"
            >
              Passt mir
            </button>
          )}
          <button
            onClick={() => setVerschieben(true)}
            disabled={pending}
            className="inline-flex items-center justify-center min-h-11 px-5 rounded-full border border-claimondo-border text-claimondo-navy font-semibold text-sm disabled:opacity-60"
          >
            Verschieben
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <WunschterminPicker value={neuLokal} onChange={setNeuLokal} />
          <div className="flex gap-2">
            <button
              onClick={speichern}
              disabled={pending || !neuLokal}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm disabled:opacity-60 transition-colors"
            >
              Neuen Termin speichern
            </button>
            <button
              onClick={() => { setVerschieben(false); setNeuLokal('') }}
              disabled={pending}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-full border border-claimondo-border text-claimondo-navy font-semibold text-sm disabled:opacity-60"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `FlowWizardKfz.tsx` — Prop + Render im account-Step**

(a) Prop in das Props-Objekt (nach `legalDocs`, Zeilen 127–165) aufnehmen:
```typescript
  beratungstermin,
```
und in den Typ:
```typescript
  // Auto-Beratungstermin (AAR-956): kb_beratung-Termin des Leads, gerendert als Karte im Abschluss-Step.
  beratungstermin?: { id: string; startZeit: string; status: string; kbVorname: string | null } | null
```
(b) Import oben ergänzen:
```typescript
import { BeratungsterminCard } from './BeratungsterminCard'
```
(c) Im `account`-Step (Block `currentStep.id === 'account'`, ~Zeilen 912–970) nach dem Success-Banner die Karte rendern:
```tsx
    {beratungstermin && (
      <BeratungsterminCard token={token} termin={beratungstermin} />
    )}
```
(Platzierung: direkt nach dem `bg-success-soft`-Success-Banner, vor dem LexDrive-Block.)

- [ ] **Step 3: `page.tsx` — Termin laden + Prop durchreichen**

Im Daten-Lade-Abschnitt (nach dem `lead`-Load, vor dem `return`) den Termin laden:
```typescript
// AAR-956 Auto-Beratungstermin: aktiven kb_beratung-Termin des Leads + KB-Vorname laden.
let beratungstermin: { id: string; startZeit: string; status: string; kbVorname: string | null } | null = null
{
  const { data: bt } = await svc
    .from('gutachter_termine')
    .select('id, start_zeit, status, assignee_id')
    .eq('lead_id', leadId)
    .eq('typ', 'kb_beratung')
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (bt) {
    let kbVorname: string | null = null
    if (bt.assignee_id) {
      const { data: kb } = await svc.from('profiles').select('vorname').eq('id', bt.assignee_id as string).maybeSingle()
      kbVorname = (kb?.vorname as string | null) ?? null
    }
    beratungstermin = {
      id: bt.id as string, startZeit: bt.start_zeit as string,
      status: bt.status as string, kbVorname,
    }
  }
}
```
Und im `<FlowWizardKfz ... />`-Aufruf die Prop ergänzen:
```tsx
        beratungstermin={beratungstermin}
```
(`svc` ist der bereits im File verwendete Service-Role-Client — denselben Namen nutzen wie beim `lead`-Load.)

- [ ] **Step 4: Build/Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.
Run (wenn schnell, sonst CI): `NODE_OPTIONS=--max-old-space-size=8192 npm run build` — `account`-Step ist Teil der `/flow/[token]`-Route, daher voller Build ideal.

- [ ] **Step 5: Ratchets**

Run (nach `git add`): `npm run check:token-audit`, `npm run check:component-set -- --ratchet`, `npm run check:knip -- --ratchet`
Expected: 0 neue Verstöße. (Karte nutzt `WunschterminPicker` + token-gebundenes Tailwind im Flow-Stil; keine neuen Status-Scales/raw-Hex.)

- [ ] **Step 6: Commit**

```bash
git add src/app/flow/[token]/BeratungsterminCard.tsx src/app/flow/[token]/FlowWizardKfz.tsx src/app/flow/[token]/page.tsx
git commit   # 7-Punkte-Audit + Co-Authored-By
```

---

## Post-Implementation (nach allen Tasks)

- **KB-Portal-Reader prüfen:** Grep, ob das KB-/Dispatch-Portal `kb_beratung`-Termine über `kb_id` ODER `assignee_id` filtert (`grep -rn "kb_beratung\|assignee_id\|kb_id" src/app/{dispatch,admin,kunde}`). Der Trigger setzt beide → beide Reader sehen den Termin; im Whole-Branch-Review bestätigen.
- **`claim_id`-Nachzug (verifiziert):** `convert-lead-to-claim.ts` fasst `gutachter_termine` **nicht** an (0 Treffer) → der Auto-Beratungstermin bleibt `lead_id`-gebunden auch nach Claim-Konversion. Das ist ausreichend (Anzeige im /flow via `lead_id`, im KB-Portal via `assignee_id`). **Kein** Touch an `convert-lead-to-claim.ts` (CMM-49-Hot-File).
- **Whole-Branch-Review** (opus) → dann PR gegen `staging`.
- **Post-Deploy:** E2E-Smoke (neuen Self-Service-Lead anlegen → /flow Abschluss-Step → Beratungstermin-Karte da → „Verschieben" → neue Zeit gespeichert), KB-Portal-Sichtbarkeit, ein echter 0-KB-Test in einer Staging-Sandbox (optional).

## Self-Review (vom Plan-Autor)

- **Spec-Coverage:** Baustein 1 → Task 1; Baustein 2 (Karte+Actions) → Task 2+3; Baustein 3 (Notification v1 = /flow-Anzeige + KB via zugewiesen_an) → durch Task 1 (`zugewiesen_an`) + Task 3 (Karte) abgedeckt, kein eigener Task nötig (kein Trigger-Modify, bewusst). Owner-Lifecycle (kein Re-Assign) → kein Code, durch „convert nicht anfassen" erfüllt. Scope/Edge-Cases → Task 1 Scope-Gate + Steps 3–5.
- **Placeholder-Scan:** keine TBD; alle Code-Blöcke vollständig; `<V>` = die vom Plugin vergebene Migrations-Version (in Task 1 Step 2 explizit abzulesen).
- **Typ-Konsistenz:** Das `beratungstermin`-Shape `{ id; startZeit; status; kbVorname }` ist identisch in `ladeBeratungsterminFlow` (Task 2), der `FlowWizardKfz`-Prop + `BeratungsterminCard`-Prop (Task 3) und dem `page.tsx`-Load (Task 3). Action-Namen `bestaetigeBeratungsterminFlow`/`verschiebeBeratungsterminFlow` identisch in Task 2 (Definition) + Task 3 (Card-Consumption).
