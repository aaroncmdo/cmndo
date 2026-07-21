# Fahrzeug-Zustandsdoku / Foto-Scan (B v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** FM dokumentiert den Fahrzeug-Zustand mit einer geführten Fotostrecke; Claude-Vision erkennt Schäden (sync am Ende), der FM bestätigt sie, sie landen als `vehicle_vorschaeden`-Belege. Badge in der Flotten-Liste.

**Architecture:** Neue Tabellen `vehicle_scans`/`vehicle_scan_fotos` (+ `vehicle_vorschaeden.scan_id`), privater Storage-Bucket, alles über Service-Role-Server-Actions mit firma-Scope im Code (kein Client-RLS-Pfad). KI = bestehender `@/lib/ai/vision/client` nach dem `schadenbild-gewerke.ts`-Muster. Human-in-the-loop.

**Tech Stack:** Next.js 15 (Server Components + Actions), Supabase (`AnyDb`), Claude Vision, vitest.

Spec: `docs/superpowers/specs/2026-07-21-fahrzeug-zustandsdoku-foto-scan-design.md`.

## Global Constraints

- **DDL nur über Supabase-Plugin** `apply_migration` (Regel 2): DDL schreiben → apply → `list_migrations`-Version ablesen → File `supabase/migrations/<V>_<name>.sql` committen → `execute_sql` (READ) verifizieren → **Types regenerieren + committen** (`database.types.ts`, Regel 2 Schritt 6, kein Aufschieben) → ggf. `check:query-drift --update-baseline`.
- **Server-Actions:** Result-Object (`{ ok, error? }`), kein `throw`; `revalidatePath` je Write. Non-kritische Sub-Ops (Foto-Upload, KI) fail-soft.
- **KI fail-safe:** Client null / keine Fotos / Parse-Fehler → leere Fund-Liste (nie falsch-positiv). Human-in-the-loop: Funde erst nach FM-Bestätigung → `vehicle_vorschaeden`.
- **Ownership:** alle Reads/Writes firma-scoped (`flotten_fahrzeuge.firma_id` = FM-Firma), Admin-Client ohne RLS.
- **Neue Tabellen nicht in `database.types.ts`** bis Regen → `AnyDb`-Cast.
- **Storage:** privater Bucket `fahrzeug-zustand`, Zugriff nur via Server-Action + signierte URLs (`getStorageUrl`). Kein anon/authenticated-Grant (Default-Privileg-Wurzel #4555), RLS enabled + policy-los = deny-all (service_role bypasst).
- UI: Deutsch/Umlaute; `primitives`/`shared`-Komponenten; `capture="environment"`-Kamera-Input (Muster `SchadensfotoUploadCard`).
- Worktree `.claude/worktrees/fahrzeug-zustandsdoku` (Branch `kitta/fahrzeug-zustandsdoku`, aus staging @444add636 = A/#4657 + C/#4663 drin → keine Kollision).

---

### Task 1: DDL — Tabellen + Bucket (via Supabase-Plugin)

**Files:** Create `supabase/migrations/<V>_vehicle_zustandsdoku.sql` · Modify `src/lib/supabase/database.types.ts` (regen)

- [ ] **Step 1: DDL formulieren + `apply_migration({ name: "vehicle_zustandsdoku", query })`**

```sql
create table public.vehicle_scans (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid,
  kilometerstand integer,
  status text not null default 'offen' check (status in ('offen','abgeschlossen')),
  notiz text
);
create index vehicle_scans_vehicle_idx on public.vehicle_scans (vehicle_id, erstellt_am desc);
alter table public.vehicle_scans enable row level security;

create table public.vehicle_scan_fotos (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.vehicle_scans(id) on delete cascade,
  storage_path text not null,
  perspektive text not null check (perspektive in
    ('front','heck','seite_links','seite_rechts','ecke_vl','ecke_vr','ecke_hl','ecke_hr','tacho','nahaufnahme')),
  ist_nahaufnahme boolean not null default false,
  vorschaden_id uuid references public.vehicle_vorschaeden(id) on delete set null,
  reihenfolge integer,
  erstellt_am timestamptz not null default now()
);
create index vehicle_scan_fotos_scan_idx on public.vehicle_scan_fotos (scan_id);
alter table public.vehicle_scan_fotos enable row level security;

alter table public.vehicle_vorschaeden add column scan_id uuid references public.vehicle_scans(id) on delete set null;

insert into storage.buckets (id, name, public) values ('fahrzeug-zustand','fahrzeug-zustand', false)
  on conflict (id) do nothing;
```

- [ ] **Step 2:** `list_migrations` → vergebene Version `<V>` ablesen. File committen als `supabase/migrations/<V>_vehicle_zustandsdoku.sql` (Dateiname == `<V>`).
- [ ] **Step 3:** `execute_sql` (READ) verifizieren: `select column_name from information_schema.columns where table_name='vehicle_scans'` + `... 'vehicle_scan_fotos'` + `scan_id` auf `vehicle_vorschaeden` + `select id from storage.buckets where id='fahrzeug-zustand'`.
- [ ] **Step 4:** Types regenerieren (CLI-READ, s. Regel 2 Schritt 6): `SUPABASE_ACCESS_TOKEN=<.env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public` → `src/lib/supabase/database.types.ts` überschreiben + committen. Falls `check:query-drift`-Baseline schrumpft: `-- --update-baseline`.
- [ ] **Step 5: Commit** `feat(zustandsdoku): DDL vehicle_scans/_fotos + vorschaeden.scan_id + bucket`

---

### Task 2: Perspektiven + Vollständigkeit + Badge-Ampel (pure, TDD)

**Files:** Create `src/lib/vehicles/zustand-perspektiven.ts` · Test `src/lib/vehicles/zustand-perspektiven.test.ts`

- [ ] **Step 1: Test schreiben**

```ts
import { describe, it, expect } from 'vitest'
import { PFLICHT_PERSPEKTIVEN, alleErfasst, badgeAmpel } from './zustand-perspektiven'

describe('zustand-perspektiven', () => {
  it('Pflicht-Perspektiven = 8 (4 Seiten + 4 Ecken); Tacho optional', () => {
    expect(PFLICHT_PERSPEKTIVEN).toEqual(['front','heck','seite_links','seite_rechts','ecke_vl','ecke_vr','ecke_hl','ecke_hr'])
  })
  it('alleErfasst = true nur wenn jede Pflicht-Perspektive ein Foto hat', () => {
    expect(alleErfasst(['front','heck','seite_links','seite_rechts','ecke_vl','ecke_vr','ecke_hl','ecke_hr'])).toBe(true)
    expect(alleErfasst(['front','heck'])).toBe(false)
    expect(alleErfasst(['front','heck','seite_links','seite_rechts','ecke_vl','ecke_vr','ecke_hl','ecke_hr','tacho'])).toBe(true)
  })
  it('badgeAmpel: <3 Mon grün, 3–6 amber, >6/nie rot', () => {
    expect(badgeAmpel(0)).toBe('gruen'); expect(badgeAmpel(2)).toBe('gruen')
    expect(badgeAmpel(3)).toBe('amber'); expect(badgeAmpel(6)).toBe('amber')
    expect(badgeAmpel(7)).toBe('rot');   expect(badgeAmpel(null)).toBe('rot')
  })
})
```

- [ ] **Step 2:** Run → FAIL. `npx vitest run src/lib/vehicles/zustand-perspektiven.test.ts`
- [ ] **Step 3: Implement**

```ts
export const PFLICHT_PERSPEKTIVEN = ['front','heck','seite_links','seite_rechts','ecke_vl','ecke_vr','ecke_hl','ecke_hr'] as const
export const OPTIONALE_PERSPEKTIVEN = ['tacho'] as const
export type Perspektive = (typeof PFLICHT_PERSPEKTIVEN)[number] | (typeof OPTIONALE_PERSPEKTIVEN)[number] | 'nahaufnahme'
export const PERSPEKTIVE_LABEL: Record<string, string> = {
  front: 'Front', heck: 'Heck', seite_links: 'Seite links', seite_rechts: 'Seite rechts',
  ecke_vl: 'Ecke vorne links', ecke_vr: 'Ecke vorne rechts', ecke_hl: 'Ecke hinten links',
  ecke_hr: 'Ecke hinten rechts', tacho: 'Tacho (Kilometerstand)', nahaufnahme: 'Nahaufnahme',
}
export function alleErfasst(erfasst: string[]): boolean {
  const s = new Set(erfasst)
  return PFLICHT_PERSPEKTIVEN.every((p) => s.has(p))
}
export type BadgeAmpel = 'gruen' | 'amber' | 'rot'
export function badgeAmpel(monateSeitLetztemScan: number | null): BadgeAmpel {
  if (monateSeitLetztemScan == null) return 'rot'
  if (monateSeitLetztemScan < 3) return 'gruen'
  if (monateSeitLetztemScan <= 6) return 'amber'
  return 'rot'
}
```

- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(zustandsdoku): Perspektiven + Vollstaendigkeit + Badge-Ampel (pure)`

---

### Task 3: KI-Analyse — Parser + Vision-Wrapper (TDD für den Parser)

**Files:** Create `src/lib/vehicles/zustand-scan-ki.ts` · Test `src/lib/vehicles/zustand-scan-ki.test.ts`

**Interfaces:**
- Produces: `type ZustandFund = { perspektive: string; bereich: string; art: string; schwere: 'leicht'|'mittel'|'schwer'; confidence: number; beschreibung: string }`; `parseFunde(text: string): ZustandFund[]` (pure, tolerant); `analysiereFotos(fotos: {url:string; perspektive:string}[]): Promise<ZustandFund[]>` (fail-safe Vision-Call).

- [ ] **Step 1: Test (Parser)** — tolerant gegen Malformed, filtert unplausible Schwere/Confidence:

```ts
import { describe, it, expect } from 'vitest'
import { parseFunde } from './zustand-scan-ki'

describe('parseFunde', () => {
  it('parst valides JSON-Array in Funde', () => {
    const t = 'Text davor {"funde":[{"perspektive":"seite_links","bereich":"Tür","art":"Kratzer","schwere":"leicht","confidence":80,"beschreibung":"langer Kratzer"}]}'
    expect(parseFunde(t)).toEqual([{ perspektive:'seite_links', bereich:'Tür', art:'Kratzer', schwere:'leicht', confidence:80, beschreibung:'langer Kratzer' }])
  })
  it('leeres/kaputtes JSON -> []', () => {
    expect(parseFunde('kein json')).toEqual([]); expect(parseFunde('{"funde": nope}')).toEqual([])
  })
  it('unbekannte schwere -> Fund verworfen', () => {
    expect(parseFunde('{"funde":[{"perspektive":"front","bereich":"x","art":"y","schwere":"kaputt","confidence":50,"beschreibung":"z"}]}')).toEqual([])
  })
})
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — Parser (pure) + Vision-Wrapper nach `schadenbild-gewerke.ts`:

```ts
import { getAnthropicVisionClient, buildImageBlocks } from '@/lib/ai/vision/client'
import { AI_MODELS } from '@/lib/ai/models'

export type ZustandFund = { perspektive: string; bereich: string; art: string; schwere: 'leicht'|'mittel'|'schwer'; confidence: number; beschreibung: string }
const SCHWERE = new Set(['leicht','mittel','schwer'])
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function parseFunde(text: string): ZustandFund[] {
  const m = text.match(/\{[\s\S]*\}/); if (!m) return []
  let parsed: { funde?: unknown }; try { parsed = JSON.parse(m[0]) } catch { return [] }
  const raw = Array.isArray(parsed?.funde) ? parsed.funde : []
  return raw.flatMap((f: unknown): ZustandFund[] => {
    if (!f || typeof f !== 'object') return []
    const o = f as Record<string, unknown>
    const schwere = String(o.schwere ?? '')
    if (!SCHWERE.has(schwere)) return []
    return [{
      perspektive: String(o.perspektive ?? ''), bereich: String(o.bereich ?? ''), art: String(o.art ?? ''),
      schwere: schwere as ZustandFund['schwere'], confidence: clamp(Number(o.confidence) || 0, 0, 100),
      beschreibung: String(o.beschreibung ?? ''),
    }]
  })
}

const SYSTEM = 'Du bist ein KFZ-Schadengutachter. Erkenne aus den Fahrzeugfotos NUR eindeutig sichtbare Schäden (Delle, Kratzer, Riss, Rost, Bruch).'
export async function analysiereFotos(fotos: { url: string; perspektive: string }[]): Promise<ZustandFund[]> {
  const client = getAnthropicVisionClient()
  if (!client || fotos.length === 0) return []
  try {
    const res = await client.messages.create({
      model: AI_MODELS.vision_schadenbeschreibung, max_tokens: 800, system: SYSTEM,
      messages: [{ role: 'user', content: [
        ...buildImageBlocks(fotos.map((f) => f.url), 10),
        { type: 'text', text: `Perspektiven in Reihenfolge: ${fotos.map((f)=>f.perspektive).join(', ')}. Antworte NUR JSON: {"funde":[{"perspektive","bereich","art","schwere":"leicht|mittel|schwer","confidence":0-100,"beschreibung"}]}. Keine Funde -> {"funde":[]}.` },
      ] }],
    })
    const text = (res.content.find((c: { type: string }) => c.type === 'text') as { text?: string } | undefined)?.text ?? ''
    return parseFunde(text)
  } catch { return [] }
}
```
(Vision-Client-Signaturen beim Bauen gegen `src/lib/ai/vision/client.ts` bestätigen; `AI_MODELS.vision_schadenbeschreibung` = Haiku 4.5.)

- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(zustandsdoku): KI Fund-Parser + Vision-Wrapper (fail-safe)`

---

### Task 4: Server-Actions

**Files:** Create `src/app/flotte/(shell)/fahrzeug/[id]/zustand-actions.ts` (`'use server'`)

**Interfaces:** Consumes `recordVehicleDamage` (`@/lib/vehicles/vehicle-damage` — `{db, damage:{vehicleId, state:'vorschaden', art, schwere, beschreibung, quelle:'zustandsdoku', rohdaten}}`), `analysiereFotos` (Task 3), `getStorageUrl` (`@/lib/storage/url`), `getFlottenmanagerFirma`, `requirePortalAccess`.

- [ ] **Step 1:** `starteScan(vehicleId)` → Ownership (`flotten_fahrzeuge` firma+vehicle) → insert `vehicle_scans` (`status='offen'`, `erstellt_von=user.id`) → `{ ok:true, scanId }`.
- [ ] **Step 2:** `ladeFotoHoch(scanId, perspektive, dataUrl, istNahaufnahme, vorschadenId?)` → Ownership (scan→vehicle→firma) → decode+guard (MIME/Byte-Cap wie `gegner-dokumente.ts`) → `db.storage.from('fahrzeug-zustand').upload(\`\${vehicleId}/\${scanId}/\${crypto.randomUUID()}.jpg\`, buf, {contentType, upsert:false})` → insert `vehicle_scan_fotos` → `{ ok:true, fotoId, storagePath }`.
- [ ] **Step 3:** `analysiereZustandsFotos(scanId)` → lädt die Standard-Fotos des Scans → `getStorageUrl` je Foto (signiert) → `analysiereFotos(...)` → `{ ok:true, funde }`. Fail-soft: KI-Fehler → `{ ok:true, funde: [] }`.
- [ ] **Step 4:** `finalisiereScan(scanId, bestaetigteFunde, kilometerstand?)` → je Fund `recordVehicleDamage({db, damage:{vehicleId, state:'vorschaden', art:fund.art, schwere:fund.schwere, beschreibung:fund.beschreibung, quelle:'zustandsdoku', rohdaten:fund}})` → wenn Fund eine Nahaufnahme hat: `vehicle_scan_fotos.vorschaden_id` + neue `vehicle_vorschaeden.scan_id` setzen → `vehicle_scans` `status='abgeschlossen'`, `kilometerstand` → `revalidatePath('/flotte/fahrzeug/'+vehicleId)` + `revalidatePath('/flotte/flotte')`.
- [ ] **Step 5:** tsc + Commit `feat(zustandsdoku): Server-Actions (starteScan/ladeFoto/analysiere/finalisiere)`

---

### Task 5: Capture-Wizard (Client)

**Files:** Create `src/components/flotte/ZustandsScanWizard.tsx`

- [ ] **Step 1:** Client-Komponente, mobil. Props `{ vehicleId, onStart, onFoto, onAnalyse, onFinalize }` (Server-Actions aus Task 4 als Props von der Detail-Seite).
- [ ] **Step 2:** Ablauf-State: `idle → capturing(perspektiveIndex) → analysing → review(funde) → done`. Standard-Perspektiven aus `PFLICHT_PERSPEKTIVEN` + optional Tacho; je Schritt `<input type="file" accept="image/*" capture="environment">` (Muster `SchadensfotoUploadCard`), Foto → base64 → `onFoto`. Nach `alleErfasst` → „Fertig"-Button → `onAnalyse` → Review.
- [ ] **Step 3:** Review: je `ZustandFund` Karte (Perspektive/Bereich/Art/Schwere/Confidence/Beschreibung) mit Bestätigen/Verwerfen + optional „Nahaufnahme aufnehmen" (fail-soft) → `onFinalize(bestaetigteFunde)` → `router.refresh()`.
- [ ] **Step 4:** `primitives.Button`, `SectionCard`, Umlaute. tsc + Commit `feat(zustandsdoku): ZustandsScanWizard (Capture + Review, mobil)`

---

### Task 6: Fahrzeug-Detail — Zustandsdoku-Sektion

**Files:** Modify `src/app/flotte/(shell)/fahrzeug/[id]/page.tsx` (enthält bereits C's Bind-Widget/Storno)

- [ ] **Step 1:** Server: letzten `vehicle_scans` (status='abgeschlossen') + dessen Fotos + zugehörige `vehicle_vorschaeden` (scan_id) laden (firma-scoped); Foto-Thumbnails via `getStorageUrl` (signiert).
- [ ] **Step 2:** Neue `<SectionCard title="Zustandsdoku">` **vor** oder **nach** der „Schadenkarte"-Sektion: letzter Scan (Datum, Ampel „vor X Monaten", Thumbnails, erkannte Vorschäden) + `<ZustandsScanWizard vehicleId={id} onStart=.../>` (Actions aus Task 4). Leerfall: „Noch nicht dokumentiert" + „Ersten Scan machen".
- [ ] **Step 3:** vollständiger Build (Route) + Commit `feat(zustandsdoku): Fahrzeug-Detail Zustandsdoku-Sektion + Scan-Einstieg`

---

### Task 7: Flotten-Liste — Zustand-Badge

**Files:** Modify `src/app/flotte/(shell)/flotte/page.tsx` + `src/components/flotte/FlotteClient.tsx`

- [ ] **Step 1:** `page.tsx`: pro Fahrzeug das letzte `vehicle_scans.erstellt_am` laden (eine Query, `vehicle_id in (...)`, latest je vehicle) → Map `vehicleId → letzterScanAm`; an `FlotteClient` durchreichen.
- [ ] **Step 2:** `FlotteClient`: je Fahrzeug-Zeile ein Badge via `badgeAmpel(monateSeit(letzterScanAm))` → `bg-success-soft/text-success-strong` (grün) / `warning` (amber) / `danger` (rot) + Label „dokumentiert vor X Mon." / „nie". (Status-Registry: reine Ampel ohne Status-Domäne → token-Farben direkt ok, kein inline-Status-Map.)
- [ ] **Step 3:** tsc + Commit `feat(zustandsdoku): Zustand-Badge in der Flotten-Liste`

---

### Task 8: Vollverifikation + PR + Regel-4-Handoff

- [ ] `npx vitest run src/lib/vehicles/` → grün (Perspektiven + KI-Parser).
- [ ] `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → grün.
- [ ] Ratchets: token-audit, component-set, status-registry, knip, use-server-exports, query-drift, vitest (alle `--ratchet`).
- [ ] Push (`git push -u origin HEAD:kitta/fahrzeug-zustandsdoku`) + PR gegen `staging`.
- [ ] **Regel 4** (nach Deploy, Test-Fahrzeug): FM macht Scan (Fotostrecke) → KI-Review → bestätigen → `vehicle_vorschaeden` (`quelle=zustandsdoku`) da → Badge grün → bei Test-Claim am selben Fahrzeug ist der Vorschaden sichtbar. Wegwerf-Test-Fahrzeug.

---

## Self-Review
- Spec-Coverage: Datenmodell→T1, Perspektiven/Badge→T2, KI→T3, Actions→T4, Wizard→T5, Detail-Sektion→T6, Flotten-Badge→T7. Human-in-the-loop→T4/T5 (finalisiere nur bestätigte Funde). Alle v1-Punkte abgedeckt. ✓
- Placeholder: „Signatur beim Bauen bestätigen" (Vision-Client, recordVehicleDamage) zeigen auf exakte Files. DDL-Version `<V>` wird per `list_migrations` aufgelöst (Regel 2). Kein toter Platzhalter.
- Typ-Konsistenz: `Perspektive`/`ZustandFund`/`badgeAmpel` pure + getestet; Perspektiven-Enum == DDL-CHECK == Parser-Labels.

## Out of Scope
Phase 3 (3-Monats-Reminder-Cron); Phase 4 (NFC-Read der Karten-Identify); Fahrer-Einstieg; Tamper-Hashing.
