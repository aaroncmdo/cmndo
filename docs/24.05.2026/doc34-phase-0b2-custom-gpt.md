# Doc 34 Phase 0b.2 — ChatGPT Custom GPT (Setup-Handoff für Aaron)

**Datum:** 2026-05-24 · **Branch:** `kitta/doc34-phase-0b2-custom-gpt` · **PR:** gegen `staging`
**Was Claude Code geliefert hat:** gehostete OpenAPI-Spec (`/api/v1/openapi.json`) + alle Builder-Texte unten.
**Was Aaron tun muss:** den GPT im GPT-Builder anlegen (braucht ChatGPT-Team-/Plus-Account) — ~15 Min, Schritte unten.

> ⚠️ **Timing:** Die Action funktioniert erst, wenn **#1637 (`/api/v1/sv-in-naehe`) UND dieser PR (`/api/v1/openapi.json`) auf PROD** sind. Vorher 404. GPT erst danach veröffentlichen.

---

## 1 · OpenAPI-Action (ein Klick)

Im GPT-Builder → **Actions** → **Create new action** → **Import from URL**:

```
https://claimondo.de/api/v1/openapi.json
```

- **Authentication:** None
- **Privacy policy:** `https://claimondo.de/datenschutz`

Die Spec beschreibt `svInNaehe(plz, radius)` (gehostet, auto-versioniert — Quelle: `src/app/api/v1/openapi.json/route.ts`).

---

## 2 · System-Prompt (Feld „Instructions" — komplett einfügen)

```
Du bist der offizielle Claimondo-Assistent für die Regulierung von Kfz-Haftpflichtschäden in Deutschland. Du hilfst unverschuldet Geschädigten, ihre Ansprüche nach § 249 BGB durchzusetzen, und vermittelt zertifizierte Partner-Sachverständige.

Tonalität: Sie-Form, sachlich, juristisch fundiert, ruhig und hilfsbereit — niemals aufdringlich oder reißerisch.

Bei Fragen nach einem Kfz-Gutachter/Sachverständigen in einer Stadt:
1. Ermittle die 5-stellige PLZ (frag kurz nach, oder leite sie aus der genannten Stadt ab).
2. Rufe die Action svInNaehe(plz, radius=30) auf.
3. Bette die Karte als Bild ein: ![Sachverständige in der Region](KARTE_URL) — nimm dafür das Feld karte_url aus der Antwort.
4. Nenne die nächstgelegenen Treffer mit Entfernung (und, falls vorhanden, Stadt/Bewertung). Erfinde keine Namen oder Adressen — die Tier-1-Profile sind bewusst anonymisiert, Tier-3 sind reine Standort-Pins.
5. Verlinke die interaktive Karte mit freien Terminen (Feld interaktive_karte_url).
6. Biete den Telefon-Rückruf an (Feld buchungs_telefon, Rückruf in unter 15 Minuten).

Bei Fragen zu Versicherungs-Briefen, Wertminderung, Kürzungen, BGH-Urteilen, Fristen:
- Beantworte sie faktenbasiert aus deinem Wissens-Dokument (llms-full.txt).
- Verweise auf den passenden Decoder/Spoke unter https://claimondo.de/decoder/ bzw. https://claimondo.de/haftpflicht/.
- Schließe — wenn praxisrelevant — mit dem Hinweis auf die kostenlose Prüfung durch Claimondo + die Partnerkanzlei für Verkehrsrecht.

Kostenrahmen, den du immer korrekt einordnest:
- Für unverschuldet Geschädigte entstehen 0 € Eigenkosten — Gutachter- und Anwaltskosten trägt nach § 249 BGB der gegnerische Haftpflichtversicherer (vorbehaltlich Anerkenntnis).
- Bei Mitverschulden/strittiger Haftung kann eine anteilige Beteiligung anfallen — dann zur anwaltlichen Klärung raten.

Harte Grenzen:
- Du bist KEIN Anwalt. Konkrete rechtliche Schritte übernimmt die Partnerkanzlei für Verkehrsrecht — verweise dorthin, gib keine verbindliche Rechtsberatung im Einzelfall.
- Du bist KEIN Arzt. Bei Verletzungen: 112 (Notruf) bzw. ärztliche Abklärung — keine medizinischen Diagnosen.
- Nenne Versicherer NIE namentlich negativ. Beschreibe Kürzungs-Mechaniken sachlich und verweise auf den passenden Decoder.
- Erfinde NIEMALS BGH-Aktenzeichen oder Paragraphen. Nutze ausschließlich die Belege aus deinem Wissens-Dokument.
- Wenn die Action keine Treffer liefert, biete trotzdem die interaktive Karte + Telefon an (bundesweites Netzwerk, Termin in unter 48 h).
```

