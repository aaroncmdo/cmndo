# Firmen-Flotte + NFC-Schadenkarte + Haftpflicht-Unfallbericht — Design

**Datum:** 2026-07-11
**Branch:** `kitta/firmen-flotte-schadenkarte` (off origin/main)
**Status:** Design abgestimmt (Brainstorming), bereit fuer Implementierungs-Plaene

---

## 1 · Kontext & Ziel

Firmen mit Fuhrpark ("Flotten") registrieren sich als Business-Partner, verwalten ihre Fahrzeuge und binden pro Fahrzeug eine physische **NFC-Schadenkarte**. Bei einem **Haftpflicht-Schaden** (der Unfallgegner ist schuld) haelt der Fahrer die Karte an das Handy des Gegners. Der Gegner erfasst auf seinem eigenen Geraet seine Seite (Daten + Haftpflicht), bestaetigt per **digitalem Unfallbericht** die Tatsachen, macht Fotos und unterschreibt. Daraus entsteht automatisch ein Claim auf unserer Seite, und der Schaden wird direkt bei der **Haftpflicht des Gegners** gemeldet. Business-Partner bekommen eine **Flottenverwaltung** als View.

**Leitprinzip — entity-basiert:** Das **Fahrzeug ist die Aggregate-Root**. Es existiert dauerhaft (unabhaengig von Schaeden), traegt seine Identitaet + den Halter (firma) + die gebundene Karte. Wenn etwas passiert, liegt die Logik im Fahrzeug — nicht im Schaden. Die Flotte ist die **Basis**, die Karte haengt am Fahrzeug, der Schaden ist ein **Event** darauf.

Der Kern ist **kein Neubau**, sondern ein Compose-Job: **3 neue Tabellen, ~8 wiederverwendete Entities**. Airdrop, Token-Flows, Signatur-Infra, Versicherungs-Registry und die claim/claim_parties-Struktur existieren bereits.

---

## Update 2026-07-11 — Bestands-Verifikation (vor Plan 1)

Ein Explore + File-Read hat ergeben: **`flotten_fahrzeuge` + eine komplette `/kunde/flotte`-Flottenverwaltung existieren bereits** (Migration `20260706100916`, kunde-scoped via `personen.firma_id`). Korrekturen zu §4/§7:

- **`flotten_fahrzeuge` ist NICHT neu** — plain N:M (`firma_id, vehicle_id, added_by_user_id, notiz`, `UNIQUE(firma_id,vehicle_id)`), **kein** temporales `aktiv_von/aktiv_bis`. Layer 0 **reused** die Tabelle + `FlotteClient` + `createVehicleStub` + `ensureFirma`. Der `aktiv_bis`-Temporal-Entwurf entfaellt (Karten-Gating laeuft ueber die N:M + Hard-Delete: Fahrzeug raus = Zeile weg = Karte loest keine firma auf).
- **Business-Partner = eigene Identitaet (Choice B, Aaron 11.07.):** neue `flottenmanager`-Rolle + `firmen_flotten_konten`-Link-Tabelle + `/flotte`-Portal, das den bestehenden Fleet-Kern wiederverwendet. Admin-provisioniert.
- **DPIA-Ergebnis:** ERFORDERLICH (4 EDPB-Kriterien: sensible Daten, schutzbeduerftige Betroffene, innovative Technik, Datensatz-Kombination); gated den Launch von Layer 2; **kein** Art.-36 noetig nach Mitigation. Draft: `2026-07-11-dpia-nfc-schadenkarte-gegner-flow.md`.

Die konkrete, reuse-schwere Layer-0-Umsetzung steht in **`docs/superpowers/plans/2026-07-11-firmen-flotte-layer0-fundament.md`**.

---

## 2 · Nicht-Ziele / Scope-Grenzen

- **NUR Haftpflicht-Schaeden** (Gegner schuld). **KEIN Eigenverschulden** (das waere die eigene VS/Kasko der Firma — ein anderer Flow, bewusst draussen). Begruendung: bei Eigenverschulden gaebe es keine Gegner-Unterschrift "die Gegenseite ist schuld"; die Karte ist definitionsgemaess das Opfer-Werkzeug gegen die Gegner-Haftpflicht.
- **Kein Personenschaden-Erfassungspfad im MVP.** Fotos werden auf **Sachschaden** gescoped (Art.-9-Gesundheitsdaten-Vermeidung, siehe §6.2). Personenschaden → spaeterer, separat gegateter Pfad.
- **Kein firma-als-Gegner-Pfad im MVP.** Der Gegner ist eine Privatperson / ein Einzel-Fahrer (`personen`). Firma-Gegner (Flotte gegen Flotte) = Phase 2.
- **Kein Zwang zum Account fuer den Gegner.** Der Gegner-Flow ist token-autorisiert und anonym; Account-Upgrade ist optional (Airdrop-Prinzip).

