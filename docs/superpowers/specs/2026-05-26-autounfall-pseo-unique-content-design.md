# autounfall.io — PSEO Lokal-Content + Indexierung (Design)

**Stand:** 2026-05-26 · **Status:** Design freigegeben (Aaron), Spec-Review ausstehend
**Branch:** `kitta/au-pseo-lokal-content` (Basis `origin/staging`)
**Scope:** Standalone-App `autounfall-io/` — KEIN Bezug zu claimondo.de `/kfz-gutachter` (= Doc 38, anderes Set)

---

## 1 · Problem & Ausgangslage

Die 100 PSEO-Seiten `autounfall-io/app/kfz-unfall/[stadt]/[typ]` (20 Städte × 5 Unfalltypen) sind
**bewusst `noindex`** (WP-5, als VERBINDLICH dokumentiert) — mit `follow: true` und **nicht** in
`app/sitemap.ts`. Grund: **dokumentierter Duplicate-Content-Jaccard 0,61**. Alle 100 Seiten kommen aus
EINEM Template (`page.tsx`), getauscht werden nur Variablen aus `content/pseo-data.generated.ts`:

- **pro Stadt konstant:** `einwohner`, `pkw`, `unfaelle`, `svs`, `gericht`
- **pro Typ konstant:** `label`, `pct`, `schaden`, `bgh`, `definition`
- **pro Kombination:** nur `typCount` (berechnet)

