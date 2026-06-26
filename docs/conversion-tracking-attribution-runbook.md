# Conversion-Tracking, Attribution & Bot-Defense — Design + Runbook

**Ticket:** [P1] Conversion-Tracking & Attribution definitiv fixen + Bot-Traffic blocken (Linear-Nr folgt)
**Branch:** `kitta/aar-<nr>-conversion-tracking-fix` (base `staging`)
**Stand:** 2026-06-26
**Liefer-Form:** Code-PR (`claimondo-marketing/`) + dieses Runbook (Konsolen-Schritte für Aaron)

**Entscheidungen (Aaron, 26.06.):**
1. Consent-Default → `granted` — aber **env-gated**, Go-Live erst nach DSB/Anwalt-Freigabe.
2. Ads-Bidding → **Leads primär** (generate_lead/Rückruf/qualifizierter Anruf).
3. Bot-Block **selektiv**: Training-Crawler blocken, AI-Antwort-Crawler erlauben (GEO-Schutz).
4. Cloudflare-Bot-Defense = Konsolen-Runbook (nicht code-seitig ausführbar).

Dieses Dokument ist gleichzeitig die **Spec** (Teil A = Code) und das **Runbook** (Teil B = Konsole). Es führt die fünf bestehenden Tracking-Docs zusammen (siehe Referenzen).

---

## 0. Kernbefund — claimondo.de ist KEIN WordPress

Das Ticket nennt „Website | claimondo.de (WordPress)". **Live ist Next.js.** claimondo.de wird aus `claimondo-marketing/` deployed (`.github/workflows/deploy-vps-marketing.yml`, VPS Port 3006, host-routet `claimondo.de` + `gutachter.`/`schaden.`/`kfzgutachter.`/`makler.claimondo.de`), `NEXT_PUBLIC_GA4_ID=G-9YF2W9ZP2S` (= Property `535968769`). Live-Abruf bestätigt: überall `/_next/`-Assets, keine `wp-*`-Spuren. Ein `/vielen-dank/` existiert nicht — die Formulare zeigen Inline-Erfolg bzw. redirecten auf einen Magic-Link.

→ Tasks 1, 2 und 4-robots sind **Code in diesem Repo** (`claimondo-marketing/`). Task 3 + Cloudflare sind **Konsolen-Arbeit** (deine Credentials).

---

## 1. Tracking-Ist-Zustand (Architektur)

| Surface | Deploy | Tag | GA4-Property |
|---|---|---|---|
| **claimondo.de** (+ Subdomains) | `claimondo-marketing` :3006 | gtag.js direkt | **G-9YF2W9ZP2S** (535968769) |
| app.claimondo.de | `src/` (claimondo-v2) | gtag.js, host-gated (in Prod dormant) | G-9YF2W9ZP2S |
| kfz-LPs (5 Cluster) | `kfz-gutachter-*` | GTM-KD2L63T3 | G-3GER9D7KRZ (540525497) |

- **Consent:** überall Default `denied` + Consent Mode v2 *Advanced* (`ads_data_redaction`, `url_passthrough` für gclid-Survival, `wait_for_update`) + CMP-Banner (`ConsentManager`, vanilla-cookieconsent).
- **Ads** „Claimondo Cluster" `951-112-7970`, Conversion-ID `AW-18202744855`, läuft über den GTM-Container.
- **🔴 Property-Mismatch (Root-Cause, aus euren Docs):** Ads ist mit **G-3GER9D7KRZ** verknüpft (Web-Import AUS); Leads + `sa_signed` laufen auf **G-9YF2W9ZP2S** (nicht verknüpft) → die Signale erreichen das Ads-Bidding nie. **Das ist der eine Blocker, der ALLES in Teil B gatet.**

---

## Teil A — Code (dieser PR)

### A1 · `generate_lead` an den 2 ungetrackten claimondo.de-Formularen  [Task 2]

