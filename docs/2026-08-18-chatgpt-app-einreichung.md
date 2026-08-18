# ChatGPT-Plugin-/Apps-Directory — Einreichung vorbereitet

**Stand 18.08.2026.** Schliesst **Baustein 6** aus
`docs/superpowers/specs/2026-06-18-mcp-active-in-chat-design.md` auf — den letzten offenen
Baustein jenes Designs („Formale Listings (Aaron/Account)", seit Juni offen).

---

## 0 · Warum das der Engpass ist — und warum nicht die API

Die haeufige Annahme lautet: „Wir muessen die API oeffentlich verfuegbar machen, damit der
Kunde aus dem Chat buchen kann." **Die API ist seit Langem oeffentlich** — gemessen am
18.08.2026:

```
curl -H "Origin: https://chat.openai.com" .../api/v1/gutachter-termine?plz=50670
  HTTP/1.1 200 OK
  access-control-allow-origin: *          <- kein Key, kein Origin-Check
```

`openapi.json` beschreibt **alle 7 Endpunkte** inklusive der POST-Buchung, der MCP-Server
`https://mcp.claimondo.de/mcp` antwortet mit **7 Tools**. Die Bausteine 1–5 und 8–10 des
Designs sind live.

**Und es funktioniert bereits im echten Betrieb.** In `gutachter_finder_anfragen` mit
`source='mcp'` (READ-only gezaehlt, ohne Klartext-PII):

| Datum | Name | SV gewaehlt | Termin gebucht | Consent |
|---|---|---|---|---|
| 20.07. | echt | – | – | ✓ |
| **25.07.** | **echt** | **✓** | **✓** | ✓ |
| **26.07.** | **echt** | **✓** | **✓** | ✓ |
| **26.07.** | **echt** | **✓** | **✓** | ✓ |
| 27.07. | Testname | – | – | ✓ |
| 18.08. | Testname | – | – | ✓ |

> **Drei echte Menschen haben bereits per Chat einen Gutachter-Termin gebucht** — ohne
> Connector, ohne Installation. Der Weg trägt.

⚠ Seit dem **27.07. keine echte Chat-Anfrage mehr** (nur zwei Tests). Bei n=4 ist das
statistisch nichts, aber es ist der Grund, warum Discovery nicht dem Zufall ueberlassen
bleiben sollte.

**Was fehlt, ist nicht Offenheit, sondern Auffindbarkeit.** Plain ChatGPT kann per Browsing
GET-URLs abrufen (so kamen die obigen Anfragen zustande — dokumentiert in den Server-Logs
vom 18.06.: „ChatGPT-User ruft /api/v1 live an, anonym, 7×"). Einen **POST** — also die
eigentliche Buchung — kann Browsing nicht. Damit ChatGPT die Buchung **von sich aus
anbietet**, braucht es die Directory-Listung. Genau das sagt auch das Design unter
„Out of Scope": *„Kein ‚automatisch in JEDEM ChatGPT-Fenster ohne Discovery' — das erfordert
OpenAI-Apps-Directory-Approval (Baustein 6)."*

---

## 1 · Was in diesem PR gebaut wurde

**Der Verifikations-Endpunkt** — die einzige Code-Voraussetzung der Einreichung:

* `claimondo-marketing/app/api/openai-apps-challenge/route.ts`
* Rewrite in `next.config.ts`: `/.well-known/openai-apps-challenge` → diese Route
  (Rewrite, **kein** Redirect — OpenAI erwartet den Token als Body dieser URL; ein 30x
  bricht die Pruefung)
* Antwortet mit **nacktem `text/plain`** — die Spec verlangt ausdruecklich: *„Do not return
  JSON, a list of tokens, or multiple tokens from the same URL."*
* Token kommt aus `OPENAI_APPS_CHALLENGE_TOKEN`. **Ohne Token bewusst 404** statt leerem
  200 — ein leerer Body laesst die Verifikation fehlschlagen und sieht in der Fehlersuche
  aus wie ein Serverfehler.

**Betrieb:** Token bei OpenAI abholen → auf dem VPS in
`/etc/claimondo-marketing/.env.local` eintragen → Prozess neu starten. **Kein Code-Deploy.**

### ⚠ Dabei gefunden: der Middleware-Matcher schluckte `/.well-known/*`

Beim Verhaltenstest antwortete `/.well-known/openai-apps-challenge` **404 — obwohl die Route
selbst sauber 200 und den exakten Token lieferte** (`/api/openai-apps-challenge` direkt
aufgerufen). Ursache war der i18n-Middleware-Matcher:

```
'/((?!_next/|api/|opengraph-image|.*\.[^/]+$).*)'
```

Die Datei-Endungs-Ausnahme `.*\.[^/]+$` greift fuer diesen Pfad **nicht**: der einzige Punkt
steht in `.well-known` selbst, danach folgt noch ein `/`, also matcht `[^/]+$` nicht bis zum
Ende. Der Pfad lief damit ins Locale-Routing und endete im 404. `\\.well-known/` ist jetzt
explizit ausgenommen — das gilt auch fuer kuenftige Endpunkte dort (`security.txt`,
`apple-app-site-association`), die alle protokoll-fest sind und **nie** ein Locale-Prefix
bekommen duerfen.

⭐ **Lehre:** `npm run build` war gruen, `tsc` war gruen, und die Route stand im
Build-Manifest (`ƒ /api/openai-apps-challenge`) — trotzdem war sie unter ihrer echten URL
nicht erreichbar. Nur der Request gegen den laufenden Server zeigt das. Und ein 404 im
Negativ-Test („ohne Token muss 404 kommen") sah **identisch** aus wie der Fehlerfall — erst
der Positiv-Test mit gesetztem Token deckte es auf.

---

## 2 · Einreichungs-Formular — vorausgefuellt

| Feld | Wert |
|---|---|
| **Name** | `Claimondo` (kurz; Alternative `Claimondo Kfz-Gutachter`, 23 Zeichen) |
| **Kategorie** | Automotive / Local Services |
| **Website** | `https://claimondo.de` |
| **Support-URL** | `https://claimondo.de/beratung-anfragen` |
| **Privacy Policy** | `https://claimondo.de/datenschutz` |
| **Terms** | `https://claimondo.de/nutzungsbedingungen` |
| **MCP-Server** | `https://mcp.claimondo.de/mcp` (Streamable HTTP) |
| **Developer** | Claimondo GmbH i.G., Hansaring 10, 50670 Köln — ⚠ siehe §3 |

**Kurzbeschreibung (Vorschlag):**

> Kfz-Gutachter in Deutschland finden und Termin direkt buchen — nach einem Unfall
> kostenfrei für unverschuldet Geschädigte.

**Langbeschreibung (Vorschlag):**

> Claimondo vermittelt nach einem Kfz-Schaden zertifizierte, unabhängige
> Kfz-Sachverständige in Deutschland und reserviert direkt einen Besichtigungstermin —
> in der Regel innerhalb von 48 Stunden. Für unverschuldet Geschädigte entstehen 0 €
> Eigenkosten: Die gegnerische Haftpflichtversicherung trägt die Gutachterkosten nach
> § 249 BGB (vorbehaltlich Anerkenntnis). Die Tools finden Sachverständige im Umkreis
> einer Postleitzahl, zeigen freie Termine, melden den Schaden mit Terminreservierung
> an und ordnen Ansprüche wie Wertminderung, Nutzungsausfall und Mietwagen ein.
> Zusätzlich lassen sich Schreiben der gegnerischen Versicherung entschlüsseln.
> Vermittlung und allgemeine Information — keine Rechtsberatung.

**Demo-Zugang:** Nicht erforderlich. Alle Tools laufen **anonym ohne Auth** — die Spec-Auflage
„Demo-Credentials ohne MFA/SMS/E-Mail-Bestätigung" ist damit erfuellt, weil es gar keinen
Login gibt. Im Formular entsprechend vermerken.

**Test-Hinweis fuer die Reviewer (wichtig, siehe §3):** Als PLZ **50670 (Köln)**, 40213
(Düsseldorf) oder 42103 (Wuppertal) verwenden — dort liegen buchbare Sachverständige.
Andere Grossstaedte liefern derzeit korrekt eine leere Trefferliste; ein Reviewer, der
Berlin testet, sieht sonst ein „funktioniert nicht".

---

## 3 · Drei Punkte, die die Einreichung kippen koennen

**a) Developer-Verifikation bei „GmbH i.G."** — OpenAI verlangt eine verifizierte Identitaet
(Person oder Unternehmen). Laut Impressum ist die Gesellschaft **in Gruendung**,
Handelsregister „Eintragung in Vorbereitung", USt-ID „In Beantragung". Eine
Unternehmens-Verifikation ohne HR-Eintrag schlaegt typischerweise fehl. **Empfehlung:**
zunaechst als **verifizierte Einzelperson** einreichen (Aaron Sprafke) und nach
HR-Eintragung auf die Gesellschaft umstellen.

**b) Icon-Format** — vorhanden sind `public/claimondo-icon.svg`, `public/brand/logo-mark.svg`
und `public/brand/logo-full.png`. Directory-Listings erwarten ueblicherweise ein **quadratisches
PNG** (Richtwert 64×64, unter 5 KB). Aus dem vorhandenen SVG schnell erzeugbar — vor der
Einreichung pruefen, ob die Marke in 64 px noch lesbar ist (die Wortmarke ist es nicht, die
Bildmarke `logo-mark.svg` schon).

**c) Der Deckel bleibt die Abdeckung** — gemessen ueber `/api/v1/gutachter-termine`:

| Stadt | buchbare Gutachter |
|---|---|
| Köln, Wuppertal | 2 |
| Düsseldorf | 1 |
| Dortmund, Bonn, Essen, Berlin, Hamburg, München, Stuttgart, Frankfurt, Leipzig | **0** |

**3 von 12 Grossstaedten.** Unabhaengig nachgemessen stehen hinter den 158 Stadtseiten
**neun echte verifizierte Sachverstaendige**; 101 Seiten (64 %) haben keinen einzigen im
Einzugsgebiet ([[audit-stadtseiten-substanz-9-svs-tragen-158-seiten]]). Eine gelistete App,
die in zwei Dritteln des Landes „keine Gutachter gefunden" antwortet, erzeugt schlechte
Ersteindruecke und Reviews. **Die Listung lohnt sich am meisten, wenn parallel SVs im
Ruhrgebiet gewonnen werden** — jeder neue SV in Dortmund oder Bochum macht sofort mehrere
bestehende Flaechen substanziell.

---

## 4 · Reihenfolge

1. **Jetzt:** PR mergen + deployen → Endpunkt ist erreichbar (antwortet 404, bis der Token gesetzt ist).
2. **Aaron:** Einreichung bei OpenAI starten → Token erhalten → ENV setzen → Prozess neu starten.
3. **Verifizieren:** `curl https://claimondo.de/.well-known/openai-apps-challenge` muss **exakt**
   den Token als nackten Text liefern (kein JSON, kein Trailing-Content).
