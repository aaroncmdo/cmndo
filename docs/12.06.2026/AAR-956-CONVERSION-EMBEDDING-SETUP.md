# Gutachter-Finder-Embed — Conversion-Tracking & Embedding-Setup (AAR-956)

Stand 12.06.2026. Dieses Dokument beschreibt, **wie die Conversion-Events verdrahtet sind**
(Code-Seite, fertig) und **was du in GTM / Google Ads / GA4 einrichten musst** (Ops-Seite,
offen). Modell 1:1 wie die Monika (`cl_event_source` als Unterscheider, zwei Kanäle,
value-based).

---

## 1 · Architektur — zwei Kanäle (beide best-effort, blockieren nie)

```
   ┌────────────────────────────── iframe (app.claimondo.de/embed/gutachter-finder) ──────────────┐
   │                                                                                                │
   │   FinderWizard ──track(event, extra)──┬──► (1) window.dataLayer.push({...})  ──► GTM im iframe │
   │                                        │                                         ├─► GA4        │
   │                                        │                                         └─► Google Ads │
   │                                        │                                                         │
   │                                        └──► (2) navigator.sendBeacon('/api/embed-track', …)      │
   │                                                  (same-origin Haupt-App, loggt + Stream-8b-ready)│
   └────────────────────────────────────────────────────────────────────────────────────────────────┘
                       eingebettet via <iframe> auf  claimondo.de (Marketing)
```

* **Kanal 1 — `window.dataLayer`** der iframe-Seite. Hier hängt **dein GTM-Container** (muss noch
  rein, s. §5). GTM verteilt an GA4 + Google Ads (Smart Bidding). **Das ist der Conversion-Pfad.**
* **Kanal 2 — Beacon an `/api/embed-track`** (same-origin app.claimondo.de). Aktuell nur
  Server-Log + Sentry-Breadcrumb; vorbereitet für Stream 8b (persistente `embed_widget_events` +
  Server-side Ads-Conversions-API als Fallback gegen Cookie-Verlust). **Kein Setup nötig.**

Code: `src/app/embed/gutachter-finder/_lib/tracking.ts` (track + Conversion-Bags),
`src/app/api/embed-track/route.ts` (Beacon-Empfänger, ALLOWED_EVENTS).

---

## 2 · Die Events (was feuert wann)

Jeder Push enthält **immer** `event` + `cl_event_source: 'gutachter_finder'`, plus die `extra`-Felder:

| Event | Trigger (wann) | extra-Payload | Zweck |
|---|---|---|---|
| `gf_shown` | iframe/Widget geladen (1×, `__gfShown`-Guard) | — | Funnel-Start / Impression |
| `gf_ort_gewaehlt` | Kunde bestätigt seinen Schadenort (Schritt Ort → Termin) | — | Funnel: Ort gesetzt |
| `gf_termin_gewaehlt` | Slot gewählt (Schritt Termin → Schaden) | `{ gutachter: 'partner' \| 'deadpin' }` | Funnel: Termin gewählt |
| **`gf_anfrage_submit`** | **Reservierung abgeschickt** (Kontakt → Danke) | `{ schadenart:'haftpflicht', value:100, currency:'EUR', lead_id?, user_data? }` | **Haupt-Conversion (Lead)** |
| **`gf_rueckruf`** | **Rückruf/Beratung gebucht** (auf der Danke-Seite) | `{ schadenart:'schadensberatung', value:25, currency:'EUR', lead_id?, user_data? }` | **Conversion (Beratungs-Lead)** |
| `phone_click` | „Jetzt anrufen" geklickt (Danke-Seite, `tel:+4922198557270`) | `{ context:'danke_ansprechpartner' }` | Anruf-Intent (Micro-Conversion) |

> Trigger-Stellen im Code: `FinderWizard.tsx` (gf_shown Z.124, gf_ort_gewaehlt Z.131,
> gf_termin_gewaehlt Z.152/158, gf_anfrage_submit Z.213, gf_rueckruf Z.247, phone_click Z.485).

### Wertmodell (wie Monika `value-model.ts`)

| Schadenart | Wert | gefeuert bei |
|---|---|---|
| `haftpflicht` (Unfall-Gutachten) | **100 €** | `gf_anfrage_submit` |
| `wertgutachten` | 50 € | (reserviert, aktuell nicht aktiv) |
| `schadensberatung` (Beratungsgespräch) | **25 €** | `gf_rueckruf` |

