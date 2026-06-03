# Monika auf den Cluster-LPs — Dedupe + Embed-Funktionsfähigkeit

**Spec / Handoff · 2026-06-03**
**Status:** Untersuchung abgeschlossen, **KEIN Code** (Aaron: „erst spec/dokumentieren"). Richtung Q1: Embed-Widget = die eine Monika, statische Pill raus.
**Kontext:** 3 Standalone-LPs `kfz-gutachter-{wuppertal,duesseldorf,bonn}` (Domains `kfz-unfallgutachter-*.de`), Branch-Familie AAR-939.

---

## 1 · Ist-Zustand (Live-Befund 02./03.06.2026)

### Die „Doppelung" — zwei Monikas
1. **Statische FabStack-Pill** — `FabStack.tsx` (`#fabStack` > `#fabPill`): Monika-Avatar (`/assets/img/shared/monika.png`) + „Schadensberatung / Wir klären Ihre Fragen · 24/7" + Claimondo-Siegel. `position:fixed bottom-6 right-6 z-[100]`. **Reiner WhatsApp-Link** (`waHref`), kein Chat. Im selben Stack: WhatsApp-FAB (`#fabWa`), Telefon-FAB, Sticky-Call-Bar (mobile, `#mobileStickyCall`), Back-to-Top.
2. **Embed-Widget** — `MonikaEmbedSlot.tsx` lädt `app.claimondo.de/embed/monika.js` (lazyOnload, ENV-gated `NEXT_PUBLIC_MONIKA_EMBED_ENABLED=true`, `NEXT_PUBLIC_EMBED_BASE=https://app.claimondo.de` — beides live gesetzt). 34 KB Preact, Header „Claimondo Monika-Embed v1 — AAR-939". Mountet einen **eigenen Launcher im Shadow-DOM** (`:host{all:initial} .fab{…}`) → zweite Monika neben der Pill.
3. Zusätzlich **Netzwerk-„Schadensbetreuerin"-Karte** (`NetzwerkSection.tsx`): Monika-Avatar + „● online · 24/7". Content/Inline, kein Floater — separat zu bewerten.

### Das „dünn" — das Embed-Widget ist auf den LPs funktional kaputt
Das Widget ruft 3 Endpoints auf `app.claimondo.de`. Preflight von LP-Origin getestet:

| Endpoint | Zweck | OPTIONS-Preflight | Echter Call (Live-Console) |
|---|---|---|---|
| `/api/anfrage-from-lp` | **Lead-Submit (conversion-kritisch)** | 204 · `ACAO:*` · POST,OPTIONS · Content-Type | (vermutlich wie embed-track) |
| `/api/embed-track` | Tracking | 204 · `ACAO:*` | **`net::ERR_FAILED` / CORS-blocked** |
| `/api/embed` | ? | **404 Not Found** | — |

**Root-Cause (präzise):** Der **Preflight (OPTIONS)** liefert `Access-Control-Allow-Origin: *` (204) — aber der **tatsächliche POST** scheitert live mit `ERR_FAILED`/CORS. Klassisches Muster: CORS-Header nur auf der OPTIONS-Antwort gesetzt, **nicht auf der echten POST-Antwort** — ODER das Widget nutzt `credentials:'include'` und `ACAO:*` (dann verlangt der Browser eine **spezifische** Origin + `Access-Control-Allow-Credentials:true`, nicht `*`). Beides blockt die Antwort trotz „grünem" Preflight.

→ **Konsequenz:** Monika lädt, aber Tracking und — sehr wahrscheinlich — **Lead-Submit funktionieren von den LP-Origins nicht**. Genau das macht sie „dünn"/tot.

---

## 2 · Soll-Zustand (Aaron-Richtung Q1)
- **Eine** Monika = das **Embed-Widget**.
- **Statische Monika-Pill raus** aus FabStack. **Bleiben:** WhatsApp-FAB, Telefon-FAB, Sticky-Call-Bar, Back-to-Top — separate CTAs ohne Monika-Branding; Scroll-Gating bleibt für die verbleibenden Elemente.
- **Offen (Aaron):** Netzwerk-„Schadensbetreuerin"-Karte behalten (Content) oder auch entschärfen?

---

## 3 · Arbeitspakete

### Paket A · LP-Dedupe (3 Apps, konfliktfrei, eigener Branch)
- `FabStack.tsx`: den `#fabPill`-Block entfernen (Avatar + „Schadensberatung"-Text + Siegel). WA-/Tel-FAB + Sticky-Call + Back-to-Top + Scroll-Gating behalten.
- `globals.css`: tote `.fab-pill-*` / ggf. `.fab-online-pulse` aufräumen, falls dann unbenutzt.
- `MonikaEmbedSlot.tsx` bleibt unverändert (lädt das Widget).
- 3× identisch (Komponenten byte-gleich). Verify: nur noch EIN Floater (Widget) + WA/Tel-FABs.
- Aufwand: klein, **kein Backend**.

### Paket B · Backend-CORS (claimondo-v2 Main-App — AAR-939-Territorium)
- Die **echten POST-Antworten** von `/api/anfrage-from-lp` + `/api/embed-track` müssen `Access-Control-Allow-Origin` für die LP-Origins zurückgeben (nicht nur die OPTIONS-Antwort). Bei credentialed fetch: spezifische Origin (Allowlist `kfz-unfallgutachter-{wuppertal,duesseldorf,bonn}.de`) + `Access-Control-Allow-Credentials:true`.
- `/api/embed` 404 klären: wird es wirklich aufgerufen (tote Referenz im Widget) oder Basis/Tippfehler?
- Quelle: `src/app/api/embed-track/route.ts`, `src/app/api/anfrage-from-lp/route.ts` (+ Widget-Source). Embed-Widget + diese Routes = **AAR-939** (Sessions `0f18577a`, `a5281f75` auf `aar-939-monika-embed`). **Koordination Pflicht**, nicht trampeln.
- **Test nach Fix:** Live-Console der 3 LPs frei von CORS/ERR_FAILED; Lead-Submit aus dem Widget erzeugt einen echten Lead.

### Paket C · Widget-Ausbau (optional — „vorgesehen" weiter?)
- Falls „ausbauen" mehr heißt als „dedupe + funktionsfähig": Persona/Lottie-Vision (`MONIKA-LOTTIE-RUNTIME-SPEC.md` aus dem v15-Bundle) — mehr States, Animation. Betrifft das Widget (AAR-939), nicht die LP. Separates Paket.

---

## 4 · Offene Entscheidungen (Aaron)
1. **Backend-Ownership:** Paket B mache ich (mit Abstimmung) ODER die AAR-939-Embed-Session?
2. **Netzwerk-Betreuerin-Karte:** behalten oder raus?
3. **Widget-Ausbau-Tiefe:** nur funktionsfähig + dedupe, oder Lottie-Vision (Paket C)?
4. **Reihenfolge:** Paket A (LP-Dedupe) ginge sofort — aber Dedupe **ohne** funktionierendes Widget (Paket B) = kurzzeitig gar keine funktionierende Monika sichtbar. **Empfehlung: B vor/mit A** (erst Widget funktionsfähig, dann Pill raus).

---

## 5 · Koordination
- Embed-Widget + Embed-API = **AAR-939** (`aar-939-monika-embed`-Sessions). Vor Paket B abstimmen.
- Paket A (`FabStack.tsx`) ist separat von der Embed-Arbeit → konfliktfrei in eigenem Branch.
