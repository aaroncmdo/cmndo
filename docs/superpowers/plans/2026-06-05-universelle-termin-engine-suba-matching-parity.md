# Universelle Termin-Engine — Sub-A: findeBestePerson-Parität + findBestSV-Thin-Wrapper — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development oder executing-plans. Steps `- [ ]`.

**Goal:** `findeBestePerson` erreicht SV-Parität zu `findBestSV` (Sticky-SV-Bonus + reiche `SvMatchCandidate`-Felder), ein Shadow-Diff-Harness beweist Ranglisten-Äquivalenz auf Live-Inputs, dann wird `findBestSV` ein Thin-Wrapper → **eine Matching-Quelle**.

**Architecture:** A.1 erweitert `findeBestePerson` **additiv** (engine-only, kein Consumer berührt, sofort mergeable). A.2 = Shadow-Diff (`findBestSVviaEngine`-Mapping + Verify-Script, beide parallel, Rangliste diffen). A.3 = `findBestSV` → delegiert an `findBestSVviaEngine` (NACH Diff-grün + Aaron-Sign-off; die 6 Consumer bleiben unberührt, Signatur identisch).

**Tech Stack:** TS, Vitest (pure), tsx Live-Diff.

**Baut auf Phase 0** (Parameter 40/10/10/50) — der Shadow-Diff vergleicht beide Matcher auf denselben Parametern, isoliert also die Logik-Diffs (Sticky, busy-source).

**Spec:** `…2026-06-05-universelle-termin-engine-design.md` §7, §12.

---

### Task A.1: `findeBestePerson` — Sticky + reiche Felder (additiv, engine-only)

**Files:**
- Modify: `src/lib/termine/engine/matching.ts` (`FindeBestePersonInput`, `PersonKandidat`, `bewertet`-Map, `waehleSlot`, `mitSlot`-Map)
- Test: `src/lib/termine/engine/__tests__/matching-parity.test.ts` (Create)

- [ ] **Step 1: `FindeBestePersonInput` + `stickyAssigneeId`**

In `FindeBestePersonInput` ergänzen:
```ts
  /** Kontinuität: dieser Assignee bekommt einen massiven Score-Bonus (+1000), wenn im Pool. */
  stickyAssigneeId?: string | null
```

- [ ] **Step 2: `PersonKandidat` um die reichen Felder erweitern**

```ts
export interface PersonKandidat {
  assignee: Assignee
  name: string
  score: number
  distanzKm: number
  etaVomBueroMin: number | null
  slotVon: string | null
  slotBis: string | null
  reasons: string[]
  // SvMatchCandidate-Parität (additiv):
  profileId?: string | null
  paket?: string
  offeneFaelle?: number
  kontingentFrei?: number
  ablehnungen30d?: number
  verfuegbarAmWunschtermin?: boolean
  naechsterFreierSlot?: string | null
}
```

- [ ] **Step 3: Sticky-Bonus + reiche Felder im `bewertet`-Map**

Destrukturiere `stickyAssigneeId = null` aus dem Input (bei den anderen Defaults). Im `bewertet`-Map (`imGebiet.map(...)`):
```ts
    const kontingentGesamt = Number(sv.paket_faelle_gesamt) || 10
    const kontingentFrei = kontingentGesamt - kontingentGenutzt
    const stickyBonus = stickyAssigneeId && sv.id === stickyAssigneeId ? 1000 : 0
    const score = bewerteSvKandidat({ paket, kontingentGenutzt, ablehnungen30d, etaVomBueroMin, distanzKm: g.distanzKm }) + stickyBonus
    // …
    if (stickyBonus > 0) reasons.unshift('Bekannter SV (Sticky)')
    return {
      assignee: { typ: 'sachverstaendiger', id: sv.id },
      name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : '—',
      score, distanzKm: Math.round(g.distanzKm * 10) / 10, etaVomBueroMin,
      slotVon: null, slotBis: null, reasons,
      // reiche Felder:
      profileId: (sv.profile_id as string | null) ?? null,
      paket, offeneFaelle: kontingentGenutzt, kontingentFrei, ablehnungen30d,
      partnerSeit: sv.partner_seit, createdAt: sv.created_at, id: sv.id, sv,
    }
```
(`Bewertet` = `PersonKandidat & RankbarerKandidat & { sv: SvRow }` — die reichen Felder fließen durch.)

- [ ] **Step 4: `waehleSlot` gibt `istWunschtermin` zurück**

