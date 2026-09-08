# Dev-Ticket: Google-Tag „nicht aktiv" / 503 auf Mess-Pings (Cluster Köln/Aachen/Wuppertal)

**Typ:** Investigation / Tracking
**Priorität:** Niedrig–Mittel (kein Funktionsausfall — siehe Befund)
**Konto:** Google Ads „Claimondo Cluster" (951-112-7970)
**Google-Tag:** `AW-18202744855` / `GT-NM8L98FG` → GTM-Container `GTM-KD2L63T3`
**Erstellt:** 2026-06-20 · **Tag angelegt am:** 10.06.2026, Domains konfiguriert 11.06.2026

---

## TL;DR

Die Tags sind korrekt eingebaut und feuern auf **allen** geprüften Seiten. Von den 7 „nicht getaggten" Seiten sind **6 kfz-Slugs** ein **Crawl-/Erkennungs-Artefakt** (Tag erst 10 Tage alt → kippt in 24–48 h). Die **7. Seite (`claimondo.de/gutachter-finden`) ist ein dauerhafter, erwarteter Sonderfall** (Tag lebt im cross-origin iframe → Parent-DOM hat kein Tag → Crawler meldet korrekt „nicht getaggt"). Separat davon liefern auf dem geprüften Rechner **alle Google-Mess-Endpoints HTTP 503**, während Microsoft Clarity 204 liefert → **umgebungsspezifisch** (Netzwerk/Proxy), kein Code-Fehler. Es ist **kein** Code-Umbau nötig; offene Punkte siehe unten.

---

## Kontext

- Monorepo, mehrere Next.js-Apps. Hauptsite `claimondo.de` (`src/`) lädt `gtag.js` über `NEXT_PUBLIC_GA4_ID`/`NEXT_PUBLIC_GADS_ID`, host-gated (`isTrackingHost`).
- kfz-Cluster-Apps (`kfz-gutachter-aachen|bonn|koeln|wuppertal|duesseldorf`) laden **GTM** über `NEXT_PUBLIC_GTM_ID = GTM-KD2L63T3` (gesetzt in `.github/workflows/deploy-vps-kfz-*.yml`).
- GTM-Einbindung: `lib/site.ts` → `SITE.gtmId` → `components/SiteScripts.tsx` (GTM-Loader, dataLayer-Init, Consent-Mode-v2-Default) → gerendert via `components/LandingPage.tsx` → genutzt von Hub `/` **und** jeder `app/lp/[slug]/page.tsx`.
- Ads-Conversion-Tag `AW-18202744855` ist **nicht** hardcodiert im Code, sondern läuft über den GTM-Container (so im Spec `docs/superpowers/specs/2026-06-11-cluster-koeln-aachen-golive-design.md` vorgesehen). Der direkte `NEXT_PUBLIC_GADS_AW_ID`-Pfad in `SiteScripts.tsx` ist ein leerer Stub.

---

## Befund 1 — „nicht getaggt" = Crawl-Artefakt (kein Defekt)

Google Ads → Data Manager → Tag-Abdeckung: 42 Seiten, 35 getaggt, **7 „nicht getaggt"**:

- `claimondo.de/gutachter-finden`
- `kfz-unfallgutachter-aachen.de/lp/{herzogenrath, juelich, stolberg}`
- `kfz-unfallgutachter-koeln.de/lp/{bruehl, pulheim}`
- `kfz-unfallgutachter-wuppertal.de/lp/wuelfrath`

**Code-Check:** Alle 7 Slugs sind gültige Spoke-Städte in `lib/cluster.ts` (`CLUSTER.cities`) → rendern `LandingPage → SiteScripts → GTM`. **Identischer Code-Pfad** wie die 35 „getaggten" Seiten. Kein Unterschied im Code.

**Live-Verifikation (Netzwerk-Requests, 2026-06-20):** Auf allen 6 kfz-Seiten laden mit Status 200:

| Request | Status |
|---|---|
| `googletagmanager.com/gtm.js?id=GTM-KD2L63T3` | 200 |
| `googletagmanager.com/gtag/js?id=G-3GER9D7KRZ` (GA4) | 200 |
| `googletagmanager.com/gtag/destination?id=AW-18202744855` (Ads) | 200 |