**Problem:** Auf claimondo.de feuern **zwei** Kunden-Lead-Abschlüsse bei Erfolg **kein** GA4-Event:
- `claimondo-marketing/components/landing/HomeLeadFormClient.tsx` (Home-Hero „Schaden melden in 30 Sekunden", = der Rückruf-`claimondo_rueckruf`-Pfad)
- `claimondo-marketing/app/[locale]/schaden-melden/MiniWizardClient.tsx` (`/schaden-melden`)

Die LP-Forms (`LeadFormClient`/`StadtLeadFormClient`) feuern `generate_lead` bereits (via `trackLpEvent`). Der Home-Funnel war die Lücke → deckt sich exakt mit dem Ticket-Befund.

**Fix:**
- Neuer Shared-Helper `claimondo-marketing/lib/analytics/track-event.ts` (spiegelt `trackLpEvent`, ohne LP-spezifische Defaults):
  ```ts
  export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
    if (typeof window === 'undefined' || !window.gtag) return
    window.gtag('event', name, params)
  }
  ```
- `HomeLeadFormClient`: im `result.ok`-Zweig →
  `trackEvent('generate_lead', { currency: 'EUR', value: 0, source: 'claimondo-home-hero' })`
- `MiniWizardClient`: direkt vor `router.push(result.redirectTo)` →
  `trackEvent('generate_lead', { currency: 'EUR', value: 0, source: 'mini-wizard-schaden-melden' })`

**Wichtig:** Feuert **auch bei Consent=denied** — Consent Mode Advanced sendet ein modelliertes, cookieloses Signal. **A1 ist unabhängig von A2** und der eigentliche Hebel. Dedup: Event feuert genau 1× pro erfolgreichem Submit (Erfolgs-State ist terminal). `window.gtag` ist auf claimondo.de geladen (`[locale]/layout.tsx`, `isTrackingHost`).

### A2 · Consent-Default `denied → granted`, env-gated  [Task 1]

- Neue Env `NEXT_PUBLIC_CONSENT_DEFAULT` (`denied` | `granted`, **Default `denied`**).
- `claimondo-marketing/app/[locale]/layout.tsx`: der `gtag('consent','default',{…})`-Block liest die Env und emittiert `granted` für `ad_storage`/`ad_user_data`/`ad_personalization`/`analytics_storage`/`functionality_storage`/`personalization_storage` **nur** wenn `=granted`. `security_storage` bleibt `granted`, `wait_for_update` bleibt.
- **Merge ändert Prod NICHT** (Default `denied`). **Go-Live** = Env auf dem VPS `=granted` setzen, **erst nach DSB/Anwalt-Freigabe** (siehe B6). **Rollback** = Env zurück auf `denied`, kein Redeploy.
- **CMP-Caveat:** Das Banner ist aktuell Opt-*in*. Mit granted-Default wird es de-facto Opt-*out* (User kann ablehnen). Das ist der rechtlich exponierte Teil — deshalb das Env-Ventil + Legal-Gate. Eine echte CMP-Opt-out-Reconfig ist eine **Folge-Entscheidung nach Legal**, NICHT in diesem PR.

### A3 · robots.txt — selektiver AI-Crawler-Block  [Task 4-robots]

- `claimondo-marketing/app/robots.ts`: `CCBot`, `Bytespider`, `Google-Extended` aus der `AI_BOTS_ALLOW`-Liste entfernen und als **eigene Block-Regeln** (`{ userAgent, disallow: '/' }`) eintragen.
- **Erlaubt bleiben** (AI-Antwort/Search): GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web, Claude-SearchBot, anthropic-ai, PerplexityBot, Perplexity-User, Applebot(+Extended), Bingbot, Googlebot(+Image/News/Video), Meta-ExternalAgent, Amazonbot, Diffbot, MistralAI-User, DuckDuckBot, YandexBot.
- **Trade-off:** Google-Extended-Block = kein Gemini-Training-Beitrag (Such-Index + AI-Overviews bleiben unberührt). CCBot/Bytespider = reine Scraper/Training ohne AI-Antwort-Nutzen.
- **Scope:** nur claimondo.de (`claimondo-marketing`). Die 5 kfz-LPs + autounfall haben eigene `robots.ts` mit derselben Allow-Liste → optionaler Folge-PR. Gegen den (direct)-Bot-Flood wirkt ohnehin Cloudflare stärker (B4) — robots stoppt nur höfliche Bots.

### Audit / Verifikation (Code)
- `cd claimondo-marketing && npm run typecheck` (= `tsc --noEmit`) grün.
- Full `npm run build` = **CI-Gate** (lokaler Full-Build ist projekthistorisch env-flaky; CI ist der verlässliche Gate). A2 berührt ein Layout → CI-Build ist hier Pflicht-Gegencheck.
- 7-Punkte-Audit im Commit-Body.
- Token-Ratchets greifen NICHT auf `claimondo-marketing` (eigener Top-Level-Build) → bestehende raw-`red`/`emerald`-Klassen dort sind kein Audit-Thema.

---

## Teil B — Konsole (Aaron, Schritt für Schritt)

### B0 · Voraussetzung: GA4-Zugriff
Dein Login `aaron.sprafke@claimondo.de` sieht laut `dev-ticket-google-tag-status.md` nur die leere „Gadgetsfun"-Property. Für alles unten brauchst du Zugriff auf **G-9YF2W9ZP2S** (535968769) + **G-3GER9D7KRZ** (540525497) + GTM `GTM-KD2L63T3`. → vom besitzenden GA4-Konto einladen lassen (Admin → Property-Zugriffsverwaltung). Aus normalem Netz arbeiten (nicht der Maschine mit 503 auf Google-Mess-Domains).

### B1 · 🔴 Property-Mismatch fixen (BLOCKER für alles Weitere)
Google Ads (951-112-7970) → **Tools → Verknüpfte Konten → Google Analytics (GA4)** → Property **G-9YF2W9ZP2S (535968769)** verknüpfen → **„Website-Messwerte importieren" / Auto-Import aktivieren**. (Aktuell nur G-3GER9D7KRZ verknüpft, Import deaktiviert.)

### B2 · Schlüsselereignisse + Import als primär (Leads-primär-Modell)
1. GA4 (G-9YF2W9ZP2S) → Admin → **Ereignisse** → `generate_lead` (+ Rückruf-Event, `phone_click`/`call_60s`, `whatsapp_click`) als **Schlüsselereignis** markieren. Im DebugView prüfen, dass `generate_lead` mit `currency=EUR` ankommt.
2. Ads → **Conversions** → aus GA4 importieren → `generate_lead` (+ Rückruf + qualifizierter Anruf ≥60s) → **„In Conversions einbeziehen = Ja" / primär**.
3. **Doppelzählung vermeiden** (Details: `ads-conversion-setup-empfehlung.md` §⚠️): native Dubletten auf **sekundär** — `phone_click` nativ vs. GA4; `monika_anfrage_submit` vs. GA4 `request_submit`; `Calls from ads` vs. `call_60s` (genau eine primär).
4. (Optional, mittelfristig) `sa_signed` (210 €) ebenfalls importieren, falls value-based gefahren werden soll (euer `value-based-bidding-strategie.md`) — braucht denselben Property-Fix (B1) + `transaction_id`-Dedup (`dev-ticket-sa-signed-dedup.md`).

### B3 · Auto-Tagging / gclid / Kampagnen-Namens-Mismatch
- Ads → Einstellungen → **Auto-Tagging an**.
- Prüfen, dass `gclid` in G-9YF2W9ZP2S-Sessions ankommt (`url_passthrough` ist code-seitig bereits aktiv).
- Der Mismatch „SE-claimondo-*/PMAX (GA4) ↔ CMP-Spokes (Ads)" entsteht, weil die Cluster-Kampagnen in der *verknüpften* Property (G-3GER9D7KRZ) landen, claimondo.de-Sessions aber in G-9YF2W9ZP2S. Nach B1 (G-9YF2W9ZP2S verknüpft) + Auto-Tagging gleichen sich die Namen an. Zeitzone + Währung beider Konten gegenchecken.

### B4 · Cloudflare Bot-Defense (der eigentliche Hebel gegen den (direct)-Flood)
- **Security → Bots:** „Bot Fight Mode" (bzw. „Super Bot Fight Mode" ab Pro) **an** + **„Block AI Scrapers and Crawlers" an**.
- **WAF → Custom Rule:** „Managed Challenge" wenn `ip.geoip.asnum in {AWS/GCP/Azure-ASNs}` ODER (`cf.client.bot` and not verified) — Scope auf die Marketing-Hostnames. Optional: Non-DE/AT/CH-Traffic auf Marketing-Seiten challengen.
- Hinweis: robots.txt (A3) stoppt nur höfliche Crawler. Den (direct)/0-Sek./US-Datacenter-Flood (95,7 %) killt Cloudflare/WAF.

