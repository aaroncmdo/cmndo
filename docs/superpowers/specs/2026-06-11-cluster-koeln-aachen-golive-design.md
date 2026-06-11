# Köln + Aachen Cluster-LP Go-Live — Design Spec

**Datum:** 2026-06-11 · **Status:** Approved (Aaron 11.06.) → Implementierung
**Quelle:** Nicolas/Cowork-Bridge-Übergabe `UEBERGABE_GOLIVE_DEV_2026-06-10.md` + `claimondo-cluster-golive_2026-06-10.zip`
**Branch:** `kitta/cluster-koeln-aachen-golive`

## Ziel
Köln + Aachen als 2 neue Kfz-Gutachter-Cluster-LPs ins claimondo-v2-Monorepo integrieren (konsistent mit Wuppertal/Bonn/Düsseldorf) und live stellen auf `kfz-unfallgutachter-koeln.de` + `kfz-unfallgutachter-aachen.de`.

## Ausgangslage (verifiziert 11.06.)
Die Übergabe ist **kein Fremd-Stack**, sondern exakt unsere Cluster-Architektur (identische Komponenten/`lib`/`scripts`), nur als separate Working-Trees gebaut:
- **Lead-Pipeline schon verdrahtet:** `RueckrufPopover` POSTet an `${SITE.embedBase}/api/anfrage-from-lp` (`source: kfz_gutachter_lp`) → `gutachter_finder_anfragen` + Baileys + Dispatch. Kein `api/leads`-Mock im echten Working-Tree (die Handoff-Doc beschreibt das veraltet). Honeypot = `display:none` (immun gegen Autofill-Bug, vgl. #2652).
- **Monika = echter Embed, ENV-gated:** `MonikaEmbedSlot` lädt `${SITE.embedBase}/embed/monika.js` bei `NEXT_PUBLIC_MONIKA_EMBED_ENABLED=true`. „Platzhalter" = nur ENV aus.
- **Content production-ready:** `cluster.ts` voll gefüllt (Köln-Hub + 8 Rhein-Erft/Bergisch-Spokes; Aachen analog), einzigartige SEO-Texte je Stadt, Persona Stefan Wagner (Köln).
- **Recht:** `SITE.legalUrl='https://claimondo.de'` → Footer-Links extern (Wuppertal-Pattern), keine eigenen Rechtsseiten (Handoff-D2 damit erledigt).
- **Tracking:** `lib/tracking.ts` → dataLayer + GTM, alle IDs via ENV.

Kleine Drift: Köln/Aachen tragen die 08-Runden-Politur (z. B. `SeoBodySection`, neue `cluster.ts`-Felder `assetVersion`/`h1SubSpan`/`logoExt`/`displayNational`/`svSurname`) — minimal voraus ggü. den bestehenden 3.

## Entscheidungen (Aaron 11.06.)
- **Integration:** Monorepo, as-is (2 neue Cluster-Dirs, GH-Actions-Deploy).
- **GTM-Container:** `GTM-KD2L63T3` wiederverwenden (schon auf Ads-Konto `AW-18202744855` verdrahtet; Köln/Aachen-Call-Swap-Tags ergänzen).
- **Monika:** ON beim Launch (`NEXT_PUBLIC_MONIKA_EMBED_ENABLED=true`, wie Wuppertal; Honeypot-Fix #2652).
- **Drift:** Köln/Aachen as-is rein; 08-Politur später auf die anderen 3 rückportieren (separates Ticket, kein Go-Live-Blocker).

## Architektur-Abbildung
Cluster-Klon-Rezept — pro Cluster differieren nur 4 Config-Stellen, der Code-Apparat ist identisch:
1. `lib/cluster.ts` — Städte/Region/Brennpunkte/SEO (Köln+Aachen schon gefüllt).
2. `app/globals.css` — `:root`-Cluster-Vars (Theme) + `--hero-mobile-img`-Pfad (GOTCHA: pro Cluster hardcoded).
3. `app/layout.tsx` — `themeColor` (muss zu globals.css passen).
4. `public/assets/img/<cluster>/` — Bilder (persistent auf VPS, NICHT in Git).

Deploy = Kopie `deploy-vps-kfz-wuppertal.yml`. Build code-only in CI (Standalone, keine static image-imports) → `.next/standalone` tar → SCP → VPS atomarer Verzeichnis-Switch + Asset-Symlink + Health-Check (`:port/` HTTP 200) + Auto-Rollback.

## Port-/Pfad-Belegung
| Cluster | Domain | PM2-Port | APP-Pfad (VPS) | Assets-Pfad (VPS) |
|---|---|---|---|---|
| Wuppertal | kfz-unfallgutachter-wuppertal.de | 3003 | /var/www/kfz-unfallgutachter-wuppertal-app | /var/www/kfz-assets/wuppertal |
| Düsseldorf | kfz-unfallgutachter-duesseldorf.de | 3004 | …-duesseldorf-app | /var/www/kfz-assets/duesseldorf |
| Bonn | kfz-unfallgutachter-bonn.de | 3005 | …-bonn-app | /var/www/kfz-assets/bonn |
| **Köln (neu)** | kfz-unfallgutachter-koeln.de | **3007** | …-koeln-app | /var/www/kfz-assets/koeln |
| **Aachen (neu)** | kfz-unfallgutachter-aachen.de | **3008** | …-aachen-app | /var/www/kfz-assets/aachen |

> **Port-Map live verifiziert 11.06. (VPS 212.132.119.110, key-auth):** :3000 claimondo-v2 (Portal-Prod), :3001 staging, :3002 autounfall-io, :3003 Wuppertal, :3004 Düsseldorf, :3005 Bonn, **:3006 claimondo-marketing** → **:3007 + :3008 frei** für Köln/Aachen. (Cluster binden auf 127.0.0.1 hinter nginx; HOSTNAME=127.0.0.1 im Workflow.)

## Arbeitspakete

### A · Code-Integration (Dev — dieser Branch, PR → staging)
- **A1.** `kfz-gutachter-koeln/` + `kfz-gutachter-aachen/` aus dem ZIP-Working-Tree ins Monorepo kopieren — **nur Code**: `app/`, `components/`, `lib/`, `scripts/`, `public/` (ohne `assets/img/`-Großbilder), Config (`next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `tsconfig*`, `next-env.d.ts`), `package.json` + `package-lock.json`. **Ausschließen:** `node_modules/`, `.next/`, `public/assets/img/**` (gitignored), Template-Docs (`CLAUDE.md`, `START-HIER.md`, `HANDOFF.md`, `MISSING-ASSETS.md`, `DEPLOY.md`, `README.md` — Nicolas-intern, nicht ins Monorepo; CLAUDE.md würde sonst mit Repo-CLAUDE.md kollidieren).
- **A2.** `.gitignore` der neuen Cluster: `public/assets/img/` ignorieren (wie bestehende Cluster) — Großbilder bleiben aus Git. Geteilte Klein-Assets analog zu Wuppertal behandeln.
- **A3.** `.github/workflows/deploy-vps-kfz-koeln.yml` + `…-aachen.yml` — Kopie Wuppertal, anpassen: `name`, `paths`-Filter, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GTM_ID=GTM-KD2L63T3`, `NEXT_PUBLIC_MONIKA_EMBED_ENABLED='true'`, `NEXT_PUBLIC_EMBED_BASE=https://app.claimondo.de`, PM2-Port (3007/3008), tar-Name, APP-Pfad, ASSETS-Pfad, pm2-Name, Health-Check-Port.
- **A4.** Verifikation: `npm run build` grün je Cluster (Standalone). 404/`not-found` vorhanden (Handoff-D3). Footer-Rechtslinks → claimondo.de (D2, via `legalUrl`). Honeypot `display:none` bestätigt. Optional lokaler Render-Smoke (Klon-Rezept).
- **A5.** PR → staging mit 7-Punkte-Audit. Merge macht die Merge-Session; nach main-Merge triggert der jeweilige Deploy-Workflow — **aber nur, wenn die VPS-Assets bereits liegen (B3)**.

### B · VPS-Infra (Aaron / VPS-Zugang)
- **B1.** DNS-A-Records `kfz-unfallgutachter-koeln.de` + `…-aachen.de` → `212.132.119.110`.
- **B2.** nginx-Server-Block je Domain (Proxy auf 127.0.0.1:3007 bzw. :3008, HSTS) + Certbot je Domain.
- **B3.** **Asset-Upload (one-time, Deploy-Voraussetzung):** Bilder aus dem ZIP (`assets-extra/` + Working-Tree `public/assets/img/{koeln,aachen}`) nach `/var/www/kfz-assets/koeln/` bzw. `/var/www/kfz-assets/aachen/`. `_src`-Master separat ablegen (späteres 2×-srcset). Der Workflow `exit 1`t, wenn der Ordner fehlt.
- **B4.** `VPS_SSH_KEY`-Secret existiert bereits (alle Cluster-Deploys nutzen es) — kein neues Secret.

### C · Tracking (Aaron liefert Werte → Dev trägt ENV/Tags ein)
- **C1.** GTM-KD2L63T3 wiederverwenden; je Cluster einen Call-Swap-Custom-HTML-Tag (Pattern Ticket 28: `gtag('config','AW-…/<CALL_LABEL>',{phone_conversion_number:'<Seiten-Nr>'})`) — Köln/Aachen-Seiten-Nummer getrennt. Trigger Initialization, Consent-Check `ad_storage`.
- **C2.** GA4 über GTM; Conversion-Labels (Lead/Call/WhatsApp) aus dem neuen Konto (`aaron.sprafke@claimondo.de`) in die Tags. Clarity-ID `wm8w9d2h0u`.
- **C3.** Consent-Mode + DebugView nach Live verifizieren (GA4/Ads/Clarity erst nach Einwilligung).

### D · Recht (Aaron/Kanzlei — parallel, vor echtem Kampagnen-Traffic)
- **D1.** claimondo.de/impressum,/datenschutz,/agb: „ENTWURF"-Banner entfernen nach Review, HR-/USt-Angaben aktualisieren.
- **D2.** Datenschutzerklärung um LP-Abschnitt ergänzen (GA4, Ads inkl. Call-Tracking-Nummern-Swap, Clarity, Leaflet/OSM-Karte, WhatsApp, Cookie-Einwilligung) mit Geltung für die 2 Domains.

### E · Post-Live (Aaron)
- **E1.** robots.txt/sitemap.xml erreichbar prüfen; GSC-Properties beider Domains + Sitemap einreichen.
- **E2.** Lighthouse/CWV auf den Produktiv-Domains messen.
- **E3.** GBP-Website-URLs auf die finalen Domains umstellen, NAP-Konsistenz prüfen.

## Reihenfolge
A (Dev) → B (Aaron: DNS/nginx/Certbot + **Asset-Upload zuerst**, sonst Deploy-Abbruch) → main-Merge triggert Deploy → C (Tracking-ENV/Tags) → Live-Verifikation (Consent/DebugView + Lead-E2E-Smoke wie Bonn) → E. D läuft parallel.

## Risiken / offene Punkte
- **Asset-Upload (B3) ist manuell + Deploy-Voraussetzung** — der Workflow bricht mit `exit 1` ab, wenn `/var/www/kfz-assets/<cluster>/` fehlt. Koordination Dev↔Aaron: B3 vor dem ersten erwarteten Deploy.
- **GTM-Default** = KD2L63T3 wiederverwenden; falls neuer Container gewünscht, nur `NEXT_PUBLIC_GTM_ID` im Workflow ändern.
- **Drift** (Köln/Aachen 08-voraus): bewusst as-is; Backport auf die bestehenden 3 = separates Ticket.
- **Düsseldorf** ist „pausiert" (GTM-KZNCZB2Z) — irrelevant für Köln/Aachen (Container KD2L63T3).
- **package-lock.json** mitnehmen (deterministischer CI-Install).

## Out of Scope
- Kampagnen-Aufbau (Aaron, Ads Editor).
- Backport der 08-Politur auf die bestehenden 3 Cluster.
- Monika-auf-Partner-Gutachter-Seiten (späterer Plan).
- Handoff §6 bewusste Platzhalter/Guards (Hero 2×-Master, Köln-Signet-Bold, GBP-Review-Sync „vor X Tagen", Karten-Pins hinter Koordinaten-Guard, Hub-Brennpunkte-Link-Guard) — **NICHT als Bugs „fixen".**

## Test / Abnahme
- `npm run build` grün je Cluster (CI-Build-Step + lokal).
- Deploy-Health-Check (`:port/` HTTP 200, Auto-Rollback) im Workflow.
- Nach Live: Lead-E2E-Smoke (RueckrufPopover → `gutachter_finder_anfragen`-Insert + WhatsApp `gesendet`, analog Bonn-Verifikation 11.06.).
- Consent/Tracking-DebugView (GA4/Ads/Clarity post-consent).
- Call-Swap-Verifikation je Cluster (Ticket-28-Pattern, sobald Google-Forwarding provisioniert).
