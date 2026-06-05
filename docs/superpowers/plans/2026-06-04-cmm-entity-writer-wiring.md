# CMM Entity — Plan 3: Writer-Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development oder superpowers:executing-plans. Checkbox-Steps.
>
> **⚠️ PLAN-ONLY / EXECUTION GATED + KOORDINIERT.** Voraussetzungen: **Plan 1 (#2431)** + **Plan 2 (#2432)** ausgeführt (Resolver + Damage-Entität existieren) · ruhiges aar-939-Fenster · **`convert-lead-to-claim.ts` ist Lead-Strecke-Revier (753d8096)** → Edit-Timing mit ihnen abstimmen (sie fassen die Entity-Population nicht an, aber das File ist geteilt). Spec: `docs/04.06.2026/cmm-entity-katalog-spec.md` (#2429) §5/§6.

**Goal:** Die `convert-lead-to-claim`-Population schreibt Entity-Daten durch die dedupenden Resolver in die Entitäten (Firma/Versicherer/Gegner-Fahrzeug/Schaden) statt flach — eine SoT, keine Dupes.

**Architecture:** 3-Schicht (Spec §5): `resolveFallEntityFks` wird von „fuzzy-only" zu „resolve-or-ensure" evolviert (ruft `ensure<Entity>`); `convert-lead-to-claim` ruft die Resolver an den bestehenden Population-Stellen (Schritt 4/5) + setzt die FKs (`firma_id`/`vehicle_id`) statt Klartext. **Logische Anker** (Block-Namen), KEINE Zeilennummern — die Lead-Strecke editiert das File.

**Tech Stack:** TypeScript (Admin-Client `as unknown as SupabaseClient` für die untyped Resolver), vitest gated DB-Integration (`RUN_DB_INTEGRATION`).

---

## ✅ Drei GATES — RESOLVED (Lead-Strecke 753d8096, #2429 issuecomment-4632650925, 05.06.)

- **GATE A — Gegner-als-Firma:** kein Typ-Signal heute → **Gegner bleibt Person** (Default bestätigt, data-inert). **Forward-Path:** die Lead-Strecke liefert `gegner_ist_firma` + `gegner_firma_name` (+opt. `gegner_ustid`) **mit ihrem Entry-Cutover**, an die `ensureFirma`-Signatur angeglichen → DANN aktiviert Task 5 das Gegner-Firma-Routing.
- **GATE B — `leads.firma_ustid`:** **Lead-Strecke legt die Spalte selbst** via `apply_migration` an, sobald der Gewerbe-Flow sie befüllt (nach CMM-49). `ensureFirma` ust_id=optional ist richtig (Dedup `normalized_name` wenn null); Task 2 gibt `lead.firma_ustid ?? null` bereits mit → **kein Re-Touch**.
- **GATE C — `firma_name`:** existiert, Gewerbe-(Kunde-)scoped, NULL bei Privat → null-safe-Wiring (Task 2 feuert nur wenn gesetzt) **bestätigt**.

→ Alle 3 Defaults sind die richtige Landing; **nichts blockiert Plan 3**. Converter-Edit-Timing abgestimmt: die Lead-Strecke fasst `convert-lead-to-claim` bis post-CMM-49/Resolver-Foundation NICHT an.

---

## File Structure

| Datei | Verantwortung | Art |
|---|---|---|
| `src/lib/lead-fall-mapping.ts` | `resolveFallEntityFks`: Versicherung fuzzy → resolve-or-ensure | Modify (Versicherungs-Block in `resolveFallEntityFks`) |
| `src/lib/leads/convert-lead-to-claim.ts` | Geschädigter-Firma → `firma_id`; Gegner-Fahrzeug → `vehicle_id`+involvement; Schaden → `recordVehicleDamage` | Modify (Schritt-4/5-Bereich) |
| `src/lib/leads/__tests__/convert-entity-wiring.integration.test.ts` | gated DB-Integration: Konversion legt Entitäten an | Create |

---

## Task 1: `resolveFallEntityFks` Versicherung → resolve-or-ensure

**Files:** Modify `src/lib/lead-fall-mapping.ts` (Versicherungs-Block in `resolveFallEntityFks`, ~Z.285–300) + Import.

- [ ] **Step 1: Import ergänzen** (oben in der Datei)

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureVersicherung } from '@/lib/versicherungen/ensure-versicherung'
```

- [ ] **Step 2: Versicherungs-Block ersetzen** — den bestehenden Fuzzy-only-Block (`let gegnerVersicherungId … if (gegnerVs.length >= 3) { … ilike … }`) durch resolve-or-ensure:

```ts
  let gegnerVersicherungId: string | null = null
  if (gegnerVs.length >= 3) {
    try {
      const escaped = gegnerVs.replace(/[\\%_]/g, '\\$&')
      const { data } = await admin
        .from('versicherungen').select('id').ilike('name', `%${escaped}%`).limit(1).maybeSingle()
      gegnerVersicherungId = data?.id ?? null
      if (!gegnerVersicherungId) {
        // CMM-Entity Plan 3: kein Fuzzy-Treffer -> Entitaet find-or-create (resolve-or-ensure)
        const ens = await ensureVersicherung({ db: admin as unknown as SupabaseClient, klartext: gegnerVs })
        if (ens.ok) gegnerVersicherungId = ens.versicherungId
        else console.warn('[CMM-Entity P3] ensureVersicherung fehlgeschlagen:', ens.error)
      }
    } catch { /* non-blocking */ }
  }
