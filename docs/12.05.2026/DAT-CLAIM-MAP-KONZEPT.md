# DAT Claim-Map — Konzept für Claude Code

**Stand:** 2026-05-12 · Validiert mit Nicolas + Aaron · **Spec-Update 2026-05-15** (AAR-922)
**Scope:** Public, embeddable Claim-Map auf `gutachter.claimondo.de/claim` (oder als iframe-Modul auf `dat.de/sachverstaendige`)
**Trigger:** E-Mail von Philipp Sedelmeier (DAT-Gebietsleiter) an 62 DAT Expert Standorte PLZ 50–59

---

## 0. Spec-Updates 2026-05-15 (AAR-922)

Audit (`docs/15.05.2026/dat-onboarding-claim-audit.md`) hat 5 Blocker identifiziert. Dieses Spec ist entsprechend angepasst:

| Blocker | Wo gefixt |
|---|---|
| RLS fehlte für `sv_leads`/`claim_activations` | Neuer Abschnitt **7.4** + Abschnitt 8 (Migration mit Policies) |
| `id ulid` ist kein nativer Postgres-Typ | Abschnitt 8: `uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| `firma_key`-Generierungs-Strategie undefiniert | Neuer Abschnitt **8.2** mit Slug-Pattern + Konflikt-Resolution |
| `quelle = 'dat_expert'`-Live-Check fehlte | Neuer Abschnitt **8.3** Pre-Migration-Schritt |
| `supabase_functions.http_request()` als SQL-Trigger | Abschnitt 7.3: Edge-Function aus Server-Action statt SQL-Trigger |

Plus Nice-to-haves (Bot-Protection, Resend-Flow, Mapbox-Token-Restrictions) in Abschnitt 9.

---

## 1. Übersicht

Die Claim-Map ist die erste Berührung der Gutachter mit der Plattform nach Philipps E-Mail. Sie hat genau einen Job: in unter 90 Sekunden den Standort vom Lead-Status zum geclaimten Status bringen, plus E-Mail-Adresse erfassen für die Aktivierungs-Mail.

Architektur-Entscheidung: **Option C — Map als Embed-Modul, Claim als Portal-Modal.** Die Map ist eine schlanke standalone Komponente (Mapbox + Supabase REST), der Claim öffnet ein Modal/Slide-over im Portal-Kontext. So lässt sich die Map später auch als iframe auf `dat.de` einbetten, der Claim selbst bleibt im claimondo.de-Kontext mit Supabase Auth.

---

## 2. Layout & Wireframes

### 2.1 Desktop (≥ 1024px)

```
┌──────────────────────────────────────────────────────────────────┐
│  [Claimondo Logo]    [DAT Expert Partner Badge]                   │  ← Header
│                                                                  │     32px hoch
├──────────────────────────────────────────────────────────────────┤
│ ┌────────────────┐                                               │
│ │ 🔍 PLZ, Firma… │                                               │  ← Floating
│ └────────────────┘                                               │     Searchbar
│                                                                  │     top-left
│                                                                  │
│                                                                  │
│                                                                  │
│              [ MAPBOX-KARTE — fullscreen ]                        │
│                                                                  │
│              62 Pins: 45 Hauptstandorte + 17                      │
│              Nebenstandorte (gleiche Firmen)                      │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                                  │
│ ┌────────────────────────────────────────────────────────────┐  │
│ │ 62 Standorte · 0€ für DAT Expert Partner · Live-           │  │  ← Stat-Bar
│ │ Disponierung in 5 Klicks                                    │  │     unten zentriert
│ └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

Wenn Pin angeklickt: Side-Panel schiebt sich von rechts (Width 420px, full-height) als Overlay. Karte bleibt links sichtbar.

### 2.2 Mobile (< 768px)

