# Zwischenstand · Cluster-LP + Monika-Embed — für Nicolas

**Datum:** 2026-06-04
**Von:** Claude-Code-Session (Branches `cluster-lp-v15-mobile-rest` + `aar939-embed-ga4`)
**Zweck:** Onboarding + wo du am besten andockst. Stand ist live-verifiziert, keine Schätzungen.

---

## TL;DR — wo du SOFORT am meisten hilfst

1. **Frontend-Detail-Verifikation §2.1–2.30** (`ANFRAGE_CLAUDE_CODE_ARCHITEKTUR_SYNC_2026-06-04.md`) — 30 Kategorien, hunderte Items gegen Tasks #1–238. **Riesig + parallelisierbar.** Nimm dir Kategorien-Blöcke (z. B. 2.1–2.10 Hero/Header/Trust). Antwort-Format ✅/🔄/❌/❓ → ins `DECISIONS.md`.
2. **audit-fixes-Patches deployen** — S1/S4a/S6/S7 sind **gebaut aber NICHT live** (verifiziert, alle 0). Sie liegen im Worktree `cluster-lp-v15-audit-fixes`. Sobald gemerged → der **neue Auto-Deploy-Workflow** (s. u.) zieht sie live.
3. **`tokens.json`-Lint-Check bauen** — `scripts/gen-tokens-check.mjs` (greppt die 7 `:root`-Hex je Cluster gegen `tokens.json`, failt bei Drift). Entschieden, noch nicht gebaut. Kleines CI-Script.

---

## Was diese Session geliefert hat (LIVE + verifiziert)

### A · Cluster-LP-Cleanup (alle 3 Domains live)
- **v3-Master-Siegel** — war 404 (nie committet), jetzt in `kfz-gutachter-*/public/assets/brand/siegel-claimondo-partner-v3.svg`. **Byte-exakt der Master** (md5 `5b79de62fbaf98f51786b088539cced3`, 3946 B). Live = 200 auf allen 3.
- **Monika-FAB zeigt das Siegel** statt Monikas Foto (`MonikaEmbedSlot data-logo` → v3-Siegel). Visuell bestätigt.
- **Mobil-Hero verdrahtet** — separates `hero-{c}-mobile.webp` greift via CSS-Swap (`--hero-mobile` :root + `@media(max-640) .hero-photo-bg{background-image:var(--hero-mobile)!important}`). Vorher lag das Bild ungenutzt rum.
- **Fold an der Display-Kante** — Hero `min-h-[640px]` → `min-h-[100dvh]` (Hero-Höhe == Viewport, mobil verifiziert 844=844).

### B · NEUER Cluster-Auto-Deploy (das war das Hauptproblem)
- **`.github/workflows/deploy-vps-cluster.yml`** — vorher gab es **keinen** Auto-Deploy für die Cluster (`deploy-vps.yml` deckt nur die Haupt-App ab).
- Baut pro Cluster (Matrix) auf **ubuntu-latest** (richtige Plattform — lokal/Windows bricht wegen native swc; die VPS-Source wird von einem anderen Prozess ge-cleant → dort bauen unzuverlässig), packt den Standalone, scp → atomarer Swap nach `/var/www/kfz-unfallgutachter-{c}-app`, **img-Symlink → `/var/www/kfz-assets/{c}` neu** (schwere Bilder bleiben out-of-repo), `pm2 reload` + **curl-200-Verify + Rollback**.
- Trigger: `push main` (Cluster-Paths) + `workflow_dispatch`. **Alle 3 am 04.06. via CI live deployed + verifiziert.**