`value` ist **immer eine Number** (nie String — sonst ignoriert GA4/Ads das Wert-Bidding),
`currency: 'EUR'`. Werte sind in `tracking.ts` inline gespiegelt (`VALUE_RESERVIERUNG`,
`VALUE_RUECKRUF`) — bei Änderung dort + im Monika-`value-model.ts` angleichen.

### `lead_id` & `user_data` — warum sie wichtig sind

* **`lead_id`** = die serverseitige Anfrage-/Lead-ID (aus `reserviereEmbedTermin`). Nutze sie als
  **Transaction-ID / Order-ID** in der Ads-Conversion → **Dedupe** (derselbe Lead zählt nie doppelt,
  z.B. bei Reload/Re-Fire). **Wird weggelassen wenn leer** — ein leeres `lead_id` würde GA4/Ads alle
  id-losen Conversions zu EINER zusammenfassen (Unterzählung). Niemals einen Default setzen.
* **`user_data`** = **Enhanced Conversions for Leads** — Googles Struktur, ROH (ungehasht) im
  dataLayer: `{ email, phone_number (E.164), address: { first_name, last_name } }`. GTM hasht
  clientseitig SHA-256, BEVOR es an Google geht (Consent-gegated). **E-Mail ist das stärkste
  Match-Signal** (> Telefon), Name verstärkt. Alle vier sind Pflichtfelder im Kontaktformular →
  immer vorhanden. Bei **beiden** Conversions (`gf_anfrage_submit` + `gf_rueckruf`). Quelle:
  `userDataBag()` in `tracking.ts`.

> **Warum `user_data` hier kein nice-to-have ist:** Die Conversion feuert im iframe
> (`app.claimondo.de`), der Ad-Klick landete auf `claimondo.de` → **kein gemeinsames GCLID-Cookie**
> (anderer Origin). Reine Cookie-Attribution greift nicht. EC-for-Leads matched die Conversion über
> gehashte E-Mail/Telefon **ohne** Cookie/GCLID zum Klick — das ist der eigentliche
> Attributions-Mechanismus (s. §4).

---

## 3 · Was du in **GTM** einrichtest (Kanal 1)

> Ein GTM-Container im iframe. Empfehlung: **eigener GF-Container** (z.B. `GTM-GFXXXXX`) oder ein
> geteilter „Embed"-Container — Events sind über `cl_event_source` sauber trennbar.

**a) Variablen (Data-Layer-Variable je Feld):**
`event`, `cl_event_source`, `value`, `currency`, `lead_id`, `schadenart`, `gutachter`, `context`
+ **eine „User-Provided Data"-Variable vom Typ „Code"**, die `user_data` liest (enthält
`email` / `phone_number` / `address.first_name` / `address.last_name`) — für Enhanced Conversions.

**b) Trigger (Custom-Event, Event-Name = exakt der Event-String):**
* `gf_anfrage_submit` · `gf_rueckruf` · `phone_click` (die 3 Conversions)
* optional Funnel: `gf_shown`, `gf_ort_gewaehlt`, `gf_termin_gewaehlt`

**c) GA4:**
* GA4-Configuration-Tag (oder bestehende Property) — Trigger `gf_shown` oder All Pages.
* GA4-Event-Tags je Event, Parameter: `value`, `currency`, `lead_id`, `schadenart`, `gutachter`,
  `cl_event_source`.
* In GA4-Admin `gf_anfrage_submit` + `gf_rueckruf` als **Schlüsselereignis (Conversion)** markieren.

**d) Google Ads:**
* **Conversion-Linker**-Tag auf All Pages (Pflicht für Enhanced Conv. + Attribution).
* Je Conversion-Action ein Ads-Conversion-Tag:
  * **Reservierung** → Trigger `gf_anfrage_submit`, Conversion-Value `{{value}}`, Currency `{{currency}}`,
    Transaction-ID `{{lead_id}}`, **Enhanced Conversions an** → die `user_data`-Variable von oben
    (E-Mail + Telefon + Name, GTM hasht selbst).
  * **Rückruf** → Trigger `gf_rueckruf`, Value `{{value}}`, Transaction-ID `{{lead_id}}`, EC mit `user_data`.
  * **Anruf** → Trigger `phone_click` (Micro-Conversion, i.d.R. ohne Wert).