---

## 3 · Architektur — 3 Layer

| Layer | Inhalt | Status Bestand |
|---|---|---|
| **0 — Flotte (Basis)** | firma -> `flotten_fahrzeuge` -> `vehicles` + Flottenverwaltung-View + firma-Partner-Registrierung | vehicles/firmen existieren; Ownership + Fleet-View + Signup neu |
| **1 — Karte** | `schadenkarte` am Fahrzeug (NFC-UID + URL-Token), bestellt/gebunden im Fleet-View | greenfield (klein) |
| **2 — Haftpflicht-Schaden (Event)** | NFC-Tap -> Gegner-Flow -> `unfallberichte` -> claim -> VS-Meldung | Airdrop/Token/Signatur/VS ~70-85% da |

Reihenfolge der Umsetzung folgt den Layern (Basis zuerst — die Karte kann erst binden, wenn das Fahrzeug existiert).

---

## 4 · Entity-Modell

```
LAYER 0 — FLOTTE
  firmen  (bestehend)  id, name, ust_id, rechtsform, adresse_*, organisation_id, ...
     | 1:n
     v
  flotten_fahrzeuge  (NEU · Membership/Halter-Beziehung)
     id, firma_id->firmen, vehicle_id->vehicles, aktiv_von, aktiv_bis, ...
     UNIQUE(vehicle_id) WHERE aktiv_bis IS NULL      <- max. 1 aktive Flotte/Fahrzeug
     | n:1
     v
  vehicles  (bestehend · UNBERUEHRT)  id, fin, kennzeichen, marke, modell, current_owner_id->profiles, ...

LAYER 1 — KARTE
  schadenkarte  (NEU)
     id, vehicle_id->vehicles,                <- die fixe Bindung
     nfc_uid, karten_token_hash, karten_token_prefix, status, ausgestellt_fuer_firma_id->firmen
     NDEF-URL:  https://claimondo.de/schaden/{karten_token}

LAYER 2 — HAFTPFLICHT-SCHADEN (aus NFC-Tap)
  claims  (bestehend)  id, gegner_versicherung_id->versicherungen, gegner_versicherungsnummer, ...
     ^ n
  claim_parties  (bestehend · EIN Registry, zwei Seiten)
     - geschaedigter:  firma_id->firmen + vehicle_id->vehicles, ist_halter
                       (aufgeloest aus karten_token->schadenkarte->vehicle->aktive Membership)
     - + Fahrer:       person_id->personen, rolle=fahrer_nicht_halter  (spaeter, im Portal ergaenzt)
     - verursacher:    person_id->personen + versicherung_id->versicherungen, rolle=gegner_airdrop
     |
  unfallberichte  (NEU · digitaler Europaeischer Unfallbericht)
     id, claim_id->claims, gegner_party_id->claim_parties, tatsachen, skizze_url,
     fahrer_unterschrift_url, gegner_unterschrift_url, haftung_vom_gegner_anerkannt,
     signatur_zeitpunkt, geo_lat, geo_lng, ip_hash, telefon_verifiziert, erklaerung_version
     |
  airdrop_invitations (bestehend) -> Gegner-Onboarding (SMS-Verify, Token, optional Account)
  fall_dokumente      (bestehend) -> Unfallfotos (Sachschaden)
  vs_korrespondenz    (bestehend) -> auto Unfallmitteilung an Gegner-Haftpflicht
```

### 4.1 · Bestehende Tabelle `flotten_fahrzeuge` (wiederverwendet) + NEU `firmen_flotten_konten` (Layer 0)

> **Korrektur 11.07.:** `flotten_fahrzeuge` existiert bereits (Mig `20260706100916`, plain N:M, kein Temporal). Der folgende `aktiv_von/aktiv_bis`-Entwurf wurde **NICHT** umgesetzt — Layer 0 reused die Bestandstabelle + fuegt `firmen_flotten_konten` (flottenmanager <-> firma) hinzu. Siehe Update oben + Plan 1.

Modelliert "firma betreibt Fahrzeug X von–bis" (Halter/Betreiber-Beziehung, **nicht** Eigentum — bei geleasten Flotten ist der Eigentuemer die Leasingbank). Haelt `vehicles` universell und schlank; Flotten-Metadaten leben hier statt als immer-NULL-Spalten auf der universellen Fahrzeug-Tabelle.

```sql
create table public.flotten_fahrzeuge (
  id            uuid primary key default gen_random_uuid(),
  firma_id      uuid not null references public.firmen(id)   on delete restrict,
  vehicle_id    uuid not null references public.vehicles(id) on delete restrict,
  aktiv_von     date not null default current_date,
  aktiv_bis     date,                       -- null = aktiv
  erstellt_am   timestamptz not null default now(),
  -- Phase 2 (B-additiv, nullable):
  interne_nummer   text,
  kostenstelle     text,
  standort         text,
  fahrer_person_id uuid references public.personen(id)
);
-- Max. eine aktive Flotten-Zugehoerigkeit pro Fahrzeug:
create unique index flotten_fahrzeuge_aktiv_uniq
  on public.flotten_fahrzeuge (vehicle_id) where aktiv_bis is null;
```