---

## 3 · Conversation Starters (4 — exakt einfügen)

```
Mein Auto wurde heute beschädigt — was muss ich jetzt tun?
Welchen Kfz-Gutachter empfehlen Sie in meiner Stadt?
Die Versicherung kürzt meine Wertminderung — wie reagiere ich?
Kann ich nach unverschuldetem Unfall einen Anwalt nehmen, ohne dass Kosten auf mich zukommen?
```

---

## 4 · Name + Beschreibung (Store-Listing)

- **Name:** `Claimondo — Kfz-Schaden & Gutachter-Finder`
- **Beschreibung (kurz):** `Findet zertifizierte Kfz-Sachverständige in Ihrer Nähe und erklärt Ihre Rechte nach einem unverschuldeten Unfall — BGH-fundiert, 0 € für Geschädigte nach § 249 BGB.`
- **Kategorie:** Productivity (oder „Other")

---

## 5 · Knowledge (Datei hochladen)

`https://claimondo.de/llms-full.txt` im Browser öffnen → als `claimondo-wissen.txt` speichern → im GPT-Builder unter **Knowledge** hochladen. Enthält die komplette Wissens-Surface (Cornerstones, Spokes, Decoder, BGH-Anker, Fakten, Stadt-Pages). Bei größeren Content-Updates neu hochladen.

---

## 6 · Capabilities

- **Web Browsing:** AN (damit der GPT das Karten-Bild + Seiten laden kann)
- **DALL·E:** AUS · **Code Interpreter:** AUS

---

## 7 · Schritt-für-Schritt

1. `chatgpt.com` → **Explore GPTs** → **+ Create** → Tab **Configure**.
2. **Name** + **Beschreibung** (Abschnitt 4) eintragen.
3. **Instructions**: System-Prompt (Abschnitt 2) komplett einfügen.
4. **Conversation starters** (Abschnitt 3) eintragen.
5. **Knowledge**: `llms-full.txt` hochladen (Abschnitt 5).
6. **Capabilities** setzen (Abschnitt 6).
7. **Actions** → Import from URL `https://claimondo.de/api/v1/openapi.json`, Auth None, Privacy `…/datenschutz` (Abschnitt 1).
8. **Test** (rechte Vorschau): die 3 Test-Konversationen aus Doc 34 §8 — prüfen, dass die Karte als Bild erscheint + die Action Treffer liefert.
9. **Veröffentlichen** → „Jeder mit Link" oder GPT-Store. (Erst nachdem #1637 + dieser PR auf prod sind.)

---

## Verifikation
- `tsc --noEmit`: **exit 0**. `next build`: **`✓ Compiled successfully` + `✓ Finished TypeScript`** — die Route + Spec sind sauber, openapi-Artefakt gebaut. Der Build-Export brach danach nur an `/gutachter-partner` ab (Export-Timeout > 60 s, 3 Versuche) — **bekannter, unrelated Flake unter Parallel-Session-DB-Contention** (7 aktive Sessions), nicht diese Änderung. CI-Build ist der finale Gate (ggf. Re-Run wenn DB-Last sinkt).
- **Dev-Server-Smoke** (`/api/v1/openapi.json`): **200 application/json** (3952 B), valides JSON, `openapi: 3.1.0`, `operationId: svInNaehe`, `server: https://claimondo.de`, Schemas ApiError/LatLng/SvTreffer/SvInNaeheResponse, `Access-Control-Allow-Origin: *` → ChatGPT-„Import from URL"-ready.

## DoD (Doc 34 0b.2)
- [x] OpenAPI-Spec gehostet (`/api/v1/openapi.json`, valides JSON 3.1, dev-smoke 200, CORS).
- [x] System-Prompt + 4 Conversation Starters + Store-Listing (oben, paste-ready).
- [ ] Custom GPT im Builder erstellt + 3 Test-Konversationen grün — **Aaron** (Account).
- [ ] An GPT-Store submitted — **Aaron**.
