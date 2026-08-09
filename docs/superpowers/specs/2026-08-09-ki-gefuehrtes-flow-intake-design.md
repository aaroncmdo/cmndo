# Design: KI-gefuehrtes /flow-Intake (Option A)

**Datum:** 2026-08-09
**Autor:** Session 41300075 (Aaron-Vision "Variante-B-Kunde sieht nie Claimondo")
**Status:** Entwurf zur Review
**Verwandt:** `COORDINATION-variante-b-whitelabel-embed-suite` (Memory) · `docs/superpowers/specs/2026-06-03-aar956-p4-self-service-erfassung-design.md` · `docs/superpowers/specs/2026-06-05-monika-a-chat-flow-design.md` · `docs/fundament/entry-points.md`

## 1. Problem & Ziel

Aaron will fuer Variante-B-SVs, dass sich die Schaden-Erfassung anfuehlt wie **"die KI fragt dem Kunden alles ab und leitet ihn dann zum Login"** — statt eines klassischen Formular-Wizards.

Wichtiger Befund (Recherche 08.08.): Eine **KI-Vollqualifikation IM eingebetteten Widget** war nie geplant und widerspricht dem festgeschriebenen Prinzip *"Muster L — Widget erfasst minimal, `/flow` ist der Konversions-Konvergenzpunkt"* (`entry-points.md`). Das, was Aaron beschreibt, **existiert bereits** — als `/flow`-Wizard: `quali` (Schuldfrage) → `feststellung` (~25-30 deklarative Felder) → `termin`/`gutachter`/`werkstatt` → `sa` (Abtretung unterschreiben) → Uploads → `account` (Konto + Auto-Login). Es fehlen nur **zwei Eigenschaften**:

1. **Modalitaet:** Der `/flow`-Wizard ist ein Multi-Step-Formular, kein KI-Dialog.
2. **Marke:** Fuer Variante B ist `/flow` bereits whitelabel-faehig, wird aber nicht als "die Assistentin des SV" inszeniert.

**Ziel:** Eine **additive, konversationelle KI-Erfassungsschicht ueber dem bestehenden DB-getriebenen `/flow`**, die dieselben Felder fuellt, gebrandet als Assistentin des SV auftritt und in denselben unveraenderten SA-/Konto-Abschluss muendet.

Das ist **Option A** (Aaron-Entscheid 08.08.). Option B (In-Widget-Nachbau) wurde verworfen: SA-Unterschrift (rechtlich), Konto-Anlage und Uploads gehen cross-origin im Fremd-Widget nicht — der Kunde muesste am Ende ohnehin auf eine `/flow`-Seite. A liefert dasselbe Erlebnis bei Bruchteil des Risikos.

## 2. Nicht-Ziele (YAGNI)

- **Kein** In-Widget-Flow (Option B).
- **Kein** Ersatz der DB-getriebenen Step-Engine (`flow_szenario_steps`) — die KI-Schicht ist additiv und faellt bei Ausfall auf den bestehenden Wizard zurueck.
- **Kein** KI-Anfassen der rechtlich/technisch tragenden Schritte: `sa` (Signatur), `account` (Auth), Datei-Uploads bleiben unveraendert.
- **Keine** Tabellenflut — die KI schreibt in dieselben Persistenz-Pfade wie der Wizard (Lead/Claim/`onboarding_felder`).
- **Kein** eigener Chat-Verlauf-Store als Pflicht (Transcript optional, s. §8).

## 3. Architektur-Ueberblick

Die KI-Schicht sitzt an genau den **zwei deklarativen Steps** `quali` + `feststellung`. Alle anderen Steps bleiben unangetastet.

```
/flow/[token]
  ├─ (NEU) KI-Intake  ──fuellt──▶  dieselben Lead/Claim/onboarding_felder
  │    quali + feststellung          (statt der beiden Wizard-Steps)
  │    · Dialog (Chips + Freitext + Foto-Vision)
  │    · Extractor (Claude tool-use → Feld-Deltas gegen Schema)
  │    · Fallback-Button ──▶ klassischer Wizard (?fallback=1)
  ├─ zusammenfassung   (bestehend, wird zum Confirm-Gate)
  ├─ ort / werkstatt / termin / gutachter / rueckruf   (unveraendert)
  ├─ sa  (Abtretung — NIE KI)
  └─ account  (Konto + Auto-Login — NIE KI)
```

