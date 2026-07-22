# T5 — FM-Schadenmeldung-Fortsetzung → Gutachter-Finder → kanonischer FlowLink

Teil des operativen Schaden-Flows (Thread `kitta/operativer-schaden-flow`, PR #4667). T1–T4 gebaut,
T5 ist der design-lastige Rest. Aaron-Entscheidungen (22.07., per AskUserQuestion) unten verankert.

## Aaron-Entscheidungen (verbindlich)

1. **SV-Wahl-Weg = „Finder → bestehender Lead".** Der FM wählt einen Gutachter über den
   bestehenden SV-Pick-Mechanismus; die Wahl hängt sich per **gfa-Back-Reference** an den
   BESTEHENDEN Lead (`konvertiert_zu_lead_id = claim.lead_id`, `zugeordneter_sv_id = svId`),
   dann `ensureCanonicalFlowLinkForLead(claim.lead_id)` → `/flow/[token]`. **Kein Doppel-Lead,
   kein /flow-Umbau.**
2. **Beide Einstiegspunkte jetzt bauen (3a + 3b).**

## Discovered constraints (diese Session verifiziert)

- **`claims.lead_id` existiert** → der Schadenkarte-Claim trägt seinen Ursprungs-Lead. `flow_links`
  sind lead-gekeyt → `ensureCanonicalFlowLinkForLead(claim.lead_id)` ist die Brücke (idempotent).
- **`/flow/[token]` liest den SV** in zwei Stufen (`src/app/flow/[token]/page.tsx`):
  1. `v_claim_full.sv_id` via `lead_id` (Z. 128–135) — beim frischen Schadenkarte-Claim NULL.
  2. Fallback: `gutachter_finder_anfragen.zugeordneter_sv_id` WHERE `konvertiert_zu_lead_id = leadId`
     (Z. 262–269). **→ genau hier greift die gfa-Back-Reference.**
- **⚠ BLOCKER — keine Location:** `submitSchadenGegner` schreibt KEINE `fahrzeug_standort_lat/lng`
  / `schadenort` auf den Lead. Der Matching-Motor (`planeTerminMitFallback({lat,lng})`,
  `sv-matching-modul`) braucht aber `lat/lng`. → Der FM-Finder MUSS eine Location auflösen.
  **Default-Vorschlag:** Firma-Adresse (`firmen.adresse_strasse/plz/ort`) geocoden als
  Vorbelegung (Flotten-Auto steht oft am Depot); FM kann im Finder/`/flow` anpassen. Alternativ
  ein Ort-Input-Step (wie der Embed-`StandortStep`).
- **SV-Pick-Mechanismus = Embed-Finder** (`src/app/embed/gutachter-finder/actions.ts`):
  `planeTerminMitFallback` (Ranking) + `erstelleGutachterFinderAnfrage` (schreibt gfa inkl.
  `zugeordneter_sv_id`). Für T5 NICHT den ganzen Embed-Wizard wiederverwenden (er legt Lead+Termin
  inline an) — nur den Matching- + gfa-Mechanismus.
- **Einstiegspunkt-Ist-Zustand:**
  - 3a: `FlottenmanagerKartePanel.tsx` manage-branch — Button „Schaden melden" → `?melden=1`
    (startet HEUTE den Gegner-Wizard). T5-3a = zusätzlicher Continuation-Pfad „Gutachter finden"
    für einen bereits bestehenden `ersterfassung`-Claim des Fahrzeugs.
  - 3b: `FahrzeugMiniAktionen.tsx` — „Schaden melden"-Button ist ein **disabled Stub** → aktivieren.

## Bauplan (Reihenfolge, je eigener Commit, TDD wo sinnvoll)

### T5.1 — Core-Plumbing (crux, testbar)
Neue Lib `src/lib/flotte/schaden-fortsetzung.ts`:
- `ladeGutachterKandidatenFuerClaim(claimId)`: claim → `lead_id` + Firma → Location auflösen
  (Firma-Adresse geocoden, Reuse Geocoder aus `lib/geo/*`) → `planeTerminMitFallback` →
  Public-SV-Liste (`toOeffentlichesSvProfil`-Projektion, kein PII/Score-Leak).
- `waehleGutachterUndStarteFlow(claimId, svId, { haftungstyp })`:
  1. Guard: eingeloggter FM, dessen Firma das Fahrzeug/den Claim besitzt.
  2. gfa-Back-Ref anlegen/aktualisieren (`erstelleGutachterFinderAnfrage`-Muster via Admin):
     `konvertiert_zu_lead_id = claim.lead_id`, `konvertiert_am`, `zugeordneter_sv_id = svId`,
     `matching_typ='partner'`, minimale Pflichtfelder aus Lead (vorname/nachname/telefon/email
     vom Gegner-Lead), `schadenort_lat/lng` = aufgelöste Location.
  3. `ensureCanonicalFlowLinkForLead(claim.lead_id)` → token.
  4. Result `{ ok, token }`. Result-Object-Pattern, revalidate der Fahrzeug-/Portal-Route.
- Unit-Test: gfa-Back-Ref schreibt korrekte Felder; flowlink-Reuse; Guard.

### T5.2 — Picker-UI (Flotten-Shell)
Route `src/app/flotte/(shell)/schaden/[claimId]/gutachter/page.tsx` + Client:
- Lädt Kandidaten; zeigt SV-Liste (Reuse `shared/*`-SV-Card-Muster, KEIN handgerolltes Markup —
  Komponenten-Set-Policy). Pick → `waehleGutachterUndStarteFlow` → `router.push('/flow/'+token)`.
- Location-Anzeige + optional editierbar (Default = Firma-Adresse).

### T5.3 — Entry 3a (Karten-manage-branch, Haftpflicht klar)
`FlottenmanagerKartePanel.tsx` manage-branch: wenn das gebundene Fahrzeug einen `ersterfassung`-
Claim hat → Button „Gutachter finden / Schaden fortsetzen" → Picker (`haftungstyp='haftpflicht'`).
Der bestehende „Schaden melden"→`?melden=1`-Pfad (Gegner-Wizard, neue Meldung) bleibt.

### T5.4 — Entry 3b (Fahrzeug-Kachel, Typ-Abfrage)
`FahrzeugMiniAktionen.tsx`: „Schaden melden"-Stub aktivieren → kleiner Dialog **Haftpflicht vs.
selbstverschuldet** → Picker mit `haftungstyp`. (service_typ/schadentyp entsprechend im FlowLink.)
Braucht claimId-Kontext → die Kachel bekommt den aktuellen `ersterfassung`-Claim des Fahrzeugs
(oder legt bei „neu" erst einen an — Sub-Entscheidung, s. u.).

### #2 Querschnitt — ascii/i18n
Neue UI-Strings korrekte Umlaute; Flotten-Portal ist hardcoded-Deutsch (kein next-intl) → konsistent.

## Offene Sub-Entscheidungen (vor/während Bau klären)
- **Location-Quelle:** Firma-Adresse-Geocode (Default, kein Extra-Step) vs. Ort-Input-Step. → Vorschlag: Firma-Adresse, im `/flow` anpassbar.
- **3b ohne bestehenden Claim:** Wenn das Fahrzeug NOCH keinen `ersterfassung`-Claim hat — legt die
  Kachel einen an (leerer FM-gemeldeter Claim) oder ist die Kachel nur bei existierendem Claim aktiv?
  → Vorschlag: nur aktiv bei existierendem `ersterfassung`-Claim (sonst führt „Schaden melden" über
  den Gegner-/Karten-Weg).
- **selbstverschuldet-Semantik:** eigener `service_typ`/`schadentyp` im FlowLink (Kasko-Strecke) —
  mit der Kasko-Flow-Config abgleichen.

## Gates & Abschluss
Je Commit: `tsc --noEmit` + (bei Route/Action) `npm run build` + Ratchets (component-set/token-audit/
knip) + vitest. PR = #4667 (Thread-Branch). **Regel-4-Prod-Smoke** nach Deploy: FM tappt Karte →
„Gutachter finden" → Picker → /flow; Fahrzeug-Kachel → Typ → Picker → /flow. Test-Konten.