```

- [ ] **Step 3: tsc** — `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → 0.
- [ ] **Step 4: Commit** — `git commit -m "feat(cmm-entity): resolveFallEntityFks Versicherung resolve-or-ensure (Writer-Wiring T1)"`

---

## Task 2: Geschädigter-Firma → `claim_parties.firma_id`

**Files:** Modify `src/lib/leads/convert-lead-to-claim.ts` (Import + nach dem `ensurePersonForData`-Loop, VOR dem `claim_parties`-Insert).

- [ ] **Step 1: Import ergänzen**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureFirma } from '@/lib/firmen/ensure-firma'
```

- [ ] **Step 2: Firma-Wiring einfügen** — direkt nach der `for (const p of partyInserts) { … ensurePersonForData … }`-Schleife, vor `admin.from('claim_parties').insert(partyInserts)`:

```ts
  // CMM-Entity Plan 3: Geschaedigter-Firma (Gewerbe) -> firmen-Entitaet + firma_id (statt Klartext).
  // GATE B: leads hat (noch) kein firma_ustid -> Dedup per normalized_name; ust_id additiv wenn da.
  // Non-critical: Fehler laesst firma_id NULL, bricht die Konversion nicht.
  if (Boolean(lead.gewerbe_flag) && (lead.firma_name as string | null)) {
    const firmaRes = await ensureFirma({
      db: admin as unknown as SupabaseClient,
      snapshot: {
        name: lead.firma_name as string,
        ust_id: (lead.firma_ustid as string | null) ?? null, // GATE B: heute null (Spalte fehlt)
        quelle: 'lead_konvertierung',
      },
    })
    if (firmaRes.ok) partyInserts[0].firma_id = firmaRes.firmaId
    else console.warn('[CMM-Entity P3] ensureFirma (geschaedigter) fehlgeschlagen:', firmaRes.error)
  }
```

- [ ] **Step 3: tsc** → 0. **Step 4: Commit** — `git commit -m "feat(cmm-entity): Geschaedigter-Firma -> firma_id bei Konversion (Writer-Wiring T2)"`

---

## Task 3: Gegner-Fahrzeug → `vehicles` + involvement(rolle='gegner')

**Files:** Modify `src/lib/leads/convert-lead-to-claim.ts` (Import + verursacher-Block + involvement-Block).

- [ ] **Step 1: Import ergänzen**

```ts
import { ensureVehicleFromKennzeichen } from '@/lib/vehicles/ensure-vehicle-from-kennzeichen'
```

- [ ] **Step 2: Gegner-Fahrzeug resolven** — VOR dem `partyInserts.push({ rolle: 'verursacher', … })`-Block (dort wo `istGegnerBekannt`/`hatGegnerInfo` berechnet werden):

```ts
  // CMM-Entity Plan 3: Gegner-Fahrzeug als vehicles-Entitaet (provisorisch per Kennzeichen, FIN-los).
  let gegnerVehicleId: string | null = null
  if (istGegnerBekannt && (lead.gegner_kennzeichen as string | null)) {
    const gv = await ensureVehicleFromKennzeichen({
      db: admin as unknown as SupabaseClient,
      kennzeichen: lead.gegner_kennzeichen as string,
      klartext: (lead.gegner_fahrzeugtyp as string | null) ?? null,
    })
    if (gv.ok) gegnerVehicleId = gv.vehicleId
    else console.warn('[CMM-Entity P3] ensureVehicleFromKennzeichen fehlgeschlagen:', gv.error)
  }