4. **Parallel, wichtiger:** SV-Akquise Ruhrgebiet — sonst bleibt die Reichweite auf das
   Rheinland begrenzt.
5. **Danach:** Anthropic-Connector-Directory — derselbe Baustein 6, zweiter Kanal.

---

## 5 · Sofort-Hebel nebenbei: der MCP-Registry-Eintrag ist veraltet

`de.claimondo/sv-finder` **ist** in der offiziellen MCP-Registry gelistet und aktiv —
aber der Eintrag stammt vom **27.05.2026** und wurde seither **nie aktualisiert**:

```
Name        : de.claimondo/sv-finder          Version : 1.0.0
Beschreibung: "Findet zertifizierte Kfz-Sachverständige im Umkreis einer
               deutschen PLZ — anonym, read-only."
Remote      : https://mcp.claimondo.de/mcp    Updated : 2026-05-27
```

Der Server kann seit Juni **sieben** Tools, darunter die **Terminbuchung**
(`claimondo_melde_schaden`), Anspruchsprüfung und den Versicherer-Brief-Decoder. Der
Registry-Eintrag verkauft ihn als reinen Read-only-Finder — wer dort nach „Termin buchen"
sucht, findet Claimondo nicht.

**Zu tun** (im MCP-Server-Repo, das den Eintrag publiziert): Version hochziehen und
Beschreibung auf den echten Funktionsumfang bringen, z. B.:

> Findet zertifizierte Kfz-Sachverständige in Deutschland, zeigt freie Termine und
> reserviert einen Besichtigungstermin. Prüft Schadensersatz-Ansprüche und entschlüsselt
> Schreiben der gegnerischen Versicherung. Anonym, ohne Anmeldung.

Billigster Hebel des ganzen Pakets: eine Textänderung, kein Code, kein Review durch Dritte.

---

*Belege dieser Analyse: GEO-Baseline `docs/2026-08-18-geo-baseline-claimondo.md`;
Design `docs/superpowers/specs/2026-06-18-mcp-active-in-chat-design.md`;
Live-Messungen 18.08.2026 gegen prod (API, MCP-Handshake, `gutachter_finder_anfragen`).*