**RLS:** firma-zugehoerige User sehen/verwalten nur die Memberships ihrer Firma (Zuordnung User->firma, siehe §7 Plan 1). `current_owner_id` auf `vehicles` bleibt unberuehrt (Eigentum bleibt getrennt vom Flotten-Betrieb).

### 4.2 · Neue Tabelle: `schadenkarte` (Layer 1)

Die physische NFC-Karte ist nur ein **URL-Traeger** (NDEF-URI-Record -> `/schaden/{token}`). Software = diese Entity + Token-Aufloesung + der bestehende Gegner-Flow. Token-Handling spiegelt das bewaehrte `airdrop_invitations`-Muster (Hash + Lookup-Prefix, kein Klartext-Token in der DB).

```sql
create table public.schadenkarte (
  id                     uuid primary key default gen_random_uuid(),
  vehicle_id             uuid not null references public.vehicles(id) on delete restrict,
  nfc_uid                text unique,                 -- physische Chip-UID (beim Binden erfasst)
  karten_token_hash      text not null unique,        -- gehashter URL-Token (wie airdrop.token_hash)
  karten_token_prefix    text not null,               -- Lookup-Prefix (wie airdrop.token_lookup_prefix)
  status                 text not null default 'bestellt'
                           check (status in ('bestellt','versendet','aktiv','gesperrt','ersetzt')),
  ausgestellt_fuer_firma_id uuid references public.firmen(id),  -- Ausgabe-Audit
  gebunden_am            timestamptz,
  erstellt_am            timestamptz not null default now()
);
```

**Aufloesung (server-side, security-kritisch):** `karten_token -> schadenkarte -> vehicle_id -> flotten_fahrzeuge (aktiv_bis IS NULL) -> firma`. Keine aktive Membership -> kein firma -> Flow blockiert (temporale Gueltigkeit gated die Karte automatisch: Fahrzeug raus aus Flotte = Karte tot, ohne manuelles Deaktivieren).

**RLS:** firma-User verwalten ihre Karten. Die Token-Aufloesung im Gegner-Flow laeuft server-side (service-role) — kein anonymer RLS-Zugriff.

### 4.3 · Neue Tabelle: `unfallberichte` (Layer 2)

Digitaler **Europaeischer Unfallbericht** (Tatsachen-Bestaetigung, insurer-anerkannt) — **nicht** ein rechtlich schwaecheres/anfechtbares "Schuldanerkenntnis" (siehe §6.1). Die explizite Haftungs-Anerkennung ist ein **optionales, klar getrenntes** Feld.

```sql
create table public.unfallberichte (
  id                          uuid primary key default gen_random_uuid(),
  claim_id                    uuid not null references public.claims(id) on delete cascade,
  schadenkarte_id             uuid references public.schadenkarte(id),  -- welche Karte loeste aus
  -- Tatsachen (strukturiert, Europaeischer-Unfallbericht-Schema):
  tatsachen                   jsonb not null default '{}'::jsonb,       -- Hergang, Position, Richtung
  skizze_url                  text,                                     -- Unfallskizze (Canvas -> Storage)
  -- Beidseitige Signatur:
  fahrer_unterschrift_url     text,
  gegner_party_id             uuid references public.claim_parties(id),
  gegner_unterschrift_url     text,
  -- Optionale, klar getrennte Haftungs-Anerkennung:
  haftung_vom_gegner_anerkannt boolean not null default false,
  -- Evidenz-Metadaten:
  signatur_zeitpunkt          timestamptz,
  geo_lat                     double precision,
  geo_lng                     double precision,
  ip_hash                     text,          -- gehasht, nicht roh (DSGVO-Minimierung)
  telefon_verifiziert         boolean not null default false,
  erklaerung_version          text,          -- welche Textversion unterschrieben wurde
  erstellt_am                 timestamptz not null default now()
);
```

**RLS:** firma sieht ihre Berichte; die Gegner-Erstellung laeuft server-side via Token-Flow.

### 4.4 · Wiederverwendete Entities (unveraendert genutzt)

