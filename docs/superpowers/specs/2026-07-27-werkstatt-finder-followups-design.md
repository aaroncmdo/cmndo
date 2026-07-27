# Werkstatt-Finder Follow-ups: Umkreis-Ranking, Markenoffen-Toggle, Datenqualitaet

**Datum:** 2026-07-27 · **Autor:** Claude (Session 614ebbaf) · **Entscheider:** Aaron
**Kontext:** Follow-ups aus dem Embed-Sichtbarkeits-Befund 27.07. (PR #4787, Memory
`coordination-werkstatt-anlage-frei-flag-gewerke`).

## Datenbasis (prod, 27.07.2026, 20 aktive Werkstaetten)

- **verifiziert:** 2/20 — davon 1 intern (BHV-Test). Die einzige echte verifizierte Werkstatt
  (Auto Hilbert, Remscheid) rankt heute **bundesweit ueberall auf Platz 1**, weil `verifiziert`
  vor Distanz sortiert (Anon-Smoke 27.07.: 280 km, Rang 1 in Bremerhaven).
- **marken gepflegt:** 0/20 — die staerkste Ranking-Achse (Spec B) ist komplett datenlos.
- **ohne Gewerke:** 3/20 · **ohne Geo:** 0/20 (aber jeder Self-Signup mit Geocode-Fail
  wuerde kuenftig dauerhaft ohne Koordinaten bleiben).

## Entscheidungen (Aaron, 27.07.)

1. **D1 — „Es koennen nur Werkstaetten in der Naehe gezeigt werden; Distanz muss immer
   schlagen."** Naehe ist Anzeige-Voraussetzung (harter Umkreis-Filter), Distanz ist primaeres
   Sortierkriterium — vor `verifiziert` und auch vor Marke/Gewerke-Rang. Revidiert bewusst die
   Spec-B-Regel „BMW markengebunden schlaegt freie Werkstatt" (bei 0 gepflegten Marken aktuell
   folgenlos).
