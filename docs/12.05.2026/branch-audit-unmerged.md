# Branch-Audit — un-gemergte Feature-Branches

**Datum:** 2026-05-12
**Scope:** Alle 108 Remote-Branches deren Tip nicht in `origin/main` liegt
**Methodik:** Korrelation `git branch -r --no-merged` × `gh pr list` × 6 parallele Deep-Audit-Subagenten pro logischer Branch-Gruppe

> **UPDATE 2026-05-12 (nach Abarbeitung):** Cleanup durchgeführt — 109 von 110 Branches gelöscht, 3 Tabu-Branches verbleiben (parallele Glass-Instanz + Backlog).
> **Korrektur zu den 4 "Entscheidungs-Branches":** Alle 4 waren stale Audit-Befunde — der Inhalt ist längst in main:
> - `aar-727-color-harmonize` — Integrations-Docs in main, Code-Diffs absichtliche Drift → gelöscht
> - `aar-lexdrive-webhook-doku` — Secret-Sweep (`.env.local`-Loader + Placeholder) ist in main → gelöscht, **kein** Cherry-Pick nötig
> - `aar-637-rueckruf-sot-termine` — Migration + `mitarbeiter/termine/page.tsx` (200 Z, neuer als Branch-Version) + `admin_termine.lead_id` FK + Webhook-Sync alles in main → gelöscht
> - `aar-625-support-durchdenken` — Migration `20260421000605` + `buildDurchdenkenPrompt()` + `mode:'durchdenken'` + Feature-Request-Flow alles in main → gelöscht
>
> **Lehre:** Die "true-positive"-Audit-Bewertung basierte auf oberflächlichen grep-Stichproben. Für künftige Branch-Audits: pro Verdachts-Branch die Hauptdateien aus dem Diff EXPLIZIT gegen `git show origin/main:<file>` prüfen, nicht nur "existiert ein File mit dem Namen".

---

## TL;DR

| Kategorie | Anzahl | Aktion |
|---|---:|---|
| Squash-merged (Inhalt in main, Tip nicht) | **85** | Bedenkenlos löschen |
| Audit-Kandidaten (CLOSED oder kein PR) | **23** | Detail-Audit (siehe unten) |
| └─ Komplett obsolet | 19 | Löschen |
| └─ Restwert vorhanden | 4 | Aaron-Entscheidung |
| **Total** | **108** | **104 löschbar, 4 offen** |

**Kernerkenntnis:** Die Mehrheit aller "un-gemergten" Branches ist tatsächlich via Squash-Merge in main — Git zeigt das nur nicht. Echte Lücke zur Implementierung gibt es nur in 4 Branches, davon 2 mit substanziellem Restwert.

---

## Methodik

```powershell
# Branch-Inventur
git fetch --all --prune
git branch -r --no-merged origin/main  # → 108 Branches

# PR-Korrelation
gh pr list --state all --limit 500 --json number,headRefName,state,baseRefName

# Ergebnis:
#  85 × MERGED  (Squash-Merge — Inhalt in main, Branch-Tip nicht)
#   7 × CLOSED  (PR existierte, wurde geschlossen ohne Merge)
#  16 × NO_PR   (Branch ohne je eröffnetem PR)
```

Die 23 echten Audit-Kandidaten wurden in 6 thematische Gruppen aufgeteilt und parallel von Subagenten gegen `main` verglichen (Datei-Diff + Stichproben-Reads + grep nach Hauptkomponenten).

---

## Echte Action-Items (4 Branches mit Restwert)

### 1. `kitta/aar-lexdrive-webhook-doku` — Security-Hygiene
- **Status:** NOCH-OFFEN
- **Inhalt:** 1 Commit, 2 Dateien (+16/-4). Entfernt `LEXDRIVE_WEBHOOK_SECRET`-Klartext aus `docs/integrations/claimondo-vollmacht-klaerung.md` und `scripts/test-lexdrive-inbound.ps1`. Ersetzt durch `.env.local`-Loader.
- **Hintergrund:** PR #257 hatte das Secret hardcoded eingecheckt → liegt in Git-History → Secret muss ohnehin rotiert werden.
- **Empfehlung:** **Cherry-Pick** als kleiner Security-Hygiene-PR.