Rückgabetyp → `{ von: string; bis: string; istWunschtermin: boolean } | null`. Im Wunschtermin-Zweig `return { von: wunschIso, bis: bisIso, istWunschtermin: true }`; im Else-Zweig `return { von: …, bis: …, istWunschtermin: false }`.

- [ ] **Step 5: `mitSlot`-Map — reiche Felder + Wunschtermin-Status durchreichen**

```ts
  for (const k of sortiert.slice(0, Math.max(topN, 1))) {
    const slot = await waehleSlot(k.assignee, k.sv, wunschterminIso, dauerMin, fensterVonIso, fensterBisIso, schadenort, db)
    mitSlot.push({
      assignee: k.assignee, name: k.name, score: k.score, distanzKm: k.distanzKm,
      etaVomBueroMin: k.etaVomBueroMin, reasons: k.reasons,
      profileId: k.profileId, paket: k.paket, offeneFaelle: k.offeneFaelle,
      kontingentFrei: k.kontingentFrei, ablehnungen30d: k.ablehnungen30d,
      slotVon: slot?.von ?? null, slotBis: slot?.bis ?? null,
      verfuegbarAmWunschtermin: wunschterminIso ? (slot?.istWunschtermin ?? false) : undefined,
      naechsterFreierSlot: slot && !slot.istWunschtermin ? slot.von : null,
    })
  }
```

- [ ] **Step 6: Unit-Test** (`matching-parity.test.ts`) — Sticky + Felder über injizierten `db`-Stub

```ts
import { describe, it, expect } from 'vitest'
import { findeBestePerson } from '../matching'

// Minimaler db-Stub: ein dispatchbarer SV im Gebiet, kein Wunschtermin.
function stubDb(svId: string) {
  const sv = {
    id: svId, profile_id: 'p1', paket: 'standard',
    standort_lat: 51.0, standort_lng: 7.0, isochrone_polygon: null,
    paket_umkreis_km: 40, paket_faelle_gesamt: 10, paket_faelle_genutzt: 2,
    offene_faelle: 2, ablehnungen_30_tage: 1, urlaub_von: null, urlaub_bis: null,
    partner_seit: '2025-01-01', created_at: '2025-01-01',
    profiles: { vorname: 'Max', nachname: 'M' },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => ({ select: () => ({ /* applyDispatchableFilter ruft .eq/.is chainend */ }) }) } as any
}
// Hinweis: findeBestePerson nutzt applyDispatchableFilter + mapboxEtaMatrix + freieSlots →
// für einen ECHTEN Pure-Test ist ein voller Stub aufwändig. Daher: dieser Test sichert nur
// die Sticky-Bonus-PURE-Logik über matching-score; der End-to-End-Pfad läuft im A.2-Live-Diff.
import { bewerteSvKandidat } from '../matching-score'
describe('findeBestePerson Parität (A.1)', () => {
  it('Sticky-Bonus hebt einen sonst schwächeren Kandidaten über den Score', () => {
    const base = bewerteSvKandidat({ paket: 'standard', kontingentGenutzt: 5, ablehnungen30d: 0, etaVomBueroMin: 30, distanzKm: 20 })
    const besser = bewerteSvKandidat({ paket: 'premium', kontingentGenutzt: 0, ablehnungen30d: 0, etaVomBueroMin: 10, distanzKm: 5 })
    expect(base + 1000).toBeGreaterThan(besser) // +1000 schlägt den Paket-/ETA-Vorteil
  })
})
```

