# Smoke-Audit — Metadata-i18n Nachzug: Content-Hubs + schaden-melden

**Datum:** 2026-05-28 · **Branch:** `kitta/i18n-meta-hubs` · **Base:** `staging`
**Auftrag:** Aaron „ok go" — verbleibende öffentliche Seiten mit statischer Metadata nachziehen (nach #1923).

## Scope

4 Seiten von statischem `export const metadata` auf cookie-aware `generateMetadata` (ueber-uns-Pattern: `getTranslations('page_meta')` + `buildLanguageAlternates(path)` + `og:locale` de_DE):
- `decoder`, `haftpflicht`, `sachverstaendige` (Content-Hubs) — je title/description/og_title/og_description.
- `schaden-melden` (Mini-Wizard-Conversion-Seite) — title/description (hatte kein og/twitter → keins erfunden); hreflang ergänzt.

`page_meta` 24 → **28 Keys**, de mittig, en/tr/ar/ru/pl subagent-übersetzt (0 Entities; §/BGH/BVSK/DEKRA/GTÜ/KÜS/TÜV/ZKF/IfS/ZAK/IHK-öbV/DAT/Köln/Claimondo verbatim). Damit ist die **öffentliche Metadata-i18n-Abdeckung vollständig** (Rest = Legal/Subdomain bewusst out, [slug]/Cornerstone = Phase 2).

## Gates

- **Build:** `npm run build` exit **0** (sauber, kein EBUSY diesmal; static-gen validiert die 4 generateMetadata-Exporte).
- **`tsc --noEmit`:** keine Fehler in den 4 Seiten.
- **`check:i18n`:** 5/5 OK, je **1704 Keys** (1690 + 14), volle Parität, page_meta 28/28 keymatch.
- **Entity-Sweep** (page_meta, 6 Locales): 0.

## Smoke (`next start -p 3030`, Cookie-Locale, Playwright)

4 Seiten × {de, en, ar} = 12 Loads. **0 Crashes** (Regex deckt jetzt „APP ROOT CRASH"/„Server Components render" ab).
- **`document.title` lokalisiert** je Locale (de/en/ar), `dir=rtl` für ar. de byte-identisch (Strings 1:1 aus Original-Const nach page_meta verschoben).
- **Screenshot-verifiziert:** `decoder` (en) rendert — englische Nav + MdxLanguageBanner („only available in German") + deutscher Content-Body (Phase 2, Banner-angekündigt) + lokalisierter Tab-Title. `schaden-melden` (de) — Mini-Wizard-Form rendert vollständig („Wer ist schuld?", Unfalldatum/-ort, Kontaktfelder).
- Die 4 Seiten machen **kein** server-seitiges Supabase-`auth.getUser()` → rendern lokal sauber (anders als home im vorigen Smoke).

## Hinweise

- **Bodies bleiben deutsch:** Content-Hubs (Phase 2) + `schaden-melden`-Wizard-Form (eigene, separate Body-i18n) — hier wurde **nur Metadata** lokalisiert. Bei den Hubs kündigt der MdxLanguageBanner den deutschen Body an; beim Wizard ist die Form-i18n ein eigener Folge-Task.
- **Reichweite:** wie #1923 — Cookie-i18n → Crawler sehen de-Metadata; nutzersichtbar = Tab-Title; hreflang signalisiert Übersetzungen.
- **Pre-existing:** „… · Claimondo | Claimondo"-Doppel-Suffix (Root-Template + Seiten-Suffix) — nicht eingeführt.

## Verdikt

Öffentliche Metadata-i18n nun vollständig (28 Seiten). de unverändert, en/ar/tr/ru/pl komplett, Build + check:i18n grün, 0 Crashes. **Bereit für Review-PR gegen `staging` (nicht selbst mergen).**