Das ist exakt das Muster des bestehenden `/api/v1/melde-schaden`-Endpoints (LLM → Zod-Schema → Funnel), aber (a) clientseitig-konversationell statt server-to-server und (b) in Stage-2-Tiefe (~30 Felder) statt Stage-1-Minimal.

## 4. Komponenten (isoliert, je eine Verantwortung)

### 4.1 `src/lib/flow/intake-schema.ts` (PURE) — Single Source der Felder
Die pro Szenario (haftpflicht/kasko/selbstzahler) zu erfassende Feldmenge als **getyptes Schema**, abgeleitet aus dem bestehenden `onboarding_felder` / `flow_szenario_steps`. **Sowohl** der Wizard (bestehend) **als auch** der KI-Layer lesen dieses eine Schema → keine Divergenz. Pro Feld: `key`, `typ` (enum/text/date/bool/foto), `pflicht`, `frage` (Default-Prompt-Text), `chips?` (kategorische Optionen).
*Testbar pur, kein server-only.*

### 4.2 `src/lib/flow/ai-intake/` — KI-Engine (server-only)
- `prompt.ts` — System-Prompt-Builder: Persona ("Du bist die Schaden-Assistentin von *<SV-Firmenname>*"), gebrandet, Ton, Leitplanken (nur nach Schema-Feldern fragen, keine Rechtsberatung, keine Pflichtfeld-Halluzination).
- `extract.ts` — ein Turn: (aktueller State + Kundennachricht [+ Foto]) → Claude tool-use / structured output → **Feld-Deltas** (nur Schema-Keys) + `naechste_frage` + `fehlende_pflichtfelder`.
- `vision.ts` — Foto-Hook: reuse `src/lib/ai/vision/analyze-unfallfotos.ts` → Schaden-Felder vorbefuellen (schadentyp, beschaedigte_teile, schweregrad).
- `guard.ts` (PURE) — validiert Deltas gegen das Schema (verwirft unbekannte/Rechts-/Auth-Felder), mergt in den State.
- Modell: neuer Key `flow_intake` in `src/lib/ai/models.ts` (Empfehlung Sonnet 5 — Balance Kosten/Latenz/Qualitaet); Foto-Teilschritt `vision_lead`.

### 4.3 `src/app/api/flow/[token]/intake/route.ts` — Turn-Endpoint
Token-authentifiziert (der `/flow`-Token traegt die Autorisierung — wie die bestehenden `self-service-actions`). Pro Turn: nimmt Kundennachricht/Foto → ruft `ai-intake` → **persistiert Feld-Deltas ueber denselben Pfad wie der Wizard** (`saveStep`/Lead/Claim, nicht neu erfunden) → gibt naechste Frage + Fortschritt zurueck. Rate-Limit + Abuse-Guard: reuse `src/lib/api-v1/write-abuse-guard.ts`.

### 4.4 `src/app/flow/[token]/FlowAiIntake.tsx` — UI (client)
Chat-Flaeche, **erbt das Variante-B-Theme** (gebrandet). Chips fuer kategorische Felder, Freitext-Eingabe, Foto-Upload, Fortschritts-Anzeige ("noch 3 Angaben"), und ein **"Lieber klassisch ausfuellen"**-Button → bestehender Wizard (`?fallback=1`). Streaming der Assistentin-Antwort.

### 4.5 Aktivierung (DB-Flag, konsistent mit interaction-flags-Audit)
Ein DB-getriebenes Flag entscheidet pro `/flow`-Session, ob der KI-Layer greift. **Default AUS.** Kandidaten-Gate: nur Variante-B-SVs (gebrandete, zahlende Zielgruppe) — Entscheid in §7. So risikoarm, messbar, jederzeit ohne Deploy abschaltbar.

## 5. Datenfluss (ein Turn)

1. Kunde tippt/waehlt Chip/laedt Foto → `POST /api/flow/[token]/intake`.
2. (Foto → `vision.ts` → Feld-Vorschlaege.)
3. `extract.ts`: State + Nachricht + Schema → Claude → Deltas + naechste Frage.
4. `guard.ts`: Deltas gegen Schema validieren + mergen.
5. Persistenz: Deltas via bestehendem `saveStep`/Lead-Update schreiben.
6. Response: naechste Frage / Chips / "fehlt noch: X, Y" → UI rendert.
7. Alle Pflichtfelder erfuellt → Uebergang zum **`zusammenfassung`**-Confirm (Kunde sieht extrahierte Fakten, korrigiert) → dann unveraendert `ort`/`termin`/`sa`/`account`.