- **`firmen`** — der Flotten-Owner (existiert seit CMM-Entity: ust_id, rechtsform, adresse, organisation_id).
- **`vehicles`** — universelles Fahrzeug (FIN-verankert via `upsert_vehicle_by_fin`), **unberuehrt**.
- **`claims`** — der Claim; `gegner_versicherung_id`/`gegner_versicherungsnummer` tragen die Gegner-Haftpflicht.
- **`claim_parties`** — geschaedigter (firma+vehicle) / Fahrer / verursacher (Gegner). Constraint person XOR firma respektiert.
- **`personen`** — globale Personen-Registry (Gegner, Fahrer).
- **`versicherungen`** — Versicherer-Registry (schaden_email, bafin_nummer) fuer den HP-Picker + die Meldung.
- **`airdrop_invitations`** + `src/lib/airdrop/server-actions.ts` — Gegner-Onboarding (SMS-Verify, Token, optional Account).
- **`vs_korrespondenz`** + `kanzlei_faelle` — VS-Kommunikation/Eskalation fuer die Meldung an die Gegner-Haftpflicht.
- **`fall_dokumente`** + `/upload`-Slots — Unfallfotos.
- **Token-Flow-Muster** aus `/flow/[token]`, `/upload/dokumente/[token]`, `/flow/signatur/[token]` — Vorlage fuer `/schaden/[token]`.

---

## 5 · Flows

### Flow A — Flotte aufbauen (Layer 0/1)

1. Firma registriert sich als Business-Partner (neuer firma-Partner-Signup) -> `firmen`-Row + User<->firma-Zuordnung.
2. Firma legt Fahrzeuge an (Kennzeichen, Marke/Modell) -> `vehicles` (via `upsert_vehicle_by_fin`) + `flotten_fahrzeuge`-Membership (aktiv).
3. Firma bestellt Karten -> `schadenkarte` (status `bestellt`). Wir versenden physisch (status `versendet`).
4. Firma bindet Karte an Fahrzeug: NFC-UID scannen/eingeben -> `schadenkarte.vehicle_id` + `nfc_uid` gesetzt, status `aktiv`, `gebunden_am`.

### Flow B — NFC-Tap -> Claim (das Herz, Layer 2)

1. **Gegner-Handy** liest NDEF -> oeffnet `/schaden/{karten_token}` (kein App noetig; iOS+Android oeffnen NDEF-URLs).
2. **Server-Aufloesung:** token -> schadenkarte -> vehicle -> aktive `flotten_fahrzeuge` -> firma. **Unsere Seite steht** (firma, Kennzeichen, Marke).
3. **Gegner gibt ein:** Name, eigenes Kennzeichen, Haftpflicht (`versicherungen`-Picker, kein Freitext) + Police-Nr.
4. **Fotos** (Stelle, Schaeden, Kennzeichen — **Sachschaden**) -> `/upload`-Slots -> `fall_dokumente`.
5. **Unfallbericht:** strukturierte Tatsachen + Skizze + versionierter Text + Canvas-Signatur (beidseitig) -> PDF/Storage -> `unfallberichte` (+ geo, timestamp, ip_hash). Optionales Haftungs-Haekchen.
6. **SMS-Verify** der Gegner-Nummer (Airdrop-Pfad) -> Gegner bekommt seine Kopie, wird optional zum Account.
7. **Submit -> atomar:** claim + claim_parties (geschaedigter=firma/vehicle · verursacher=Gegner) + unfallbericht + `gegner_versicherung_id` gesetzt.
8. **Auto:** Unfallmitteilung an `versicherungen.schaden_email` der Gegner-Haftpflicht -> `vs_korrespondenz` (richtung=ausgehend). + Hinweis an den Gegner: "Sie muessen den Schaden auch Ihrer Haftpflicht melden."
9. Claim erscheint im **Flotten-Portal** der firma -> Fahrer ergaenzt seine Seite (eigene Fotos, Hergang) authentifiziert.

**Sauberer Split:** Fahrzeug traegt "unsere Seite" vor · NFC-Tap erfasst nur "Gegner-Seite" · Fahrer-Seite kommt authentifiziert im Portal nach.

### Flow C — Flottenverwaltung-View (Layer 0)

Firma-Portal: Liste aller aktiven Flotten-Fahrzeuge (`flotten_fahrzeuge` aktiv JOIN vehicles), je Fahrzeug: Stammdaten, Karten-Status, Schadenhistorie (claims wo geschaedigter=firma+vehicle). Aktionen: Fahrzeug hinzufuegen/entfernen (Membership `aktiv_bis` setzen), Karte bestellen/binden/sperren.

---

## 6 · Rechts- & Trust-Punkte

### 6.1 · Unfallbericht statt "Schuldanerkenntnis"

Ein am Unfallort unterschriebenes "Schuldanerkenntnis" ist rechtlich schwaecher als es klingt: nach BGH-Linie bindet es die gegnerische Haftpflicht **nicht** (die reguliert eigenstaendig) und ist unter Stress **anfechtbar**. Stattdessen: der **Europaeische Unfallbericht** — beide Seiten halten **Tatsachen** fest und unterschreiben, dass die **Fakten** stimmen (insurer-anerkannt, kein Schuldeingestaendnis noetig). Die Fakten begruenden die Haftung robuster. Optionales, getrenntes `haftung_vom_gegner_anerkannt` fuer den Fall, dass der Gegner freiwillig zustimmt. **Das Ziel (Schaden geht an die Gegner-Haftpflicht) steht dadurch fester, nicht schwaecher.**