```
┌──────────────────────┐
│  [Logo] [DAT Badge]  │
├──────────────────────┤
│ ┌──────────────────┐ │
│ │ 🔍 PLZ, Firma…   │ │
│ └──────────────────┘ │
│                      │
│                      │
│      MAPBOX-KARTE    │
│                      │
│                      │
│                      │
├──────────────────────┤
│  ━━━ Drag-Handle ━━━ │  ← Bottom-Sheet Peek
│  62 Standorte        │     ~30% Höhe
│  Liste durchsuchen ↑ │     hochziehbar
└──────────────────────┘
```

Bottom-Sheet hat drei Zustände:
- **Peek (30%):** Nur Stat-Bar + Hint sichtbar
- **Half (60%):** Firmenliste sichtbar, scrollbar
- **Full (95%):** Liste + Claim-Formular nach Pin-Auswahl

---

## 3. Mapbox-Konfiguration

```js
const mapConfig = {
  center: [7.0, 51.0],          // Köln/Bonn-Region
  zoom: 9,                       // ganze PLZ 50–59 sichtbar
  minZoom: 8,
  maxZoom: 17,
  style: 'mapbox://styles/mapbox/light-v11',  // Claimondo-Look
  attributionControl: false,     // dezenter Footer separat
};
```

Stilanpassungen via Layer-Overrides:
- Wasser: `--c-light-blue` 20% opacity
- Straßen: `--c-border`
- Labels: `--c-muted` / `--c-navy`
- Country/State borders: `--c-border` dashed

---

## 4. Pin-Design

### 4.1 Pin-Typen

| Typ | Design | Wann |
|---|---|---|
| **Hauptstandort verfügbar** | Größer (32px), `--c-ondo` Fill, „H"-Badge oben | `sv_leads.ist_hauptstandort = true` UND `warteliste_status = 'ausstehend'` |
| **Nebenstandort verfügbar** | Kleiner (24px), `--c-light-blue` Fill | `ist_hauptstandort = false` UND `warteliste_status = 'ausstehend'` |
| **Soeben geclaimed** (Session) | Animation: blau → grün, kurzer Bounce | Nach Submit, vor Page-Reload |
| **Bereits vergeben** | 50% Opacity, kein Hover-Effekt, nicht klickbar | `warteliste_status IN ('geclaimed', 'verifiziert', 'aktiv')` |

### 4.2 Firma-Gruppierung

Pins der gleichen Firma (gleiche `firma_key`) bekommen:
- Gleiche Farbe-Sättigung (etwas variiert um sie zu unterscheiden)
- Bei Hover über einen Pin → alle Pins der gleichen Firma pulsieren kurz
- Im Side-Panel: „+ 3 weitere Standorte dieser Firma" als Hinweis

### 4.3 Clustering

Bei Zoom < 10: Pins werden zu Cluster-Bubbles aggregiert mit Anzahl-Label. Mapbox built-in Clustering. Beim Klick auf Cluster: Zoom + 2 Stufen.

---

## 5. Suchfeld (Floating Searchbar)

**Position:** Desktop oben links auf der Karte, 16px Margin. Mobile: oben unter dem Header.
**Komponente:** `.input` mit `search`-Icon links, `.shadow-md`, weißer Hintergrund.
**Verhalten:** Autocomplete-Dropdown mit max. 8 Treffern, fuzzy-matching auf:
- Firmenname (alle 45 Firmen)
- PLZ (50000–59999)
- Ortsname (Köln, Bergisch Gladbach, Bonn, etc.)

Bei Auswahl: Karte fliegt zum Pin (Mapbox `easeTo`), Pin pulsiert 2 Sekunden, Side-Panel öffnet sich automatisch.

**Wichtig:** Suche FILTERT NICHT die Pins. Alle 62 bleiben sichtbar. Suche zoomt nur hin. Das ist Social Proof — der Gutachter sieht die volle Abdeckung.

---

## 6. Side-Panel / Bottom-Sheet — 4 Zustände

### Zustand 1 — Pin-Preview (nach Pin-Klick)

