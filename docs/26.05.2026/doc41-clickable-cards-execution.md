# Doc 41 — Clickable Cards: Ausführungs-Record (2026-05-26)

> **Quelle:** `marketing-strategy/strategy/41-CLICKABLE-CARDS-IMPLEMENTIERUNGSPLAN.md`
> **Basis:** `origin/staging` (nach Doc 38 P6 — Hotspot-Daten DUS/Wuppertal/Bonn vorhanden)
> **Worktree:** `.claude/worktrees/doc40-cardlink-helper` (isoliert, Branch-Kollision auf `kitta/doc38-hyperlocal-staedte` umgangen)
> **Scope (von Aaron bestätigt):** 8 PRs wie im Doc + Tracking (§10) + Playwright-E2E (§9.3)

## Ergebnis: 8 PRs

| PR | # | Branch | Datei(en) | Inhalt |
|----|---|--------|-----------|--------|
| 1 | 1735 | `kitta/doc40-cardlink-helper` | `ui/CardLink.tsx` + Test + `TrackingHooks.tsx` | Enabler: CardLink-Helper (3 Varianten) + 6 Vitest-Tests + GA4 `card_click`-Selector (§10) |
| 2 | 1744 | `kitta/doc40-ansprueche-cards` | `HauptseitePremium.tsx` | 4 ANSPRUECHE-Cards → CardLink |
| 3 | 1745 | `kitta/doc40-bgh-authority-cards` | `sections/BghAuthorityGrid.tsx` | 7/8 BGH-Cards klickbar (67/91 bewusst nicht) |
| 4 | 1737 | `kitta/doc40-versicherer-taktiken-cards` | `VersichererTaktikenSection.tsx` | 6 interne Links (Tabelle, nicht Cards!) |
| 5 | 1739 | `kitta/doc40-sieben-fehler-cards` | `SiebenFehlerSection.tsx` | 7 Fehler-Cards klickbar (Pattern B) |
| 6 | 1748 | `kitta/doc40-prozess-steps-cards` | `HauptseitePremium.tsx` | 5 Prozess-Cards klickbar (Pattern B) |
| 7 | 1742 | `kitta/doc40-cluster-hub-headline` | `ClusterHubGrid.tsx` + `haftpflicht/page.tsx` | Cluster-Headlines + Anker-IDs |
| 8 | 1746 | `kitta/doc40-hotspot-card-links` | `kfz-gutachter/[stadt]/page.tsx` + E2E-Spec | Hotspot-Cards → Cornerstone + Playwright-Spec |

**Summe:** ~36 neue interne Links + 1 GA4-Event + 1 E2E-Spec. Alle Ziel-URLs vor Implementierung live verifiziert (14 dynamische Spokes + 8 Standalone-Routen, kein `draft`).

## Abweichungen vom Doc (wichtig)

Der Doc (2026-05-24) ist an mehreren Stellen von der realen Code-Struktur abgewichen — jede Abweichung wurde empirisch geprüft und intent-treu adaptiert:

1. **PR4 — Tabelle statt Cards.** Doc §4.3 nimmt ein Card-Grid an; real ist `VersichererTaktikenSection` eine `<table>`. `<tr>` kann nicht in `<a>` → Link in die Gegenargument-Zelle (CTA „Was BGH-fest gilt"). Server-Component, valides HTML.
2. **PR3 — kein CardLink.** CardLink rendert `title` (h3) zuerst; die BGH-Card hat die AZ-Badge OBEN. CardLink hätte sie unter den Titel geschoben (Verstoß gegen §3.4 + „Layout unverändert"). → Option B: `<article>`→`<Link>` mit 1:1-Markup.
3. **PR1 — Test adaptiert.** Repo nutzt vitest `environment:'node'`, **kein** `@testing-library/react`/`jsdom` (0 Vorkommen in `src/`). Statt DOM-Test-Stack einzuführen: Element-Tree-Inspektion (gleiche Coverage, keine neuen Deps).
4. **PR7 — Anker-IDs mitgenommen.** §7.2 lagert die `cluster-*`-IDs aus; sie existierten nirgends → ohne sie wäre der Link dangling. ID-Vergabe (+`scroll-mt-24`) auf `haftpflicht/page.tsx` in diese PR gezogen.
5. **PR8 — E2E konventionsgerecht.** Doc hardcodet `https://claimondo.de`; Repo nutzt `playwright.config` `baseURL` → relative Pfade. Hotspot-Count robust (`≥1` statt brittle `=5`). ANSPRUECHE=4/BGH=7 exakt (Fix-Arrays).
6. **CardLink-Pfad.** Per Doc in `components/ui/` (wo bereits custom Komponenten DropletBadge/TabDropContent liegen) — Composite wäre policy-konform auch `shared/`, Pfad bewusst Doc + PR2/3-Imports folgend.

## Build/Infra-Learnings (Worktree-unter-Repo)

Der Worktree liegt unter `.claude/worktrees/` **innerhalb** des Repos. Das hat zwei `next build`-Fallen (für künftige Worktree-Sessions relevant):

- **Heap-OOM:** Default-4GB-Heap reicht nicht für die TS-Phase von `next build` → `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.
- **EBUSY beim Standalone-Copy:** `output:'standalone'` kopiert rekursiv (Worktree-Pfad self-referenziert) und sperrt bei vorhandenem `.next` Font-Files → **vorher `rm -rf .next`**. Mit sauberem `.next` baut es durch (komplette Route-Liste).

`next build` failt hier **nicht** auf ESLint (lint ist im Build nicht blockierend). Die offenen PRs scheitern also nicht an den 2 vorbestehenden `react/no-unescaped-entities`-Fehlern (`HauptseitePremium.tsx` ~Z.224/490, `kfz-gutachter/[stadt]/page.tsx` ~Z.234 — fremde Marketing-Copy, NICHT aus diesen PRs, in fokussierten Cards-PRs bewusst nicht angefasst).

## Gate pro PR

- Komponenten-PRs (2/3/4/5/6): `tsc --noEmit` + `eslint` + `check:token-audit` (AGENTS.md §1 — keine Route-Datei).
- Route-Datei-PRs (7/8): zusätzlich voller `next build` (grün, komplette Route-Liste).
- PR1: + `vitest run CardLink.test.tsx` 6/6.
- Token-Audit durchgehend 0 Verstöße.

## Offen / Hinweise

- **Auto-Merge:** PR1/4/5/7 bereits via Merge-Watcher gemergt; PR2/3/6/8 warten auf grünen CI-Build (lokal alle gated). PR2↔PR6 (gleiche Datei) + PR8 (Datei der aktiven doc38-Session) sind nicht-überlappend → sauberer Auto-Merge.
- **E2E grün erst nach Prod-Deploy:** `doc40-cards-clickable.spec.ts` läuft gegen den deployten Stand.
- **Doc-40 §12 Out-of-Scope** (Bezirks-Cards, Founder-Cards, FAQ-Details, Sanden/Danner-Zeilen) bewusst nicht umgesetzt — wie im Plan.