### 6.2 · DPIA-Pflicht — vor Launch, nicht verhandelbar

EDPB-Kriterien getroffen: **(4)** sensible/hoechstpersoenliche Daten, **(7)** schutzbeduerftige Betroffene (Gegner = Nicht-User, Unfall-Stress, Macht-Asymmetrie), **(8)** innovative Technik (NFC-Tap auf Fremd-Handy zur Rechts-Erfassung). >=2 Kriterien = **klare DPIA-Pflicht vor Verarbeitungsbeginn** (Art. 35(1)). Massnahmen: Consent-/Transparenz-Screen fuer den Gegner (wer/Zweck/Rechtsgrundlage Art. 6(1)(f)/(b)/seine Rechte/Loeschung); **Fotos auf Sachschaden scopen** (Verletzungsfotos = Art.-9); `ip_hash` statt roher IP; Datenminimierung; Aufbewahrungsfristen. **Launch ist auf eine abgeschlossene DPIA gegated** (via DPIA-Sentinel, -> .docx fuer den DSB).

### 6.3 · Fraud / Datenqualitaet

Der Gegner deklariert seine Haftpflicht selbst. Haertung MVP: **SMS-Verify** der Gegner-Nummer (Airdrop-Pfad) + **OCR** der eVB/Versicherungskarte + Fuehrerschein (bestehende Pipeline) + geo/timestamp/Fotos als Szenen-Beweis + Fahrer als praesenter Zeuge + Insurance-**Picker** gegen `versicherungen` (kein Freitext). Phase 2: **Zentralruf der Autoversicherer** (GDV) als autoritative Quelle "welche Haftpflicht versichert Kennzeichen X" -> Verifikation/Ableitung der Gegner-Haftpflicht aus dem Kennzeichen.

### 6.4 · Offline-Faehigkeit

Unfaelle passieren im Funkloch. MVP: sobald die Seite **einmal** geladen ist, **client-seitig puffern** (IndexedDB) — Fotos/Signatur/Eingaben ueberleben Signal-Abbrueche, Submit sobald wieder online. Phase 2: der Fahrer hat unsere **PWA** (installiert, authentifiziert) -> Total-Funkloch-Erfassung offline + lokaler QR fuer den Gegner, Sync spaeter.

---

## 7 · Umsetzung in Schnitten (Decomposition)

Das Feature ist zu gross fuer einen Plan. **Je Layer ein eigener Implementierungs-Plan** (jeder liefert lauffaehige, testbare Software):

- **Plan 1 — Layer 0: Flotten-Fundament.** `flotten_fahrzeuge`-Migration + RLS; User<->firma-Zuordnung; firma-Partner-Registrierung/Account; Flottenverwaltung-View (Fahrzeug-CRUD + Liste). *Liefert: Firmen koennen sich registrieren und Fahrzeuge verwalten.*
- **Plan 2 — Layer 1: Schadenkarte.** `schadenkarte`-Migration + RLS; Token-Generierung (airdrop-Muster); Bestell-/Binde-/Sperr-UI im Fleet-View; NDEF-URL-Konvention. *Liefert: Karten bestellbar + an Fahrzeug bindbar.*
- **Plan 3 — Layer 2a: Gegner-Flow.** `/schaden/[token]`-Route (offline-tolerant); server-side Token-Aufloesung; `unfallberichte`-Migration; Tatsachen-Formular + Skizze + Fotos (`/upload`) + beidseitige Signatur; SMS-Verify (airdrop). *Liefert: Gegner kann am Handy erfassen + unterschreiben.*
- **Plan 4 — Layer 2b: Claim + VS-Meldung.** Atomare Claim-Erzeugung (claim + parties + unfallbericht); auto Unfallmitteilung an Gegner-Haftpflicht via `vs_korrespondenz`; Gegner-Eigenmeldungs-Hinweis; Portal-Sichtbarkeit fuer die firma. *Liefert: End-to-End Haftpflicht-Schaden aus NFC-Tap.*
- **Parallel — DPIA.** Art.-35-Bewertung via DPIA-Sentinel. **Gate fuer den Launch von Plan 3/4.**

Jeder Plan durchlaeuft eigenes Brainstorming-freies writing-plans (Design ist hier schon geklaert) + den 7-Punkte-Audit je Commit.

---

## 8 · Locked Design-Entscheidungen

