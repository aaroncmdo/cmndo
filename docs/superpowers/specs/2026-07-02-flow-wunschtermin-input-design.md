# Flow-Wunschtermin-Input — Design

**Datum:** 2026-07-02
**Branch:** `kitta/flow-wunschtermin` (off staging)
**Kontext:** AAR-956 kanonischer Self-Service-FlowLink (`/flow/[token]`), Slot-Step

## Problem

Ein Kunde, der über `/schaden-melden` (Mini-Wizard) kommt, erzeugt eine Anfrage **ohne**
Gutachter, ohne Termin, ohne Besichtigungsort. Im kanonischen FlowLink greift die
Gutachter-Suche zwar (`needsBooking` → `FlowSlotStep` → `ort_abfragen` → Matching), und der
Kunde kann einen **Besichtigungsort** wählen — **aber keinen Wunschtermin angeben.**

Die Matching-Engine unterstützt einen Wunschtermin bereits: `ladeMatchingFlow`
(`self-service-actions.ts:251`) liest `lead.wunschtermin` und reicht ihn als `wunschterminIso`
an `matchAndSlots` / `planeTerminOeffentlich` — die Slots werden danach gerankt. Nur der
**kunden-facing Input** im `/flow` fehlt. Für schaden-melden-Leads ist `lead.wunschtermin`
immer `null` (der Mini-Wizard erfasst ihn nicht), also läuft das Matching ohne Ranking-Präferenz.

**Prod-Beleg:** von 208 mini_wizard-Leads haben nur 2 je einen Gutachter-Termin; 199/208 haben
gar keine Ortsdaten — die Strecke wird für diese Lead-Klasse faktisch nicht sauber genutzt.

## Ziel

Dem Kunden im FlowLink erlauben, **optional** einen Wunschtermin anzugeben, sodass die
**bestehende** Matching-Funktion aufgrund der eingegebenen Datenbasis (Besichtigungsort +
Wunschtermin) den passenden Gutachter/Slot findet. Vollständig DB-getrieben, keine Engine-Änderung.

## Ansatz (gewählt)

**Wunschtermin-Input im `ort_abfragen`-Schritt des `FlowSlotStep`** — dort, wo der Kunde heute
schon den Besichtigungsort wählt. Das spiegelt das bewährte Embed-Finder-Pattern (dort steht der
Wunschtermin in der `ort`-Phase, oberhalb der Ortsfrage, vor den Slots) und trifft exakt die
Stelle, an der der Kunde den fehlenden Input erwartet hat.

**Datenfluss (DB-getrieben):**

1. `FlowSlotStep` (`ort_abfragen`-Schritt) rendert oben `WunschterminPicker` (optional) über der
   Besichtigungsort-Eingabe. State `wunschterminLokal` (Berlin-Wall-Clock `"YYYY-MM-DDTHH:MM"` oder `""`).
2. Beim Bestätigen des Orts (Vorschlag-Button **oder** `GooglePlaceAutocomplete`-Auswahl) wird der
   aktuelle `wunschterminLokal` **mit** dem Ort an `speichereBesichtigungsortFlow` gereicht.
3. `speichereBesichtigungsortFlow` persistiert `lead.besichtigungsort_*` **und** (falls gesetzt)
   `lead.wunschtermin = berlinWallClockToUtc(wunschterminLokal)` (Berlin → UTC-ISO).
4. `runMatch()` ruft `ladeMatchingFlow` (unverändert) → liest `lead.wunschtermin` → Slots gerankt.
5. Der Kunde wählt am Ende einen **echten** buchbaren Slot (unverändert). Der Wunschtermin ist reine
   Ranking-Präferenz, nicht die gebuchte Zeit.

**Optionale Semantik:** `wunschterminLokal === ""` → kein `wunschtermin`-Update → Matching läuft in
normaler Slot-Reihenfolge. Blockiert nie.

## Betroffene Files (rein additiv)

| File | Änderung |
|---|---|
| `src/app/flow/[token]/FlowSlotStep.tsx` | `wunschterminLokal`-State + `WunschterminPicker` im `ort_abfragen`-Schritt; `wunschterminLokal` durch `speichereOrtUndMatch` → `speichereBesichtigungsortFlow` reichen; optional read-only Anzeige „Ihr Wunschtermin: …" (`formatBerlin`) im `auswahl`-Schritt. |
| `src/app/flow/[token]/self-service-actions.ts` | `speichereBesichtigungsortFlow(token, ort, wunschterminLokal?)` — optionaler 3. Parameter; bei Wert `lead.wunschtermin = berlinWallClockToUtc(wunschterminLokal)` mit ins Update. |
| `src/app/flow/[token]/self-service-actions.ts` (i18n falls nötig) | ggf. neue `selfService`-Keys (`ort.wunschtermin_titel` / `_hinweis`). |

