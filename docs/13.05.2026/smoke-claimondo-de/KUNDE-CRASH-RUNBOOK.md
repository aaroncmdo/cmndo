# Runbook — Kunde-Portal-Crash (Digest 3073205500) — 13.05.2026

**Status:** Production-blockierend bestätigt durch 3 Smoke-Iterationen. Defensiver Fix bereitgestellt, ENV-Hypothese verifizierbar mit 1 SSH-Kommando.

---

## TL;DR

`https://app.claimondo.de/kunde` (Prod) UND `https://app.staging.claimondo.de/kunde` (Staging) zeigen allen echten Kunden einen lila Vollbild-Crash mit „🟣 APP ROOT CRASH (CMM-14 diag)" + Digest `3073205500`. **Kein einziger Kunde kommt aktuell ins Portal.**

**Wahrscheinlichste Ursache:** `SUPABASE_SERVICE_ROLE_KEY` ist auf VPS-PM2-Instanz nicht oder leer gesetzt → `createAdminClient()` in `src/app/kunde/layout.tsx:87` wirft → Server-Component-Render-Error → Root-Boundary fängt.

**Zwei parallele Fixes:**

1. **Defensiv (PR #924 — already pushed):** `try/catch` um `createAdminClient`. Layout rendert auch wenn Key fehlt (ohne Sidebar-Cards). Beendet den Vollbild-Crash sofort.
2. **Root-Cause (ENV-Fix auf VPS):** Key in `.env.local` setzen + PM2 reload. Echte Lösung.

---

## Diagnose-Trail (3 Iterationen)

### Iteration 1 (13:00–13:20 UTC)
- Smoke-Subagent gegen `app.staging.claimondo.de`
- Reproduce: `/kunde` zeigt lila Crash-Screen, Digest `3073205500`
- 24× Server-Component-Render-Error im Console-Log
- Marketing-Seite + Login funktionieren

### Iteration 2 (13:20–13:35 UTC)
- Fix-Subagent öffnet PR #917 mit defensivem try/catch
- PR #917 wird 13:24 UTC closed (vermutlich von paralleler Session ohne Merge)
- Re-Push als PR #924 mit identischem Fix-Commit `7813fc56`

### Iteration 3 (13:37–13:52 UTC)
- Smoke-Subagent verifiziert: UI-Click-Trail bis `/kunde` mit DB-Verifikation pro Aktion
- 15 Screenshots, Stop-on-Fail an Step 5 (`/kunde`-Navigate)
- DB-Watcher (`scripts/db-watcher.mjs`) korreliert: Login schreibt `profiles`-Session, `/kunde`-Aufruf macht KEIN DB-Zugriff vor Throw
- 3-Schichten-Token-Check Marketing: alle 3 Schichten konsistent (Code → CSS-Bundle → `getComputedStyle`)
- Bestätigt: `createAdminClient()` ist die werfende Stelle

---

## Code-Befund

```ts
// src/app/kunde/layout.tsx:87
const adminForNav = createAdminClient()
//                  ^^^^^^^^^^^^^^^^^ wirft synchron wenn
//                  process.env.SUPABASE_SERVICE_ROLE_KEY
//                  fehlt oder leer ist
```

Identisches Pattern existiert in `src/app/dispatch/dashboard/page.tsx:16` — wird dort aber durch `dispatch/error.tsx` aufgefangen, sodass nur Daten fehlen (keine lila Vollbild-Page).

**Warum Vollbild-Crash bei Kunde:** der Throw passiert IM Layout, nicht in den Children. `kunde/error.tsx` fängt nur Children-Throws, nicht den Layout-Throw → eskaliert zur Root-Boundary (`app/error.tsx` = lila CMM-14-Diagnose-UI).

---

## ENV-Verifikation (VPS, SSH)

```bash
ssh aaroncmdo@212.132.119.110 '
  echo "--- staging .env.local ---"
  grep "^SUPABASE_SERVICE_ROLE_KEY=" /var/www/claimondo-v2-staging/.env.local | head -c 40; echo
  echo "--- prod .env.local ---"
  grep "^SUPABASE_SERVICE_ROLE_KEY=" /var/www/claimondo-v2/.env.local | head -c 40; echo
  echo "--- staging pm2-env ---"
  pm2 env claimondo-v2-staging | grep "SUPABASE_SERVICE_ROLE_KEY" | head -c 40; echo
  echo "--- prod pm2-env ---"
  pm2 env claimondo-v2 | grep "SUPABASE_SERVICE_ROLE_KEY" | head -c 40; echo
'
```

**Erwartet:** 4 Zeilen mit `SUPABASE_SERVICE_ROLE_KEY=eyJh…`. Wenn eine fehlt/leer → Bug identifiziert.

**Security:** nur erste 40 Zeichen — kein voller Key im Log.

---

## ENV-Fix (falls Verifikation einen Mismatch zeigt)

Service-Role-Key holen: <https://supabase.com/dashboard/project/paizkjajbuxxksdoycev/settings/api>
→ Project API Keys → **service_role** (NICHT anon) → kopieren

```bash
# Variable lokal setzen
export SUPABASE_KEY='eyJhbGciOi...'  # vollständiger JWT, ~218 chars

# SSH-Kommando ausführen (idempotent + Backup + Verify)
ssh aaroncmdo@212.132.119.110 "
  set -e
  for DIR in /var/www/claimondo-v2 /var/www/claimondo-v2-staging; do
    FILE=\$DIR/.env.local
    cp \$FILE \${FILE}.bak.\$(date +%s)
    if grep -q '^SUPABASE_SERVICE_ROLE_KEY=' \$FILE; then
      sed -i 's|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_KEY|' \$FILE
    else
      echo 'SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_KEY' >> \$FILE
    fi
  done
  pm2 reload claimondo-v2 --update-env
  pm2 reload claimondo-v2-staging --update-env
  echo '--- prod ---'
  pm2 env claimondo-v2 | grep SUPABASE_SERVICE_ROLE_KEY | head -c 30; echo
  echo '--- staging ---'
  pm2 env claimondo-v2-staging | grep SUPABASE_SERVICE_ROLE_KEY | head -c 30; echo
"
```

**Wichtig:** `pm2 reload --update-env` ist Pflicht. Ohne `--update-env` behält PM2 die alte Env-Map.

**Falls GitHub-Secret die Source-of-Truth ist** (Deploy-Workflow schreibt `.env.local`):

```bash
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "$SUPABASE_KEY"
gh workflow run deploy-vps-staging.yml
gh workflow run deploy-vps.yml
```

---

## Code-Fix (PR #924 — defensiv, parallel zur ENV-Fix)

**Branch:** `kitta/aar-prod-cj-fix-01-kunde-layout-crash-v2`
**Commit:** `7813fc56`
**PR:** <https://github.com/aaroncmdo/cmndo/pull/924>

**Was geändert:**
1. `createAdminClient()` + `getKundeFaelle()` in `try/catch` gewrappt
2. 3× `adminForNav.from(...)` hinter `if (adminForNav && navFaelle.length > 0)` Guard
3. Dead-Import `SupportButton` entfernt

**Auswirkung mit Fix, ohne ENV-Fix:**
- Layout rendert ohne Sidebar-Cards (KB-Card, GutachterCard, EskaliertCard)
- Kunden sehen Portal-Skelett + Inhalt
- KEIN lila Crash mehr

**Auswirkung mit Fix UND ENV-Fix:**
- Volles Portal mit allen Sidebar-Cards

---

## Verifikation nach Fix

### Quick-Test (curl)
```bash
curl -sI https://app.staging.claimondo.de/kunde | head -3
curl -sI https://app.claimondo.de/kunde | head -3
```
Erwartet `200 OK` oder `302 → /login` (kein 500).

### Browser-Test
1. Login `test-kunde@claimondo.de` / `Test1234!` auf Staging
2. `/kunde` muss rendern (Portal-Skelett mindestens)
3. DevTools-Console: kein `Error: An error occurred in the Server Components render` mehr

### Re-Smoke (vollständig)
```bash
node docs/13.05.2026/smoke-claimondo-de/smoke-claimondo-full.mjs --staging-pass=<pw>
```
Oder neue Subagent-Iteration mit DB-Verifikation pro Schritt.

### DB-Watcher prüft Auto-Claim
```bash
tail -f docs/13.05.2026/smoke-claimondo-de/db-watcher-log.jsonl | grep faelle
```
Beim Login `test-kunde@claimondo.de` muss `faelle.kunde_id` für `SMK-KUNDE-2026-001` von `NULL` auf den User-UUID gesetzt werden (Auto-Claim in Layout-Logik).

---

## Sekundär-Findings (für später)

| ID | Befund | Priorität |
|---|---|---|
| **CMM-14-Debug-Boundaries** | `app/error.tsx` (lila), `kunde/error.tsx` (orange), `kunde/onboarding/error.tsx`, `global-error.tsx` sind alle Debug-Diagnose-Komponenten. In Prod ungeschmückt sichtbar. | P2 — UX-Polish nach P0-Fix |
| **`SMK-KUNDE-2026-001` Auto-Claim fired nicht** | `kunde_id = NULL` obwohl `test-kunde` Email matched. Code-Pfad `claimFaelleByEmail` prüfen. | P2 — separates Ticket |
| **Dispatch-Dashboard hat dasselbe `createAdminClient`-Pattern** | Wird durch `dispatch/error.tsx` abgefangen, Daten fehlen aber. Selbe Defense-Fix sinnvoll. | P3 |
| **ClaimStepper-Halb-Migration** | `bg-violet-50` blieb, `text-violet-500` → `text-claimondo-navy` (Phase-1-Sweep). Visuell inkonsistente Pille. | P3 — Polish |
| **3 Sessions auf demselben Branch** | Mehrfach passiert (`aar-879`, `aar-883`). Worktree-Setup eingerichtet (`scripts/new-session-worktree.mjs`). | mitigated |

---

## Status

- [x] Reproduce auf Staging + Prod
- [x] Root-Cause-Hypothese formuliert
- [x] Defensiver Fix (PR #924) gepusht
- [x] PR #924 reviewed + gemerged → staging (13.05. 13:58 UTC, Build SUCCESS)
- [x] Fix verifiziert auf `origin/staging:src/app/kunde/layout.tsx` (try/catch + `adminForNav`-Guard live)
- [x] **PR #929 (staging → main Sync) gemerged** (13.05. 14:43 UTC) → Fix auf `main`, Prod-Deploy success 14:47 UTC
- [x] **VPS-ENV verifiziert** via SSH — `.env.local` war auf **BEIDEN** Deploys **komplett gelöscht**: `/var/www/claimondo-v2/.env.local` + `/var/www/claimondo-v2-staging/.env.local` → File-not-found
- [x] **ENV-Fix appliziert** — `/tmp/claimondo-env-backup/.env.local` (Backup vom 09.05., 79 Vars, 4570 bytes) auf beide Deploys kopiert (`chown 1001:1001`, `chmod 600`), `pm2 restart --update-env` für `claimondo-v2` + `claimondo-v2-staging`. Live-curl `/kunde` von VPS-localhost: 307 Redirect (sauber, kein 500 mehr)
- [ ] **NEUER Prod-Fehler aufgetaucht — separates Ticket nötig** (siehe unten)
- [ ] Re-Smoke nach main-Deploy → grün (Browser-Login mit `test-kunde@claimondo.de`)
- [ ] Sekundär-Findings als Linear-Tickets (siehe Tabelle oben)

### NEUER Befund nach Restore — Digest `249001202`

In `pm2 logs claimondo-v2-error.log` taucht ein **anderer** Server-Component-Error auf:

```
⨯ Error: Event handlers cannot be passed to Client Component props.
  {tone: "ghost", size: "md", onPress: function onPress, children: ...}
                                       ^^^^^^^^^^^^^^^^
```

**Was:** Eine Server-Component rendert direkt `<Button onPress={...} />` (aus `primitives/`). Die `onPress`-Function lässt sich durch die Server→Client-Grenze nicht serialisieren.

**Wahrscheinlicher Verursacher:** P2-T7-Tabellen-Migration oder Branding-Rollout — irgendwo wurde ein bisheriger `<button onClick>` im Client durch einen `<Button>` aus dem Atom-Layer ersetzt, der jetzt von Server-Code aus eingebaut wird.

**Repro/Hunt:**
```bash
ssh root@212.132.119.110 'tail -200 /root/.pm2/logs/claimondo-v2-error.log | grep -B2 -A8 "Event handlers" | head -30'
# Stack-Trace zeigt welche Route. Dann lokal:
grep -rn "<Button[^>]*onPress=" src/app --include "*.tsx" | head
```
Lokales Triage-Ticket öffnen, NICHT in diesen Runbook mischen.

### Backup-Hygiene (nicht akut)

Auf dem VPS liegen drei Vor-Stände der `.env.local` rum:
- `/tmp/claimondo-env-backup/.env.local` (09.05. 21:30 — gebraucht für Restore)
- `/var/www/claimondo-v2.bak/.env.local`
- `/var/www/claimondo-v2.broken/.env.local`

Aufräumen nach Verifikation, sonst Drift-Risiko (Service-Role-Key ist sicherheits­relevant). Zusätzlich klären, **warum der Deploy `.env.local` weglässt** — ohne Fix wiederholt sich der Crash beim nächsten Deploy.

---

*Erstellt 13.05.2026 — Customer-Journey-Smoke-Hub-Session (`e1a43f0f-…`)*
*Update 13.05.2026 14:42 UTC — PR #924 gemerged, PR #929 (staging→main) offen*
*Update 13.05.2026 14:50 UTC — PR #929 gemerged, VPS-ENV restored aus `/tmp/claimondo-env-backup/`, `pm2 restart --update-env`, `/kunde` liefert 307 sauber. Neuer Befund (`249001202` — Button onPress Server→Client) als eigenes Ticket ausgewiesen.*