```
┌────────────────────────────────────┐
│ [×] Schließen                       │
├────────────────────────────────────┤
│                                    │
│  Ing.-Büro Wester GmbH             │  ← --text-h2
│                                    │
│  Venloerstr. 1041                  │  ← --text-body
│  50829 Köln                        │
│                                    │
│  [Hauptstandort Badge]              │  ← .pill-blue
│                                    │
│  Diese Firma hat noch 3 weitere    │  ← --text-caption
│  Standorte (Lütz GmbH).             │     --c-muted
│                                    │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Standort beanspruchen  →    │  │  ← .btn-default
│  └──────────────────────────────┘  │     volle Breite
│                                    │
└────────────────────────────────────┘
```

### Zustand 2 — Claim-Formular

```
┌────────────────────────────────────┐
│ [←] Zurück                          │
├────────────────────────────────────┤
│                                    │
│  Ing.-Büro Wester GmbH             │  ← Kompakt-Header
│  Venloerstr. 1041, 50829 Köln       │
│                                    │
│  ──────────────────────────────    │
│                                    │
│  Vorname *                          │
│  ┌──────────────────────────────┐  │
│  │ Thomas                       │  │  ← .input 40px
│  └──────────────────────────────┘  │
│                                    │
│  Nachname *                         │
│  ┌──────────────────────────────┐  │
│  │ Bergmann                     │  │
│  └──────────────────────────────┘  │
│                                    │
│  E-Mail *                           │
│  ┌──────────────────────────────┐  │
│  │ thomas@bergmann-gutachten.de │  │
│  └──────────────────────────────┘  │
│                                    │
│  Telefon (optional)                 │
│  ┌──────────────────────────────┐  │
│  │ 0221 1234567                 │  │
│  └──────────────────────────────┘  │
│                                    │
│  ──────────────────────────────    │
│                                    │
│  Qualifikation (mind. 1)            │
│                                    │
│  ☑ DAT Expert                       │  ← Checkboxen
│  ☐ BVSK Mitglied                    │     keine Nummern
│  ☐ ÖBuV                             │
│  ☐ IHK zertifiziert                 │
│                                    │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Standort sichern ✓          │  │  ← .btn-default
│  └──────────────────────────────┘  │     disabled bis
│                                    │     Pflicht-Felder OK
└────────────────────────────────────┘
```

**Validierung:**
- E-Mail-Format Regex (RFC 5322 light)
- Mindestens 1 Qualifikations-Checkbox
- Vor- und Nachname mind. 2 Zeichen
- Telefon (optional): wenn ausgefüllt, mindestens 7 Ziffern

### Zustand 3 — Multi-Standort-Check (conditional)

Wird nur angezeigt wenn `sv_leads` weitere Einträge mit gleichem `firma_key` enthält und `warteliste_status = 'ausstehend'`.

```
┌────────────────────────────────────┐
│ Standort gesichert ✓                │  ← --c-success-fg
├────────────────────────────────────┤
│                                    │
│  Wir sehen 3 weitere Standorte     │  ← --text-h3
│  von Lütz GmbH:                    │
│                                    │
│  ☑ Hauptstr. 12, 51465 BergGladbach │
│  ☑ Marktstr. 8, 51491 Overath       │  ← alle vorausgewählt
│  ☑ Bahnhofstr. 33, 51545 Waldbröl   │
│                                    │
│  Möchtest du diese auch             │
│  beanspruchen? Du kannst alle mit   │
│  derselben E-Mail verwalten.       │
│                                    │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Alle bestätigen →           │  │
│  └──────────────────────────────┘  │
│                                    │
│  [ Nur den Hauptstandort claimen ] │  ← .btn-outline
│                                    │
└────────────────────────────────────┘
```

### Zustand 4 — Bestätigung