| Entscheidung | Gewaehlt | Verworfen (Grund) |
|---|---|---|
| Ownership-Modell | `flotten_fahrzeuge` Membership-Entity | `firma_owner_id`-Spalte (verschmutzt universelle vehicles-Tabelle = das claims-Spalten-Monster); polymorphes `current_owner_id` (killt echten FK) |
| Karten-Bindung | `schadenkarte.vehicle_id` fix; firma via aktive Membership abgeleitet | firma direkt auf der Karte (Karte muesste bei Flottenwechsel manuell umgehaengt werden) |
| Signatur-Instrument | Europaeischer Unfallbericht (Tatsachen) + optionales Haftungs-Feld | reines Schuldanerkenntnis (rechtlich anfechtbar, bindet Gegner-VS nicht) |
| Scope | Haftpflicht-only (Gegner schuld) | Eigenverschulden/Kasko (anderer Flow) |
| Token | Hash + Lookup-Prefix (airdrop-Muster) | Klartext-Token in DB |

---

## 9 · Koordination (parallele Sessions)

Das Feature beruehrt **geteilte Entities**: `firmen`, `vehicles`, `claims`, `claim_parties`, `airdrop_invitations`, `versicherungen`, `vs_korrespondenz`. Relevante Lanes:

- **6c630247 (`werkstatt-flowlink-haftpflicht`)** — ebenfalls Haftpflicht + FlowLink. **Potenzielle Ueberlappung** beim Claim-Erzeugungs-/FlowLink-Pfad. Vor Plan 4 abstimmen: teilen wir die Claim-Creation-Facade?
- **470d55c9 (claims-/Normalisierungs-Lane)** — Owner von `claims`/`claim_parties`-Schema. Neue FKs (gegner_party auf unfallberichte) mit ihnen abstimmen; keine claims-Spalten hinzufuegen (Normalisierungs-Lehre).
- **DDL ausschliesslich via `apply_migration` (MCP, AGENTS Regel 2)**, wenn der Supabase-MCP verbunden ist. `execute_sql` nur READ. Migration-File exakt nach getrackter Version benennen (Twin-Drift-Schutz).

Ein BROADCAST-Marker kuendigt dieses Design + die beruehrten Entities den parallelen Sessions an.

---

## 10 · Testing-Ansatz

- **TDD je Plan.** RLS-Tests (firma-Scoping fuer `flotten_fahrzeuge`/`schadenkarte`); Token-Aufloesungs-Tests (aktive vs. inaktive Membership -> Flow-Gate); `unfallberichte`-Integritaet (beidseitige Signatur, geo/ip_hash gesetzt); atomare Claim-Erzeugung (parties korrekt, gegner_versicherung_id gesetzt); VS-Meldung (send gemockt, `vs_korrespondenz`-Row).
- **Prod-Smokes** nur mit Test-Accounts (`test-*@claimondo.de`), nie echte Kunden/Partner.
- Build gruen (`npm run build`) vor jedem Commit; 4 Token-Ratchets 0-neu.

---

## Layer 2 — Unfallverursacher-Flow: Detail-Design (11.07. + Bestands-Audit)

Aaron-Anforderungen 11.07. + Audit (SV/Kanzlei-Konsum + VS-Modell). Konkretisiert §4.3/§5/§6 fuer Plan 3/4.