### B5 · End-to-End-Verifikation (Ticket-Akzeptanz)
1. Test-Formular auf claimondo.de absenden — **Home-Hero** UND **/schaden-melden**.
2. `generate_lead` in GA4 DebugView (G-9YF2W9ZP2S) sichtbar (mit gesetztem Consent).
3. Conversion erscheint in Ads (Claimondo Cluster) innerhalb der Importfrist.
4. GA4-Quelle = korrekte Ads-Kampagne (Name stimmt).
5. Bot-/(direct)-Anteil nach 1 Woche deutlich gesunken.

### B6 · Legal-Gate für A2 (Consent-Go-Live)
**Vor** dem Setzen von `NEXT_PUBLIC_CONSENT_DEFAULT=granted` in Prod: DSB/Anwalt-Freigabe einholen (§25 TDDDG verlangt Opt-in **vor** dem Setzen von Tracking-Speicher; granted-by-default ist abmahnexponiert). DPIA empfohlen (Skill `dpia-sentinel` vorhanden). Bis dahin bleibt Prod auf `denied` — die `generate_lead`-Events (A1) liefern über Consent-Mode-Modeling trotzdem Daten.

---

## Akzeptanzkriterien
- [ ] **A1:** Home-Hero + /schaden-melden feuern je genau 1× `generate_lead` (GA4 DebugView).
- [ ] **A2:** Env-Flag steuert den Consent-Default; Default `denied`; `granted` nur bei `NEXT_PUBLIC_CONSENT_DEFAULT=granted`.
- [ ] **A3:** robots.txt blockt CCBot/Bytespider/Google-Extended, erlaubt die AI-Antwort-Bots.
- [ ] `typecheck` grün; CI-Build grün.
- [ ] Teil B als Runbook abarbeitbar; B1 als Blocker markiert.

