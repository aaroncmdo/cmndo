# autounfall.io PSEO Lokal-Content + Indexierung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede der 100 autounfall.io-PSEO-Seiten (`kfz-unfall/[stadt]/[typ]`) bekommt einen unikaten, belegten Lokal-Block je Stadt; danach wird `noindex` → indexierbar geflippt — **rein additiv** (nichts gelöscht) über ein default-off Flag.

**Architecture:** Neues handgeschriebenes Modul `content/pseo-local.ts` (20 Städte, je Intro + belegte Fakten) wird additiv in den unveränderten Renderer gerendert. Ein default-off Flag `content/pseo-indexable.mjs` (Single Source of Truth, von TS + `.mjs`-Scripts lesbar) steuert Indexierung; `page.tsx`/`sitemap.ts`/`smoke.mjs` lesen es. Der Generator (`port-pseo.py`, `pseo-data.generated.ts`) bleibt unangetastet. Ein neues Jaccard-Script ist das Duplicate-Gate (max < 0,40).

**Tech Stack:** Next.js 16.2.1, React 19, TypeScript 5, dependency-freie Node-`.mjs`-Scripts (node fetch ≥20).

**Spec:** `docs/superpowers/specs/2026-05-26-autounfall-pseo-unique-content-design.md`

**Branch/Worktree:** `kitta/au-pseo-lokal-content` (Basis `origin/staging`), Worktree `.claude/worktrees/au-pseo-lokal-content/`. PRs gegen `staging`. **Niemals auf `staging`/`main` direkt pushen.**

**Arbeitsverzeichnis aller Pfade unten:** `autounfall-io/` (Standalone-App). `npm`-Befehle in `autounfall-io/` ausführen.

---

## File Structure

| Datei | Rolle | PR |
|---|---|---|
| `content/pseo-indexable.mjs` (neu) | Single Source of Truth: `PSEO_INDEXABLE` Flag (default `false`) | PR1 |
| `content/pseo-indexable.d.mts` (neu) | TS-Typdeklaration für das `.mjs` (Import in page/sitemap) | PR1 |
| `content/pseo-local.ts` (neu) | 20 Stadt-Blöcke: `intro` + belegte `facts` (`quelle` Pflicht) | PR1 |
| `app/kfz-unfall/[stadt]/[typ]/page.tsx` (mod) | additive `<section>` Lokales + `robots.index` liest Flag | PR1 |
| `app/sitemap.ts` (mod) | PSEO-Routen flag-konditioniert ergänzen | PR1 |
| `scripts/smoke.mjs` (mod) | PSEO-Sample flag-konditioniert in INDEXABLE/NOINDEX | PR1 |
| `scripts/check-pseo-similarity.mjs` (neu) | Jaccard-Gate über 100 Seiten (max < 0,40) | PR1 |
| `package.json` (mod) | npm-Script `check:pseo-similarity` | PR1 |
| `DEPLOY.md` (mod) | additive Notiz „PSEO seit <Datum> indexiert" | PR2 |

**Additiv-Invariante:** Bei `PSEO_INDEXABLE=false` (PR1) ist das Verhalten **bitidentisch** zum Status quo (PSEO bleibt noindex, Sitemap unverändert, Smoke erwartet noindex). Keine bestehende Zeile/Funktion wird gelöscht.

---

## Task 1: Index-Gate-Flag (default off)

**Files:**
- Create: `content/pseo-indexable.mjs`
- Create: `content/pseo-indexable.d.mts`

- [ ] **Step 1: Flag-Modul anlegen**

`content/pseo-indexable.mjs`:
```js
// Single Source of Truth für den PSEO-Index-Gate (WP-5).
// Von TS (page.tsx/sitemap.ts) UND dependency-freien .mjs-Scripts (smoke) lesbar.
// PR1: false = heutiges noindex bleibt. PR2-Flip: auf true setzen.
export const PSEO_INDEXABLE = false
```

- [ ] **Step 2: TS-Typdeklaration anlegen**

`content/pseo-indexable.d.mts`:
```ts
export declare const PSEO_INDEXABLE: boolean
```

- [ ] **Step 3: Typecheck (Modul allein bricht nichts)**

Run (in `autounfall-io/`): `npm run typecheck`
Expected: PASS (keine neuen Fehler)

- [ ] **Step 4: Commit**

