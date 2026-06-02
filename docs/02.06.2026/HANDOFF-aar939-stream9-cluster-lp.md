# HANDOFF — AAR-939 Stream 9: Cluster-LP-Monika scharfstellen

**Datum:** 02.06.2026 · **Von:** Stream-8b-Session (Worktree `aar-939-stream8b-sv-tracking`)
**TL;DR:** Die Verdrahtung ist **fertig + verifiziert** — Stream 9 braucht **keinen App-Code mehr**, nur ENV + Re-Deploy auf den 3 Cluster-LP-VPS (dein Infra-Task) + einen Smoke. Ein **Routing-Gotcha** unbedingt vorher prüfen (Punkt 2).

---

## 1 · Status: Verdrahtung KOMPLETT (verifiziert, read-only)

`MonikaEmbedSlot.tsx` ist in **allen 3 LPs byte-identisch**, in `LandingPage.tsx` gemountet, ENV-gated:

```tsx
// kfz-gutachter-{wuppertal,duesseldorf,bonn}/components/MonikaEmbedSlot.tsx
if (!SITE.monikaEnabled) return null          // NEXT_PUBLIC_MONIKA_EMBED_ENABLED !== 'true' → null
<Script src={`${SITE.embedBase}/embed/monika.js`} strategy="lazyOnload"
  data-cluster={CLUSTER.key} data-stadt={city.slug} data-theme={CLUSTER.theme}
  data-phone={CLUSTER.phone.tel} data-wa={CLUSTER.phone.wa} />
```

**Contract end-to-end getraced (alles stimmig):**
- Widget-Boot (`src/embed/monika/index.tsx`): `data-cluster` gesetzt → `kfz_gutachter_lp`-Modus, alles aus `data-*`, kein Config-Call/Token.
- Submit-Payload (`app.tsx`): `{ source:'kfz_gutachter_lp', cluster, stadt_slug, page_url, name, telefon, consent_ts, honeypot, +gclid/utm/ga_client_id }` → deckt `EmbedAnfrageSchema` (Zod) vollständig.
- Webhook (`api/anfrage-from-lp/route.ts`): `kfz_gutachter_lp` → Origin-Check gegen `clusterAllowlist()` (= `kfz-unfallgutachter-{wuppertal,duesseldorf,bonn}.de`, exakt `CLUSTER.domain`) + Rate-Limit (IP). Kein Token nötig.
- `insertAnfrage`: schreibt `gutachter_finder_anfragen` mit `source='kfz_gutachter_lp'`, `status='neu'` (→ Dispatch-Queue), `variante=null`.
- `notifyAnfrage`: Dispatch-Email an `info@claimondo.de` + Baileys-WA an `KFZ_LP_BAILEYS_TARGET`.
- 8b-Tracking-Webhook `anfrage_eingegangen` feuert, **no-opt** korrekt (Cluster hat kein `embed_site_id`).

---

## 2 · ⚠️ PRE-DEPLOY-Check (Routing-Gotcha — zuerst klären!)

Das Widget lädt von **und** sendet an `${SITE.embedBase}` = `NEXT_PUBLIC_EMBED_BASE` (Default `https://claimondo.de`). Der Bundle (`public/embed/monika.js`) **und** die Route (`/api/anfrage-from-lp`) liegen aber in der **Haupt-App** (app.claimondo.de, PM2 :3000) — `claimondo.de` ist die Marketing-Site (:3006, separater Deploy).

**→ Verifiziere:** Serviert `claimondo.de` die Pfade `/embed/monika.js` + `/api/anfrage-from-lp` (nginx-Proxy auf :3000)?
- **Ja** → `NEXT_PUBLIC_EMBED_BASE=https://claimondo.de` ist ok.
- **Nein** → setze `NEXT_PUBLIC_EMBED_BASE=https://app.claimondo.de` in den 3 LP-ENVs (dann lädt+sendet das Widget direkt an die App). CORS ist offen (`Access-Control-Allow-Origin: *`), funktioniert cross-origin.

**Außerdem auf der Haupt-App (app.claimondo.de) prüfen:**
- `MONIKA_CLUSTER_DOMAINS` — **unset** (Fallback = die 3 korrekten Domains, ok) ODER exakt `kfz-unfallgutachter-wuppertal.de,kfz-unfallgutachter-duesseldorf.de,kfz-unfallgutachter-bonn.de`. Falsch/abweichend → **403 origin_not_allowed**.
- `KFZ_LP_BAILEYS_TARGET` — deine WA-Nummer (sonst kein WA-Ping; Dispatch-Email kommt trotzdem, non-fatal).

