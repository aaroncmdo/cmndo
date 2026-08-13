# Ops-Test 11.08.2026 — Root-Cause-Analyse + Aufgabenliste

**Testpersonen:** `nicolas.kitta+testsv@claimondo.de` (SV, `sv_id=b7387f81-482c-4cc5-8ced-bcaa5e92a5ff`)
· `aaron.sprafke+kundeneuneuneu@claimondo.de` (Kunde, `profile_id=9650e790-3f5b-4706-bf3f-344ce93cd231`)

**Strecke:** Gutachter-Finder-Embed (anon) → Lead → FlowLink → Onboarding → Claim → SV-/Werkstatt-Sicht

**Test-Artefakte in prod (`paizkjajbuxxksdoycev`):**

| Objekt | ID | Kernwerte |
|---|---|---|
| gf-Anfrage | `b3a59016-38db-48ee-8d27-db064fe2f678` | `wunschtermin=2026-08-11 10:00 UTC` (= Di 12:00 Berlin), `matching_typ=partner`, **`termin_id=NULL`** |
| Lead | `bea4fa1d-a803-44c6-91fa-529b1a7dfe98` | `schuldfrage=gegner`, `kennzeichen='Q-F 2'`, `zb1_status=hochgeladen`, **alle `halter_*`=NULL**, `unfallskizze_generiert_am=NULL` |
| Claim | `3007e987-9f55-47c7-ba46-8ad04aab8acf` | `CLM-2026-03507`, `sv_id=b7387f81…`, `abrechnungsweg=haftpflicht`, **`werkstatt_id=NULL`** |
| SV-Kalenderblock | `19384b30-8609-…` | `2026-08-11 10:30–11:30 UTC` = **Di 12:30–13:30 Berlin**, Titel „Test Termin" |

**Status der Befunde:** ✅ = im Code **und** in der prod-DB verifiziert · 🟡 = im Code verifiziert, Laufzeit nicht reproduziert · ⚪ = plausibel, nicht verifiziert

---

## Kurzfassung

26 gemeldete Symptome gehen auf **10 Wurzeln** zurück. Die vier gravierendsten:

1. **RC-1 — Der Embed umgeht bei gesetztem Wunschtermin die Termin-Engine vollständig** und meldet dem Kunden eine Reservierung, die es nicht gibt. Erklärt allein 5 Symptome. **Vertrauensbruch: der Kunde bekommt eine WhatsApp-Terminbestätigung für einen Termin, der nie in der DB stand.**
2. **RC-2 — Fahrzeugdaten haben zwei Quellen** (`leads` vs. `vehicles`) mit nur einem einmaligen Kopier-Write bei der Konversion. Spätere Korrekturen erreichen den Claim nie.
3. **RC-3 — Die ZB1-Korrektur-UI deckt 4 von 15 ausgelesenen Feldern ab.** Halteradresse ist weder sichtbar noch korrigierbar.
4. **RC-9 — Die Werkstatt ist im Claim nicht als Beteiligte modelliert** (`werkstatt_id=NULL` trotz Vermittlung).

Bemerkenswert: **Die Termin-Engine selbst ist intakt.** `reserviere()` prüft die Belegung fail-closed (`writes.ts:43-45`) — der Fehler liegt in der Embed-Schicht darüber, die die Engine erst umgeht und ihr „belegt" dann wegwirft.

> **Status 12.08.:** Die Sanierung ist weitgehend umgesetzt — RC-1 (#5176 + Nachbesserung #5200), RC-2/RC-3 (#5180), RC-5 (#5187), RC-7/RC-10 (#5191), RC-9-Teil (#5196). Offen: #5197, #5201, #5207 sowie die Regel-4-Prod-Smokes. Aktueller Stand immer im Marker `COORDINATION-ops-test-lane-a-embed-termin-wahrheit` und im Plan `docs/superpowers/plans/2026-08-11-ops-test-sanierung.md`.
> **Eine Belegstufe dieses Dokuments wurde am 12.08. widerlegt** — siehe Korrekturkasten in RC-1 (a). Die Wurzel selbst hat sich dadurch nicht geändert, der Ersatz-Beleg ist härter.

---

## RC-1 ✅ — Embed-Wunschtermin umgeht die Termin-Engine (Symptome 1, 2, 4, 5, 19)

### Was passiert ist

Der SV hatte Di 12:30–13:30 im verbundenen Kalender. Der Kunde gab Di 12:00 als Wunschtermin an. 12:00 wurde als frei angeboten, der Kunde buchte, bekam „✅ Ihr Termin ist reserviert" — **und es entstand kein Termin.**

### Beweiskette

**a) Der Kalenderblock liegt in der Belegung.** `v_belegung` liefert für den Test-SV:

```
extern | 2026-08-11 10:30:00+00 → 11:30:00+00   (= Di 12:30–13:30 Berlin)
```

Der Cache-Join funktioniert trotz `sv_id=NULL` über den `profile_id`-Fallback der View.

> ⚠️ **KORREKTUR 12.08. — die ursprüngliche Fassung dieses Punktes war falsch.**
> Hier stand: „Der Block war seit dem 09.08. 16:40 im Cache — also **vor** dem Test vorhanden."
> Das trägt nicht. Alle 5 Cache-Zeilen des Test-SV tragen dasselbe `last_synced_at = 2026-08-09 16:40:21` — der Kalender wurde als Ganzes **erstmals** synchronisiert, **25 Sekunden NACH** der Anfrage (16:39:56). Zum Buchungszeitpunkt war der Block also **nicht** im Cache.
> **Ursache des Fehlschlusses:** `last_synced_at` wird in `sv_kalender_events_cache` **nur beim INSERT** gesetzt — `diffAndApply` aktualisiert bestehende Zeilen nicht. Es taugt nicht als „zuletzt gesehen".
> **Lehre:** vom heutigen Datenstand nicht auf den Zustand von vor Tagen schließen.
> ⇒ **Warum die Buchung im Einzelfall scheiterte, ist aus den Daten nicht rekonstruierbar.** Der Ersatz-Beleg unter (c) ist jedoch härter als der widerlegte, weil er ein Muster statt eines Einzelfalls zeigt.

**b) Ein 12:00-Slot existiert im Engine-Raster überhaupt nicht.** `slots.ts:15-21` + `termin-konstanten.ts`: Default-Arbeitszeit Di 09:00–17:00, `TERMIN_DAUER_MIN=40` → Raster ist 09:00, 09:40, 10:20, 11:00, **11:40**, **12:20**, 13:00 … Ein angebotener 12:00-Slot kann daher nur synthetisch sein.

**c) Der Übeltäter — `src/app/embed/gutachter-finder/actions.ts:116-138`:**

```ts
const dreiZeiten = ((): SlotVorschlag[] => {
  if (!wunschterminIso || !input.wunschterminLokal) return []
  const H = parseInt((zeit ?? '10:00').split(':')[0] ?? '10', 10)
  const stunden = [...new Set([H, H+2, H-2, H+4, H-4].filter(h => h>=8 && h<=18))].slice(0,3).sort()
  // … out.push({ start, end, matchType: h === H ? 'wunschtermin' : 'nahe' })
})()

const mitZeiten = <T extends { slots: SlotVorschlag[] }>(items: T[]): T[] =>
  dreiZeiten.length ? items.map((it) => ({ ...it, slots: dreiZeiten })) : items
```

Sobald ein Wunschtermin gesetzt ist, werden die **echten Engine-Slots ersetzt** — durch drei aus der Wunschstunde gerechnete Uhrzeiten (±2h/±4h). Kein `freieSlots`, kein `v_belegung`, keine Arbeitszeit, keine Reachability, kein Raster. Eingabe 12:00 → `[10, 12, 14]` → 12:00 erscheint mit Badge „Wunschzeit".

Das ist als „Request-Modell" dokumentiert (Kommentar Z. 111-115, Entscheidung 12.06.). Die Absicht — der Kunde soll wünschen dürfen, Dispatch bestätigt — ist legitim; **falsch ist die Darstellung als verfügbar und die anschließende Erfolgsmeldung.**

**Ersatz-Beleg (prod-Messung 12.08.) — Muster statt Einzelfall.** Nachdem der Cache-Beleg aus (a) weggefallen ist, wurde der synthetische Pfad direkt an den erzeugten Terminen nachgewiesen:

- **39 von 41** `self_service`-Terminen liegen auf **voller Stunde**, nur 2 im 40-Minuten-Engine-Raster ⇒ `dreiZeiten` war der **reale** Buchungsweg, nicht die Engine.
- **10 Termine liegen außerhalb der Arbeitszeit**: 9× 08:00 (Start ist 09:00), 1× 17:00 (Ende wäre 17:40) — **einer davon an einem Samstag**. `dreiZeiten` clampt auf 8–18 Uhr und kennt weder Arbeitszeiten noch `blockierte_wochentage`.

Dieser Befund ist stärker als der widerlegte: Er zeigt den Fehler an 41 echten Buchungen statt an einer.

🔴 **Folge für den Fix:** Eine reine Belegungsprüfung genügt **nicht**. Außerhalb der Arbeitszeit existiert keine Belegung — 08:00, 18:00 und Samstag hätten weiterhin als „frei" gegolten. Der erste Fix (#5176) war deshalb unvollständig und wurde in **#5200** um eine Arbeitszeit-/Wochentag-Prüfung ergänzt.

**d) Die Engine hat korrekt abgelehnt.** `writes.ts:39-46`:

```ts
const pre = await pruefeBelegungStrict(assignee, von, bis, db)
if (!pre.frei) return { ok: false, error: 'Slot belegt', code: 'belegt' }
```

Der Mechanismus ist korrekt: 12:00 + 40 min + 10 min Puffer = Fenster 11:50–12:50 Berlin → überlappt einen 12:30-Block → `belegt`.

> ⚠️ **Einschränkung (Korrektur 12.08.):** Dass *dieser* Mechanismus die Buchung im Testfall verhindert hat, ist **nicht belegt** — siehe Korrektur unter (a). Zum Buchungszeitpunkt war der Block nicht im Cache, und es gab auch keine kollidierende Buchung. Der konkrete Fehlschlag-Grund bleibt offen. Unverändert belegt bleibt: **die Buchung schlug fehl, und der Fehlschlag wurde verschluckt** (e/f).

**e) Der Fehlschlag wird verschluckt — `actions.ts:284, 337`:**

```ts
const requestModus = wunschterminIso != null
// …
if (!b.ok && !requestModus) {
  return { ok: false, error: …, slotWeg: true }
}
void sendeEmbedTerminBestaetigung({ … })   // ← läuft trotzdem
```

Im Request-Modus wird `b.ok === false` ignoriert. Direkt danach geht die WhatsApp raus: *„✅ Ihr Termin ist reserviert — Ihr Kfz-Gutachter … ist für … reserviert."* (Z. 407-419).

**f) DB bestätigt:** `gutachter_finder_anfragen.termin_id = NULL`; in `gutachter_termine` existiert für diesen SV **kein einziger** Eintrag mit `start_zeit = 2026-08-11 10:00 UTC` — auch kein stornierter.

### Folgesymptome, die damit vollständig erklärt sind

- **#2 „Gutachtertermin wird unter ‚Termine' nicht angezeigt"** → es gibt keinen Termin.
- **#4 „Beim SV nur ‚Lead ablehnen', kein Termin, kein Verschieben"** → es gibt keinen Termin; der Claim ist zwar über `claims.sv_id` zugeordnet, die Termin-Aktionen hängen aber am Termin-Objekt.
- **#5 „Gewählter Besichtigungsort steht nirgendwo"** → `besichtigungsort_adresse` wird auf dem *Termin* gecacht (`kalender-kontext.ts:181`). Ohne Termin kein Ort.
- **#19 „Auftrag nach FlowLink-Abschluss nicht beim Gutachter"** → derselbe fehlende Termin; die SV-Auftragsansicht ist termin-getrieben.

---

## RC-2 ✅ — Zwei Fahrzeug-Datenquellen ohne Rück-Sync (Symptom 18)

`convert-lead-to-claim.ts:111-173` kopiert die Fahrzeugdaten **einmalig zum Konversionszeitpunkt** aus `leads` in `vehicles` (SSoT) und bindet den Claim an die `vehicle_id`.