```bash
git add content/pseo-indexable.mjs content/pseo-indexable.d.mts
git commit -m "feat(au-pseo): add default-off PSEO_INDEXABLE gate (single source of truth)"
```

---

## Task 2: Datenmodell `pseo-local.ts` (Gerüst + 1 Beispiel-Stadt)

Erst Typen + Struktur + EINE Stadt als Qualitäts-Anker. Die restlichen 19 Städte kommen in Task 8 (nach Renderer + Gate, damit das Gate sie misst).

**Files:**
- Create: `content/pseo-local.ts`

- [ ] **Step 1: Modul mit Typen + Düsseldorf als Anker anlegen**

`content/pseo-local.ts`:
```ts
// HANDGESCHRIEBEN — nicht generiert (anders als pseo-data.generated.ts).
// Lokal-Content je PSEO-Stadt (WP-5-Gate). Keys = PSEO_CITY_SLUGS.
// HARTE REGEL: jeder Fakt MUSS eine quelle tragen; Schätzungen als "ca." labeln.
export type LocalFact = {
  label: string
  value: string
  quelle: string
  url?: string
}
export type PseoLocal = {
  /** 2-4 Sätze echter Lokal-Kontext, additiv zum Template. */
  intro: string
  /** 3-5 belegte Fakten. */
  facts: LocalFact[]
}

export const PSEO_LOCAL: Record<string, PseoLocal> = {
  // ILLUSTRATIVER Anker — Werte bei Ausführung gegen die zitierte Quelle
  // verifizieren (Live-Recherche), NICHT ungeprüft übernehmen.
  duesseldorf: {
    intro:
      'Düsseldorf bündelt als Landeshauptstadt mit rund 619.000 Einwohnern und 285.000 zugelassenen Pkw einen der dichtesten Verkehrsräume Nordrhein-Westfalens. A46, A52 und A57 sowie der innerstädtische Rheinufer-Verkehr prägen das lokale Unfallgeschehen.',
    facts: [
      { label: 'Unfallschwerpunkte', value: 'Autobahnkreuz Düsseldorf-Süd (A46/A59) sowie der Zubringer Kennedydamm/A52', quelle: 'Unfallatlas der Statistischen Ämter des Bundes und der Länder', url: 'https://unfallatlas.statistikportal.de/' },
      { label: 'Zuständige Gerichte', value: 'Amtsgericht Düsseldorf (Streitwert bis 5.000 €), darüber Landgericht Düsseldorf', quelle: 'Justizportal NRW', url: 'https://www.justiz.nrw' },
      { label: 'Sachverständigen-Dichte', value: 'ca. 31 BVSK-zertifizierte Kfz-Sachverständige im Großraum (geschätzt)', quelle: 'BVSK-Verbandsverzeichnis 2024' },
    ],
  },
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add content/pseo-local.ts
git commit -m "feat(au-pseo): add pseo-local data model + Duesseldorf anchor block"
```

---

## Task 3: Renderer — additive Lokales-Section + robots liest Flag

**Files:**
- Modify: `app/kfz-unfall/[stadt]/[typ]/page.tsx`

- [ ] **Step 1: Imports ergänzen (oben bei den anderen Imports)**

```tsx
import { PSEO_LOCAL } from '@/content/pseo-local'
import { PSEO_INDEXABLE } from '@/content/pseo-indexable.mjs'
```

- [ ] **Step 2: `robots` in `generateMetadata` auf das Flag umstellen**

Ersetze in `generateMetadata` die Zeile
```tsx
    // VERBINDLICH (WP-5): noindex bis unikater Lokal-Content. follow bleibt an.
    robots: { index: false, follow: true },
```
durch (Flag-gesteuert; bei `false` identisch zu vorher):
```tsx
    // WP-5: noindex bis Lokal-Content je Stadt steht; gesteuert über PSEO_INDEXABLE.
    robots: { index: PSEO_INDEXABLE, follow: true },
```

- [ ] **Step 3: Lokales-Section additiv einfügen**

