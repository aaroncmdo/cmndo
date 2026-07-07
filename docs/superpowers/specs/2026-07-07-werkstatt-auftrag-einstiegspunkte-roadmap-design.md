# Werkstatt-Auftrags-Einstiegspunkte — Roadmap-Design

**Datum:** 2026-07-07
**Status:** Validiert (Aaron-Freigabe: 2-Segment-Rollen-Modell · typ-bewusste QR-Auto-Zuweisung · D zuerst) — bereit für Implementierungs-Plan (Sub-Projekt D)
**Worktree:** `.claude/worktrees/werkstatt-auftrag-view` (namensgebend für D)

## Ziel

Die Wege, auf denen **Reparatur-Aufträge zu einer Partner-Werkstatt kommen**, sauber modellieren, anzeigen und ausbauen. Ausgangspunkt: der QR-Flyer (gebaut) bringt der Werkstatt nur eine *Vermittler-Provision*, nicht automatisch den *Reparatur-Job*. Und die Werkstatt-Auftrags-Ansicht bildet die drei realen Geschäftsflüsse nicht korrekt ab.

## Kontext: die Werkstatt ist ein bidirektionaler Partner

Die Werkstatt steht in **zwei gegensätzlichen Rollen** zu einem Claim, gekeyed auf zwei verschiedene Spalten:

- **Vermittler** (`claims.werkstatt_id = werkstatt`) — *hat den Kunden geworben* → 150 € Provision. **Wir zahlen der Werkstatt.**
- **Reparateur** (`claims.reparatur_werkstatt_id = werkstatt`) — *macht die Reparatur* → verdient an der Reparatur. **Die Werkstatt verdient am Auftrag.**

Diese zwei Rollen ergeben drei (bzw. vier) reale Flüsse:

| # | Fluss | Richtung | Rolle | `abrechnungsweg` | Geld / Gutachten |
|---|---|---|---|---|---|
| ① | Selbstzahler-Reparatur | Wir → Werkstatt | Reparateur | `selbstzahler` | Kunde zahlt Werkstatt; **kein** Gutachten, eigener KVA |
| ② | Haftpflicht-Vermittlung | Werkstatt → Wir | Vermittler | (haftpflicht) | Wir zahlen 150 € Provision |
| ③ | Haftpflicht-Reparatur | Wir → Werkstatt | Reparateur | `haftpflicht` | Gegner-Versicherung zahlt; **Gutachten** steuert |
| ③b | Kasko-Reparatur | Wir → Werkstatt | Reparateur | `kasko` | Kaskoversicherung zahlt (SB); **Gutachten** steuert |

Ein **einziger Claim kann die Werkstatt in beiden Rollen** haben: sie wirbt einen Haftpflicht-Kunden (②) **und** repariert ihn danach (③) → zwei Geldströme auf einem Claim.

## Bestandsaufnahme (verifiziert 2026-07-07)

**Was bereits existiert und gut ist:**

- **`assignReparaturWerkstatt`** (`src/lib/werkstatt/vermittlung-server.ts`) — kanonische Reparatur-Zuweisung (setzt die 4 `reparatur_werkstatt_*`-Felder + benachrichtigt Kunde **und** Werkstatt via In-App + Email). 4 Einstiegspunkte: dispatcher / gutachter / kunde / flow. `quelle` ∈ {dispatcher, kunde, gutachter, embed}.
- **`v_werkstatt_auftrag`** — normalisierte, RLS-self-scoped View (5 Migrationen: Base + Status/Fahrzeug + Reparatur-Termin + Gutachten). Joint Claim + Fahrzeug + Gutachter + Besichtigung + Gutachten-Kennzahlen + Provision.
- **`is_werkstatt_for_claim(claim_id)`** — RLS-Gate, prüft `werkstatt_id` **OR** `reparatur_werkstatt_id` (beide Rollen sehen den Claim).
- **`findWerkstaetten` / `findReparaturWerkstaettenForTarget`** — Geo-Matching-Kern (5 nächste Partner).
- **`WerkstattFinderCard`** (Kunde-Portal, `quelle='kunde'`) + **`WerkstattFinderMap`** (SP-C2 Karte).
- **QR-Referral-Flow**: `/start/werkstatt-qr/[token]` → `/start/werkstatt/[werkstattId]` → `FinderWizard` setzt `lead.werkstatt_id` (Vermittler).
- **Design-Vorlage**: `2026-06-28-werkstatt-finder-vermittlung-design.md` (3-Phasen-Plan; P1 Dispatcher + P2 Kunde-Portal gebaut, P3 Embed offen).