**Wiederverwendet (keine Kopie):**
- `WunschterminPicker` — Import aus `@/app/embed/gutachter-finder/_components/WunschterminPicker`
  (self-contained: nur lucide + Design-Tokens, keine Embed-Kopplung).
  **Follow-up (nicht jetzt):** nach `src/components/self-service/WunschterminPicker.tsx` verschieben,
  wenn die aar-956-Zone ruhig ist — der Move würde `FinderWizard.tsx` (aar-956-Hot-Zone) anfassen.
- `berlinWallClockToUtc` aus `@/lib/google-calendar/timezone` (TZ-Konvertierung).
- `formatBerlin` aus demselben Modul (read-only Anzeige).
- `ladeMatchingFlow` / `bucheTerminFlow` — **unverändert**.

**Keine Migration** — `lead.wunschtermin` existiert bereits.

## TZ-Korrektheit (kritisch)

Der Go-Live hatte eine app-weite Zeitzonen-Korrektur. `WunschterminPicker` liefert einen
**Berlin-Wall-Clock**-String (`"YYYY-MM-DDTHH:MM"`). Er MUSS über `berlinWallClockToUtc` → UTC-ISO,
bevor er in `lead.wunschtermin` (timestamptz) landet — sonst der 2h-Drift. Das ist derselbe Pfad,
den der Embed-Finder serverseitig für seinen Wunschtermin nimmt.

## Error-Handling

`speichereBesichtigungsortFlow` bleibt beim bestehenden Result-Shape `{ ok: boolean; error?: string }`
(kein `throw`). Ungültiger Wunschtermin-String (kein Match in `berlinWallClockToUtc`) → die Funktion
wirft heute; deshalb wird der Wert vor der Konvertierung nur bei nicht-leerem, format-validem String
gesetzt (der `WunschterminPicker` liefert per Konstruktion valide `YYYY-MM-DDTHH:MM`-Strings — ein
defensiver Guard schützt vor manipuliertem Client-Input).

## Testing

- **Unit (self-service-actions):** `speichereBesichtigungsortFlow` mit `wunschterminLokal` → prüft,
  dass `lead.wunschtermin` als korrektes UTC-ISO persistiert wird (Berlin 10:00 → 08:00Z bzw. DST
  09:00 — via `berlinWallClockToUtc`, unter `TZ=UTC` verifiziert); ohne `wunschterminLokal` → kein
  `wunschtermin`-Update.
- **Component (FlowSlotStep):** `ort_abfragen`-Schritt rendert `WunschterminPicker`; gewählter Wert
  wird beim Ort-Bestätigen an die Action gereicht.
- **E2E/Smoke (lokal, Test-SV):** Dev-Server mit `CANONICAL_FLOWLINK_ENABLED=true` + synthetischer
  schaden-melden-Lead (nur Kontakt, kein Ort/Termin) → `/flow` → `ort_abfragen`: Wunschtermin +
  Besichtigungsort → verifizieren: `lead.wunschtermin` TZ-korrekt persistiert + Slots gerankt +
  leerer Wunschtermin funktioniert. Testdaten 0-Rest cleanen. **Nur Test-SVs buchen** (signSAandCreateFall
  benachrichtigt den SV).

## Scope-Grenzen (YAGNI)

- **Nur der `ort_abfragen`-Pfad.** Termin-lose Leads, die **bereits** einen Ort haben (z.B.
  `fahrzeug_standort`) und `ort_abfragen` überspringen, sehen den Wunschtermin-Input in v1 nicht —
  sie werden weiterhin (ohne Wunschtermin-Ranking) auf ihren Ort gematcht. Das ist graceful
  degradation, kein Bruch. Für schaden-melden-Leads (die Kern-Lead-Klasse, ort-los) greift der Input
  voll. Ein zweiter Input-Surface auf dem Slot-Picker ist ein optionaler Follow-up, falls gewünscht.
- **Keine Engine-/Matching-Änderung.** `ladeMatchingFlow` liest `lead.wunschtermin` schon.
- **Kein Required-Zwang** (Aaron-Entscheid 2026-07-02: optional, Embed-Pattern 1:1).

## Koordination (aar-956-Hot-Zone)

`FlowSlotStep.tsx` + `self-service-actions.ts` liegen in der aar-956-Zone (mehrere aktive Sessions auf
`kitta/aar-956-embed-reservierung-rueckruf`). Arbeit läuft im **eigenen Worktree** (`kitta/flow-wunschtermin`
off staging), Änderungen **rein additiv** (neuer optionaler Parameter, neuer State/Block — keine
Signatur-Brüche, kein Move an aar-956-Files). Merge-Koordination via Marker; PR gegen staging.
