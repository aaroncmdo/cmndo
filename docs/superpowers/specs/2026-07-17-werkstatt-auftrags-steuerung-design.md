# Spec E — Werkstatt-Auftrags-Steuerung: KVA-first vs. Direkt-Reparatur (17.07.2026)

**Status: v2 nach Aaron-Feedback 17.07.** — Fragen 1+2+4 entschieden, Frage 3 offen (§3).
Kern-Erweiterung v2: **die KVA-QUELLE ist die fehlende Dimension** — der Kunde bringt oft
schon einen KVA mit; dann ist die „Werkstatt erstellt → Kunde gibt frei"-Schleife absurd.
Der Kunde soll ihn selbst hochladen koennen (vollstaendige Weitergabe an die Werkstatt),
und er soll auch explizit „ohne KVA direkt beauftragen" waehlen koennen.
Handoff-Task J/„Spec E" der werkstatt-embed-Lane. Reines Design-Doc — kein Code in diesem PR.

## 1 · Problem

Der vermittelte Werkstatt-Auftrag (Kasko/Selbstzahler-Weg) hat **keinen gesteuerten Modus**.
Nach der Vermittlung (`reparatur_vermittlung_status='vermittelt'` + `reparatur_termine`-Row +
„Neuer Auftrag"-Email) stehen der Werkstatt ALLE Aktionen gleichzeitig offen, ohne dass
irgendetwas sagt, was erwartet wird:

* `schlageWerkstattTerminVor` / `bestaetigeReparaturtermin` (Terminfindung sofort moeglich)
* `erstelleKvaFuerAuftrag` (KVA-Upload mit OCR — existiert, optional)
* `markiereReparaturErledigt` (Abschluss)

**Verifizierte Luecken (Code-Read + prod-Schema 17.07.):**

| # | Gap | Beleg |
|---|---|---|
| G1 | **Kein Modus-Feld** — nichts unterscheidet „erst KVA, dann Freigabe, dann Reparatur" von „direkt reparieren" | claims-Spalten: kostenvoranschlag_netto/brutto, reparatur_freigegeben_am/von, reparatur_vermittlung_status {offen,eigene,vermittelt,abgelehnt} — kein modus/typ |
| G2 | **Kundenfreigabe wird NIRGENDS erzwungen** — `kva-freigabe-actions.ts` setzt `reparatur_freigegeben_am`, aber keine Werkstatt-Aktion prueft es (einziger „freigegeben"-Treffer in den Auftrags-Actions = Provisions-Status) → die Werkstatt kann terminieren/abschliessen, bevor der Kunde die Kosten je gesehen hat. Beim Selbstzahler = unkontrolliertes Kostenrisiko des Kunden. | grep auftraege/actions.ts + reparatur-abschluss-actions.ts |
| G3 | **KVA-Upload sendet nichts** — der Kunde erfaehrt vom eingereichten KVA nur per Portal-Blick (0 notify/sendEmail im Funktions-Body). Die Kunde-Aufgabe „Reparaturauftrag freigeben" (deriveKundeAufgaben, b3-Arbeit #4468) erscheint erst, wenn er zufaellig reinschaut. | erstelleKvaFuerAuftrag :363ff |
| G4 | **KVA hat keine Zustands-Achse** — nur Werte (netto/brutto/pdf/reparaturdauer_tage_kva) + Freigabe-Timestamp. „Angefordert/eingereicht/abgelehnt" ist nicht darstellbar; eine Ablehnung ist gar nicht modellierbar. | Schema |

| G5 | **Kunden-KVA-Weg existiert nicht** — obwohl die Zubringer-Schiene bis zum Claim reicht (gfa→Lead→`convert-lead-to-claim.ts:449` kopiert `kostenvoranschlag_netto/brutto`), gibt es fuer den KUNDEN keinen Upload (weder im Flow-`FlowWerkstattStep` noch im Portal — kunde/faelle hat nur Freigabe + Schadensfotos) und keine Quellen-Kennzeichnung/PDF-Weitergabe an die Werkstatt. | grep 17.07. |

Verwandt, nicht Scope: das Standalone-KVA-Modul der Werkstatt (`(shell)/kva/` —
`erstelleWerkstattLeadAusKva` = Werkstatt-als-Zubringer, eigener Funnel) und der
Operativ-Luecken-Fund „Werkstatt-Abschluss umgeht State-Machine"
([[audit-operativ-luecken-normalisierung-2026-07-17]] — Abschluss-Pfad, eigene Lane).

## 2 · Zielbild

**Ein Modus pro Auftrag, eine KVA-Quelle, derived Zustaende, erzwungene Freigabe nur wo
sie schuetzt, Sends an den Uebergaengen.**

### 2.0 KVA-Quellen — die drei Wege zum offenen Termin-Gate (v2, Aaron 17.07.)

| Weg | Ablauf | Gate |
|---|---|---|
| **A — Kunde bringt KVA mit** | Upload im Flow-`werkstatt`-Step oder Kunde-Portal → OCR (Reuse `extrahiereKva*`) → Werte+PDF am Claim, `kva_quelle='kunde'` → **vollstaendige Weitergabe** an die Werkstatt (PDF + Werte prominent im Auftrags-Detail, „vom Kunden eingereicht") | **OFFEN** — der Kunde kennt den Preis (selbst eingebracht); die Werkstatt kann direkt terminieren. Will sie einen ANDEREN Preis → eigener Gegen-KVA (`kva_quelle` wechselt auf `'werkstatt'`) → Gate wieder ZU bis Kundenfreigabe. Kein „Uebernahme"-Feld noetig — die Quelle steuert. |
| **B — Kunde waehlt „ohne KVA direkt beauftragen"** | explizite Wahl im Flow/Portal (mit Kosten-Hinweis) → setzt `reparatur_auftrag_modus='direkt'` (+ `modus_gesetzt_von/_am` als Beleg fuer den Streitfall) | OFFEN |
| **C — Werkstatt erstellt KVA** (Default-Weg) | `kva_erst` ohne Kunden-KVA: Werkstatt liefert (`erstelleKvaFuerAuftrag`, `kva_quelle='werkstatt'`) → Kunde gibt frei / lehnt ab | ZU bis `reparatur_freigegeben_am` |

Zubringer-KVA (gfa/Werkstatt-Lead-Funnel, Werte kommen heute schon via convert an):
`kva_quelle='zubringer'` — verhaelt sich wie A (Preisanker bekannt), Backfill-Quelle.

### 2.1 Schema-Delta (minimal, alles auf claims)

```
reparatur_auftrag_modus text NOT NULL DEFAULT 'kva_erst'
  CHECK (reparatur_auftrag_modus in ('kva_erst','direkt'))
reparatur_auftrag_modus_gesetzt_von uuid NULL   -- Beleg fuer Kunde-gewaehltes 'direkt' (Streitfall)
reparatur_auftrag_modus_gesetzt_am timestamptz NULL
kva_quelle text NULL CHECK (kva_quelle in ('kunde','werkstatt','zubringer'))
kva_abgelehnt_am timestamptz NULL               -- s. 2.4
kva_abgelehnt_grund text NULL
```

* `kva_erst` — Terminfindung/Reparatur erst, wenn der Preis kunde-seitig bekannt ist
  (Freigabe ODER Kunden-/Zubringer-KVA). **Default.**
* `direkt` — Terminfindung sofort (Bagatell/Express, VS-Direktabrechnung, oder Kunde hat
  explizit „ohne KVA direkt beauftragen" gewaehlt — Weg B).

**Bewusst KEIN neues Status-Feld** (T3-Philosophie „eine Achse, derived-first"): der
Auftrags-Zustand ergibt sich vollstaendig aus vorhandenen Achsen + kva_quelle:

| Derived-Zustand | Bedingung | Sichtbar als |
|---|---|---|
| KVA erstellen | modus=kva_erst ∧ kein KVA | Werkstatt-CTA (prominent), Kunde-Stepper „Kostenvoranschlag ausstehend" + Kunde-Upload-CTA (Weg A) |
| Wartet auf Freigabe | kva_quelle='werkstatt' ∧ Werte da ∧ !freigegeben ∧ !abgelehnt | Kunde-Aufgabe `kva_freigabe` (existiert, #4468) + **neuer Send** |
| Terminfindung | GATE OFFEN (s. 2.2) ∧ kein bestaetigter Termin | bestehender reparatur_termine-Loop {angefragt, werkstatt_vorschlag, anruf_erbeten, …} |
| Laeuft / Fertig | bestaetigt / erledigt | bestehend (WS6-Subphasen) |
| KVA abgelehnt | kva_abgelehnt_am gesetzt | Dispatch-Eskalation; Werkstatt darf Gegen-KVA |

### 2.2 Gates (server-seitig, der eigentliche Fix fuer G2)

**Gate-Formel** (eine Funktion, z.B. `istReparaturGateOffen(claim)` in
`@/lib/werkstatt/auftrag-gate.ts`, unit-getestet — Konsumenten: `schlageWerkstattTerminVor`,
`bestaetigeReparaturtermin`, Abschluss-Action, UI):

```
OFFEN ⟺ modus = 'direkt'
      ∨ kva_quelle ∈ ('kunde','zubringer')          -- Preis kunde-seitig eingebracht
      ∨ (kva_quelle = 'werkstatt' ∧ reparatur_freigegeben_am IS NOT NULL)
```

Werkstatt-Gegen-KVA auf einen Kunden-KVA setzt `kva_quelle='werkstatt'` (+ nullt
freigegeben/abgelehnt) → Gate faellt automatisch wieder ZU bis zur Kundenfreigabe.
UI folgt dem Gate (Auftrags-Detail zeigt den erwarteten naechsten Schritt als einzigen
Primaer-CTA; Termin-Sektion gedimmt mit Erklaertext solange gated).

### 2.3 Sends (dockt an die Benachrichtigungs-Matrix an, PR #4490)

| Uebergang | Empfaenger | Kanal |
|---|---|---|
| Werkstatt-KVA eingereicht (G3) | Kunde | Email + In-App („Reparaturauftrag freigeben", Deep-Link GeldZone) |
| **Kunden-KVA eingereicht (Weg A)** | Werkstatt | Auftrags-Update („Kostenvoranschlag vom Kunden — Termin vorschlagen oder eigenen KVA stellen") |
| Kunde gibt frei | Werkstatt | `notify-werkstatt-kundenreaktion` um Ereignis `kva_freigegeben` erweitern |
| Kunde lehnt ab | Werkstatt + Dispatch | Mitteilung + Email (Eskalation) |

### 2.4 Ablehnungs-Pfad (minimal)

`claims.kva_abgelehnt_am timestamptz` + `kva_abgelehnt_grund text` (Kunde-Aktion neben der
Freigabe in `KostenvoranschlagCard`). Folge: Dispatch-Mitteilung; Werkstatt darf einen neuen
KVA einreichen (Werte ueberschreiben, abgelehnt_am nullen). KEINE automatische
Werkstatt-Neuvermittlung in Phase 1 (Dispatch entscheidet manuell).

### 2.5 Kontext Haftpflicht + fiktive Abrechnung (v2, Aaron 17.07. — „besonders relevant")

Der Werkstatt-Auftrag ist NICHT nur ein Direct-Weg-Thema (kasko/selbstzahler): bei
**Haftpflicht mit fiktiver Abrechnung** (`reparaturwunsch='fiktiv'`) ist er die ZWEITE
Fallphase — und wirtschaftlich der staerkste Anwendungsfall:

**Der Loop:** Gutachten → fiktive Auszahlung (netto, § 249 II BGB — der Geschaedigte
disponiert frei, gesetzliches Wahlrecht) → der Kunde hat das Budget in der Hand → Claimondo
vermittelt die Partner-Werkstatt, die guenstiger repariert als die Gutachten-Kalkulation →
**Differenz = Kundenvorteil, Vermittlung = Provision** (Haftpflicht-Fall → das
inbound-Haftpflicht-Provisionsmodell greift, [[audit-werkstatt-provision-dbdriven-model]]).

**Die KVA-Rolle wechselt hier:** nicht Kostenschutz (Selbstzahler), sondern
**Ersparnis-Beweis gegen den Budget-Anker** — Kunde-Anzeige: KVA-Betrag vs.
Gutachten-Reparaturkosten/Auszahlung („Ihre Ersparnis: X €"). Modus/Quelle/Gates aus
2.0–2.2 gelten UNVERAENDERT (das Modell generalisiert; kva_erst-Default passt: der Kunde
will die Zahl sehen, BEVOR er sein ausgezahltes Geld bindet).

**Drei Leitplanken:**
1. **Budget-Asymmetrie (Design-Entscheidung):** die Werkstatt sieht die Auszahlungshoehe /
   Gutachten-Kalkulation NICHT — sonst ankert ihr KVA am Kundenbudget statt am Aufwand.
   Kunde sieht die Ersparnis, Werkstatt nur den Auftrag.
2. **MwSt-Nachforderung als Nachfass-Play:** fiktiv = netto; bei tatsaechlicher Reparatur
   ist die angefallene MwSt mit Rechnung bei der VS nachforderbar (§ 249 II 2). Aktiver
   Kunde-Hinweis nach Reparatur-Abschluss („Rechnung einreichen → +19 %") — offenbart der
   VS die Reparatur (legal); die Wahl gehoert transparent dem Kunden. → Phase 3, Kanzlei-Zone.
3. **Nutzungsausfall** braucht bei fiktiv den Reparatur-Nachweis — zweites Nachfass-Play,
   Kanzlei-Zone. (Totalschaden/130 %: fiktiv capped auf WBW−Restwert; Vermittlung unter
   Budget bleibt sinnvoll — Randfall, keine Sonderlogik Phase 1.)

**Einstiegspunkt (UI):** `FiktiveAbrechnungCard`/`AuszahlungCard` bekommen den
Vermittlungs-CTA („Mit Ihrer Auszahlung guenstiger reparieren — Partner-Werkstatt finden")
→ bestehender WerkstattFinder-Flow (target claim). Gate-Oeffnung der GeldZone-Werkstatt-
Strecke fuer Haftpflicht-Claims mit `reparaturwunsch='fiktiv'` ∧ Auszahlung erfolgt.

### 2.6 Subphasen-Anzeige (Koordination Status-Achsen-Lane)

KEIN neuer Subphasen-Wert (kein CHECK-Delta): `reparatur_terminfindung` bleibt; nur das
**Label** differenziert client-seitig nach KVA-Zustand („Kostenvoranschlag ausstehend" /
„Wartet auf Ihre Freigabe" / „Terminfindung"). Muss mit der Status-Achsen-Lane abgestimmt
werden (lifecycle.ts = deren Zone; das Muster „Label-Verfeinerung ohne neuen Statuswert"
haben sie in #4471 selbst etabliert).

## 3 · Produktentscheidungen (Stand 17.07., Aaron)

1. ✅ **ENTSCHIEDEN: ja** — Default `kva_erst` fuer beide Direct-Wege (kasko + selbstzahler);
   gilt analog fuer den Haftpflicht-fiktiv-Kontext (2.5).
2. ✅ **ENTSCHIEDEN** — der Modus-/Gate-Hebel verteilt sich so:
   * **Kunde**: (i) eigenen KVA hochladen (Weg A — vollstaendige Weitergabe an die
     Werkstatt) UND (ii) explizit „ohne KVA direkt beauftragen" (Weg B, Aaron: „brauchen
     wir auch") — beides im Flow-`werkstatt`-Step + Kunde-Portal.
   * **Dispatch/Admin**: Modus-Toggle am Fall (operative Faelle: Express, VS-Direktabrechnung).
   * **Werkstatt**: NIE (Interessenkonflikt — sie wuerde sich selbst vom Kostenschutz-Gate
     befreien).
3. ⏳ **OFFEN (Bestaetigung):** Werkstatt sieht den Modus + KVA-Quelle read-only mit
   Erklaertext („Der Kunde erwartet zuerst einen Kostenvoranschlag" / „Kostenvoranschlag
   vom Kunden eingereicht"). Empfehlung: ja — sonst weiss sie wieder nicht, was erwartet
   wird. **Zusatzfrage aus 2.5:** Budget-Asymmetrie bestaetigen (Werkstatt sieht
   Auszahlung/Gutachten-Kalkulation NICHT)? Empfehlung: ja.
4. ✅ **ENTSCHIEDEN: ja** — Backfill: Claims mit bereits bestaetigtem/erledigtem Termin →
   `direkt`, sonst `kva_erst`; vorhandene Zubringer-Werte → `kva_quelle='zubringer'`.

## 4 · Phasenplan (v2)

| Phase | Inhalt | Groesse |
|---|---|---|
| 1a | Mig (2.1: modus/quelle/abgelehnt/gesetzt_von) · Gate-Funktion + Server-Gates · Sends (2.3) · Werkstatt-UI-Fuehrung (inkl. Kunden-KVA-Anzeige + Gegen-KVA) · Backfill (Q4) | M |
| 1b | **Kunde-KVA-Upload** (Weg A): Flow-`FlowWerkstattStep` „Haben Sie schon einen Kostenvoranschlag?" [Upload (OCR-Reuse `extrahiereKva*`) / Nein (Default C) / **„Ohne KVA direkt beauftragen"** (Weg B, mit Kosten-Hinweis)] + Kunde-Portal-Pendant (GeldZone) | M |
| 2 | Dispatch-Toggle · Modus-/Quelle-Sicht Werkstatt (Q3) · Label-Verfeinerung Stepper (Koord. Status-Achsen) · **Haftpflicht-fiktiv-Einstieg** (2.5: CTA auf FiktiveAbrechnungCard/AuszahlungCard + Ersparnis-Anzeige) | M |
| 3 | MwSt-/Nutzungsausfall-Nachfass (2.5, Kanzlei-Zone) · Neuvermittlungs-Automatik nach Ablehnung | Produkt-abhaengig |

**Abgrenzung:** Kein neuer Status-Enum, keine Aenderung an reparatur_termine.status,
kein Eingriff in den Abschluss-Pfad (fremder Audit-Fund), kein Provisions-Touch
(reparatur-abschluss-actions Provisions-Freigabe bleibt unberuehrt).

Rueckfragen: werkstatt-embed-Lane (8750c452), [[coordination-werkstatt-embed-rebuild]].