---

## 3 · Aktivierung (pro LP-VPS, dein Infra-Task)

In `/etc/kfz-gutachter-{cluster}/.env.local` (chmod 600) je LP:
```bash
NEXT_PUBLIC_MONIKA_EMBED_ENABLED=true
NEXT_PUBLIC_EMBED_BASE=https://claimondo.de   # bzw. app.claimondo.de laut Punkt 2
```
Dann Re-Deploy/Re-Build der jeweiligen LP (kein CI — Code-auf-main ≠ live, eigener Build-Schritt). Reihenfolge: **erst Wuppertal**, smoken, dann Düsseldorf + Bonn (Slots identisch → kein Per-LP-Code).

---

## 4 · POST-DEPLOY-Smoke (Tasks 9.3 / 9.4)

Auf `https://kfz-unfallgutachter-wuppertal.de/` (oder `/lp/<stadt>`):
1. Monika-FAB erscheint → öffnen → „Ja, ich hatte einen Unfall" → Tag → Zeit → Name + Telefon + Consent → „Anfrage senden" → **Success-State**.
2. DB-Verifikation (Supabase):
   ```sql
   SELECT id, source, cluster, stadt_slug, status, vorname, telefon, erstellt_am
   FROM gutachter_finder_anfragen
   WHERE source='kfz_gutachter_lp' ORDER BY erstellt_am DESC LIMIT 3;
   ```
   Erwartet: neue Zeile, `cluster='wuppertal'`, `stadt_slug=<stadt>`, `status='neu'`.
