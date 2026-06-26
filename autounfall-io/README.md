# autounfall.io

**Eigenständiges Next.js-16-Projekt** (Property 2, STANDALONE) — kein Mono-Repo,
kein `(hub)`-Route-Group/Host-Routing. Liegt als Unterordner `autounfall-io/` im
`claimondo-v2`-Repo, hat aber eigenen Build/Deploy/Server-Prozess und ist vom
`claimondo-v2`-Lint/Typecheck/Build ausgeklammert (`tsconfig`/`eslint` exclude).

## Stack
- Next.js 16.2.1 (App Router, `output: 'standalone'`), React 19, TypeScript strict
- Tailwind v4 (`@theme` in `app/globals.css`), lokale Fonts via `next/font/local`
- Analytics: **Plausible** (cookielos). KEIN GA4 / Google-Ads / Clarity.

## Befehle
```
npm install
npm run dev            # lokaler Dev-Server
npm run build          # next build (standalone)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run check:contrast # WCAG-Kontrast-Floor 0/0 (Token-Paare)
```

## Brand / Tokens
- Tokens in `app/globals.css` `@theme` (Quelle: Prototyp `au-base.css` / `au-tailwind-config.js`).
- **Accent = Orange `#C04920` (textsicher) / `#FF7849` (dekorativ)** — 2026-05-23-Token-Spec.
  Ersetzt das ältere 2026-05-17-Amber (`#B45309`) aus `au-base.css`; die Prototyp-Header
  tragen bereits `#C04920` (Logo-Punkt). Token-Namen `au-amber*` bleiben (270-Seiten-Port),
  nur die Werte wandern auf die neue Marke. `au-amber-dark` (`#92400E`) = textsicherer
  Accent auf `paper-warm` / Prose-Links.
- Werte als Hex (nicht OKLCH) — 1:1-Treue zur Port-Quelle, kein Konvertierungs-Drift.

## Entity (STANDALONE)
publisher / author = **ausschließlich Kitta & Sprafke UG**. `#legal-reviewer = LexDrive UG`
bleibt benannt. **KEIN Claimondo** (kein `#partner-service`, kein Name/Logo/Telefon, keine
claimondo.de-Links). Siehe `ENTITY-MODELL-LOCK v2`.

## Offen (Aaron — blocken WP-0 nicht)
- Eigene **au.io-Telefonnummer** (`NEXT_PUBLIC_SITE_PHONE`). `0221 25906530` = kfzgutachter-
  Footprint → bis dahin Platzhalter (`SITE.phone = null`).
- Eigene **GSC-Property** (am Launch-Tag, nicht mit claimondo verknüpfen).
- **Repo-Ort** final (Unterordner vs. eigenes Repo) — Default Unterordner, blockt nicht.
- Datenschutz §7: Auftragsverarbeiter der Formular-Daten (Kevin/Aaron) → WP-1.

## WP-Roadmap (1 WP = 1 Branch `kitta/aar-au-NN-…` = 1 PR vs `staging`)
- **WP-0 Foundation** (dieses) — Scaffold, Tokens, Fonts, Logo, Layout, Plausible, JsonLd, Kontrast-Gate.
- WP-1 Pflichtseiten · WP-2 Article-Port · WP-3 Decoder-Port · WP-4 Tools · WP-5 PSEO (noindex)
- WP-6 Lead-Form (`anfragen` → RPC) · WP-7 Rest-Seiten · WP-8 Infra (PM2 `:3002`) · WP-9 Regression