## Out of Scope
- PMax + zweites Ads-Konto „claimondo" (220-151-0905) — lt. Ticket.
- Kampagnen-Optimierung (Keywords/Gebote/Budgets) — separates Thema.
- `sa_signed` value-based-Umstellung — separat (euer `value-based-bidding-strategie.md`).
- robots-Replikation auf kfz-LPs/autounfall — optionaler Folge-PR.
- CMP-Opt-out-Reconfiguration — Folge-Entscheidung nach Legal.

## Referenzen
- `docs/ads-conversion-setup-empfehlung.md` — Conversion-Aktionen-Setup, Doppelzählungs-Paare
- `docs/value-based-bidding-strategie.md` — sa_signed-Wertmodell, Property-Mismatch §6.2
- `docs/dev-feedback-sa-signed-ads-pipeline.md` — Verifikation Property-Mismatch
- `docs/dev-ticket-google-tag-status.md` — Tag-Coverage, 503, GA4-Zugriffslücke
- `docs/dev-ticket-sa-signed-dedup.md` — transaction_id-Dedup
- Code: `claimondo-marketing/{components/landing/HomeLeadFormClient.tsx, app/[locale]/schaden-melden/MiniWizardClient.tsx, app/[locale]/layout.tsx, app/robots.ts, lib/analytics/track-event.ts (neu)}`