**Die drei Lücken der aktuellen `v_werkstatt_auftrag` (relativ zum obigen Modell):**

1. **Kein `abrechnungsweg`** → ① und ③ sind beide `richtung='vermittelt'`, ununterscheidbar. Die Werkstatt sieht nicht Selbstzahler (kein Gutachten, Kunde zahlt) vs Haftpflicht/Kasko (Gutachten, Versicherung zahlt). **Kern-Lücke.**
2. **`COALESCE(reparatur_werkstatt_id, werkstatt_id)` kollabiert die Rolle** → wenn Werkstatt A wirbt (②) und B repariert (③), sieht A eine Zeile mit B's Namen. Rolle muss *aus Sicht der fragenden Werkstatt* berechnet werden.
3. **Dual-Rolle unsichtbar** — „geworben **und** repariere" ist nur implizit über den Provisions-Join.

**Was die View schon richtig macht:** `richtung = (reparatur_werkstatt_id NOT NULL) ? 'vermittelt' : 'inbound'` **ist** bereits der Reparateur/Vermittler-Split (die UI-Filterchips existieren). D baut darauf auf, kein Rewrite.

**Konsumenten von `v_werkstatt_auftrag`:** ausschließlich `src/app/werkstatt/(shell)/auftraege/*` + `src/lib/werkstatt/queries.ts` + `werkstatt-auftrag-phase.ts` — **kein externer Consumer**. Additive View-Änderung bleibt in D's Scope.

## Roadmap: D → A → B → C

```
D  Auftrags-Ansicht (rollen-korrekt + makler-analog)   ── Fundament ──▶ BAU 1
A  QR-Referral → Auto-Reparatur (typ-bewusst)          ── meine Lane ─▶ BAU 2
B  Werkstatt-Finder Embed (P3, supply-gated)           ── sauber ─────▶ BAU 3
C  Dispatcher-Auto-Matching                            ── fremde Lane ▶ KOORDINIERT/deferred
```

**Warum D zuerst:** Es ist die Landezone, in die A/B/C erst die Jobs kippen. Die Werkstatt muss zuerst korrekt *sehen*, was reinkommt (und in welcher Rolle), bevor wir mehr Volumen zutreiben. D ist zudem rein in `werkstatt/auftraege/*` (kein externer Consumer) → niedrigste Kollision.

---

## Sub-Projekt D — Werkstatt-Auftrags-Ansicht (rollen-korrekt + makler-analog) · BAU 1