```
┌────────────────────────────────────┐
│                                    │
│           ┌──────┐                 │
│           │  ✓   │                 │  ← Grüner Kreis
│           └──────┘                 │     animiert (scale 0→1)
│                                    │
│   Dein Standort ist gesichert!     │  ← --text-h1
│                                    │
│   Ing.-Büro Wester GmbH            │
│   Venloerstr. 1041, 50829 Köln     │
│                                    │
│   ──────────────────────────────   │
│                                    │
│   Was jetzt passiert:              │  ← --text-h3
│                                    │
│   1  Aktivierungs-Mail prüfen      │  ← Numbered list
│      Magic-Link per E-Mail.         │
│                                    │
│   2  Passwort setzen                │
│      Einmal-Passwort eingeben,      │
│      eigenes Passwort wählen.       │
│                                    │
│   3  Profil einrichten              │
│      Qualifikationen, Kalender      │
│      und Verfügbarkeit.             │
│                                    │
│   4  Live auf der Karte             │
│      Geschädigte können dich        │
│      finden und buchen.             │
│                                    │
│   ──────────────────────────────   │
│                                    │
│   ┌──────────────────────────────┐ │
│   │ 📅 Live-Webinar am 04. Juni  │ │  ← alert alert-info
│   │ Nicolas, Aaron und Philipp    │ │
│   │ zeigen alles im Detail.       │ │
│   │                              │ │
│   │ [ Termin speichern ↓ ]       │ │  ← .btn-outline btn-sm
│   │                              │ │
│   │ Meet-Link folgt per Mail.    │ │
│   └──────────────────────────────┘ │
│                                    │
│   Fragen? partner@claimondo.de     │  ← --text-caption
│                                    │
└────────────────────────────────────┘
```

Gleichzeitig: Pin auf der Karte wechselt von Blau zu Grün mit Bounce-Animation.

---

## 7. Backend-Aktionen

### 7.1 Pin-Klick (kein DB-Call)

Nur Frontend-State, Lead-Daten kommen aus initialem Map-Load.

### 7.2 Map-Load (Page Load)

```sql
SELECT id, firma, strasse, plz, ort, lat, lng, 
       firma_key, ist_hauptstandort, warteliste_status
FROM sv_leads
WHERE quelle = 'dat_expert' AND warteliste_status != 'inaktiv';
```

### 7.3 Claim-Submit (Spec-Update 2026-05-15)

**Architektur:** Server-Action auf `gutachter.claimondo.de/claim` ruft eine `SECURITY DEFINER` Postgres-Function `claim_dat_standort(...)` auf, die intern validiert und schreibt. Kein direkter `UPDATE`-Pfad für `anon` (sonst Mass-Assignment-Hole), kein `supabase_functions.http_request()` aus dem SQL-Trigger (pg_net-Abhängigkeit + brüchiges Error-Handling).

**Function-Signatur:**
```sql
CREATE OR REPLACE FUNCTION public.claim_dat_standort(
  p_lead_id uuid,
  p_vorname text,
  p_nachname text,
  p_email text,
  p_telefon text,
  p_qualifikationen text[],
  p_secondary_lead_ids uuid[] DEFAULT '{}'::uuid[]
) RETURNS TABLE (lead_id uuid, activation_token text, activation_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_code text;
BEGIN
  -- Validate: Lead muss ausstehend + DAT-Quelle sein
  IF NOT EXISTS (
    SELECT 1 FROM sv_leads
    WHERE id = p_lead_id
      AND quelle = 'dat_expert'
      AND warteliste_status = 'ausstehend'
  ) THEN
    RAISE EXCEPTION 'Standort nicht claimable: %', p_lead_id;
  END IF;

  -- Validate: Email-Format, mind. 1 Qualifikation, etc. (Pflichtfelder)
  IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Ungueltige Email';
  END IF;
  IF array_length(p_qualifikationen, 1) IS NULL THEN
    RAISE EXCEPTION 'Mindestens eine Qualifikation erforderlich';
  END IF;

  -- Hauptstandort updaten
  UPDATE sv_leads SET
    warteliste_status = 'geclaimed',
    vorname = p_vorname,
    nachname = p_nachname,
    email = p_email,
    telefon = NULLIF(p_telefon, ''),
    qualifikationen_claim = p_qualifikationen,
    geclaimed_at = now()
  WHERE id = p_lead_id;

  -- Multi-Standort (gleicher firma_key, nur ausstehende)
  UPDATE sv_leads SET
    warteliste_status = 'geclaimed',
    email = p_email,
    geclaimed_at = now(),
    parent_lead_id = p_lead_id
  WHERE id = ANY(p_secondary_lead_ids)
    AND warteliste_status = 'ausstehend'
    AND firma_key = (SELECT firma_key FROM sv_leads WHERE id = p_lead_id);

  -- Activation-Token + Code generieren
  v_token := encode(gen_random_bytes(24), 'hex');
  v_code := upper(substring(encode(gen_random_bytes(6), 'hex') from 1 for 4))
            || '-' || upper(substring(encode(gen_random_bytes(6), 'hex') from 1 for 4));

  INSERT INTO claim_activations (lead_id, email, one_time_code, magic_link_token, expires_at)
  VALUES (p_lead_id, p_email, v_code, v_token, now() + interval '72 hours');

  RETURN QUERY SELECT p_lead_id, v_token, v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_dat_standort(uuid, text, text, text, text, text[], uuid[]) TO anon, authenticated;
```

