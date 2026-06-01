# HANDOFF — i18n-SEO (live) + P5 Marketing-Monolith-Cleanup · Session 31.05.2026 (spät)

Stand bei Compaction. Zwei Strecken: **i18n-SEO** (live auf :3006) + **P5** (Monolith-Cleanup, PR offen/held).

## 🟢 LIVE auf claimondo.de (:3006) — DEPLOYED + verifiziert
i18n-SEO ist live: `de` prefix-frei (`/vorteile`), `en/tr/ar/ru/pl` crawlbar (`/en/vorteile` …), self-canonical pro Locale, hreflang (echte URLs), Sitemap (Locale-Alternates + `/versicherer`-Cluster). **Cookie/Nav:** Sprache trägt beim Seitenwechsel via `claimondo-locale`-Cookie (consent-UNABHÄNGIG gesetzt), Crawler cookielos → de (canonical), kein Loop. Dyn. Routen (84 Städte + Content-Spokes) rendern (ƒ). PM2 `claimondo-marketing` :3006 stabil (restarts=0).

- **Deploy:** `VPS_SSH_PASSWORD=… PYTHONIOENCODING=utf-8 python scripts/deploy-marketing-vps.py` (Tarball `C:\Users\Aaron Sprafke\stampit-app\stampit-app\claimondo-marketing-src.tgz`, VPS-build, Aaron-Override). VPS-Rollback: `/var/www/claimondo-marketing.bak-pre-i18n` (1.2G).
- VPS = 212.132.119.110 root. **⚠️ Root-PW wurde im Chat exponiert → ROTIEREN.**

## PRs (beide OFFEN, NICHT gemmerged)
| PR | Branch / Worktree | Base | Status |
|---|---|---|---|
| **#2117** i18n-SEO | `kitta/marketing-i18n-locale-urls` · `.claude/worktrees/marketing-i18n-locale-urls` | `kitta/marketing-subdomains-makler-kfzgutachter` (gestackt) | LIVE auf :3006 (override-deploy, merge-unabhängig); CI grün |
| **#2121** P5 Monolith-Cleanup | `kitta/p5-marketing-aus-monolith` · `.claude/worktrees/p5-marketing-aus-monolith` | `staging` | 282 Deletions + knip-Fix; **NICHT deployed** (git only); knip-Gate grün; **vom Review GEHALTEN** wg. „200→404" → s. Befund unten |

## 🔑 Kern-Befunde / Gotchas
1. **next-intl `as-needed` ist in Next16/Turbopack/standalone kaputt** (unpräfixierte de-Pfade → 404/307-Loop). Lösung: **eigene deterministische Middleware** (`claimondo-marketing/middleware.ts`) — unpräfixiert→`/de/` rewrite, `/de`+`/<locale>/` durchlassen, Cookie set+read. Memory: `feedback_nextintl_asneeded_next16`.
2. **`[locale]`-Layout nutzt `headers()` (Tracking) → Routen sind ƒ (dynamisch).** Daher KEIN `generateStaticParams` (weder im Layout noch in `[stadt]`/`[slug]` — SSG+headers = `DYNAMIC_SERVER_USAGE`-500; ausserdem OOMt 6×Locale-Prerender den 2GB-VPS). Alle dyn. Routen rendern on-demand, `notFound()` fängt unbekannte Slugs.
3. **Monolith = Blanket-Soft-404:** liefert **200 für JEDEN** unbekannten `/haftpflicht/*`-Slug (Test: `/haftpflicht/total-quatsch-xyz123` → :3000 = 200, kein H1).

## #2121 Review-Hold — Befund: KEIN echter Gap (Soft-404-Artefakt)
Review hielt #2121 wg. „Monolith serviert `/haftpflicht/allianz` etc. (200), :3006 nicht (404) → P5 killt sie". **Verifiziert:** `/haftpflicht/<versicherer>` UND die 10 nicht-nummerierten Spoke-Slugs (`mitverschulden-stvg`, `schmerzensgeld-bgb` …) sind **alle Soft-404** (kein H1, „404"-Marker, NICHT in Live-Sitemap). **Alle echten Haftpflicht-Seiten** = §-nummerierte Slugs (`mitverschulden-stvg17`, `schmerzensgeld-bgb253`) → **:3006 = 200** (volle Content-Parität). → P5 macht Soft-404→Hard-404 = **SEO-korrekt, kein Content-Verlust**. Monolith-`:3000`-Sitemap hat 10 stale nicht-nummerierte Einträge (Pre-Split-Bug); Live-Sitemap (:3006) hat die korrekten.
- **Empfehlung:** #2121 entsperrbar. **Optional** (Gürtel+Hosenträger): 10× 301-Redirect auf :3006 `…-stvg`→`…-stvg17` (+ versicherer-slugs) falls historisch indexiert.

## ⏭️ Offen (Aaron-Entscheidungen / nächste Schritte)
1. **#2121 entsperren** (mein Befund: ja) ODER erst die 10 Redirects bauen (ich kann).
2. **#2117 + #2121 mergen** (P5 im ruhigen src/-Fenster — destruktiver 282-Files-Delete; aktuell 8+ parallele src/-Sessions).
3. **P4 (nginx-Fallback `claimondo.de 404 → :3000` entfernen)** — NUR NACH P5-Merge+Deploy (VPS, Aaron). Bis dahin harmloses Netz.
4. **„Site-Texte trennen"** (Claimondo koordiniert / LexDrive Kanzlei verhandelt rechtlich) — **NOCH NICHT BEGONNEN.** Strategischer Copy-Task → `section-audit`-Skill (s.u.) ist das Tool (Copy-Inventory nach Wirkung). Erster Schritt: Ist-Aufnahme wo die Site Claimondo/LexDrive heute vermischt.
5. **Root-PW rotieren.** Leftover: `claimondo-marketing-src.tgz` (deploy-artefakt), `.bak-pre-i18n` (VPS, 1.2G).

## section-audit Skill (neu installiert)
`~/.claude/skills/section-audit/` (ab nächster Session `/section-audit`). 7-Phasen-LP-Section-Framework (Diagnose→Copy-Inventory→Optionen→Empfehlung→Mockup→Detail-Fragen→Build). Aus Downloads/section-audit.skill (Zip) extrahiert + installiert.

## Tooling-Notizen
- VPS-Exec: `PYTHONIOENCODING=utf-8 VPS_SSH_PASSWORD=… python scripts/vps-ssh-exec.py '<cmd>'` (UTF-8-Flag nötig wg. pm2-Box-Chars).
- Tarball: `tar --force-local -czf …` (GNU-tar interpretiert `C:/` sonst als Remote-Host).
- Prod-Smoke dyn. Routen IMMER :3006-direkt (nginx-Fallback maskiert :3006-404).
- Lokaler i18n-Build: `NODE_OPTIONS=--max-old-space-size=4096 npm run build` (12 Seiten, ƒ).
