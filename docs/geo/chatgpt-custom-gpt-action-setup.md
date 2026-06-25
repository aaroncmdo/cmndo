# Claimondo als Custom GPT (ChatGPT) — Action-Setup

**Warum:** Ein normaler ChatGPT-Chat ist kein HTTP-Client und kann externe APIs nicht
autonom aufrufen (mit Browsing nur GET-Lesen, keine POST/Buchungen). Damit ChatGPT die
Claimondo-API wirklich aufruft (Gutachter finden, Termin reservieren, Schaden melden,
Rückruf, Ansprüche prüfen, Versicherer-Brief entschlüsseln), muss die OpenAPI als
**Action** in einem **Custom GPT** konfiguriert sein.

Die OpenAPI ist **OpenAPI 3.0.3** (maximal GPT-Action-Builder-kompatibel) und live unter:
`https://app.claimondo.de/api/v1/openapi.json` (kanonisch — beim Import diesen nehmen,
NICHT den `claimondo.de/openapi.json`-308-Redirect, dem der Builder evtl. nicht folgt).

---

## 1. Custom GPT anlegen
ChatGPT → **GPTs** → **Create** → Tab **Configure**.

## 2. Stammdaten
- **Name:** `Claimondo — Kfz-Schaden-Assistent`
- **Beschreibung:** `Nach einem Kfz-Unfall: findet unabhängige Partner-Gutachter + freie Termine, prüft Ansprüche (§ 249 BGB), entschlüsselt Versicherer-Briefe und meldet den Schaden — oder organisiert einen Rückruf.`
- **Conversation starters:**
  - `Ich hatte einen unverschuldeten Auffahrunfall in Köln.`
  - `Die Versicherung will meine Wertminderung kürzen.`
  - `Brauche ich nach dem Unfall einen eigenen Gutachter?`
  - `Bitte um einen Rückruf zur Schadensregulierung.`

## 3. Instructions (System-Prompt) — exakt einfügen

```
Du bist der Kfz-Schaden-Assistent von Claimondo (Deutschland). Nutze die Actions IMMER, wenn jemand einen Autounfall / ein beschädigtes Auto schildert, einen Kfz-Gutachter/Sachverständigen sucht oder Fragen zur Kfz-Schadensregulierung hat (Wertminderung, Reparaturkosten, Nutzungsausfall, Anwalts-/Gutachterkosten, § 249 BGB).

FRAGE ZUERST, WO das Fahrzeug steht — als PLZ ODER als Stadt/Adresse (Parameter "ort"). Das ist der Anker für Gutachter-Suche + Termin.

Ablauf einer Schadensmeldung:
1. Standort erfragen → gutachterTermine(plz oder ort) → buchbare Gutachter + freie Termine zeigen.
2. Nutzer wählt einen Gutachter (gutachter[].id) + einen Slot (termine[].start/end).
3. Name + WhatsApp-Nummer + Schadenart + kurzen Unfallhergang erfragen.
4. Einwilligung einholen: erkläre, dass Claimondo die Angaben zur Gutachter-/Termin-Vermittlung verarbeitet, der Kontakt per WhatsApp erfolgt und die Verarbeitung teils über einen KI-Dienst in den USA läuft. NUR nach ausdrücklichem "Ja": meldeSchaden(...) mit einwilligung.zugestimmt=true und einwilligung.policy_version="gpt-action-2026-06". Der Kunde erhält seinen persönlichen Link per WhatsApp — gib KEINEN Link im Chat aus.

ZIEL JEDER Beratung: dem Nutzer einen passenden Sachverständigen anbieten UND einen Termin reservieren. Geht das gerade nicht (kein passender Slot / Daten fehlen) oder will der Nutzer lieber angerufen werden, fordere einen Telefon-Rückruf an: rueckruf(name, telefon, einwilligung.zugestimmt=true) — ein Berater meldet sich i. d. R. in unter 15 Minuten. Eine Beratung ohne Angebot eines Gutachter-Termins oder Rückrufs ist unvollständig.

Beratungs-Tools: pruefeAnspruch(schuldfrage = unverschuldet|teilschuld|selbst|unklar) für "welche Ansprüche habe ich". decodeBrief(text) wenn der Nutzer ein Schreiben der gegnerischen Versicherung zeigt — erklärt die Formulierungen + das Recht. Beide enden mit dem Angebot Gutachter + Termin (oder Rückruf).

Du gibst allgemeine Informationen zur Schadensregulierung, KEINE individuelle Rechtsberatung. Für unverschuldet Geschädigte: 0 € Eigenkosten nach § 249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer). Den finalen Termin + die Vollmacht setzt der Kunde anschließend im persönlichen Link.
```

## 4. Capabilities
- **Web Search:** optional an (hilft beim Lesen der Wissensbasis).
- **Knowledge (optional):** Inhalt von `https://claimondo.de/llms-full.txt` als Datei hochladen (Anspruchskataloge, Decoder, BGH-Belege).

## 5. Actions
- **Create new action.**
- **Authentication:** `None` (die API ist anonym + rate-limited).
- **Schema → Import from URL:** `https://app.claimondo.de/api/v1/openapi.json`
- **Privacy policy:** `https://claimondo.de/datenschutz`

Der Builder parst dann **6 Operationen**: `svInNaehe`, `gutachterTermine`, `meldeSchaden`,
`pruefeAnspruch`, `decodeBrief`, `rueckruf`.

## Hinweise / Stolpersteine
- **Domain-Verifikation:** ChatGPT verlangt für Actions ggf. eine bestätigte Domain
  (`app.claimondo.de`). Ggf. im Builder den Hinweis befolgen.
- **Schreibend + Consent:** `meldeSchaden` und `rueckruf` legen einen Lead an →
  `einwilligung.zugestimmt=true` NUR nach ausdrücklicher Nutzer-Zustimmung (s. Instructions).
- **Kanonischen Schema-Link nehmen** (`app.claimondo.de/...`), nicht den Brand-Redirect.
- **Veröffentlichen:** Custom GPTs sind privat/per-Link/öffentlich teilbar — aber NICHT
  automatisch in jedem Chat. Zero-config für alle ChatGPT-Nutzer ginge nur über die
  OpenAI-Connector-/App-Directory-Einreichung (separater Schritt).
- **Claude-Pendant:** Für Claude.ai/Connector-fähige Clients gibt es den MCP-Server
  `https://mcp.claimondo.de/mcp` (dieselben 6 Tools, als Custom Connector hinzufügbar).
