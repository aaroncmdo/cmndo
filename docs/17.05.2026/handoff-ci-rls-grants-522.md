# Handoff — CI rot org-weit: `RLS-Function-Grants`-Step / Supabase 522

> **Für den ausführenden Agent:** Dies ist ein **Infra-Diagnose-Auftrag**, kein Feature. Kein TDD, kein App-Code. Ziel: Ursache des org-weiten CI-Ausfalls feststellen, beheben oder sauber eskalieren, und PR #1406 mergebar machen. Schritte mit Checkbox (`- [ ]`).

**Goal:** Die `CI`-Pipeline ist auf **allen** Branches rot, weil der Pre-Build-Step `RLS-Function-Grants` einen Cloudflare-`522`-Timeout von der Supabase-API bekommt. Diagnostizieren, beheben (oder eskalieren), CI wieder grün bekommen — damit PR **#1406** (CMM-44 SP-A PR1) gemergt werden kann.

**Stand:** 2026-05-17, erstellt von der CMM-44-SP-A-Session.

---

## 1 · Situation (verifizierter Stand)

PR **#1406** (`kitta/cmm-44-spa-pr1-reader-sweep` → staging, CMM-44 SP-A PR1) hat einen roten `build`-Check. Untersuchung ergab: **kein Code-Problem**.

- `npm run build` lokal (mit `NODE_OPTIONS=--max-old-space-size=8192`) ist **vollständig grün**, `tsc --noEmit` clean.
- Der CI-Job `CI` (Workflow `.github/workflows/ci.yml`) hat **vor** dem `Build`-Step einen Step **`RLS-Function-Grants`** (ci.yml:69-73): `node scripts/check-rls-function-grants.mjs`. Dieser Step failt → `Build` läuft danach gar nicht erst.
- Fehler: Supabase-API liefert eine Cloudflare-HTML-Fehlerseite `522: Connection timed out` (Projekt `paizkjajbuxxksdoycev`).
- **Org-weit:** Die letzten `CI`-Runs auf `staging`, `main`, `kitta/sync-main-staging-1404`, `kitta/release-staging-main-1404` sind **alle `failure`** und liefen teils **~1h22m** (statt normal ~6m). Es ist kein PR-1406-spezifisches Problem.
- Die `Deploy → VPS`-Workflows (`deploy-vps.yml`, `deploy-vps-staging.yml`) laufen dagegen **grün** durch — nur die `CI`-Pipeline mit dem DB-Step ist betroffen.

### Wichtig: Retry ist bereits drin

`scripts/check-rls-function-grants.mjs` hat seit PR #1329 (Fix nach einem 522-CI-Failure am 15.05.2026) **bereits Retry-Logik**: `RETRY_DELAYS_MS = [8_000, 20_000, 45_000]` → 4 Versuche, `isTransient()` erkennt 520/521/522/524 + `fetch failed`/`ECONNRESET` etc. Der Step failte **trotz** dieser Retries → der 522 hielt länger als das Retry-Fenster (~73s+ kumuliert; der Step lief im PR-1406-Run ~2,5min). Das spricht für eine **anhaltende** Supabase-API-Degradation, nicht für ein kurzes Transient.

### Beteiligte Dateien

| Datei | Rolle |
|---|---|
| `.github/workflows/ci.yml` (Step `RLS-Function-Grants`, Z. 69-73) | ruft das Skript als Pre-Build-Step |
| `scripts/check-rls-function-grants.mjs` (132 Z.) | RPC `audit_rls_function_grants` gegen Supabase, mit Retry |
| `supabase/migrations/20260515111313_aar921_audit_rls_grants_rpc.sql` | Backing-Function `public.audit_rls_function_grants()` (service_role-only) |

Memory-Referenzen: `feedback_supabase_connections` (522 = Cloudflare-Timeout, kein DB-Fehler; bei 522 zuerst lokale Last prüfen — kleiner Connection-Pool, parallele Sessions/Dev-Server killen ihn), `feedback_rls_function_grants` (warum es den Step überhaupt gibt — AAR-894-Inzident).

---

## 2 · Ziel & Erfolgskriterium

**Erfolg:** Der `CI`-Workflow läuft auf `#1406` wieder grün durch (oder es ist sauber festgestellt + dokumentiert, dass es ein Supabase-Plattform-Incident ist, der nur abgewartet werden kann — dann mit konkretem Recovery-Zeitpunkt/Plan). PR #1406 wird **nicht** mit rotem Pflicht-Check gemergt; erst wenn grün, gibt die CMM-44-Session den Merge frei.

---

## 3 · Diagnose-Schritte

- [ ] **Schritt 1: Ist die Supabase-API aktuell erreichbar?**
  Vom Repo-Root (das Haupt-Repo hat `.env.local` mit `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`):
  ```bash
  # REST-Health
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
    "$(grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2)/rest/v1/" \
    -H "apikey: $(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2)"
  ```
  Erwartung grün: HTTP `200`/`401`/`404` in <2s. Erwartung Outage: `522`/`524` oder Timeout.

- [ ] **Schritt 2: Das CI-Skript lokal laufen lassen.**
  ```bash
  node scripts/check-rls-function-grants.mjs
  ```
  - Läuft grün durch (<5s) → der 522 war GitHub-Edge↔Supabase-spezifisch oder zwischenzeitlich erholt → weiter Schritt 5 (CI neu starten).
  - Failt mit 522 → die API ist auch von hier unerreichbar → echte Degradation, weiter Schritt 3.
  - Failt mit echtem RPC-Fehler (Function fehlt / permission denied) → **anderer** Bug, nicht der 522 — dann ist die Migration `20260515111313` evtl. nicht appliziert; das gesondert melden.

