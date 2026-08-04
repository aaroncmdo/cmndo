# GEO-P2 SP1 — Kürzungs-Capture (per-Position `betrag_gekuerzt`) — Design

**Datum:** 2026-08-05
**Status:** Design (brainstorming) — Aaron-Review vor writing-plans
**Programm:** GEO P2 (Daten-Moat), Sub-Projekt 1 von 3. Aaron-Entscheidung 04.08.: „B — voller Moat", in der Baureihenfolge des Docs zerlegt.
**Branch (geplant):** `kitta/geo-p2-kuerzungs-capture` (off origin/staging) — **eigener Branch, nicht der Marketing-Worktree** (dies ist Main-App-Code + prod-DDL).

---

## Programm-Kontext

P2 macht den Schadensreport 2026 (GEO „höchster Hebel" — proprietäre, zitierbare Falldaten statt BGH/BVSK-Platzhalter) mit echten Claimondo-Daten füllbar. Exploration 04.08. hat die Prämisse verschoben:

1. **Harvest ist Monate weg.** Prod: **41 Claims, 7 abgeschlossen** (Gate: ≥100 abgeschlossen + ≥10/Versicherer + Buckets >5). Kein Bucket klärt das Gate → der Report kann **jetzt keine echten Zahlen zeigen**.
2. **Das „kuerzungen-Schema" existiert großteils schon** — aber ist **leer**. `forderungspositionen` hat exakt die richtige Struktur (`fall_id`+`claim_id`, `typ`, `betrag_gefordert`/`_reguliert`/`_gekuerzt`, `quelle`) und wird gelesen — aber **0 Zeilen**. Per-Position-Kürzung wurde in der App-Historie **nie** erfasst; jede Kürzung lebt nur als Aggregat `kanzlei_faelle.kuerzungs_betrag`.
3. **Der Capture-Point ist die heißeste Datei im Repo** (`src/lib/lexdrive/process-event.ts`, der `vs_kuerzt`-Funnel).

**Zerlegung von B (Doc-Baureihenfolge):**
- **SP1 (dieses Doc, JETZT):** per-Position-Kürzung ab heute strukturiert erfassen. Der „Baum".
- **SP2 (danach, eigene Spec):** NPS / `kunde_feedback` — eigenständiges Post-Abschluss-Comms-Subsystem.
- **SP3 (volumen-gated ≥100 Fälle, eigene Spec):** Aggregations-SQL + CSV-Export → Schadensreport-Fill.

## Ziel

Ab sofort jede Versicherer-Kürzung **strukturiert je Position** (UPE / Verbringung / Wertminderung / Nutzungsausfall / …) mit gefordertem vs. gekürztem Betrag in `forderungspositionen` erfassen, gespeist aus dem `vs_kuerzt`-Funnel. **Erfolgskriterium:** eine über die KB-Oberfläche eingetragene VS-Kürzung mit ≥1 Position erzeugt `forderungspositionen`-Zeilen mit gesetztem `betrag_gekuerzt`, und diese sind in der Gutachter-Fallansicht sichtbar.

**Nicht Ziel (SP1):** den Report füllen (Volumen fehlt), aggregieren (SP3), NPS (SP2). SP1 pflanzt nur den Baum.

## Zwei bewusste Abweichungen von literal-B (Aaron 04.08. approved)

1. **`forderungspositionen` vervollständigen statt neue `kuerzungen`-Tabelle.** Die Tabelle IST der Kürzungs-Store (richtiges Schema, wird gelesen, nur leer). Eine Parallel-Tabelle würde sie verwaisen + die Reader doppeln (Redundanz-Audit #3).
2. **Kein `gegner_eskalationen`.** Reaktionszeit/Mahnung/Klage liegen schon strukturiert auf `kanzlei_faelle` (`vs_reaktion_am`, `eskalation_tag_14/21/28_*`, `ruege_*`, `klage_uebergeben_am`) — SP3 aggregiert die direkt.

Netto: von B's drei Tabellen ist eine schon da (leer), eine redundant, eine echt neu + eigenes Subprojekt (SP2). SP1 = enum + Capture-Helfer + Funnel-Wiring + manuelle Subform.

---

## Architektur — 5 klar getrennte Einheiten

### Einheit 1 · DDL: `forderungspositionen`-CHECKs erweitern (Regel 2, apply_migration)

Die leere Tabelle → **null Datenrisiko**. Zwei CHECK-Constraints erweitern:

- **`forderungspositionen_typ_check`** um die 4 Report-Positionen, die als reparatur-Subkomponenten fehlen: `stundenverrechnung`, `upe`, `verbringung`, `beilackierung`. (SV-Honorar = bestehend `gutachterkosten`; Wertminderung/Nutzungsausfall/Mietwagen existieren.)
- **`forderungspositionen_quelle_check`** um `vs_kuerzung` (Provenienz: diese Position kommt aus dem VS-Kürzungs-Event, nicht aus einem Anspruchsschreiben-OCR — SP3 braucht die Unterscheidung „gefordert" vs. „gekürzt").

Exakte DDL (CHECK ist nicht in-place editierbar → drop + recreate, atomar in einer Migration):

```sql
-- forderungspositionen_typ_check: +stundenverrechnung, upe, verbringung, beilackierung
ALTER TABLE public.forderungspositionen DROP CONSTRAINT forderungspositionen_typ_check;
ALTER TABLE public.forderungspositionen ADD CONSTRAINT forderungspositionen_typ_check
  CHECK (typ = ANY (ARRAY[
    'reparatur','wertminderung','nutzungsausfall','mietwagen','gutachterkosten',
    'abschleppkosten','anwaltskosten','kostenpauschale','schmerzensgeld','wbw','restwert','sonstiges',
    'stundenverrechnung','upe','verbringung','beilackierung'
  ]::text[]));

-- forderungspositionen_quelle_check: +vs_kuerzung
ALTER TABLE public.forderungspositionen DROP CONSTRAINT forderungspositionen_quelle_check;
ALTER TABLE public.forderungspositionen ADD CONSTRAINT forderungspositionen_quelle_check
  CHECK (quelle = ANY (ARRAY['anspruchsschreiben','ruegeschreiben','gutachten','manuell','vs_kuerzung']::text[]));
```

**Flag-Drift-Gate-Ordering (AGENTS.md):** die neuen enum-Werte MÜSSEN zuerst per Migration in den CHECK, DANN darf Code sie schreiben. Nach `apply_migration` den Snapshot regenerieren (`node --env-file=.env.local scripts/build-flag-drift-snapshot.mjs`) — sonst blockt der `check:flag-drift`-Ratchet die Code-PR. Migration-File committen als `supabase/migrations/<recorded-version>_geo_p2_forderungspositionen_kuerzungs_enums.sql` (Regel 2 Schritt 3+4: Datei == getrackte Version).

**RLS:** keine Änderung. Die eine Policy `staff_fall_scoped` (`TO authenticated`, `USING/WITH CHECK (can_access_claim(claim_id) OR is_kanzlei())`) deckt authenticated-INSERT bereits ab; der Funnel-Write läuft über service_role (bypass). Der pre-existierende `GRANT ALL … TO anon` (Baseline) bleibt unberührt — keine anon-Policy lässt Zeilen durch, kein neuer anon-Zugriff durch SP1 → out of scope.

### Einheit 2 · `src/lib/kanzlei-fall/forderungsposition-typ.ts` (neu, pure const)

Zentrale typ→Label-Map (existiert nirgends — heute wird `typ` roh gerendert). Kein `'use server'` (AGENTS.md AAR-664: keine Konstanten aus Server-Action-Files).

```typescript
export const FORDERUNGSPOSITION_TYP_LABEL: Record<string, string> = {
  reparatur: 'Reparaturkosten',
  stundenverrechnung: 'Stundenverrechnungssätze',
  upe: 'UPE-Aufschläge',
  verbringung: 'Verbringungskosten',
  beilackierung: 'Beilackierung',
  wertminderung: 'Wertminderung',
  nutzungsausfall: 'Nutzungsausfall',
  mietwagen: 'Mietwagen',
  gutachterkosten: 'Sachverständigen-Honorar',
  abschleppkosten: 'Abschleppkosten',
  anwaltskosten: 'Anwaltskosten',
  kostenpauschale: 'Kostenpauschale',
  schmerzensgeld: 'Schmerzensgeld',
  wbw: 'Wiederbeschaffungswert',
  restwert: 'Restwert',
  sonstiges: 'Sonstiges',
}
// Die für VS-Kürzungen häufigen Positionen zuerst (Dropdown-Reihenfolge im Subform).
export const KUERZBARE_POSITIONEN: string[] = [
  'stundenverrechnung','upe','verbringung','beilackierung',
  'wertminderung','nutzungsausfall','mietwagen','gutachterkosten','reparatur','sonstiges',
]
```

Reused von der manuellen Subform (Dropdown) + Boy-Scout an den Readern (`StellungnahmeClient.tsx` rendert `k.typ` → `FORDERUNGSPOSITION_TYP_LABEL[k.typ] ?? k.typ`). Ein Unit-Test hält die Map **synchron mit dem DB-CHECK** (jeder CHECK-Wert hat ein Label).

### Einheit 3 · `src/lib/kanzlei-fall/kuerzungs-positionen.ts` (neu, Kern-Logik + isoliert testbar)

Der Single-Writer für per-Position-Kürzungen. Result-Object-Pattern (AGENTS.md).

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { FORDERUNGSPOSITION_TYP_LABEL } from './forderungsposition-typ'

export interface KuerzungsPosition {
  typ: string
  betrag_gefordert?: number | null
  betrag_gekuerzt: number
  bezeichnung?: string | null
}

const ERLAUBTE_TYPEN = new Set(Object.keys(FORDERUNGSPOSITION_TYP_LABEL))

/** Schreibt per-Position-Kürzungen (quelle='vs_kuerzung') nach forderungspositionen.
 *  db = service_role (bypass RLS). Ungültige typ-Werte werden übersprungen (defensiv,
 *  fängt Payload-Drift ab, bevor der CHECK die ganze Transaktion wirft). */
export async function persistKuerzungsPositionen(
  db: SupabaseClient,
  ref: { fallId: string; claimId: string | null },
  positionen: KuerzungsPosition[],
): Promise<{ ok: boolean; geschrieben: number; error?: string }> {
  const rows = positionen
    .filter((p) => ERLAUBTE_TYPEN.has(p.typ) && Number.isFinite(p.betrag_gekuerzt))
    .map((p) => ({
      fall_id: ref.fallId,
      claim_id: ref.claimId,
      typ: p.typ,
      bezeichnung: p.bezeichnung ?? FORDERUNGSPOSITION_TYP_LABEL[p.typ],
      betrag_gefordert: p.betrag_gefordert ?? null,
      betrag_gekuerzt: p.betrag_gekuerzt,
      quelle: 'vs_kuerzung',
    }))
  if (rows.length === 0) return { ok: true, geschrieben: 0 }
  const { error } = await db.from('forderungspositionen').insert(rows)
  if (error) return { ok: false, geschrieben: 0, error: error.message }
  return { ok: true, geschrieben: rows.length }
}
```

**Warum `fall_id` UND `claim_id` setzen:** `fall_id` ist NOT NULL (Pflicht); die Reader (`gutachter/fall/[id]/page.tsx:276`) querien per `claim_id`. Beide im Funnel im Scope (`input.fallId` + `claimIdForUpdates`) → beide setzen (der `trg_derive_claim_id`-Trigger wäre Fallback, aber explizit ist robuster).

### Einheit 4 · Payload-Typ + Funnel-Wiring (`process-event.ts`, minimaler Hot-File-Eingriff)

**4a.** `LexDriveEventPayload` um ein optionales Feld erweitern (Index-Signature `[k: string]: unknown` erlaubt es bruchfrei):

```typescript
  // GEO-P2 SP1: per-Position-Kürzungen (aus manuellem vs_kuerzt-Subform)
  positionen?: Array<{ typ: string; betrag_gefordert?: number | null; betrag_gekuerzt: number; bezeichnung?: string | null }>
```

**4b.** Im `processLexDriveEvent`-Apply-Block, an der bestehenden `vs_kuerzt`-Behandlung (~Z.980, wo `db` = service_role + `input.fallId` + `claimIdForUpdates` alle im Scope sind), **additiv** (Import oben + 3 Zeilen):

```typescript
    if (input.eventType === 'vs_kuerzt') {
      await handleVsKuerztSideEffects(input.fallId, input.payload, input.source, input.triggeredByProfileId)
      // GEO-P2 SP1: strukturierte per-Position-Kürzungen persistieren (falls vorhanden)
      if (Array.isArray(input.payload.positionen) && input.payload.positionen.length > 0) {
        const kpRes = await persistKuerzungsPositionen(db, { fallId: input.fallId, claimId: claimIdForUpdates }, input.payload.positionen)
        if (!kpRes.ok) console.error('[GEO-P2 SP1] forderungspositionen Kürzungs-Write fehlgeschlagen:', kpRes.error)
      }
    }
```

Der Reducer-/Status-/SLA-/Timeline-/`claim_payments`-Pfad bleibt **unangetastet** — reiner additiver Write hinter einem Guard. Kollisions-Minimierung im heißen File (Import + 4 Zeilen; die Logik liegt in Einheit 3, isoliert). Non-critical: ein Fehlschlag loggt nur, bricht das Status-Update nicht (AGENTS.md Non-critical-Sub-Op-Pattern).

### Einheit 5 · Manuelle Erfassung: Kürzungspositionen-Subform im „VS kürzt"-Modal

Der **Webhook trägt keine Positionen** (LexDrive sendet Aggregate) → die **manuelle KB-Eingabe ist die reale Capture-Quelle**. `src/app/faelle/[id]/_components/LexDriveTriggerPanel.tsx` (das „VS kürzt"-Modal, submitted via `triggerLexDriveEventManually` → `processLexDriveEvent`):

- Wenn `activeEvent.id === 'vs_kuerzt'`: unter den bestehenden Feldern (`datum`, `vs_kuerzungs_typ`, `kuerzungs_betrag`, `anerkannt_betrag`, `grund`) eine **dynamische Positionen-Liste** (eigener React-State `positionen: KuerzungsPosition[]`, „+ Position"-Button, je Zeile: `typ`-Dropdown aus `KUERZBARE_POSITIONEN` + Label-Map, `betrag_gefordert`-Input, `betrag_gekuerzt`-Input, Entfernen-Button).
- Vor `triggerLexDriveEventManually(fallId, 'vs_kuerzt', converted)`: `converted.positionen = positionen` mergen (das `payload`-Objekt ist `Record<string, string>`; `positionen` als separater State, in `converted` als Array angehängt — die Action-Signatur reicht die payload an `LexDriveEventPayload` durch, Array-Feld ok).
- **Optional/YAGNI:** Positionen sind freiwillig — leere Liste = heutiges Verhalten (nur Aggregat auf `kanzlei_faelle`). Kein Pflichtfeld → kein Bruch bestehender vs_kuerzt-Flows.
- Komponenten: bestehende `shared/forms/SelectField` + `TextField` (Komponenten-Set-Policy), Umlaute echt.

**Anzeige:** kein neuer Reader nötig — `gutachter/fall/[id]/page.tsx` + `stellungnahme/page.tsx` lesen `forderungspositionen` bereits inkl. `betrag_gekuerzt`. Boy-Scout: das rohe `k.typ`-Rendering in `StellungnahmeClient.tsx` auf `FORDERUNGSPOSITION_TYP_LABEL` heben.

---

## Datenfluss

```
KB liest VS-Kürzungs-Schreiben
   │
   ▼
„VS kürzt"-Modal (LexDriveTriggerPanel)  ── Aggregat: kuerzungs_betrag, vs_kuerzungs_typ, grund
   │  + NEU: Positionen-Liste [{typ, gefordert, gekürzt}]
   ▼
triggerLexDriveEventManually(fallId,'vs_kuerzt', {…, positionen})
   ▼
processLexDriveEvent  ── (unverändert) → kanzlei_faelle-Aggregat + claim_payments-Ledger
   │  + NEU (additiv, hinter Guard):
   ▼
persistKuerzungsPositionen(db, {fallId, claimId}, positionen)
   ▼
INSERT forderungspositionen (typ, betrag_gefordert, betrag_gekuerzt, quelle='vs_kuerzung')
   ▼
Gutachter-Fallansicht rendert Positionen (bestehende Reader)  ── [SP3 aggregiert später]
```

## Testing / Verifikation

- **Unit (vitest, pure):**
  - `persistKuerzungsPositionen`: (a) filtert ungültige `typ` raus; (b) filtert nicht-finite `betrag_gekuerzt`; (c) leere Liste → `{ok:true, geschrieben:0}` ohne DB-Call; (d) mappt `bezeichnung`-Fallback aus der Label-Map; (e) setzt `quelle='vs_kuerzung'` + beide IDs. (Mock-`db` mit `.from().insert()`.)
  - `forderungsposition-typ`: jeder Wert des DB-CHECK-Arrays (16) hat ein Label in `FORDERUNGSPOSITION_TYP_LABEL` (Drift-Guard — hält Map ↔ Migration synchron).
- **Build/tsc:** voller `npm run build` (Änderung an Server-Action-nahem Pfad + Route-Reader → Next-15-Validator).
- **Regel 4 (scharf — DB-Write-Pfad + KB-UI):** nach Prod-Deploy, mit Test-Konten (`telefon=NULL`):
  1. Als KB/Staff einen Test-Claim öffnen (`app.claimondo.de/faelle/<test-id>`), „VS kürzt" triggern mit 2 Positionen (z.B. `upe` gefordert 200/gekürzt 200; `verbringung` 150/150), `vs_kuerzungs_typ='technisch'`.
  2. DB-Verifikation (`execute_sql`): 2 `forderungspositionen`-Zeilen mit `quelle='vs_kuerzung'`, `betrag_gekuerzt` gesetzt, `typ ∈ {upe,verbringung}`.
  3. Gutachter-Fallansicht (`gutachter/fall/<id>`) rendert die Positionen mit Labels + gekürztem Betrag.
  - Kein echter Kunden-Comms-Trigger im Pfad (interner KB→VS-Vorgang) → kollateralschadenfrei.

## Regel 2 / 3 / 4 — Disziplin

- **Regel 2:** DDL **nur** via `apply_migration`, **erst nach diesem Spec-Review durch Aaron**. Danach `list_migrations` → recorded Version ablesen → File exakt so benennen + committen. Types regenerieren + committen (`database.types.ts`, wegen `check:query-drift`). Snapshot regen (`build-flag-drift-snapshot.mjs`).
- **Regel 3:** Session-Ende clean — kein unbegleiteter Stash, alles gepusht.
- **Regel 4:** Prod-Smoke wie oben; falls Deploy nicht in derselben Session → Smoke-Pflicht explizit im Marker an Merge-Session übergeben.

## Koordination (11 aktive Sessions)

- `process-event.ts` ist hot (Fundament/netzwerk-Sessions). Mein Eingriff = **1 Import + 4 additive Zeilen hinter einem Guard**, kein Reducer-Umbau → minimales Merge-Risiko. Marker mit File-Touch anlegen.
- `LexDriveTriggerPanel.tsx` (`faelle/[id]/_components`) — aktuell keine erkennbar kollidierende Session; additive Subform.
- **Operative-Status-Write-Gate:** SP1 schreibt **nicht** auf `claims.operative_status` → nicht betroffen. `forderungspositionen`-INSERT ist kein Status-Write.

## Nicht in Scope (YAGNI / Folge-Subprojekte)

- **SP2:** NPS / `kunde_feedback` (eigenes Comms-Subsystem, eigene Spec).
- **SP3 (≥100 Fälle):** Aggregations-VIEW/SQL (Erfolgsquote je Position, Versicherer-Ranking), CSV-Export, Schadensreport-Fill, `datasetSchema.variableMeasured`-Erweiterung.
- **`gegner_eskalationen`-Tabelle** (Daten liegen auf `kanzlei_faelle`).
- **Webhook-per-Position** (LexDrive sendet keine Positionen — der Payload-Slot ist da, falls sich das ändert).
- **Backfill** der 41 Bestands-Claims (per-Position aus Freitext-`vs_kuerzung_grund` rekonstruieren ist verlustbehaftet — SP3 entscheidet, ob Aggregat-only genügt).
- **OCR-`betrag_gekuerzt`-Fix** (`api/ocr/anspruchsschreiben/route.ts:107` stubt null) — separater Pfad, nicht der VS-Kürzungs-Moment; nicht SP1.

## Offene Plan-Items (für writing-plans)

- Exakte Einfüge-Zeile in `process-event.ts` verifizieren (die `vs_kuerzt`-Behandlung liegt laut Extraktion ~Z.980; beim Bau die aktuelle Zeile prüfen, da Hot-File).
- `triggerLexDriveEventManually`-Signatur prüfen: nimmt sie `converted` als beliebiges Objekt (Array-Feld durchreichbar)?
- Prüfen ob `StellungnahmeClient.tsx` (Client) die Label-Map importieren darf (pure const, kein Server-Only) — ja.
