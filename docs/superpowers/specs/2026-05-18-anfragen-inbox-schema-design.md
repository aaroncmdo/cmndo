# anfragen-Inbox — Schema-Design

**Stand:** 2026-05-18 · **Branch:** `kitta/aar-kfzgutachter-ads-lp` · **Status:** Design freigegeben durch Aaron (Sektion 1 + 1b), Spec zum Review

---

## 1 · Ziel & Scope

### Problem heute
Die kfzgutachter-Ads-LP-Server-Action `submitKfzgutachterLead` postet an einen externen Webhook (`process.env.LEAD_WEBHOOK_URL`). Was der Webhook-Receiver mit `source`/`lp_variant`-Feldern macht, ist nicht im Code sichtbar. Für eine A/B-Test-Auswertung in Supabase fehlt die Datenspur. Außerdem fehlt für zukünftige Channel-Quellen (Telefon-Eingang, WA-Bot, weitere Landingpages, Partner-APIs) ein einheitliches Rohdaten-Inbox-Pattern.

### Ziel
Eine neue Tabelle `public.anfragen` als kanalübergreifende Inbox. LP-Submit (und perspektivisch jede andere Eingangsquelle) schreibt zuerst eine Anfrage. Eine `convert_anfrage_zu_lead()`-Function ruft *atomar im selben Server-Action-Schritt* einen Lead-Insert ab. Damit:
- Single Source of Truth pro Channel auf eigener Hardware (VPS + eigene Supabase) — kein externer Webhook nötig
- Audit-Trail: jede Anfrage bleibt persistent, auch bei fehlgeschlagenem Convert (Spam, Validierungsfehler, Connection-Drops)
- Anfrage-zu-Fall-Pipeline (Anfrage → Lead → Fall) bleibt klar getrennt
- Erweiterbar für neue Channels ohne Schema-Migration (jsonb-Payload + Function-IF-Branches)

### In Scope (diese Iteration)
- Tabelle `public.anfragen` (Schema, Indexes, Constraints)
- Function `public.convert_anfrage_zu_lead(uuid) RETURNS uuid` (SECURITY DEFINER)
- RLS-Policies (Dispatch/Admin lesen, Service-Role schreibt via Function)
- Server-Action-Refactor: `submitKfzgutachterLead` schreibt zuerst Anfrage, dann Convert
- Anpassungen an `LiveCountPill` (zählt jetzt anfragen statt leads)
- Migration (forward-only, kein automatischer Rückbau bestehender leads)

