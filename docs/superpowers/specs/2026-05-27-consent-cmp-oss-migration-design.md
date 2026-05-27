# Spec: Cookiebot → self-hosted Open-Source-CMP (Consent Mode v2 erhalten)

**Datum:** 2026-05-27
**Branch:** `kitta/consent-cmp-oss-spec` (Spec) → Impl-Branch folgt
**Status:** Design — Review ausstehend (Aaron)
**Trigger:** Cookiebot kassiert pro Domain. Subdomains (`kfzgutachter.claimondo.de`) sind nicht in der Domain-Gruppe → Banner rendert dort nicht → Consent bleibt `denied` → GA4 „nicht konfiguriert". Die Subdomain freizuschalten kostet Geld (Aaron will das nicht). Lösung: Cookiebot raus, freies self-hosted CMP rein — **Google Consent Mode v2 bleibt vollständig erhalten.**

---

## Problem / Ausgangslage

- **Live (PR #1756, 26.05.):** Cookiebot-CMP (CBID `496ea8a7-…`, `data-blockingmode="auto"`) + GCM v2, host-gated auf `{claimondo.de, www, kfzgutachter.claimondo.de}` via `isCookiebotHost`. gtag consent-default (7 Signale denied) + `config` in `layout.tsx`, host-gated auf `{claimondo.de, www}` via `isTrackingHost`. LP hat eigene GA4-Property `G-9YF2W9ZP2S` + GTM `GTM-KZNCZB2Z`.
- **Bug (dokumentiert in Memory `project_ga4_tracking_setup`, OFFEN #1; per Smoke 27.05. re-bestätigt):** Cookiebot rendert kein Banner auf `kfzgutachter.claimondo.de` — Console: *„domain … is not authorized … add it to the domain group"*. Consent steckt auf `gcs=G100` (denied); selbst programmatischer `submitCustomConsent` greift nicht. Folge: GA4 sieht nur consent-denied Modeling-Pings → „nicht konfiguriert".
- **Cost-Blocker:** Subdomain zur Cookiebot-Domain-Gruppe hinzufügen = kostenpflichtig. Nicht gewollt.
- Vorgeschichte: Bis #1756 lief ein eigener `react-cookie-consent`-Banner (Spec `2026-05-25-ga4-consent-mode-design.md`); der wurde bewusst durch Cookiebot ersetzt (für CMP-Komfort: Auto-Cookie-Scan + zentrales Consent-Log). Dieser Komfort ist Cookiebots Bezahl-Mehrwert — den decken wir hier leichtgewichtig selbst ab.

## Ziele

1. **Cookiebot vollständig ersetzen** durch ein self-hosted Open-Source-CMP — gratis, **kein Domain-Limit**, läuft identisch auf Apex + allen Marketing-Subdomains.
2. **Google Consent Mode v2 1:1 erhalten:** gtag consent-`default` (7 Signale, denied) bleibt; CMP feuert `gtag('consent','update', …)` aus den Kategorie-Entscheidungen. GA4/Ads/Modeling unverändert.
3. **DSGVO/TDDDG-konform:** Prior-Consent (keine nicht-essenziellen Cookies vor Einwilligung), granular (Statistik/Marketing getrennt), gleichwertige Accept/Reject-Buttons, jederzeit widerrufbar.
4. **Consent-Nachweis** (Audit): leichtgewichtiges Consent-Log in Supabase (Choice + Timestamp + Policy-Version + zufällige Consent-ID, **keine** überflüssige PII).
5. **Cookie-Deklaration** als gepflegte statische Liste (kurz + stabil bei unserem Stack).
6. Kein Banner / kein CMP auf authenticated Portalen (wie bisher) — dort nur necessary Cookies.

## Non-Goals

- Server-side Measurement Protocol (läuft schon, eigener Scope).
- Auto-Cookie-Scanning (Cookiebot-Feature) — wir pflegen die Cookie-Liste manuell (Stack ist überschaubar).
- IAB TCF / Werbe-Vendor-Strings (kein Ad-Vendor-Ökosystem; nur Google).
- Migration der GA4-Properties / Conversion-Logik (bleibt wie #1721/#1763).

## CMP-Auswahl

**Empfehlung: `vanilla-cookieconsent` (orestbida/cookieconsent v3)**
- MIT, vanilla-JS (kein React-Zwang), ~kompakt, **dokumentierte GCM-v2-Integration**, granulare Kategorien, optionales `data-category`-Auto-Blocking, `showPreferences()` für Widerruf, i18n eingebaut. Sehr aktiv.
- **Self-hosted:** via npm gebündelt (kein externer CDN-Call) → echt first-party, läuft auf jedem Host.

**Alternative: Klaro!** (MIT, deutsch, gleiche Features) — gleichwertig; orestbida gewinnt wegen schlankerer GCM-Beispiele + kleinerem Footprint. Entscheidung umkehrbar, Architektur identisch.

## Entscheidungen (Defaults — Review durch Aaron)

| Thema | Entscheidung | Begründung |
|---|---|---|
| CMP | vanilla-cookieconsent v3, **npm-gebündelt** (self-host) | gratis, alle Domains, kein CDN-Risiko |
| Blocking-Modell | **Consent-Mode-only, KEIN Hard-Block** | gtag/GTM laden immer, GCM-`denied` → keine Cookies, cookieless Modeling-Pings bleiben; entspricht heutigem Verhalten |
| Kategorien | **granular**: necessary (immer) · statistics (GA4, Clarity) · marketing (Google Ads) | DSGVO-sauberer als binär; orestbida kann's gratis |
| Default | alle nicht-essenziellen **rejected**, gleichwertige „Alle akzeptieren"/„Ablehnen" | TDDDG §25 / DSGVO |
| GCM-Mapping | statistics→`analytics_storage` (+`functionality_storage`); marketing→`ad_storage`/`ad_user_data`/`ad_personalization` | Standard GCM v2 |
| Host-Gate | bestehende Allow-list, erweiterbar auf alle Marketing-Subdomains (gratis), **nicht** Portale | wie heute, ohne Domain-Kosten |
| Consent-Nachweis | Supabase-Tabelle `consent_records` (minimal, keine IP) | Audit-Nachweis ohne Cookiebot |

### ⚠️ Compliance-Entscheidung, die Aaron/DPO bestätigen muss
**Consent-Mode-only (kein Hard-Block)** heißt: gtag/GTM **laden** auch ohne Einwilligung, senden aber bei `denied` nur **cookieless** Pings (kein `_ga`-Cookie, keine PII-Speicherung) — Googles empfohlener GCM-v2-Weg, DSGVO-vertretbar (keine Speicherung ohne Consent). **Maximal-strikt** wäre Hard-Block (Skripte laden gar nicht vor Consent) — dann verlierst du das Modeling. Empfehlung: Consent-Mode-only (= heutiges Verhalten beibehalten), aber **DPO-Sign-off einholen**; bei Bedarf auf Hard-Block umstellbar (orestbida `data-category`).

## Architektur

Eine Consent-Quelle (First-Party-Cookie `claimondo-consent` + Event `claimondo:consent-changed`) → Consumer:

1. **`layout.tsx` (server)** — rendert (host-gated) **unverändert** den gtag-Block: `consent default` (7 Signale, denied/granted aus dem Cookie für Wiederkehrer) → `js` → `config`. **Kein** Cookiebot-`uc.js` mehr.
2. **`ConsentManager` (client, NEU)** — initialisiert das OSS-CMP (Kategorien, i18n, Buttons), feuert bei Auswahl `gtag('consent','update', …)` (Kategorie→GCM-Mapping) + schreibt den Consent-Record. Nur auf Marketing-Hosts gemountet.
3. **`ClarityInit` (client)** — init bei statistics-Consent (sofort wenn Cookie ok, sonst auf Event).
4. **`ga4-conversions.ts`** — Capture-Gate liest das neue Consent-Cookie statt Cookiebot.

Geteilte Logik bleibt in `src/lib/analytics/consent.ts` (umgeschrieben: Cookiebot-Bits raus, neutrale Consent-Helper rein; `isTrackingHost`/Host-Gating bleibt).

### Consent-Flow
- Request → `layout` liest `host` + `claimondo-consent`-Cookie → gtag-Block (host-gated) mit Default aus Cookie (Wiederkehrer = granted, kein Flicker).
- `ConsentManager` mountet auf Marketing-Host → CMP zeigt Banner (falls noch keine Wahl):
  - „Alle akzeptieren" → `consent update {all granted}` + `consent-changed`-Event + Record schreiben.
  - „Ablehnen" → bleibt denied (Record „rejected").
  - Granular → pro Kategorie mappen.
- Widerruf: Footer-Link „Cookie-Einstellungen" → `cookieconsent.showPreferences()`.

### Error-Handling
- Alle `window.gtag?.()` optional-chained. CMP-Init in try/catch (Banner-Fehler darf Seite nicht brechen). Consent-Record-Write fire-and-forget (Tracking-Log-Fail bricht nichts). Host-Parsing-Guards bleiben.

## Datei-für-Datei

1. **`src/lib/analytics/consent.ts`** (umschreiben)
   - RAUS: `COOKIEBOT_CBID`, `COOKIEBOT_COOKIE_NAME`, `COOKIEBOT_CONSENT_EVENT`, `parseCookiebotConsent`, `isCookiebotHost`.
   - REIN: `CONSENT_COOKIE_NAME='claimondo-consent'`, `CONSENT_CHANGED_EVENT`, `CONSENT_POLICY_VERSION`, `parseConsent(cookie)`→`{statistics,marketing}`, `hasTrackingConsent()` (liest neues Cookie). `MARKETING_HOSTS` (Apex+www+kfzgutachter + erweiterbar) ersetzt `COOKIEBOT_HOSTS`. `isTrackingHost`/`isMarketingHost` bleiben. Plain-Modul (server+client importierbar).
2. **`src/app/layout.tsx`** — Cookiebot-`<Script id="Cookiebot" …uc.js>` **entfernen**; `ConsentManager` (host-gated auf Marketing-Hosts) mounten. gtag-consent-default-Block **unverändert**.
3. **`src/components/analytics/ConsentManager.tsx`** (NEU, client) — vanilla-cookieconsent init + Kategorien + GCM-Update-Wiring + Record-Write + Widerruf-API. Token-gebundenes Styling (Claimondo-Brand).
4. **`src/components/analytics/ClarityInit.tsx`** — Consent-Gate auf neues Cookie/Event repointen.
5. **`src/lib/analytics/ga4-conversions.ts`** — Capture-Gate auf neues Cookie repointen.
6. **`src/app/kfzgutachter-lp/page.tsx`** — LP-GTM/GA4 bleiben; Consent kommt jetzt vom (auf der Subdomain gratis rendernden) `ConsentManager`. Cookiebot-spezifische Bezüge raus.
7. **`src/content/legal/datenschutz.md`** — Cookiebot/`cd.js`-Abschnitt ersetzen durch: eingesetztes CMP, Cookie-Deklaration, Widerruf-Hinweis.
8. **`src/lib/analytics/cookie-declaration.ts`** (NEU) — gepflegte Liste (necessary: Consent-Cookie, Auth/Session; statistics: `_ga`, `_ga_*`, GTM, Clarity `_clck`/`_clsk`; marketing: Google-Ads). Genutzt in Datenschutz + CMP-Detailansicht.
9. **`src/app/api/consent/route.ts`** (NEU) — POST schreibt `consent_records` (server, service-role). Minimal: `consent_id`, `categories`, `policy_version`, `created_at`, optional gekürzter UA. **Keine** IP/PII.
10. **Migration `…_consent_records.sql`** (NEU, via supabase-CLI/`apply_migration`, Regel-2) — Tabelle `consent_records`.
11. **`package.json`** — `vanilla-cookieconsent` dep; Cookiebot hatte keine npm-Dep (war Script-Tag) → nichts zu entfernen außer Code.
12. **Tests:** `consent.test.ts` (Host-Gating, Kategorie→GCM-Mapping, Cookie-Parse), Playwright-Smoke (s.u.).

## Tests
- **Unit (vitest):** `isMarketingHost`/`isTrackingHost` exhaustiv; `parseConsent`; Kategorie→GCM-Mapping (statistics→analytics_storage etc.).
- **Playwright-Smoke (Pflicht, Screenshot):** auf **Apex UND `kfzgutachter.claimondo.de`** (der heute kaputte Fall!): (1) Banner rendert, (2) Default `gcs=G100`, (3) „Akzeptieren" → `gcs=G111` + `_ga` gesetzt + `consent_records`-Row, (4) „Ablehnen" → bleibt denied, (5) Widerruf-Link öffnet Preferences. Negativ: Portal-Host → kein Banner, kein gtag.

## Rollout (Reihenfolge)
1. Code → PR `--base staging`. Vorher Drift-Check ggü. den offenen Consent-PRs (#1779 react-cookie-consent-Cleanup ist kompatibel; #1782 sa_signed-value unabhängig).
2. Staging-Smoke (Apex + kfzgutachter-Subdomain: Banner + GCM-Flip + Record).
3. `staging → main` → prod-Smoke (gleiche Checks live).
4. **Erst NACH OSS-live + verifiziert:** Cookiebot-Abo kündigen (nicht vorher — sonst Lücke).
5. DSGVO/DPO-Sign-off auf das Consent-Mode-only-Modell (s. Compliance-Entscheidung).

## Audit-Vorbereitung (7-Punkte, AGENTS.md)
- **Build:** voller `npm run build` (layout.tsx = Root-Layout → Next-15-Validator).
- **UI:** Banner + Footer-„Cookie-Einstellungen"-Widerruf-Link (neuer sichtbarer Einstieg).
- **Redundanz:** `consent.ts`/`cookie-declaration.ts` shared; ein `ConsentManager` statt Inline.
- **Dead-Code:** Cookiebot-`uc.js` + Cookiebot-Helper restlos raus (grep-verifiziert).
- **Spec:** diese Datei.
- **Inkonsistenz:** Brand-Tokens fürs Banner-Styling (kein Hardcode-Hex); `/api/consent` Result-Pattern.
- **Regression:** Root-Layout-Change → Build-Gate + Portal-Smoke (kein Banner/gtag auf Portalen; Apex-Consent-Flow + Conversions intakt).

## Risiken / offene Punkte
- **DPO-Sign-off** auf Consent-Mode-only (Hard-Block-Fallback dokumentiert).
- **Cookie-Deklaration manuell pflegen** — bei neuen Tools (z.B. weitere Pixel) Liste nachziehen. Owner-Prozess festhalten.
- **Banner-UX/Styling** muss Claimondo-Brand treffen (orestbida ist themebar) — Design-Abnahme separat.
- Reihenfolge Cookiebot-Kündigung strikt nach Go-Live.

## Begründung (warum nicht „nur Subdomain kaufen" und nicht „Banner from scratch")
- **Subdomain kaufen (Cookiebot):** kostet laufend pro Domain; skaliert schlecht bei weiteren Marketing-Subdomains. Abgelehnt (Aaron).
- **Banner komplett selbst bauen:** müsste Kategorien/Blocking/GCM/Widerruf neu erfinden. Ein reifes OSS-CMP liefert das fertig → weniger Code, weniger Bugs, gleiche Kontrolle. Daher OSS-CMP statt Eigenbau.