### C · AAR-939 Monika-Embed
- **Per-SV Client-Conversion** (PR **#2408**, MERGED): SV trägt im Embed-Cockpit (`/gutachter/einstellungen/embed`) seine GA4-/Google-Ads-Conversion-IDs ein → Widget feuert bei Anfrage-Erfolg client-seitig `gtag` direkt in DAS GA4/Ads des SV (per-SV isoliert, kein Make/Zapier). + Schema (`embed_sites` +2 Spalten) + Config-Endpoint + G1-Fix (`monika_anfrage_submit` nur bei Erfolg).
- **Cluster-LP-Conversion-Bridge** (env-gated): `SiteScripts` fängt `monika_anfrage_submit` im dataLayer → `fireAdsConversion('lead')` per-Cluster (für Aarons zentrales GA4/Ads).
- **G2 + Backlink** (PR **#2413**, OFFEN): embed-track-Beacon CORS-Fix (`sendBeacon` text/plain); SEO-Backlink + powered-by-Link → **claimondo.de** (waren `app.claimondo.de/sv-netzwerk` = 404 auf beiden Domains; Backlink jetzt `claimondo.de/kfz-gutachter`, powered-by `claimondo.de`).

### D · Architektur-Sync (A+C)
- **`tokens.json`** (`Downloads/tokens.json`) — Düsseldorf + Bonn Tints/Shades aus den Live-`:root` gefüllt + verifiziert. Single-Source für Mock + Next-Build.
- Empfehlung **A+C** (tokens.json + DECISIONS.md), B optional. Token-Read = **manueller Sync + CI-Lint-Check** (kein Generator für 3 Cluster). Tints/Shades **hardcoded** (designt, nicht berechnet).

---

## Handoff-Status (genauestens, gegen `UEBERGABE_..._BUNDLE.md` §8)

| Item | Owner | Status |
|---|---|---|
| #1 v3-SVG committen + Repoint-Revert | ich | ✅ live, byte-exakt Master |
| #4 tokens.json d/b füllen | ich | ✅ `Downloads/tokens.json` |
| #8 Deploy 3 Cluster | ich | ✅ alle 3 live (Reihenfolge: Canary Wuppertal zuerst, dann d/b parallel via Matrix — statt seriell Wpt→Bonn→DD, aber jeder mit eigenem Verify+Rollback) |
| #5 DECISIONS.md Engineering-Decisions | ich | 🔄 Inhalte stehen (s. u.), müssen noch ins `DECISIONS.md`-File |
| #3 Worktree-Merge-Order | Aaron/Merge | ⏳ Baseline-Branch gepusht; Merge cleanup-first → audit-fixes pending |
| #2 S1/S4a/S6/S7 | audit-fixes-Session | ❌ noch NICHT live (verifiziert: alle 0) |
| #6 §2.1–2.30 Verifikation | audit-fixes-Session | ⏳ offen — **hier Nicolas** |
| #7 S4b Person-Schema | Aaron (svNames) + audit-fixes | ⏳ blockt auf svNames DD/Bonn |

**Meine Engineering-Decisions fürs DECISIONS.md (bitte anhängen):**
- Mobil-Hero via CSS-`!important`-@media-Swap (Desktop-BG bleibt inline; Gradient-`::after` unangetastet; kein `<picture>`).
- Fold: `min-h-[100dvh]` (dyn. Viewport, respektiert Mobile-Browserleiste).
- FAB `data-logo` → v3-Siegel (statt Foto).
- Backlink/powered-by → `claimondo.de` (Origin-unabhängig hardcoded; `/sv-netzwerk` war 404 → `/kfz-gutachter`).

---

## Offene Punkte (priorisiert)

| # | Punkt | Owner | Notiz |
|---|---|---|---|
| 1 | §2.1–2.30 Detail-Verifikation | **Nicolas/audit-fixes** | groß, parallelisierbar |
| 2 | S1/S4a/S6/S7 bauen + deployen | audit-fixes | rebased auf meinen Baseline, dann Workflow zieht's live |
| 3 | Merges: Baseline + audit-fixes (Reihenfolge) + #2413 reviewen | Merge-Session/Aaron | |
| 4 | svNames Düsseldorf + Bonn | Aaron | blockt S4b Person-Schema (UWG) |
| 5 | `gen-tokens-check.mjs` (Token-Drift-Lint) | **Nicolas** | kleines CI-Script, Entscheidung steht |
| 6 | Mock-Sync (S5 Ratgeber, DUS petrol, token-loader) | Aaron | Mock = Live nachziehen |
| 7 | Echte `/sv-netzwerk`-Seite auf claimondo.de? | Marketing | Backlink zeigt vorerst auf `/kfz-gutachter` (200) |
| 8 | Per-SV-Tracking go-live | SV-Onboarding | Cockpit live (#2408); SV trägt GA4/Ads-IDs ein |

---

## Technische Landkarte

- **3 Cluster-LPs** = 3 eigene Next-16-Apps `kfz-gutachter-{wuppertal,duesseldorf,bonn}/`. Komponenten **byte-identisch** (edit wuppertal → `cp` d/b); nur `lib/cluster.ts` + `app/globals.css :root` unterscheiden sich.
- **Cluster-Deploy** = NUR über `deploy-vps-cluster.yml` (Linux-CI). Die alten `scripts/deploy-cluster-*.py` (SFTP-build-in-`-app`) sind **tot** (Modell geändert: `-app` ist jetzt nur Standalone, Source nach `/var/www/claimondo-v2/kfz-gutachter-{c}/` verschoben + wird ge-cleant).
- **Assets:** `public/assets/img` = Symlink → `/var/www/kfz-assets/{c}/` (schwere Bilder out-of-repo, rebuild-safe). Nur `public/assets/brand/` ist in-repo.
- **Haupt-App-Deploy** = `deploy-vps.yml` (push main) / `deploy-vps-staging.yml` (push staging) → `app.claimondo.de`. Fasst die Cluster NICHT an.
- **Branches/PRs:** `cluster-lp-v15-mobile-rest` (Baseline: Cleanup + v3 + Conversion-Bridge + Deploy-Workflow) · `aar939-embed-ga4` (auf `kitta/aar-939-embed-track-cors` = PR **#2413** G2+Backlink, OFFEN) · PR **#2408** Per-SV-Conversion MERGED · Worktree `cluster-lp-v15-audit-fixes` (S1/S4/S6/S7 + §2.x).
- **VPS** 212.132.119.110, pm2 `kfz-gutachter-{c}` (eigene Ports, nginx-proxy). Cluster-Prod-Env in `-app/.env.local` (`NEXT_PUBLIC_MONIKA_EMBED_ENABLED=true`, `EMBED_BASE=app.claimondo.de`).

---

## Wo Nicolas konkret andockt (nach Skill)

- **Frontend/Audit:** §2.1–2.30 (Hero/Header/Trust/Praxis/Compare/Ablauf/…); ggf. S1/S4/S6/S7 mit der audit-fixes-Session.
- **CI/DevOps:** `gen-tokens-check.mjs` (Token-Drift-Lint); optional den Cluster-Workflow-Verify härten (Content-Check statt nur HTTP-200).
- **Content/Marketing:** echte `/sv-netzwerk`-Seite auf claimondo.de; Mock-Sync.
- **Review:** PR #2413 (G2+Backlink), Baseline-Branch.
