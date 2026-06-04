# AAR-939 · Monika-Embed — Per-SV Client-Side Conversion-Tracking (Design)

**Datum:** 2026-06-04
**Status:** Design approved (Aaron, 2026-06-04) — ready for plan
**Branch:** `kitta/aar-939-embed-per-site-ga4` (off `main`) → PR gegen `staging`
**Autor:** Cluster-LP-Session (mit Aarons Freigabe, da keine Monika-Session aktiv)

## Problem

Jeder SV, der das Monika-Widget auf **seiner eigenen** Website einbettet, soll die
Conversions (erfolgreiche Anfragen über das Widget) in **seinem eigenen** Google Ads /
GA4 sehen — isoliert (nur seine), ohne Make/Zapier und ohne eigenes GTM-Setup.

Heute existieren nur:
- **Ebene 1** — Client-`dataLayer`-Events: nur nutzbar, wenn der SV selbst GTM auf
  seiner Seite hat und einen Trigger baut.
- **Ebene 2** — Per-Site-HMAC-Webhook (Stream 8b): der SV muss ein Make/Zapier-
  Szenario bauen, das den Webhook in sein GA4/Ads pipet.

Beide verlangen technisches SV-Setup. Ziel: **turnkey** — „Conversion-ID eintragen,
fertig."

## Lösung (client-side, „Ebene 3 light")

Der SV trägt im Embed-Cockpit seine **public** Tracking-IDs ein. Der Config-Endpoint
liefert sie ans Widget. Bei **Anfrage-Erfolg** feuert das Widget client-seitig `gtag`
direkt in das GA4/Ads des SV.

**Per-SV-Isolation entsteht automatisch:** jede eingebettete Widget-Instanz lädt die
Config **ihrer** Site → **ihre** IDs → die Conversion landet ausschließlich im GA4/Ads
genau dieses SV. Kein zentraler Topf, keine Vermischung über SVs hinweg.

### Warum client-side (nicht Server-Measurement-Protocol)?
- GA4-Measurement-ID + Ads-Conversion-ID/Label sind **public** (stehen in jedem
  gtag-Snippet) → kein Secret-Leak client-seitig. Der Server-MP-Weg bräuchte einen
  `api_secret` pro SV (Leak-/Storage-Risiko) — unnötig.
- Client-side `gtag` hat die echte User-Session (GA `client_id`, `gclid`,
  Consent-Kontext) → korrekte Attribution ohne Extra-Verkabelung.

## GA4 vs. Google Ads (getrennte Systeme, beide unabhängig unterstützt)

| | GA4 (Analytics) | Google Ads (Bidding) |
|---|---|---|
| ID | `tracking_ga4_measurement_id` = `G-XXXXXXX` | `tracking_gads_conversion_id` = `AW-XXXXXXXXX` + `tracking_gads_conversion_label` |
| Aufruf | `gtag('event','generate_lead', {...})` | `gtag('event','conversion',{send_to:'AW-XXX/label', ...})` |
| Aktivierung | SV markiert `generate_lead` 1× als Schlüsselereignis in GA4 | zählt sofort (die ID **ist** die Conversion-Action) |

Der SV trägt ein, was er hat (GA4 für Analytics, und/oder Ads fürs Bidding). NULL =
kein Tracking für diesen Kanal.

## Komponenten

### 1. Schema — `embed_sites` (additiv, via Supabase-Plugin, Regel 2)
- vorhanden: `tracking_ga4_measurement_id text` (nullable)
- **NEU:** `tracking_gads_conversion_id text` (nullable) — `AW-XXXXXXXXX`
- **NEU:** `tracking_gads_conversion_label text` (nullable)
- `tracking_gads_customer_id` (vorhanden) bleibt unangetastet — das ist die Ads-
  **Konto**-ID für die spätere Server-Ads-API (Phase 2), **nicht** das client-gtag-Paar.

### 2. Config-Endpoint — `GET /api/embed/config` (nur `sv_embed`)
Response um einen `tracking`-Block erweitern:
```ts
tracking: {
  ga4MeasurementId: string | null
  gadsConversionId: string | null
  gadsConversionLabel: string | null
}
```
**Read-only, nur public-IDs.** Secrets (`tracking_webhook_secret` etc.) bleiben
server-only und dürfen NICHT in der Response landen. `kfz_gutachter_lp` braucht den
Block nicht (Cluster-LPs nutzen ihre eigene, bereits gebaute Bridge).

