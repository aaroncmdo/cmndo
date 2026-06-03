# Migration-File UTF-8-Encoding-Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 139 Windows-1252-kodierten `supabase/migrations/*_placeholder.sql`-Stubs nach UTF-8 re-encoden, damit der Supabase-Preview-Check die Migrations-History wieder sauber durchspielt.

**Architecture:** Reiner Byte-Transform (cp1252 → UTF-8) der Kommentar-Stubs via Python-Einmal-Script; keine DDL-Änderung, keine DB-Wirkung. Verifikation per UTF-8-Validierung + Text-Identitäts-Check + git-diff-Inspektion. Optionaler CI-Guard gegen Wiederauftreten.

**Tech Stack:** Python 3 (Encoding-Transform + Validierung), git/gh (Branch + PR), Node (optionaler CI-Guard im `scripts/check-*.mjs`-Stil).

**Begleit-Spec:** `docs/superpowers/specs/2026-05-29-migration-utf8-fix-design.md`

---

### Task 0: Pre-Flight — Tracking-Mechanik bestätigen + Baseline

**Files:** keine (nur Lese-Checks)

- [ ] **Step 1: Bestätigen, dass weder CI noch Hook Migrations-INHALTE hasht**

Run:
```bash
grep -rniE "migration.*(hash|checksum|sha|digest)" scripts/ .github/ .claude/hooks/ 2>/dev/null || echo "KEIN content-hashing gefunden"
```
Expected: `KEIN content-hashing gefunden` (oder nur Treffer, die sich auf `version`/Timestamp beziehen, nicht auf Datei-Inhalt). Falls ein echter Content-Hash existiert → STOP, mit Aaron klären (ändert das Risiko).

- [ ] **Step 2: Baseline — exakt 139 bad-UTF8, alle placeholder, alle cp1252-clean**

Run:
```bash
python -c "
import glob
def bad(p):
    try: open(p,'rb').read().decode('utf-8'); return False
    except UnicodeDecodeError: return True
def cpok(p):
    try: open(p,'rb').read().decode('cp1252'); return True
    except Exception: return False
files=sorted(glob.glob('supabase/migrations/*.sql'))
b=[f for f in files if bad(f)]
ph=[f for f in b if f.endswith('_placeholder.sql')]
print('total',len(files),'bad',len(b),'placeholder',len(ph),'cp1252-ok',sum(cpok(f) for f in b),'non-placeholder',len(b)-len(ph))
"
```
Expected: `total 499 bad 139 placeholder 139 cp1252-ok 139 non-placeholder 0`
> Falls `non-placeholder > 0` oder `cp1252-ok < bad`: STOP — die Annahme „reine Kommentar-Stubs" gilt nicht mehr, Spec §4/§8 neu bewerten.

---

### Task 1: Re-Encode-Script schreiben

**Files:**
- Create: `scripts/fix-migration-utf8.mjs` *(oder inline-Python; Node-Variante passt zur `scripts/`-Familie)*

- [ ] **Step 1: Script anlegen (Node, idempotent, nur bad-Files, nur Kommentar-Bytes)**

```js
// scripts/fix-migration-utf8.mjs
// Einmal-Fix: re-encodet Windows-1252-kodierte placeholder-Stubs nach UTF-8.
// Sicher, weil die Stubs reine Kommentar-Marker sind (kein DDL). Idempotent.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const isValidUtf8 = (buf) => { try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true } catch { return false } }

let fixed = 0, skipped = 0
for (const name of readdirSync(DIR).filter((n) => n.endsWith('.sql'))) {
  const path = join(DIR, name)
  const buf = readFileSync(path)
  if (isValidUtf8(buf)) { skipped++; continue }            // schon UTF-8 -> nichts tun
  const text = new TextDecoder('windows-1252').decode(buf) // verlustfrei aus Latin-1
  const out = Buffer.from(text, 'utf-8')
  if (!isValidUtf8(out)) { console.error('STILL INVALID:', name); process.exitCode = 1; continue }
  writeFileSync(path, out)                                 // CRLF bleibt erhalten (ASCII-Bytes)
  fixed++
}
console.log(`re-encoded=${fixed} already-utf8=${skipped}`)
```

- [ ] **Step 2: Syntax-Check**

Run: `node --check scripts/fix-migration-utf8.mjs`
Expected: kein Output, exit 0.

---

### Task 2: Script ausführen

**Files:** Modify: `supabase/migrations/*_placeholder.sql` (139 Stück, nur Kommentar-Bytes)

- [ ] **Step 1: Re-Encode laufen lassen**

Run: `node scripts/fix-migration-utf8.mjs`
Expected: `re-encoded=139 already-utf8=360`

---

### Task 3: Verifikation (vor Commit)

**Files:** keine (nur Checks)

- [ ] **Step 1: Alle Migrations sind jetzt valides UTF-8**

Run:
```bash
python -c "
import glob
def bad(p):
    try: open(p,'rb').read().decode('utf-8'); return False
    except UnicodeDecodeError: return True
b=[f for f in glob.glob('supabase/migrations/*.sql') if bad(f)]
print('bad-utf8 verbleibend:', len(b)); print(b)
"
```
Expected: `bad-utf8 verbleibend: 0` und `[]`

- [ ] **Step 2: Diff berührt NUR Kommentarzeilen, KEIN DDL, KEIN non-placeholder-File**

