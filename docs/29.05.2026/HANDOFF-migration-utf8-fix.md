# HANDOFF — Migration-File UTF-8-Fix (Supabase-Preview entsperren)

**Datum:** 2026-05-29 · **Von:** Syncer-Session · **Status:** ready to implement (nach Aaron-Review)
**Spec:** `docs/superpowers/specs/2026-05-29-migration-utf8-fix-design.md`
**Plan (Schritt-für-Schritt):** `docs/superpowers/plans/2026-05-29-migration-utf8-fix.md`

---

## In 3 Sätzen

Der **Supabase-Preview**-Check failt bei **jeder** PR mit einer Migration — er spielt die History
von vorne ein und stirbt am ersten von **139** `supabase/migrations/*_placeholder.sql`-Stubs, die
**Windows-1252** statt UTF-8 kodiert sind (`0xfc`=„ü" in der Template-Kommentarzeile). Der Fix ist
ein reiner **Kommentar-Byte-Transform** cp1252→UTF-8 (0 DDL-Änderung, keine DB-Wirkung). Es ist
**non-required** (Build-Gate ist unberührt), aber es nimmt allen Migrations-PRs ihr Sicherheitsnetz.

## Wichtige Gotchas (sonst Zeitverlust)

1. **`iconv` gibt es in der Windows-Git-Bash NICHT** (exit 127). Ein `iconv -f UTF-8 …`-Scan meldet
   fälschlich **alle 499** Files als kaputt. **Nutze Python** zum Prüfen UND Fixen. Wahrheit = 139.
2. **Nur `_placeholder.sql` anfassen.** 0 echte DDL-Files betroffen (verifiziert). Non-ASCII steckt
   ausschließlich in `--`-Kommentaren → die DDL bleibt byte-identisch.
3. **Eigener Worktree, nicht der geteilte `aar-939-monika-embed`-Checkout** (dort arbeiten viele
   Sessions). PR `--base staging`. **Mergen macht die Syncer-Session** — du nur PR + build grün.
4. **Pre-Flight (Plan Task 0):** kurz greppen, dass kein CI/Hook Migrations-**Inhalte** hasht
   (Tracking ist versions-basiert → re-encode ist sicher). Bei Treffer: mit Aaron klären.

## Minimal-Weg (Copy-Paste)

```bash
# 1. eigener Worktree von aktuellem staging
git -C "<repo>" fetch origin --prune
git -C "<repo>" worktree add -b kitta/aar-migration-utf8-fix "<repo>/.claude/worktrees/migration-utf8-fix" origin/staging
cd "<repo>/.claude/worktrees/migration-utf8-fix"

# 2. fixen (nur bad-UTF8-Files, cp1252 -> UTF-8; CRLF bleibt)
python -c "
import glob
for p in glob.glob('supabase/migrations/*.sql'):
    raw=open(p,'rb').read()
    try: raw.decode('utf-8'); continue
    except UnicodeDecodeError: pass
    open(p,'wb').write(raw.decode('cp1252').encode('utf-8'))
    print('fixed', p)
" | wc -l    # erwartet: 139

# 3. verifizieren: 0 bad verbleibend
python -c "
import glob
def bad(p):
    try: open(p,'rb').read().decode('utf-8'); return False
    except UnicodeDecodeError: return True
print('verbleibend bad:', sum(bad(p) for p in glob.glob('supabase/migrations/*.sql')))
"   # erwartet: verbleibend bad: 0

# 4. Diff-Sanity: nur placeholder-Files, nur Kommentarzeilen
git diff --numstat | grep "supabase/migrations" | grep -v "_placeholder.sql" || echo "OK: nur placeholder"

# 5. commit + push + PR (Body/Audit siehe Plan Task 4/6)
git add supabase/migrations
git commit -m "fix(migrations): 139 placeholder-Stubs Windows-1252 -> UTF-8 (Supabase-Preview entsperren)"
git push -u origin kitta/aar-migration-utf8-fix
gh pr create --base staging --title "fix(migrations): placeholder-Stubs UTF-8" --body "Siehe docs/superpowers/specs/2026-05-29-migration-utf8-fix-design.md"
```

## Optional, empfohlen (verhindert Wiederkehr)

`scripts/check-migration-utf8.mjs` + `package.json`-Script `check:migration-utf8`, neben
`check:token-audit` in CI verdrahten. Fertiges Script: Plan Task 5.

## Done = 

- [ ] `verbleibend bad: 0` (alle 499 valides UTF-8)
- [ ] Diff nur `_placeholder.sql`, nur Kommentarzeilen
- [ ] PR `--base staging`, `build` grün, **`Supabase Preview` jetzt `pass`** (← der eigentliche Beweis)
- [ ] (optional) UTF-8-Guard in CI