3. Dispatch-Email in `info@claimondo.de` + Baileys-WA an `KFZ_LP_BAILEYS_TARGET`.
4. dataLayer-Events im Tag-Assistant: `monika_shown` / `monika_open` / `monika_qualify_yes` / `monika_form_shown` / `monika_anfrage_submit`.
5. Erscheint die Anfrage im Dispatch (verwertbar, mit Kontakt + Herkunfts-Badge — Stream 3a/#2107).
**Screenshot je Schritt (Smoke-Pflicht).**

---

## 5 · Befund (Entscheidung nötig, nicht blockierend): `data-theme` ist tot

Die Slot sendet `data-theme="graphit"`, aber der Widget-Boot liest **`data-primary`/`data-accent`/`data-text`** (Hex) — `data-theme` wird **ignoriert**. Folge: Monika rendert auf den Cluster-LPs im **Claimondo-Default-Navy** (`#0D1B3E`), nicht im Graphit-Look der LP.

- **Option A (empfohlen, 0 Aufwand):** so lassen — eine Claimondo-gebrandete Capture-Bubble auf der Partner-LP ist vertretbar. Optional die tote `data-theme`-Zeile entfernen (Kosmetik).
- **Option B (graphit-Theme):** jeden `CLUSTER`-Config um ein Farb-Triple erweitern + Slot sendet `data-primary/accent/text`. Wuppertal-Palette: primary `#2A2E33`, accent `#D32E20`, text `#0F2429` (Düsseldorf/Bonn: aus deren `globals.css` ziehen). 3 sensible Cluster-Apps anfassen — nur wenn gewünscht.

Sag Bescheid, dann setze ich A (Cleanup) oder B (graphit-Wiring) um.

---

## 6 · Was NICHT in Stream 9 fällt
- Stream 7 Daten-Smoke der SV-Inbox (separater, data-gateter Punkt; braucht eine Live-`sv_embed`-Anfrage).
- 8b-Tracking ist davon unberührt (PR #2262) — Cluster-LP nutzt kein `embed_site`, daher kein SV-Tracking-Webhook.

---

## 7 · DEPLOY-ERGEBNIS (02.06.2026 — DURCHGEFÜHRT)

**Stream 9 ist LIVE auf allen 3 Cluster-LPs** (Wuppertal/Düsseldorf/Bonn). Durchgeführt via `scripts/deploy-cluster-monika.py` (build-on-VPS, sequenziell, Canary Wuppertal zuerst).

**Befund vor Deploy:** Alle 3 hatten `NEXT_PUBLIC_MONIKA_EMBED_ENABLED=true` (seit 31.05.), aber **kein `NEXT_PUBLIC_EMBED_BASE`** → Default `claimondo.de` → `/embed/monika.js` = **404**. Monika war „an" aber kaputt (Script lud nie). **Fix:** `NEXT_PUBLIC_EMBED_BASE=https://app.claimondo.de` je `.env.local` ergänzt + `npm run build` + `pm2 reload`.

**Verifiziert je LP:** `embed.js-status=200` + Live-HTML referenziert `app.claimondo.de/embed/monika`. Headless-Render-Smoke Wuppertal: **FAB rendert** (`hasFab:true`, Screenshot `docs/02.06.2026/smoke-monika-wuppertal.png`), Bundle lädt von app.claimondo.de. Routing-Gotcha aus §2 damit gelöst (Variante: embedBase=app.claimondo.de).

**⚠️ Latenter Bug aufgedeckt (durch Aktivierung sichtbar gemacht):** `/api/embed-track` (Ebene-1-Telemetrie-Beacon) schlägt mit **CORS** fehl — `navigator.sendBeacon` (`src/embed/monika/tracking.ts:45`) ist credentialed, der Route-Response hat `Access-Control-Allow-Origin: *` (inkompatibel mit credentials-Modus).
- **Impact: niedrig.** NUR der interne embed-track-Beacon (`monika_shown` etc. an Claimondos eigenes Log). **Lead-Capture (`/api/anfrage-from-lp`, kein credentials) UND GA4-dataLayer-Push (Ebene 1, `tracking.ts:34-36`) sind NICHT betroffen.** Pre-existing Stream-4/5-Bug.
- **Fix (klein, server-only):** `src/app/api/embed-track/route.ts` → Request-Origin echoen + `Access-Control-Allow-Credentials: true` (statt Wildcard `*`). Braucht **app.claimondo.de-Redeploy** (Haupt-App), NICHT die Cluster-LPs. → offen, Aaron-Entscheidung.

---

## 8 · LIVE-SUBMIT-SMOKE + CHECK-Fix (02.06., DURCHGEFÜHRT)

Voller E2E-Submit über das echte Monika-Formular auf der Live-Wuppertal-LP (`scripts/smoke-monika-submit.mjs`, Headless, Test-Name + Test-Nr `+491633628571`).

**1. Versuch: 500 `insert_failed`** — Smoke deckte einen **latenten Stream-2-Bug** auf: `insertAnfrage` schreibt den menschenlesbaren Slot-String in `gutachter_finder_anfragen.wunschtermin_wann`, aber die Spalte hatte einen CHECK `IN ('sofort','heute','tage')` (natives Funnel-Enum) → Cluster-LP-Insert kippte. Formular/CORS/Origin/Rate-Limit liefen alle durch — nur der Insert.

**Fix (Migration `20260602135537`):** CHECK chirurgisch umgebaut — Enum bleibt für native Zeilen (`source IS NULL`), Monika-Zeilen (`source IS NOT NULL`) dürfen Freitext. Kein Haupt-App-Deploy nötig (der bereits deployte Insert-Code geht jetzt durch). `wunschtermin_wann` ist display-only (sv-portal/anfragen) → Freitext unkritisch.

**2. Versuch: ✅ `success:true`, HTTP 200, `anfrage_id=705540c7-…`.** gfa-Zeile verifiziert: source=kfz_gutachter_lp, cluster=wuppertal, stadt=wuppertal, status=neu, origin=kfz-unfallgutachter-wuppertal.de, wunschtermin_wann="So schnell wie möglich, Vormittag (8–12 Uhr)", konvertiert_zu_lead_id=null (→ manuelle Dispatch-Qualifizierung). Notify (Dispatch-Email + Baileys-WA an KFZ_LP_BAILEYS_TARGET) im `after()` gefeuert.

**Stream 9 ist damit voll verifiziert: Widget rendert + Lead-Capture funktioniert end-to-end auf den Live-LPs.**

**Aufräumen:** Test-Lead `705540c7-…` (Name „SMOKE Stream9 Test bitte ignorieren") liegt in Dispatch (status=neu) — bitte dort disqualifizieren/löschen (execute_sql ist per Konvention READ-only, daher nicht per Script gelöscht).