- [ ] **Schritt 3: Supabase-Projekt-Status prüfen.**
  Projekt-Ref `paizkjajbuxxksdoycev`. Prüfen (Aaron hat Dashboard-Zugang — ggf. per `! `-Befehl an Aaron delegieren):
  - Supabase-Dashboard → Projekt-Status: aktiv? pausiert? „degraded"?
  - https://status.supabase.com — Plattform-Incident?
  - Compute/Connection-Auslastung: Pool erschöpft? (Memory `feedback_supabase_connections`: kleiner Pool → parallele Claude-Sessions / mehrere `next dev` gegen Prod-DB → 522.)

- [ ] **Schritt 4: Lokale Last reduzieren (falls Schritt 3 Pool-Erschöpfung zeigt).**
  - Andere aktive Claude-Sessions, die `db query`/Dev-Server gegen die Prod-DB fahren, identifizieren und pausieren (Marker unter `…/memory/`).
  - Supabase-Studio-Tabs / offene `npx supabase`-Prozesse schließen.
  - Danach Schritt 2 wiederholen.

---

## 4 · Behebung — Entscheidungsbaum

- [ ] **Fall A — API ist (wieder) erreichbar** (Schritt 1/2 grün):
  Reine Transient-Erholung. CI von #1406 neu starten:
  ```bash
  gh run rerun <run-id> --failed     # aktueller Run-ID via: gh pr checks 1406
  gh pr checks 1406 --watch --interval 30
  ```
  Auch die hängenden `CI`-Runs auf `staging`/`main` neu starten, damit die Branch-Historie wieder grün ist.
  → grün: an die CMM-44-Session zurückmelden „CI grün, #1406 mergebar".

- [ ] **Fall B — Supabase-Plattform-Incident** (status.supabase.com zeigt Incident):
  Nichts zu fixen — abwarten. Incident-Link + ETA dokumentieren, periodisch Schritt 1 wiederholen, bei Recovery → Fall A. An Aaron melden.

- [ ] **Fall C — Projekt pausiert / Quota / Pool dauerhaft erschöpft:**
  Kein Code-Fix. An Aaron eskalieren (Projekt reaktivieren / Compute hochstufen / Pooler-Limit). Recovery-Plan dokumentieren.

- [ ] **Fall D — API erreichbar, aber CI-spezifisch instabil** (Schritt 2 lokal grün, CI weiter rot am selben Step):
  Dann ist das Retry-Fenster im Skript für die GH-Edge↔Supabase-Strecke zu kurz. **Mögliche Härtung** (nur mit Aaron-OK, da es CI-Verhalten ändert):
  - `RETRY_DELAYS_MS` in `scripts/check-rls-function-grants.mjs` erweitern (z.B. `[8_000, 20_000, 45_000, 90_000, 120_000]`) — mehr Versuche, tolerantere Strecke.
  - **Trade-off bedenken:** der Step ist eine bewusste Drift-Bremse (AAR-921). Ihn „weicher" zu machen darf den echten Audit-Zweck nicht aushebeln — echte RPC-Fehler müssen hart-fatal bleiben (`isTransient()` trennt das bereits sauber).
  - **Nicht** tun: den Step löschen / `continue-on-error: true` setzen — das deaktiviert die Drift-Bremse.
  - Wenn geändert: eigener Branch von `origin/staging` (`kitta/aar-ci-522-retry-haerten` o.ä.), Migration-frei, PR gegen staging mit Audit-Block.

---

## 5 · Constraints

- **Nie direkt auf `main`/`staging` pushen** (AGENTS.md Regel 1). Eigener Branch, PR gegen `staging`.
- **Eigener Worktree** — mehrere Sessions laufen parallel (`node scripts/new-session-worktree.mjs <slug>` oder `git worktree add`).
- **Kein Merge von #1406 mit rotem Pflicht-Check.** Erst wenn `build`/`CI` grün ist, gibt die CMM-44-Session den staging-Merge frei (Freigabe liegt vor — galt implizit „Build grün").
- Umlaut-Hook blockt ASCII-Ersatz in Commit-Messages.
- Bei Skript-Änderung: `npx tsc --noEmit` bzw. `node scripts/check-rls-function-grants.mjs` lokal grün vor PR.

## 6 · Rückmeldung

Nach Abschluss an die CMM-44-SP-A-Session zurückmelden, mit klarem Status:
- **CI grün** → #1406 mergebar, SP-A PR2 kann starten.
- **Plattform-Incident/Quota** → Recovery-Plan + ETA, #1406 bleibt blockiert.
- **CI-Härtung nötig** → Hinweis auf den separaten Härtungs-PR.

Kontext zu #1406: CMM-44 SP-A PR1 (Reader/Writer-Sweep 34 DUP-Spalten `faelle`→`claims`), 44 Files, 11 Commits, 6 Reviews bestanden, Build lokal grün. Spec/Plan: `docs/superpowers/specs|plans/2026-05-16-cmm44-spa-duplikat-drops*`. PR2 (DROP COLUMN) ist nach #1406-Merge dran und braucht ebenfalls eine erreichbare Supabase-API.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