Der Claim liest danach ausschließlich aus `vehicles` — via `v_claim_full` (vgl. `kalender-kontext.ts:93-95`: *„Fahrzeugdaten kommen aus vehicles (SSoT) via v_claim_full statt direkt aus der faelle-Tabelle"*).

Der Dispatch-Save schreibt aber nach `leads`: `dispatch/leads/[id]/_actions/stammdaten.ts:17` führt `kennzeichen` in der Feldliste. **Ein `vehicles`-Update existiert nur in `ensure-vehicle.ts`, `cardentity/run-full.ts` und dem `cardentity-recheck`-Cron — kein Pfad wird vom Lead-Save ausgelöst.**

→ Kennzeichen-Korrektur im Lead nach der Konversion erreicht den Claim nie. Gleiches gilt für Hersteller, Modell, Farbe, HSN/TSN.

---

## RC-3 ✅ — ZB1-Korrektur deckt 4 von 15 Feldern (Symptome 15, 16, 17)

`apply-zb1-to-lead.ts:32-46` extrahiert **15 Felder**: `fin`, `kennzeichen`, `fahrzeug_hersteller`, `fahrzeug_modell`, `fahrzeug_baujahr`, `erstzulassung`, `halter_vorname`, `halter_nachname`, `halter_strasse`, `halter_plz`, `halter_stadt`, `hsn`, `tsn`, `fahrzeug_farbe`, `brn`.

`kunde/onboarding-details/zb1-actions.ts:20-25` kennt **4**:

```ts
export type Zb1Korrekturen = {
  kennzeichen?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  halter_name?: string | null     // nur Vor-/Nachname
}
```

→ **#15** (nicht alle Felder angezeigt) und **#16** (Halterdaten nicht korrigierbar — Straße/PLZ/Stadt fehlen komplett) sind dieselbe Lücke.

**#17** („manuelle Anpassungen werden nicht übernommen") ist davon zu trennen: Der Schreibpfad für die 4 bekannten Felder ist ein bewusstes Force-Update, das die H6-Regel umgeht und funktioniert. Für die **11 übrigen Felder gibt es gar keinen Korrektur-Pfad** — die Eingabe hat dort nichts zum Schreiben.

**DB-Beleg:** Lead `bea4fa1d` hat `zb1_status='hochgeladen'`, aber `halter_vorname/nachname/strasse/plz/stadt` **alle NULL** und `fahrzeug_hersteller` NULL.

---

## RC-4 🟡 — Onboarding ignoriert den Lead-Vorzustand (Symptome 20, 21, 22)

Der Kunde kam aus dem Finder mit gewähltem SV und hochgeladenem Fahrzeugschein. Das Onboarding fragte beides erneut ab.

- **#20** Fahrzeugschein erneut verlangt → der Wizard-Step prüft nicht `leads.zb1_status='hochgeladen'` bzw. die vorhandene `zb1_url`.
- **#21** „Wir suchen einen passenden Gutachter" → Status-Text ohne Prüfung auf `claims.sv_id`/`gfa.zugeordneter_sv_id` (beide gesetzt: `b7387f81…`, `matching_typ='partner'`).
- **#22** „4 Dokumente hochladen" nach erfolgtem Upload → Zähler liest die Soll-Liste aus `lib/dokumente/erwartung.ts`, gleicht sie aber nicht gegen den Ist-Bestand ab.

Gemeinsame Wurzel: Das Onboarding ist als **Erstaufnahme** gebaut und hat keinen „was ist schon da"-Vorlauf. Der Embed liefert aber einen bereits weit gefüllten Lead.

---

## RC-5 ✅ — Der Finder hat keine Schuldfrage-Weiche (Symptom 9)

`EmbedBuchungInput` (`actions.ts:33-49`) kennt kein `schuldfrage`-Feld; der Wizard fragt sie nicht ab. Der Lead landet auf `schuldfrage='gegner'` → `abrechnungsweg='haftpflicht'` (im Test bestätigt).

Fachlich korrekt wäre: Bei Selbstverschulden (Kasko/Selbstzahler) muss der Kunde in die Reparatur-Lane abzweigen — **und dann darf kein Gutachter hinterlegt sein.** Aktuell wird in jedem Fall ein SV zugeordnet.

> Verwandt: Die Symmetrie-Lücke „Werkstatt-Dispatch bei Selbstverschulden" wurde bereits in PR #5091 für den nativen `schaden-melden`-Pfad geschlossen. **Der Embed-Pfad hat diese Weiche nie bekommen.**

---

## RC-6 ✅ — Spracheingabe ist Batch-Transkription, kein Streaming (Symptom 10)

`components/support/useVoiceRecorder.ts`: MediaRecorder nimmt auf → Stop → POST an `/api/support/voice-transcribe` (Groq Whisper) → Transkript kommt **am Stück**. Wort-für-Wort-Anzeige ist damit architektonisch ausgeschlossen.

Zusätzlich: Der Hook wird **nur im Support-Chat** verwendet — in `src/app/flow` gibt es keinen Consumer.

Für Live-Transkript braucht es entweder die Web Speech API (`SpeechRecognition` mit `interimResults=true`) oder eine Streaming-STT-Verbindung.

---

## RC-7 ✅ — SV-Selbstverwaltung unvollständig (Symptom 24)

Sicherungsabtretung erscheint nur in `gutachter/verifizierung` und `gutachter/willkommen` — also **ausschließlich im Onboarding**. `src/app/gutachter/einstellungen/` enthält nur `embed/`, `kalender/`, `KartenAnzeigeToggle.tsx`, `page.tsx`. Ein nachträglicher Upload ist nicht vorgesehen.

---

## RC-8 🟡 — Unfall-Erfassung im Flow unvollständig (Symptome 11, 12, 13, 14)

`feststellung-steps.ts:28` definiert den Step `wann_wo` mit `['unfalldatum', 'unfall_uhrzeit', 'unfallort']`.

- **#12/#14** `unfallort` ist ein Freitextfeld ohne Google-Places-Anbindung. **DB-Beleg:** Lead `bea4fa1d` hat `unfallort='Ecke Wiesenstraße'` und `unfallort_lat/lng` NULL → nicht geocodiert, nicht kartierbar.
- **#11** Skizzen-Generierung existiert (`lib/unfallskizze/generate.ts`), ist aber **nur im Dispatch-Portal** verdrahtet (`dispatch/leads/[id]/_phases/UnfallskizzeCard.tsx`) — im Kunden-Flow gibt es keinen Trigger. **DB-Beleg:** `unfallskizze_generiert_am=NULL`.
- **#13** Datum im US-Format: klassisches `<input type="date">`-Rendering im Browser-Locale. Genau dieses Problem wurde für den Wunschtermin bereits gelöst — `WunschterminPicker.tsx:3-7` dokumentiert es und ersetzt das native Feld durch eigene Chips. Im Feststellungs-Flow fehlt dieselbe Behandlung.

> ⚪ #13 und #14 sind aus der Feldkonfiguration abgeleitet; ich habe den gerenderten Step nicht im Browser gegengeprüft.

---

## RC-9 ⚪ — Werkstatt ist keine Claim-Beteiligte (Symptome 6, 7, 8, 23)

**DB-Beleg:** `claims.werkstatt_id = NULL` beim Test-Claim. Es gibt kein eigenes Werkstatt-Portal unter `src/app` — die Werkstatt arbeitet über geteilte Fall-Ansichten.

- **#7** Werkstatt weder als Ansprechpartner noch mit Termin im Claim sichtbar → mangels Verknüpfung gibt es nichts anzuzeigen.
- **#6** Bei „Fahrzeug steht in der Werkstatt" fehlt der Gutachtertermin in der Werkstatt-Sicht → dieselbe fehlende Kante.
- **#8** „Kostenvoranschlag ausstehend" blockiert den Terminvorschlag der Werkstatt im Haftpflichtfall. `lib/dokumente/erwartung.ts:117-123` führt `sachschaden_rechnung` („Rechnung / Kostenvoranschlag") mit `pflicht: false` — der harte Block muss also aus einem anderen Gate kommen. **Nicht lokalisiert.** Im Haftpflichtfall ist ein KVA fachlich ohnehin falsch (dort gilt das Gutachten).
- **#23** „Partnerwerkstatt vermitteln" legt keinen Auftrag an und schickt den Kunden in eine Unterschrift statt in die Werkstattauswahl. Sollzustand laut Test: oben OCR für Gutachten **und** SV-Rechnung, daraus Claim per Klick.

> Dieser Cluster ist der am wenigsten verifizierte. Vor der Umsetzung braucht es eine eigene Bestandsaufnahme des Werkstatt-Pfads.

---

## RC-10 ⚪ — UI-Detailfehler (Symptome 3, 25, 26)

- **#3** Aufgabe „Termin bestätigen" im Claim, obwohl der SV-Termin automatisch bestätigt wird und es keinen Werkstatt-Rücktermin gibt → Task-Generator erzeugt eine Aufgabe ohne Vorbedingungsprüfung.
- **#25** Chat ohne Hintergrund bei „Ihr Betreuer" / „Ihre Sachverständigen" → fehlende Flächen-Klasse in `KundeKbChat.tsx`.
- **#26** „Mein Fall" springt auf „Fahrzeuge" und zeigt dann den Claim. `KundeNav.tsx:12` setzt bei genau einem Fall `href=/kunde/faelle/${singleFallId}` mit Label „Mein Fall" — die aktive Markierung fällt danach auf einen anderen Eintrag. **Sollzustand laut Test ist aber eine Umstellung, kein Fix:** Einstieg immer über Fahrzeuge (Liste + Detail), Claim von dort erreichbar.

---

# Aufgabenliste

## P0 — Falsche Zusage an den Kunden (sofort)

**1. Wunschtermin nicht mehr als „verfügbar" darstellen** · `embed/gutachter-finder/actions.ts:116-138`
`mitZeiten` darf die Engine-Slots nicht ersetzen. Zwei Varianten:
- **A (empfohlen, klein):** Engine-Slots bleiben führend; der Wunschtermin wird zusätzlich als *Anfrage* angeboten und im UI klar anders beschriftet („Wunschzeit anfragen" statt Slot-Chip).
- **B (sauberer, größer):** Wunschzeiten vor der Anzeige durch `pruefeBelegungStrict` filtern und belegte Zeiten ausgrauen.
*Test:* SV mit Kalenderblock Di 12:30 → Wunsch 12:00 darf nicht als buchbarer Slot erscheinen.

**2. Buchungs-Fehlschlag nicht mehr verschlucken** · `actions.ts:284, 337`
`requestModus` darf `b.ok===false` nicht in Erfolg umdeuten. Bei `code==='belegt'` entweder Alternativen anbieten oder den Lead ehrlich als **unbestätigte Anfrage** führen.

**3. Bestätigungstext an den Wahrheitsgehalt anpassen** · `sendeEmbedTerminBestaetigung`, `actions.ts:405-419`
Ohne Termin-Row nie „✅ Ihr Termin ist reserviert". Bei Anfrage: „Wir prüfen Ihren Wunschtermin und bestätigen ihn in Kürze." Gleiches für die Dead-Pin-Variante (Z. 569-583).

**4. Regressionstest gegen genau dieses Szenario**
Externer Kalenderblock + überlappender Wunschtermin → erwartet: kein „reserviert"-Versprechen, kein Termin-Phantom. Deckt RC-1 dauerhaft ab.

## P1 — Datenintegrität

**5. Lead→`vehicles`-Rück-Sync** · `dispatch/leads/[id]/_actions/stammdaten.ts` + `lib/vehicles/ensure-vehicle.ts`
Bei Änderung fahrzeugbezogener Lead-Felder nach der Konversion die `vehicles`-Row des Claims nachziehen. Alternativ Fahrzeugfelder im Lead nach Konversion sperren und ausschließlich am Claim editieren — **eine Quelle, nicht zwei.**
*Entscheidung nötig (Aaron): nachziehen oder sperren?*

**6. ZB1-Korrektur auf alle 15 Felder ausweiten** · `kunde/onboarding-details/zb1-actions.ts:20-25`
`Zb1Korrekturen` um `halter_strasse`, `halter_plz`, `halter_stadt`, `fin`, `hsn`, `tsn`, `fahrzeug_baujahr`, `erstzulassung`, `fahrzeug_farbe`, `brn` erweitern; Preview in `Zb1UploadField.tsx` entsprechend. Vollständige Halteradresse ist Pflicht — sie geht in SA und Gutachten ein.

**7. Klären, warum das OCR nichts geschrieben hat**
`zb1_status='hochgeladen'`, aber sämtliche `halter_*` NULL. Getrennt von #6 prüfen: Hat der Parser nichts erkannt, oder hat die H6-Regel (`setIfEmpty`) blockiert? Ohne diese Antwort behebt #6 nur die Oberfläche.

## P1 — Falsche Abzweigung

**8. Schuldfrage-Weiche in den Finder** · `embed/gutachter-finder/_components/FinderWizard.tsx` + `actions.ts:33-49`
Schuldfrage abfragen; bei Selbstverschulden in die Reparatur-Lane abzweigen und **keinen SV zuordnen** (`zugeordneter_sv_id=null`, kein Termin). Analog zur bereits gelösten Symmetrie-Lücke aus PR #5091.

**9. Onboarding-Vorlauf „was ist schon da"** · `kunde/onboarding/OnboardingWizard.tsx`
- Fahrzeugschein-Step überspringen, wenn `zb1_status='hochgeladen'`
- „Wir suchen einen Gutachter" unterdrücken, wenn `claims.sv_id` gesetzt ist — stattdessen den SV zeigen
- Dokumenten-Zähler gegen den Ist-Bestand rechnen statt gegen die Soll-Liste

## P2 — Erfassungsqualität

**10. Unfallort mit Google Places + Geocoding** · `feststellung-steps.ts:28`
Auf `GooglePlaceAutocomplete` umstellen (dieselbe Komponente wie in PR #5117 für die Partner-Formulare) und `unfallort_lat/lng` füllen — Vorbedingung für #11.

**11. Unfallskizze im Kunden-Flow verfügbar machen**
`lib/unfallskizze/generate.ts` existiert, ist aber nur im Dispatch verdrahtet. Trigger im Feststellungs-Flow ergänzen; braucht #10.

**12. Datumsfelder auf deutsches Format** · Feststellungs-Flow
`WunschterminPicker.tsx` hat das Muster bereits gelöst — Ansatz übernehmen statt neu erfinden.

**13. Live-Transkript beim Einsprechen** · `components/support/useVoiceRecorder.ts`
Architekturwechsel: Web Speech API mit `interimResults` (schnell, browserabhängig) oder Streaming-STT (robuster, teurer). *Entscheidung nötig.* Außerdem klären, wo überall diktiert werden soll — im Flow ist aktuell gar kein Voice-Input eingebunden.

## P2 — Werkstatt-Cluster (Bestandsaufnahme zuerst)

**14. Werkstatt-Pfad kartieren** — Vorarbeit für 15-17
Welche Route sieht die Werkstatt, wie wird sie an den Claim gebunden, warum bleibt `werkstatt_id` NULL? Ohne diese Karte sind die folgenden Punkte Ratespiele.

**15. Werkstatt als Claim-Beteiligte** — `werkstatt_id` bei Vermittlung setzen; Werkstatt als Ansprechpartner und deren Termin im Claim anzeigen; bei „Fahrzeug steht in der Werkstatt" den Gutachtertermin in die Werkstatt-Sicht spiegeln.

**16. KVA-Blocker im Haftpflichtfall entfernen** — Gate lokalisieren (nicht in `erwartung.ts`) und für `abrechnungsweg='haftpflicht'` deaktivieren: dort gilt das Gutachten, nicht der KVA.

**17. „Partnerwerkstatt vermitteln" neu bauen** — Auftrag anlegen statt Unterschrift anfordern; Kunde sieht seinen Claim und wählt die Werkstatt. OCR für Gutachten **und** SV-Rechnung an den Anfang, Claim-Anlage per Klick.

## P3 — UI

**18.** SA-Upload in `gutachter/einstellungen` nachrüsten (bislang nur im Onboarding).
**19.** Chat-Hintergrund bei „Ihr Betreuer" / „Ihre Sachverständigen" — `KundeKbChat.tsx`.
**20.** Kunden-Einstieg auf Fahrzeuge umstellen (Liste + Detail → Claim von dort). Ist eine **Umstellung**, kein Fix — eigenes Ticket, betrifft `KundeNav.tsx` und die Routenstruktur.
**21.** Aufgabe „Termin bestätigen" nur erzeugen, wenn ein bestätigungsbedürftiger Termin existiert.

---

## Offene Entscheidungen für Aaron

1. **RC-1 Variante A oder B** — Wunschtermin als klar gekennzeichnete Anfrage, oder gegen die Belegung filtern?
2. **RC-2** — Lead-Felder nach Konversion nachziehen oder sperren?
3. **RC-6** — Web Speech API oder Streaming-STT? Und: soll im Flow überhaupt diktiert werden können?
4. **#20** — Umstellung auf Fahrzeug-zentrierte Navigation ist Produktarbeit, kein Bugfix. Eigener Scope?
