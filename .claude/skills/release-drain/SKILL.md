---
name: release-drain
description: Use when opening a PR in this repo, moving work from staging to main, or creating a release drain. Triggers on "PR aufmachen", "drain", "nach main", "release", "staging mergen", "PR gegen staging", and on any PR that shows up as CONFLICTING or whose green checks look stale. Carries the branch and gh-CLI traps that have cost this project real incidents.
---

# Release-Drain — von staging nach main, ohne die bekannten Fallen

## Die drei harten Regeln zuerst

1. **Nie direkt auf `main` pushen.** Feature-Branch `kitta/aar-<nr>-<slug>`, PR gegen
   `staging`. Auch wenn der Commit „sauber" wirkt — der Flow-Bruch zerstört Preview-Deploys,
   Review-Spur und Rollback-Sicherheit.
2. **DDL nur über das Supabase-Plugin** (`apply_migration`), nie CLI, nie raw `execute_sql`.
   Danach `list_migrations`, die vergebene Version ablesen, und das Migration-File **exakt
   danach benennen** — sonst Twin-Drift.
3. **Kein unbegleiteter Stash am Session-Ende.** Entweder gepoppt und committet, oder mit
   Begründung verworfen. Nie: Stash liegen lassen und die DB-Migration trotzdem applizieren.

## Branch-Fallen

**Von `staging` branchen, nicht von `main`.** Ein von `main` gezweigter Branch gegen
`staging` wird CONFLICTING. `rebase` verschlimmert es — dann hilft nur Cherry-Pick.

```bash
git fetch origin
git worktree add -b kitta/<slug> <pfad> origin/staging
```

**Nach einem Merge FRISCH branchen.** Baut Branch B auf dem noch nicht gemergten Branch A
auf, strandet B, sobald A gemergt ist. Grüne Checks am alten SHA täuschen dabei Aktualität
vor.

⚠ **`git checkout <branch> -- <pfad>` verwirft uncommittete Arbeit ohne Warnung.** Und
`checkout -B` kann die Löschung einer bereits gemergten Datei mitstagen.

## Der PR selbst

**Immer `--body-file`, nie `--body "…"`.** Backticks im Body werden von der Shell
**ausgeführt** — `gh` meldet trotzdem Erfolg, und im PR steht das Ergebnis des Befehls statt
des Textes.

```bash
gh pr create --base staging --title "…" --body-file <datei.md>
```

**Jeder Commit trägt den 7-Punkte-Audit** im Body (Build, UI, Redundanz, Dead-Code, Spec,
Inkonsistenz, Regression) — siehe AGENTS.md. Auch bei Ein-Zeilen-Änderungen, dann eben mit
„n/a".

## Das Journey-Gate am Tor nach main

Ein Drain-PR (`release/rNNN-drain -> main`) löst das **Journey-Gate** aus: 8 vollständige
Journeys gegen `app.staging.claimondo.de`, ~5 Minuten. Rot heißt: mindestens ein ganzer
Nutzer-Lauf ist auf dem Stand gebrochen, der nach prod soll.

Bei Rot **mit Aaron absprechen**. Übersteuerung: Label `journey-override` + Begründung als
Kommentar, damit sie nachvollziehbar bleibt und nicht zur Gewohnheit wird.

Vorher wissen, was du auslöst: `npm run check:journey-bezug` → `journey-verifikation`.

## Rote Builds ohne Code-Ursache

Externe Downloads brechen Builds. Erst `gh run rerun <id> --failed`, bevor du debuggst.
⚠ Lokal täuscht `| tail` Grün vor — der Exit-Code ist der von `tail`, nicht der des Befehls.

## Vor dem Session-Ende

```bash
git status                            # Working-Tree clean?
git stash list                        # leer oder dokumentiert?
git log --branches --not --remotes    # alle lokalen Commits gepusht?
```

## Parallele Sessions

Bei mehreren Sessions im Repo: **eigener Worktree pro Session**
(`node scripts/new-session-worktree.mjs <slug>`). Sonst trampeln sich Working-Tree,
Force-Pushes und doppelte Commits gegenseitig.

⚠ Absolute Pfade **ohne** Worktree-Segment schreiben in den Haupt-Checkout — und der ist
oft tausende Commits stale. Für Repo-Fragen gegen `origin/staging` lesen, nicht gegen den
lokalen Checkout.

## Verwandt

- `journey-verifikation` — welchen Lauf berührt dieser PR
- `regel4-smoke` — der Prod-Nachweis nach dem Merge
