# AAR-940 — Self-Service SV-Matching-Modul + öffentliches SV-Profil — Voll-Spec

**Stand:** 31.05.2026 · **Status:** Spec (kein Code) · **Parent:** AAR-940 / AAR-939
**Verfasser:** Session 98044b6b · **Quelle:** Code-verifiziert gegen findBestSV/slots/svMatching/reserviere + Aaron-Entscheidungen 31.05.

---

## 1. Leitprinzipien (Aaron 31.05., gelockt)

1. **Es ist EIN Modul** — Matching + Slots + SV-Profil + Reservierung als wiederverwendbare Einheit. Heute an Dispatch-Panel + /gutachter-finden-Karte gebunden; fürs Self-Service muss es als eigenständiges Modul in den FlowLink-Wizard.
2. **Übertragbar für jede Anfrage** — keyt auf `gutachter_finder_anfragen` (quelle-agnostisch: native/sv_embed/kfz_gutachter_lp).
3. **Prio-Matching nach Besichtigungsort** — der beste SV wird zuerst nach Route/Distanz/Paket ermittelt (wie der Dispatcher zuweist, nur ohne Mensch).
4. **KUNDENWUNSCH STEHT IMMER IM VORDERGRUND** — die zentrale Regel. Wenn der Kunde eine Wunschzeit wählt, zu der der Prio-1-SV NICHT frei ist, wird dieser SV **trotzdem vorgeschlagen** — mit alternativen Zeiten + seiner Google-Bewertung. Der Kunde entscheidet zwischen „Prio-1-SV zu anderer Zeit" und „anderer SV zur Wunschzeit".
5. **Ein Schritt, nicht zwei** — Matching + Slot-Wahl + Reservierung fühlen sich als ein Flow an. Kunde wählt Termin → reserviert.
6. **Auto-Top-1 als Default** (Aaron): System nimmt automatisch den Prio-1-SV; erst wenn dessen Zeiten dem Kunden nicht passen, kommen die Alternativen ins Spiel.

---

## 2. Die SV-Weiche (verifiziert)

| `gutachter_finder_anfragen.zugeordneter_sv_id` | Bedeutung | Matching | Kalender |
|---|---|---|---|
| **NULL** | intern (native/Cluster-LP) — „unsere" Anfrage | **`findBestSV` global** (alle SVs, Prio nach Besichtigungsort) → Auto-Top-1 | der des gematchten SV |
| **gesetzt** | SV-Embed (kommt von SV-Seite) | **KEIN findBestSV** (SV ist fix) | **nur dessen Kalender** (`ladeFreieSlots(svId)`) |

Wichtig (Begriffspräzision): `findBestSV` = globaler Scorer (nur NULL-Fall). Bei gesetztem SV läuft direkt `ladeFreieSlots(svId)` — slot-gescoped auf den einen SV.

---

## 3. Kundenwunsch-Vorrang — der Kern-Algorithmus

**Eingang:** Besichtigungsort (lat/lng) + optionale Wunschzeit.

**Schritt 1 — Prio-Ranking:** `findBestSV({fallLat, fallLng, wunschterminIso}, N=3..8)` → Top-N nach Score (Distanz/ETA, Paket, Kontingent, Reachability, +40 Wunschtermin-Bonus wenn frei).

**Schritt 2 — Slots je SV um die Wunschzeit:** `getSvSuggestionsWithSlots` liefert pro SV die besten Slots, gerankt nach `matchType`: `wunschtermin` (±30min) > `gleicher_tag` > `nahe` (±1,5 Tage) > `nach`.

**Schritt 3 — Kundenwunsch-Vorrang-Darstellung:**
- **Fall A — Prio-1-SV ist zur Wunschzeit frei:** direkt anbieten (Auto-Top-1), Kunde bestätigt → reservieren. Ein-Schritt-Flow.
- **Fall B — Prio-1-SV NICHT zur Wunschzeit frei:** Kunde sieht eine Auswahl:
  - Prio-1-SV mit **alternativen Zeiten** (sein `naechsterFreierSlot`) + Google-Bewertung
  - +ggf. Prio-2/3-SV, die zur **Wunschzeit** frei sind, + deren Bewertung
  - Kunde wägt ab: „mein Lieblings-Zeit mit anderem SV" vs. „Prio-1-SV zu anderer Zeit". **Kunde entscheidet, nicht das System.**

**Schritt 4 — Reservierung:** gewählter SV+Slot → `reserviereSlot(anfrageId, svId, von, bis)` → `gutachter_termine` status `reserviert` + GFA-Marker `reservierter_sv_id`/`reservierter_slot_*`.

---

## 4. Öffentliches SV-Profil (Aaron 31.05., gelockt) — KRITISCH

**Problem heute:** `SvSuggestion`/`findBestSV`-Output enthält **interne Scoring-Daten** (`score`, `reasons: ['2 Ablehnungen','Paket: premium']`, `kontingentFrei`, `ablehnungen30d`, exakte ETA). Das ist **Dispatcher-Info** und darf NIE an den anon-Kunden. Es gibt heute keine saubere „customer-facing"-Projektion → das ist die unsaubere Stelle, die Aaron erspürt hat.

**Lösung: definierte `OeffentlichesSvProfil`-Projektion.** Nur diese Felder gehen an den Kunden:

