# Gutachter-Finder Embed — Design-Spec

> **Status:** DESIGN (Review Aaron). **Datum:** 2026-06-11. **Revier:** aar-956 (753d8096).
> **Folge-Skill nach Freigabe:** `superpowers:writing-plans` → bite-sized Task-Plan, dann Build live auf localhost.

## Goal

Den Gutachter-Finder (Karte + Intake) aus der **Marketing-App** in die **Haupt-App** ziehen und als **eigenständigen, wiederverwendbaren Embed** bauen: `app.claimondo.de/embed/gutachter-finder`. Eine **3-Schritt-Strecke** (Schaden → Kontakt+Ort → Termin **inline** buchen über die Termin-Engine), **System-empfohlener** SV (Route/Zoom statt User-Fixer), schöneres **Google-bewertetes Profil über dem Pin**, **Beratung-CTA als Baileys-Anfrage**, **design-token-konform**. Per `<iframe>` einbettbar auf claimondo.de **und jeder anderen Seite**.

## Architektur (A2 — Embed aus der Haupt-App)

```
┌─ Marketing claimondo.de/gutachter-finden ─┐      ┌─ andere Seite / eigene Domain ─┐
│  SEO-Shell (H1, FAQ, Trust, BGH, CTA)     │      │  <iframe src=…/embed/gutachter-│
│  <iframe src="app.claimondo.de/embed/…"> ─┼──┐   │   finder>                      │
└────────────────────────────────────────── ┘  │   └────────────────────────────────┘
                                                 ▼
        app.claimondo.de/embed/gutachter-finder  (Haupt-App, standalone-Layout, KEINE Portal-Nav)
        ├─ Karte (Mapbox) + Pins + Profil-über-Pin (Google-Sterne)
        ├─ 3-Step-Wizard: Schaden → Kontakt+Ort → Slot-Picker
        └─ ruft SAME-ORIGIN Server-Actions:
             issueCanonicalFlowLinkForAnfrage(send:false) → token
             ladeMatchingFlow(token)   → System-SV + leak-sichere Slots (Engine)
             bucheTerminFlow(token,…)  → reserviert/bucht (Engine, bezug=lead)
```

**Kern-Einsicht:** Das Buchungs-Backend ist die **bewiesene /flow-Strecke** — wird 1:1 wiederverwendet. NEU ist v.a. die **UI** (Karte + 3-Step + Profil) + die **Migration** + das **iframe-Wrapping**. Kein neues Cross-Origin-API.

## Migration-Map (Marketing → Haupt-App)