`claimondo.de/gutachter-finden`: lädt GA4 (`G-9YF2W9ZP2S`) über gtag.js (kein GTM — by design Hauptsite).

→ **Ursache (6 kfz-Slugs):** Tags laden client-seitig (`next/script strategy="afterInteractive"`) + GTM zweistufig; Googles Tag-Abdeckungs-Crawler bestätigt frisch deployte URLs verzögert. Cluster-Go-Live 11.06., Prüfung 20.06.

**To-Do:** Keine Code-Aktion. 24–48 h Tag-Abdeckung neu prüfen; die **6 kfz-Slugs** sollten auf „getaggt" wechseln. Falls nach >1 Woche weiter „nicht getaggt" → Befund 3 (optionale Härtung) erwägen.

### ⚠️ Sonderfall `claimondo.de/gutachter-finden` — dauerhaft „nicht getaggt" (by design, NICHT chasen)

Diese Seite ist **architektonisch anders** als die 6 kfz-Seiten — NICHT Teil des „kippt in 24–48 h"-Sets:

- Parent-Dokument lädt nur **GA4 `G-9YF2W9ZP2S`**. Live verifiziert: `parentDomHasGTM: false`, `parentDomHasAW: false` — `GTM-KD2L63T3` + `AW-18202744855` sind **nicht** im Parent-DOM.
- GTM + Ads-Tag leben im **cross-origin iframe** `app.claimondo.de/embed/gutachter-finder` (Loader dort als `[iframe]` bestätigt).
- Googles Ads-Coverage-Crawler crawlt die URL `claimondo.de/gutachter-finden` und findet im **Parent-Dokument** kein AW-/GT-Tag (das iframe ist ein separater Browsing-Context) → meldet **dauerhaft** „nicht getaggt". Das ist **korrekt**, kein Lag.
- Deckt sich mit der Regel „kein neues Page-Tag auf `claimondo.de`". **Conversions feuern trotzdem** — im iframe-`dataLayer`.

→ **`/gutachter-finden` nicht chasen, Parent nicht taggen.** Diese eine Zeile bleibt in der Coverage-Diagnose erwartungsgemäß rot. Auch Befund 3 (GTM ins Root-Layout) würde hier nichts ändern — der Tag liegt absichtlich im iframe.

---

## Befund 2 — HTTP 503 auf Mess-Pings = umgebungsspezifisch (kein Code-/Site-Fehler)

Auf der geprüften Maschine liefern **alle** Google-Mess-Endpoints 503, auch bei **vollem Consent** (`gcs=G111`, `npa=0`):

| Endpoint | Status |
|---|---|
| `region1.google-analytics.com/g/collect` (GA4) | **503** |
| `google.com/ccm/collect` (Ads) | **503** |
| `ad.doubleclick.net/ccm/s/collect` (Ads) | **503** |
| `e.clarity.ms/collect` (MS Clarity) | **204 ✓** |

- Tag-**Loader** sind 200; nur die Daten-**Beacons** an Google-Domains sind 503.
- Clarity (Nicht-Google) gleichzeitig 204 → Differenzierer ist die **Ziel-Domain**.
- **Keine** `net::ERR_BLOCKED_BY_CLIENT`-Meldung in der Konsole → kein Browser-Adblocker, sondern echte Server-/Proxy-/Netzwerk-Antwort.
- Google Ads zeigt bereits **verbuchte Conversions** (Leads, „Route berechnen", „Anruf-Leads") und Einwilligungsmodus „Excellent" → echte Besucher sind **nicht** betroffen.

**Schlussfolgerung:** Netzwerk/Proxy/DNS auf diesem Rechner bzw. in diesem Netz filtert Googles Mess-Domains.

**To-Do (Verifikation, kein Code):**
1. Seite aus **anderem Netz/Gerät** öffnen (z. B. Mobilfunk) → Pings sollten 200/204 liefern.
2. GA4 → Echtzeit + Ads → „letzte Conversions" beobachten (Daten kommen an?).
3. Falls 503 auch extern reproduzierbar → Eskalation; bis dahin als lokales Netzwerk-Thema behandeln (Firewall/Proxy/Pi-hole prüfen).

---

## Befund 4 — GA4-Events: feuern korrekt, aber Property-Zugriff fehlt + 503 (wie Befund 2)

**Tag-Ebene (verifiziert, 2026-06-20):** GA4-Events werden korrekt konstruiert und gesendet.

