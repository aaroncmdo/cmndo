# Gutachter-Finden Smoke-Fixes (Schnell-Fix-PR)

**Datum:** 2026-05-12
**Status:** ✅ DONE (2026-05-12) — Schnell-Fix-PR auf Branch `kitta/aar-fix-gutachter-finden-smoke`. DB-Migration `20260512085548_fix_gutachter_finden_umlaute.sql` schon auf Production angewendet + in schema_migrations registriert. Code-Changes auf Branch, PR offen. Map-Display-Bug-Diagnostik (`console.error` bei Init-Fail) für nächsten Smoke eingebaut.
**Auslöser:** Aaron-Smoke nach PR #807 (Color-Fix) + PR #806 (Logout) auf staging. Karte sichtbar, aber Brand-Issues + Standort-Erfassung fehlt + Wrapper-Design-Wunsch.

---

## Befunde

### 1. Umlaute fehlen überall — Verstoß gegen AGENTS.md
Sowohl im Component-Code als auch in den DB-Phasen-Texten steht ASCII-Ersatz (`Sachverstaendige`, `Naehe`, `fuer`, `unterstuetzen`, `Strasse`, `koennen`, `verfuegbar`, `Koeln` etc.) statt echter Umlaute (`Sachverständige`, `Nähe`, `für`, `unterstützen`, `Straße`, `können`, `verfügbar`, `Köln`).

**Code-Stellen** (`src/app/gutachter-finden/GutachterFinderMapClient.tsx`):
- `:34` Comment "fuer die Sidebar"
- `:95` Comment "fuer Tier-1"
- `:256` Comment "sichtbar fuer Crawler"
- `:269-270` Header-Badge: `Sachverstaendige`, `verfuegbar`
- `:286` Eyebrow `Schritt fuer Schritt`
- `:292` H1 `Kfz-Gutachter in Ihrer Naehe finden`
- `:295` Subtitle `passenden Sachverstaendigen`
- `:317` Bottom-Sheet-Trigger `Gutachter waehlen`
- `:333` Comment

**DB-Stellen** (`onboarding_phasen` + `onboarding_felder` mit `flow_key='gutachter-finden'`):
- `standort.beschreibung`: `Sachverstaendigen` → `Sachverständigen`
- `termin.beschreibung`: `Verfuegbare Termine` → `Verfügbare Termine`
- `service.titel`: `Wie sollen wir Sie unterstuetzen?` → `Wie sollen wir Sie unterstützen?`
- `kanzlei.titel`: `Welche Kanzlei soll uebernehmen?` → `Welche Kanzlei soll übernehmen?`
- `kontakt.beschreibung`: `bestaetigen koennen` → `bestätigen können`
- `besichtigungsort.label`: `Strasse, PLZ, Ort` → `Straße, PLZ, Ort`
- `besichtigungsort.placeholder`: `Musterstrasse 12, 50667 Koeln` → `Musterstraße 12, 50667 Köln`
- `service_typ.hint`: `kostenlos fuer Sie` → `kostenlos für Sie`

### 2. "In Ihrer Nähe"-H1 lügt ohne Standort
H1 sagt "Kfz-Gutachter in Ihrer Nähe finden", aber `navigator.geolocation` wird erst beim Wizard-Step 2 (Slot-Phase, WizardClient.tsx:117) getriggert. Beim Page-Load weiß die Map nichts vom User-Standort und zeigt NRW-Mittelpunkt (DEFAULT_CENTER `[7.0, 51.0]`).

Konsequenz: Header-Badge `${svLeads.length} Sachverstaendige in Echtzeit verfuegbar` ist generisch und nicht standortbezogen. Aaron erwartet "in deiner Nähe" — diese Behauptung dürfen wir nur machen wenn wir den Standort kennen.

### 3. Mapbox-Display-Problem (Aaron-Bericht: "Mapbox wird mir nicht angezeigt")
Aaron's Screenshot zeigt nur den Wizard-Block (Step-Indicator + "Wo steht das Fahrzeug?" Card), keine Karte sichtbar. Der Wizard ist im mobile bottom-sheet, aber der Sheet startet GESCHLOSSEN (Zeile 305-307: `translateY(calc(100% - 88px))`).

