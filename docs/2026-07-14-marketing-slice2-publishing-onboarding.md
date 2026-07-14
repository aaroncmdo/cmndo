# Marketing Content-Studio — Slice 2 (Publishing) · Onboarding & Architektur

**Ziel:** die fertigen Clips (Slice 1, live) automatisiert Richtung TikTok & Instagram/Meta bringen — nach dem gelockten Modell **„Fabrik → Entwürfe, du finalisierst"**.

> ⚠️ API-Details ändern sich. Vor dem Bau die aktuellen Docs gegenchecken (Links unten). Dieses Doc ist der Fahrplan + die Onboarding-Checkliste, damit die **Plattform-Audits (2–4 Wochen je Seite) sofort starten** — die laufen, während ich die Integration baue.

---

## 0. Das gelockte Modell (Erinnerung)

Virale Trending-Sounds lassen sich **NICHT** per API ins Video backen/verlinken (Lizenz + Plattform-Design). Deshalb:

- **TikTok:** die Fabrik pusht das fertige Video in die **Drafts/Inbox** (dokumentierter API-Modus). Du öffnest die App, tippst den **Trending-Sound** an (den die Fabrik dir vorschlägt), checkst kurz, postest. = echter gelinkter Sound + Algo-Boost + Qualitäts-Gate, ~15 Sek/Clip.
- **Instagram:** hat **keinen** Draft-Trending-Weg. Zwei Optionen: (a) **API-direkt** posten (spielt das eingebettete Audio = Voice/cleared Bett, kein Trending), oder (b) den Reel komplett **manuell** in-app (für Trending-Audio). Empfehlung: API-direkt für Volumen, manuell nur wenn ein Sound wirklich zünden soll.

---

## 1. TikTok — Onboarding (deine Schritte)

**Portal:** https://developers.tiktok.com

1. **Developer-Account** anlegen (mit dem Claimondo-Business-Account / einer Firmen-Email).
2. **App erstellen** → Produkt **„Content Posting API"** hinzufügen.
3. **Scope beantragen:**
   - `video.upload` → **Upload in die Inbox/Draft** (Creator finalisiert in-app) ← **das ist unser Weg** (Trending-Sound-kompatibel).
   - (`video.publish` = Direct-Post; braucht strengeren Audit + zeigt keinen Trending-Sound — für uns NICHT nötig.)
4. **App Review / Audit einreichen.** TikTok prüft:
   - Use-Case-Beschreibung (Business veröffentlicht eigene Marketing-Kurzvideos).
   - **Demo-Video der Integration** ← wir haben jetzt echte Clips, die zeigen den Output.
   - **Privacy Policy URL** + **Terms of Service URL** (z.B. `claimondo.de/datenschutz` + AGB).
   - UX-Guideline-Compliance (Consent, TikTok-Branding im Flow).
   - Dauer: typ. **1–2 Wochen**.
5. **Ergebnis:** Client-Key + Client-Secret. Der Ziel-TikTok-Account (Claimondo) autorisiert per **OAuth** (einmalig, Refresh-Token).

**Was ich brauche, sobald das steht:** Client-Key/-Secret (in VPS-Env), der autorisierte Account.

**Docs:** https://developers.tiktok.com/doc/content-posting-api-get-started

---

## 2. Meta / Instagram — Onboarding (deine Schritte)

**Portal:** https://developers.facebook.com

1. **Meta-Developer-Account** + **Meta-App** (Typ: **Business**).
2. **Instagram-Business- oder Creator-Account**, verbunden mit einer **Facebook-Seite** (Voraussetzung fürs Reels-Publishing über die Graph API).
3. **Instagram Graph API — Content Publishing** nutzen:
   - `POST /{ig-user-id}/media` (media_type=`REELS`, `video_url`, `caption`) → `POST /{ig-user-id}/media_publish`.
   - Rate-Limit: ~25 API-Posts / 24 h je Account (für 10–20 Clips/Woche locker ausreichend).
4. **Permissions** (brauchen **App Review**): `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`.
5. **App Review einreichen:** Screencast-Demo des Flows + Use-Case. Dauer: typ. **2–4 Wochen**.
6. **Ergebnis:** App-ID/-Secret + ein **Long-Lived Page/IG-Token**.

**Trending-Audio auf IG:** per API NICHT möglich → API-Posts spielen das Video-Audio (Voice/cleared Bett). Trending = manuell in-app.

**Docs:** https://developers.facebook.com/docs/instagram-platform/content-publishing

---

## 3. Was ich baue (sobald Zugang da ist — läuft parallel zu den Audits)

Alles greenfield unter `src/lib/marketing/publishing/*` + `src/app/admin/marketing/content-studio/*`, mockbar ohne Live-Zugang:

1. **OAuth-Flow** — TikTok/IG-Account verbinden, Tokens sicher speichern (Supabase, verschlüsselt), Refresh.
2. **Draft-Push (TikTok)** — Video aus dem Bucket via Content Posting API in die Inbox pushen; Status/Publish-ID am Job tracken.
3. **Trending-Suggest** — TikTok Creative Center (aktuelle Trending-Sounds je Region) → pro Clip Vorschlag + Direktlink, angezeigt am Draft. (Fragil/TikTok-only, Scrape — mit Fallback.)
4. **IG-Direct-Publish (optional)** — Graph-API-Post (cleared Bett/Voice, kein Trending).
5. **Publishing-UI** — im Content-Studio ein „Veröffentlichen"-Schritt: „An TikTok-Entwürfe senden" (+ Trending-Vorschlag) / „Auf Instagram posten".
6. **Neue DB-Spalten** — `publish_status`, `tiktok_publish_id`, `ig_media_id`, `trending_sound_vorschlag` (via Supabase-Plugin, Regel 2).

**Slice 3 danach:** Cron-Worker (auto-generieren + auto-in-Drafts-pushen nächtlich; du machst morgens den 15-Sek-Post-Pass) + Render aus dem Web-Prozess in einen Worker auslagern.

---

## 4. Timeline / Reihenfolge

```
JETZT (du):  TikTok- + Meta-App registrieren + Reviews einreichen (mit Demo-Clips)
             └─ Audits laufen 2–4 Wochen ─────────────────────┐
PARALLEL (ich): OAuth + Draft-Push + Trending-Suggest + UI bauen (mockbar)
                                                               │
NACH Zugang:  verdrahten + Prod-Smoke (echter Draft-Push auf Test-Account)
              → Slice 3 Cron
```

**Blocker = nur dein Onboarding-Start.** Sobald die Apps eingereicht sind, ist alles andere meine Arbeit.

---

## Kontakt / Status
Slice 1 (Generierung + Politur + Script-Review + Brand-Assets) ist **live + deploy-fest** auf prod. Siehe Memory `COORDINATION-marketing-content-studio`.