### 2. `kitta/aar-637-rueckruf-sot-termine` — Mitarbeiter-Rückrufliste
- **Status:** SCHON-ANDERS-GELÖST (Kern), aber ein Stück fehlt
- **In main vorhanden:** `admin_termine.lead_id` FK ✓, Webhook-Sync `leads.rueckruf_geplant_am ↔ admin_termine` ✓ (via #484/#608), Legacy-`leads.rueckruf_*`-Spalten ✓ gedroppt, Dispatch-Rückrufliste ✓.
- **In main fehlt:** Mitarbeiter-Portal-Rückrufliste (`/mitarbeiter/termine/page.tsx`, ~200 Zeilen).
- **Empfehlung:** **Aaron-Entscheidung** — ist Rückrufliste im Mitarbeiter-Portal MVP oder V2? Wenn MVP → fokussierter neuer PR aus diesem Branch herauslösen.

### 3. `kitta/aar-625-support-durchdenken-feature-request` — Support-Bot Brainstorm-Modus
- **Status:** TEILWEISE-IN-MAIN (Support-Bot-Core lebt, "Durchdenken"-Modus fehlt)
- **In main fehlt:** `buildDurchdenkenPrompt()` + 8-Turn-Limit mit Termin-Warnung ab Turn 6, Linear-Labels `user-reported/ai-created/feature-request`, Migration `support_ticket_typ` (~20 Zeilen), `SupportContext.mode: 'durchdenken'`.
- **Empfehlung:** **Aaron-Entscheidung** — ist der "Durchdenken-Modus" noch ein Q2-Feature? Falls ja: PR mit nur diesem Delta (~40 Zeilen + Migration). Falls Support-Bot reine Bug-Reports bleibt: löschen.

### 4. `kitta/aar-727-color-harmonize` — Integrations-Docs vor Löschen prüfen
- **Status:** TEILWEISE-IN-MAIN (Code-Diffs sind Drift, Docs ggf. wertvoll)
- **3 Commits:** Integrations-Handoff-Docs (`lexdrive-webhook.md`, `claimondo-vollmacht-klaerung.md`), Test-Scripts, 14-Seiten-Farbharmonisierung.
- **Code-Anteil:** Obsolet (Branch zeigt z.B. Rueckruf-Farbe `#E89B3C`, main hat `#9CA3AF` — absichtliche Divergenz nach Branch-Erstellung).
- **Doc-Anteil:** Vor Löschen kurz vergleichen ob die Integrations-Handoff-Docs in main vollständig sind.
- **Empfehlung:** **Prüfen** (5 Min Doc-Diff), dann löschen.

---

## Obsolete Branches (19 — bedenkenlos löschen)

### Gruppe A: AAR-727 Glass-Morphism Rollout (7 Branches, 2026-04-23)
Alle durch spätere "Big iOS-Glass-Polish"-Welle (PRs #748, #771–775) ersetzt:
- `kitta/aar-727-pageheader`
- `kitta/aar-727-branded-glass`
- `kitta/aar-727-cards-dashboards`
- `kitta/aar-727-cards-lists`
- `kitta/aar-727-modals-drawers`
- `kitta/aar-727-popover-dropdown`
- `kitta/glass-rollout-portals`

### Gruppe B: Onboarding-Strecke (4 Branches, CLOSED)
Komplett durch **PR #731** (`kitta/onboarding-all-prs`, merged 2026-05-10) zusammengeführt:
- `kitta/onboarding-2-foundation` (PR #727 CLOSED) — Migrations in main: `20260510135215`, `20260510150317`
- `kitta/onboarding-3-dynamic-wizard` (PR #728 CLOSED) — DynamicWizard, 9 Field-Komponenten in main
- `kitta/onboarding-4-slot-engine` (PR #729 CLOSED) — `slots.ts` (265 Z) + EXCLUSION-Migration in main
- `kitta/onboarding-5-wire-up` (PR #730 CLOSED) — `svMatching.ts` (137 Z), Dispatch-Pages in main

### Gruppe C: CMM-Strecke (3 Branches, CLOSED)
Alle durch alternative PRs in main:
- `kitta/cmm-22-pflichtdaten-banner` (PR #452 CLOSED) → via **PR #396** (Commit `713370a9`)
- `kitta/cmm-24-sv-auftrags-banner` (PR #453 CLOSED) → via **PR #399** (Commit `0fff02ca`)
- `kitta/cmm-32-auftraege-sub-entity` (PR #405 CLOSED) → via **PR #406** (Commit `e5e4c185`)

### Gruppe E: TS/Build-Fixes (3 Branches)
- `kitta/aar-664-phase-override-konstante` → durch **PR #120** (Commit `80fb8f80`) in main
- `fix/bkat-inference-async-export` → de facto in main (`lookup.ts` Line 90, `bkat-inference.ts` cleaned)
- `kitta/ci-tsc-heap-bump` → ersetzt durch Commit `3b8a4cba` (Heap auf **8192** statt 4096)

### Gruppe D (1 Branch obsolet)
- `kitta/aar-638-643-termine-im-objekt` — Architektur durch Live-Termine-Cache-System (PR #733/#734) überholt. `src/lib/termine/loader.ts` ist veraltetes Pattern.

### Gruppe F (1 Branch obsolet)
- `aaronsprafke/aar-545-feldkonsolidierung` — Hauptfeature längst in main (PR #7, Commit `d7dc0bb1`). Branch enthält nur stale `package-lock.json` — main hat neueren Lock-Sync (Commit `d8e2ec20`).

---

## Squash-merged Branches (85 — Tip löschen)

Diese Branches wurden via Squash-Merge in main übernommen. Der Squash erzeugt einen neuen Commit auf main, sodass die originale Branch-Tip "verwaist" bleibt — Git zeigt sie als un-gemerged, obwohl der Inhalt vollständig drin ist.

**Erkennungsmuster:** `gh pr list --state merged` matched diese Branches 1:1 auf merged PRs. PR-Nummern reichen von #604 (06.05.) bis #802 (12.05.) — überwiegend Branches der letzten 7 Tage, deren PRs gemerged sind aber das lokale `git fetch` die Tips noch behält.

Vollständige Liste in `/tmp/branch-pr-map.txt` (`grep '|MERGED|'`).

---

## Aufräum-Kommandos

### Löschen der 85 squash-merged Branches (lokal + remote)
```powershell
# Aus dem Branch-PR-Mapping
gh pr list --state merged --limit 500 --json headRefName,state `
  --jq '.[] | select(.state=="MERGED") | .headRefName' |
  ForEach-Object {
    git push origin --delete $_ 2>$null
    git branch -D $_ 2>$null
  }
```

### Löschen der 19 obsoleten Audit-Kandidaten
```powershell
$obsolete = @(
  # AAR-727 (7)
  'kitta/aar-727-pageheader',
  'kitta/aar-727-branded-glass',
  'kitta/aar-727-cards-dashboards',
  'kitta/aar-727-cards-lists',
  'kitta/aar-727-modals-drawers',
  'kitta/aar-727-popover-dropdown',
  'kitta/glass-rollout-portals',
  # Onboarding (4)
  'kitta/onboarding-2-foundation',
  'kitta/onboarding-3-dynamic-wizard',
  'kitta/onboarding-4-slot-engine',
  'kitta/onboarding-5-wire-up',
  # CMM (3)
  'kitta/cmm-22-pflichtdaten-banner',
  'kitta/cmm-24-sv-auftrags-banner',
  'kitta/cmm-32-auftraege-sub-entity',
  # TS/Build (3)
  'kitta/aar-664-phase-override-konstante',
  'fix/bkat-inference-async-export',
  'kitta/ci-tsc-heap-bump',
  # Termine + Misc (2)
  'kitta/aar-638-643-termine-im-objekt',
  'aaronsprafke/aar-545-feldkonsolidierung'
)
foreach ($b in $obsolete) {
  git push origin --delete $b
  git branch -D $b 2>$null
}
```

### Pending-Entscheidungen (4 Branches NICHT löschen bis geklärt)
- `kitta/aar-lexdrive-webhook-doku` → Cherry-Pick als Security-PR vorbereiten
- `kitta/aar-637-rueckruf-sot-termine` → Aaron: Mitarbeiter-Rückrufliste MVP oder V2?
- `kitta/aar-625-support-durchdenken-feature-request` → Aaron: Durchdenken-Modus Q2-Feature?
- `kitta/aar-727-color-harmonize` → 5-Min Doc-Diff prüfen, dann löschen

---

## Audit-Notiz für Memory

Die 85:23-Ratio (~79 % squash-merged Schein-Lücken) zeigt: `git branch -r --no-merged` ist für Branch-Hygiene-Audits ohne PR-Korrelation **unbrauchbar**. Squash-Merges sind im Repo Standard (PR-Titel-Style "release: staging → main", "feat(funnel): PR #..."). Bei jeder zukünftigen Branch-Inventur direkt `gh pr list --state merged` joinen, sonst entsteht der Eindruck von Drift, der real nicht existiert.
