# J2 — Meldung über alle Kanäle

> Fundament A1 · Journey-Bibel. **Soll-Ablauf aus Nutzersicht** (Soll ≠ Ist — Abweichungen unter „⚠ IST weicht ab").
> Basis: Entry-Point-Register A4 (`docs/fundament/entry-points.md`, PR #4816) + Notification-Matrix A3 (#4823).

**Rollen:** Melder (Kunde / Unfallgegner / Flottenmanager / Makler / Dispatcher / Admin) · System · Dispatch · (später) SV.
**Vorbedingungen:** keine — ein Meldeweg ist per Definition der Einstieg, oft **ohne Account** (Magic-Link-first, Verfassung §6).
**Startpunkt(e):** jeder der ~15 Meldewege aus A4 — Kunde-Wizard, Gegner-Schadenkarte (QR/NFC), Embed-Gutachter-Finder, Embed-Werkstatt-Finder, `POST /api/v1/melde-schaden`, Public-Rückruf, Makler-Anfrage, Flotte-Schaden, FlowLink-Portal, Dispatch-/Admin-manuell, Spontan-Termin, Telefon-Inbound (Matelso/Aircall).

## Ablauf (Soll — kanonisch, kanalunabhängig)

Das Soll ist **ein Intake mit garantierten Nachwirkungen** (Verfassung §5, → C2 `createCase`): egal über welchen Kanal
gemeldet wird, dieselben sechs Dinge passieren.

1. **Melder gibt die Schadenmeldung ab** (Formular/Wizard/API/Anruf/QR-Tap) → System:
   - **legt den Fall an** — als **Lead** (Muster *lead-first*: Claim entsteht später bei /flow) oder direkt als **Claim** (Muster *Direkt-Claim*: Gegner-Flow, Admin-manuell). Status-Cursor initial `ersterfassung` (bzw. `sv-termin`, wenn schon ein Termin gebucht wurde).
   - **legt die Pflichtdok-Slots an** (`pflichtdokumente` je Szenario: Haftpflicht = Vollmacht/Gutachten/Versicherer; Reduced-Repair = nur Fahrzeugschein) — damit ab Sekunde 1 klar ist, was fehlt.
   - **erzeugt den FlowLink** (kanonischer Magic-Link `flow_links`) — der Weiterführungs-Anker für den account-losen Melder.
   - **schickt die Erstnotification** — an den **Melder/Kunden** (FlowLink per WhatsApp→SMS→Email) und an die **zuständige interne Rolle** (Dispatch-Sichtbarkeit / Team-Alert).
   - **dedupliziert gegen Doppelmeldung** — ein zweiter Submit desselben Schadens (gleiches Fahrzeug+Telefon, kurzes Fenster) erzeugt **keinen** zweiten Fall, sondern kehrt idempotent zum ersten zurück.
   - **reserviert** — falls im selben Schritt ein Termin gewählt wurde — den SV-Slot **soft** (kein Hard-Block, der die Meldung sprengt).
   - **Screen-Zustand:** Melder sieht eine Bestätigungs-/Danke-Seite mit dem Weiter-CTA (FlowLink); Dispatch sieht den neuen Lead/Claim in der Liste.
   - **erzeugt die Unfallskizze**, sobald ein Unfallhergang vorliegt (im ersten Save oder später in der Flow-Feststellung) — automatisch, ohne dass jemand sie anstoßen muss. Sie ist eine **Zugabe**: sie darf die Meldung nie verzögern oder gefährden (fire-and-forget), und ihr Ausbleiben blockiert nichts.
     - **Soll-Delta 16.08. (D2):** Die Skizze muss **dort landen, wo der Melder sie sieht** — also auch am **Claim**, nicht nur am Lead. Weil der Generator ein Sprachmodell aufruft (5–15 s), während manche Kanäle Lead und Claim in derselben Sekunde anlegen, kommt sie regelmäßig **nach** dem Claim zustande; ein reiner Convert-Zeitpunkt-Kopiervorgang verfehlt sie.
     - **Der Melder sieht sie als Entwurf und kann widersprechen.** Sie wird später Teil des Gutachtens und geht an die gegnerische Versicherung — eine falsche Hergangsdarstellung gefährdet seinen Anspruch, und er ist die einzige Instanz, die die Richtigkeit beurteilen kann. Der Widerspruch ist **eine Textkorrektur** („der Gegner kam von rechts"), aus der die Skizze neu entsteht; der ursprünglich erfasste Hergang bleibt unangetastet (er ist seine Aussage zum Meldezeitpunkt). Parallel entsteht eine Dispatch-Aufgabe.
     - ⚠ **Nicht an die interne Freigabe knüpfen:** `unfallskizze_bestaetigt` heißt „Mitarbeiter hat freigegeben" — ein manueller Schritt, der auf prod noch nie erfolgt ist. Eine Anzeige daran zu hängen hieße, sie tot zu bauen.
2. **Melder öffnet den FlowLink** (`/flow/[token]`) → macht ohne Account weiter (Feststellung/Schaden, Qualifizierung Abrechnungsweg, ggf. Gutachter-Termin, SA/Vollmacht). Übergang in **J1** (Haftpflicht-Standardfall) bzw. den Kasko/Selbstzahler-Weg (**J5**).
3. **Bei Konversion** (SA unterschrieben / Direkt-Reparatur-Claim) → **ein Claim** ist der SSoT; alle weiteren Journeys (J3 Unterschriften, J4 Reparatur, J6 Kanzlei, J9 Honorar) docken hier an.

## Varianten / Abzweige (die Kanäle)

- **Kunde-Wizard** (`/kunde/schaden-melden`, eingeloggt) → **ab C2a über `createCase`** (mode='direct-claim') = Lead + FlowLink(immer) + Server-Dedup + Wrapper `convertLeadToFall` (Pflichtdok + Kunde-WA + KB). Der erste createCase-Adapter.
- **Gegner-Schadenkarte** (`/schaden/[token]`, QR/NFC, anonym) → Direkt-Claim; der **Gegner** (nicht der Geschädigte) meldet; Magic-Link geht an den Gegner (Airdrop), Flottenmanager wird per WA informiert.
- **Embed-Finder** (Gutachter/Werkstatt) + **`melde-schaden`-API** (MCP) → lead-first: Anfrage (`gutachter_finder_anfragen`) + Lead + FlowLink, Claim erst bei /flow.
- **Public-Rückruf / Makler-Anfrage** → lead-first, telefonischer Zweig (admin_termine-Rückruf statt FlowLink) oder FlowLink-Zweig.
- **Flotte-Schaden** (FM meldet für ein Firmenfahrzeug) → lead-first, Fahrzeug vorbefüllt.
- **Telefon-Inbound** (Matelso/Aircall) → Lead-Stub bei unbekannter Nummer; Dispatch qualifiziert nach.
- **Dispatch-/Admin-manuell** → interner Einstieg (Telefon/E-Mail reingekommen); Admin-manuell konvertiert sofort zu Claim.

## Fehlerfälle und ihr Soll-Verhalten

- **Doppel-Submit** (Netz-Retry, Doppelklick, mehrfacher Anruf) → **idempotent**: ein Fall, keine Duplikate; keine zweite Erstnotification.
- **FlowLink-Zustellung schlägt fehl** (kein WhatsApp, Nummer ungültig) → Kaskade WA→SMS→Email; scheitert alles → **sichtbarer Dispatch-Task** „Melder nicht erreichbar" (kein stilles Sterben, Verfassung §8).
- **Kein passender SV** (Reservierung im selben Schritt) → weicher Hold + Dispatch-Task, Meldung bleibt bestehen (nie Hard-Fail).
- **Unqualifizierte Meldung** (Schuldfrage offen) → Fall wird angelegt, `/flow` fragt den Abrechnungsweg nach (kein stiller Lead-Tod).

## ⚠ IST weicht ab (aus A4, mit Fundort)

1. **Nachwirkungen NICHT zentral garantiert** — sie liegen verteilt auf `createLead` / `convertLeadToClaim`-Kern / `convertLeadToFall`-Wrapper / `create-pflicht.ts` / `ensureCanonicalFlowLink`; **kein** Meldeweg bekommt automatisch alle sechs. → das ist der C2-Auftrag. **Teilfortschritt:** der Kern legt seit C2b-1 (11.08.) die **Pflichtdok-Slots** selbst an (s. #2); FlowLink bleibt Sache von `createCase`/`ensureCanonicalFlowLinkForLead`. **C2b-Rest (11.08.):** jetzt laufen **drei** Meldewege über `createCase` — Kunde-Wizard A-1 (direct-claim) · **Embed-Werkstatt-Finder B-1** · **Aircall-Inbound D-4b** (beide lead-first). Für die public-Eingänge wurde `createCase.triggerByUserId` optional (kein eingeloggter User; im direct-claim-Zweig bleibt er per Guard Pflicht).
2. ✅ **GESCHLOSSEN (C2b-1, 11.08.):** ~~Gegner-Flow/Schadenkarte konvertiert zu Claim OHNE Pflichtdok-Slots~~ — **Soll ab jetzt:** *jeder* Claim bekommt bei der Konversion seine Pflichtdok-Slots, unabhängig vom Meldeweg. Umsetzung: `convertLeadToClaim` (der **Kern**, den die Direkt-Claim-Wege wie `schaden/[token]/actions.ts` direkt rufen) legt die Slots selbst an — statt nur der Wrapper `convertLeadToFall`. Der Helper ist pro-Slot-idempotent (CMM-23), der Wrapper-Aufruf bleibt damit ein wirkungsloser No-op. **Bewusst NICHT mitgezogen:** die `fall_eroeffnet`-Erstnotification bleibt im Wrapper — beim Gegner-Flow meldet der *Gegner*, der Geschädigte darf davon nicht ungefragt angeschrieben werden (Journey-Rolle „Melder ≠ Geschädigter").
3. **Kein FlowLink im Kern** — die *Direkt-Claim*-Meldewege erzeugen keinen kanonischen `flow_links`; der Gegner-Flow behilft sich mit einem Airdrop-Magic-Link.
4. **Server-Dedup fehlt** bei Kunde-Wizard (`SchadenMeldenWizard.tsx`, nur Client-Guard — seit C2a serverseitig via `createCase`-Dedup abgedeckt) und Embed-Gutachter-Finder → Doppel-Submit = 2 Fälle. **Aircall** schwächer als Matelso (kein `external_call_id`-Vorabgate) → Doppel-Lead-Vektor. ⚠ **Bleibt nach C2b offen:** der generische `createCase`-Dedup-Key verlangt Person **+ Kennzeichen** (`dedupKeyIsUsable`) — Aircall (nur Telefon) und der Werkstatt-Finder (erhebt kein Kennzeichen) erfüllen ihn nicht. Aircall deckt seinen Fall weiterhin über den **präziseren** Telefon-Match `matchInboundToFall` ab; das `external_call_id`-Vorabgate fehlt weiter. Der Werkstatt-Finder gibt den Key bereits mit → er greift automatisch, sobald der Finder ein Kennzeichen erhebt.
5. **Kunde-Erstnotification fehlt** bei Werkstatt-Finder, Flotte-Schaden, Admin-manuell (nur Client-Redirect bzw. nur Staff-Alert). ⚠ **Von C2b NICHT geschlossen:** `createCase` garantiert im `lead-first`-Modus Lead + FlowLink, aber **keine** Erstnotification (die hängt am `convertLeadToFall`-Wrapper, also am direct-claim-Weg). Der Werkstatt-Finder bekommt durch C2b also den garantierten FlowLink, nicht die Erstnotification — die bleibt offen (eigene Tranche).

**Soll-Delta C2b (11.08., neu):** Ein **Telefon-Inbound** (Aircall, unbekannte Nummer) erzeugt ab jetzt **immer einen FlowLink** zum Lead-Stub. Vorher entstand der Anrufer-Lead ohne jeden Kunde-Kanal: der Dispatcher hatte nichts zum Verschicken, der Anrufer keinen Selbstbedienungs-Weg. **Soll:** Dispatch sieht den Lead **mit** verschickbarem FlowLink; der Anrufer kann darüber ohne Account weitermachen (→ Schritt 2 des kanonischen Ablaufs).
6. **Positiv:** der historische `melde-schaden`-Hard-Reservierungs-Bug ist **behoben** (`route.ts:234-258`).

## ✅ C2-Fortschritt (createCase)

- **C2a (04.08., PR #4986):** der **Kunde-Wizard (A-1)** läuft jetzt über `createCase` (`src/lib/intake/create-case.ts`). Damit sind für A-1 die IST-Abweichungen **#3 (kein FlowLink im Direkt-Claim)** und **#4 (kein Server-Dedup)** geschlossen: `createCase` erzeugt den FlowLink IMMER + dedupliziert server-seitig (Person telefon|email + Kennzeichen + 10-min-Fenster → Doppel-Submit kehrt idempotent zum ersten Fall zurück, kein zweiter). Erstnotification bleibt der Wrapper-`sendFallCommunication` (bis C3-Outbox). Die übrigen Kanäle (Embed B-1, Gegner A-3, Aircall D-4b) folgen als **C2b+** (nach Settle der aar-956-Intake-Lane). Beweis = Regel-4-Prod-Smoke (Doppel-Submit → 1 Fall), deploy-gated.

## Offene Fragen an Aaron (max. 5)

1. **Kunde-Erstnotification-Garantie:** soll JEDER Meldeweg garantiert einen aktiven Kanal (WA/Email) an den Melder auslösen, oder ist bei Werkstatt-Finder/Flotte der reine Client-Redirect gewollt?
2. **Gegner-Flow ohne Pflichtdok:** bewusst (der Gegner meldet, der Pflichtdok-Katalog gilt dem Geschädigten) oder soll `createCase` es garantieren?
3. **Marketing-Mini-Wizard** (`/schaden-melden` im `claimondo-marketing/`-Build) — als J2-Kanal mitzählen (eigener Build außerhalb `src/`)?