| Feld | Quelle | Anzeige |
|---|---|---|
| **vorname** | profiles.vorname (NICHT nachname!) | „Ihr Gutachter: Thomas" |
| **profilbild** | profiles.avatar_url | Avatar/Gesicht |
| **profilbeschreibung** | profiles.profilbeschreibung | Kurztext |
| **Google-Bewertung** | google_bewertungen_cache (durchschnitt, anzahl) | GoogleBewertungBadge |
| **Distanz/Region** | gerundete Distanz ODER Stadt | „ca. 12 km entfernt" — NICHT exakte Route/ETA |

**NIEMALS an den Kunden:** score, reasons, kontingentFrei, ablehnungen30d, paket, exakte ETA-Minuten, nachname, interne IDs, FreeBusy-Details, Telefon/Email des SV (bis Termin steht).

**Umsetzung:** Neue Funktion `toOeffentlichesSvProfil(candidate, bewertung)` die aus `SvMatchCandidate` + Bewertungs-Lookup die kundensichere Projektion baut. Die Self-Service-UI bekommt NUR diese Projektion, nie die rohe `SvSuggestion`.

**Lücke im Matching-Output:** `findBestSV` liefert heute keine Bewertung mit. Modul muss nach dem Match die `google_bewertungen_cache`-Werte für die Top-N-SVs batch-nachladen (wie `findSvsForLocation` die Geo-Felder nachlädt) und in die Projektion mergen.

---

## 5. Modul-Schnittstelle (neu)

```
lib/sv-matching-modul/ (neu, extrahiert das Bestehende als wiederverwendbares Modul)
  matchAndSlots(input: { lat, lng, wunschterminIso?, fixerSvId?: string|null })
    → { svs: OeffentlichesSvProfil[] mit slots[] }
    - fixerSvId gesetzt → nur dieser (ladeFreieSlots), kein findBestSV
    - fixerSvId null → findBestSV Top-N + Slots + Bewertung-Merge
    - intern: ruft bestehende findBestSV/getSvSuggestionsWithSlots, mappt auf OeffentlichesSvProfil
  toOeffentlichesSvProfil(candidate, bewertung) → kundensichere Projektion
  reserviere(anfrageId, svId, slot) → bestehende reserviereSlot
```
Dispatch-Panel + /gutachter-finden + Self-Service-Wizard konsumieren alle DASSELBE Modul — eine Wahrheit.

---

## 6. Self-Service-Einbettung (aus AAR-940-Kern)

- **Promotion:** FlowLink-Klick → token-validiert → Anfrage→Lead via service_role (kein roh-anon).
- **Quali-Gate:** Wizard-Selbst-Quali (Schuldfrage/Plausibilität) VOR dem Matching-Schritt. Disqualifiziert (Eigenverschulden) → kein Matching, kein Termin.
- **Matching-Modul** (dieser Doc) = der Termin-Schritt nach bestandener Quali.
- **SA** auf dem Lead, dann Reservierung.
- RLS: alles token-/service_role-getrieben; SV-Profil-Projektion verhindert Daten-Leak.

---

## 7. Bestandsaufnahme (code-verifiziert, was existiert vs. neu)

**Existiert (Reuse):**
- `findBestSV` (Voll-Scorer inkl. Wunschtermin-Bonus, Reachability) ✅
- `getSvSuggestionsWithSlots` (SVs + Slots, nach Wunschtermin gerankt) ✅
- `getNextFreeSlotsForSv` / `ladeFreieSlots` (Slot-Listen, matchType-Ranking) ✅
- `findSvsForLocation` (Tier-1/3-Wrapper für Karte) ✅
- `reserviereSlot` / `reserveSvTerminForLead` ✅
- `GoogleBewertungBadge` + `google_bewertungen_cache` ✅
- Sticky-SV (Kunde hatte SV schon) ✅

**Neu zu bauen:**
- `OeffentlichesSvProfil`-Projektion + `toOeffentlichesSvProfil()` (Daten-Leak-Schutz) 🔴 wichtig
- Bewertungs-Merge in den Matching-Output (Batch-Nachladen) 🔴
- Modul-Extraktion `lib/sv-matching-modul/` (heute verstreut) 🟡
- Self-Service-Wizard-Einbettung (Quali → Matching-Modul → SA → Reserve) 🟡
- Token-Promotion beim FlowLink-Klick (AAR-940-Kern) 🔴

---

## 8. Offene Detailpunkte
- **Distanz-Anzeige-Granularität:** „ca. X km" gerundet vs. nur Stadt/Region? (DSGVO/Komfort-Abwägung — gerundet wohl ok)
- **Auto-Top-1 vs. immer Liste:** Aaron = Auto-Top-1 Default; aber bei Wunschzeit-Konflikt automatisch zur Liste aufklappen (Fall B). UX-Detail bei Umsetzung.
- **sv_leads (Tier 3) im Self-Service?** findSvsForLocation fällt auf sv_leads zurück wenn kein echter SV. Bei Self-Service: anbieten oder nur echte SVs? (sv_leads haben keinen echten Kalender → „Kalender immer frei" = riskanter für verbindliche Selbstbuchung). **Aaron-Entscheidung offen.**

---

## 9. Risiken
- **Daten-Leak (höchstes):** rohe SvSuggestion mit reasons/score an Kunden. → `OeffentlichesSvProfil` strikt erzwingen, nie das rohe Objekt durchreichen.
- **Quali-Treue:** Self-Quali muss Dispatcher-Prüfung spiegeln (Eigenverschulden etc.).
- **Kundenwunsch-Konflikt-UX:** Fall B (Prio-1 nicht frei) muss klar+fair dargestellt sein, nicht den Kunden in eine Richtung drängen.
- **sv_leads-Kalender-Fiktion:** wenn Tier-3 im Self-Service, kann ein „freier" Slot real belegt sein → Termin platzt.
