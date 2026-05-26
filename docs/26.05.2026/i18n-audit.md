# i18n-Audit — claimondo-v2 (Stand 2026-05-26)

> Voller Audit der Internationalisierung. Methode: Infrastruktur gelesen (`src/i18n/*`, `scripts/i18n/translate.mjs`), Message-Files vermessen (Leaf-Key-Count je Locale), next-intl-Konsumenten gegrept, Live-vs-Dead je Komponente verifiziert. Basis: `origin/staging` (nach Doc 45/46 + a11y/perf-Merge).

---

## Verdikt (TL;DR)

**Die i18n-Infrastruktur ist sauber + vollständig übersetzt — aber ~80 % der übersetzten Keys sind „stranded" (verwaist), und die gesamte echte User-Surface ist hardcoded Deutsch.**

- next-intl ist korrekt aufgesetzt, **6 Locales**, alle Message-Files **383 Keys, 0 Lücken** (100 % synchron, via Claude-Pipeline + Glossar).
- Aber: **nur 9 Dateien** konsumieren next-intl, und davon sind **5 tote Komponenten** (0 Renders). Die großen übersetzten Namespaces `gutachter_finder.*` (14 Keys) und `flow.step*` haben **null Konsumenten** — sie gehören zu Flows, die später hardcoded-deutsch neu gebaut wurden (HauptseitePremium ersetzte LandingHero; Mini-Wizard + Gutachter-Finder-Karte wurden neu gebaut).
- Die **Live-Marketing-Surface** (Homepage, kfzgutachter-LP, Stadt-Pages), **alle 6 Portale** (~449 Files), **Emails** (~20 Templates), **PDFs**, **MDX-Content** und die **Brand-Constants** (`service-pitch.ts`, inkl. meiner Doc-45/46-Strings) sind **100 % hardcoded Deutsch**.
- **hreflang-Risiko:** Doc 37 bewirbt 6 Sprachen für Marketing-Routes, aber bei Cookie-Locale (kein URL-Prefix) zeigen alle hreflang-Alternates faktisch auf dieselbe (deutsche) URL — SEO-seitig wirkungslos/irreführend.

→ **Das ist der „worst of both": Übersetzungs-Aufwand + SEO-hreflang-Versprechen laufen ins Leere, während faktisch alles Deutsch ausgeliefert wird.** Entscheidung A vs. B (unten) sollte VOR weiterer i18n-Arbeit fallen.

---

## 1 · Setup & Infrastruktur

- **Lib:** `next-intl` (v4), Server-Config `src/i18n/request.ts`.
- **Locale-Quelle:** Cookie `claimondo-locale` → `src/i18n/request.ts` lädt `./messages/${locale}.json`. **Kein URL-Prefix** (bewusst, AAR-459) — Sprachwahl rein per Cookie.
- **Locales (`src/i18n/locales.ts`):** `de` (Default), `en`, `tr`, `ar`, `ru`, `pl` → 6.
- **Switcher:** `src/components/shared/LanguageSwitcher.tsx` (live).
- **Provider:** `NextIntlClientProvider` in `src/app/layout.tsx`.

## 2 · Message-Coverage (Zahlen)

`src/i18n/messages/<locale>.json` — **alle 383 Leaf-Keys, 0 fehlend vs. de:**

| Locale | Größe | Keys | Δ vs de |
|---|---|---|---|
| de (Basis) | 26 KB | 383 | — |
| en | 25 KB | 383 | 0 |
| pl | 26 KB | 383 | 0 |
| tr | 26 KB | 383 | 0 |
| ar | 31 KB | 383 | 0 |
| ru | 37 KB | 383 | 0 |

**5 Namespaces:** `landing`, `flow`, `common`, `ueber_uns`, `gutachter_finder`. → Die JSON-Übersetzung ist technisch tadellos & vollständig.

## 3 · Konsum-Realität: live vs. stranded (Kern-Befund)

**Nur 9 Dateien** nutzen next-intl:

| Datei | Namespace | Status |
|---|---|---|
| `app/ueber-uns/page.tsx` | `ueber_uns.*` | **LIVE** |
| `components/landing/LandingFooter.tsx` | `landing.footer` | **LIVE** (von LandingPage gerendert) |
| `app/schaden-melden/selbstverschulden/page.tsx` | `flow.abort` | **LIVE** |
| `components/shared/LanguageSwitcher.tsx` | (Locale-Labels) | **LIVE** |
| `components/landing/LandingHero.tsx` | `landing.hero` | **TOT** (0 Renders) |
| `components/landing/LandingSteps.tsx` | `landing.steps` | **TOT** (0 Renders) |
| `components/landing/LandingTrust.tsx` | `landing.trust` | **TOT** (0 Renders) |
| `components/landing/LandingSeoContent.tsx` | `landing.seo` | **TOT** (0 Renders) |
| `components/landing/LandingDatTeaser.tsx` | `landing.dat_teaser` | **TOT** (0 Renders) |