**e) Conversion-Actions in Google Ads anlegen:** „Gutachter-Finder Reservierung" (wertbasiert,
Zählung *einzeln*, Transaction-ID-Dedupe), „Gutachter-Finder Rückruf", „Gutachter-Finder Anruf".

---

## 4 · Cross-Domain-Hinweis (Attribution)

Die Ad-Klick-Landung ist **claimondo.de** (Marketing), die Conversion passiert im **iframe
app.claimondo.de**. Für saubere Zuordnung:
* **GTM Cross-Domain-Linking** zwischen `claimondo.de` ↔ `app.claimondo.de` konfigurieren
  (Google-Ads/GA4 Linker-Domains) — genau wie bei der Monika.
* `lead_id`-Transaction-ID + Enhanced-Conversions (`user_data`: gehashte E-Mail/Telefon/Name) puffern
  den Cookie-/Cross-Domain-Verlust ab — **das ist hier der primäre Attributions-Pfad** (s. §2).

---

## 5 · GTM-Container in die Embed-Seite bringen — ✅ GEBAUT (env-gegated, in diesem PR)

Der env-gegatete Loader ist in `src/app/embed/gutachter-finder/page.tsx` drin (`next/script`,
`strategy="afterInteractive"`). Er lädt den GTM-Container **nur** wenn `GF_GTM_ID` gesetzt ist —
ohne ENV ist es ein No-op (nichts lädt, kein halbes Setup). CSP auf `/embed` ist nur
`frame-ancestors` (kein `script-src`) → GTM lädt ungehindert.

> **`GF_GTM_ID` ist bewusst NICHT `NEXT_PUBLIC_`:** Die Embed-Page ist eine dynamische
> Server-Component (await searchParams + Daten-Fetch) → sie liest `GF_GTM_ID` **pro Request zur
> Laufzeit** und rendert den Script server-seitig in die HTML. Heißt: **Var setzen + Server-Restart
> reicht — KEIN Rebuild nötig.** (`NEXT_PUBLIC_*` wäre build-time-inlined → Footgun: Var nur am
> laufenden Server setzen ohne Rebuild → GTM lädt still nie. Der Wert ist nicht geheim, steht eh im
> Client-HTML.)

**Was DU noch tun musst:**
* GTM-Container anlegen/wählen → **Container-ID** (`GTM-XXXXXXX`).
* `GF_GTM_ID` = diese ID **auf der app.claimondo.de-Deployment** (VPS Portal :3000) setzen
  (+ auf app.staging.claimondo.de für den Staging-Test) → Server-Restart → Container lädt, die
  `dataLayer`-Pushes erreichen GTM, deine Tags (§3) feuern.
* Verifizieren mit **GTM Preview-Mode** auf `app.claimondo.de/embed/gutachter-finder`.

---

## 6 · Embedding des iframes

Die Marketing-Seite bettet ein (WS6, bereits umgeswappt):

```html
<iframe
  src="https://app.claimondo.de/embed/gutachter-finder"
  style="width:100%;border:0;min-height:760px"
  loading="lazy"
  title="Kfz-Gutachter finden"
></iframe>
```