Prosa, Quick-Answer, Rechtsrahmen, CTAs, Quellen-Liste, FAQ-Gerüst sind identischer Template-Text mit
Name-Swaps. Das ist Googles klassisches **Doorway-/Thin-Content-Muster** (die Seite gibt es im Footer
selbst zu: „Teil eines programmatischen SEO-Clusters"). 100 Near-Duplicates auf einmal zu indexieren
riskiert ein **domainweites** Quality-Signal — schwer reversibel.

Die noindex-Entscheidung ist explizit **gegated**: „noindex *bis* unikater Lokal-Content je Stadt
freigegeben ist." Dieses Dokument beschreibt, wie der Gate erfüllt und der Flip sicher vollzogen wird.

## 2 · Entscheidungen (mit Aaron, 2026-05-26)

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Uniqueness-Achse | **Pro Stadt** — ein unikater Lokal-Block je Stadt, geteilt über ihre 5 Typ-Seiten |
| 2 | Content-Quelle | **Recherche durch Claude + Review durch Aaron** vor Flip; echte, belegbare Fakten, keine Fabrikation |
| 3 | Flip-Gate | **Automatischer Jaccard-Check (max < 0,40) + Aarons inhaltliches Review** |
| 4 | Constraint | **Additiv only** — nichts löschen, nur hinzufügen (Ausnahme: die 2 Flip-Guardrail-Zeilen, s. §7) |
| 5 | Architektur | **A — eigenes typisiertes Modul** `content/pseo-local.ts` (handgeschrieben, nicht generiert) |

## 3 · Non-Goals / Scope-Grenzen

- **Keine** Änderung an claimondo.de `/kfz-gutachter` (Doc 38, fremde Sessions).
- **Keine** Änderung an `port-pseo.py` oder `pseo-data.generated.ts` (Generator bleibt unangetastet).
- **Kein** Löschen bestehenden Template-Contents — der Lokal-Block kommt additiv obendrauf.
- **Keine** per-Kombination-Texte (100 Stück). Pro Stadt = 20 Blöcke. (Per-(Stadt,Typ)-Satz nur als
  Contingency, s. §6.)
- `/unfall-assistance` bleibt `noindex` (Funnel, kein Ranking-Ziel) — nicht Teil des Flips.

## 4 · Architektur

### 4.1 Datenmodell — `autounfall-io/content/pseo-local.ts` (neu, handgeschrieben)

```ts
// HANDGESCHRIEBEN — nicht generiert. Lokal-Content je PSEO-Stadt (WP-5-Gate).
// Jeder Fakt MUSS eine Quelle tragen (Anti-Fabrikation + Review-Basis).
export type LocalFact = {
  label: string        // z.B. "Unfallschwerpunkt"
  value: string        // z.B. "Autobahnkreuz Kaiserberg (A3/A40)"
  quelle: string       // Pflicht — z.B. "Unfallatlas Destatis 2023"
  url?: string         // verlinkbare Primärquelle, wenn vorhanden
}
export type PseoLocal = {
  intro: string        // 2-4 Sätze echter Lokal-Kontext (additiv zum Template)
  facts: LocalFact[]   // 3-5 belegte Fakten
}
export const PSEO_LOCAL: Record<string, PseoLocal> = {
  // 20 Einträge, Keys = PSEO_CITY_SLUGS
}
```

Schlüssel sind exakt die `PSEO_CITY_SLUGS` aus `pseo-data.generated.ts` (berlin, bielefeld, …, wuppertal).

### 4.2 Recherche- & Quellen-Standard

Erlaubte Primärquellen (öffentlich, verifizierbar, **keine personenbezogenen Daten** → DSGVO-clean):

- **Unfallatlas** (unfallatlas.statistikportal.de) + **Destatis** — reale Unfallzahlen / Schwerpunkte
- **Justiz-Websites** (Landesjustizportale) — reale zuständige Amts-/Landgerichte
- **KBA** — Fahrzeugbestand; **BVSK-Verzeichnis** — SV-Landschaft (bleiben „ca."/geschätzt, klar gelabelt)
- Lokale Verkehrs-Besonderheiten (Autobahnkreuze, Wildwechsel-Korridore, Umweltzonen)

Harte Regel: **kein Fakt ohne `quelle`**; Schätzungen explizit als „ca./geschätzt". Die 20 Blöcke gehen
samt Quellenliste zu Aarons Review **vor** dem Flip.

### 4.3 Renderer-Integration (additiv)

In `app/kfz-unfall/[stadt]/[typ]/page.tsx` ein **neuer** `<section>` „Lokales · {city.name}" (nach der
Zahlen-Tabelle). Rein additiv — bestehender Content bleibt 1:1:

```tsx
import { PSEO_LOCAL } from '@/content/pseo-local'
// ...
const local = PSEO_LOCAL[stadt]
{local && (
  <section className="article-prose mt-10">
    <h2>Lokales · {city.name}</h2>
    <p>{local.intro}</p>
    <ul>
      {local.facts.map((f) => (
        <li key={f.label}>
          <strong>{f.label}:</strong> {f.value}{' '}
          <span className="text-au-muted">({f.url ? <a href={f.url} rel="noopener" target="_blank">{f.quelle}</a> : f.quelle})</span>
        </li>
      ))}
    </ul>
  </section>
)}
```

Optional additiv (kein Umbau): die belegten Fakten in `lib/jsonld.ts:pseoGraph()` einspeisen.

### 4.4 Within-City-Mitigation

Pro-Stadt-Blöcke killen die **Stadt-zu-Stadt-Duplikate** (das dominante Problem). Die 5 Seiten *einer*
Stadt differenzieren sich über ihre Typ-Teile (`definition`, `bgh`, 5 FAQ, Intro-Satz, Related-Artikel).
**Contingency (nur falls der Jaccard-Test innerhalb einer Stadt zu hoch misst):** ein zusätzlicher,
dynamischer Stadt×Typ-Satz pro Seite — additiv, kein Pflichtteil dieser Iteration.

### 4.5 Jaccard-Mess-Gate — `autounfall-io/scripts/check-pseo-similarity.mjs` (neu)

Lädt den sichtbaren Text aller 100 gerenderten Seiten, berechnet paarweise Jaccard (Token-Shingles),
reportet **max + mean + Top-Kollisionspaare**. Schwelle: **max < 0,40**. Läuft als Vor-Flip-Gate
(optional CI-Step). Vorab wird verifiziert, wie die ursprünglichen 0,61 gemessen wurden, damit der Wert
vergleichbar ist (Quelle: gitignored Prototyp/Spec, sonst dokumentierte Methode rekonstruieren).

## 5 · Datenfluss

```
content/pseo-local.ts (20 Blöcke, handgeschrieben, je Fakt mit Quelle)
        │ import
        ▼
app/kfz-unfall/[stadt]/[typ]/page.tsx  ──(SSG, generateStaticParams)──▶ 100 statische HTML
        │                                                                      │
        ├─ PSEO_LOCAL[stadt] → neuer <section>                                 │
        └─ (unverändert) pseo-data.generated.ts → Template                     ▼
                                                          scripts/check-pseo-similarity.mjs
                                                          → max Jaccard < 0,40 ?  ──┐
                                                                                    │ Gate
                                       Aaron-Review der 20 Blöcke ──────────────────┤
                                                                                    ▼
                                                       PR2: robots index:true + sitemap + smoke
```

## 6 · Error Handling

- **Fehlender City-Eintrag:** Renderer rendert ohne Block (`{local && …}`) → kein Crash. Zusätzlich
  Build-/Test-Assertion: vor dem Flip müssen **alle 20** `PSEO_CITY_SLUGS` einen `PSEO_LOCAL`-Eintrag
  haben (sonst Gate rot).
- **Externe Quell-Links tot:** `url` ist optional; bricht nichts. Quelle bleibt als Text sichtbar.
- **Server-Action-Pattern:** n/a (rein statische Seiten, keine Mutationen).

## 7 · PR2 — Flip-Änderungen (nur `robots` + `smoke` sind nicht-rein-additiv; Sitemap + DEPLOY sind additiv)

- `app/kfz-unfall/[stadt]/[typ]/page.tsx`: `robots: { index: false, follow: true }` → indexierbar
  (Zeile entfällt, erbt `index:true` aus `app/layout.tsx`). **PR2.**
- `app/sitemap.ts`: 100 PSEO-Routen **additiv** ergänzen (`getPseoParams()` → `/kfz-unfall/${stadt}/${typ}`,
  `lastModified` je Stadt sinnvoll). **PR2.**
- `scripts/smoke.mjs`: PSEO-Eintrag von der `NOINDEX`-Liste in eine **indexierbar**-Prüfung verschieben;
  `/unfall-assistance` bleibt in `NOINDEX`. **PR2.**
- `DEPLOY.md`: „PSEO = noindex"-Notiz auf neuen Stand (additiver Kommentar, kein Inhaltsverlust). **PR2.**

## 8 · Testing / Verifikation

- `npm run build` (autounfall-io) grün — SSG-Routen bauen 100/100.
- `npx tsc --noEmit` grün.
- `npm run check:contrast` (falls Block neue Farb-Kombis bringt — sollte nicht).
- `scripts/check-pseo-similarity.mjs` → max Jaccard < 0,40 (Gate).
- `scripts/smoke.mjs` gegen Preview/Prod: nach Flip liefern PSEO-Seiten **kein** noindex-Meta mehr,
  `/unfall-assistance` weiterhin schon.
- Screenshot-Smoke einzelner Seiten (Playwright-CLI), Lokal-Block sichtbar.
- AGENTS.md §post-task-audit (7 Punkte) je Commit.

## 9 · Delivery-Plan

**Eigener Worktree** `.claude/worktrees/au-pseo-lokal-content/`, **nicht** auf `doc38-hyperlocal-staedte`.
**2 PRs gegen `staging`** — bildet „erst alle unique, *dann* index" ab:

- **PR1 (risikofrei):** `pseo-local.ts` + 20 recherchierte Blöcke + Renderer-Section +
  `check-pseo-similarity.mjs`. Seiten bleiben **noindex** → null Außenrisiko. → Aaron-Content-Review.
- **PR2 (Flip):** nach grünem Jaccard + Aaron-Freigabe → robots-Flip + Sitemap + Smoke-Update + DEPLOY-Notiz.

## 10 · Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Recherchierte Fakten falsch/veraltet | Pflicht-`quelle` je Fakt + Aaron-Review vor Flip |
| Within-City-Pairs bleiben zu ähnlich | Contingency-Satz (§4.4), gemessen via Jaccard-Script |
| Branch-Kollision mit Doc-38-Sessions | Eigener Worktree, anderes Verzeichnis (`autounfall-io/` vs `src/`) |
| 0,61-Messmethode unbekannt → Schwelle nicht vergleichbar | Methode vorab rekonstruieren/dokumentieren |
| Flip indexiert versehentlich `/unfall-assistance` | Smoke-Test hält es explizit in NOINDEX |

## 11 · Definition of Done

- [ ] `content/pseo-local.ts` mit 20 Einträgen, je `intro` + 3-5 `facts` mit Pflicht-`quelle`
- [ ] Renderer-Section additiv eingebaut, Build + tsc grün
- [ ] `check-pseo-similarity.mjs` vorhanden, max Jaccard < 0,40 dokumentiert
- [ ] Aaron-Review der 20 Blöcke abgehakt (PR1)
- [ ] PR2: robots-Flip + 100 Sitemap-Routen + Smoke-Update + DEPLOY-Notiz
- [ ] Post-Flip-Smoke: PSEO ohne noindex, `/unfall-assistance` mit noindex
- [ ] Memory/Notion-Update nach Completion-Checklist