**Verwaiste (stranded) Keys — übersetzt ×6, aber 0 Live-Konsum:**
- `landing.{hero,steps,trust,seo,dat_teaser}` → speisen die 5 toten Komponenten (Homepage rendert `HauptseitePremium`, nicht diese).
- `gutachter_finder.*` (14 Sub-Keys: wann, schaden, fahrzeug, gps, karte, detail, ansprueche, formular, erfolg, legal, routing, vor_ort_*) → **kein einziger Konsument** (die `/gutachter-finden`-Karte wurde hardcoded-deutsch gebaut; die einzigen „gutachter_finder"-Treffer im Code sind die DB-Tabelle `gutachter_finder_anfragen`).
- `flow.{progress,common,step0,step1,step2a,step2b,step2c,step3,step4}` → kein Konsument (nur `flow.abort` lebt). Der Mini-Wizard (`/schaden-melden`, AAR-904) ist hardcoded Deutsch.

→ **Grob ~80 % der 383 Keys sind verwaist.** Live konsumiert: `ueber_uns.*`, `landing.footer`, `flow.abort`, `common.*` (Switcher/Buttons). Die `i18n:translate`-Pipeline übersetzt seit Wochen tote Keys mit.

## 4 · Hardcoded-German Live-Surface (das, was User wirklich sehen)

Alles hardcoded Deutsch, **keine** Message-Keys:
- **Marketing:** `HauptseitePremium` (Live-`/`) + alle `landing/sections/*`, `kfzgutachter-lp/page.tsx`, `kfz-gutachter/[stadt]/page.tsx`.
- **Brand-Constants:** `src/lib/brand/service-pitch.ts` (Hero-Headlines, Bullets, USPs, CTAs — inkl. der Doc-45/46-Strings).
- **Portale:** `admin`, `dispatch`, `gutachter`, `kunde`, `makler`, `kanzlei` (~449 Files, 0 next-intl).
- **Emails:** `src/lib/email/google/templates/*` (~20 Templates).
- **PDF-Generation** + **MDX-Content** (Cornerstones/Spokes/Decoder).

## 5 · hreflang / SEO-Spannung

Doc 37 hat `langAlternates` (de-DE, en-US, ar, tr-TR, pl-PL, ru-RU + x-default) auf Marketing-Routes gesetzt. Aber: **Locale läuft über Cookie, nicht über URL.** Damit zeigen die hreflang-Alternates aller 6 Sprachen auf **dieselbe URL**, die **immer Deutsch** ausliefert (die Marketing-Seiten nutzen keine Messages). Konsequenz: hreflang ist SEO-seitig wirkungslos bis irreführend (Google erwartet pro Sprache eine eigene, sprachlich passende URL). → **Cross-Check mit Doc 37 nötig**; entweder echte per-Sprach-URLs (z. B. `/en/...`) + übersetzte Seiten, oder hreflang zurückbauen.

## 6 · Pipeline + CI-Lücken

- **`scripts/i18n/translate.mjs`:** Quelle `de.json` → 5 Ziel-Locales via `claude-sonnet-4-6` + `glossary.md`, erkennt fehlende/geänderte Keys, Batches ≤30, Fallback auf Deutsch. Übersetzt **nur die Message-JSONs** — NICHT MDX-Content, hardcoded JSX, Emails, PDFs. Commands: `npm run i18n:translate [locales] [--force]`.
- **Kein CI-Gate** für Key-Vollständigkeit (aktuell 0 Lücken — aber nichts hält das durch).
- `npm run smoke:marketing` crawlt 6 Sprachen, prüft aber nur HTTP/Console, **nicht** ob Inhalt tatsächlich übersetzt ist. (Zu prüfen: Smoke-Kommentar referenziert Cookie `NEXT_LOCALE`, Code liest `claimondo-locale` — möglicher Mismatch.)

## 7 · Empfehlung — erst Strategie, dann Code

**Entscheidung A vs. B sollte zuerst fallen (Produkt-Call):**

### A) German-first bestätigen (entspricht AGENTS.md „deutsches Produkt für deutsche Nutzer")
- Tote Komponenten `LandingHero/Steps/Trust/SeoContent/DatTeaser` + die verwaisten Keys (`landing.{hero,steps,trust,seo,dat_teaser}`, `gutachter_finder.*`, `flow.step*`) **prunen** (Dead-Code + tote Übersetzungs-Last weg).
- hreflang (Doc 37) **zurückbauen** auf das, was wirklich mehrsprachig ist — sonst SEO-Irreführung.
- next-intl für die wenigen echten Surfaces (ueber-uns, Footer, Abort, Switcher, Claim-Flow für nicht-deutsche Geschädigte) behalten oder bewusst stilllegen.
- **Geringer Aufwand, beseitigt Illusion + Dead-Code + hreflang-Risiko.**

### B) Mehrsprachigkeit ernst nehmen (falls nicht-deutsche Geschädigte echte Zielgruppe sind — v. a. der Magic-Link-Claim-Flow)
- Eng scopen auf die **claimant-facing** Strecke (Kunde-Portal + Claim-Flow + Gutachter-Finder), **nicht** die internen Portale (admin/dispatch).
- Live-Surfaces auf Message-Keys umstellen (HauptseitePremium, LP, Stadt-Pages, `service-pitch.ts` extrahieren).
- **Per-Sprach-URL-Strategie** einführen (Cookie-only bricht hreflang-SEO → `/en/`-Prefix o. ä.).
- CI-Gate: alle Keys in allen 6 Locales + „kein Fallback-auf-Deutsch im Render".
- **Großer Aufwand.**

**Sofort sinnvoll (unabhängig A/B):** die ~80 % verwaisten Keys + 5 toten Komponenten sind heute reiner Ballast — Prune oder Wire ist überfällig. Und der hreflang/Cookie-Konflikt ist ein konkreter SEO-Bug, der separat geklärt gehört.

---

*Audit ohne Code-Änderung. Zahlen reproduzierbar: Leaf-Key-Count via Node-Flatten über `src/i18n/messages/*.json`; Konsum via `grep -rlE "useTranslations|getTranslations|from 'next-intl'" src` (9 Files) + `grep "<LandingHero" src` (0 Renders) + `grep "gutachter_finder" src` (nur DB-Tabelle).*