- kfz-Property **`G-3GER9D7KRZ`** (`region1.google-analytics.com/g/collect`): Events `page_view`, `scroll`, `monika_shown` — mit vollem Consent (`gcs=G111`, `npa=0`).
- claimondo-Property **`G-9YF2W9ZP2S`**: Events `page_view`, `scroll`.
- Status der Beacons: **503** (identische Umgebungsbremse wie Befund 2 — Clarity 204).

**Zugriffs-Lücke (wie bei GTM):** Der Login `aaron.sprafke@claimondo.de` hat in GA4 **nur** die unbeteiligte, leere Property **„Gadgetsfun" (`G-5VYLN8BK6E`, Konto 340254612)**. Die echten Properties `G-3GER9D7KRZ` und `G-9YF2W9ZP2S` liegen in einem **anderen GA4-Konto** → Echtzeit/DebugView von diesem Login aus **nicht** einsehbar.

**Ground Truth „es funktioniert":** Das Google-Ads-Konto verbucht bereits echte Conversions → End-to-End-Messung für reale Besucher läuft.

**To-Do:**
1. GA4 → Echtzeit/DebugView mit Zugriff auf `G-3GER9D7KRZ` / `G-9YF2W9ZP2S` öffnen (besitzendes GA4-Konto) — aus normalem Netz (nicht der 503-Maschine).
2. Optional: Zugriff auf die echten GA4-Properties (und GTM-Container `GTM-KD2L63T3`) für `aaron.sprafke@claimondo.de` einrichten, damit Verwaltung/Debugging nicht am fehlenden Zugriff scheitert.

---

## Befund 3 — Optionale Härtung (nur falls Befund 1 nach >1 Woche bestehen bleibt)

Aktuell wird GTM client-seitig aus der `LandingPage`-Komponente injiziert. Optional robuster für Crawler/JS-lose Bots:

- GTM-Loader ins **Root-`app/layout.tsx`** jeder kfz-App ziehen (bzw. `@next/third-parties` `<GoogleTagManager/>`), sodass der Snippet auf jeder Route bereits im initialen HTML-`<head>` steht.
- **Reihenfolge wahren:** `dataLayer`-Init → Consent-Mode-Default (`gcm-consent-default`) → GTM-Loader. Aktuelle Sequenz in `SiteScripts.tsx` nicht brechen.
- **Achtung:** `beforeInteractive` kann LCP kosten — abwägen. `afterInteractive` im Layout reicht meist.
- Betroffene Apps: `kfz-gutachter-{aachen,bonn,koeln,wuppertal,duesseldorf}`.

**Bewertung:** Nicht funktional notwendig (Googlebot rendert JS; 35/42 Seiten bereits erkannt). Nur durchführen, wenn die Diagnose-Anzeige dauerhaft stört. **Nur kfz-Apps** — für `claimondo.de/gutachter-finden` ändert es nichts (Tag liegt absichtlich im cross-origin iframe).

---

## Akzeptanzkriterien

- [ ] Tag-Abdeckung in Google Ads zeigt nach Refresh-Fenster die **6 kfz-Slugs** als „getaggt" (Befund 1).
- [ ] `claimondo.de/gutachter-finden` bleibt erwartungsgemäß „nicht getaggt" (iframe-Architektur) — **nicht** taggen, nicht chasen.
- [ ] 503 aus mind. einem alternativen Netz gegengeprüft; Ergebnis dokumentiert (Befund 2).
- [ ] Falls extern ebenfalls 503: Folge-Ticket Netzwerk/Infra.
- [ ] Befund 3 nur umsetzen, falls Befund 1 nach >1 Woche persistiert.

## Referenzen

- `src/app/layout.tsx` (Hauptsite gtag.js, host-gated)
- `kfz-gutachter-aachen/components/SiteScripts.tsx` (GTM/Consent-Sequenz)
- `kfz-gutachter-aachen/components/LandingPage.tsx`, `app/lp/[slug]/page.tsx`, `lib/cluster.ts`, `lib/site.ts`
- `.github/workflows/deploy-vps-kfz-*.yml` (`NEXT_PUBLIC_GTM_ID=GTM-KD2L63T3`)
- `docs/superpowers/specs/2026-06-11-cluster-koeln-aachen-golive-design.md`