In der Komponente `PseoPage`, nach `const meta = pseoMeta(page)` o.ä. (im Daten-Setup) ergänzen:
```tsx
  const local = PSEO_LOCAL[stadt]
```
Dann als **neue Sibling-`<section>`** unmittelbar nach dem schließenden `</div>` des primären `<div className="article-prose">` (vor dem Inline-CTA-`<aside>`) einfügen:
```tsx
        {local ? (
          <section className="article-prose mt-10">
            <h2>Lokales · {city.name}</h2>
            <p>{local.intro}</p>
            <ul>
              {local.facts.map((f) => (
                <li key={f.label}>
                  <strong>{f.label}:</strong> {f.value}{' '}
                  <span className="text-au-muted">
                    (
                    {f.url ? (
                      <a href={f.url} rel="noopener" target="_blank">
                        {f.quelle}
                      </a>
                    ) : (
                      f.quelle
                    )}
                    )
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
```

- [ ] **Step 4: Build (SSG, Next 16 Validatoren) + Typecheck**

Run: `npm run build && npm run typecheck`
Expected: Build grün, 100 `kfz-unfall`-Routen prerendered, tsc PASS.
(Bei Import-Auflösungsfehler für `@/content/pseo-indexable.mjs`: auf relativen Import `../../../../content/pseo-indexable.mjs` ausweichen bzw. `moduleResolution` in `tsconfig.json` prüfen — Ziel: `.mjs`+`.d.mts` wird aufgelöst.)

- [ ] **Step 5: Sichtprüfung — Düsseldorf zeigt Block, andere nicht (noch)**

Run: `npm run start` (Hintergrund) dann
`SMOKE_BASE_URL=http://127.0.0.1:3002 node -e "fetch('http://127.0.0.1:3002/kfz-unfall/duesseldorf/auffahrunfall').then(r=>r.text()).then(t=>console.log(t.includes('Lokales · Düsseldorf')?'OK block':'NO block', /name=\"robots\"[^>]*noindex/i.test(t)?'noindex (erwartet)':'INDEXIERT!'))"`
Expected: `OK block` + `noindex (erwartet)` (Flag ist false).

- [ ] **Step 6: Commit**

```bash
git add "app/kfz-unfall/[stadt]/[typ]/page.tsx"
git commit -m "feat(au-pseo): render additive Lokales section + robots reads PSEO_INDEXABLE"
```

---

## Task 4: Sitemap — PSEO-Routen flag-konditioniert

**Files:**
- Modify: `app/sitemap.ts`

- [ ] **Step 1: Flag + PSEO-Params importieren (oben)**

```ts
import { PSEO_INDEXABLE } from '@/content/pseo-indexable.mjs'
import { getPseoParams } from '@/lib/pseo'
```

- [ ] **Step 2: Flag-konditionierte PSEO-Routen ergänzen**

Vor dem `return [...]` ergänzen:
```ts
  // WP-5: PSEO-Routen erscheinen erst nach dem Flip (PSEO_INDEXABLE).
  const pseoRoutes: MetadataRoute.Sitemap = PSEO_INDEXABLE
    ? getPseoParams().map(({ stadt, typ }) => ({
        url: `${SITE.url}/kfz-unfall/${stadt}/${typ}`,
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }))
    : []
```
und im `return` additiv anhängen:
```ts
  return [...staticRoutes, ...articleRoutes, ...decoderRoutes, ...restRoutes, ...pseoRoutes]
```

- [ ] **Step 3: Build + verify (Flag false → Sitemap unverändert)**

Run: `npm run build && npm run start` (Hintergrund), dann
`node -e "fetch('http://127.0.0.1:3002/sitemap.xml').then(r=>r.text()).then(t=>console.log('kfz-unfall im sitemap:', (t.match(/kfz-unfall/g)||[]).length))"`
Expected: `kfz-unfall im sitemap: 0` (Flag false → keine PSEO-URLs).