## 6. Fehlerbehandlung & Degradation

- **KI-Ausfall** (API-Fehler/Timeout/Rate) → automatischer Fallback auf den klassischen Wizard-Step. Kein Sackgassen-Zustand; der Wizard ist die getestete Basis.
- **Extractor unsicher / mehrdeutig** → die KI fragt nach (kein stilles Raten).
- **Rechts-/Pflicht-/Auth-Felder** (SA, Konto) → nie per KI; bleiben Formular/Signatur.
- **Confirm-Gate:** Der `zusammenfassung`-Step ist der harte Gate vor Fortschritt — der Kunde bestaetigt/korrigiert die extrahierten Fakten, bevor es weitergeht. Schuetzt gegen Extraktions-Fehler in einem rechtlich sensiblen Erfassungs-Schritt.
- **Kosten-Backstop:** globaler Circuit-Breaker (reuse `write-abuse-guard`) + per-Token-Turn-Cap.

## 7. Offene Design-Entscheidungen (fuer die Review)

1. **KI-Scope der Steps:** nur `feststellung`, oder auch `quali`/`termin`/`werkstatt`? *Empfehlung:* `quali`+`feststellung` konversationell; `termin`/`werkstatt`/`gutachter` bleiben Picker (spaeter evtl. KI-assistiert).
2. **Modalitaet:** reiner Text-Chat vs. Chips-first mit Freitext-Option. *Empfehlung:* hybrid — Chips fuer kategorische Felder, Freitext+Extraktion fuer Beschreibungen, Foto-Vision fuer den Schaden.
3. **Rollout-Gate:** nur Variante B, oder global mit Fallback? *Empfehlung:* DB-Flag, Default AUS, erst B/Test (Muensterland), dann messen.
4. **Persona/Branding:** "Monika" vs. SV-Firmenname als Assistentin-Name. *Empfehlung:* SV-Firmenname bei Variante B (Whitelabel-Konsistenz), "Monika"/Claimondo sonst.
5. **Modell/Kosten:** `flow_intake`-Key — Sonnet 5 Default; Foto `vision_lead`. Turn-Cap + Circuit-Breaker.
6. **Transcript-Persistenz:** Dialog speichern (Audit/Verbesserung) oder ephemer? *Empfehlung:* ephemer starten (nur die extrahierten Felder persistieren); Transcript spaeter opt-in.

## 8. Testing

- **Pure Unit:** Schema-Ableitung, `guard.ts` (nur erlaubte Felder), Delta-Merge, Fallback-Trigger.
- **Extraction-Golden-Set:** Beispiel-Dialoge → erwartete Feld-Extraktion (Snapshot), pro Szenario.
- **E2E (Journey):** `/flow` mit KI-Layer AN → Dialog fuellt Felder → `zusammenfassung` korrekt → `sa`/`account` unveraendert erreichbar. Plus Fallback-Pfad (KI aus → Wizard).
- **Regel-4 (Prod-Smoke):** Test-Lead (`telefon = NULL`) durch den gebrandeten KI-Flow; SA/Konto verifizieren; 0 echte Kunden-Comms.

## 9. Abgrenzung zu bestehenden Bausteinen

- `melde-schaden` (MCP, Stage-1-Minimal, server-to-server) bleibt — die KI-Intake-Schicht ist Stage-2 im `/flow`.
- `anspruch-pruefen`-Embed (Foto → Vision → Wert-Schaetzung) bleibt ein separater Lead-Magnet; die Vision-Bausteine werden geteilt (`analyze-unfallfotos`), nicht dupliziert.
- Der bestehende `/flow`-Wizard bleibt vollstaendig erhalten als Fallback + Nicht-B-Pfad.

## 10. Rollout (Skizze — Detail in writing-plans)

1. Schema extrahieren + Wizard darauf umstellen (Refactor, kein Verhaltens-Delta) — Absicherung, dass eine Quelle existiert.
2. KI-Engine + Turn-Endpoint (hinter Flag AUS).
3. UI + Fallback.
4. Flag fuer Muensterland/Test AN → Regel-4 → messen.
5. Iteration Prompt/Extraction am Golden-Set; dann breiter fuer Variante B.
