# HANDOFF — Gutachter-Finder Embed (AAR-956 Folgephase)

> **Datum:** 2026-06-11 · **Branch:** `kitta/aar-956-gutachter-finder-2button` (= „gf-2button") · **Revier:** aar-956
> **Voll-Design:** `docs/superpowers/specs/2026-06-11-gutachter-finder-embed-design.md`
> **Memory:** `project_gutachter_finder_embed.md` (+ `COORDINATION-aar956-termin-engine.md`)
>
> Dieses Handoff ist ein **ausführbarer Plan** (zero-context-tauglich). Lies die Spec fürs volle Design; hier steht Ist-Stand + die exakten nächsten Tasks + Gotchas.

---

## TL;DR

Der Gutachter-Finder (Karte + Anfrage + Termin) zieht aus der **Marketing-App** in die **Haupt-App** als **standalone Route `app.claimondo.de/embed/gutachter-finder`**, die per `<iframe>` **überall** einbettbar ist (claimondo.de + eigene Domain + Partner). Gewinn: direkter Termin-Engine-Zugriff (Inline-Booking), Design-Tokens gratis, **maximaler Reuse**. WS0 + WS1a gebaut+gepusht. **Starte mit TASK 0** (ein Shared-Loader-Anon-Fix), dann die Karten-UI.

---

## PRINZIP (Aaron, verbindlich): REUSE statt neu bauen

Die Haupt-App hat fast alles schon. **Nutze diese — nicht nachbauen:**

| Brauche ich | Existiert (exakter Pfad) | Form |
|---|---|---|
| **Slot-Picker** (WS4) | `src/app/flow/[token]/FlowSlotStep.tsx` | `<FlowSlotStep token onGebucht onOhneTermin />` — macht Match→Slot→Buchen KOMPLETT (ladeMatchingFlow→SvSlotAuswahl→bucheTerminFlow + `ortFehlt`→GooglePlaceAutocomplete→speichereBesichtigungsortFlow + `kein_match`-Fallback, token-basiert, Tokens+i18n drin) |
| Slot-UI | `@/components/self-service/SvSlotAuswahl` | von FlowSlotStep genutzt |
| **Google-Sterne** (#11) | `src/components/shared/GoogleBewertungBadge.tsx` | `<GoogleBewertungBadge durchschnitt anzahl size />` |
| SV-Karten-Daten | `src/lib/actions/gutachter-finder-actions.ts` | `ladeAktiveSVs()` / `ladeSvLeads()` → `{ok,data}` |
| Lead+Token | `src/lib/start-link/issue-canonical-flowlink.ts` | `issueCanonicalFlowLinkForAnfrage(anfrageId, { send:false })` → token (kein Versand, User macht inline weiter) |
| /flow-Actions | `src/app/flow/[token]/self-service-actions.ts` | `ladeMatchingFlow(token)`, `bucheTerminFlow(token,svId,start,end)`, `speichereBesichtigungsortFlow(token,ort)` |
| Termin-Engine | `@/lib/termine/engine` + `@/lib/sv-matching-modul` | **Leitfaden `src/lib/termine/engine/CONTRACT.md`** — IMMER über die documented functions, nie raw `gutachter_termine`-Queries |

**Konsequenz:** WS4 (Inline-Booking) = `<FlowSlotStep>` reindroppen. Kein neuer Picker, kein neues Cross-Origin-API. De facto = **/flow + Karte, inline.**

---

## AKTUELLER STAND (gebaut, verifiziert, gepusht auf gf-2button)

- **WS0** (`9c1a793f6`): Embed-Route `src/app/embed/gutachter-finder/page.tsx` (standalone, erbt minimales Root-Layout, `robots noindex`) + `/embed/` in die Auth-Public-Allowlist (`src/lib/supabase/middleware.ts`, `isPublicPath`, MIT Slash). → `localhost:3000/embed/gutachter-finder` = **HTTP 200 anon** verifiziert.
- **WS1a** (`453c87928`): Embed-Page lädt SV-Daten via **Reuse** `ladeAktiveSVs`/`ladeSvLeads`. → 62 Lead-Pins laden (aktive SVs = 0, siehe TASK 0).
- **Spec** (`ab4e5f74c`) + dieses Handoff committed.
- **#2693** (anfrage-from-lp Versand-State + aktion) + **#2701** (Marketing-2-Knopf-Wizard) sind **bereits auf staging gemergt**. #2701 wird durch den Embed überholt → Ablösung in WS6.

---

## SETUP (Dev-Env — so läuft's lokal)

Worktree `.claude/worktrees/aar-956-gf-2button` (off `origin/staging`). Beide Apps sind **standalone** (eigene `package.json`).

1. **Haupt-App:** `npm ci` im Worktree-Root (schon gemacht) + `.env.local` aus Haupt-Checkout gespiegelt (`cp <root>/.env.local <worktree>/.env.local`, gitignored). `npm run dev` → **:3000**.
2. **Marketing** (für WS6-iframe): `npm ci` in `claimondo-marketing/` + `.env.local` dort (Supabase+Mapbox aus Root gespiegelt). `npm run dev -- -p 3010` → **:3010**.
3. Beide Dev-Server liefen am Session-Ende im Hintergrund — falls gestoppt, neu starten. **Achtung Pool:** nicht > 2 next-dev gegen die Prod-DB (Memory `feedback_supabase_connections`).
4. **Proxy/Allowlist ist schon erledigt** (WS0): `/embed/` ist anon. Wenn eine neue Route 307→/login wirft → `isPublicPath` in `src/lib/supabase/middleware.ts` prüfen.

**Lockfile-Root-Warnung** beim Dev-Start ist **benign** — der Dev-Server serviert den Worktree (empirisch verifiziert: WS0-Route tauchte auf).

---

## TASK 0 (ZUERST) — `ladeAktiveSVs` Anon-Fix [Shared-Function, fixt 2 public APIs mit]

**Bug:** `src/lib/actions/gutachter-finder-actions.ts` → `ladeAktiveSVs()` Read 1 (~Z.112) hat `.eq('ist_aktiv', true)` auf `.from('sachverstaendige')`. `ist_aktiv` ist **NICHT** in den anon-Spalten-Grants → anon wirft `permission denied for table sachverstaendige` → der **ganze Read** stirbt → `{ok:false}` → **0 aktive SVs**.

**Fix:** Das `.eq('ist_aktiv', true)` auf `sachverstaendige` **entfernen**. Die RLS-Policy `sachverstaendige_anon_select_map_ready` erzwingt `ist_aktiv=true AND verifiziert=true AND geloescht_am IS NULL` **server-seitig** — der App-Filter war redundant + anon-schädlich. (Das `.eq('ist_aktiv', true)` in `ladeSvLeads` auf `sv_leads` BLEIBT — `sv_leads.ist_aktiv` IST anon-granted, 62 Pins laden ja.)

**Referenz = die schon gefixte Marketing-Version:** `claimondo-marketing/lib/actions/gutachter-finder-actions.ts` → `ladeAktiveSVs` (~Z.107-183). Sie hat (a) kein `ist_aktiv`-Filter und (b) Reviews für **ALLE verifizierten** SVs (nicht nur `paket==='standard'`, Aaron 02.06.). **Beides** in die Haupt-App-Version übernehmen (gezielt, nicht das ganze File blind kopieren — Helper `isTestAccount`/`firstInitial`/`extractStadt` in der Haupt-App prüfen).

**Caller (alle anon/public → Fix ist safe + Boy-Scout):**
- `src/app/embed/gutachter-finder/page.tsx` (neu, unser Embed)
- `src/app/api/v1/sv-in-naehe/route.ts` (public LLM-API — **bekommt aktuell 0 Tier-1, latenter Prod-Bug, wird mitgefixt**)
- `src/app/api/v1/karte/[plz]/route.ts` (Karten-PNG-API — **ebenfalls 0 aktive SVs, mitgefixt**)

**Test (Smoke):**
- `curl localhost:3000/embed/gutachter-finder` → „aktive SVs" > 0.
- `curl 'localhost:3000/api/v1/sv-in-naehe?plz=50670'` → `sv_liste` enthält `tier:1`-Einträge.
- Keine Testdaten erzeugt (read-only).

**Audit-Hinweis:** Shared-Function → `grep -rn "ladeAktiveSVs" src/` final gegenchecken; alle Caller sind anon → keine Auth-Regression (RLS trägt). `npm run check:token-audit` + voller `tsc` vor Commit.

---

## TASK 1 (WS1b) — Karten-UI portieren

- **Port:** `claimondo-marketing/app/[locale]/gutachter-finden/GutachterFinderMapClient.tsx` (~400 Z., Mapbox-GL, Pins) → `src/app/embed/gutachter-finder/_components/FinderMap.tsx` (Client-Component).
- **Daten:** kommen schon aus `page.tsx` (WS1a, `ladeAktiveSVs`/`ladeSvLeads`) → als Props reichen.
- **Design-Tokens (#12):** alle roh-Hex/`COL_*`/Inline-Styles → `claimondo-*`/`rounded-ios`/Typo-Skala; Buttons → `primitives.Button`. (Mapbox-Marker-Paint darf raw color bleiben → `// Token-Audit-Skip`-Header.)
- **Standalone-Leanness:** Embed soll ohne Marketing-Banner/JSON-LD laufen — falls das Root-Layout (`src/app/layout.tsx`) störende Chrome (PwaInstallBanner/OfflineBanner/Toaster) in den iframe bringt, ggf. eine schlanke `layout.tsx` unter `app/embed/` (kein neuer Root nötig — Root ist schon minimal).
- **Akzeptanz:** Karte rendert in der Haupt-App mit Pins (nach TASK 0 > 0 aktive), token-konform.

## TASK 2 (WS2) — Profil über Pin + Google-Sterne (#4/#8/#10/#11)

- Profil-Popup öffnet **über** dem Pin (Mapbox `Popup anchor:'bottom'`), schöneres Layout, mit `<GoogleBewertungBadge>` (echte Google-Reviews aus `google_bewertungen_cache`).
- **KEIN** „Anfrage über Wizard"-CTA mehr im Popup (das alte `claimondo:open-wizard` raus — #3).
- **Akzeptanz:** Pin-Klick → schönes Profil über dem Pin, kein Wizard-Trigger.

## TASK 3 (WS3) — System-empfohlener SV + Route/Zoom (#3/#9)

- Karten-Klick = nur Ansehen (kein Fixer; alte `claimondo:select-sv`→`zugeordneter_sv_id`-Verdrahtung raus).
- Nach Step 2 (Ort vorhanden): `ladeMatchingFlow`/`planeTerminOeffentlich` liefert den empfohlenen SV → Karte zeigt ihn: **berechnete Route** (Mapbox Directions API, Token da) wenn Standort vorhanden, sonst **flyTo/Zoom auf Pin** + Profil auf.
- **Akzeptanz:** kein User-Fixer; empfohlener SV als Route oder Zoom.

## TASK 4 (WS4) — 3-Step-Wizard + Inline-Booking (#1/#2) — DER KERN

- Wizard: Step 1 Schaden → Step 2 Kontakt+Ort → **Step 3 Slot-Picker**.
- **Step 2 Submit:** gfa anlegen → `issueCanonicalFlowLinkForAnfrage(anfrageId, { send:false })` → `token`. (Anfrage = die gfa; kein Versand, User bucht inline.)
- **Step 3 = `<FlowSlotStep token={token} onGebucht={…} />`** reindroppen. Wenn Route-privat: FlowSlotStep + die /flow-Actions ggf. nach `@/components/self-service/` heben (Mini-Extraktion, kein Rewrite).
- **Soft-Hold** bei offenem Wizard via `opts.zusaetzlicheBelegung` an `freieSlots` (Engine-Hinweis).
- **Akzeptanz + PFLICHT-SMOKE (wie /flow):** voller Durchlauf → gebuchter Termin **inline** → `findeTerminFuerLead(db, leadId)` findet ihn (bezug-nativ, `lead_id=NULL`!) → leak-frei (nur `toOeffentlichesSvProfil`-Felder am Client). **Testdaten danach aus der geteilten Prod-DB putzen.**

## TASK 5 (WS5) — „Beratung vereinbaren" → Baileys-Anfrage (#7)

- CTA → schlankes Anfrage-Form → legt Anfrage an + sendet **Baileys-WA** an **Kunde** (hinterlegte Nachricht) + **Team**.
- Baileys-Client in der Haupt-App nutzen (Pendant zu `claimondo-marketing/lib/whatsapp/baileys-client.ts`).

## TASK 6 (WS6) — Marketing-iframe-Swap + #2701-Ablösung (#5/#6)

- `claimondo-marketing/app/[locale]/gutachter-finden/page.tsx`: `<GutachterFindenSection variant="full" height="100dvh">` → **`<iframe src="https://app.claimondo.de/embed/gutachter-finder">`** mit begrenzter Höhe (postMessage-Höhe). SEO-Content drunter bleibt (#6).
- **iframe-CSP:** auf der Embed-Route `frame-ancestors` setzen (claimondo.de + `*.claimondo.de` + Partner-Domains), kein `X-Frame-Options: DENY`.
- **#2701-Ablösung:** den jetzt toten Marketing-Finder entfernen — `GutachterFinderAnfrageWizard.tsx` (das 2-Knopf-Wizard aus #2701), `GutachterFinderMapClient.tsx`, `GutachterFindenSection.tsx`, `KartenWizardToggle.tsx` + die Schnell-Anfrage-Verdrahtung (MiniWizard bleibt — wird auch von `/schaden-melden` genutzt!). Dead-Code-Check.

---

## OFFENE ENTSCHEIDUNGEN (Aaron)

1. **Baileys-Nachricht (WS5):** Wo ist die „hinterlegte Nachricht" + die Team-WA-Nummer konfiguriert? (Template-Konstante / ENV / embed_sites?)
2. **i18n:** Vorschlag **Embed DE-only** (Strings inline mit echten Umlauten) — spart die next-intl-Migration; Marketing-SEO-Seite bleibt ×6.
3. **embed_sites:** Vorschlag **fixe Route ohne embed_sites** (der Finder ist eine Claimondo-Fläche, kein per-SV-Embed) → embed_sites bleibt Monikas Revier.
4. **frame-ancestors-Liste:** initial claimondo.de + `*.claimondo.de`; Partner-Domains später.

## KOORDINATION

- Session `69a05883` (`kitta/aar-939-monika-embed`) besitzt `public/embed/*`, `/api/embed/*`, `embed_sites`. **Der iframe-Weg meidet die** (neue Route + Marketing-iframe). Geteilt nur `anfrage-from-lp` (gehört aar-956) + die Engine (read-only via CONTRACT). **Vor Eingriff in embed-Infra → über Aaron abstimmen.**
- `src/lib/actions/gutachter-finder-actions.ts` (TASK 0) wird auch von 2 v1-APIs genutzt — Fix ist additiv/anon-safe, aber Caller im Auge behalten.

## GOTCHAS / LESSONS (must-read)

- **Engine-CONTRACT** (`src/lib/termine/engine/CONTRACT.md`): nie `.eq('lead_id')`/`.eq('sv_id')` auf `gutachter_termine` → `findeTerminFuerLead`. Anon → `toOeffentlichesSvProfil`/`planeTerminOeffentlich` (kein PII-Leak). Soft-Holds → `zusaetzlicheBelegung`. CI-Ratchet `check:termin-engine-contract` blockt Verstöße.
- **Commits:** spezifische Pfade (`git add <file>`), NIE `git add -A` — Worktree hat `.tmp-*`/node_modules/`.env.local` (Temp-File-Trap, Memory).
- **Write-Tool** hängt zeitweise literales `</content>` an → nach jedem Write scannen.
- **proxy.ts** ist die Next-16-Middleware (umbenannt von middleware.ts); die Auth-Public-Liste sitzt in `src/lib/supabase/middleware.ts:isPublicPath`.
- **Marketing nicht lokal tsc-bar** ohne node_modules — Haupt-App schon (`npm ci` lief).

## VERIFIKATION (je WS)

Screenshot + Analyse je sichtbarem Schritt (Memory `feedback_smoke_screenshot_pflicht`). WS4-Pflicht-Smoke = der konkrete Buchungs-Pfad wie bei /flow (Slots rendern → leak-frei → buchen → Reader findet Termin). Vor jedem Commit: 7-Punkte-Audit + `tsc`/`check:token-audit`.

## ANFORDERUNGEN (Aarons 12 Punkte — Vollständigkeits-Check)

(1) Schnell-Anfrage/Toggle weg → WS6. (2) 3. Step Termin inline via API → WS4. (3) Profile nur ansehen, System wählt SV → WS3. (4/8/10/11) Profil schöner, über Pin, Google-Sterne → WS2. (5/6) embed-Look, Seite unten sichtbar → WS0/WS6. (7) Beratung→Baileys → WS5. (9) empfohlener SV als Route/Zoom → WS3. (12) Design-Tokens → durchgängig (Haupt-App-Component-Set).