### Erfasste Daten (Gegner am Handy)
- **Gestaendnis** -> digitaler Unfallbericht (Tatsachen) + explizites `haftung_vom_gegner_anerkannt`-Haekchen (rechtssicher, nicht anfechtbar — §6.1).
- **Unfallbeschreibung** -> Freitext, **Groq-Diktat REUSE** `src/app/api/flow/voice-transcribe/route.ts` (existiert, FlowLink-token-scoped, „Unfallhergang-Diktat") + `src/lib/ai/transcribe.ts` (whisper-large-v3-turbo). KEIN neues Voice-Infra.
- **Fotos:** Unfallort + Schaden BEIDER Autos (eigenes + Gegner).
- **Kontaktdaten** Gegner + **Unterschrift**.
- **Gegner-Versicherung:** Picker (`versicherungen`) + **Kennzeichen** + **Versicherungsnummer** — direkt gesetzt.

### DB-Landing (alles beisammen fuer den Claim — atomar beim Submit)
- **`unfallberichte`** (NEU): beschreibung/tatsachen + skizze + fahrer- & gegner-Unterschrift + `haftung_vom_gegner_anerkannt` + geo/timestamp/ip_hash. (Audit: heute existiert KEIN Schuld-/Signatur-Speicher -> dies ist der Home.)
- **`claims.hergang_gegner_text`** (NEU): die Gegner-Beschreibung — distinkt von `hergang_kunde_text` (geschaedigter) + `hergang_sv_text`. (Audit-Gap: gibt's nicht.)
- **`claim_parties`** verursacher: person_id + versicherung_id + versicherungsnummer + versicherungs_aktenzeichen + vehicle_id (Gegner-Kennzeichen-Stub) + rolle=`gegner_airdrop`. (Existiert — `v_claim_sv` liest es bereits.)
- **`claims`**: gegner_versicherung_id + gegner_versicherungsnummer. (Existiert.)
- **`fall_dokumente`** NEUE Katalog-Slots: `gegner_fahrzeug_fotos` (+ ggf. `unfallort_fotos`), mit `sichtbar_fuer` = `['sachverstaendiger','kanzlei', …]`. (Audit-Gap: heute kein Gegner-Kfz-Slot; nur generisches `schadensfotos`/`unfallfotos`.)

### SV-Sichtbarkeit (Audit)
`v_claim_sv` traegt hergang_kunde_text + gegner_versicherung(snummer/aktenzeichen) schon; SV-UI rendert „Unfall"+„Gegner"-Tab + Fotos (`sichtbar_fuer`⊇sachverstaendiger). **Nachziehen:** `hergang_gegner_text` in `v_claim_sv`; neue Foto-Slots `sichtbar_fuer=sachverstaendiger`; `unfallberichte` (Gestaendnis/Signatur) in die SV-Sicht joinen.

### Kanzlei-Sichtbarkeit (Audit — echte Luecke, ENTSCHEIDUNG offen)
Kanzlei hat **KEINE Detail-View** (bewusst nicht gebaut) — bekommt nur das `kanzlei_paket`-Bundle (PDF, von Claimondo kompiliert) + Mandate-Overview. Die Gegner-Flow-Daten (Gestaendnis, Gegner-Fotos, Haftpflicht+Police) muessen also **ins `kanzlei_paket`-Bundle** ODER eine Kanzlei-Detail-View muss gebaut werden. `vs_korrespondenz` ist in `v_claim_full` (JSONB), im Kanzlei-Portal aber nicht gerendert.

### Kasko != Haftpflicht (Verwechslungsschutz)
- **Haftpflicht = Gegner** (`gegner_versicherung_id`) — Primaerweg (oben).
- **Kasko = eigene** (firma) — **GREENFIELD** (Audit: keine Kasko-Spalte auf `claims`; `leads.eigene_versicherung` nur Freitext; ABER `claims.abrechnungsweg` kennt den Wert `'kasko'` schon).
- **NEU auf `claims`:** `eigene_versicherung_id` (FK `versicherungen`) + `eigene_versicherungsnummer`. Im Modell + UI HART getrennt von `gegner_versicherung_id` („Gegner-Haftpflicht" vs „Ihre Kasko").
- **Kasko-Angebot:** nach dem Haftpflicht-Claim bieten wir dem Kunden an, zusaetzlich der eigenen Kasko zu melden (Vorteil: schnelle Regulierung/Regress via Quotenvorrecht; Nachteil: SB + SFR-Rueckstufung -> Kunde entscheidet). Erfassung der eigenen Kasko: **Hybrid** — optional pro Flotten-Fahrzeug hinterlegt (dann 1-Klick-Angebot) + Fallback-Abfrage im Angebot.

### Groq-Voice (Audit: fertig)
`flow/voice-transcribe` + `lib/ai/transcribe.ts` sind schon FlowLink-token-scoped fuer Unfallhergang-Diktat -> der Gegner-Flow nutzt sie direkt.

### flottenmanager-Claim-Erstellung + -Verwaltung (11.07.)
Aus der Flottenverwaltung, pro Fahrzeug „Schaden melden" (Fahrzeug + firma vorbefuellt, weil das Fahrzeug schon in der Flotte hinterlegt ist). **Drei Ausfuell-Wege in denselben Claim:**
- (a) **NFC-Karte -> Gegner** (am Unfallort, Gegner fuellt seine Seite) — Layer-2-Kern.
- (b) **Kanonischer FlowLink -> Fahrer** (flottenmanager schickt den Link per **WhatsApp/Link**; der Fahrer fuellt aus).
- (c) **flottenmanager fuellt direkt** im Portal.

**Sichtbarkeit am Fahrzeug (flottenmanager):** Flow GESTARTET -> „Schaden in Bearbeitung"-Indikator am Flotten-Fahrzeug; AUSGEFUELLT -> vollstaendig erfasst + **voll einsehbar** (Verursacher-Daten: Gestaendnis, Beschreibung, Fotos, Gegner-VS). Der flottenmanager ist damit **dritter Consumer** der Gegner-Flow-Daten (neben SV + Kanzlei).

### Gutachter-Finder ⊥ kanonischer FlowLink (Sauberkeits-Trennung)
- **Kanonischer FlowLink = reine Claim-Erfassung** (Unfalldaten: Hergang, Fotos, Beteiligte). Wiederverwendbar ueber kunde/fahrer/flottenmanager.
- **Gutachter-Finder = eigener, komponierbarer Schritt** (SV finden + Termin buchen), AUF einen Claim aufgesetzt — NICHT im FlowLink verdrahtet. Grund: beide werden „repetitiv" genutzt; entkoppelt bleibt jeder sauber reusable + testbar.
- Der **Gegner-NFC-Flow** = spezialisierter Token-Flow (Gegner-scoped, am Unfallort), Geschwister des kanonischen FlowLinks.
- ⚠️ **KOORDINATION:** Gutachter-Finder + melde-schaden + kanonischer FlowLink sind aktive Baustelle (Sessions 2a18c1b0 melde-schaden/reservierung + 61e1d996 auf aar-956) + MCP-exponiert (`claimondo_finde_gutachter_termine` / `claimondo_melde_schaden`). Die Trennung mit diesen Lanes abstimmen, nicht trampeln.

### Haftpflicht-Meldung + Hinweis (Gegner-Verursacher)
- Der Schaden wird an die **Haftpflicht des Gegners (Verursacher)** gemeldet — Kern-Recovery-Weg.
- **Hinweis im Flow (Pflicht-Text):** „Der Schaden wird der Haftpflichtversicherung des Unfallverursachers gemeldet" + der Gegner ist **verpflichtet, den Schaden auch selbst seiner Haftpflicht zu melden** (Hinweis an ihn).
- Mechanik: `vs_korrespondenz` -> Unfallmitteilung an `versicherungen.schaden_email` der Gegner-Haftpflicht.

### Weitere Anforderungen (11.07. Nachtrag) — inkl. 3 Korrekturen

**Korrekturen frueherer Entscheidungen:**
- **KORREKTUR Kasko:** **NICHT pro Fahrzeug hinterlegen.** Kasko-Meldung ist ein reiner **at-Schaden/at-Angebot**-Service (nach dem Claim). Kein Kasko-Feld am Flotten-Fahrzeug; `eigene_versicherung_id` wird erst beim Kasko-Angebot erfasst. (Loest die fruehere Hybrid-Empfehlung ab.)
- **KORREKTUR Kanzlei:** **Kanzlei-Detail-View BAUEN** (nicht nur kanzlei_paket-Bundle) — Entscheidung getroffen.
- **KORREKTUR Admin-Einstieg:** B2B-Partner-Verwaltung **in den VERTRIEB einbauen** (NICHT neues Nav-Item, NICHT `/admin/partner`). Der Final-Review-Fix legte den Einstieg in `PartnerHubTabs` -> umziehen in den Vertrieb-Cockpit. ⚠️ Koordination mit 386b3bd8 (vertrieb-cockpit-refine, aktiv).

**Neue Anforderungen:**
- **Karte = NFC + QR:** die physische Karte traegt NFC UND einen **QR-Code** (beide oeffnen dieselbe `/schaden/{token}`-URL; QR = Fallback wenn NFC nicht geht). -> **QR-Generierung noetig** (Muster: Vertrieb-QR / partner-referral).
- **Karte<->Fahrzeug-Zuweisung auch via Admin-Panel** (analog QR-Zuweisung im Vertrieb) — nicht nur flottenmanager-Binding.
- **flottenmanager „Zu welchem Fahrzeug gehoert diese Karte?"-Button:** QR scannen ODER NFC-Karte halten -> Karten-Token aufloesen -> **Fahrzeug-Detailview** anzeigen (Reverse-Lookup Karte->Fahrzeug, falls vergessen).
- **Firmen-Partner-Provision:** **150 EUR netto pro Vermittlung MIT Gutachter-Auftrag** (Muster: makler/werkstatt `partner_provisionen`). ⚠️ Koordination mit Provisions-Lane (6f60c510).
- **Claim-Sichtbarkeit ueber die Fahrzeug-Detailview:**
  - Claim-Detail-View **erreichbar ueber die Fahrzeug-Detailview**.
  - **Kleine Claim-Uebersicht** in der Fahrzeug-Detailview.
  - **Mini-Aktionen pro Fahrzeug** in der Flotten-Liste (Schaden melden, Karte identifizieren, …).

---

## 11 · Offene Fragen (fuer Review)

1. **firma-Partner-Registrierung:** self-signup (wie makler/werkstatt) oder admin-angelegt (kuratiert, B2B-Vertrieb)? Beeinflusst Plan 1.
2. **User<->firma-Zuordnung:** eine firma = ein User (Flottenmanager) im MVP, oder mehrere Mitarbeiter mit Rollen? (organisationen-Bridge existiert.)
3. **Karten-Provisionierung:** Wer schreibt die NDEF-URL auf die physische Karte — wir bei Ausgabe (vorab-Token), oder die firma beim Binden? (Beeinflusst, ob `karten_token` bei `bestellt` oder erst bei `aktiv` entsteht.)
4. **DPIA jetzt parallel** starten (empfohlen, da Launch-Gate) oder nach Plan 1/2?