Run:
```bash
git diff --numstat | grep -v "_placeholder.sql" | grep "supabase/migrations" || echo "NUR placeholder-Files geaendert"
git diff supabase/migrations | grep -E "^\+" | grep -vE "^\+\+\+" | grep -vE "^\+\s*--" | grep -v "^\+$" || echo "NUR Kommentar-/Leerzeilen hinzugefuegt"
```
Expected: `NUR placeholder-Files geaendert` **und** `NUR Kommentar-/Leerzeilen hinzugefuegt`

- [ ] **Step 3: Text-Identität stichprobenartig (Encoding änderte sich, Inhalt nicht)**

Run:
```bash
git show HEAD:supabase/migrations/20260411231056_placeholder.sql | python -c "import sys; print(sys.stdin.buffer.read().decode('cp1252'))" > /tmp/before.txt
python -c "print(open('supabase/migrations/20260411231056_placeholder.sql',encoding='utf-8').read())" > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt && echo "TEXT IDENTISCH"
```
Expected: `TEXT IDENTISCH`

---

### Task 4: Commit

- [ ] **Step 1: Committen**

Run:
```bash
git add scripts/fix-migration-utf8.mjs supabase/migrations
git commit -m "fix(migrations): 139 placeholder-Stubs Windows-1252 -> UTF-8 (Supabase-Preview entsperren)

Die Pre-Tracking-Placeholder-Stubs (PR #1279) waren Latin-1-kodiert (0xfc=ü
in der Template-Kommentarzeile). Die Supabase-Preview spielt die History von
vorne ein und starb am ersten Stub -> jede Migrations-PR bekam einen roten
(non-required) Preview-Check. Reiner Kommentar-Byte-Transform, 0 DDL-Aenderung.

Audit:
- Build: n/a (nur SQL-Kommentar-Bytes + Node-Script)
- UI: n/a
- Redundanz: Script in scripts/-Familie, kein iconv (fehlt in Shell)
- Dead-Code: Einmal-Script bleibt als dokumentierter Re-Run
- Spec: docs/superpowers/specs/2026-05-29-migration-utf8-fix-design.md, AK 1+2 erfuellt
- Inkonsistenz: nur _placeholder.sql, kein echtes DDL-File beruehrt
- Regression: versions-basiertes Tracking unberuehrt, keine DB-Wirkung

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Expected: 140 files changed (139 placeholder + 1 Script).

---

### Task 5 (optional, empfohlen): Recurrence-Guard

**Files:**
- Create: `scripts/check-migration-utf8.mjs`
- Modify: `package.json` (Script-Eintrag), CI-Workflow (`.github/workflows/*.yml`)

- [ ] **Step 1: Guard-Script**

```js
// scripts/check-migration-utf8.mjs — CI-Gate: alle Migrations muessen valides UTF-8 sein.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const DIR = 'supabase/migrations'
const dec = new TextDecoder('utf-8', { fatal: true })
const bad = []
for (const n of readdirSync(DIR).filter((n) => n.endsWith('.sql'))) {
  try { dec.decode(readFileSync(join(DIR, n))) } catch { bad.push(n) }
}
if (bad.length) { console.error('Ungueltiges UTF-8 in Migrations:\n' + bad.join('\n')); process.exit(1) }
console.log(`OK: ${readdirSync(DIR).filter((n)=>n.endsWith('.sql')).length} Migrations alle valides UTF-8`)
```

- [ ] **Step 2: package.json-Script + Syntax-Check**

`package.json` → `"scripts"`: `"check:migration-utf8": "node scripts/check-migration-utf8.mjs"`
Run: `node --check scripts/check-migration-utf8.mjs && node scripts/check-migration-utf8.mjs`
Expected: `OK: 499 Migrations alle valides UTF-8`

- [ ] **Step 3: In CI verdrahten** — den Step neben `check:token-audit` in den bestehenden Lint/Check-Job aufnehmen (gleiche Stelle, an der `check:token-audit` läuft). Commit.

---

### Task 6: Push + PR (gegen staging)

- [ ] **Step 1: Push + PR**

Run:
```bash
git push -u origin kitta/aar-migration-utf8-fix
gh pr create --base staging --title "fix(migrations): placeholder-Stubs UTF-8 (Supabase-Preview entsperren)" --body "Siehe docs/superpowers/specs/2026-05-29-migration-utf8-fix-design.md. 139 Latin-1-Stubs -> UTF-8, 0 DDL-Aenderung. Entsperrt die Supabase-Preview fuer alle Migrations-PRs."
```
Expected: PR-URL.

---

### Task 7: Akzeptanz — Supabase-Preview der Fix-PR wird grün

- [ ] **Step 1: Diese PR enthält Migrations-File-Änderungen → triggert die Preview**

Run: `gh pr checks <PR#>`
Expected: nach Build-Zeit zeigt **`Supabase Preview` = `pass`** (nicht mehr `fail`). Das ist der
Beweis, dass die History jetzt sauber durchläuft (Spec AK 3). `build` muss `pass` sein.
> Merge übernimmt die **Syncer-Session** (feature→staging). Nicht selbst auf main pushen.

---

## Self-Review (durchgeführt)

- **Spec-Coverage:** AK 1 → Task 3 Step 1; AK 2 → Task 3 Step 2; AK 3 → Task 7; AK 4 → folgt nach Merge. §7-Guard → Task 5. §8-Checksum-Risiko → Task 0 Step 1.
- **Placeholder-Scan:** keine TODO/TBD; jedes Code-Step hat realen Code + erwartetes Output.
- **Konsistenz:** `isValidUtf8`/`TextDecoder('utf-8',{fatal:true})` einheitlich in Fix- und Guard-Script; `re-encoded=139 already-utf8=360` (139+360=499) konsistent mit Baseline.