| Heute (claimondo-marketing) | Neu (Haupt-App, `src/`) | Aktion |
|---|---|---|
| `app/[locale]/gutachter-finden/GutachterFinderMapClient.tsx` | `app/embed/gutachter-finder/_components/FinderMap.tsx` | **portieren** + Token-Klassen + Profil-über-Pin + Route/Zoom |
| `app/[locale]/gutachter-finden/GutachterFinderAnfrageWizard.tsx` | `app/embed/gutachter-finder/_components/FinderWizard.tsx` | **3-Step** + Inline-Booking (ersetzt 2-Knopf-POST) |
| `components/gutachter-finden/GutachterFindenSection.tsx` | `app/embed/gutachter-finder/page.tsx` + `layout.tsx` | Orchestrator → Embed-Route (standalone-Layout) |
| `lib/actions/gutachter-finder-actions.ts` (`ladeAktiveSVs`/`ladeSvLeads`/`geocode`) | `src/lib/gutachter-finder/laden.ts` (Server) | **portieren**, nutzt Engine/DB direkt |
| `components/onboarding/KartenWizardToggle.tsx` + `MiniWizardClient` (Schnell-Anfrage) | — | **entfernt** (#1) |
| `app/[locale]/gutachter-finden/page.tsx` (SEO) | bleibt in Marketing | Karten-Block → **`<iframe>`** |

**Marketing behält:** die SEO-Shell (`gutachter-finden/page.tsx`: H1/FAQ/Trust/BGH/CTA). Nur `<GutachterFindenSection variant="full">` wird durch ein responsives `<iframe>` ersetzt.

## Reuse-Inventar (existierende Funktionen — NICHT neu bauen)

**Termin-Engine** (`@/lib/termine/engine` + `@/lib/sv-matching-modul`, Leitfaden `engine/CONTRACT.md`):
- `planeTerminOeffentlich({lat,lng,wunschterminIso})` → leak-sichere SV-Liste + Slots (globales Matching, System wählt).
- `freieSlots(assignee, von, bis, opts)` (+`opts.zusaetzlicheBelegung` für Wizard-Soft-Holds), `findeBestePerson`, `reserviere`/`planeTermin('buchen')`, `findeTerminFuerLead`, `toOeffentlichesSvProfil` (Anti-Leak AAR-941).

**/flow-Actions** (`src/app/flow/[token]/self-service-actions.ts`) — same-origin in der Haupt-App direkt aufrufbar:
- `ladeMatchingFlow(token)` → `{ok, svs: OeffentlichesSvProfil[], ortFehlt?}` (Matching + Slots, Resolver-gated).
- `bucheTerminFlow(token, svId, startIso, endIso)` → bucht via Engine (bezug='lead', race-safe, Idempotenz).
- `speichereBesichtigungsortFlow(token, {adresse,lat,lng})` → Ort nachreichen (wenn ortFehlt).

**Lead/Token:** `issueCanonicalFlowLinkForAnfrage(anfrageId, {send:false})` (`src/lib/start-link/`) → gfa→Lead→flow_link, gibt `token` zurück OHNE Versand (User macht inline weiter).

**Daten:** `ladeAktiveSVs()` liest `sachverstaendige` + **`google_bewertungen_cache`** (= echte Google-Sterne, #11 ist DISPLAY, keine neue Integration) + Specs + Standort. `geocodeAdresse(ort)` (Mapbox). Mapbox **Directions API** (Token vorhanden) für die berechnete Route.

**Baileys:** Marketing hat `lib/whatsapp/baileys-client.ts`; Haupt-App-Pendant für die Beratung-WA (an Kunde + Team).

## Workstreams

### WS0 — Embed-Route-Skelett + iframe-Mechanik
- **Neu:** `src/app/embed/gutachter-finder/layout.tsx` (standalone, kein Portal-Chrome) + `page.tsx`.
- `frame-ancestors`-CSP auf der Route: erlaubt `claimondo.de`, `*.claimondo.de`, (später) Partner-Domains. `X-Frame-Options` NICHT `DENY` für diese Route.
- iframe-Höhe: Widget postet seine Höhe via `postMessage` → ein winziges Snippet/Loader auf der Host-Seite setzt `iframe.height` (kein 100dvh → Content drunter sichtbar, #6).
- **Akzeptanz:** Route lädt standalone unter localhost; Marketing-iframe zeigt sie, Content unter dem iframe bleibt sichtbar/scrollbar.

### WS1 — Karte portieren + Design-Tokens (#12)
- `FinderMap.tsx` aus `GutachterFinderMapClient` portieren; **alle** Inline-Hex/`COL_*` → Token (`claimondo-*`, `rounded-ios`, Typo-Skala), Buttons → `primitives.Button`.
- Mapbox-Marker-Paint darf raw color bleiben (3rd-Party, Token-Audit-Skip-Header).
- **Akzeptanz:** Karte rendert in der Haupt-App, token-konform, `check:token-audit` grün.

### WS2 — Profil über dem Pin + Google-Sterne (#4, #8, #10, #11)
- Profil-Karte öffnet **über** dem Pin (Popup `anchor:'bottom'`, schöneres Layout): Avatar/Initiale, „SV in \<Stadt\>", **Google-Sterne** (`google_bewertungen_cache`: Ø + Anzahl + Google-Branding), Top-Specs, „zertifiziert"-Badge. KEIN „Anfrage über Wizard"-CTA mehr (#3).
- token-basiert (Popup-HTML mit Token-Werten oder React-Popup).
- **Akzeptanz:** Pin-Klick → schönes Profil über dem Pin, kein Wizard-Trigger.

### WS3 — System-empfohlener SV: Route/Zoom, Klick = nur Ansehen (#3, #9)
- Karten-Klick setzt **keinen** Fixer mehr (`claimondo:select-sv`/`open-wizard`-Verdrahtung raus, `zugeordneter_sv_id` aus dem Embed-Pfad raus).
- Nach Step 2 (Ort da): `ladeMatchingFlow`/`planeTerminOeffentlich` liefert den **empfohlenen** SV → Karte zeigt ihn: **berechnete Route** (Mapbox Directions vom Ort zum SV-Standort) wenn Standort vorhanden, sonst **flyTo/Zoom auf den Pin** + Profil auf.
- **Akzeptanz:** kein User-Fixer; nach Ort-Eingabe wird der empfohlene SV als Route oder Zoom gezeigt.

### WS4 — 3-Step-Wizard + Inline-Booking (#1, #2) — der Kern

> **Echte Engine, endlich inline.** Das ist die **Live-Slot-Buchung über die echte Termin-Engine** — die der Marketing-Finder NIE konnte (cross-app + hätte den SV-Kalender öffentlich geleakt; daher lief er nur auf „Rückruf"/Redirect). Wir nehmen die **kanonischen /flow-Consumer** (`ladeMatchingFlow`/`bucheTerminFlow`) — sie orchestrieren Engine + Resolver + Leak-Schutz (`toOeffentlichesSvProfil`) + Idempotenz + bezug='lead' bereits und sind live bewiesen. **Nicht** die raw Engine-Primitives (`reserviere`/`freieSlots`) neu verdrahten — das würde /flow re-derivieren + latente Bugs aktivieren; `CONTRACT.md` verbietet Hand-Rolling. „Echte Engine" = der **richtige Consumer-Layer** der Engine, nicht roher Tabellenzugriff.

- Step 1 Schaden → Step 2 Kontakt+Ort → **Step 3 Slot-Picker** (neu, inline).
- Step-2-Submit: `issueCanonicalFlowLinkForAnfrage(send:false)` → token. (Anfrage = die gfa, wie heute; nur kein Versand.)
- Step 3: `ladeMatchingFlow(token)` → SV + Slots rendern (leak-sicher) → User wählt Slot → `bucheTerminFlow(token, svId, start, end)` → Bestätigung inline. `ortFehlt` → `speichereBesichtigungsortFlow` + retry.
- Soft-Hold während offenem Wizard via `opts.zusaetzlicheBelegung` (Engine-Hinweis #2).
- **Akzeptanz:** voller Durchlauf bis gebuchter Termin **inline**; `findeTerminFuerLead` findet den Termin (bezug-nativ); leak-frei; Smoke wie /flow.

### WS5 — „Beratung vereinbaren" → Baileys-Anfrage (#7)
- CTA oben rechts → schlankes Anfrage-Form (Name+Tel) → legt Anfrage an + sendet **Baileys-WA** an **Kunde** (hinterlegte Nachricht) + **Team**.
- **Offen:** Quelle/Template der „hinterlegten Nachricht" + Team-WA-Nummer (definieren).
- **Akzeptanz:** CTA sendet Anfrage + beide WA-Nachrichten gehen raus (Sandbox-Test).

### WS6 — Marketing-iframe-Swap (#5, #6)
- `gutachter-finden/page.tsx`: `<GutachterFindenSection variant="full" height="100dvh">` → `<iframe>` mit begrenzter Höhe + Loader-Snippet (postMessage-Höhe). SEO-Content drunter bleibt.
- **Akzeptanz:** Marketing-Seite zeigt den Embed, Content drunter sichtbar; „mehr embed"-Look.

## Offene Entscheidungen (vor/während Build klären)

1. **Baileys-Nachricht (WS5):** Wo ist die „hinterlegte Nachricht" + Team-WA-Nummer konfiguriert? (Template-Konstante? embed_sites? ENV?)
2. **i18n:** Hat die Haupt-App next-intl für eine öffentliche Embed-Route, oder Embed = Deutsch-only (Marketing ist ×6, der Embed evtl. nur DE — Cluster sind eh DE)? → Vorschlag: Embed **DE-only** (Strings inline mit Umlauten), spart die i18n-Migration.
3. **embed_sites nötig?** Der Finder ist eine **Claimondo-Fläche** (kein per-SV-Embed) → Vorschlag: **fixe Route ohne embed_sites** (kein Token/Config-Fetch). embed_sites bleibt Monikas Revier.
4. **frame-ancestors-Liste:** initial `claimondo.de` + `*.claimondo.de`; Partner-Domains später per Allowlist.

## Koordination

Session `69a05883` (`kitta/aar-939-monika-embed`) besitzt `public/embed/*`, `/api/embed/*`, `embed_sites`. Der **iframe-Weg meidet diese** (neue Route + Marketing-iframe). Geteilt nur: `anfrage-from-lp` (gehört aar-956, #2693) + die Engine (read-only via CONTRACT). **Bevor** ich `public/embed/` / `embed_sites` anfasse → über Aaron abstimmen.

## Build-Reihenfolge (live auf localhost, Smoke je Schritt)

WS0 (Skelett+iframe) → WS1+WS2 (Karte+Profil, sofort sichtbar) → **WS4 (Booking, der harte Teil)** → WS3 (Route/Zoom) → WS5 (Baileys) → WS6 (Marketing-Swap). Jeder Schritt: Screenshot + (WS4) Slot-buchen-Smoke wie /flow.

## Was wird aus PR #2701 (P5-Marketing-2-Knopf)?

Der dortige Marketing-Wizard (2-Knopf, POST an anfrage-from-lp) wird durch den **iframe-Embed ersetzt** → #2701 ist damit **überholt**. Optionen: schließen ODER nur den `/start`-Retire-Teil behalten. Entscheidung mit Aaron beim Build-Start. Die Backend-Foundation (#2693, schon auf staging) bleibt nützlich (anfrage-from-lp/Versand-State).