### Explizit Out of Scope
- Migration bestehender `erstelleOeffentlichenRueckruf`-Action (bleibt vorerst) — Refactor folgt sobald das Anfrage-Pattern bewährt
- Migration bestehender `submitStadtLead` (Stadt-Seiten) — analog
- Dispatch-UI für Anfrage-Inbox (`/dispatch/anfragen`) — separate Spec
- Spam-Detection-Logik (Rate-Limit pro IP, Bot-Score, Honeypot-Field) — wird später nachgezogen
- Multi-Channel-Sub-Tables (Schema-Vorlage „Option C" aus dem Brainstorm wurde verworfen, weil over-engineered)

---

## 2 · Architektur

```
LP-Form (Client) → Server-Action submitKfzgutachterLead
                     ↓
                   1. INSERT INTO anfragen (...) RETURNING id
                     ↓
                   2. SELECT convert_anfrage_zu_lead(anfrage_id)
                        Inside Function (atomic, SECURITY DEFINER):
                        ├─ Name-Split: vorname / nachname
                        ├─ INSERT INTO leads (...) RETURNING id
                        ├─ UPDATE anfragen SET lead_id, konvertiert_am, konvertier_status='success'
                        └─ Channel-spezifische Side-Effects (CASE quelle)
                            └─ z.B. INSERT INTO admin_termine, UPDATE leads.vermittelnder_makler_id
                     ↓
                   3. Server-Action returns { ok: true, leadId, anfrageId }

Fehlerpfad (Convert fail):
  - Anfrage bleibt persistent
  - konvertier_status='failed', konvertier_fehler=SQLERRM
  - Server-Action returns { ok: false, error, anfrageId } (für Audit)
```

**Designprinzip:** Zwei Schreib-Operationen, *eine* logische User-Aktion. Anfrage-Insert ist die letzte Verteidigungslinie für Audit-Vollständigkeit — auch wenn der Lead-Insert scheitert (RLS-Bug, NOT-NULL-Violation, fehlende FK), die Anfrage ist gespeichert und einer manuellen Nachverfolgung zugänglich.

---

## 3 · Datenmodell

### 3.1 Tabelle `public.anfragen`

```sql
CREATE TABLE public.anfragen (
  -- Identität
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Channel-Identifikation (Pflicht-Ursprung)
  quelle            text NOT NULL,    -- Slug: 'kfzgutachter-ads-lp', 'rueckruf-modal', 'telefon-aircall', 'gutachter-finder-termin', 'makler-partner-form'
  quelle_variant    text,             -- A/B-Test-Variante (z.B. 'test_b')
  quelle_url        text,             -- Vollständige URL inkl. Query-String — Audit + Re-Parse falls UTMs fehlen
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_term          text,
  utm_content       text,

  -- Kontakt-Felder (kanalübergreifend, alle nullable außer phone fürs UWG-Minimum)
  kontakt_name           text,
  kontakt_telefon        text,
  kontakt_email          text,
  kontakt_plz_oder_stadt text,        -- Free-Text aus Form: "Köln" oder "50667"

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

-- Indexes (folgt query-partial-indexes aus Supabase-Skill)
CREATE INDEX anfragen_created_at_idx ON public.anfragen (created_at DESC);
CREATE INDEX anfragen_quelle_idx     ON public.anfragen (quelle, created_at DESC);
CREATE INDEX anfragen_status_idx     ON public.anfragen (konvertier_status)
  WHERE konvertier_status <> 'success';                                  -- Inbox/Error-Queue klein halten
CREATE INDEX anfragen_lead_id_idx    ON public.anfragen (lead_id)
  WHERE lead_id IS NOT NULL;                                             -- Reverse-Lookup von Lead → Anfrage(n)
CREATE INDEX anfragen_telefon_idx    ON public.anfragen (kontakt_telefon)
  WHERE kontakt_telefon IS NOT NULL;                                     -- Dubletten-Check + Spam-Detection
```

**Spalten-Begründungen (kompakt):**
- `quelle text NOT NULL` — harte Ursprungs-Pflicht auf DB-Ebene, jeder INSERT muss sie liefern
- `quelle_url` — vollständige URL für Audit + späteres Re-Parsing falls UTMs am Frontend nicht korrekt geparsed wurden
- 5× UTM-Felder — Werbe-Standard, alle nullable
- `kontakt_*` — die 4 Felder, die *jeder* Channel mitbringen kann; channel-spezifische gehen in `payload`
- `payload jsonb` — Schemas-loses Auffangbecken für Channel-Eigenheiten, später promotierbar
- `client_ip` + `user_agent` — Spam-/Bot-Detection-Material
- `lead_id` + `konvertiert_am` + `konvertier_status` + `konvertier_fehler` — vollständiger Convert-Audit-Trail

### 3.2 Indexe — Partial-Strategy

Drei der fünf Indexes sind `WHERE`-gefiltert (`status <> 'success'`, `lead_id IS NOT NULL`, `telefon IS NOT NULL`). Das hält sie schlank und steigert Dispatch-Queries:
- `anfragen_status_idx`: alles was *nicht* erfolgreich konvertiert wurde — typische Größe < 5 % der Tabelle
- `anfragen_lead_id_idx`: erfolgreich konvertierte — relevant für Reverse-Lookup Lead → Anfrage
- `anfragen_telefon_idx`: alle mit Telefonnummer — für Dubletten-Detection, anonyme Anfragen ohne Phone werden ignoriert

Folgt direkt `query-partial-indexes` (Supabase-Best-Practices) und ist nachweislich performanter als ein Full-Index bei dieser Lese-Last.

---

## 4 · Convert-Function

### 4.1 Signatur + Body

```sql
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
  -- 1. Anfrage holen
  SELECT * INTO v_anfrage FROM public.anfragen WHERE id = p_anfrage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anfrage % nicht gefunden', p_anfrage_id;
  END IF;

  -- Idempotenz: falls bereits konvertiert, gib lead_id zurück ohne neu zu erstellen
  IF v_anfrage.lead_id IS NOT NULL THEN
    RETURN v_anfrage.lead_id;
  END IF;

  -- 2. Name-Split: "Max Mustermann" → vorname="Max", nachname="Mustermann"
  v_vorname  := split_part(trim(coalesce(v_anfrage.kontakt_name, '')), ' ', 1);
  v_nachname := NULLIF(
                  substr(trim(coalesce(v_anfrage.kontakt_name, '')), length(v_vorname) + 2),
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
    v_anfrage.kontakt_plz_oder_stadt        -- TODO: PLZ-Pattern-Match in späterer Iteration
  )
  RETURNING id INTO v_lead_id;

  -- 4. Channel-spezifische Side-Effects (CASE quelle)
  IF v_anfrage.quelle = 'gutachter-finder-termin'
     AND v_anfrage.payload ? 'vorgesehener_gutachter_id'
     AND v_anfrage.payload ? 'termin_start' THEN
    -- Reservierten Termin in admin_termine übernehmen
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
  -- nicht existiert. Beim Anlegen der Spalte (siehe §4.3) den Block
  -- aktivieren. Bis dahin würde die Function bei quelle='makler-partner-form'
  -- mit ungültigem Spalten-Verweis crashen — diesen Channel deshalb in dieser
  -- Iteration nicht ausgeben.
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

GRANT EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid) TO authenticated, service_role;
```

### 4.2 Eigenschaften der Function

- **`SECURITY DEFINER`** — läuft mit Owner-Rights, kann RLS auf `leads` umgehen. Notwendig, weil die Service-Role-Server-Action eh schon RLS bypassed, aber die Function-Form bewirkt, dass die Logik auch durch authentifizierte Caller (Dispatch-UI) reusable wird.
- **`SET search_path = public, pg_temp`** — bewusst gesetzt (Pflicht für `SECURITY DEFINER`-Funktionen, sonst Hijack-Risiko via überschriebenen Funktionen in benutzerkontrollierten Schemas)
- **`FOR UPDATE` auf Anfrage-SELECT** — verhindert Race-Conditions wenn zwei parallele Convert-Calls denselben `p_anfrage_id` bekommen
- **Idempotenz**: `IF v_anfrage.lead_id IS NOT NULL THEN RETURN ...` — re-runs sind safe
- **Exception-Handler**: persistiert `konvertier_status='failed'` *bevor* die Exception nach oben propagiert. Damit ist der Audit-Trail auch im Failure-Pfad korrekt.
- **`auth.uid()`** als `erstellt_von` für `admin_termine` — bei Service-Role-Call ist das NULL, bei Dispatch-UI-Call der Dispatcher
- **Channel-IF-Blöcke** sind dokumentations-getrieben — neue Channels fügen je einen IF-Block hinzu, kein zentrales Routing

### 4.3 Migrations-Hinweis: `leads.vermittelnder_makler_id`

Die Convert-Function referenziert `leads.vermittelnder_makler_id` für den `makler-partner-form`-Branch. **Diese Spalte existiert heute nicht.** Sie wird im Rahmen dieser Iteration *nicht* angelegt — der IF-Branch ist eine *Vorlage* für die spätere Makler-Channel-Iteration. Wenn sie kommt:
```sql
ALTER TABLE public.leads
  ADD COLUMN vermittelnder_makler_id uuid REFERENCES public.makler(id);
CREATE INDEX leads_makler_id_idx ON public.leads (vermittelnder_makler_id) WHERE vermittelnder_makler_id IS NOT NULL;
```
+ den Function-IF aktivieren. Für die LP-Iteration genug, nicht im Convert-Code aktiv.

---

## 5 · RLS-Policies

```sql
ALTER TABLE public.anfragen ENABLE ROW LEVEL SECURITY;

-- Service-Role bypasst RLS automatisch (server-side INSERTs aus Server-Actions)
-- Authentifizierte User: nur Admin + Dispatch dürfen lesen
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

-- Authentifizierte User: nur Admin + Dispatch dürfen disqualifizieren / Notizen
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

-- KEINE INSERT-Policy für authenticated → INSERTs gehen nur über Service-Role (Server-Action)
-- KEINE DELETE-Policy → Anfragen werden nie gelöscht, sondern disqualifiziert (Audit-Trail bleibt)
```

**Anonyme User (anon-Role):** kein Policy-Match → effektiv default-deny. INSERT-Pfad geht über `service_role` (Server-Action mit `createServiceClient()`).

**Function-EXECUTE-Grant:** `convert_anfrage_zu_lead` ist `GRANT EXECUTE ... TO authenticated, service_role` — d.h. Dispatch-UI kann später eine manuelle Re-Convert-Action triggern (z.B. nach Reparatur einer fehlgeschlagenen Anfrage), die Server-Action ruft sie direkt mit Service-Role auf.

---

## 6 · Server-Action-Refactor

`src/app/kfzgutachter-lp/actions.ts` wird ersetzt. Neuer Flow:

```ts
'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

const LeadSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  phone: z.string().regex(/[\+0-9\s\-\(\)]{8,}/, 'Ungültige Telefonnummer'),
  city: z.string().min(2).max(100).trim(),
})

export async function submitKfzgutachterLead(
  formData: FormData,
): Promise<
  | { ok: true; leadId: string; anfrageId: string }
  | { ok: false; error: string; field?: 'name' | 'phone' | 'city'; anfrageId?: string }
> {
  // 1. Validierung (unverändert)
  const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Eingaben unvollständig',
      field: (issue?.path[0] as 'name' | 'phone' | 'city' | undefined) ?? undefined,
    }
  }

  // 2. Headers für Audit
  const h = await headers()
  const clientIp =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent') ?? null
  // UTMs/quelle-URL kommen aus FormData (vom Client gesetzt) ODER Referer-Header
  const referer = h.get('referer') ?? null

  const sb = createServiceClient()

  // 3. Anfrage anlegen
  const { data: anfrage, error: anfErr } = await sb
    .from('anfragen')
    .insert({
      quelle: 'kfzgutachter-ads-lp',
      quelle_variant: 'test_b',
      quelle_url: referer,
      kontakt_name: parsed.data.name,
      kontakt_telefon: parsed.data.phone,
      kontakt_plz_oder_stadt: parsed.data.city,
      // UTMs: aus FormData (vom Client als hidden inputs gesetzt)
      utm_source:   String(formData.get('utm_source')   ?? '') || null,
      utm_medium:   String(formData.get('utm_medium')   ?? '') || null,
      utm_campaign: String(formData.get('utm_campaign') ?? '') || null,
      utm_term:     String(formData.get('utm_term')     ?? '') || null,
      utm_content:  String(formData.get('utm_content')  ?? '') || null,
      payload: {},
      client_ip: clientIp,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (anfErr || !anfrage) {
    console.error('[kfzgutachter-lp] Anfrage-Insert fehlgeschlagen:', anfErr?.message)
    return { ok: false, error: 'Konfigurationsfehler — bitte rufen Sie an: 0221 25906530' }
  }

  // 4. Atomic Convert
  const { data: leadId, error: convErr } = await sb
    .rpc('convert_anfrage_zu_lead', { p_anfrage_id: anfrage.id })

  if (convErr || !leadId) {
    console.error('[kfzgutachter-lp] Convert fehlgeschlagen:', convErr?.message, 'anfrageId:', anfrage.id)
    return {
      ok: false,
      error: 'Übermittlung erhalten — Verarbeitung läuft. Wir melden uns auch ohne Sofort-Bestätigung.',
      anfrageId: anfrage.id,
    }
  }

  // 5. Revalidate Dispatch-Views
  revalidatePath('/admin/leads')
  revalidatePath('/dispatch/leads')
  revalidatePath('/dispatch/anfragen')   // existiert noch nicht — separater Spec

  return { ok: true, leadId, anfrageId: anfrage.id }
}
```

**Wesentliche Änderungen vs. heute:**
- Kein externer Webhook mehr (`LEAD_WEBHOOK_URL`-Env entfällt — nicht mehr lesen, aber noch nicht löschen, Migration bestehender Channels offen)
- Erst Anfrage-Insert (mit Headers + UTMs), dann RPC-Call der Function
- Convert-Failure → Anfrage bleibt erhalten, Server-Action gibt Soft-Error zurück mit `anfrageId` für späteres Audit
- Return-Type erweitert um `anfrageId`

### 6.1 UTMs aus dem Client mitliefern

Damit UTMs in `anfragen` landen, muss der `LeadFormClient` UTMs aus `window.location.search` parsen und als hidden inputs ins Form-FormData packen. Kleine Erweiterung (≈ 15 Zeilen, gehört in den Implementation-Plan):

```tsx
// LeadFormClient.tsx — am Anfang von handleSubmit, vor startTransition:
const params = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search)
  : new URLSearchParams()
for (const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']) {
  const v = params.get(key); if (v) fd.set(key, v)
}
```

---

## 7 · LiveCountPill-Anpassung

`src/app/kfzgutachter-lp/live-stats.ts` zählt aktuell `leads`. Nach dem Refactor zählen wir besser `anfragen` mit erfolgreichem Convert — das ist die direkte LP-Konversions-Metrik:

```ts
const { count, error } = await sb
  .from('anfragen')
  .select('id', { count: 'exact', head: true })
  .eq('quelle', 'kfzgutachter-ads-lp')
  .eq('konvertier_status', 'success')
  .gte('created_at', since)
```

Damit zeigt die Live-Pill jetzt **LP-spezifische** Zahlen (statt platform-weiter Leads). UWG-konform, weil das ein abgegrenzter, ehrlicher Wert ist („auf dieser Seite generierte Anfragen").

---

## 8 · Failure-Modes & Tests

### 8.1 Failure-Modes

| Szenario | Verhalten |
|---|---|
| Validierungs-Fehler (Zod) | Server-Action gibt `{ ok: false, field }` zurück — **keine** Anfrage angelegt |
| Anfrage-Insert fehlgeschlagen (DB-Connect-Drop, NOT-NULL etc.) | Server-Action gibt Soft-Error mit Tel-Fallback-Wording; keine Anfrage, kein Lead |
| Convert-Function-Fehler (Lead-Insert-Fehler) | Anfrage **bleibt**, `konvertier_status='failed'`, `konvertier_fehler=SQLERRM`. Server-Action gibt Soft-Error mit `anfrageId` zurück |
| Idempotenz: Convert für bereits konvertierte Anfrage | Function gibt bestehende `lead_id` zurück, kein neuer Lead |
| Race-Condition: zwei parallele Converts | `FOR UPDATE` lockt, zweiter Aufruf sieht `lead_id IS NOT NULL` und returns |
| Spam-Submit (Bot fluten) | Heute nicht abgefangen, IP/UA bleiben für spätere Rate-Limit-Logik in den Spalten |

### 8.2 Tests

Vitest für die TypeScript-Action:
- Mock `createServiceClient` → assert: `from('anfragen').insert(...)` mit erwartetem Body
- Mock `.rpc('convert_anfrage_zu_lead', ...)` → assert: Server-Action gibt `{ ok: true, leadId, anfrageId }` zurück
- Convert-Failure-Pfad: rpc throws → Server-Action gibt Soft-Error mit anfrageId

DB-Test (SQL-Smoke in Migration-Suite):
```sql
-- smoke.sql nach Migration
INSERT INTO public.anfragen (quelle, kontakt_name, kontakt_telefon, kontakt_plz_oder_stadt)
VALUES ('kfzgutachter-ads-lp', 'Test User', '015100000000', 'Köln')
RETURNING id \gset

SELECT public.convert_anfrage_zu_lead(:'id');

-- Erwartung: Anfrage hat lead_id, konvertier_status='success'
SELECT id, lead_id, konvertier_status FROM public.anfragen WHERE id = :'id';
-- Erwartung: Lead existiert mit Test User
SELECT id, vorname, nachname, telefon FROM public.leads WHERE id = (
  SELECT lead_id FROM public.anfragen WHERE id = :'id'
);
```

Manual-Smoke nach Production-Deploy:
- LP öffnen mit `?utm_source=test&utm_campaign=manual-smoke`
- Formular ausfüllen + submitten
- Supabase: `SELECT * FROM anfragen ORDER BY created_at DESC LIMIT 1` → utm_source='test', konvertier_status='success', lead_id ≠ NULL
- `SELECT * FROM leads WHERE id = <lead_id>` → vorname/nachname/telefon korrekt

---

## 9 · Migration-Plan (Sketch — wird in writing-plans detailliert)

1. **Migration 1** (forward): `anfragen`-Tabelle + Indexes + RLS-Policies erstellen
2. **Migration 2** (forward): `convert_anfrage_zu_lead`-Function + Grants
3. **App-Code**: `actions.ts`-Refactor + `live-stats.ts`-Anpassung + `LeadFormClient`-UTM-Inputs
4. **Vitest**: Tests grün
5. **Local Smoke**: dev-Server, LP, Anfrage-Insert + Convert prüfen
6. **Staging-Deploy**: PR gegen `staging`, dort Migration anwenden, manueller End-to-End-Smoke
7. **Prod-Migration**: nach staging→main-Merge ein erneuter `supabase db push` auf Prod

**Rollback**: alle Migrations sind additiv. Falls Bug: Migration revert (`DROP FUNCTION ...`, `DROP TABLE anfragen CASCADE`) + actions.ts auf Pre-State zurück. LeadFormClient kann auf Pre-Refactor zurück, nichts in anderen Tabellen wurde verändert.

---

## 10 · Offene Punkte (außerhalb dieser Spec)

- **PLZ-Parsing**: `kontakt_plz_oder_stadt` ist Free-Text. Später: in Convert-Function PLZ-Regex extrahieren, in `leads.kunde_plz` einsetzen, Stadt-Lookup in `leads.kunde_stadt`. Heute: Roh-Text in `leads.kunde_plz` — Dispatcher räumt nach.
- **Spam/Rate-Limit**: `client_ip` + `user_agent` sind erfasst, aber keine Schutz-Logik. Backlog: rate-limit pro IP (max 3 anfragen/15 Min), Honeypot-Field im Form, optional Cloudflare-Turnstile.
- **Dispatch-Inbox-UI**: `/dispatch/anfragen` mit Filter (status, quelle, Datum) — separater Spec.
- **Migration bestehender Patterns**: `erstelleOeffentlichenRueckruf` + `submitStadtLead` → später auf Anfrage-Pattern migrieren. Heute parallel.
- **mitteilungen für Dispatch**: heute schreibt `erstelleOeffentlichenRueckruf` Bell-Notifications. Convert-Function tut das nicht — sollte sie? In dieser Iteration: nein, weil der LP-Flow keine sofortige Dispatch-Reaktion erfordert wie ein Rückruf. Bei Bedarf später als Channel-IF-Block.

---

## Anhang · Code-Pfade-Referenz

- Migration-Skript: `supabase/migrations/<YYYYMMDD>_anfragen_inbox.sql` (kommt in writing-plans)
- Server-Action: `src/app/kfzgutachter-lp/actions.ts`
- Stats-Helper: `src/app/kfzgutachter-lp/live-stats.ts`
- Form-Client: `src/app/kfzgutachter-lp/LeadFormClient.tsx`
- Bestehende vergleichbare Action: `src/lib/actions/public-rueckruf.ts` (bleibt unverändert in dieser Iteration)
- Spec-Vorgänger: `docs/18.05.2026/kfzgutachter-lp-gap-eval.md` (Cross-Cutting §3 lp_variant-Spalte — wird durch diese Spec gelöst)