### 3. Widget — `src/embed/monika/`
- **`types.ts`:** `MonikaTracking`-Typ; `cfg.tracking?: MonikaTracking`.
- **`api.ts` / `index.tsx`:** `tracking` aus der Config in `cfg` übernehmen (nur `sv_embed`).
- **`tracking.ts`:** neue Funktion `fireSiteConversion(cfg, attr)`:
  - lädt `gtag.js` **lazy** (nur falls noch kein `window.gtag`) — erst hier, post-consent.
  - GA4: `gtag('config', ga4MeasurementId)` → `gtag('event','generate_lead', {send_to: ga4MeasurementId})`.
  - Ads: falls `gadsConversionId` → `gtag('event','conversion',{send_to:`${id}/${label}`})`.
  - **Kein `value`:** der SV definiert den Wert in seiner eigenen GA4-/Ads-Conversion-Action — ein imposed `value` würde ihn überschreiben.
  - Koexistenz: vorhandenes `window.gtag` wird wiederverwendet (mehrere `config`-IDs
    koexistieren), kein zweites Laden.
- **`app.tsx` (G1-Fix):** `track(cfg,'monika_anfrage_submit')` **und** `fireSiteConversion()`
  NUR im `if (result.ok)`-Zweig (nach Erfolg) — statt aktuell vor dem `await`. Damit
  zählen nur erfolgreiche Anfragen als Conversion (heute: auch Fehlversuche).

### 4. Cockpit — `/einstellungen/embed`
3 Felder: „GA4 Measurement-ID", „Google-Ads Conversion-ID", „Conversion-Label".
Server-Action speichert **mass-assignment-safe** (nur diese 3 Felder, owner-scoped via
`embed_sites.inhaber_profile_id = auth.uid()`). Kurzer DSGVO-Hinweis am Feld.

## Consent / DSGVO
`gtag.js` wird **erst bei Submit-Erfolg** geladen (nach der bestehenden Consent-
Checkbox) → minimaler Cookie-Footprint, post-consent. Hinweis im Cockpit: der SV
verantwortet seine eigene Datenschutzerklärung (er trägt seine IDs bewusst ein und
bettet das Widget bewusst ein).

## Testing
- **Config-Endpoint (Vitest):** `tracking`-Block kommt für `sv_embed` mit korrekten
  IDs; Secrets (`tracking_webhook_secret`, `baileys_routing_nummer`) sind NICHT in der
  Response.
- **Widget:** esbuild-Build grün (< Bundle-Budget); manueller Smoke mit einer Test-
  `embed_site` (Test-GA4-ID) → Network zeigt `…/collect?…` an die SV-GA4 + die Ads-
  `conversion` mit dem richtigen `send_to`.
- **tsc** grün über Config + Widget + Cockpit.

## Scope
- **IN:** Schema (2 Spalten), Config-Endpoint, Widget (+ G1-Fix), Cockpit-Felder, Tests.
- **OUT:** Server-side GA4-MP / Ads-Offline-API (echte „Ebene 3 Server") bleibt Phase 2;
  der Cluster-LP-Bridge (separat, bereits gebaut + deployed) bleibt unverändert; die
  embed-track-CORS-Sache (G2) ist ein eigener, kleiner Fix und nicht Teil dieser Spec.

## Risiken / Koordination
- **`app.tsx` wird von den AAR-939-Monika-Sessions geteilt.** Der G1-Fix dort klein +
  isoliert halten; vor Merge gegen `origin/main` rebasen, falls die Strecke parallel
  an `app.tsx` arbeitet.
- **gtag-Koexistenz:** wenn der SV bereits eigenes `gtag`/GA4 auf der Seite hat —
  `window.gtag` wiederverwenden, nicht doppelt `gtag.js` laden.
- **Kein Conversion-Wert imposed:** das Widget sendet `gtag` ohne `value` → der SV
  definiert den Wert in seiner eigenen GA4-/Ads-Conversion-Action. Ein per-SV-Wert-Feld
  im Cockpit ist bewusst YAGNI (später nachrüstbar).