**Server-Action-Flow (Next.js):**
```ts
// src/app/claim/actions.ts
'use server'
import { createAnonClient } from '@/lib/supabase/anon'

export async function claimDatStandort(input: {...}): Promise<{ ok: boolean; activation_token?: string; error?: string }> {
  const supabase = createAnonClient()
  const { data, error } = await supabase.rpc('claim_dat_standort', {
    p_lead_id: input.leadId,
    p_vorname: input.vorname,
    // ...
  })
  if (error) return { ok: false, error: error.message }

  // Edge-Function-Call von hier aus (nicht aus SQL!), Email senden:
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/claim/send-activation-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${process.env.INTERNAL_API_SECRET}` },
    body: JSON.stringify({ lead_id: input.leadId, token: data[0].activation_token, code: data[0].activation_code }),
  }).catch(err => console.error('Activation-Email fehlgeschlagen (non-critical):', err))

  return { ok: true, activation_token: data[0].activation_token }
}
```

Die Email-Sendung läuft also über eine eigene API-Route (`/api/claim/send-activation-email`), nicht aus dem SQL-Trigger. Vorteile: TS-Code statt SQL-`http_request`, normales Retry-Pattern, Server-Action mit Error-Handling und keine pg_net-Extension-Abhängigkeit.

### 7.4 RLS-Policies (Spec-Update 2026-05-15)

Public Map auf `/claim` liest mit `anon`-Key aus `sv_leads`. Ohne RLS entweder Datenleck (Email/Telefon public) oder Map bleibt leer.

```sql
-- sv_leads: RLS aktivieren
ALTER TABLE sv_leads ENABLE ROW LEVEL SECURITY;

-- Anon-Read: nur Geo + Status + firma_key + ist_hauptstandort
-- KEIN public-SELECT auf email/telefon/vorname/nachname — daher View statt direkter Table-Access
CREATE OR REPLACE VIEW public.v_sv_leads_claim_map AS
SELECT id, firma, strasse, plz, ort, lat, lng,
       firma_key, ist_hauptstandort, warteliste_status, quelle
FROM sv_leads
WHERE quelle = 'dat_expert' AND warteliste_status != 'inaktiv';

GRANT SELECT ON public.v_sv_leads_claim_map TO anon;

-- Authenticated SVs (geclaimed): nur eigene Standorte
CREATE POLICY sv_leads_owner_read ON sv_leads
  FOR SELECT TO authenticated
  USING (
    (auth.jwt()->>'email')::text = email
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND rolle = 'admin'
    )
  );