- [ ] **Step 4: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat(au-pseo): flag-conditioned PSEO routes in sitemap (off until flip)"
```

---

## Task 5: Smoke — PSEO-Sample flag-konditioniert

**Files:**
- Modify: `scripts/smoke.mjs`

- [ ] **Step 1: Flag importieren (nach den Helper-Defs, oben im File)**

```js
import { PSEO_INDEXABLE } from '../content/pseo-indexable.mjs'
```

- [ ] **Step 2: Flag-abgeleitete Listen ergänzen (Literale bleiben unangetastet)**

Die bestehenden `INDEXABLE`/`NOINDEX`-Array-Literale **nicht anfassen** — auch die PSEO-Zeile `['/kfz-unfall/koeln/auffahrunfall', 'PSEO']` bleibt im `NOINDEX`-Literal stehen. Stattdessen **additiv** abgeleitete Listen nach den Literalen definieren:
```js
const PSEO_PREFIX = '/kfz-unfall/'
// Bei Flip (Flag true): PSEO raus aus noindex-Erwartung, rein in indexierbar-Erwartung.
const NOINDEX_ACTIVE = PSEO_INDEXABLE ? NOINDEX.filter(([p]) => !p.startsWith(PSEO_PREFIX)) : NOINDEX
const INDEXABLE_ACTIVE = PSEO_INDEXABLE ? [...INDEXABLE, ['/kfz-unfall/koeln/auffahrunfall', 'PSEO']] : INDEXABLE
```
Dann die beiden Prüf-Schleifen auf die abgeleiteten Listen zeigen lassen:
- `for (const [path, label] of INDEXABLE)` → `... of INDEXABLE_ACTIVE)`
- `for (const [path, label] of NOINDEX)` → `... of NOINDEX_ACTIVE)`

Bei Flag `false` sind `*_ACTIVE` identisch zu den Originalen → Verhalten unverändert. Keine Assertion-/Fixture-Zeile gelöscht. `/unfall-assistance` bleibt unverändert im `NOINDEX`-Literal.

- [ ] **Step 3: Smoke gegen lokalen Build (Flag false → PSEO noindex erwartet)**

Run: `npm run build && npm run start` (Hintergrund), dann
`SMOKE_BASE_URL=http://127.0.0.1:3002 npm run smoke`
Expected: alle PASS; PSEO-Sample wird unter „noindex-Routen" geprüft und ist noindex.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.mjs
git commit -m "feat(au-pseo): smoke reads PSEO_INDEXABLE for PSEO sample bucket"
```

---

## Task 6: Jaccard-Gate-Script

**Files:**
- Create: `scripts/check-pseo-similarity.mjs`
- Modify: `package.json`

- [ ] **Step 1: Script anlegen**

`scripts/check-pseo-similarity.mjs`:
```js
#!/usr/bin/env node
// autounfall.io · PSEO Duplicate-Content-Gate (WP-5). Dependency-frei (node fetch >=20).
// Misst paarweise Jaccard (3-Wort-Shingles) über die 100 gerenderten PSEO-Seiten.
// Gate: max < THRESHOLD (default 0.40). Exit 1 wenn verletzt (CI-tauglich).
//
//   1) npm run build && npm run start    (Server auf :3002)
//   2) node scripts/check-pseo-similarity.mjs [baseUrl]
//      SMOKE_BASE_URL=http://127.0.0.1:3002 node scripts/check-pseo-similarity.mjs
//
// Methode bewusst dokumentiert (das ursprüngliche 0,61 stammt aus der gitignored
// Prototyp-Analyse; dieses Script re-etabliert die Metrik als kanonisches Gate).
const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '')
const THRESHOLD = Number(process.env.PSEO_JACCARD_MAX || '0.40')

// Slugs = port-pseo.py CITY_SLUGS / TYPE_SLUGS (stabil, 20x5).
const CITY_SLUGS = ['berlin','bielefeld','bochum','bonn','bremen','dortmund','dresden','duesseldorf','duisburg','essen','frankfurt','hamburg','hannover','koeln','leipzig','muenchen','muenster','nuernberg','stuttgart','wuppertal']
const TYPE_SLUGS = ['auffahrunfall','parkplatzunfall','spurwechsel','vorfahrtsverletzung','wildunfall']

function visibleText(html) {
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0]
  return main
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .toLowerCase()
    .replace(/[^a-zäöüß0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}
function shingles(tokens, n = 3) {
  const s = new Set()
  for (let i = 0; i + n <= tokens.length; i++) s.add(tokens.slice(i, i + n).join(' '))
  return s
}
function jaccard(a, b) {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}
async function main() {
  const pages = []
  for (const c of CITY_SLUGS) {
    for (const t of TYPE_SLUGS) {
      const url = `${BASE}/kfz-unfall/${c}/${t}`
      const res = await fetch(url, { headers: { 'user-agent': 'au-jaccard/1.0' } })
      if (res.status !== 200) { console.error(`FAIL ${url} -> HTTP ${res.status}`); process.exit(1) }
      pages.push({ key: `${c}/${t}`, sh: shingles(visibleText(await res.text())) })
    }
  }
  let max = 0, sum = 0, count = 0
  const top = []
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const sim = jaccard(pages[i].sh, pages[j].sh)
      sum += sim; count++
      if (sim > max) max = sim
      top.push({ a: pages[i].key, b: pages[j].key, sim })
    }
  }
  top.sort((x, y) => y.sim - x.sim)
  console.log(`Pairs: ${count}  mean=${(sum / count).toFixed(3)}  max=${max.toFixed(3)}  threshold=${THRESHOLD}`)
  console.log('Top-10 Kollisionen:')
  for (const p of top.slice(0, 10)) console.log(`  ${p.sim.toFixed(3)}  ${p.a}  ~  ${p.b}`)
  if (max >= THRESHOLD) { console.error(`\nGATE ROT: max ${max.toFixed(3)} >= ${THRESHOLD}`); process.exit(1) }
  console.log(`\nGATE GRÜN: max ${max.toFixed(3)} < ${THRESHOLD}`)
}
main()
```

- [ ] **Step 2: npm-Script ergänzen**

In `package.json` `scripts` additiv:
```json
    "check:pseo-similarity": "node scripts/check-pseo-similarity.mjs",