**Erlaubte Einbetter (CSP `frame-ancestors`, `next.config.ts:139`):**
```
frame-ancestors 'self' https://claimondo.de https://*.claimondo.de
```
* X-Frame-Options ist auf `/embed/*` bewusst **nicht** gesetzt (kennt kein „erlaube genau diese
  Origin") — die `frame-ancestors`-CSP steuert das.
* **Partner-Domains später:** zusätzliche Origins in `next.config.ts` zur `frame-ancestors`-Liste
  ergänzen (dann redeploy app.claimondo.de).
* **Deploy-Reihenfolge beachten:** app.claimondo.de (Embed) muss **prod-live sein, BEVOR** die
  Marketing-Seite das iframe live schaltet — sonst 404 im Frame.

---

## 7 · Checkliste für dich

- [ ] GTM-Container für den GF-Embed anlegen (oder „Embed"-Container wiederverwenden) → Container-ID
- [ ] `GF_GTM_ID` auf app.claimondo.de setzen + GTM-Loader in die Embed-Seite (kleiner PR, sag Bescheid)
- [ ] GTM: 9 Data-Layer-Variablen + 3–6 Custom-Event-Trigger + GA4-Config/Event-Tags + Conversion-Linker
- [ ] Google Ads: 3 Conversion-Actions (Reservierung wertbasiert + Dedupe / Rückruf / Anruf), Enhanced Conv. mit `phone`
- [ ] GA4: `gf_anfrage_submit` + `gf_rueckruf` als Schlüsselereignis
- [ ] GTM Cross-Domain-Linking claimondo.de ↔ app.claimondo.de
- [ ] (Optional Stream 8b) Beacon `/api/embed-track` persistieren + Ads-Conversions-API-Fallback

---

## 8 · ✅ ERLEDIGT (12.06.2026): Conversion-Actions in Google Ads angelegt

Die 3 Conversion-Actions aus §3e sind im Konto **951-112-7970 (Claimondo Cluster)** angelegt.
**Conversion-ID (für alle drei identisch): `18202744855`** (→ GTM-Tag-Feld „Conversion ID").

| Conversion-Action | Conversion-Label | Trigger-Event (GTM) | Einstellungen |
|---|---|---|---|
| **Gutachter-Finder Reservierung** | `7Oy6CL_3-L0cEJew3-dD` | `gf_anfrage_submit` | Kategorie „Lead-Formular senden", **primär**, unterschiedliche Werte (`{{value}}`), Zählung **eine**, Klick-Fenster 90 T |
| **Gutachter-Finder Rückruf** | `y32pCLzF_r0cEJew3-dD` | `gf_rueckruf` | Kategorie „Kontakt", **primär**, unterschiedliche Werte, Zählung **eine** |
| **Gutachter-Finder Anruf** | `Xy4uCL_F_r0cEJew3-dD` | `phone_click` | Kategorie „Kontakt", **sekundär** (Micro, nicht für Gebote), Zählung eine |

Hinweise fürs GTM-Wiring:
* **Transaction-ID** in beiden primären Tags auf `{{lead_id}}` mappen (Dedupe, §2).
* **Enhanced Conversions** beim Reservierungs-Tag (und Rückruf) aktivieren → die **`user_data`-Variable**
  (E-Mail/Telefon/Name, §2/§3a — GTM hasht selbst). EC ist kontoweit auf „über GTM verwaltet" gestellt.
* „Anruf" bewusst **Kategorie Kontakt statt Anruf-Lead**: Die Anruf-Lead-Kategorie erlaubt als Datenquelle nur Telefon-Tracking (Weiterleitungsnummern), keine Website-Events — `phone_click` ist aber ein GTM-Website-Event.
* Standardwert-Fallback steht auf 1 € (greift nur, wenn der Push kein `value` enthält — passiert laut tracking.ts nie bei den zwei primären).
* Status im Konto: „Inaktiv/Keine aktuellen Conversions", bis die ersten Events über den GTM-Container feuern. **Loader ist gebaut (§5)** — es fehlt nur noch die **GTM-Container-ID + `GF_GTM_ID` auf der VPS**.

> ⚠️ **Flag — Doppelzählung:** `gf_anfrage_submit` (100€) **und** `gf_rueckruf` (25€) können für
> denselben Lead feuern (Rückruf ist ein Danke-Seite-Add-on). Beide **primär** → eine Person =
> 2 Conversions/125€, Smart Bidding zählt beide. Überleg, ob „Rückruf" sekundär soll (wie „Anruf")
> — oder ob dir ein Lead-der-auch-Beratung-bucht den Mehrwert wert ist. (Reine Ads-UI-Entscheidung.)

---

## Referenz — Code-Stellen

| Was | Datei |
|---|---|
| `track()` + Conversion-Bags + Werte + `toE164` | `src/app/embed/gutachter-finder/_lib/tracking.ts` |
| Trigger-Aufrufe | `src/app/embed/gutachter-finder/_components/FinderWizard.tsx` |
| Beacon-Empfänger + ALLOWED_EVENTS | `src/app/api/embed-track/route.ts` |
| CSP `frame-ancestors` | `next.config.ts` (~Z.139) |
| Reservierung → `lead_id` | `reserviereEmbedTermin` in `src/app/embed/gutachter-finder/actions.ts` |
| Rückruf-Buchung | `bucheRueckrufBeimDispatcher` in `…/actions.ts` |