-- claim_activations: NIE public — Token wird nur von claim_dat_standort()-Function geschrieben
ALTER TABLE claim_activations ENABLE ROW LEVEL SECURITY;
-- Keine SELECT-Policy für anon — Magic-Link-Validation läuft via eigene SECURITY DEFINER Function
-- /aktivieren-Page ruft validate_activation_token(token) auf
CREATE POLICY claim_activations_admin_read ON claim_activations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'admin'));
```

Map-Frontend nutzt also `v_sv_leads_claim_map` (View ohne PII), nicht `sv_leads` direkt.

---

## 8. DB-Schema-Erweiterungen (Spec-Update 2026-05-15)

### 8.1 Migrations-Files (Pflicht via supabase-CLI, siehe AGENTS.md Regel 2)

**Migration 1** — Sv-Leads-Erweiterungen:
```sql
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS firma_key text;
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS ist_hauptstandort boolean DEFAULT true;
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS parent_lead_id uuid REFERENCES sv_leads(id);
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS quelle text DEFAULT 'organisch';
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS qualifikationen_claim text[] DEFAULT '{}';
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS geclaimed_at timestamptz;
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS vorname text;
ALTER TABLE sv_leads ADD COLUMN IF NOT EXISTS nachname text;

-- warteliste_status: existierender CHECK-Constraint muss erweitert werden.
-- Vor Apply via supabase-CLI: SELECT DISTINCT warteliste_status FROM sv_leads;
-- Erwartete bestehende Werte: 'ausstehend', 'aktiv'. Neue Werte: 'geclaimed', 'verifiziert', 'inaktiv'.
ALTER TABLE sv_leads DROP CONSTRAINT IF EXISTS sv_leads_warteliste_status_check;
ALTER TABLE sv_leads ADD CONSTRAINT sv_leads_warteliste_status_check
  CHECK (warteliste_status IN ('ausstehend', 'geclaimed', 'verifiziert', 'aktiv', 'inaktiv'));

-- Index für firma_key-Lookup (Multi-Standort-Gruppierung in der Map)
CREATE INDEX IF NOT EXISTS idx_sv_leads_firma_key ON sv_leads(firma_key) WHERE firma_key IS NOT NULL;
```

**Migration 2** — Claim-Activations-Tabelle (`uuid` statt `ulid`, RLS):
```sql
CREATE TABLE IF NOT EXISTS claim_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES sv_leads(id) ON DELETE CASCADE,
  email text NOT NULL,
  one_time_code text NOT NULL,           -- 'XXXX-XXXX' Format
  magic_link_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_activations_token ON claim_activations(magic_link_token);
CREATE INDEX IF NOT EXISTS idx_claim_activations_code ON claim_activations(one_time_code);