**Hypothesen:**
- Mobile-Layout rendert das Sheet ausgeklappt → Map vollständig verdeckt
- `ensureMapboxInitialized()` failt silent (z.B. Token-Issue)
- Container-Höhe-Bug bei `100dvh` auf Mobile mit address-bar

**Mitigation jetzt:**
- Console-Log in `ensureMapboxInitialized` falls Init schiefläuft (für nächsten Smoke sichtbar)
- Mobile-Sheet startet definitiv geschlossen + sichtbarer "Karte zeigen"-Hinweis
- Card-Stack im Mobile-Sheet ggf. höhe-begrenzt

### 4. Wrapper-Design (Aaron-Vision: freischwebend, glassy, weniger Wrapper)
**OUT OF SCOPE** für diesen Schnell-Fix-PR. Eigene Design-Iteration in Folge-PR mit Brainstorming-Spec. Aaron's Screenshot zeigt: 2 ineinander verschachtelte Cards mit white-bg, wenig Backdrop-Effekt. Vision = die Cards direkt frei über der Map mit `backdrop-blur` + glassy weniger Schatten/Border.

---

## Fix-Plan

### A) DB-Migration: Umlaute in `onboarding_phasen` + `onboarding_felder`
Neue Migration `update_gutachter_finden_umlaute.sql`, UPDATE-Statements für alle ASCII-Ersatz-Texte im flow_key='gutachter-finden'.

### B) Code-Fixes in `GutachterFinderMapClient.tsx`
- Alle Kommentar- und String-Umlaute restaurieren
- `useEffect` ergänzen: `navigator.geolocation.getCurrentPosition` beim Page-Load → bei Success die Map auf User-Standort flyTo'en, Header-Badge auf "In Ihrer Nähe" wechseln (sonst generisch)
- Header-Badge bedingt: `userLocation ? "{n} Sachverständige in Ihrer Nähe" : "{n} Sachverständige bundesweit verfügbar"`
- Mobile-Sheet: Trigger-Label `Karte zeigen` wenn open, sonst `Anfrage starten` — damit User Map sehen kann

### C) Map-Display-Verifikation
- `console.log` in `ensureMapboxInitialized`-Fail-Pfad damit Folge-Smoke die Ursache zeigt
- Höhe testen: `100dvh` → `100svh` als Fallback für iOS-Address-Bar (Mobile)

### D) Auch in `WaitlistApply.tsx` (gutachter-partner) prüfen
Bei vergleichbarem Smoke-Path schauen ob dort die gleichen Umlaut-Issues bestehen.

---

## Out of Scope (Folge-PR)

- **Freischwebend-Design-Refactor**: Cards aus dem Sidebar/Sheet rauslösen, frei über Map positionieren, mehr `backdrop-blur` weniger Border. Eigenes Brainstorming nötig.
- **`besichtigungsort_*`-Felder als Place-Autocomplete** statt freier Text (höhere Conversion).
- **Pre-fill Bezirk/PLZ aus Geolocation** in der Adress-Eingabe.

---

## Test-Plan nach Merge auf staging

1. `https://app.staging.claimondo.de/gutachter-finden` lädt
2. Geolocation-Permission-Prompt erscheint beim Page-Load
3. Bei Allow: Map zoomt zum User-Standort, Badge sagt "X SVs in Ihrer Nähe"
4. Bei Deny: Map bleibt auf NRW-Mittelpunkt, Badge sagt "X SVs bundesweit"
5. Alle Wizard-Texte mit echten Umlauten
6. Mobile-Sheet startet geschlossen, Karte ist hinter Sheet sichtbar

---

## Verwandte Docs
- `docs/12.05.2026/staging-slot-plan.md` — Infra-Setup
- `docs/superpowers/specs/2026-05-12-zb1-ocr-field-design.md` — ZB1-Spec