```

- [ ] **Step 3: Commit**

```bash
git add scripts/check-pseo-similarity.mjs package.json
git commit -m "feat(au-pseo): add Jaccard duplicate-content gate script (max<0.40)"
```

---

## Task 7: Baseline messen (das Gate MUSS jetzt rot sein)

Beweist, dass das Gate Duplicate-Content erkennt (nur 1 Stadt hat Lokal-Content → 19 sind noch Near-Duplicates).

**Files:** keine (Messung)

- [ ] **Step 1: Build + Server + Messung**

Run: `npm run build && npm run start` (Hintergrund), dann
`SMOKE_BASE_URL=http://127.0.0.1:3002 npm run check:pseo-similarity`
Expected: **GATE ROT**, `max` hoch (~0,55–0,65), Top-Kollisionen = gleicher Typ über verschiedene Städte (z.B. `berlin/auffahrunfall ~ bremen/auffahrunfall`).

- [ ] **Step 2: Baseline notieren**

Schreibe `max`/`mean` in `docs/26.05.2026/pseo-jaccard-baseline.md` (neu, additiv) als Vorher-Wert.

- [ ] **Step 3: Commit**

```bash
git add docs/26.05.2026/pseo-jaccard-baseline.md
git commit -m "docs(au-pseo): record pre-content Jaccard baseline (gate red)"
```

---

## Task 8: 19 verbleibende Stadt-Blöcke recherchieren + autoren

Der inhaltliche Kern. Pro Stadt: Live-Recherche echter, belegbarer Fakten → `intro` (2-4 Sätze) + 3-5 `facts` mit Pflicht-`quelle`. Düsseldorf (Task 2) ist der Qualitäts-Anker.

**Städte (19):** berlin, bielefeld, bochum, bonn, bremen, dortmund, dresden, duisburg, essen, frankfurt, hamburg, hannover, koeln, leipzig, muenchen, muenster, nuernberg, stuttgart, wuppertal.

**Quellen-Standard (HART):**
- Erlaubt: Unfallatlas (unfallatlas.statistikportal.de), Destatis, Landesjustizportale (reale Amts-/Landgerichte), KBA, BVSK-Verzeichnis, städtische Statistikämter, seriöse lokale Verkehrsmeldungen.
- **Kein Fakt ohne `quelle`.** Zahlen, die nicht hart belegbar sind, als „ca./geschätzt" labeln.
- Keine erfundenen Aktenzeichen, Statistiken oder Gerichtsnamen.

**Files:**
- Modify: `content/pseo-local.ts`

- [ ] **Step 1: Pro Stadt recherchieren + Block schreiben**

Für jede der 19 Städte einen Eintrag wie der Düsseldorf-Anker ergänzen (gleiche `PseoLocal`-Struktur). Beispiel-Bauplan je Stadt:
- `intro`: Einwohner/Pkw-Dichte + 1-2 reale lokale Verkehrs-Charakteristika (Autobahnen, Topografie, Wild-Korridore bei kleineren Städten).
- `facts`: (a) Unfallschwerpunkt(e) [Unfallatlas], (b) zuständige Gerichte [Justizportal], (c) SV-Dichte „ca." [BVSK], optional (d) Fahrzeugbestand/Besonderheit.

> Recherche-Disziplin: jeden Fakt gegen die zitierte Quelle prüfen, bevor er eingetragen wird. Die Blöcke gehen anschließend zu Aarons Review (PR1).