ALTER TABLE claim_activations ENABLE ROW LEVEL SECURITY;
-- Keine public-SELECT-Policy — Token-Validation via Function (siehe 7.4)
CREATE POLICY claim_activations_admin_read ON claim_activations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'admin'));
```

**Migration 3** — Map-View + Claim-Function + RLS auf sv_leads: siehe Abschnitt 7.3 und 7.4.

### 8.2 `firma_key`-Generierungs-Strategie

`firma_key` gruppiert Pins der gleichen Firma auf der Map (siehe 4.2). Strategie:

1. **Initial-Import** (Julias Excel-Sheet → 62 Standorte): Slug aus Firmenname **deterministisch** generieren mit Pattern `lower(trim(unaccent(firma)))`-Slugify:
   ```ts
   function firmaKey(firma: string): string {
     return firma
       .toLowerCase()
       .normalize('NFKD').replace(/[̀-ͯ]/g, '') // diacritics raus
       .replace(/ß/g, 'ss')
       .replace(/&/g, 'und')
       .replace(/[^a-z0-9]+/g, '-')
       .replace(/^-+|-+$/g, '')
   }
   // "Ing.-Büro Wester GmbH" → "ing-buero-wester-gmbh"
   // "Lütz GmbH" → "lutz-gmbh"
   ```
2. **Konflikt-Resolution bei Duplikaten** (gleicher Slug, andere Inhaber): manuelle Disambiguation im Import-Script — Suffix `_v2`/`_v3` o.ä. mit menschlicher Sichtprüfung in der Excel-Spalte. Kein Auto-Increment, damit später keine zwei „Müller GmbH"-Standorte zur gleichen Firma zusammenkleben.
3. **Spätere SVs** (außerhalb DAT-Initial-Import) müssen `firma_key = NULL` haben, damit Multi-Standort-Logik sie nicht in eine fremde Gruppe steckt.

Im Import-Script: vor Bulk-Insert eine Validation-Query `SELECT firma_key, count(*) FROM sv_leads_import_tmp GROUP BY firma_key HAVING count > 1` und manuell sichten.

### 8.3 `quelle`-Werte Live-Check (Pre-Migration)

Vor dem Migration-Apply muss live abgefragt werden welche Werte aktuell in `sv_leads.quelle` stehen:

```sql
SELECT DISTINCT quelle, count(*) FROM sv_leads GROUP BY quelle ORDER BY count DESC;
```

Wenn `'dat_expert'` schon existiert (z.B. von einem Test-Run): Werte-Map mit dem aktuellen Stand abgleichen, nichts überschreiben. Wenn der `quelle`-CHECK-Constraint existiert, ihn entsprechend erweitern (analog zu `warteliste_status` oben).

Quelle: `feedback_information_schema_check.md` — Memory-Snapshots sind 1-2 Tage stale.

---

## 9. Edge Cases

| Szenario | Verhalten |
|---|---|
| Gutachter klickt mehrfach auf Submit | Submit-Button wird nach erstem Klick disabled, Loading-Spinner |
| E-Mail bereits in `sv_leads.email` registriert | Hinweis: „Diese E-Mail ist bereits für einen anderen Standort registriert. [Login] oder andere Mail nutzen." |
| Lead-ID nicht gefunden (URL manipuliert) | 404 mit „Standort nicht gefunden — bitte öffne die Mail von Philipp" |
| Standort bereits geclaimed | Pin ausgegraut, beim Klick: „Dieser Standort wurde bereits beansprucht. Wenn das ein Fehler ist, kontaktiere partner@claimondo.de" |
| Multi-Standort: Gutachter wählt Nebenstandorte ab | Nur Hauptstandort wird geclaimed, Nebenstandorte bleiben verfügbar |
| Network-Error beim Submit | Toast: „Verbindung fehlgeschlagen. Versuch's nochmal." — Form-State bleibt erhalten |
| Map lädt nicht (Mapbox-Token invalid) | Fallback: Liste der Standorte als Cards mit „Standort beanspruchen"-Buttons |
| Bot-Submit auf öffentlichem `/claim` | **Cloudflare Turnstile** (oder hCaptcha) als unsichtbares Widget vor dem Submit-Button. Server-seitige Token-Validation in der Server-Action vor `claim_dat_standort()`-RPC. (Spec-Update 2026-05-15) |
| Aktivierungs-Mail nicht angekommen / verloren | **Resend-Flow:** auf der Bestätigungs-Seite (Zustand 4) ein „Mail erneut senden"-Link der `/api/claim/resend-activation` aufruft. Rate-Limit 3 Versuche pro Stunde via Cloudflare-WAF oder einfachem In-Memory-Counter. (Spec-Update 2026-05-15) |
| Mapbox-Token in Frontend exposed | **URL-Restrictions** auf den Public-Mapbox-Token setzen (Mapbox-Account → Token-Settings → „Allowed URLs": `gutachter.claimondo.de`, `dat.de`). Sonst Quota-Klau möglich. (Spec-Update 2026-05-15) |

---

## 10. Animationen

- **Pin-Drop bei Page-Load:** 62 Pins droppen nacheinander (stagger 30ms) von oben mit ease-out-bounce
- **Pin-Hover:** Scale 1.15, Schatten verstärken, 150ms ease-out
- **Pin-Klick:** Quick scale-down 0.95 → 1.05 → 1.0 (200ms)
- **Side-Panel rein:** translateX(100%) → 0, 300ms cubic-bezier(0.4, 0, 0.2, 1)
- **Bottom-Sheet Drag:** native iOS-like drag mit `react-spring`
- **Geclaimed-State:** Pin-Farbe Blau→Grün crossfade 600ms + Bounce-Scale-Animation
- **Bestätigungs-Screen ✓:** Grüner Kreis scaliert von 0 auf 1 mit ease-out-back (500ms)

---

## 11. Design-Token-Referenz

Aus dem Claimondo Design System:

```css
/* Farben */
--c-navy: #0D1B3E;
--c-shield: #1E3A5F;
--c-ondo: #4573A2;             /* Primary Action, Active States */
--c-light-blue: #7BA3CC;       /* Secondary Pins */
--c-bg: #f8f9fb;
--c-card: #ffffff;
--c-border: #e4e7ef;
--c-muted: #6b7280;
--c-success-fg: #047857;
--c-success-bg: #ecfdf5;

