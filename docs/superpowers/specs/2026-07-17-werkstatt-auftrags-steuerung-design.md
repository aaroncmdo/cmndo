# Spec E — Werkstatt-Auftrags-Steuerung: KVA-first vs. Direkt-Reparatur (17.07.2026)

**Status: ENTWURF zur Produktentscheidung (Aaron).** Handoff-Task J/„Spec E" der
werkstatt-embed-Lane. Reines Design-Doc — kein Code in diesem PR.

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

Verwandt, nicht Scope: das Standalone-KVA-Modul der Werkstatt (`(shell)/kva/` —
`erstelleWerkstattLeadAusKva` = Werkstatt-als-Zubringer, eigener Funnel) und der
Operativ-Luecken-Fund „Werkstatt-Abschluss umgeht State-Machine"
([[audit-operativ-luecken-normalisierung-2026-07-17]] — Abschluss-Pfad, eigene Lane).

## 2 · Zielbild

**Ein Modus pro Auftrag, derived Zustaende, erzwungene Freigabe, Sends an den Uebergaengen.**

### 2.1 Neues Feld (das EINZIGE Schema-Delta)

```
claims.reparatur_auftrag_modus text NOT NULL DEFAULT 'kva_erst'
  CHECK (reparatur_auftrag_modus in ('kva_erst','direkt'))
```

* `kva_erst` — Werkstatt liefert zuerst den KVA; Terminfindung/Reparatur erst nach
  Kundenfreigabe. **Default** (Kostenschutz; beim Kasko zusaetzlich der Beleg fuer die VS).
* `direkt` — Terminfindung sofort (Bagatell/Expressfall, oder Kunde hat explizit zugestimmt).

**Bewusst KEIN neues Status-Feld** (T3-Philosophie „eine Achse, derived-first"): der
Auftrags-Zustand ergibt sich vollstaendig aus vorhandenen Achsen:

| Derived-Zustand | Bedingung | Sichtbar als |
|---|---|---|
| KVA erstellen | modus=kva_erst ∧ kostenvoranschlag_brutto IS NULL | Werkstatt-CTA (prominent), Kunde-Stepper „Kostenvoranschlag ausstehend" |
| Wartet auf Freigabe | KVA-Werte da ∧ reparatur_freigegeben_am IS NULL | Kunde-Aufgabe `kva_freigabe` (existiert, #4468) + **neuer Send G3** |
| Terminfindung | (freigegeben ∨ modus=direkt) ∧ kein bestaetigter Termin | bestehender reparatur_termine-Loop {angefragt, werkstatt_vorschlag, anruf_erbeten, …} |
| Laeuft / Fertig | bestaetigt / erledigt | bestehend (WS6-Subphasen) |
| KVA abgelehnt | NEU: kva_abgelehnt_am (s. 2.4) | Dispatch-Eskalation |

### 2.2 Gates (server-seitig, der eigentliche Fix fuer G2)

In `schlageWerkstattTerminVor` + `bestaetigeReparaturtermin` (+ Abschluss):

```
if (modus === 'kva_erst' && !reparatur_freigegeben_am)
  return { ok: false, error: 'Erst Kostenvoranschlag einreichen und Kundenfreigabe abwarten.' }
```

UI folgt dem Gate (Werkstatt-Auftrags-Detail zeigt den erwarteten naechsten Schritt als
einzigen Primaer-CTA; Termin-Sektion gedimmt mit Erklaertext solange gated).

### 2.3 Sends (dockt an die Benachrichtigungs-Matrix an, PR #4490)

| Uebergang | Empfaenger | Kanal |
|---|---|---|
| KVA eingereicht (G3) | Kunde | Email + In-App („Reparaturauftrag freigeben", Deep-Link GeldZone) |
| Kunde gibt frei | Werkstatt | `notify-werkstatt-kundenreaktion` um Ereignis `kva_freigegeben` erweitern |
| Kunde lehnt ab | Werkstatt + Dispatch | Mitteilung + Email (Eskalation) |

### 2.4 Ablehnungs-Pfad (minimal)

`claims.kva_abgelehnt_am timestamptz` + `kva_abgelehnt_grund text` (Kunde-Aktion neben der
Freigabe in `KostenvoranschlagCard`). Folge: Dispatch-Mitteilung; Werkstatt darf einen neuen
KVA einreichen (Werte ueberschreiben, abgelehnt_am nullen). KEINE automatische
Werkstatt-Neuvermittlung in Phase 1 (Dispatch entscheidet manuell).

### 2.5 Subphasen-Anzeige (Koordination Status-Achsen-Lane)

KEIN neuer Subphasen-Wert (kein CHECK-Delta): `reparatur_terminfindung` bleibt; nur das
**Label** differenziert client-seitig nach KVA-Zustand („Kostenvoranschlag ausstehend" /
„Wartet auf Ihre Freigabe" / „Terminfindung"). Muss mit der Status-Achsen-Lane abgestimmt
werden (lifecycle.ts = deren Zone; das Muster „Label-Verfeinerung ohne neuen Statuswert"
haben sie in #4471 selbst etabliert).

## 3 · Wer setzt den Modus? (PRODUKTFRAGEN an Aaron)

1. **Default `kva_erst` fuer BEIDE Direct-Wege (kasko + selbstzahler)?** Empfehlung: ja —
   Kostenschutz + VS-Beleg; `direkt` ist der bewusste Ausnahme-Hebel.
2. **Wer darf auf `direkt` stellen?** Empfehlung Phase 1: Dispatch/Admin am Fall
   (Detail-Drawer-Toggle). Spaeter optional: Kunde im Flow („Reparatur sofort beauftragen —
   Kosten trage ich ohne Voranschlag") — bewusst NICHT Phase 1 (Conversion-Risiko unklar).
3. **Darf die WERKSTATT den Modus sehen inkl. Begruendung?** Empfehlung: ja, read-only
   („Der Kunde erwartet zuerst einen Kostenvoranschlag").
4. **Bestandsauftraege** (vermittelt, ohne KVA, vor Rollout): Default wuerde sie auf
   `kva_erst` gaten. Empfehlung: Backfill `direkt` fuer Claims mit bereits bestaetigtem/
   erledigtem Termin, sonst `kva_erst`.

## 4 · Phasenplan

| Phase | Inhalt | Groesse |
|---|---|---|
| 1 | Mig (modus + kva_abgelehnt_*) · Server-Gates · KVA-Send (G3) · Werkstatt-UI-Fuehrung · Freigabe/Ablehnung-Sends · Backfill | M |
| 2 | Dispatch-Toggle + Modus-Sicht Werkstatt · Label-Verfeinerung Stepper (Koord. Status-Achsen) | S |
| 3 | Kunde-Wahl im Flow · Neuvermittlungs-Automatik nach Ablehnung | Produkt-abhaengig |

**Abgrenzung:** Kein neuer Status-Enum, keine Aenderung an reparatur_termine.status,
kein Eingriff in den Abschluss-Pfad (fremder Audit-Fund), kein Provisions-Touch
(reparatur-abschluss-actions Provisions-Freigabe bleibt unberuehrt).

Rueckfragen: werkstatt-embed-Lane (8750c452), [[coordination-werkstatt-embed-rebuild]].
