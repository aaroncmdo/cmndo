# HANDOFF — cluster-LP v15 Mock-Sync (Session 03.06.2026)

> Für die nächste Session: damit du **ohne Kontextverlust** anknüpfen kannst. Alles Wichtige steht hier.

## 🌟 TL;DR
3 Standalone-Next-16-LP-Apps (`kfz-unfallgutachter-{wuppertal,duesseldorf,bonn}.de`) werden auf den Mock (`preview-complete.html` / v3-praxis-v2) synchronisiert (Nicolas' v15-Strecke, Mock = Source-of-Truth). **Phase 1 + 1.5 + 2 sind KOMPLETT und LIVE auf allen 3 Clustern.** Verbleibt: **Phase 3 (Mobile, eigener Sprint — Spec liegt vor)**, Phase 4 (Aaron-Struktur-Entscheide), 4 offene Flags.

---

## 📍 Wo die Arbeit liegt
- **Worktree:** `.claude/worktrees/cluster-lp-v15-page-fixes/` (isoliert — keine Branch-Kollision mit anderen Sessions)
- **Branch:** `kitta/cluster-lp-v15-page-fixes` → **PR #2295** (base `staging`)
- **Apps:** `kfz-gutachter-{wuppertal,duesseldorf,bonn}/` im Worktree
- **Alle Commits sind gepusht.** Working-Tree: nur untracked Deploy-Skripte + Specs (bewusst, wie die anderen Session-Deploy-Skripte).

## 🧱 Architektur (WICHTIG — sonst trampelst du dich)
- **Components byte-identisch über alle 3 Apps** → **in `kfz-gutachter-wuppertal` editieren, dann nach d/b kopieren** (`Copy-Item`), Hash-Verify nach jedem cp.
- **Per-App verschieden (NICHT kopieren):** `lib/cluster.ts` (Cluster-Daten) + `app/globals.css` (Theme-Vars) → je App separat editieren.
- **Mock = SoT:** `C:\Users\Aaron Sprafke\Downloads\preview-complete.html` (215 KB; HTML-Sektionen Z.270–993, CSS/JS ab ~Z.2000). **Liegt NICHT im Repo** (kam aus Nicolas' Download-Bundle).
- **Tailwind-v4-Token-Mapping (GOTCHA):** rohe CSS-Vars = `var(--color-ink/-border/-muted/-surface/-secondary)` (@theme) + `var(--amber)`/`var(--petrol)`/`var(--petrol-tint)` (:root). **NICHT** `var(--ink)`/`var(--border)` — die existieren nicht (Spec-CSS muss umgemappt werden; siehe FAQ-CSS in `1f0a3d578`).
- **Komponenten via Tailwind-Klassen** (`bg-amber`/`text-petrol`/`bg-surface`) — die branden automatisch je Cluster-Theme. Echte Umlaute in allen UI-Strings.

## 🚀 Deploy = DIRECT-to-VPS (NICHT der staging/main-Flow!)
- VPS **212.132.119.110**, App-Dirs `/var/www/kfz-unfallgutachter-{c}-app`, pm2 `kfz-gutachter-{c}`.
- **Skripte:** `scripts/deploy-cluster-v15-*.py` (untracked, paramiko: SFTP-Upload geänderter Files → `npm run build` (Rollback-on-fail via .bak) → `pm2 reload` → curl-Verify). **Vorlage:** `deploy-cluster-v15-faq.py` — nur die `FILES`-Liste anpassen.
- **VPS_SSH_PASSWORD** liest das Skript aus env. **Aaron stellt es bereit** (steht NICHT im Repo/Doc). Inline:
  ```powershell
  $env:VPS_SSH_PASSWORD='<von Aaron>'; python scripts\deploy-cluster-v15-XXX.py wuppertal; Remove-Item Env:\VPS_SSH_PASSWORD
  ```
- **Muster:** immer **wuppertal zuerst → live-verifizieren → dann `duesseldorf bonn`**. Jede Variante = eigener Commit + eigener Deploy (granulares Review/Rollback).
- **PR = Review-Spur**; der Code geht per Skript **direkt live**, unabhängig vom Merge.

## ✅ DONE + LIVE (5 Commits auf PR #2295, alle 3 Cluster, je verifiziert)
| Commit | Inhalt |
|---|---|
| `7876c08f5` | Phase 1.5 **Burger-Nav** (Mobile/Tablet Off-Canvas) + Quick-Wins (FAQ-#8 gelöscht / Einsatz-Quelle / Über-uns Region-Dativ) |
| `60ba949e2` | Phase 2: **Leistungen-Alt-Texte** (Mock-exakt) + **Einsatzgebiet-areaTags-Pills** |
| `1f0a3d578` | Phase 2: **FAQ-Reconciliation v3-praxis-v2** (5 kuratiert + 2 Lokal-Cards + 4 Ratgeber-Pills) |
| `34e0da4bc` | FAQ **inline-bold** (Spec-1:1, JSON-LD-Sync) |
| `260c4d3be` | **Phase-3-Handoff** (docs) |
| `afb7aa815` | (Vor-Session) Phase 1a — Praxis-Hero-Stat + Copy-Quick-Wins + DIFF1/2 |

## 🧪 Smoke-Pattern (Aaron-Pflicht: Screenshot im selben Turn auswerten)
- Playwright @ **390×844** (Mobile) + Desktop 1280. Smoke-Skripte: `$env:TEMP\smoke_*.py` (nicht committet; nehmen URL-Arg → lokal *und* live nutzbar).
- **Dev-Server:** `npm run dev -- --port 3996` (bg). **Next-16 lockt PER DIR** → vorher 3996-Listener killen *und* etwaigen stale Dev-Server-PID killen (sonst „Another next dev server is already running"). Smoke-Skript macht **retry-goto** (deckt Server-Start). `with_server.py` spawnt npm ohne Shell → scheitert; lieber bg + retry.
- **Live-Smoke** gegen die echten URLs (`https://kfz-unfallgutachter-{c}.de/`) — echte Assets, hydratisierter DOM.

## ▶️ NEXT (so geht's weiter)
1. **Phase 3 — Mobile (9 Varianten, eigener Sprint):** vollständige Spec = `docs/03.06.2026/PHASE-3-mobile-handoff.md` (Audit + 9 Varianten nach Impact + Mock-Zeilen-Refs + Ziel-Files + Vorgehen-Muster). **Reihenfolge: #1 Leistungen-Karussell** → Reviews → Hero-0€ → Rest. Bestes Code-Vorbild für Desktop/Mobile-Split: `HeroSection.tsx` Z.90–139.
2. **Phase 4 — Aaron-Struktur-Entscheide:** Reviews-Struktur (Inline vs 7-Karten-Scroller), per-City-SEO-Text. Siehe Gap-Audit §5.
3. **Offene Flags (brauchen Aaron, NICHT autonom):**
   - **quellenAnker-Faktencheck:** „Quelle: Polizei-…-Bericht 2025" (Einsatzgebiet + FAQ) ist live = **Faktenbehauptung** auf legal-naher Seite → Provenienz der Brennpunkte bestätigen lassen, sonst neutral umformulieren.
   - **Mobile-Tel-CTA <640 versteckt:** Mock-Pattern (Burger trägt den Anruf). Falls Header-Anruf-Button auf Handys gewünscht → zurückholen (`hidden sm:inline-flex` in `Header.tsx`).
   - **Monika-Widget** (`data-logo`, `MonikaEmbedSlot.tsx`/`FabStack.tsx`): bleibt **HELD** — separate Session, NICHT mitdeployen.
   - **autounfall.io-Bild-Mapping:** eigene Spec, Aaron entscheidet Timing.
4. **Footer-Betreiber:** **KEIN Diff** (Nicolas bestätigt „Kitta & Sprafke UG (haftungsbeschränkt)" in Mock UND Live) → erledigt, nichts tun. (Frühere „Claimondo GmbH"-Annahme war False-Positive aus altem Mock.)

## ⚠️ Gotchas / Lessons (spar dir die Fallen)
- **JSON-LD-Sync (Pflicht, SEA):** `faqAnswerText()` (lib/content.ts) baut den Schema-Plain-Text aus **denselben Teilen** wie die sichtbare `FaqAccordion`; `faqSchema()` (lib/schema.ts) liest es → UI+Schema bleiben deckungsgleich. `**`-Bold-Marker werden für Schema gestrippt. Bei jeder FAQ-Copy-Änderung bleibt der Sync automatisch.
- **React-Kommentar-Split:** `{statischerText} {dynamicExpr}` rendert mit `<!-- -->` dazwischen → **raw-HTML-`grep` über die Grenze matcht nicht** (z.B. `grep 'im Rheinland'` schlägt fehl, obwohl sichtbar korrekt). Verify lieber über `locator.inner_text()` / hydratisierten DOM, nicht `pg.content()`.
- **cp1252-Terminal-Mangling:** ä/ö/ü/ß/€/· erscheinen als `�` im PowerShell-Output — **benign**, die Seite hat echte Umlaute (per inner_text gegenchecken).
- **Edit-Read-State läuft ab** nach Session-Reminder-Injektion (Datum-Wechsel / CLAUDE.md-Reload) → Datei **frisch lesen** direkt vor dem Edit.
- **Write-Tool** hängt zeitweise literales `</content>` ans Dateiende → nach jedem Write `grep '</content>'`.
- **globals.css-Append:** `Add-Content -Encoding utf8` (ASCII-CSS ist safe; Var-Namen vorher mappen).
- **commit -m mit Multiline/Sonderzeichen** zerbricht in PS 5.1 → Message in Temp-File schreiben + `git commit -F`. (Der „NativeCommandError" beim `git push` ist nur PS, das git-stderr wrappt — der Push läuft.)

## 📚 Referenzen
- **Phase-3-Spec:** `docs/03.06.2026/PHASE-3-mobile-handoff.md`
- **Gap-Audit** (alle 14 Sektionen + Phasen-Plan): `docs/03.06.2026/cluster-lp-mock-vs-live-gap-audit.md`
- **FAQ-Spec:** `C:\Users\Aaron Sprafke\Downloads\FAQ-RECONCILIATION_SPEC_2026-06-02.md`
- **Burger-Spec:** `C:\Users\Aaron Sprafke\Downloads\BURGER-NAV_SPEC_2026-06-02.md`
- **Mock:** `C:\Users\Aaron Sprafke\Downloads\preview-complete.html`
- **Memory:** `project_cluster_lp_v15` (`.claude/projects/.../memory/`)