- [ ] **Step 2: Vollständigkeit prüfen — alle 20 Städte vorhanden**

Run (in `autounfall-io/`):
```bash
node --input-type=module -e "import {readFileSync} from 'node:fs'; const t=readFileSync('content/pseo-local.ts','utf8'); const slugs=['berlin','bielefeld','bochum','bonn','bremen','dortmund','dresden','duesseldorf','duisburg','essen','frankfurt','hamburg','hannover','koeln','leipzig','muenchen','muenster','nuernberg','stuttgart','wuppertal']; const missing=slugs.filter(s=>!t.includes(s+': {')); console.log(missing.length ? ('FEHLT: '+missing.join(',')) : 'ALLE 20 vorhanden')"
```
Expected: `ALLE 20 vorhanden` (prüft je Stadt-Key `<slug>: {` im File — kein Regex-Escaping, keine .ts-Import-Falle)

- [ ] **Step 3: Typecheck + Build**

Run: `npm run typecheck && npm run build`
Expected: PASS, 100 Routen prerendered.

- [ ] **Step 4: Commit**

```bash
git add content/pseo-local.ts
git commit -m "feat(au-pseo): research + author local blocks for remaining 19 cities"
```

---

## Task 9: Gate grün — Jaccard < 0,40

**Files:** keine (Messung) / ggf. `content/pseo-local.ts` nachschärfen

- [ ] **Step 1: Re-Messung**

Run: `npm run build && npm run start` (Hintergrund), dann
`SMOKE_BASE_URL=http://127.0.0.1:3002 npm run check:pseo-similarity`
Expected: **GATE GRÜN**, `max < 0,40`.

- [ ] **Step 2: Falls noch rot — nachschärfen**

Wenn `max >= 0,40`: Top-Kollisionspaare ansehen. Meist gleicher Typ über zwei Städte → den jeweiligen Stadt-`intro`/`facts` distinktiver machen (mehr stadt-spezifische, belegte Details). Innerhalb-einer-Stadt-Kollision → Contingency aus Spec §4.4 (ein zusätzlicher dynamischer Stadt×Typ-Satz, additiv) erwägen. Dann Step 1 wiederholen.

- [ ] **Step 3: Ergebnis dokumentieren**

`docs/26.05.2026/pseo-jaccard-baseline.md` um Nachher-Wert ergänzen (additiv).

- [ ] **Step 4: Commit**

```bash
git add docs/26.05.2026/pseo-jaccard-baseline.md
git commit -m "docs(au-pseo): record post-content Jaccard (gate green, max<0.40)"
```

---

## Task 10: PR1-Verifikation + PR öffnen (gegen `staging`)

**Files:** keine (Verifikation)

- [ ] **Step 1: Voller Audit-Lauf**

Run (in `autounfall-io/`):
```bash
npm run build && npm run typecheck && npm run check:contrast
npm run start &   # Hintergrund
SMOKE_BASE_URL=http://127.0.0.1:3002 npm run smoke
SMOKE_BASE_URL=http://127.0.0.1:3002 npm run check:pseo-similarity
```
Expected: Build grün, tsc PASS, Kontrast 0/0-Fails, Smoke alle PASS (PSEO **noindex**, da Flag false), Jaccard **GRÜN**.

- [ ] **Step 2: Additiv-Invariante bestätigen**

`git diff origin/staging -- "app/kfz-unfall/[stadt]/[typ]/page.tsx" app/sitemap.ts scripts/smoke.mjs` prüfen: nur Additionen + die Flag-Verdrahtung; bei Flag `false` Verhalten unverändert. Kein Content/keine Funktion gelöscht.

- [ ] **Step 3: Push + PR1**

```bash
git push
gh pr create --base staging --title "feat(au-pseo): PSEO Lokal-Content je Stadt (PR1, noch noindex)" \
  --body "PR1 von 2 (Spec: docs/superpowers/specs/2026-05-26-autounfall-pseo-unique-content-design.md). Additiv: 20 Stadt-Blöcke + default-off PSEO_INDEXABLE. PSEO bleibt noindex (Flag=false). Jaccard max<0.40 (siehe docs/26.05.2026/pseo-jaccard-baseline.md). Flip folgt in PR2 nach Review. 🤖 Generated with Claude Code"
```

- [ ] **Step 4: Aaron-Review der 20 Blöcke anstoßen**

