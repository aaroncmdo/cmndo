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

## Squash-Reparent: `main` und `staging` haben absichtlich verschiedene Historien

`main` bekommt je Runde **einen** Commit, dessen Tree exakt der von `staging` ist. Folge:

⚠ **`git log main..staging` ist hier wertlos** — es listet die ganze divergente Historie
(zuletzt über 800 PR-Nummern) und sagt nichts über den Inhalt. Verglichen wird über
**Tree-Hash** und **Datei-Diff**, nie über Commit-Zahlen.

```bash
MAIN=$(git rev-parse origin/main); TREE=$(git rev-parse 'origin/staging^{tree}')
NEW=$(git commit-tree "$TREE" -p "$MAIN" -F nachricht.txt)
[ "$(git rev-parse "$NEW^{tree}")" = "$TREE" ] || exit 1      # Tree-Probe, immer
git push origin "$NEW:refs/heads/release/rNNN"
```

## Die fünf Gates je Runde (AGENTS.md Regel 1b)

Seit Lanes ihre PRs **selbst** nach `staging` mergen dürfen (Aaron 05.09.2026), fehlt der
Drain-Session der frühere Serialisierungspunkt. Diese fünf ersetzen ihn:

| | Prüfung | Kommando |
|---|---|---|
| **D1** | CI-Erfolg auf **genau** dem transportierten `staging`-Kopf | `gh run list --branch staging --json headSha,…` |
| **D2** | `staging`-SHA protokollieren, vor dem Merge als Vorfahr prüfen | `git merge-base --is-ancestor "$S" origin/staging` |
| **D3** | Kollisionsprobe: jede Löschung bis zum verursachenden PR zurückverfolgen | `git diff --name-only --diff-filter=D origin/main origin/staging` |
| **D4** | Migration-File-Parität | `npm run check:migration-files -- --ratchet` |
| **D5** | `main` steht beim Merge noch auf dem protokollierten Parent | `git rev-parse origin/main` |

⚠⭐ **Alle Gates gegen DENSELBEN `staging`-SHA messen.** Wer D3 misst, dann Minuten auf D1
wartet und danach baut, beschreibt eine Runde, die es so nicht gibt — in der Wartezeit
merged eine Lane. Real passiert am 06.09.: D3 sagte „1 Datei", tatsächlich waren es 10.
Bewegt sich `staging` während des Wartens: **alles neu messen**, nicht nur D1.

⚠ **D1 ist nicht „neulich grün".** Zwei PRs, je einzeln grün, können in ihrer **Kombination**
rot sein — und die Kombination entsteht erst mit dem zweiten Merge.

⚠ **D4 verlangt die Summenzeile mit `0 neu`, nicht `exit 0`.** Ein abgestürzter Check liefert
ebenfalls Exit ≠ 0 und ist sonst nicht von einem Fund zu unterscheiden. Den Lauf **ohne**
Ausgabe-Umleitung fahren, in einem Worktree **mit** `node_modules`, `--env-file` als
absoluter Pfad auf die `.env.local` des Haupt-Checkouts.

⚠ **Fehlt ein Migration-File: erst den Urheber-PR suchen** (`gh pr list --search "<version>"`
**und** `git log --all --diff-filter=A -- 'supabase/migrations/<version>_*'`). Liegt die Datei
schon irgendwo, **nicht** rekonstruieren — sonst add/add-Konflikt am selben Pfad.

## Merge: Warten und Mergen sind ZWEI Befehle

Ein Wartelauf, der in den Timeout läuft, darf nicht in einen Merge münden. Am 05.09. ist
genau so bei `build: pending` gemergt worden — es ging gut, war aber Glück.

```bash
# 1. warten (eigener Aufruf) — ein POSITIV verlangen:
#    Anzahl der Checks mit status==COMPLETED und conclusion==SUCCESS, nicht "kein Fehler".
# 2. mergen (eigener Aufruf) — nur wenn drei Checks pass UND Parent unverändert.
```

⚠ Bei laufenden Checks ist `conclusion` ein **leerer String**, nicht `null` — ein
`// "?"`-Fallback greift dort nicht und meldet fälschlich „fertig".
⚠ `gh pr merge … >/dev/null 2>&1` verschluckt den Fehlschlag: der PR bleibt offen, während
das Skript Erfolg meldet. Ausgabe lesen, Zustand danach prüfen.
⚠ Auf Windows verstümmelt MSYS Zeichenketten mit `/` (`MERGEABLE/CLEAN` wird zu
`MERGEABLEC:/Program Files/Git/CLEAN`) — Felder getrennt abfragen statt zu kombinieren.

## Gate-4 gehört zur Runde, nicht zur Kür

Nach dem Deploy die Nutzeroberfläche **laden und bedienen**, die die Runde eingeführt hat.
Am 05.09. ist R470 gemergt worden, ohne die einzige neue Seite je zu öffnen — sie lieferte
knapp drei Stunden HTTP 500. Gefunden wurde das nur, weil die Folgerunde eine **Vorher-
Baseline** nahm; ohne die wäre es zudem der falschen Runde angelastet worden.

**Vor** dem Merge messen, was die Runde anfasst — dann trennt die Messung „war schon kaputt"
von „durch diese Runde kaputt". Welche Journey betroffen ist: `npm run check:journey-bezug`.

## Verwandt

- `journey-verifikation` — welchen Lauf berührt dieser PR
- `regel4-smoke` — der Prod-Nachweis nach dem Merge