2. **D2 — Markenoffen-Toggle:** `ist_freie_werkstatt` wird an den beiden bestehenden
   Marken-Pflege-Stellen editierbar („Nimmt alle Marken an").
3. **D3 — Admin-Badge + Geo-Selbstheilung:** Unvollstaendige Profile (ohne Standort / ohne
   Gewerke) werden im Admin sichtbar; Adress-Writes re-geocodieren best-effort.
4. **D4 — Marken-Rang nur mit Verifizierungs-Gate:** „Markengebunden fuer die gesuchte Marke
   schlaegt markenoffen" bleibt (erster Tiebreaker nach Distanz) — aber der Vertragswerkstatt-
   Rang gilt NUR fuer verifizierte Werkstaetten. Wer viele Marken angibt, darf dadurch nicht
   besser ranken: unverifizierte Marken-Treffer werden im Ranking wie markenoffen behandelt.
   (Alternative „Marken-Cap N=4" bewusst verworfen — das Gate ist die haertere Bremse und gibt
   der Verifizierung eine neue operative Rolle, nachdem D1 ihr Ranking-Gewicht genommen hat.)

## §1 Matching-Engine: Umkreis-Filter + Distanz-primaeres Ranking

Betrifft `src/lib/werkstatt/matching/rank-vorschlaege.ts` (pure) und `lade-vorschlaege.ts`
(Loader). Konsumenten der Engine: Embed-Werkstatt-Finder, /flow-WerkstattStep,
werkstatt-empfehlung/[token], Kunde-Fallakte, Gutachter-WerkstattEmpfehlenCard, Dispatch-Panel.

### Umkreis-Filter (neu)

- Konstante `MAX_UMKREIS_KM = 50` in `rank-vorschlaege.ts` (exportiert). Der Wert ist ein
  bewusster Kompromiss aus Hol-/Bring-Realitaet und duennem Netz; Aaron kann ihn im Review
  aendern, ohne das Design zu beruehren.
- `MatchingKontext` bekommt `maxUmkreisKm: number | null`. Loader-Input
  `ladeWerkstattVorschlaege({ …, maxUmkreisKm? })` — **Default 50** (sichere Semantik ist der
  Default), `null` = ungecappt.
- Filter-Semantik in `rankeWerkstattVorschlaege` (VOR Eignungs-Filter und VOR dem
  „lieber-als-leer"-Fallback, damit auch der Fallback nie ueber den Umkreis hinausgeht):
  - Greift nur, wenn `kontext.anker != null` UND `maxUmkreisKm != null`.
  - Kandidaten ohne `lat/lng` fliegen dann mit raus (Naehe nicht belegbar; Heilung siehe §3).
  - Ohne Anker (z. B. Lead ohne Geo) bleibt das heutige Verhalten (keine Distanzfilterung) —
    sonst waere jede Liste leer.
- **Leere Liste ist damit ein legitimes Ergebnis.** Der bisherige Fern-Fallback entfaellt
  faktisch ausserhalb des Umkreises.

### Sortierung (`vergleiche`)

Neu: **Distanz primaer, gerundet auf ganze km** (`Math.round(distanz_km)`); innerhalb gleicher
gerundeter Kilometer entscheidet die bisherige Kaskade als Tiebreaker
(Marke → Gewerke-Fit → Fahrzeug-Gruppe → verifiziert → exakte Distanz). Die Rundung haelt die
Tiebreaker real wirksam (exakter float-Vergleich wuerde sie entwerten), bleibt aber erklaerbar.
Beispiel-Konsequenz (D1-konform): freie Werkstatt 6 km schlaegt BMW-Vertragswerkstatt 18 km;
bei gleicher km-Klasse gewinnt die Vertragswerkstatt.

### Marken-Rang: Verifizierungs-Gate (D4)

`bewerteMarke` befoerdert zu `'marke'` nur noch, wenn **Treffer UND `verifiziert === true`**:

- verifiziert + gesuchte Marke gepflegt → `'marke'` (Chip „{Marke}-Vertragswerkstatt").
- **unverifiziert + gesuchte Marke gepflegt → `'frei'`-Rang** (Bindung behauptet, nicht
  geprueft — im Ranking gleichgestellt mit markenoffen, NICHT schlechter: `'unbekannt'` waere
  eine Strafe fuer ehrliche Pflege). Chip-Wahrheit: In diesem Fall KEIN „Vertragswerkstatt"-
  und KEIN „Freie Werkstatt (alle Marken)"-Chip, sondern neutral „Repariert {Marke}" —
  der Frei-Chip bleibt echten Frei-Faellen vorbehalten (Flag true oder keine Marken). Dafuer
  liefert `bewerte`/`baueGruende` zusaetzlich den rohen Treffer (`markenTreffer: boolean`)
  neben `markenMatch`.
- Marken gepflegt, gesuchte NICHT dabei → unveraendert `'unbekannt'` (Spezialist-Guard #4649),
  unabhaengig von Verifizierung; Flag true ueberschreibt weiter zu `'frei'`.
- **Operative Konsequenz:** Der Marken-Bonus ist inaktiv, bis Werkstaetten verifiziert werden —
  Verifizierung beglaubigt kuenftig ausdruecklich auch die Markenbindung (Hinweis im
  Admin-Verifizieren-Flow, siehe §3).
Harte **Eignungs-Ausschluesse bleiben unveraendert**: falsche Fahrzeug-Gruppe raus; nicht
passende Gewerke raus ab `bedarfConfidence >= HART_SCHWELLE`. Kurzformel: *Filter = Eignung +
Umkreis, Reihenfolge = Naehe.* Chips/`gruende` bleiben unveraendert (inkl. „Verifizierter
Partner" als Badge — Verifizierung verliert Ranking-Gewicht, nicht Sichtbarkeit).

### Caller-Matrix

- **Kunden-Surfaces** (Embed `sucheEchteWerkstaetten`/`sucheWerkstaettenNachOrt`, /flow,
  werkstatt-empfehlung, Kunde-Fallakte, Gutachter-Empfehlung): Default 50 km — kein
  Call-Site-Change noetig.
- **Interne Tools** (Dispatch-WerkstattVermittlungsPanel u. ae.): explizit
  `maxUmkreisKm: null` — Dispatcher duerfen weiterhin alles sehen und bewusst fern vermitteln.
  Der Implementierungsplan enthaelt den vollstaendigen Caller-Sweep
  (`grep ladeWerkstattVorschlaege|findWerkstattVorschlaegeFuer`).

### Leer-Zustand (Embed-Wizard)

Heute verschwindet die Ergebnisliste bei 0 Treffern stumm (`loading || rows.length > 0`).
Neu: Ist ein Standort gesetzt, nicht am Laden und `rows.length === 0`, zeigt der Wizard eine
Hinweiskarte: „Noch keine Partner-Werkstatt in Ihrer Naehe — senden Sie Ihre Anfrage trotzdem
ab, wir kuemmern uns um Gutachten und Abwicklung." Der Funnel traegt ohne Werkstatt-Wahl
(Lead + FlowLink, Supply-Gate „ohne Werkstatt"). Gleicher Text-Check fuer die
EmptyState-Nutzung der werkstatt-empfehlung-Seite.

## §2 Markenoffen-Toggle (`ist_freie_werkstatt` pflegbar)

- **Actions** (Muster `setWerkstattMarken`/`setMeineMarken`):
  - `setWerkstattMarkenoffen(werkstattId, markenoffen: boolean)` in
    `src/app/admin/werkstaetten/actions.ts` (requireAdmin, revalidatePath).
  - `setMeineMarkenoffen(markenoffen: boolean)` in `src/lib/actions/werkstatt-settings.ts`
    (user-scoped via `eq('user_id', user.id)`).
- **UI:** Toggle „Nimmt alle Marken an (markenoffen)" im Admin-`MarkenGruppenEditor` und in der
  Portal-„Meine Marken"-Card, mit Hinweis: „Auch mit gepflegten Marken koennen Sie markenoffen
  bleiben — reine Spezialisten schalten das aus." Zusatzhinweis in beiden UIs (D4): „Der
  Vertragswerkstatt-Rang fuer gepflegte Marken gilt erst nach Verifizierung durch Claimondo." Anzeige des aktuellen Zustands inkl.
  Ableitungs-Hinweis, wenn `ist_freie_werkstatt` NULL und keine Marken gepflegt sind
  („markenoffen (abgeleitet)").
- **Ranking-Logik unveraendert:** `bewerteMarke` behaelt `flag === true || keine Marken →
  'frei'`. Der Toggle macht nur den Override pflegbar; mit D1 wirkt markenMatch ohnehin nur
  noch als Tiebreaker + Chip.

## §3 Datenqualitaet: Admin-Badges + Geo-Selbstheilung

- **Admin-Werkstattliste:** Warn-Badges je Zeile — „Ohne Standort" (`lat`/`lng` NULL, mit D1 =
  im Kunden-Finder unsichtbar) und „Ohne Gewerke" (`faehigkeiten` leer). Reine Anzeige aus der
  bestehenden Listen-Query, kein neuer Flow.
- **Geo-Selbstheilung:** Jeder Adress-Write auf `werkstaetten` (Werkstatt-Portal-Stammdaten und
  Admin-Detail) re-geocodiert best-effort (`geocodeAdresse`), wenn sich die Adresse aendert
  ODER `lat/lng` fehlen. Fehler bleiben non-fatal (wie im Signup). Der Implementierungsplan
  inventarisiert die konkreten Save-Stellen.
- **Verifizieren-Flow (D4-Hinweis):** Im Admin-Verifizieren-Dialog/-Button ein Satz: „Mit der
  Verifizierung beglaubigen Sie auch die gepflegten Marken (Vertragswerkstatt-Rang im Finder)."
  Die gepflegten Marken werden dort angezeigt.

## §4 Paket-Schnitt, Tests, Rollout

- **PR 1 (dringend, kundenwirksam):** §1 komplett. TDD auf
  `rank-vorschlaege.test.ts`: fern (>50 km) unsichtbar trotz verifiziert; ohne Geo unsichtbar
  bei Anker; ohne Anker ungefiltert; 2-km-unverifiziert vor 4-km-verifiziert; Tiebreak
  innerhalb gleicher km (verifiziert gewinnt); Fallback bleibt im Umkreis. D4-Tests:
  verifizierter Marken-Treffer → 'marke'; unverifizierter Treffer → 'frei'-Rang + Chip
  „Repariert {Marke}" (kein Vertrags-, kein Frei-Chip); Spezialist-Guard ('unbekannt')
  unveraendert. Plus Wizard-Leer-Zustand-Test.
- **PR 2:** §2 + §3 (Toggle, Badges, Selbstheilung) mit Action-Tests.
- **Regel-4 (prod, anon):** `.invalid`-Wegwerf-Rezept aus Memory
  `coordination-werkstatt-anlage-frei-flag-gewerke` — eine nahe + eine ferne Werkstatt seeden:
  nah erscheint, fern (verifiziert) erscheint NICHT mehr; Leer-Zustand-Text bei Anker ohne
  Umkreis-Treffer.
- **Rollout-Hinweis:** Wirkt auf prod erst mit staging→main-Deploy; kein DB-Change in beiden
  Paketen.

## Nicht-Ziele

Score-/Decay-Modell, Fahrzeit/Isochrone statt Luftlinie, Marken-Abfrage im Self-Signup,
konfigurierbarer Radius pro Embed-Site, Aenderungen am Dispatch-Sichtfeld.

## Offene Parameter (Review)

- `MAX_UMKREIS_KM = 50` — Zahl frei waehlbar, Design unabhaengig davon.
- km-Rundung fuer Tiebreak = 1 km.
