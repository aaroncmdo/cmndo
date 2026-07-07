# Werkstatt-Auftrags-Ansicht (D) — Implementierungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (empfohlen) oder superpowers:executing-plans. Schritte nutzen Checkbox (`- [ ]`).

**Goal:** Die Werkstatt-Auftrags-Ansicht rollen-korrekt (Reparateur vs Vermittler, Selbstzahler/Haftpflicht/Kasko) und makler-analog (schlanke Liste + Detail-Drill-in statt inline-„bearbeiten") umbauen — auf der bestehenden `v_werkstatt_auftrag`-View, additiv.

**Architecture:** `v_werkstatt_auftrag` additiv erweitern (abrechnungsweg + beide Werkstatt-IDs getrennt + `meine_rolle` gegen die fragende Werkstatt). Query-Layer reicht die Spalten durch + neuer Einzel-Loader. UI: schlanke `DataTable`-Liste mit 2 Segment-Chips (Reparatur-Aufträge / Meine Vermittlungen) + Typ-Badge → klickbare Zeile → neue Detailseite `/werkstatt/auftraege/[claimId]`, wohin die Termin-/Gutachten-/Resend-Blöcke aus der ersten Tabellenzelle wandern.

**Tech Stack:** Next.js 15 (App Router, async `params`), Supabase (Plugin-Migrationen Regel 2, `createClient` auth-aware + RLS `is_werkstatt_for_claim`), vitest (env=node), `@/components/shared/DataTable` + `primitives/*` + `SectionCard` + `StatusBadge`.

## Global Constraints

- **DDL nur via Supabase-Plugin** (`apply_migration`), File nach getrackter Version benannt (Regel 2, Twin-Drift vermeiden). `execute_sql` nur READ.
- **Kein `database.types.ts`-Regen** — neue Spalten via Record-Cast (Codebase-Pattern, kein Merge-Konflikt).
- **Umlaute** in allen UI-Strings (`ä/ö/ü/ß`): „Aufträge", „Meine Vermittlungen", „Auswählen".
- **Komponenten-Set:** `DataTable`/`ClickableTr`, `primitives.Button/Card/Modal`, `SectionCard`, `StatusBadge` (Registry) — kein handgerolltes Button/Card-Markup.
- **Server-Actions unverändert** wiederverwenden (`auftraege/actions.ts` — nur Aufruf-Ort wandert Liste→Detail).
- **Ratchets grün:** `check:token-audit` · `check:component-set` · `check:status-registry` · `check:knip` (0 neue Verstöße).
- **PR gegen `staging`**, nie `main` (Regel 1). Branch `kitta/werkstatt-auftrag-ansicht` (bereits angelegt).

---

### Task 1: View additiv erweitern (`v_werkstatt_auftrag`)

**Files:**
- Migration via Supabase-Plugin → committen als `supabase/migrations/<V>_v_werkstatt_auftrag_rollen_typ.sql`

**Interfaces:**
- Produces: neue View-Spalten `abrechnungsweg text`, `vermittler_werkstatt_id uuid`, `reparatur_werkstatt_id uuid`, `meine_rolle text` (`'reparateur'|'vermittler'|'beide'|NULL`). Bestehende Spalten (inkl. `richtung`, `werkstatt_id`) unverändert.

- [ ] **Step 1: Bestehende Definition + additive Spalten formulieren.** DDL (die aktuelle Def aus `20260704093003_v_werkstatt_auftrag_gutachten.sql` 1:1 + 4 neue Spalten nach `richtung`):

```sql
CREATE OR REPLACE VIEW public.v_werkstatt_auftrag AS
 SELECT c.id AS claim_id,
    c.reparatur_vermittlung_status AS vermittlung_status,
    c.reparatur_werkstatt_quelle AS quelle,
    c.reparatur_werkstatt_zugewiesen_am AS zugewiesen_am,
        CASE
            WHEN c.reparatur_werkstatt_id IS NOT NULL THEN 'vermittelt'::text
            ELSE 'inbound'::text
        END AS richtung,
    -- D: rollen-korrekte Zusatzspalten (additiv)
    c.abrechnungsweg AS abrechnungsweg,
    c.werkstatt_id AS vermittler_werkstatt_id,
    c.reparatur_werkstatt_id AS reparatur_werkstatt_id,
        CASE
            WHEN c.reparatur_werkstatt_id IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid()))
             AND c.werkstatt_id           IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid()))
                THEN 'beide'::text
            WHEN c.reparatur_werkstatt_id IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid()))
                THEN 'reparateur'::text
            WHEN c.werkstatt_id           IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid()))
                THEN 'vermittler'::text
            ELSE NULL::text
        END AS meine_rolle,
    c.claim_nummer,
    c.schadenart,
    c.reparaturwunsch,
    c.operative_status,
    v.hersteller AS fahrzeug_hersteller,
    NULLIF(concat_ws(' '::text, v.modell_haupttyp, v.modell_untertyp), ''::text) AS fahrzeug_modell,
    v.kennzeichen_aktuell AS kennzeichen,
    v.fin,
    gt.start_zeit AS besichtigung_start,
    gt.besichtigungsort_adresse AS besichtigung_ort,
    gt.status AS besichtigung_status,
    sv.firmenname AS gutachter_firmenname,
    COALESCE(NULLIF(concat_ws(' '::text, p.vorname, p.nachname), ''::text), NULLIF(concat_ws(' '::text, l.vorname, l.nachname), ''::text)) AS kunde_name,
    w.id AS werkstatt_id,
    w.name AS werkstatt_name,
    w.ansprechpartner_name AS werkstatt_ansprechpartner,
    wp.betrag_netto_eur AS provision_betrag_netto,
    wp.status AS provision_status,
    rt.id AS reparatur_termin_id,
    rt.status AS reparatur_termin_status,
    rt.wunschtermin AS reparatur_wunschtermin,
    rt.bestaetigter_termin AS reparatur_bestaetigter_termin,
    rt.absage_grund AS reparatur_absage_grund,
    gu.bericht_pdf_url AS gutachten_bericht_pdf_url,
    gu.reparaturkosten_netto AS gutachten_reparaturkosten_netto,
    gu.reparaturkosten_brutto AS gutachten_reparaturkosten_brutto,
    gu.minderwert AS gutachten_minderwert,
    gu.restwert AS gutachten_restwert,
    gu.wiederbeschaffungswert AS gutachten_wiederbeschaffungswert,
    gu.totalschaden AS gutachten_totalschaden,
    gu.fertiggestellt_am AS gutachten_fertiggestellt_am
   FROM claims c
     LEFT JOIN vehicles v ON v.id = c.vehicle_id
     LEFT JOIN LATERAL ( SELECT t.start_zeit, t.besichtigungsort_adresse, t.status
           FROM gutachter_termine t
          WHERE t.claim_id = c.id AND t.typ = 'sv_begutachtung'::text
          ORDER BY t.start_zeit DESC NULLS LAST LIMIT 1) gt ON true
     LEFT JOIN sachverstaendige sv ON sv.id = c.sv_id
     LEFT JOIN profiles p ON p.id = c.geschaedigter_user_id
     LEFT JOIN leads l ON l.id = c.lead_id
     LEFT JOIN werkstaetten w ON w.id = COALESCE(c.reparatur_werkstatt_id, c.werkstatt_id)
     LEFT JOIN werkstatt_provisionen wp ON wp.claim_id = c.id AND wp.werkstatt_id = w.id
     LEFT JOIN LATERAL ( SELECT rt_inner.id, rt_inner.status, rt_inner.wunschtermin, rt_inner.bestaetigter_termin, rt_inner.absage_grund
           FROM reparatur_termine rt_inner
          WHERE rt_inner.claim_id = c.id AND rt_inner.status <> 'storniert'::text
          ORDER BY rt_inner.created_at DESC LIMIT 1) rt ON true
     LEFT JOIN LATERAL ( SELECT g.bericht_pdf_url, g.reparaturkosten_netto, g.reparaturkosten_brutto, g.minderwert, g.restwert, g.wiederbeschaffungswert, g.totalschaden, g.fertiggestellt_am
           FROM gutachten g
          WHERE g.claim_id = c.id AND g.fertiggestellt_am IS NOT NULL
          ORDER BY g.fertiggestellt_am DESC LIMIT 1) gu ON true
  WHERE (c.werkstatt_id IS NOT NULL OR c.reparatur_werkstatt_id IS NOT NULL) AND (is_staff() OR is_werkstatt_for_claim(c.id));
```

- [ ] **Step 2: Anwenden** `apply_migration({ name: 'v_werkstatt_auftrag_rollen_typ', query: <DDL oben> })`.
- [ ] **Step 3: `list_migrations`** → die getrackte Version `<V>` ablesen (Plugin setzt eigenen Timestamp).
- [ ] **Step 4: File committen** als `supabase/migrations/<V>_v_werkstatt_auftrag_rollen_typ.sql` (Dateiname == `<V>`).
- [ ] **Step 5: Verifizieren (READ)** `execute_sql`:

```sql
select column_name from information_schema.columns
where table_name = 'v_werkstatt_auftrag'
  and column_name in ('abrechnungsweg','vermittler_werkstatt_id','reparatur_werkstatt_id','meine_rolle')
order by column_name;
```
Erwartet: 4 Zeilen.

- [ ] **Step 6: Commit** `git add supabase/migrations/<V>_*.sql && git commit` (Audit-Body: Build n/a = nur SQL; additive View, kein Consumer-Break).

---

### Task 2: Pure Rollen-/Typ-Helfer (TDD)

**Files:**
- Create: `src/lib/werkstatt/werkstatt-auftrag-segment.ts`
- Test: `src/lib/werkstatt/__tests__/werkstatt-auftrag-segment.test.ts`

**Interfaces:**
- Consumes: `WerkstattAuftrag` (aus queries.ts — erweitert in Task 3; für den Test genügt ein struktureller Teil-Typ).
- Produces:
  - `werkstattAuftragSegment(a: { meine_rolle: string | null; reparatur_werkstatt_id: string | null }): 'reparatur' | 'vermittlung'`
  - `abrechnungswegLabel(w: string | null): 'Selbstzahler' | 'Haftpflicht' | 'Kasko' | null`
  - `zeigtGutachten(w: string | null): boolean` (true bei haftpflicht/kasko)
  - `zaehleSegmente(rows: Array<{ meine_rolle: string | null; reparatur_werkstatt_id: string | null }>): { reparatur: number; vermittlung: number }`

- [ ] **Step 1: Failing test** (`werkstatt-auftrag-segment.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import {
  werkstattAuftragSegment,
  abrechnungswegLabel,
  zeigtGutachten,
  zaehleSegmente,
} from '../werkstatt-auftrag-segment'

describe('werkstattAuftragSegment', () => {
  it('reparateur + beide -> reparatur', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'reparateur', reparatur_werkstatt_id: 'w1' })).toBe('reparatur')
    expect(werkstattAuftragSegment({ meine_rolle: 'beide', reparatur_werkstatt_id: 'w1' })).toBe('reparatur')
  })
  it('vermittler -> vermittlung', () => {
    expect(werkstattAuftragSegment({ meine_rolle: 'vermittler', reparatur_werkstatt_id: null })).toBe('vermittlung')
  })
  it('null (staff) -> Fallback auf reparatur_werkstatt_id', () => {
    expect(werkstattAuftragSegment({ meine_rolle: null, reparatur_werkstatt_id: 'w1' })).toBe('reparatur')
    expect(werkstattAuftragSegment({ meine_rolle: null, reparatur_werkstatt_id: null })).toBe('vermittlung')
  })
})

describe('abrechnungswegLabel', () => {
  it('mappt die 3 Werte + null', () => {
    expect(abrechnungswegLabel('selbstzahler')).toBe('Selbstzahler')
    expect(abrechnungswegLabel('haftpflicht')).toBe('Haftpflicht')
    expect(abrechnungswegLabel('kasko')).toBe('Kasko')
    expect(abrechnungswegLabel(null)).toBeNull()
    expect(abrechnungswegLabel('unbekannt')).toBeNull()
  })
})

describe('zeigtGutachten', () => {
  it('nur bei Versicherung', () => {
    expect(zeigtGutachten('haftpflicht')).toBe(true)
    expect(zeigtGutachten('kasko')).toBe(true)
    expect(zeigtGutachten('selbstzahler')).toBe(false)
    expect(zeigtGutachten(null)).toBe(false)
  })
})

describe('zaehleSegmente', () => {
  it('zaehlt pro Segment', () => {
    const rows = [
      { meine_rolle: 'reparateur', reparatur_werkstatt_id: 'w1' },
      { meine_rolle: 'beide', reparatur_werkstatt_id: 'w1' },
      { meine_rolle: 'vermittler', reparatur_werkstatt_id: null },
    ]
    expect(zaehleSegmente(rows)).toEqual({ reparatur: 2, vermittlung: 1 })
  })
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest run src/lib/werkstatt/__tests__/werkstatt-auftrag-segment.test.ts` (Modul fehlt).

- [ ] **Step 3: Implementieren** `werkstatt-auftrag-segment.ts`:

```ts
// Rollen-/Typ-Ableitungen fuer die Werkstatt-Auftrags-Ansicht (D). Rein + testbar.
// Segment = welcher Reiter (Reparatur-Auftrag vs Meine Vermittlung), abgeleitet aus
// meine_rolle (aus v_werkstatt_auftrag, gg die fragende Werkstatt berechnet).

type SegmentInput = { meine_rolle: string | null; reparatur_werkstatt_id: string | null }

export function werkstattAuftragSegment(a: SegmentInput): 'reparatur' | 'vermittlung' {
  if (a.meine_rolle === 'reparateur' || a.meine_rolle === 'beide') return 'reparatur'
  if (a.meine_rolle === 'vermittler') return 'vermittlung'
  // Fallback (staff/null): reparatur_werkstatt_id gesetzt -> Reparatur
  return a.reparatur_werkstatt_id ? 'reparatur' : 'vermittlung'
}

const ABRECHNUNGSWEG_LABEL: Record<string, 'Selbstzahler' | 'Haftpflicht' | 'Kasko'> = {
  selbstzahler: 'Selbstzahler',
  haftpflicht: 'Haftpflicht',
  kasko: 'Kasko',
}

export function abrechnungswegLabel(w: string | null): 'Selbstzahler' | 'Haftpflicht' | 'Kasko' | null {
  return w ? (ABRECHNUNGSWEG_LABEL[w] ?? null) : null
}

export function zeigtGutachten(w: string | null): boolean {
  return w === 'haftpflicht' || w === 'kasko'
}

export function zaehleSegmente(
  rows: SegmentInput[],
): { reparatur: number; vermittlung: number } {
  let reparatur = 0
  let vermittlung = 0
  for (const r of rows) {
    if (werkstattAuftragSegment(r) === 'reparatur') reparatur++
    else vermittlung++
  }
  return { reparatur, vermittlung }
}
```

- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** `feat(werkstatt): rollen-/typ-Helfer werkstatt-auftrag-segment (+vitest)`.

---

### Task 3: Query-Layer — neue Spalten + Einzel-Loader

**Files:**
- Modify: `src/lib/werkstatt/queries.ts` (Typ `WerkstattAuftrag` ~210, `getWerkstattAuftraege` ~246, Map ~266)

**Interfaces:**
- Consumes: `v_werkstatt_auftrag` (Task 1 Spalten).
- Produces:
  - `WerkstattAuftrag` erweitert um `abrechnungsweg`, `vermittler_werkstatt_id`, `reparatur_werkstatt_id`, `meine_rolle` (alle `string | null`).
  - `getWerkstattAuftrag(claimId: string): Promise<WerkstattAuftrag | null>` (Einzel-Loader, RLS-gegatet).

- [ ] **Step 1: Typ erweitern** — im `WerkstattAuftrag`-Type nach `richtung` (Zeile ~213) einfügen:

```ts
  abrechnungsweg: string | null
  vermittler_werkstatt_id: string | null
  reparatur_werkstatt_id: string | null
  meine_rolle: string | null
```

- [ ] **Step 2: Map extrahieren** — die Row→Objekt-Abbildung (aktuell inline in `getWerkstattAuftraege`, Zeilen ~266–…) in eine modul-lokale Funktion ziehen (DRY für den Einzel-Loader):

```ts
function mapWerkstattAuftragRow(r: Record<string, unknown>): WerkstattAuftrag {
  return {
    claim_id: r.claim_id as string,
    claim_nummer: (r.claim_nummer as string | null) ?? null,
    richtung: (r.richtung as string | null) ?? null,
    abrechnungsweg: (r.abrechnungsweg as string | null) ?? null,
    vermittler_werkstatt_id: (r.vermittler_werkstatt_id as string | null) ?? null,
    reparatur_werkstatt_id: (r.reparatur_werkstatt_id as string | null) ?? null,
    meine_rolle: (r.meine_rolle as string | null) ?? null,
    vermittlung_status: (r.vermittlung_status as string | null) ?? null,
    operative_status: (r.operative_status as string | null) ?? null,
    fahrzeug_hersteller: (r.fahrzeug_hersteller as string | null) ?? null,
    fahrzeug_modell: (r.fahrzeug_modell as string | null) ?? null,
    kennzeichen: (r.kennzeichen as string | null) ?? null,
    schadenart: (r.schadenart as string | null) ?? null,
    reparaturwunsch: (r.reparaturwunsch as string | null) ?? null,
    gutachter_firmenname: (r.gutachter_firmenname as string | null) ?? null,
    besichtigung_start: (r.besichtigung_start as string | null) ?? null,
    besichtigung_ort: (r.besichtigung_ort as string | null) ?? null,
    besichtigung_status: (r.besichtigung_status as string | null) ?? null,
    provision_betrag_netto: (r.provision_betrag_netto as number | null) ?? null,
    provision_status: (r.provision_status as string | null) ?? null,
    reparatur_termin_id: (r.reparatur_termin_id as string | null) ?? null,
    reparatur_termin_status: (r.reparatur_termin_status as string | null) ?? null,
    reparatur_wunschtermin: (r.reparatur_wunschtermin as string | null) ?? null,
    reparatur_bestaetigter_termin: (r.reparatur_bestaetigter_termin as string | null) ?? null,
    reparatur_absage_grund: (r.reparatur_absage_grund as string | null) ?? null,
    gutachten_fertiggestellt_am: (r.gutachten_fertiggestellt_am as string | null) ?? null,
    gutachten_reparaturkosten_netto: (r.gutachten_reparaturkosten_netto as number | null) ?? null,
    gutachten_reparaturkosten_brutto: (r.gutachten_reparaturkosten_brutto as number | null) ?? null,
    gutachten_minderwert: (r.gutachten_minderwert as number | null) ?? null,
    gutachten_restwert: (r.gutachten_restwert as number | null) ?? null,
    gutachten_wiederbeschaffungswert: (r.gutachten_wiederbeschaffungswert as number | null) ?? null,
    gutachten_totalschaden: (r.gutachten_totalschaden as boolean | null) ?? null,
  }
}

const AUFTRAG_SELECT = `
  claim_id, claim_nummer, richtung, vermittlung_status, operative_status,
  abrechnungsweg, vermittler_werkstatt_id, reparatur_werkstatt_id, meine_rolle,
  fahrzeug_hersteller, fahrzeug_modell, kennzeichen, schadenart, reparaturwunsch,
  gutachter_firmenname,
  besichtigung_start, besichtigung_ort, besichtigung_status,
  provision_betrag_netto, provision_status,
  reparatur_termin_id, reparatur_termin_status, reparatur_wunschtermin,
  reparatur_bestaetigter_termin, reparatur_absage_grund,
  gutachten_fertiggestellt_am, gutachten_reparaturkosten_netto, gutachten_reparaturkosten_brutto,
  gutachten_minderwert, gutachten_restwert, gutachten_wiederbeschaffungswert, gutachten_totalschaden
`
```

- [ ] **Step 3: `getWerkstattAuftraege` auf `AUFTRAG_SELECT` + `mapWerkstattAuftragRow` umstellen** (Select-String durch `AUFTRAG_SELECT` ersetzen, `.map(...)` durch `.map(mapWerkstattAuftragRow)` — die bestehende inline-Map ersetzen).

- [ ] **Step 4: Einzel-Loader** (nach `getWerkstattAuftraege`):

```ts
/** Ein einzelner Auftrag via v_werkstatt_auftrag (RLS-Gate). null = kein Zugriff/nicht da. */
export async function getWerkstattAuftrag(claimId: string): Promise<WerkstattAuftrag | null> {
  if (!claimId) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_werkstatt_auftrag')
    .select(AUFTRAG_SELECT)
    .eq('claim_id', claimId)
    .maybeSingle()
  if (error) {
    console.error('[werkstatt] getWerkstattAuftrag:', error.message)
    return null
  }
  return data ? mapWerkstattAuftragRow(data as unknown as Record<string, unknown>) : null
}
```

- [ ] **Step 5: Build-Gate** `npx tsc --noEmit` grün (nur diese Datei berührt).
- [ ] **Step 6: Commit** `feat(werkstatt): v_werkstatt_auftrag rollen-/typ-Spalten + getWerkstattAuftrag Einzel-Loader`.

---

### Task 4: Detailseite + `WerkstattAuftragDetail` (Sektionen umziehen)

**Files:**
- Create: `src/app/werkstatt/(shell)/auftraege/[claimId]/page.tsx`
- Create: `src/components/werkstatt/WerkstattAuftragDetail.tsx`
- Modify: `src/components/werkstatt/WerkstattAuftraege.tsx` (Sektionen `ReparaturterminSektion`/`GutachtenSektion`/`AuftragAktionen` **exportieren** statt lokal, damit Detail sie nutzt — oder in Detail verschieben; s. Step 2)

**Interfaces:**
- Consumes: `getWerkstattAuftrag` (Task 3), `werkstattAuftragSegment`/`abrechnungswegLabel`/`zeigtGutachten` (Task 2), bestehende Actions aus `auftraege/actions.ts`.
- Produces: `WerkstattAuftragDetail({ auftrag }: { auftrag: WerkstattAuftrag })` (Client-Component).

- [ ] **Step 1: Sektionen in ein geteiltes Modul heben.** Die drei Sub-Komponenten `ReparaturterminSektion`, `GutachtenSektion`, `AuftragAktionen` (aktuell in `WerkstattAuftraege.tsx`) nach `WerkstattAuftragDetail.tsx` **verschieben** (1:1, inkl. ihrer Imports: `useState/useTransition/useRouter`, `toast`, die Actions, `SectionCard`, `StatusBadge`, `Button`, `Modal`, `formatBerlin`, `reparaturTerminPhase`). In `WerkstattAuftraege.tsx` werden sie damit entfernt (Task 5 nutzt sie nicht mehr in der Zeile).

- [ ] **Step 2: `WerkstattAuftragDetail`** (`'use client'`) — komponiert die Sektionen segment-abhängig:

```tsx
'use client'
import type { WerkstattAuftrag } from '@/lib/werkstatt/queries'
import { werkstattAuftragSegment, abrechnungswegLabel, zeigtGutachten } from '@/lib/werkstatt/werkstatt-auftrag-segment'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { SectionCard } from '@/components/shared/SectionCard'
// ReparaturterminSektion / GutachtenSektion / AuftragAktionen: in dieser Datei definiert (aus Step 1)

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function WerkstattAuftragDetail({ auftrag }: { auftrag: WerkstattAuftrag }) {
  const segment = werkstattAuftragSegment(auftrag)
  const typ = abrechnungswegLabel(auftrag.abrechnungsweg)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-heading-md text-claimondo-navy font-bold">
            {auftrag.claim_nummer ?? 'Auftrag'}
          </h1>
          {typ && <StatusBadge tone="neutral" size="xs">{typ}</StatusBadge>}
          {auftrag.meine_rolle === 'beide' && auftrag.provision_betrag_netto != null && (
            <StatusBadge tone="info" size="xs">+ {EUR.format(auftrag.provision_betrag_netto)} Vermittlung</StatusBadge>
          )}
        </div>
        <p className="text-body-sm text-claimondo-ondo">
          {[auftrag.fahrzeug_hersteller, auftrag.fahrzeug_modell].filter(Boolean).join(' ') || '–'}
          {auftrag.kennzeichen ? ` · ${auftrag.kennzeichen}` : ''}
        </p>
      </header>

      <SectionCard title="Fall">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-body-sm">
          <div><dt className="text-body-xs text-claimondo-ondo">Schaden</dt><dd className="text-claimondo-navy">{auftrag.schadenart ?? '–'}</dd></div>
          <div><dt className="text-body-xs text-claimondo-ondo">Gutachter</dt><dd className="text-claimondo-navy">{auftrag.gutachter_firmenname ?? '–'}</dd></div>
        </dl>
      </SectionCard>

      {segment === 'reparatur' ? (
        <>
          <ReparaturterminSektion auftrag={auftrag} />
          {zeigtGutachten(auftrag.abrechnungsweg) && <GutachtenSektion auftrag={auftrag} />}
          <AuftragAktionen claimId={auftrag.claim_id} />
        </>
      ) : (
        <SectionCard title="Meine Vermittlung">
          <p className="text-body-sm text-claimondo-ondo">
            Du hast diesen Kunden an Claimondo vermittelt.
            {auftrag.provision_betrag_netto != null
              ? ` Provision: ${EUR.format(auftrag.provision_betrag_netto)} (${auftrag.provision_status ?? 'offen'}).`
              : ''}
          </p>
          <div className="mt-2"><AuftragAktionen claimId={auftrag.claim_id} /></div>
        </SectionCard>
      )}
    </div>
  )
}
```

(Umlaute beachten. `GutachtenSektion` bereits selbst-gegatet auf `gutachten_fertiggestellt_am` — der `zeigtGutachten`-Guard ist die semantische Ergänzung.)

- [ ] **Step 3: Detailseite** (`[claimId]/page.tsx`, Server-Component — **echte Seite, KEIN redirect-Stub**, s. RSC-redirect-Antipattern):

```tsx
import { redirect, notFound } from 'next/navigation'
import { getWerkstattByUserId, getWerkstattAuftrag } from '@/lib/werkstatt/queries'
import { WerkstattAuftragDetail } from '@/components/werkstatt/WerkstattAuftragDetail'

export const dynamic = 'force-dynamic'

export default async function WerkstattAuftragDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>
}) {
  const { claimId } = await params
  const werkstatt = await getWerkstattByUserId()
  if (!werkstatt) redirect('/login')

  const auftrag = await getWerkstattAuftrag(claimId)
  if (!auftrag) notFound() // RLS: Fremd-Auftrag -> null -> 404 (kein IDOR)

  return <WerkstattAuftragDetail auftrag={auftrag} />
}
```

- [ ] **Step 4: Build-Gate** `npm run build` (neue Route + Server-Component → voller Build, AGENTS §Audit-1).
- [ ] **Step 5: Commit** `feat(werkstatt): Auftrags-Detailseite /auftraege/[claimId] + WerkstattAuftragDetail (Sektionen aus der Liste umgezogen)`.

---

### Task 5: Liste entschlacken — Segmente + klickbare Zeile → Detail

**Files:**
- Modify: `src/components/werkstatt/WerkstattAuftraege.tsx`

**Interfaces:**
- Consumes: `werkstattAuftragSegment`/`abrechnungswegLabel`/`zaehleSegmente` (Task 2), `ClickableTr` (DataTable), `useRouter`.

- [ ] **Step 1: Inline-Sektionen aus der Zeile entfernen.** In der `Tbody`-Map die `<ReparaturterminSektion/>`, `<GutachtenSektion/>`, `<AuftragAktionen/>` aus der ersten `<Td>` streichen (sie leben jetzt im Detail, Task 4). Die drei Sub-Komponenten sind bereits nach `WerkstattAuftragDetail.tsx` verschoben.

- [ ] **Step 2: Segment-Chips statt Richtungs-Chips.** Den Richtungs-Filter (`richtung`-Chips „Alle/Meine Vermittlungen/Aufträge") ersetzen durch Segment-Chips auf Basis von `werkstattAuftragSegment` + `zaehleSegmente`:

```tsx
const segmentOf = (a: WerkstattAuftrag) => werkstattAuftragSegment(a)
const segCounts = useMemo(() => zaehleSegmente(auftraege), [auftraege])
// aktives Segment aus URL: ?segment=reparatur|vermittlung  (default 'reparatur')
const segment = (searchParams.get('segment') as 'reparatur' | 'vermittlung' | null) ?? 'reparatur'
// Filterung: nur das aktive Segment
const gefiltert = useMemo(
  () => auftraege.filter((a) => segmentOf(a) === segment
      && (statusFilter.size === 0 || statusFilter.has(werkstattAuftragPhase(a).key))),
  [auftraege, segment, statusFilter],
)
```
Chips:
```tsx
<ChipRow>
  <Chip variant={segment === 'reparatur' ? 'selected' : 'default'} count={segCounts.reparatur}
        onClick={() => updateParam('segment', 'reparatur')}>Reparatur-Aufträge</Chip>
  <Chip variant={segment === 'vermittlung' ? 'selected' : 'default'} count={segCounts.vermittlung}
        onClick={() => updateParam('segment', 'vermittlung')}>Meine Vermittlungen</Chip>
</ChipRow>
```

- [ ] **Step 3: Typ-Badge-Spalte + klickbare Zeile.** In der Reparatur-Ansicht eine „Typ"-Spalte (`abrechnungswegLabel(a.abrechnungsweg)` als `StatusBadge tone="neutral"`). Zeile auf `ClickableTr` umstellen → `router.push(\`/werkstatt/auftraege/${a.claim_id}\`)`:

```tsx
import { ClickableTr } from '@/components/shared/DataTable'
// ...
<ClickableTr key={a.claim_id} onClick={() => router.push(`/werkstatt/auftraege/${a.claim_id}`)}>
  <Td>
    <div className="text-claimondo-navy font-medium">{a.claim_nummer ?? '–'}</div>
    {abrechnungswegLabel(a.abrechnungsweg) && (
      <StatusBadge tone="neutral" size="xs">{abrechnungswegLabel(a.abrechnungsweg)}</StatusBadge>
    )}
  </Td>
  <Td className="text-body-sm">…Fahrzeug…</Td>
  <Td className="text-body-sm">…Schaden…</Td>
  <Td>…Status (StatusBadge phase)…</Td>
  <Td className="tabular-nums …">{a.provision_betrag_netto != null ? EUR.format(a.provision_betrag_netto) : '–'}</Td>
</ClickableTr>
```
Spaltenkopf entsprechend anpassen (Auftrag · Fahrzeug · Schaden · Status · Provision). Gutachter/Besichtigung wandern ins Detail (schlanke Liste). EmptyState-Texte pro Segment anpassen („Noch keine Reparatur-Aufträge." / „Noch keine Vermittlungen.").

- [ ] **Step 4: Build-Gate** `npm run build` grün + `npx vitest run src/lib/werkstatt` (Helfer-Tests weiter grün).
- [ ] **Step 5: Commit** `feat(werkstatt): Auftrags-Liste entschlackt — 2 Segmente + Typ-Badge + klickbare Zeile zum Detail`.

---

### Task 6: Verifikation + Live-Smoke + PR

- [ ] **Step 1: Alle Gates** `npx tsc --noEmit` · `npm run build` · `npm run check:token-audit` · `npm run check:component-set` · `npm run check:status-registry` · `npm run check:knip` · `npx vitest run src/lib/werkstatt` — alle grün / 0 neue Ratchet-Verstöße.
- [ ] **Step 2: Live-Smoke (Playwright, frischer SW-freier Browser, prod, NUR Test-Account).** Als Werkstatt-Test-Account einloggen → `/werkstatt/auftraege`: (a) beide Segment-Chips sichtbar + Counts; (b) Zeile klickbar → `/werkstatt/auftraege/[claimId]` rendert (Detail, kein leerer Shell — RSC-Render-Smoke); (c) im Reparatur-Detail: Typ-Badge + Termin-Aktionen sichtbar; (d) Fremd-claimId → 404. **READ-only** oder revert-sicher (keine echten Termin-Statuswechsel auf fremden Daten).
- [ ] **Step 3: Marker updaten** `COORDINATION-werkstatt-auftrag-ansicht.md` (D gebaut, View additiv live, Konsumenten migriert) + MEMORY-Pointer.
- [ ] **Step 4: PR** `gh pr create --base staging` mit 7-Punkte-Audit-Body + Hinweis „Roadmap A/B/C folgen als eigene Specs/Pläne".

---

## Self-Review (gegen Spec)

- **Spec-Coverage:** View additiv (Task 1: abrechnungsweg + beide IDs + meine_rolle ✓) · Segment-Modell 2+Badge (Task 2 Helfer + Task 5 Chips ✓) · makler-analog Liste+Detail (Task 4 Detail, Task 5 schlanke Liste ✓) · Gutachten nur Versicherung (`zeigtGutachten`, Task 4 ✓) · Provisions-Badge nur bei Eintrag/Dual-Rolle (Task 4 `meine_rolle==='beide'` + provision != null ✓) · keine Selbstzahler-Provision (nichts Zusätzliches — zeigt nur was in `werkstatt_provisionen` steht ✓).
- **Placeholder-Scan:** kein TBD/„handle edge cases" — DDL, Test-Code, Komponenten-Code vollständig. „<V>" in Task 1 ist der bewusste Plugin-Versions-Platzhalter (Regel 2), kein Code-Platzhalter.
- **Typ-Konsistenz:** `werkstattAuftragSegment`/`abrechnungswegLabel`/`zeigtGutachten`/`zaehleSegmente` (Task 2) == Nutzung in Task 4/5. `getWerkstattAuftrag`/`mapWerkstattAuftragRow`/`AUFTRAG_SELECT` (Task 3) == Nutzung in Task 4. `WerkstattAuftrag`-Felder durchgängig.
- **Test-Strategie-Ehrlichkeit:** vitest env=node (kein jsdom) + Hooks in Liste/Detail → keine Unit-Render-Tests dieser Komponenten; Risiko-Logik ist rein extrahiert (Task 2, voll TDD), UI via Build-Gate + Task-6-Live-Smoke verifiziert.
- **Offen→Build:** exakte `abrechnungsweg`-DE-Label (nageln: Selbstzahler/Haftpflicht/Kasko) · `ClickableTr`-Import-Pfad + Signatur (in Task 5 gg `DataTable`-Exports prüfen) · `Chip`-`count`-Prop (bestehende Nutzung im File als Vorlage).