```

- [ ] **Step 3: `vehicle_id` an die verursacher-Partei** — im `partyInserts.push({ rolle: 'verursacher', … })`-Objekt das Feld ergänzen:

```ts
      vehicle_id: gegnerVehicleId,
```

- [ ] **Step 4: Gegner-Involvement** — nach dem bestehenden geschädigten-`claim_vehicle_involvements`-Insert (im `if (resolvedVehicleId) { … }`-Bereich) ein zweites Involvement anlegen:

```ts
  // CMM-Entity Plan 3: Gegner-Fahrzeug-Involvement. ⚠️ rolle='verursacher' (live-CHECK:
  // {geschaedigter,verursacher,beteiligter,unbekannt,mietwagen} — KEIN 'gegner'!). Non-critical.
  if (gegnerVehicleId) {
    const { error: cviGErr } = await admin.from('claim_vehicle_involvements').insert([
      { claim_id: claimId, vehicle_id: gegnerVehicleId, rolle: 'verursacher', reihenfolge: 2 },
    ])
    if (cviGErr) console.error('[CMM-Entity P3] gegner-involvement-Insert (non-fatal):', cviGErr.message)
  }
```

- [ ] **Step 5: tsc** → 0. **Step 6: Commit** — `git commit -m "feat(cmm-entity): Gegner-Fahrzeug -> vehicles + involvement gegner (Writer-Wiring T3)"`

---

## Task 4: Schaden → `recordVehicleDamage` (Plan-2-Helper)

**Files:** Modify `src/lib/leads/convert-lead-to-claim.ts` (Import + nach dem geschädigten-Involvement).

- [ ] **Step 1: Import ergänzen**

```ts
import { recordVehicleDamage } from '@/lib/vehicles/vehicle-damage'
```

- [ ] **Step 2: aktuellen Schaden festhalten** — nach dem geschädigten-`claim_vehicle_involvements`-Insert (wo `resolvedVehicleId` gesetzt ist):

```ts
  // CMM-Entity Plan 3 (Plan-2-Helper): aktueller Fahrzeugschaden als vehicle-bound Damage-Entitaet.
  // Wird beim Claim-Close zu 'vorschaden' (markClaimDamagesAsVorschaden, Lifecycle). Non-critical.
  if (resolvedVehicleId) {
    const dmg = await recordVehicleDamage({
      db: admin as unknown as SupabaseClient,
      damage: {
        vehicleId: resolvedVehicleId,
        claimId,
        state: 'aktuell',
        beschreibung: (lead.fahrzeugschaden_beschreibung as string | null) ?? null,
        quelle: 'lead_konvertierung',
      },
    })
    if (!dmg.ok) console.warn('[CMM-Entity P3] recordVehicleDamage fehlgeschlagen:', dmg.error)
  }
```

- [ ] **Step 3: tsc** → 0. **Step 4: Commit** — `git commit -m "feat(cmm-entity): aktueller Schaden -> recordVehicleDamage bei Konversion (Writer-Wiring T4)"`

---

## Task 5: GATE A — Gegner-als-Firma (aktiviert, wenn die Lead-Strecke das Signal liefert)

**Trigger (RESOLVED 05.06.):** die Lead-Strecke liefert `leads.gegner_ist_firma` + `gegner_firma_name` (+opt. `gegner_ustid`) **mit ihrem Entry-Cutover** (an `ensureFirma` angeglichen). Bis dahin: **Gegner bleibt Person** (Status quo, data-inert) — nichts zu tun.

- [ ] **Step 1 (wenn die Lead-Felder live sind):** im verursacher-Block, analog zu Task 2 — `firma_id` statt `nachname`:

```ts
  // CMM-Entity Plan 3 / GATE A aktiviert: Gegner-Firma -> firmen + verursacher-party.firma_id
  if (Boolean(lead.gegner_ist_firma) && (lead.gegner_firma_name as string | null)) {
    const gf = await ensureFirma({
      db: admin as unknown as SupabaseClient,
      snapshot: { name: lead.gegner_firma_name as string, ust_id: (lead.gegner_ustid as string | null) ?? null, quelle: 'lead_konvertierung' },
    })
    if (gf.ok) {
      // im verursacher-partyInserts.push: firma_id: gf.firmaId, nachname weglassen
    } else console.warn('[CMM-Entity P3] ensureFirma (gegner) fehlgeschlagen:', gf.error)
  }
```
Feldnamen final aus dem Entry-Cutover der Lead-Strecke übernehmen.

---

## Task 6: Integration-Test (gated)

**Files:** Create `src/lib/leads/__tests__/convert-entity-wiring.integration.test.ts`

- [ ] **Step 1: Test schreiben**

```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { convertLeadToClaim } from '@/lib/leads/convert-lead-to-claim'