PR1-Link an Aaron; Review der `pseo-local.ts`-Fakten/Quellen abwarten. **PR2 erst nach Freigabe.**

---

## Task 11: PR2 — der Flip (NUR nach Aaron-Freigabe + grünem Gate)

**Files:**
- Modify: `content/pseo-indexable.mjs`
- Modify: `DEPLOY.md`

- [ ] **Step 1: Flag flippen**

In `content/pseo-indexable.mjs`: `export const PSEO_INDEXABLE = false` → `export const PSEO_INDEXABLE = true`.

- [ ] **Step 2: DEPLOY.md additive Notiz**

In `DEPLOY.md` bei der PSEO-noindex-Zeile additiv ergänzen (nicht löschen):
```
# PSEO: seit 2026-05-26 indexiert (PSEO_INDEXABLE=true) — vorher noindex bis Lokal-Content stand.
```

- [ ] **Step 3: Verifikation — jetzt indexiert**

Run: `npm run build && npm run start` (Hintergrund), dann
```bash
SMOKE_BASE_URL=http://127.0.0.1:3002 npm run smoke
node -e "fetch('http://127.0.0.1:3002/sitemap.xml').then(r=>r.text()).then(t=>console.log('kfz-unfall im sitemap:', (t.match(/kfz-unfall/g)||[]).length))"
```
Expected: Smoke PASS, PSEO-Sample jetzt unter INDEXABLE (kein noindex); `kfz-unfall im sitemap: 100`; `/unfall-assistance` weiterhin noindex.

- [ ] **Step 4: Push + PR2**

```bash
git add content/pseo-indexable.mjs DEPLOY.md
git commit -m "feat(au-pseo): flip PSEO_INDEXABLE=true — index 100 local pages (PR2)"
git push
gh pr create --base staging --title "feat(au-pseo): Flip PSEO auf indexierbar (PR2)" \
  --body "PR2 von 2. Reine Daten-Änderung: PSEO_INDEXABLE false->true. page/sitemap/smoke lesen das Flag bereits. 100 PSEO-Seiten jetzt indexiert + in Sitemap; /unfall-assistance bleibt noindex. Nichts gelöscht. 🤖 Generated with Claude Code"
```

- [ ] **Step 5: Post-Merge-Smoke gegen Live**

Nach Merge + Deploy: `npm run smoke` gegen `https://autounfall.io` (bzw. staging-Host) — PSEO ohne noindex, `/unfall-assistance` mit noindex. IndexNow-Ping (`npm run indexnow`) für die neuen URLs erwägen.

---

## Self-Review (gegen Spec)

- **Spec §4.1 Datenmodell** → Task 2 ✓
- **Spec §4.2 Quellen-Standard** → Task 8 (HART-Regeln) ✓
- **Spec §4.3 Renderer additiv** → Task 3 ✓
- **Spec §4.4 Within-City-Mitigation** → Task 9 Step 2 (Contingency) ✓
- **Spec §4.5 Jaccard-Script** → Task 6 ✓
- **Spec §4.6 PSEO_INDEXABLE-Gate** → Task 1 + Verdrahtung Task 3/4/5 ✓
- **Spec §7 Flip = Daten-Änderung** → Task 11 ✓
- **Spec §8 Testing** → Task 10 (build/tsc/contrast/smoke/jaccard) ✓
- **Spec §9 2-PR-Delivery** → Task 10 (PR1) + Task 11 (PR2) ✓
- **Spec §11 DoD** → über Tasks 1-11 abgedeckt ✓

**Typ-Konsistenz:** `PseoLocal`/`LocalFact` (Task 2) = im Renderer genutzt (Task 3) ✓; `PSEO_INDEXABLE` (Task 1) = importiert in page/sitemap/smoke (Task 3/4/5/11) ✓; `getPseoParams` existiert in `lib/pseo.ts` ✓.

**Additiv-Invariante:** Modifikationen bestehender Zeilen sind minimal und behavior-preserving bei Flag `false`: Task 3 Step 2 (robots-Wert → Flag-Referenz) und Task 5 (zwei `for…of`-Schleifen zeigen auf abgeleitete `*_ACTIVE`-Listen; die `INDEXABLE`/`NOINDEX`-Literale inkl. PSEO-Zeile bleiben unangetastet). Keine Prüfung/Fixture/Funktion/Content gelöscht. Task 11 = Flag-Wert + additive Doku-Notiz.