**Ziel:** Die Aufträge makler-analog präsentieren (schlanke Liste + Detail-Drill-in statt inline-„bearbeiten") **und** die drei Flüsse korrekt modellieren (2 Segmente + Typ-Badge).

### Datenmodell (additive Migration auf die View, Regel 2)

`CREATE OR REPLACE VIEW v_werkstatt_auftrag` — bestehende Definition 1:1 übernehmen, **additiv**:

- `c.abrechnungsweg AS abrechnungsweg` — trennt ①(`selbstzahler`) von ③(`haftpflicht`)/③b(`kasko`).
- `c.werkstatt_id AS vermittler_werkstatt_id` **und** `c.reparatur_werkstatt_id AS reparatur_werkstatt_id` — **getrennt** exponiert (nicht mehr nur der COALESCE-Wert), damit die Rolle eindeutig ist.
- `meine_rolle` (`'reparateur'` / `'vermittler'` / `'beide'`) — berechnet gegen die **fragende Werkstatt** (Sub-Select `werkstaetten WHERE user_id = auth.uid()`, analog `is_werkstatt_for_claim`). Löst Lücke 2 + macht Lücke 3 explizit.
- Der bestehende `richtung`/`werkstatt_id`(COALESCE)-Ausgang **bleibt** für Rückwärtskompatibilität (bestehende Consumer brechen nicht).

Kein neuer View, keine neue Tabelle. `is_werkstatt_for_claim`-Gate unverändert.

### Query-Layer

`getWerkstattAuftraege()` (`src/lib/werkstatt/queries.ts`) selektiert die neuen Spalten mit. Neue schlanke Ableitung `werkstattAuftragSegment(row)` → `'reparatur' | 'vermittlung'` (rein, testbar): `reparatur_werkstatt_id = meine` → `'reparatur'` (auch bei Dual-Rolle), sonst `'vermittlung'`. Jeder Claim landet in **genau einem** Segment.

### UI (makler-analog: Liste + Detail)

Vorlage: `MaklerAktenList` + `/makler/akten/[id]`.

- **Liste** `WerkstattAuftraege` (Refactor): schlanke `DataTable`-Zeilen (Auftrag · Fahrzeug · Typ-Badge · Status · Provision) — **keine** inline-Aktionen/Modals mehr in der Zeile. Klick → Detailseite. Zwei Segment-Chips (**Reparatur-Aufträge** / **Meine Vermittlungen**) + Typ-Filter (Selbstzahler/Haftpflicht/Kasko) + Status. URL-State bleibt.
- **Detail** `src/app/werkstatt/(shell)/auftraege/[claimId]/page.tsx` (neu) — Access-Gate via `v_werkstatt_auftrag`-Read (RLS). Hierhin wandern die heute inline gestopften Blöcke: `ReparaturterminSektion` (Bestätigen/Anrufen/Ablehnen + Modal), `GutachtenSektion` (nur Haftpflicht/Kasko), `AuftragAktionen` (Resend/Flow). Segment-abhängig:
  - **Reparatur-Auftrag**: Typ-Badge · Gutachten (nur Versicherung) · Termin-Aktionen · „+ 150 € Vermittlung"-Badge falls `meine_rolle='beide'`.
  - **Vermittlung**: Provisions-Status + Fall-Status bei Claimondo · Resend-Flow-Link. Read-first.
- Bestehende Server-Actions (`auftraege/actions.ts`) unverändert wiederverwenden (nur Aufruf-Ort wandert Liste → Detail).

### Testing
`werkstattAuftragSegment` (Unit: reparatur/vermittlung/dual) · View-READ-Smoke (neue Spalten + `meine_rolle` gegen Test-Werkstatt) · Liste- + Detail-Render (env=node, Element-Tree-Muster).

### Im Build nageln
Exakte `abrechnungsweg`-Label (DE) · `meine_rolle`-Sub-Select-Form · Detail-Route-Segment-Gate · ob `kasko` eigenes Badge oder mit Haftpflicht gruppiert (Vorschlag: eigenes Badge, aber Gutachten-Block teilen).

---

## Sub-Projekt A — QR-Referral → Auto-Reparatur (typ-bewusst) · BAU 2

**Ziel:** Die Werkstatt, deren QR-Flyer den Kunden brachte (`werkstatt_id`), wird zur Reparatur-Werkstatt (`reparatur_werkstatt_id`) — typ-bewusst getimt.

- **Selbstzahler (①):** bei Claim-Erzeugung (`convertLeadToClaim`, additiver Block wie KB-Skip) → wenn `abrechnungsweg='selbstzahler'` + `werkstatt_id` gesetzt + `reparatur_werkstatt_id` leer → `assignReparaturWerkstatt(quelle='qr_referral')`. **Sofort.**
- **Haftpflicht/Kasko (③):** *nicht* sofort. `WerkstattFinderCard` (Portal, rendert zur Reparatur-Zeit = nach Gutachten) **highlightet die werbende Werkstatt vorausgewählt** → 1 Tap bestätigt → `assignReparaturWerkstatt`.

**Migration:** `reparatur_werkstatt_quelle`-CHECK um `'qr_referral'` erweitern (Regel 2).
**Bausteine:** reine `resolveQrReparaturWerkstatt()` (testbar) · `convertLeadToClaim` additiv · `WerkstattFinderCard` Vorauswahl-State (meins).
**Koordination:** `convert-lead-to-claim` (heiß, additiv) · `WerkstattFinderCard` (meins) · `/start/werkstatt` nur lesen (aar-956 unberührt).
**Im Build nageln:** Setzt der Selbstzahler-QR-Pfad `werkstatt_id` auf den Lead? (verifizieren) · Nach A landen ①-Aufträge in D's „Reparatur-Aufträge" mit Selbstzahler-Badge = end-to-end-Kohärenz mit D.

## Sub-Projekt B — Werkstatt-Finder Embed (P3) · BAU 3

**Ziel:** Öffentlicher Embed `/embed/werkstatt-finder` (wie `embed/gutachter-finder`) — Kunde sucht Reparaturbetrieb → findet Partner auf Karte → startet Reparatur-Anfrage → Werkstatt kriegt Job (`quelle='embed'`).
**Reuse:** `findWerkstaetten` + `WerkstattFinderMap` (SP-C2) + neue Lead-Action.
**Supply-Gate:** < N Partner in der Nähe → „Wir matchen dich"-Fallback statt leerer Finder.
**Koordination:** neue Embed-Fläche (eigener Build), aar-956-Finder unberührt.

## Sub-Projekt C — Dispatcher-Auto-Matching · KOORDINIERT/deferred

**Ziel:** Statt manueller Suche → Auto-Vorschlag Top-N nächste Partner (`findReparaturWerkstaettenForTarget` existiert) + 1-Klick-Zuweisung.
**⚠ NICHT jetzt bauen:** `dispatch/leads` ist aktive Lane einer anderen Session (Dispatch-Rebuild). Entweder dort bauen oder *nach* deren Merge obendrauf. Koordinations-Gate im eigenen Spec.

---

## Migrationen (gesamt, additiv, Regel 2 / Supabase-Plugin)

1. **D:** `v_werkstatt_auftrag` additiv (`abrechnungsweg`, `vermittler_werkstatt_id`, `reparatur_werkstatt_id` getrennt, `meine_rolle`).
2. **A:** `reparatur_werkstatt_quelle`-CHECK um `'qr_referral'` erweitern.

Kein neues Feld auf Basis-Tabellen (alles existiert). Twin-Drift-Regel (File == getrackte Version) beachten.

## Koordination

- **D:** `v_werkstatt_auftrag` + `werkstatt/auftraege/*` — alle Consumer in diesem Bereich, kein externer. Werkstatt-Portal-Nachbarschaft (Login/Onboarding-Session) fasst andere Files an. Neue Detail-Route = additiv.
- **A:** `convert-lead-to-claim.ts` (heiß, streng additiv) · `WerkstattFinderCard` (meins).
- **B:** neue Embed-Fläche.
- **C:** deferred (fremde Lane).

## Offene Business-Frage (nicht blockierend für D)

Fluss ① Selbstzahler-Vermittlung: Zahlt die Werkstatt *uns* eine Provision für einen zugeführten Selbstzahler (umgekehrte Geldrichtung zu ②)? Falls ja, braucht „Meine Vermittlungen" später eine zweite Provisions-Art. D zeigt zunächst nur, was in `werkstatt_provisionen` steht — additiv erweiterbar.