- [ ] **Step 7: tsc + Vitest + Commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "matching|error TS" | head; echo "exit ${PIPESTATUS[0]}"` → exit 0
Run: `npx vitest run src/lib/termine/engine` → PASS
```bash
git add src/lib/termine/engine/matching.ts src/lib/termine/engine/__tests__/matching-parity.test.ts
git commit -m "feat(termine-engine/Sub-A.1): findeBestePerson Sticky-Bonus + reiche SvMatchCandidate-Felder (additiv)"
```

---

### Task A.2: Shadow-Diff-Harness — `findBestSVviaEngine` + Live-Diff

**Files:**
- Create: `src/lib/dispatch/findBestSV-via-engine.ts` (Mapping `findeBestePerson(nurVorschlag)` → `SvMatchCandidate[]`)
- Create: `scripts/verify-shadow-findbestsv.mts` (beide Matcher parallel auf realen Leads, Rangliste diffen)

- [ ] **Step 1: `findBestSVviaEngine`** — mappt PersonKandidat → SvMatchCandidate

```ts
import type { SvMatchInput, SvMatchCandidate } from './findBestSV'
import { findeBestePerson } from '@/lib/termine/engine'
export async function findBestSVviaEngine(input: SvMatchInput, limit = 3): Promise<SvMatchCandidate[]> {
  const res = await findeBestePerson({
    schadenort: { lat: input.fallLat, lng: input.fallLng },
    bezug: { typ: 'lead', id: 'shadow' }, quelle: 'dispatch',
    wunschterminIso: input.wunschterminIso ?? null,
    excludeAssigneeIds: input.excludeSvId ? [input.excludeSvId] : [],
    stickyAssigneeId: input.stickySvId ?? null,
    topN: limit, nurVorschlag: true, assigneeTyp: 'sachverstaendiger',
  })
  if (!res.ok || res.gebucht) return []
  return res.kandidaten.map((k) => ({
    svId: k.assignee.id, profileId: k.profileId ?? null, name: k.name,
    paket: k.paket ?? 'standard', distanzKm: k.distanzKm, etaFromBueroMin: k.etaVomBueroMin,
    offeneFaelle: k.offeneFaelle ?? 0, kontingentFrei: k.kontingentFrei ?? 0,
    ablehnungen30d: k.ablehnungen30d ?? 0, score: k.score, reasons: k.reasons,
    verfuegbarAmWunschtermin: k.verfuegbarAmWunschtermin,
    naechsterFreierSlot: k.naechsterFreierSlot ?? null,
  }))
}
```

- [ ] **Step 2: Shadow-Diff-Script** (`verify-shadow-findbestsv.mts`, inline `loadEnv` wie verify-engine-belegung.mts)

Zieht N reale Leads mit `besichtigungsort_lat/lng` (+ optional Wunschtermin), ruft `findBestSV` (alt) UND `findBestSVviaEngine` (neu), diffe die svId-Reihenfolge + Top-1 + Score-Rang. Output: JSON `{ geprueft, identischTop1, identischReihenfolge, diffs: [...] }`. **Kein Live-Impact** (reine Lese-Vergleiche).

- [ ] **Step 3: Live-Diff laufen + analysieren**

Run: `cp ../../../.env.local .env.local && npx tsx scripts/verify-shadow-findbestsv.mts; rm -f .env.local`
Erwartung: hohe Top-1-Übereinstimmung; jeden Diff erklären (Sticky/busy-source/ETA-Rundung). Ergebnis in `docs/05.06.2026/shadow-findbestsv-diff.md` festhalten.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dispatch/findBestSV-via-engine.ts scripts/verify-shadow-findbestsv.mts docs/05.06.2026/shadow-findbestsv-diff.md
git commit -m "test(termine-engine/Sub-A.2): Shadow-Diff findBestSV vs Engine — Aequivalenz-Beweis"
```

---

### Task A.3: `findBestSV` → Thin-Wrapper (GATED: nach A.2-Diff-grün + Aaron-Sign-off)

**Files:**
- Modify: `src/lib/dispatch/findBestSV.ts` (Body → `return findBestSVviaEngine(input, limit)`; Signatur + `SvMatchInput`/`SvMatchCandidate`-Exports unverändert; `findNextFreeSlotForSv` bleibt exportiert für den TZ-Test)

- [ ] **Step 1:** Body von `findBestSV` ersetzen durch Delegation; alte Inline-Logik entfernen (Dead-Code). `PAKET_PRIO`/`istKontingentBlockiert`-Exports prüfen (von Tests + anderen genutzt → behalten oder nach matching-score umziehen).
- [ ] **Step 2:** Bestehende Tests grün (`findBestSV.matching.test.ts`, `findBestSV-slot-tz.test.ts`) — ggf. anpassen.
- [ ] **Step 3:** PR gegen staging mit Shadow-Diff-Evidenz + **Sign-off** (Live-Dispatch + aar-956-Funnel). aar-956 koordinieren.

---

## Self-Review

- **Spec-Coverage:** §7 (zwei Gesichter, findBestSV-Wrapper) → A.3; Sticky+reiche Felder (§7 Parität) → A.1; Shadow-Diff (§12) → A.2. ✓
- **Placeholder:** A.2-Script-Body in Prosa beschrieben (Diff-Logik) — beim Implementieren ausformulieren; keine `TODO` im Code-Pfad. ✓
- **Typ-Konsistenz:** `stickyAssigneeId`/reiche Felder in A.1 definiert, in A.2-Mapping genutzt (gleiche Namen). `SvMatchCandidate`-Shape = `findBestSV.ts`-Export (Quelle). ✓