/* Radien */
--radius-sm: 7px;
--radius-md: 10px;
--radius-lg: 12px;
--radius-xl: 17px;
--radius-2xl: 22px;

/* Komponenten-Klassen */
.btn-default        /* Navy bg, primary CTA */
.btn-outline        /* Border, secondary action */
.btn-sm             /* Height 28px */
.input              /* Height 32px, radius-lg, ondo focus */
.card               /* white bg, border, radius-xl, shadow-sm */
.pill-blue          /* Badge-Variante */
.alert.alert-info   /* Info-Box mit light-blue Hintergrund */

/* Typography (Montserrat) */
--text-h1: 28px / 600
--text-h2: 22px / 600
--text-h3: 17px / 600
--text-body: 14px / 400
--text-caption: 11px / 400
```

---

## 12. Empfohlene Dateistruktur

```
src/
├── app/
│   └── claim/
│       ├── [token]/page.tsx           # Personalisierte URL (zukünftig wenn E-Mails)
│       └── page.tsx                   # Offene Map (Ansatz B aktuell)
│
├── components/
│   └── claim/
│       ├── ClaimMap.tsx               # Mapbox + Pin-Layer
│       ├── ClaimSearchbar.tsx         # Floating searchbox
│       ├── ClaimStatBar.tsx           # 62 Standorte · 0€ ...
│       ├── ClaimSidePanel.tsx         # Desktop Slide-over
│       ├── ClaimBottomSheet.tsx       # Mobile Sheet
│       ├── ClaimPreview.tsx           # Zustand 1
│       ├── ClaimForm.tsx              # Zustand 2
│       ├── ClaimMultiStandort.tsx     # Zustand 3
│       └── ClaimSuccess.tsx           # Zustand 4
│
├── lib/
│   └── claim/
│       ├── leads.ts                   # Supabase queries
│       ├── claim-actions.ts           # submit, validate
│       └── geocoding.ts               # für Bulk-Import
│
└── supabase/
    └── functions/
        └── send-activation-email/index.ts
```

---

## 13. Was als Nächstes ansteht

1. **DB-Migration:** 25 Test-Leads aus `sv_leads` entfernen, 62 echte Standorte aus Julias Excel geocodieren und importieren (mit `firma_key`, `ist_hauptstandort` setzen)
2. **Mapbox-Style:** Custom Style-URL im Claimondo-Look erstellen oder mit `light-v11` + Style-Overrides starten
3. **E-Mail-Provider:** Resend oder Postmark einrichten für transaktionale Aktivierungs-Mails
4. **Edge Function:** `send-activation-email` mit Magic-Link-Generierung + Code-Generierung implementieren
5. **Magic-Link-Page:** `/aktivieren` Route mit Token-Validierung + Passwort-Setzen-Formular

---

## 14. Outbound-Mail von Philipp (Out of Scope für diese MD)

Die E-Mail die Philipp Sedelmeier an die 62 DAT Gutachter verschickt löst diesen Flow aus. Sie ist separat zu konzipieren (Subject, Body, Foto-Strip Philipp+Nicolas+Aaron, Karten-Screenshot als Static Image, Webinar-Termin). Aktueller Status: blockiert auf Philipps Klärung von Webinar-Datum + Versandweg.
