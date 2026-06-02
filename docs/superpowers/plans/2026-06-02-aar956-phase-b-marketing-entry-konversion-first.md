# AAR-956 Phase B — Marketing-Eintritt: konversion-first + EIN kanonischer FlowLink

**Datum:** 2026-06-02 · **Branch:** `kitta/marketing-finder-livebuchung` · **Ticket:** AAR-956
**Kanonische Quelle:** `docs/superpowers/specs/2026-06-02-anfrage-lead-flowlink-vereinheitlichung.md` (stream8b)
**Status:** PLAN — nicht implementiert. Hängt an Phase A. Fork-Entscheidung offen (§3).

## 1 · Ziel (Invariante AAR-956 + §6=Auto)

Der Marketing-Finder-Eintritt (`starteLiveBuchung`) erfüllt die Invariante:
**Absenden → erst Lead (`gutachter_finder_anfragen` → `leads`, dispatcher-sichtbar) → dann der EINE
kanonische FlowLink (`flow_links.lead_id` → `/flow/[token]`).** Kein `/anfrage`-`self_service_token` mehr.
§6 = Auto: feuert ohne Dispatcher-Klick; der Dispatcher **verfolgt** in `/dispatch/leads`.

## 2 · Constraints (verifiziert)

1. **Cross-App-Grenze.** `starteLiveBuchung` lebt in `claimondo-marketing/` und kann `src/lib/*`
   (`createLead`, `flow_links`, `sendFlowLinkMultiChannel`, `matchAndSlots`) **nicht** importieren.
   → Konversion + FlowLink-Mint sind **Main-App-Operationen**. Der Marketing-Front macht nur:
   Anfrage anlegen + an die Main-App übergeben (Redirect/Token).
2. **Abhängig von Phase A.** Es braucht einen **anon-fähigen** kanonischen Issue-Pfad
   (createLead [Dispatcher round-robin] + `flow_links`-mint + Versand) — heute ist
   `sendFlowLinkMultiChannel` dispatcher-`auth.getUser()`-gated. Das ist Phase A (stream8b).
3. **`/flow` erwartet einen reservierten Termin** (Schritt „gutachter") + qualifizierten Lead —
   ein frischer Self-Service-Lead hat weder Quali (Schuldfrage) noch Slot. Diese Lücke muss der
   unified Flow schließen (§3).

## 3 · Design-Fork: wo leben Quali (Schuldfrage) + Slot-Picker?

- **B-opt1 — Relocate in den Marketing-Wizard.** Quali + Slot wandern VOR das Absenden.
  Absenden → createLead + Termin reservieren + `/flow`-Link. `/flow` bleibt SA+Konto.
  ‑ Großer Marketing-Wizard; `/flow` unverändert.
- **B-opt2 — Adaptive `/flow` (EMPFOHLEN).** Marketing-Wizard bleibt schlank
  (Schaden + Kontakt + Besichtigungsort). Absenden → createLead + `/flow`-Link **sofort**.
  **`/flow` wird adaptiv:** hat der Lead keinen reservierten Termin/keine Quali → zeigt
  Quali + Slot-Picker (wiederverwendet die bestehenden `/anfrage`-Komponenten
  `SelbstQualiClient` + `TerminBuchungClient`) **vor** dem „gutachter"-Schritt → dann SA + Konto.
  EIN `/flow`-Wizard, der **beide** Eintritte bedient (dispatcher-vorqualifiziert ODER self-service-roh).
  Am nächsten an „ein kanonischer Flow"; Quali/Slot wandern statt zu duplizieren.

→ **Empfehlung B-opt2.** Reduziert auf einen Wizard (`/flow`), Marketing-Front bleibt minimal,
   die `/anfrage`-Quali/Slot-Logik wird wiederverwendet statt zweimal gepflegt.

## 4 · Ownership-Realität (wichtig)

Mit B-opt2 ist der **Marketing-Front-Anteil klein** (Anfrage anlegen + Redirect auf den Main-App-
Konversions-Einstieg statt eigenes Token). Der **Großteil ist Main-App**: anon-Konversion+Issue (Phase A,
stream8b) + adaptiver `/flow` (überlappt `cdd8f4f3`, die `/anfrage`-Quali/Slot besitzt + härtet).
→ Phase B ist **kein reiner Marketing-Branch-Task** — sie verzahnt sich mit A + cdd8f4f3.

## 5 · Schritte (B-opt2, NACH Phase A)

1. **(A · stream8b)** `issueCanonicalFlowLinkForAnfrage(anfrageId)` anon-fähig:
   createLead (Dispatcher round-robin) + `flow_links` + Versand (WA/SMS/Email) — der EINE Issue-Pfad.
2. **(Marketing · diese Session)** `starteLiveBuchung`: kein `self_service_token` mehr; Anfrage anlegen
   (Besichtigungsort-Geocode bleibt) → Redirect auf den Main-App-Konversions-Einstieg → der issued den
   `/flow`-Link + leitet auf `/flow/[token]`.
3. **(Main-App · A/cdd8f4f3)** `/flow` adaptiv: Lead ohne Termin/Quali → Quali + Slot-Steps
   (aus `SelbstQualiClient`/`TerminBuchungClient`) vor „gutachter".
4. **(Phase C · cdd8f4f3)** `/anfrage/[token]` + `issueSelfServiceFlowLink` + `gfa.self_service_token`
   deprecaten, sobald 0 Consumer (Komponenten leben dann in `/flow`).
5. **Smoke (Test-SV, kein echter Gutachter):** Marketing-Wizard → `/flow` → Quali → Slot → SA → Konto-Login;
   `dispatch@claimondo.de` sieht Lead + Termin + Fall in `/dispatch/leads`. Danach Cleanup (0 Reste).

## 6 · Akzeptanz

- Aus dem Marketing-Eintritt entsteht **kein** `/anfrage`-Token mehr.
- Kunde erhält **genau einen** Link: `/flow/[token]` (`flow_links.lead_id`).
- Lead erscheint **sofort** in `/dispatch/leads` (dispatcher-trackbar) — „bleibt nicht liegen".
- Cross-App-Grenze respektiert (Konversion + FlowLink in der Main-App).
- Kein echter Gutachter wird im Test benachrichtigt (Test-SV-Fix).

## 7 · Koordination / Reihenfolge

- **Bauen erst nach Phase A** (anon Issue-Pfad) **+ Aarons Fork-Entscheidung** (B-opt1 vs B-opt2).
- **cdd8f4f3** abstimmen: wer zieht die Quali/Slot-Komponenten nach `/flow` (Schritt 3) — überlappt deren `/anfrage`-Härtung.
- Marketing-Front-Änderung (Schritt 2) ist klein + isoliert → kann ich vorbereiten, sobald der Main-App-Einstieg (A) steht.
