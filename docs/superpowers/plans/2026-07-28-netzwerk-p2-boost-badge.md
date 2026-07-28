# Netzwerk-Ökosystem P2 (Boost + Badge) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Netzwerk-Boost scharf schalten — zahlende Netzwerkpartner ranken global über Free-SVs (Signal in `matching-score.ts` **umbiegen**, nicht neu bauen), der zweite Zuweisungs-Algorithmus (`api/sv-zuweisung`) reiht Netzwerkpartner zuerst, das „Netzwerkpartner"-Badge hängt am Abo-Prädikat statt an `paket`, und der gebundene Kunde sieht seine befreundeten, zahlenden Partner als relationale „Dein Netzwerk"-Partition oben im Finder.

**Architecture:** Zwei Boost-Ebenen auf dem P0-Fundament (`ladeZahlendeSvSet`/`istZahlenderNetzwerkPartner`/`ladeFreundKandidatIds`). **Ebene 1 (global, Netzwerkpartner > Free):** ein binärer `W_NETZWERK`-Term in der puren Score-Formel (`bewerteSvKandidat`), gefüttert aus einem **einmal pro Ranking-Call** batch-geladenen `Set<sv_id>` (K10) — greift transitiv in `findeBestePerson` (Dispatch + öffentlicher Finder via `findBestSV`) und **separat** im eigenständigen `api/sv-zuweisung/route.ts` (K4). **Ebene 2 (relational, „Dein Netzwerk"):** die pure `applyNetzwerkPraeferenz`-Partition läuft als **letzter** Schritt NACH dem Engine-Ranking und den 2 Extra-Reorderings (`qualifiziereWerkstaetten` #4101 + `verifiziert`-Vorreihung #4125). Das Badge liest das injizierte Prädikat statt `paket` (`paket` bleibt unangetastet, K3). Der anon-Finder hat keinen Session-Owner → Owner wird injiziert (K11), Metadaten überleben den `coverageUnion`-Trim.

**Tech Stack:** TypeScript + `@supabase/supabase-js` (ungetypter Admin-Client), Next.js 15 App-Router (Server-Actions + Route-Handler), vitest (pure Units), Playwright (Prod-Smoke pro Finder-Surface).

---

## Global Constraints

- **`paket` NIE überschreiben (K3).** Weder DB-Spalte noch die 5 rohen Consumer (`istKontingentBlockiert` basic-Ausnahme, `calculate-lead-price.ts`, `admin/finance` MRR, `stripe/webhook`-Kontingent, `getSvStatus`/`sv-checkout`). Entitlement ist eine **separate Achse**. `istKontingentBlockiert` bleibt am **Billing**-Begriff (`paket === 'basic'`), NICHT am Ranking-Prädikat — sonst wird ein Pay-per-Lead-SV mit vollem Kontingent hart aus dem Dispatch gefiltert.
- **BEIDE Dispatch-Engines patchen (K4).** `matching-score.ts` `bewerteSvKandidat` (→ `findeBestePerson`/`findBestSV`) **UND** `src/app/api/sv-zuweisung/route.ts` (eigenständiger Sort, ruft `bewerteSvKandidat` NICHT). Die tote Dead-Copy `PAKET_PRIO`/`istKontingentBlockiert` in `src/lib/dispatch/findBestSV.ts` (nur test-referenziert) **nicht** anfassen und **nicht** als Score-Pfad missverstehen — `findBestSV` ist ein Thin-Wrapper auf die Engine.
- **Batch, nie per-Kandidat (K10).** Der Freundes-/Entitlement-Lookup wird **einmal pro Ranking-Call** vorgeladen (`Set<string>`), nie in einer Schleife pro Kandidat. `findBestSV`/`findeBestePerson` ist der teuerste Hot-Path (~1,2–1,8 s) — ein N+1-Read ist ein Perf-Regress.
- **Entitlement-Reads nur über service-role.** `sv_netzwerk_abonnements` ist authenticated-**SELECT-only auf die eigene Zeile** (P0). Ein RLS-Client sieht fremde SV-Abos als 0 Zeilen → `ladeZahlendeSvSet` **immer** mit einem `createAdminClient()`/service-role-Client aufrufen, nie mit dem User-RLS-Client.
- **`v_netzwerk_freunde` ist service-role-only** (P0, Definer-View umgeht RLS). `ladeFreundKandidatIds` läuft ausschließlich über den Admin-Client.
- **Umlaut-Pflicht (Frontend).** Nutzersichtbare Strings mit echten `ä/ö/ü/ß`: „Netzwerkpartner", „Aus Ihrem Netzwerk". Backend/Comments frei.
- **Server-Action-Pattern.** Neue/erweiterte Server-Actions liefern `{ ok: boolean; error?: string }` (kein `throw`-Mix); `revalidatePath` bei Writes.
- **Ratchets 0-neu:** `check:knip` (neue Files importiert), `check:component-set` (kein neues hand-rolled Button/Card — bestehende lokale `Chip`/`primitives`/`shared` reuse), `check:token-audit` (keine raw hex; `claimondo-*`-Tokens), `check:flag-drift` (P2 schreibt **keine** neuen enum-Literale, keine DDL — Snapshot unverändert). `tsc --noEmit` + `npm run build` grün.
- **Nie auf `main`.** Branch `kitta/aar-<nr>-netzwerk-p2-boost-badge`, PR gegen `staging`, nicht selbst mergen. DDL-frei (P2 ist reiner Consumer-Code).
- **prod-Ref = `paizkjajbuxxksdoycev`** (teilt DB mit staging). LIVE-Stripe auf staging → keine Zahl-Smokes; Verifikation via Read-Surface + Wegwerf-SV.
- Pflichtlektüre vor Start: `docs/superpowers/specs/2026-07-27-{netzwerk-oekosystem-epic-overview, hardening-und-koordination-vor-plaenen, implementierungs-roadmap-phasen}.md`, `2026-07-21-netzwerk-verbindungen-freundschaft-design.md` (§5/§6/§7.4), `2026-07-25-…-design.md` (§13b LOCKED), der P0-Plan `2026-07-28-netzwerk-p0-fundament.md`, `docs/fundament/FUNDAMENT.md` §1+§2, Marker `[[coordination-netzwerk-verbindungen-freemium-angebotsstruktur]]`.

---

## ⚠ C-Migration / Vorbedingungen (blockieren den START)

- **⚠ C-Migration: P0 (Fundament) MUSS gemergt sein.** P2 konsumiert `ladeZahlendeSvSet`/`istZahlenderNetzwerkPartner` (`src/lib/netzwerk/entitlement.ts`), `ladeFreundKandidatIds`/`ZIELROLLE_TO_ENTITY` (`src/lib/netzwerk/freunde.ts`), die Tabellen `sv_netzwerk_abonnements`/`v_netzwerk_freunde` und die Spalten `claims.netzwerk_owner_id`/`profiles.netzwerk_owner_id`. Ohne P0 → nichts baubar.
- **⚠ Koordination: `a8fc2a40` (Finder-Engine) gemergt.** `rank-vorschlaege.ts`/`ladeWerkstattVorschlaege`/`findWerkstattVorschlaegeFuer`/`vermittlung-server.ts` gehören dieser Lane — die **API erweitern, nicht neu bauen**. Nach deren Merge rebasen; `bewerteMarke` (#4649) nicht re-brechen.
- **⚠ C-Migration: P3-Seed (Owner-Bindung) ist NACHGELAGERT.** `claims.netzwerk_owner_id`/`profiles.netzwerk_owner_id` existieren (P0), werden aber erst in **P3** geseedet (`convertLeadToClaim` / `finalizeKundeSetup`). Die relationale „Dein Netzwerk"-Verdrahtung (Task 6) ist damit in P2 **datenseitig inert** (Owner = NULL → leeres Freund-Set → No-op), aber vollständig gebaut + getestet. Das ist gewollt: Mechanik in P2, Wirkung ab P3-Seed. In den Smoke-Berichten explizit vermerken.
- **⚠ Koordination: `PARTNER_RANG_MATCHING`-prod-Wert verifizieren.** Code-Default OFF (`matching.ts:196`). Der Wert bestimmt, ob `rangOrdinal` (die Fein-Sort **innerhalb** des Netzwerk-Buckets) überhaupt greift — muss VOR dem Score-Assert bekannt sein (Task 0).

---

## Finder-Surface-Boost-Matrix (K12 — pro Surface entschieden)

| # | Surface | Datei (Naht) | Ebene | zielRolle / Owner | Boost-Entscheid v1 |
|---|---|---|---|---|---|
| 1 | SV-Werkstatt-Finder (SV empfiehlt im Fall) | `src/app/gutachter/fall/[id]/_actions/werkstatt-empfehlung.ts` → `findWerkstattVorschlaegeFuer` | relational | `werkstatt` / **SV-Owner** (Session-SV, wenn zahlend) | **JA** — Task 6 |
| 2 | Kunde-Werkstatt-Finder (Selbstzahler/gebunden) | `src/app/kunde/faelle/[id]/werkstatt-finder-actions.ts` → `findQualifizierteReparaturWerkstaetten` | relational | `werkstatt` / **claim.netzwerk_owner** | **JA** — Task 6 |
| 3 | Empfehl-Batch (`empfehleWerkstaettenAlsGutachter`) | `.../werkstatt-empfehlung.ts` (Batch-Materialisierung) | — | — | **NEIN v1** — durch den immer-an-Netzwerk-Finder **abgelöst** (Epic §4 locked); Boost dockt am Live-Finder (Surface 1), nicht am Batch. |
| 4 | Gutachter-Finder / SV-Liste (`SvSlotAuswahl`) | `planeTerminOeffentlich` → `SvSlotAuswahl.tsx` | global | `gutachter` / SV = Kandidat | **global-Boost ranked die zahlenden Partner-SVs schon hoch (Task 3); Badge = Task 5.** Reverse-relationale „Dein Netzwerk"-SV-Sektion (Owner = Werkstatt/Flotte) = **v1-Teil**: die zahlenden Freund-SVs floaten über den globalen `W_NETZWERK`-Term; die *beschriftete* Sektion ist ein dünnes P-Follow-up (dokumentiert in Task 7). |
| — | Anon-Finder-Karte (`ladeAktiveSVs`/`FinderMap`) | `src/lib/actions/gutachter-finder-actions.ts` | global-Badge (+ K11-Seam) | kein Session-Owner | **Badge JA** (global „Netzwerkpartner"); relational nur bei **injiziertem** Owner (Makler-Attribution). v1: Makler = kein Graph-Knoten → Seam inert. Task 5 + Task 7. |

---

## Koordinations-Gates (blockieren den MERGE, nicht das Schreiben)

- **`a8fc2a40` Finder-Engine:** Task 6 erweitert `ladeWerkstattVorschlaege`/`findWerkstattVorschlaegeFuer`/`findQualifizierteReparaturWerkstaetten`. Vor Anfassen syncen, nach deren Merge rebasen.
- **`a6c863e2`/#4789 claims-RLS:** Task 6 liest (kein Write) `claims.netzwerk_owner_id` — additive Spalte aus P0, kein RLS-Change. Kein Konflikt, aber DDL-Reihenfolge war P0-Sache.
- **Score-Verhaltensänderung ist live-relevant:** Der `W_NETZWERK`-Swap ändert die SV-Reihung im **produktiven** Dispatch + öffentlichen Finder. `PARTNER_RANG_MATCHING`-Kontext (Task 0) + Regel-4-Smoke (Task 8) sind Merge-Voraussetzung.

---

## Task 0: Pre-Flight — Worktree, Rebase, Anker + Flag-Wert verifizieren (kein Merge-Deliverable)

**Files:** keine (Verifikation).

- [ ] **Schritt 1:** Frischen Worktree off staging (nach P0- + a8fc2a40-Merge): `node scripts/new-session-worktree.mjs aar-<nr>-netzwerk-p2-boost-badge staging`. `git log -1 origin/staging` == HEAD.

- [ ] **Schritt 2: P0-Fundament vorhanden?** (via Plugin `execute_sql`, prod-Ref):
```sql
select to_regclass('public.sv_netzwerk_abonnements') as abo,
       to_regclass('public.v_netzwerk_freunde')      as freunde,
       (select count(*) from information_schema.columns
         where table_schema='public' and table_name='claims' and column_name='netzwerk_owner_id') as claim_owner;
```
Erwartet: `abo` + `freunde` non-null, `claim_owner = 1`. Sonst → STOP, P0 nicht gemergt.

- [ ] **Schritt 3: P0-TS-Interfaces vorhanden?**
```bash
grep -n "export async function ladeZahlendeSvSet"      src/lib/netzwerk/entitlement.ts
grep -n "export async function istZahlenderNetzwerkPartner" src/lib/netzwerk/entitlement.ts
grep -n "export async function ladeFreundKandidatIds"  src/lib/netzwerk/freunde.ts
grep -n "export const ZIELROLLE_TO_ENTITY"             src/lib/netzwerk/freunde.ts
```
Erwartet: je 1 Treffer. Signaturen: `ladeZahlendeSvSet(admin, svIds: string[], now?: Date): Promise<Set<string>>`, `ladeFreundKandidatIds(admin, ownerProfilId: string, zielRolle: 'werkstatt'|'gutachter'): Promise<Set<string>>`.

- [ ] **Schritt 4: Boost-Anker frisch (dürfen sich seit Verifikation nicht bewegt haben):**
```bash
grep -n "return paketPrio \* W_PAKET" src/lib/termine/engine/matching-score.ts   # Score-Formel
grep -n "const rangAktiv = process.env.PARTNER_RANG_MATCHING" src/lib/termine/engine/matching.ts
grep -n "matchedCandidates.sort" src/app/api/sv-zuweisung/route.ts               # 2. Engine
grep -n "istTopPartner: candidate.paket" src/lib/sv-matching-modul/projection.ts # Badge
grep -n "svsLight = svs.map" src/app/embed/gutachter-finder/page.tsx             # coverageUnion-Trim
grep -rn "bewerteSvKandidat" src/ --include=*.ts | grep -v __tests__ | grep -v "matching-score.ts"
```
Erwartet: die ersten 5 je 1 Treffer; die letzte Zeile liefert **genau eine** Nicht-Test-Datei: `src/lib/termine/engine/matching.ts` (+ `index.ts`-Re-Export). Weitere Nicht-Test-Caller → Task 2/3 erweitern.

- [ ] **Schritt 5: `PARTNER_RANG_MATCHING`-prod-Wert klären.** Auf dem VPS (PM2-Env) prüfen bzw. bei Aaron erfragen, ob `PARTNER_RANG_MATCHING === '1'`. Ergebnis im PR-Body notieren: bestimmt, ob `rangOrdinal`·`W_RANG` (0/10/20) den Netzwerk-Bucket (0/100) **innerhalb** verfeinert. Invariante bleibt: `2·W_RANG (20) < W_NETZWERK (100)`.

---

## Task 1: Pure Boost-Partition `applyNetzwerkPraeferenz`

**Files:**
- Create: `src/lib/netzwerk/apply-netzwerk-praeferenz.ts`
- Test: `src/lib/netzwerk/__tests__/apply-netzwerk-praeferenz.test.ts`

**Interfaces:**
- Consumes: nichts (rein synchron, DB-frei — die Auflösung liegt beim Consumer, K10).
- Produces: `applyNetzwerkPraeferenz<T extends { id: string; qualifiziert: boolean }>(kandidaten: T[], freundKandidatIds: ReadonlySet<string>): (T & { imNetzwerk?: boolean })[]`. Konsumiert von Task 6/7.

- [ ] **Schritt 1: Failing Test schreiben** (`src/lib/netzwerk/__tests__/apply-netzwerk-praeferenz.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { applyNetzwerkPraeferenz } from '../apply-netzwerk-praeferenz'

type K = { id: string; qualifiziert: boolean; d: number }
const k = (id: string, qualifiziert: boolean, d: number): K => ({ id, qualifiziert, d })

describe('applyNetzwerkPraeferenz (pure Partition)', () => {
  it('leeres Freund-Set = No-op (Referenz unveraendert durchgereicht)', () => {
    const arr = [k('a', true, 1), k('b', true, 2)]
    expect(applyNetzwerkPraeferenz(arr, new Set())).toBe(arr)
  })
  it('1 qualifizierter Freund wandert nach oben + traegt imNetzwerk=true', () => {
    const out = applyNetzwerkPraeferenz([k('a', true, 1), k('b', true, 2)], new Set(['b']))
    expect(out.map((x) => x.id)).toEqual(['b', 'a'])
    expect(out[0].imNetzwerk).toBe(true)
    expect(out[1].imNetzwerk).toBeUndefined()
  })
  it('mehrere Freunde: stabile Reihenfolge in beiden Gruppen', () => {
    const out = applyNetzwerkPraeferenz(
      [k('a', true, 1), k('b', true, 2), k('c', true, 3), k('d', true, 4)],
      new Set(['b', 'd']),
    )
    expect(out.map((x) => x.id)).toEqual(['b', 'd', 'a', 'c'])
  })
  it('unqualifizierter Freund bleibt unten (Engine-qualifiziert schlaegt Freundschaft)', () => {
    const out = applyNetzwerkPraeferenz([k('a', true, 1), k('b', false, 2)], new Set(['b']))
    expect(out.map((x) => x.id)).toEqual(['a', 'b'])
    expect(out[1].imNetzwerk).toBeUndefined()
  })
  it('Owner-als-Kandidat: nicht im Freund-Set -> nicht geboostet', () => {
    const out = applyNetzwerkPraeferenz([k('owner', true, 1), k('b', true, 2)], new Set(['b']))
    expect(out.map((x) => x.id)).toEqual(['b', 'owner'])
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/apply-netzwerk-praeferenz.test.ts` → FAIL („applyNetzwerkPraeferenz is not a function").

- [ ] **Schritt 3: Implementieren** (`src/lib/netzwerk/apply-netzwerk-praeferenz.ts`, exakt Design §5.2):
```ts
// Netzwerk-Boost, Ebene 2 (relational). Reine, DB-freie Stable-Partition: qualifizierte
// Freunde des Owners nach oben, Reihenfolge INNERHALB beider Gruppen unveraendert
// ("Freund oben, Wahl frei", Design §5.2/§6). Die Owner-/Freund-Aufloesung (DB, batched)
// liegt beim Consumer (K10). Leeres Set -> exakt dieselbe Referenz zurueck (No-op).
export function applyNetzwerkPraeferenz<T extends { id: string; qualifiziert: boolean }>(
  kandidaten: T[],
  freundKandidatIds: ReadonlySet<string>,
): (T & { imNetzwerk?: boolean })[] {
  if (freundKandidatIds.size === 0) return kandidaten
  const freundeOben: (T & { imNetzwerk: true })[] = []
  const rest: T[] = []
  for (const k of kandidaten) {
    if (k.qualifiziert && freundKandidatIds.has(k.id)) freundeOben.push({ ...k, imNetzwerk: true })
    else rest.push(k)
  }
  return [...freundeOben, ...rest]
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/apply-netzwerk-praeferenz.test.ts` → PASS (5 grün).

- [ ] **Schritt 5: Commit** — `git add src/lib/netzwerk/apply-netzwerk-praeferenz.ts src/lib/netzwerk/__tests__/apply-netzwerk-praeferenz.test.ts && git commit -m "feat(netzwerk): applyNetzwerkPraeferenz pure partition (P2 T1)"`.

---

## Task 2: Global-Boost-Term in der puren Score-Formel (`matching-score.ts`)

**Files:**
- Modify: `src/lib/termine/engine/matching-score.ts` (`SvKandidatFeatures` + `bewerteSvKandidat`, ~Zeile 35–56)
- Modify: `src/lib/termine/engine/__tests__/matching-score.test.ts`
- Modify: `src/lib/termine/engine/__tests__/matching-parity.test.ts` (⚠ konstruiert `bewerteSvKandidat({ paket: … })` in Zeile 10–11 — bricht sonst tsc)

**Interfaces:**
- Consumes: nichts (pure).
- Produces: `export const W_NETZWERK = 100`; `SvKandidatFeatures` trägt jetzt `istNetzwerkpartner: boolean` **statt** `paket: string`; `bewerteSvKandidat(f)` = `(istNetzwerkpartner ? 1 : 0) * W_NETZWERK + (rangOrdinal ?? 0) * W_RANG - …`. Konsumiert von Task 3.

**⚠ K3:** `istKontingentBlockiert(paket, …)` bleibt **unverändert** (billing-Achse, `paket === 'basic'`). `PAKET_PRIO` bleibt exportiert (istKontingentBlockiert-Nachbar + Legacy-Tests), ist aber **kein** Score-Treiber mehr.

- [ ] **Schritt 1: Failing Test schreiben** — in `src/lib/termine/engine/__tests__/matching-score.test.ts` die `bewerteSvKandidat`-Fälle auf das neue Feature umstellen + neuen Assert ergänzen:
```ts
import { bewerteSvKandidat, W_NETZWERK, W_RANG } from '../matching-score'

const base = { kontingentGenutzt: 0, ablehnungen30d: 0, etaVomBueroMin: null, distanzKm: 0 }

it('Netzwerkpartner bekommt W_NETZWERK, Free bekommt 0', () => {
  const partner = bewerteSvKandidat({ ...base, istNetzwerkpartner: true })
  const free = bewerteSvKandidat({ ...base, istNetzwerkpartner: false })
  expect(partner - free).toBe(W_NETZWERK)
})

it('rangOrdinal verfeinert INNERHALB des Buckets, kreuzt ihn nie (2*W_RANG < W_NETZWERK)', () => {
  const partnerBronze = bewerteSvKandidat({ ...base, istNetzwerkpartner: true, rangOrdinal: 0 })
  const partnerGold = bewerteSvKandidat({ ...base, istNetzwerkpartner: true, rangOrdinal: 2 })
  const freeGold = bewerteSvKandidat({ ...base, istNetzwerkpartner: false, rangOrdinal: 2 })
  expect(partnerGold - partnerBronze).toBe(2 * W_RANG)     // 20 Fein-Sort
  expect(partnerBronze).toBeGreaterThan(freeGold)          // Bucket schlaegt jeden Rang
})

it('Distanz/Kontingent/Ablehnung wirken wie bisher (Vorzeichen negativ)', () => {
  const nah = bewerteSvKandidat({ ...base, istNetzwerkpartner: true, distanzKm: 5 })
  const fern = bewerteSvKandidat({ ...base, istNetzwerkpartner: true, distanzKm: 25 })
  expect(nah).toBeGreaterThan(fern)
})
```
(Alte `paket`-basierte `bewerteSvKandidat`-Fälle im File auf `istNetzwerkpartner` umschreiben; `PAKET_PRIO`/`istKontingentBlockiert`-Tests bleiben unverändert.)

**Zusätzlich** `src/lib/termine/engine/__tests__/matching-parity.test.ts` Zeile 10–11 anpassen (sonst tsc-Fehler): `{ paket: 'standard', … }` → `{ istNetzwerkpartner: false, … }`, `{ paket: 'premium', … }` → `{ istNetzwerkpartner: true, … }`. Die Parity-Aussage bleibt gültig (stark=95 > schwach=−25; Sticky +1000 dreht es weiterhin).

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/termine/engine/__tests__/matching-score.test.ts` → FAIL (`W_NETZWERK` undefined / Feld `istNetzwerkpartner` fehlt im Typ).

- [ ] **Schritt 3: Implementieren** — in `src/lib/termine/engine/matching-score.ts`:

  (a) Nach `export const W_PAKET = 100` die neue Konstante ergänzen:
```ts
// 13b LOCKED: das Netzwerkpartner-Abo loest paketPrio als Ranking-Primaertreiber ab
// (paket = Legacy-Fulfillment, kein Ranking). Binaerer Bucket: zahlender Netzwerkpartner
// (100) ueber Free (0). Gleiche Groesse wie W_PAKET, damit die Score-Skala stabil bleibt.
export const W_NETZWERK = 100
```

  (b) `SvKandidatFeatures`: `paket: string` **ersetzen** durch:
```ts
  /** 13b: zahlender Netzwerkpartner (aktives/comped Abo) > Free. Loest paketPrio ab (K3:
   *  paket bleibt Legacy-Fulfillment, NICHT im Score). Vom Caller batch-vorgeladen (K10). */
  istNetzwerkpartner: boolean
```

  (c) `bewerteSvKandidat` — die `paketPrio`-Zeile ersetzen:
```ts
export function bewerteSvKandidat(f: SvKandidatFeatures): number {
  const distanzPenalty = f.etaVomBueroMin != null ? f.etaVomBueroMin * W_ETA_MIN : f.distanzKm
  return (f.istNetzwerkpartner ? 1 : 0) * W_NETZWERK
    + (f.rangOrdinal ?? 0) * W_RANG
    - f.kontingentGenutzt * W_KONTINGENT_GENUTZT
    - f.ablehnungen30d * W_ABLEHNUNG
    - distanzPenalty
}
```
(Die `const paketPrio = PAKET_PRIO[f.paket] ?? 1`-Zeile entfällt. `PAKET_PRIO` + `istKontingentBlockiert` bleiben im File unverändert stehen.)

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/termine/engine/__tests__/matching-score.test.ts src/lib/termine/engine/__tests__/matching-parity.test.ts` → beide PASS. `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → grün (fängt einen etwaigen zweiten Nicht-Test-Caller aus Task 0 Schritt 4 sowie verbliebene `paket`-Konstruktionen).

- [ ] **Schritt 5: Commit** — `git add src/lib/termine/engine/matching-score.ts src/lib/termine/engine/__tests__/matching-score.test.ts && git commit -m "feat(netzwerk): W_NETZWERK global-boost term in bewerteSvKandidat (P2 T2)"`.

---

## Task 3: Engine-Caller `findeBestePerson` — Entitlement batch-vorladen (K10) + Feature threaden

**Files:**
- Modify: `src/lib/termine/engine/matching.ts` (Import ~Zeile 24; Score-Block ~Zeile 196–215)

**Interfaces:**
- Consumes: `ladeZahlendeSvSet` (P0, `src/lib/netzwerk/entitlement.ts`); `bewerteSvKandidat` neuer Shape (Task 2).
- Produces: nichts Neues (deckt transitiv Dispatch + `findBestSV`/`planeTerminOeffentlich` ab).

**⚠ K10:** genau **ein** `ladeZahlendeSvSet`-Call pro `findeBestePerson`-Aufruf, über die in-Gebiet-SV-Ids (`imGebiet`), analog zum bestehenden `getPartnerRangBatch`-Batch.

- [ ] **Schritt 1: Failing Test** — neuer Integrationstest `src/lib/termine/engine/__tests__/matching-netzwerk-boost.test.ts` mit gemocktem Supabase-Admin-Client (Muster wie bestehende Engine-Tests): zwei in-Gebiet-SVs, gleiche Distanz/Kontingent; SV `n` hat eine aktive `sv_netzwerk_abonnements`-Zeile, SV `f` nicht → `findeBestePerson({ nurVorschlag:true })` liefert `n` VOR `f`. (Mockt `sachverstaendige`, `sv_netzwerk_abonnements`, `mapboxEtaMatrix`, `freieSlots`.)

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/termine/engine/__tests__/matching-netzwerk-boost.test.ts` → FAIL (Reihenfolge `f` vor `n` bzw. tsc-Fehler: `paket` nicht mehr im Feature-Shape).

- [ ] **Schritt 3: Implementieren** — in `src/lib/termine/engine/matching.ts`:

  (a) Import ergänzen (bei den anderen `@/lib`-Imports):
```ts
import { ladeZahlendeSvSet } from '@/lib/netzwerk/entitlement'
```

  (b) Direkt nach dem `rangById`-Batch (Zeile ~197–199), einen zweiten Batch (K10):
```ts
  // Netzwerk-Boost (13b, Ebene 1): zahlende Netzwerkpartner unter den in-Gebiet-SVs
  // EINMAL vorladen (K10 — kein per-Kandidat-Read im Hot-Path). service-role: `db` ist hier
  // der Admin-Client (findeBestePerson defaultet auf createAdminClient); der User-RLS-Pfad
  // ruft findBestSV/planeTerminOeffentlich ohnehin service-role.
  const zahlendeSet = await ladeZahlendeSvSet(db, imGebiet.map((g) => g.sv.id as string))
```

  (c) Im `bewertet`-Map (Zeile ~215) den `bewerteSvKandidat`-Call anpassen — `paket` raus, `istNetzwerkpartner` rein:
```ts
    const istNetzwerkpartner = zahlendeSet.has(sv.id as string)
    const score = bewerteSvKandidat({
      istNetzwerkpartner,
      kontingentGenutzt, ablehnungen30d, etaVomBueroMin, distanzKm: g.distanzKm,
      rangOrdinal: rangById ? rangToOrdinal(rangById.get(sv.id as string)?.tier) : undefined,
    }) + stickyBonus + spezBonus
```
  (d) Optional Reason (nicht-leak-kritisch, nur intern): nach `reasons.push(\`Paket: ${paket}\`)`:
```ts
    if (istNetzwerkpartner) reasons.push('Netzwerkpartner')
```
  (Der lokale `const paket = sv.paket || 'standard'` **bleibt** — er speist `istKontingentBlockiert` (Zeile 178/204) + den `Paket:`-Reason. K3.)

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/termine/engine/__tests__/matching-netzwerk-boost.test.ts src/lib/termine/engine/__tests__/matching-parity.test.ts` → beide PASS (Parity darf nicht brechen: bei 0 Abo-Zeilen ist jeder SV `istNetzwerkpartner=false` → alle bekommen +0, relative Reihung wie vorher, wenn keine Netzwerkpartner existieren). `tsc --noEmit` grün.

- [ ] **Schritt 5: Commit** — `git add src/lib/termine/engine/matching.ts src/lib/termine/engine/__tests__/matching-netzwerk-boost.test.ts && git commit -m "feat(netzwerk): findeBestePerson batch-boosts Netzwerkpartner (P2 T3, K10)"`.

---

## Task 4: Zweite Engine `api/sv-zuweisung/route.ts` — „Netzwerkpartner zuerst" (K4)

**Files:**
- Modify: `src/app/api/sv-zuweisung/route.ts` (Import; Sort-Block ~Zeile 232–238)

**Interfaces:**
- Consumes: `ladeZahlendeSvSet` (P0).
- Produces: nichts (verhaltensändernder Sort).

**⚠ K4:** Diese Route ruft `bewerteSvKandidat` **nicht** — sie hat einen eigenen `matchedCandidates.sort` (schaden_match → partner_seit). Netzwerkpartner wird als **neuer Primär-Schlüssel** davorgesetzt. **⚠ K10:** ein Batch-Read über `matchedCandidates` (Kandidaten-Menge steht erst nach dem Umkreis-Filter fest).

- [ ] **Schritt 1: Failing Test** — Route-Handler-Test `src/app/api/sv-zuweisung/__tests__/route.netzwerk.test.ts` (Muster wie bestehende Route-Tests, gemockte `createClient`/`createAdminClient`): zwei Kandidaten im Umkreis, gleicher `schaden_match`, SV `n` zahlt / SV `f` nicht → `bestSv.id === 'n'`. (Falls kein Route-Test-Harness existiert: alternativ die Sort-Logik in eine pure `sortiereMitNetzwerk(cands, zahlendeSet)` extrahieren + die pure Funktion testen — bevorzugt, weil DB-frei.)

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/app/api/sv-zuweisung/__tests__/route.netzwerk.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren** — in `src/app/api/sv-zuweisung/route.ts`:

  (a) Import (bei den `@/lib`-Imports oben):
```ts
import { ladeZahlendeSvSet } from '@/lib/netzwerk/entitlement'
```
  (b) Direkt VOR `matchedCandidates.sort(...)` (Zeile ~232) den Batch (service-role — `sv_netzwerk_abonnements` ist per-User-RLS):
```ts
  // Netzwerk-Boost (K4/13b, Ebene 1): zahlende Netzwerkpartner zuerst. Eigener Sort-Algorithmus
  // dieser Route (kein bewerteSvKandidat). Batch EINMAL ueber die Umkreis-Kandidaten (K10);
  // Admin-Client, weil sv_netzwerk_abonnements per-User-RLS ist (der Staff-`db` saehe 0 Zeilen).
  const zahlendeSet = await ladeZahlendeSvSet(createAdminClient(), matchedCandidates.map((c) => c.id))
```
  (c) Den `sort`-Comparator um den Primär-Schlüssel erweitern:
```ts
  matchedCandidates.sort((a, b) => {
    const netz = Number(zahlendeSet.has(b.id)) - Number(zahlendeSet.has(a.id)) // Netzwerkpartner zuerst
    if (netz !== 0) return netz
    if (a.schaden_match !== b.schaden_match) return a.schaden_match ? -1 : 1
    const da = a.partner_seit ? new Date(a.partner_seit).getTime() : Infinity
    const dbt = b.partner_seit ? new Date(b.partner_seit).getTime() : Infinity
    return da - dbt
  })
```
  (⚠ die lokale Variable im alten Comparator hieß `db` und **verdeckte** den Supabase-`db` — hier auf `dbt` umbenannt, damit die Kollision offensichtlich vermieden ist.)
  (Der `community_member`-Round-Robin-Zweig (Zeile ~251–263) bleibt unverändert — Org-Routing ist orthogonal; der Netzwerk-Boost wirkt auf `bestSv = matchedCandidates[0]` im Nicht-Community-Pfad. Im PR vermerken.)

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/app/api/sv-zuweisung/__tests__/route.netzwerk.test.ts` → PASS. `tsc --noEmit` grün.

- [ ] **Schritt 5: Commit** — `git add src/app/api/sv-zuweisung && git commit -m "feat(netzwerk): sv-zuweisung reiht Netzwerkpartner zuerst (P2 T4, K4)"`.

---

## Task 5: Badge — `istTopPartner` ans Abo-Prädikat + „Netzwerkpartner"-Badge (K11-Trim-safe)

**Files:**
- Modify: `src/lib/sv-matching-modul/types.ts` (`ProjektionInput` + JSDoc `istTopPartner`)
- Modify: `src/lib/sv-matching-modul/projection.ts` (Zeile ~41)
- Modify: `src/lib/sv-matching-modul/__tests__/projection.test.ts`
- Modify: `src/lib/sv-matching-modul/plane-termin-oeffentlich.ts` (3 Projektions-Call-Sites + 1 Batch je Pfad)
- Modify: `src/lib/actions/gutachter-finder-actions.ts` (`AktiverSVPublic` + `ladeAktiveSVs`)
- Modify: `src/app/embed/gutachter-finder/_components/SvProfilePopup.tsx` (`SvProfileInhalt`)

**Interfaces:**
- Consumes: `ladeZahlendeSvSet` (P0).
- Produces: `OeffentlichesSvProfil.istTopPartner` = Netzwerkpartner-Signal (statt `paket≠basic`); `AktiverSVPublic.istNetzwerkpartner: boolean`. Live-Consumer: `api/v1/gutachter-termine/route.ts:129` (`ist_top_partner`) + `SvProfilePopup`.

**⚠ K11:** Neue Metadaten-Felder auf `AktiverSVPublic` überleben den `coverageUnion`-Trim automatisch — `src/app/embed/gutachter-finder/page.tsx:41` strippt **nur** `isochrone_polygon` (`const svsLight = svs.map(({ isochrone_polygon: _iso, ...rest }) => rest)`); alles andere reist in `...rest`. Kein Extra-Handling nötig, aber im Test/Smoke absichern.

- [ ] **Schritt 1: Failing Test (Projektion)** — `src/lib/sv-matching-modul/__tests__/projection.test.ts`: die `istTopPartner`-Fälle umstellen: `istTopPartner` folgt jetzt `input.istNetzwerkpartner`, NICHT `paket`:
```ts
it('istTopPartner = istNetzwerkpartner (Abo-Praedikat, nicht paket)', () => {
  const zahlt = toOeffentlichesSvProfil({ ...basisInput, istNetzwerkpartner: true }).istTopPartner
  const free = toOeffentlichesSvProfil({ ...basisInput, istNetzwerkpartner: false }).istTopPartner
  expect(zahlt).toBe(true)
  expect(free).toBe(false)
})
it('ohne istNetzwerkpartner (undefined) -> false (fail-closed, kein paket-Fallback)', () => {
  expect(toOeffentlichesSvProfil(basisInput).istTopPartner).toBe(false)
})
```
(`basisInput` = bestehender Test-Input; `candidate.paket='premium'` darf `istTopPartner` NICHT mehr auf `true` ziehen.)

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/sv-matching-modul/__tests__/projection.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren**

  (a) `types.ts` — `ProjektionInput` um ein Feld erweitern:
```ts
  /** 13b: zahlender Netzwerkpartner (Abo, aus ladeZahlendeSvSet). Loest die paket-basierte
   *  istTopPartner-Plakette ab. Vom Loader batch-gesetzt; fehlt er -> false (fail-closed). */
  istNetzwerkpartner?: boolean
```
  (b) `projection.ts` Zeile 41 — die paket-Ableitung ersetzen:
```ts
    // 13b LOCKED: „Netzwerkpartner"-Badge haengt am Abo-Praedikat, nicht an paket (K3).
    istTopPartner: input.istNetzwerkpartner === true,
```
  (c) `plane-termin-oeffentlich.ts` — in JEDEM der drei `toOeffentlichesSvProfil`-Aufrufe (Fixer ~252, Global ~281, Test-SV-Fallback ~313) das Feld setzen; je Pfad **einen** Batch (K10) direkt neben dem bestehenden `getPartnerRangBatch`:
```ts
    // Fixer- und Global-Pfad, je 1 Batch (candidate.svId == sachverstaendige.id):
    const zahlendeSet = await ladeZahlendeSvSet(admin, candidates.map((c) => c.svId))
    // …im Projektions-Objekt zusaetzlich:
    istNetzwerkpartner: zahlendeSet.has(cand.svId),
```
  Import oben: `import { ladeZahlendeSvSet } from '@/lib/netzwerk/entitlement'`. (Der Test-SV-Fallback-Pfad projiziert einen Test-SV — dort ist `zahlendeSet` leer → `istNetzwerkpartner:false`, korrekt.)

  (d) `gutachter-finder-actions.ts` — `AktiverSVPublic` um ein Feld ergänzen (nach `rangSinnsatz`):
```ts
  /** 13b: zahlender Netzwerkpartner (Abo-Praedikat). Global-Badge auf der Finder-Karte/Popup.
   *  Ueberlebt den coverageUnion-Trim (page.tsx strippt nur isochrone_polygon). */
  istNetzwerkpartner: boolean
```
  In `ladeAktiveSVs` den bestehenden `Promise.all`-Batch (Zeile ~190) um `ladeZahlendeSvSet(admin, svIds)` erweitern und im `mapped`-Objekt setzen:
```ts
  // im Promise.all zusaetzlich:
  ladeZahlendeSvSet(admin, svIds),
  // …und im mapped-Objekt:
  istNetzwerkpartner: zahlendeSvSet.has(r.id as string),
```
  Import: `import { ladeZahlendeSvSet } from '@/lib/netzwerk/entitlement'`.

  (e) `SvProfilePopup.tsx` — in `SvProfileInhalt` unter dem `PartnerRangBadge` (Zeile ~113) einen „Netzwerkpartner"-Chip rendern (reuse der **im File bereits vorhandenen** `Chip`-Komponente → kein neues hand-rolled Element, component-set-safe):
```tsx
      {sv.istNetzwerkpartner && <Chip strong>Netzwerkpartner</Chip>}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/sv-matching-modul/__tests__/projection.test.ts` → PASS. `tsc --noEmit` grün (fängt fehlende `istNetzwerkpartner`-Belegung an einem Projektions-Call-Site). `npm run build` grün (Route-Validator `api/v1/gutachter-termine` + Embed-Page).

- [ ] **Schritt 5: Commit** — `git add src/lib/sv-matching-modul src/lib/actions/gutachter-finder-actions.ts src/app/embed/gutachter-finder/_components/SvProfilePopup.tsx && git commit -m "feat(netzwerk): Netzwerkpartner-Badge am Abo-Praedikat statt paket (P2 T5, K11-trim-safe)"`.

---

## Task 6: Relationale „Dein Netzwerk"-Partition in die Werkstatt-Finder verdrahten (K10/K12)

**Files:**
- Create: `src/lib/netzwerk/resolve-netzwerk-owner.ts`
- Test: `src/lib/netzwerk/__tests__/resolve-netzwerk-owner.test.ts` (Owner-Präzedenz, pure Kern)
- Modify: `src/lib/werkstatt/matching/lade-vorschlaege.ts` (`ladeWerkstattVorschlaege` + `findWerkstattVorschlaegeFuer` um `ownerProfilId?`)
- Modify: `src/lib/werkstatt/vermittlung-server.ts` (`findQualifizierteReparaturWerkstaetten` um `ownerProfilId?`, Partition NACH `qualifiziereWerkstaetten`)
- Modify: `src/app/kunde/faelle/[id]/werkstatt-finder-actions.ts` (Owner aus dem Claim auflösen + durchreichen)
- Modify: `src/app/gutachter/fall/[id]/_actions/werkstatt-empfehlung.ts` (SV-Owner = Session-SV, wenn zahlend)

**Interfaces:**
- Consumes: `applyNetzwerkPraeferenz` (T1), `ladeFreundKandidatIds` (P0), `istZahlenderNetzwerkPartner` (P0).
- Produces: `resolveNetzwerkOwnerProfilId(admin, { claimId }): Promise<string | null>` (Claim-Owner → Kunden-Default → null). Werkstatt-Vorschläge tragen optional `imNetzwerk?: boolean`.

**⚠ K12-Positionierung:** `applyNetzwerkPraeferenz` läuft als **allerletzter** Schritt — NACH `rankeWerkstattVorschlaege` (Stack B) bzw. NACH `qualifiziereWerkstaetten` (Stack A: fit-Rang #4101 + `verifiziert`-Vorreihung #4125). So floaten die Freunde über die Extra-Reorderings, ohne sie zu zerstören (stabile Partition erhält die Rest-Reihung).
**⚠ K10:** ein `ladeFreundKandidatIds`-Call pro Finder-Aufruf (nicht pro Kandidat).
**⚠ C-Migration (P3-Seed):** bis P3 ist `claims.netzwerk_owner_id` NULL → Owner=null → Partition No-op (Task 1 garantiert exakt-Referenz-Durchreichen). Gebaut + getestet, wirkt ab P3.

- [ ] **Schritt 1: Failing Test (Owner-Resolver, pure Präzedenz)** — `src/lib/netzwerk/__tests__/resolve-netzwerk-owner.test.ts`: mit gemocktem Admin-Client: (a) `claims.netzwerk_owner_id` gesetzt → gewinnt; (b) Claim-Owner NULL, aber `profiles.netzwerk_owner_id` des `geschaedigter_user_id` gesetzt → Kunden-Default; (c) beide NULL → `null`.

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/resolve-netzwerk-owner.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren**

  (a) `src/lib/netzwerk/resolve-netzwerk-owner.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Netzwerk-Owner-Profil eines Claims (Design §8, WS-A verfeinert):
 * per-Claim (claims.netzwerk_owner_id) > Kunden-Default (profiles.netzwerk_owner_id) > null.
 * Liefert eine profiles.id (der Vermittler-/Owner-Knoten) — KEIN Entity-Id. admin = service-role.
 * ⚠ Bis zum P3-Seed sind beide Spalten NULL -> null (Boost-No-op, gewollt).
 */
export async function resolveNetzwerkOwnerProfilId(
  admin: SupabaseClient,
  input: { claimId: string },
): Promise<string | null> {
  const { data: claim } = await admin
    .from('claims')
    .select('netzwerk_owner_id, geschaedigter_user_id')
    .eq('id', input.claimId)
    .maybeSingle()
  const perClaim = (claim as { netzwerk_owner_id: string | null } | null)?.netzwerk_owner_id ?? null
  if (perClaim) return perClaim
  const kundeId = (claim as { geschaedigter_user_id: string | null } | null)?.geschaedigter_user_id ?? null
  if (!kundeId) return null
  const { data: prof } = await admin
    .from('profiles')
    .select('netzwerk_owner_id')
    .eq('id', kundeId)
    .maybeSingle()
  return (prof as { netzwerk_owner_id: string | null } | null)?.netzwerk_owner_id ?? null
}
```

  (b) `lade-vorschlaege.ts` — `ladeWerkstattVorschlaege`-Input um `ownerProfilId?: string | null`; nach `rankeWerkstattVorschlaege(...)` die Partition (Stack B):
```ts
import { applyNetzwerkPraeferenz } from '@/lib/netzwerk/apply-netzwerk-praeferenz'
import { ladeFreundKandidatIds } from '@/lib/netzwerk/freunde'
// …
  const vorschlaege = rankeWerkstattVorschlaege(kandidaten, kontext, input.limit)
  if (!input.ownerProfilId) return vorschlaege
  // K10: 1 Batch. Freund-Werkstatt-Ids (werkstaetten.id) des Owners.
  const freundIds = await ladeFreundKandidatIds(admin, input.ownerProfilId, 'werkstatt')
  // WerkstattVorschlag.passt = Engine-Qualifikation -> als `qualifiziert` durchreichen.
  return applyNetzwerkPraeferenz(
    vorschlaege.map((v) => ({ ...v, qualifiziert: v.passt })),
    freundIds,
  )
```
  In `findWerkstattVorschlaegeFuer(target, limit)` die Signatur um `ownerProfilId?` erweitern und an `ladeWerkstattVorschlaege({ …, ownerProfilId })` durchreichen. `WerkstattVorschlag` gewinnt die additiven Felder `qualifiziert?`/`imNetzwerk?` (Superset — bestehende Consumer bleiben kompatibel).

  (c) `vermittlung-server.ts` — `findQualifizierteReparaturWerkstaetten`-Input um `ownerProfilId?: string | null`; **nach** `qualifiziereWerkstaetten` (dem #4101/#4125-Reorder) partitionieren (Stack A):
```ts
  const { werkstaetten, keineSpezialisierte } = qualifiziereWerkstaetten(rows, bedarf)
  let final = werkstaetten
  if (input.ownerProfilId) {
    const freundIds = await ladeFreundKandidatIds(admin, input.ownerProfilId, 'werkstatt') // K10: 1 Batch
    // Qualifiziert<T>.fit: 'passt_nicht' zaehlt NICHT als qualifiziert (Design §5.2 — Engine-qualifiziert schlaegt Freundschaft).
    final = applyNetzwerkPraeferenz(
      werkstaetten.map((w) => ({ ...w, qualifiziert: w.fit !== 'passt_nicht' })),
      freundIds,
    )
  }
  return { werkstaetten: final, keineSpezialisierte, bedarf }
```
  Imports oben ergänzen (`applyNetzwerkPraeferenz`, `ladeFreundKandidatIds`).

  (d) `werkstatt-finder-actions.ts` (`ladeWerkstaettenFuerClaim`, Surface 2) — Owner auflösen (Service-Client) + durchreichen:
```ts
  const { createServiceClient } = await import('@/lib/supabase/server')
  const { resolveNetzwerkOwnerProfilId } = await import('@/lib/netzwerk/resolve-netzwerk-owner')
  const ownerProfilId = await resolveNetzwerkOwnerProfilId(createServiceClient(), { claimId })
  const { werkstaetten, keineSpezialisierte } = await findQualifizierteReparaturWerkstaetten({
    target: 'claim', id: claimId, nurEchte: true, ownerProfilId,
  })
```

  (e) `werkstatt-empfehlung.ts` (`empfehleWerkstaettenAlsGutachter`, Surface 1) — Owner = **Session-SV-Profil**, aber nur wenn der SV **zahlender** Netzwerkpartner ist (Gate am SV, Epic §1). Den Session-SV → `profiles.id` (via `sachverstaendige.profile_id`) auflösen, `istZahlenderNetzwerkPartner(admin, ownerProfilId)` prüfen; nur dann `ownerProfilId` an `findWerkstattVorschlaegeFuer` durchreichen, sonst `null` (kein Boost = normales Matching):
```ts
  // Owner = der empfehlende SV; Boost nur wenn er zahlt (Gate am SV, Epic §1).
  const ownerProfilId = svProfileId && (await istZahlenderNetzwerkPartner(admin, svProfileId))
    ? svProfileId : null
```
  (⚠ hier ist der Owner ein SV-Profil, das selbst zahlt — `istZahlenderNetzwerkPartner` erwartet eine `sachverstaendige.id`; die P0-Signatur nimmt `svId`. Beim Verdrahten prüfen, ob der Session-Kontext die `sachverstaendige.id` oder die `profiles.id` liefert, und `ladeFreundKandidatIds` mit der **profiles.id** (Owner-Knoten), `istZahlenderNetzwerkPartner` mit der **sachverstaendige.id** aufrufen — beide Ids am Call-Site verfügbar machen. Im PR dokumentieren.)

- [ ] **Schritt 4: Failing Test (Wire, Stack A)** — `src/lib/werkstatt/__tests__/vermittlung-netzwerk.test.ts`: gemockter Admin-Client, 3 aktive Werkstätten (alle `fit='passt'`), Owner mit Freund-Kante zur mittleren; `findQualifizierteReparaturWerkstaetten({…, ownerProfilId})` → die Freund-Werkstatt steht an Position 0 mit `imNetzwerk===true`; ohne `ownerProfilId` unverändert. Analog ein `lade-vorschlaege`-Test für Stack B.

- [ ] **Schritt 5: Test + tsc (PASS)** — `npx vitest run src/lib/netzwerk src/lib/werkstatt` → grün. `tsc --noEmit` grün.

- [ ] **Schritt 6: Commit** — `git add src/lib/netzwerk/resolve-netzwerk-owner.ts src/lib/netzwerk/__tests__/resolve-netzwerk-owner.test.ts src/lib/werkstatt src/app/kunde/faelle/\[id\]/werkstatt-finder-actions.ts src/app/gutachter/fall/\[id\]/_actions/werkstatt-empfehlung.ts && git commit -m "feat(netzwerk): Dein-Netzwerk-Partition in Werkstatt-Finder (P2 T6, K10/K12)"`.

---

## Task 7: Anon-Finder Owner-Injektions-Seam + `imNetzwerk`-Metadaten (K11)

**Files:**
- Modify: `src/lib/actions/gutachter-finder-actions.ts` (`ladeAktiveSVs` um `ownerProfilId?`; `AktiverSVPublic.imNetzwerk`)
- Modify: `src/app/embed/gutachter-finder/page.tsx` (Owner-Injektion aus Attribution, wenn vorhanden)
- Test: `src/lib/actions/__tests__/lade-aktive-svs-netzwerk.test.ts`

**Interfaces:**
- Consumes: `ladeFreundKandidatIds` (P0, `gutachter`), `ladeZahlendeSvSet` (P0).
- Produces: `AktiverSVPublic.imNetzwerk: boolean`. Owner wird **injiziert** (nicht session-abgeleitet).

**⚠ K11 (kern):** Der öffentliche Finder hat **keinen** `auth.uid()`-Owner. Ein Owner existiert nur bei **Attribution** (Makler-/Promotion-Code). Blanker `/gutachter-finden` → `ownerProfilId=null` → **kein** relationaler Boost (nur das globale Badge aus Task 5). **v1-Realität, explizit:** Makler sind **kein** Graph-Knoten (Design §2) → ein Makler-Owner hat 0 Freunde → `imNetzwerk` überall `false` (Seam korrekt, aber inert). Der Reverse-SV-Boost wird real, sobald ein Werkstatt-/Flotte-Owner injiziert wird (z.B. Werkstatt-QR-Einstieg). **Metadaten-Trim:** `imNetzwerk` reist in `...rest` (page.tsx:41 strippt nur `isochrone_polygon`) → überlebt.

- [ ] **Schritt 1: Failing Test** — `src/lib/actions/__tests__/lade-aktive-svs-netzwerk.test.ts`: gemockter Admin-Client, 2 verifizierte SVs; Owner-Freund + zahlend = SV `n`; `ladeAktiveSVs({ ownerProfilId })` → `n.imNetzwerk===true`, der andere `false`; ohne `ownerProfilId` → beide `false`. Zusatz-Assert: `n.isochrone_polygon`-Feld existiert im Loader-Output (der Trim passiert erst in page.tsx).

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/actions/__tests__/lade-aktive-svs-netzwerk.test.ts` → FAIL.

- [ ] **Schritt 3: Implementieren**

  (a) `AktiverSVPublic` um `imNetzwerk: boolean` (relational; getrennt vom globalen `istNetzwerkpartner` aus Task 5).

  (b) `ladeAktiveSVs` Signatur `ladeAktiveSVs(opts?: { ownerProfilId?: string | null })`. Nach dem bestehenden Enrichment (K10, ein Set-Schnitt):
```ts
  // K11: relationaler Boost NUR bei injiziertem Owner. Freund-SVs (sachverstaendige.id) des
  // Owners, geschnitten mit den zahlenden (Gate immer am SV). Ein Batch je Set.
  let netzSet = new Set<string>()
  if (opts?.ownerProfilId) {
    const [freundSvIds, zahlende] = await Promise.all([
      ladeFreundKandidatIds(admin, opts.ownerProfilId, 'gutachter'),
      ladeZahlendeSvSet(admin, svIds),
    ])
    netzSet = new Set([...freundSvIds].filter((id) => zahlende.has(id)))
  }
  // …im mapped-Objekt:
  imNetzwerk: netzSet.has(r.id as string),
```
  (Import `ladeFreundKandidatIds`; `ladeZahlendeSvSet` ist aus Task 5 schon importiert.)

  (c) `page.tsx` — Owner-Injektion aus Attribution, wenn vorhanden (v1 meist keiner). Falls die Embed-Page eine Makler-/Werkstatt-Attribution im `searchParams`/Context trägt (z.B. `?makler=` / QR-`werkstattId`), diese → `profiles.id` auflösen und als `ownerProfilId` an `ladeAktiveSVs` reichen; sonst `undefined`. **Kein** neuer Session-Read — rein injiziert. Kommentar setzen, dass v1 mangels Makler-Graph-Knoten meist inert ist. `svsLight`-Trim (Zeile 41) bleibt unverändert — `imNetzwerk` überlebt via `...rest`.

- [ ] **Schritt 4: Test + Build (PASS)** — `npx vitest run src/lib/actions/__tests__/lade-aktive-svs-netzwerk.test.ts` → PASS. `tsc --noEmit` + `npm run build` grün (Embed-Page ist Server-Component mit Route-Validator).

- [ ] **Schritt 5: Commit** — `git add src/lib/actions/gutachter-finder-actions.ts src/lib/actions/__tests__/lade-aktive-svs-netzwerk.test.ts src/app/embed/gutachter-finder/page.tsx && git commit -m "feat(netzwerk): anon-finder owner-injection seam + imNetzwerk (P2 T7, K11)"`.

---

## Task 8: Ratchets grün + Full-Gate + Regel-4-Smoke-Plan

**Files:** keine Code-Änderung (Verifikation + PR).

- [ ] **Schritt 1: 7-Punkte-Audit** je Commit dokumentiert (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression). Insbesondere: kein neues hand-rolled Button/Card (component-set), `Chip`-Reuse in `SvProfilePopup`, keine raw hex (token-audit), keine neuen enum-Writes (flag-drift unverändert).

- [ ] **Schritt 2: Voller Gate-Durchlauf:**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npm run build
npx vitest run src/lib/netzwerk src/lib/termine/engine src/lib/sv-matching-modul src/lib/werkstatt src/lib/actions src/app/api/sv-zuweisung
npm run check:knip -- --ratchet
npm run check:component-set -- --ratchet
npm run check:token-audit
npm run check:flag-drift -- --ratchet
```
Erwartet: alles grün / 0-neu. (flag-drift **muss** ohne Snapshot-Regen grün sein — P2 fügt keine Enums/DDL hinzu; ist es rot, wurde versehentlich ein Write-Literal eingeführt → beheben, nicht Baseline aufblähen.)

- [ ] **Schritt 3: PR gegen `staging`** mit Branch `kitta/aar-<nr>-netzwerk-p2-boost-badge`; Body enthält: `PARTNER_RANG_MATCHING`-prod-Wert (Task 0), die K12-Boost-Matrix-Entscheide, die P3-Seed-Inert-Notiz, und den Regel-4-Smoke-Plan (Schritt 4). **Nicht** selbst mergen; DDL-frei vermerken.

- [ ] **Schritt 4: Regel-4 — Prod-Smoke pro betroffener Finder-Surface** (nach Deploy; Wegwerf-SV seeden, `telefon=NULL`, LIVE-Stripe → nur comped/Read-Pfad, **keine** echte Charge; K15):

  **Vorbereitung (service-role, prod-Ref):** einen Wegwerf-SV `sv_smoke` auf eine aktive `sv_netzwerk_abonnements`-Zeile (`status='comped'`) setzen und einen zweiten `sv_free` ohne Abo — beide im selben Umkreis; optional eine `netzwerk_verbindungen`-`angenommen`-Kante Owner↔Werkstatt für Surface 2.

  | Surface | Flow (Playwright, `PLAYWRIGHT_BASE_URL=https://app.claimondo.de`) | Assertion |
  |---|---|---|
  | Global-Score (Dispatch) | Admin/Dispatch → Fall im `sv_smoke`+`sv_free`-Umkreis → „SV vorschlagen" | `sv_smoke` (Netzwerkpartner) rankt über `sv_free` bei sonst gleichem Score |
  | 2. Engine `POST /api/sv-zuweisung` | Auto-/Manual-Zuweisung eines Falls im gemeinsamen Umkreis | zugewiesener SV = `sv_smoke` (Netzwerkpartner zuerst) |
  | Badge (`api/v1/gutachter-termine`) | `GET /api/v1/gutachter-termine?plz=<sv_smoke-PLZ>` | `gutachter[].ist_top_partner=true` genau für `sv_smoke`, `false` für `sv_free` (nicht mehr paket-abhängig) |
  | Badge (Karte/Popup) | `/embed/gutachter-finder` → Pin `sv_smoke` klicken | „Netzwerkpartner"-Chip sichtbar; `imNetzwerk`/`istNetzwerkpartner` überlebt Client-Payload (kein `isochrone_polygon` im Netz-Response) |
  | Rel. Werkstatt (Surface 2) | Kunde-Portal, Reparatur-Claim ohne Werkstatt, `claims.netzwerk_owner_id` = Owner mit Freund-Werkstatt → Werkstatt-Finder | Freund-Werkstatt an Position 0 + „Aus Ihrem Netzwerk"-Marker; ohne Owner unverändert |
  | Rel. Werkstatt (Surface 1) | SV-Portal (zahlender `sv_smoke`), Fall → „Werkstatt empfehlen" mit einer Freund-Werkstatt | Freund-Werkstatt oben; Free-SV-Session → keine Partition |

  **⚠ P3-Seed-Inert:** Sind die Owner-Spalten prod noch NULL (P3 nicht deployed), die relationalen Surfaces (1/2) per **manuell geseedeter** `netzwerk_owner_id`/Freund-Kante auf dem Wegwerf-Claim smoken und im PR vermerken, dass der reguläre Seed erst P3 liefert. Rote Surface → Fix-PR, Task bleibt offen bis grün.

---

## Definition of Done (P2)

- **Ebene 1 (global):** `bewerteSvKandidat` nutzt `W_NETZWERK·istNetzwerkpartner` statt `paketPrio·W_PAKET`; `findeBestePerson` (→ Dispatch + `findBestSV` + `planeTerminOeffentlich`) UND `api/sv-zuweisung/route.ts` boosten Netzwerkpartner, jeweils **einmal batch-geladen** (K10). `paket` unangetastet (K3); `istKontingentBlockiert` unverändert.
- **Badge:** `istTopPartner` folgt dem Abo-Prädikat (1 Live-Consumer `api/v1/gutachter-termine` grün); „Netzwerkpartner"-Chip im `SvProfilePopup`; `AktiverSVPublic.istNetzwerkpartner`/`imNetzwerk` überleben den `coverageUnion`-Trim (K11).
- **Ebene 2 (relational):** `applyNetzwerkPraeferenz` läuft als letzter Schritt in beiden Werkstatt-Stacks (nach `rankeWerkstattVorschlaege` bzw. `qualifiziereWerkstaetten` #4101/#4125), Owner-aufgelöst + batched (K10/K12); anon-Finder-Owner-Seam gebaut (K11, v1 makler-inert dokumentiert).
- vitest grün (apply-praeferenz, matching-score, matching-boost, projection, resolve-owner, vermittlung-netzwerk, sv-zuweisung, lade-aktive-svs); `tsc` + `build` grün; alle Ratchets 0-neu; **keine** DDL/Enum-Änderung.
- PR gegen `staging`, `a8fc2a40`-rebased, nicht selbst gemergt.
- **Regel-4:** vollständiger Prod-Smoke pro betroffener Finder-Surface grün (oben); P3-Seed-Inert-Fälle explizit vermerkt.

---

## Self-Review (durchgeführt beim Schreiben)

1. **Spec-Coverage (Roadmap-P2-Zeile):** `applyNetzwerkPraeferenz` (relational) → T1+T6 ✓ · global-Boost in **beiden** Engines → T2/T3 (`matching-score`/`findeBestePerson`) + T4 (`sv-zuweisung`, K4) ✓ · `istTopPartner`→Entitlement (1 Consumer `api/v1/gutachter-termine`) → T5 ✓ · Owner-Injektion im anon Finder → T7 (K11) ✓ · Metadaten überleben `coverageUnion`-Trim → T5/T7 (`...rest`, page.tsx:41) ✓. **K3** (paket nie überschreiben, istKontingentBlockiert am Billing) → T2/T3-Notizen ✓ · **K4** (2 Engines, Dead-Copy nicht anfassen) → T4 + Global-Constraints ✓ · **K10** (batch) → T3/T4/T6/T7 je 1 Set-Load ✓ · **K11** (anon Owner-Injektion + Trim) → T7 ✓ · **K12** (4 Surfaces + 2 Reorderings) → Boost-Matrix + T6-Positionierung ✓.
2. **Placeholder-Scan:** keine TBD/„handle edge cases"; jede Änderung mit realem Code + realem Anker (Zeilen/Datei/Signatur frisch verifiziert 2026-07-28).
3. **Typ-Konsistenz:** `istNetzwerkpartner` (Score-Feature + ProjektionInput + AktiverSVPublic), `imNetzwerk` (Partition-Flag + AktiverSVPublic relational), `ladeZahlendeSvSet`/`ladeFreundKandidatIds`/`istZahlenderNetzwerkPartner` (P0-Signaturen), `applyNetzwerkPraeferenz<T extends {id,qualifiziert}>` — durchgängig; `Set<string>` überall; `resolveNetzwerkOwnerProfilId` liefert `profiles.id | null`.
4. **Bewusst NICHT in P2:** Bindungs-Seed (`convertLeadToClaim`/`finalizeKundeSetup` → P3), Provisions-Suppression (Release-Gate → P3), Vermittlungs-Flow/Sofort-Claim (→ P4), Freemium-Billing/Stripe-Recurring/Grandfather-Backfill (→ P5), beschriftete Reverse-„Dein Netzwerk"-SV-Sektion (global-Boost deckt v1; Label-Sektion späteres Follow-up), Empfehl-Batch-Boost (abgelöst, Epic §4).
