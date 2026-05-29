# knip Dead-Code-Vollaudit — 2026-05-29

**Zweck:** Faktenbasis für die Entscheidung, ob/wie ein knip-CI-Gate eingeführt wird. Read-only, kein Code-Change.
**Methode:** knip mit Next-Plugin-Config (autounfall-io / scripts / *.native ausgeschlossen), dann 3 parallele Verifikations-Agenten — jede Kategorie unabhängig gegen den echten Code geprüft (nicht knip-Output geglaubt).
**knip-Config (Messung):** `next.entry` = App-Router-Konventionen, `project` = `src/**` ohne `*.native`, `ignore` = `database.types.ts`.

## Rohzahlen (Messung auf reines `src/`)

| Kategorie | knip-Count | Verifiziertes Echt-Tot | FP-Anteil |
|---|---|---|---|
| Unused files | 119 | ~80 (67 %) confidently dead | ~25 needs-eyes, ~4 knip-Limit (scripts) |
| Unused exports | 200 | ~70 (35 %) echt | ~55 % FP (Barrels + Server-Actions) |
| Unused exported types | 22 | grob echt | gering |
| Unused dependencies | 11 | **4** wirklich tot | 7 FP (Stub/Config/CLI/Types) |
| Unused devDependencies | 3 | 0 | 3 FP (CLI/PostCSS) |
| Unlisted dependencies | 8 | **1** real (playwright) | 7 transitiv/builtin |
| Duplicate exports | 2 | 2 trivial | — |

## Kategorie-Verdikte (verifiziert)

### Files (119) — gate-tauglich als Ratchet
- **~80 confidently dead:** `gutachter/fall/[id]/_components/*Card.tsx`-Cluster (11 + 3 `_actions`) = CMM-23-Refactor-Reste (FallDetailClient importiert sie nachweislich nicht, nur Kommentare); `components/landing/` 6 Files; `components/gutachter/` 4 Files; `lib/faq-bot/` 3; diverse `lib/`-Utilities mit 0 Konsumenten; `VersichererSelect`.
- **~25 needs-human-eyes:** `dispatch/leads/[id]/`-Cluster (6, mid-refactor-Kommentare), `components/claims/`-Invite-Cluster, `components/kunde/`-removed-but-commented (6), „dead-through-dead"-Ketten (`sla-config→SlaAlerts`, `stellungnahme-upload→StellungnahmeCard`).
- **~4 knip-Limit:** `src/scripts/*` (Standalone-CLI-Skripte) → gehören in `knip.json:entry`, NICHT löschen.
- **Dynamic-Import-FP-Check:** nur 2 `dynamic()` im Repo, beide korrekt behandelt → **0 FP** durch Lazy-Loading.

### Exports (200) — NUR als Ratchet, NICHT remediieren
- **~35 % echt tot** (reale Funktionen wie `getFinanceOverview`, `aircall/client`-Exporte).
- **~55 % FP:** (a) **Barrel-Re-Exports** — Leaf-File-Export via `index.ts`-Barrel konsumiert, knip sieht Leaf als unused (`shared/glass/*`, `shared/claims/*`, `mapbox/*`, `ui/dialog`/`sheet`). (b) **Server-Actions** via `<form action={fn}>`/`useActionState` — knip-blind.
- **Verdikt:** Frozen-Baseline-Ratchet OK (blockt nur NEUE), aber die 200 NICHT als Lösch-Liste behandeln. Barrel-FP via knip-Config reduzierbar.

### Server-Action-Files (16 der 119) — einzeln verifiziert
- **12 REAL-DEAD:** analytics-actions, call-actions, dispatch-fall-actions, ocr-actions, admin/finance, admin/sachverstaendige (Tombstone), ai-actions, onboarding-extra-actions, gutachter/profil (ersetzt durch `update-own-profile`), task-actions, geocode, besichtigungsort.
- **4 FALSE-POSITIVE (LIVE!):** `airdrop/server-actions` (→InviteGegnerModal), `abrechnungsart-actions` (→AbrechnungsartCard), `_actions/sv-kalender` (→SvKalenderVergleichModal), `_actions/konfrontation` (→KonfrontationsTerminCard). **Das ist der Beweis, dass Exports/Action-Files NICHT FP-frei sind.**

### Dependencies — NUR mit Whitelist gate-tauglich
- **Wirklich entfernbar (4):** `@vercel/analytics`, `@vercel/speed-insights`, `@vis.gl/react-google-maps`, `colorthief`.
- **FP — Whitelist Pflicht (7):** `@react-three/{drei,fiber,postprocessing}` (Stub-aliased in next.config), `@types/mapbox-gl`+`@types/pdf-parse` (implizite Type-Augmentation), `next-themes` (in sonner.tsx), `shadcn`+`supabase` (CLI), `tw-animate-css`+`tailwindcss` (CSS-`@import`/PostCSS).
- **Unlisted:** nur `playwright` real (sollte als devDep deklariert werden, 10+ scripts nutzen es); Rest transitiv/Next-builtin (`@next/env`, `server-only`, `google-auth-library`, `@react-email/preview-server`).

## Empfehlung (Scope-Optionen für Aarons Entscheidung)

| Option | Gate-Inhalt | FP-Risiko | Aufwand vorab |
|---|---|---|---|
| **Eng** | nur Deps (4 entfernen + Whitelist der 7 + playwright deklarieren), hart | sehr niedrig | klein |
| **Mittel** ⭐ | Files-Ratchet (Baseline ~119, blockt NEUE) + Deps hart mit Whitelist; Exports/Types als `--warn` | niedrig | mittel (knip.json + Baseline + scripts in entry) |
| **Voll** | Files + Exports + Types + Deps als Ratchet | mittel (Barrel/Action-FP in Baseline eingefroren, aber neue Barrels triggern) | hoch (Barrel-Config-Tuning nötig) |

**Meine Empfehlung: Mittel.** Files-Ratchet hat 0 Dynamic-FP und ~80 echte Funde als sofortigen Boy-Scout-Backlog; Deps-Hard-Gate mit der verifizierten 7er-Whitelist fängt echte Bugs (unlisted) ohne FP. Exports bleiben sichtbar (`--warn`), aber wegen 55 % Barrel/Action-FP NICHT blockierend — sonst rote CI bei jedem neuen Barrel-Export.

**Quick-Win unabhängig vom Gate:** die 4 toten Deps entfernen + `playwright` deklarieren + `shadcn`→devDep (verifiziert risikolos).