const RUN = process.env.RUN_DB_INTEGRATION === '1'
;(RUN ? describe : describe.skip)('convert-lead-to-claim Entity-Wiring (DB)', () => {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  it('Gewerbe-Lead -> Geschaedigter-Firma + Gegner-Vehicle + Schaden', async () => {
    const { data: lead } = await db.from('leads').insert({
      vorname: 'Test', nachname: 'Gewerbe', email: `t${Date.now()}@x.de`,
      gewerbe_flag: true, firma_name: `Testfirma ${Date.now()} GmbH`,
      gegner_bekannt: true, gegner_kennzeichen: `B-GG ${Date.now() % 9999}`, gegner_fahrzeugtyp: 'PKW',
      fahrzeugschaden_beschreibung: 'Front links', status: 'neu',
    }).select('id').single()
    const res = await convertLeadToClaim({ leadId: lead!.id })
    expect(res.ok).toBe(true)
    if (res.ok) {
      const { data: gp } = await db.from('claim_parties').select('firma_id').eq('claim_id', res.claimId).eq('rolle','geschaedigter').single()
      expect(gp!.firma_id).not.toBeNull()
      const { data: inv } = await db.from('claim_vehicle_involvements').select('rolle').eq('claim_id', res.claimId).eq('rolle','verursacher')
      expect((inv ?? []).length).toBe(1)
      const { count } = await db.from('vehicle_vorschaeden').select('id', { count:'exact', head:true }).eq('claim_id', res.claimId).eq('state','aktuell')
      expect(count).toBe(1)
      // cleanup
      await db.from('claims').delete().eq('id', res.claimId)
      await db.from('leads').delete().eq('id', lead!.id)
    }
  })
})
```

- [ ] **Step 2: Test laufen, grün** — `RUN_DB_INTEGRATION=1 npx vitest run src/lib/leads/__tests__/convert-entity-wiring.integration.test.ts` → PASS.
- [ ] **Step 3: Commit** — `git commit -m "test(cmm-entity): convert-lead-to-claim Entity-Wiring Integration (Writer-Wiring T6)"`

---

## Backfill-Notiz (kein Task jetzt)
Bestehende flache Daten → Entitäten: aktuell **data-inert** (0 gegner-Parties, 0 firmen, vehicles=1). Backfill = No-Op. Ein echter Backfill-Step (existierende `claims.gegner_*`/`firma`-Klartexte → Entitäten via die Resolver) lohnt erst, wenn reale Daten da sind — dann eigener kleiner Plan.

---

## Self-Review

**1. Spec-Coverage (§5):** resolve-or-ensure-Orchestrator → Task 1 ✓ · Firma-Population → Task 2 (Geschädigter) + Task 5-Gate (Gegner) · Gegner-Fahrzeug → Task 3 ✓ · Schaden (Plan-2-Helper) → Task 4 ✓ · ensure<Entity> NICHT inline (3-Schicht) → Tasks rufen die Plan-1/2-Module ✓.

**2. Placeholder-Scan:** determinierte Tasks (1–4, 6) haben vollständigen Code; die 2 offenen Punkte sind explizite **GATES** (A: Lead-Signal nötig; B: firma_ustid fehlt) — ehrliche Scope-Grenzen, keine TBDs.

**3. Typ-Konsistenz:** `admin as unknown as SupabaseClient` durchgängig (Admin-Client → untyped Resolver). Resolver-Namen/Signaturen = exakt Plan 1 (#2431: `ensureFirma`/`ensureVersicherung`/`ensureVehicleFromKennzeichen`) + Plan 2 (#2432: `recordVehicleDamage`). `partyInserts[0]` = Geschädigter (Reihenfolge wie im Bestand).

**Offene Punkte für den Executor:** (a) **Koordination mit Lead-Strecke** vor `convert-lead-to-claim`-Edits (geteiltes File) — logische Anker nutzen, ihre Edits nicht überschreiben. (b) Plan 1+2 müssen ausgeführt sein (Resolver + `vehicle_vorschaeden.state` existieren). (c) GATE A (Gegner-Firma) + GATE B (firma_ustid) mit Lead-Strecke klären. (d) ✓ verifiziert: `claim_vehicle_involvements.rolle`-CHECK = {geschaedigter, verursacher, beteiligter, unbekannt, mietwagen} → Gegner-Fahrzeug-Involvement = **`'verursacher'`** (KEIN 'gegner'; konsistent mit der verursacher-Partei).
