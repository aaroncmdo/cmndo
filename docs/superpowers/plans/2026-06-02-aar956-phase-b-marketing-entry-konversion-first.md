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

## 3 · ENTSCHIEDEN (Aaron 02.06.): datengetriebener Flow

Nicht „Steps relocaten", sondern **datengetrieben**:
- **Slot = wesentlicher Teil des Leads.** Invariante: ein vollständiger Lead hat einen Slot.
  Hat der Lead in der DB **keinen** Slot → **muss einer abgefragt werden** (im kanonischen Flow).
- **Schuldfrage = nur ein Disqualifizierungs-Gate**, kein schwerer Step. Eigenverschulden → Kasko
  (nicht über die gegnerische Haftpflicht regulierbar) → disqualifiziert. Sonst weiter. Kann leicht/früh
  laufen (Marketing-Wizard ODER Konversion), muss nicht als eigener `/flow`-Schritt inszeniert werden.

→ Umsetzung = **adaptives, datengetriebenes `/flow`** (vormals „B-opt2"): `/flow` prüft, was am Lead fehlt,
  und fragt es ab. Konkret: Lead ohne reservierten Termin → **Slot-Picker** (wiederverwendet
  `TerminBuchungClient`) vor „gutachter" → dann SA + Konto. EIN `/flow`-Wizard für beide Eintritte
  (Dispatcher-vorqualifiziert ODER Self-Service-roh). Deckt sich mit dem bereits existierenden
  „datenabhängigen Onboarding" (`/kunde/onboarding-details`), auf das `/flow` für eingeloggte Kunden
  heute schon redirected.

### 3a · Datengetriebene Slot/SV-Logik (Aaron 02.06., verbindlich)

**Prinzip:** Der FlowLink ist **immer DB-abhängig** — exakt wie das Onboarding. Die bereits definierte
**Voll-Lead-Definition** (Onboarding-/Beauftragungs-Felder) ist die Quelle dafür, was ein „vollständiger Lead"
braucht; der Flow fragt nur das **Fehlende** ab. Der Slot/SV-Teil im Detail:

- **SV gepickt, kein Slot** (`lead.zugeordneter_sv_id` gesetzt, kein Termin) → nur den **Slot bei diesem SV**
  abfragen (`matchAndSlots({ fixerSvId })`).
- **Nur Wunschtermin, kein SV** (Zeit gesetzt, kein SV) → das ist ein **Wunschtermin** → matchen, ob zu der
  Zeit ein SV verfügbar ist (`matchAndSlots({ wunschterminIso })`).
- **Nichts** → globales Matching über den Besichtigungsort → Slots.
- **IMMER** dem Kunden **mehrere SVs** vorschlagen (ranked) — Ziel: die **Pakete/Kontingente der
  Prioritäts-SVs** über unsere Matching-Logik vollmachen (`findBestSV`-Scoring). Auch bei gepicktem SV:
  dieser als Default/erster, **plus** Alternativen.
  - ⚠️ Zu bestätigen: gepickter SV **hart** gelockt (nur er) ODER Default + Alternativen? Punkt „immer
    mehrere" spricht für **Default + Alternativen**.

**Bausteine existieren:** `matchAndSlots({ lat, lng, wunschterminIso, fixerSvId, topN })` deckt
fixerSvId / Wunschtermin / topN-Mehrfachvorschlag bereits ab. Neu = die **datengetriebene Invokation**
(welcher Fall, je nach Lead-DB-State) + die Voll-Lead-Abfrage analog Onboarding.

**Ownership:** Diese Slot/SV-Logik lebt im **`/flow` + Matching-Layer** (cdd8f4f3 `/flow`-Komponenten +
termin-engine Matching), **nicht** im Marketing-Front. Phase B (mein Teil) **füttert** nur den initialen
Lead-State (`zugeordneter_sv_id` aus Karten-Klick? `wunschtermin`? Besichtigungsort) — den Rest fragt der
datengetriebene `/flow` ab.

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

## 5a · A↔B-Kontrakt (fix) + Marketing-Front-Status

**Marketing-Front vorbereitet** (flag-gated, Default OFF → Prod unverändert): `starteLiveBuchung` hat jetzt
einen `CANONICAL_FLOWLINK_ENABLED`-Branch. OFF = heutiges `/anfrage/[token]`-Verhalten (self_service_token
+ FlowLink-Backup). ON = **kein** self_service_token, Redirect auf **`/start/[anfrageId]`**. Build grün.

**Kontrakt, den Phase A (stream8b) erfüllen muss:**
- Main-App-Route **`/start/[anfrageId]`** (anon): (1) Anfrage→Lead konvertieren (kanonisch,
  `zugewiesen_an = Dispatcher` Round-Robin), (2) den EINEN `flow_links`-FlowLink ausstellen **+ senden**
  (WA/SMS/Email), (3) auf `/flow/[token]` weiterleiten.
- **Gating** (A entscheidet): empfohlen **HMAC-signierter Param** (`/start/[anfrageId]?sig=…`, Shared-Secret
  beide Apps) statt eines zweiten DB-Tokens → bleibt single-token-konform.
- **Flip:** `CANONICAL_FLOWLINK_ENABLED=true` in der Marketing-App-ENV, sobald `/start` live ist.
- **Lead-State, den der Front mitgibt** (für die datengetriebene Slot/SV-Logik §3a): `zugeordneter_sv_id`
  (Karten-Klick) + Besichtigungsort (`besichtigungsort_adresse` + `schadenort_lat/lng`). `wunschtermin` heute
  (noch) nicht erfasst — optional/Folge.

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
