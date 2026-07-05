# Werkstatt — Einheitliche, filterbare, normalisierte Auftragsansicht (Design-Spec)

**Datum:** 2026-07-04 · **Status:** Design (Brainstorm), Build gestaffelt (Aaron: „Spec alles, Build gestaffelt")

## Ziel

**Eine** View für die Werkstatt, die **alle** ihre Aufträge — beide Richtungen — in **einer filterbaren, normalisierten Liste** zeigt (verfolgbar via Filterbubble), plus nachträgliche Aktionen (Link erneut senden, Flow selbst durchklicken, KVA, bearbeiten).

## Ausgangslage (prod-verifiziert)

- **SSoT existiert:** `v_werkstatt_auftrag` — 1 Zeile/Claim, 37 Spalten, RLS-gegatet (SECURITY DEFINER, `is_staff() OR is_werkstatt_for_claim`), **beide Richtungen** (`richtung='inbound'` = QR/„meine Vermittlung", `='vermittelt'` = Claimondo-vermittelte Reparatur). Enthält Fahrzeug, Schaden, Besichtigung+Gutachter, Kunde-Name, Provision, `operative_status`, Reparatur-Termin (SP2), Gutachten-Kennzahlen (SP3). **[cec48090s Lane]**
- **UI existiert + ist live auf prod** (`/werkstatt/(shell)/auftraege` → `src/components/werkstatt/WerkstattAuftraege.tsx`, Route 307): flache DataTable **ohne Filter**; `reparaturwunsch` wird **roh** gezeigt (`reparatur`/`fiktiv`); die „Status"-Spalte zeigt **nur** `operative_status` (2 von N Enum-Werten gelabelt), nicht den Reparatur-Termin-/Gutachten-Stand.
- **Daten heute:** 6 Werkstatt-Claims, alle `inbound`; 0 `vermittelt` (Vermittlungs-Flow live, prod-noch-ungenutzt). Alle 6 haben einen `flow_link` (resendbar); nur 2/6 haben einen Kunde-Account → die meisten Kunden sind **mitten im Flow** (steckengeblieben) → genau der Grund für „Link resenden / Flow durchklicken".

**Dieses Design ist ADDITIV** auf die bestehende View + Component — **keine `v_werkstatt_auftrag`-Änderung** (37 Spalten reichen). Es überschneidet cec48090s aktive Werkstatt-Lane → **koordiniert** (Handoff oder abgestimmter Build).

## Design

### ① Normalisierter „Auftrag-Status" — der Kern von „normalisierte Werte"

Die View hält Status aus **5 Subsystemen** (`operative_status`, `besichtigung_status`, `reparatur_termin_status`, Gutachten-fertig, `vermittlung_status`). Der Werkstatt 5 rohe Enum-Status zu zeigen ist verwirrend. Lösung: **ein** abgeleiteter Status pro Zeile.

**Neuer client-safe Helper** `werkstattAuftragPhase(row): { key: PhaseKey; label: string; ton: 'neutral'|'info'|'success'|'warning'|'danger' }` in `src/lib/werkstatt/werkstatt-auftrag-phase.ts` (Muster wie SP2s `reparaturTerminPhase`, testbar, DB-getrieben). **Präzedenz — der weiteste Stand gewinnt:**

| Reihenfolge | Bedingung (aus v_werkstatt_auftrag) | `key` | Label | ton |
|---|---|---|---|---|
| 1 | `reparatur_termin_status` ∈ {storniert, abgelehnt} | `abgelehnt` | Termin abgelehnt | danger |
| 2 | `reparatur_termin_status = 'erledigt'` | `erledigt` | Erledigt | success |
| 3 | `reparatur_termin_status = 'bestaetigt'` | `termin_bestaetigt` | Termin bestätigt | success |
| 4 | `reparatur_termin_status` ∈ {angefragt, anruf_erbeten} | `termin_offen` | Termin offen | warning |
| 5 | `gutachten_fertiggestellt_am` gesetzt **und** `gutachten_totalschaden` | `totalschaden` | Totalschaden | danger |
| 6 | `gutachten_fertiggestellt_am` gesetzt | `gutachten_da` | Gutachten liegt vor | info |
| 7 | `operative_status = 'sv-termin'` **oder** `besichtigung_start` gesetzt | `besichtigung` | Besichtigung | info |
| 8 | sonst | `neu` | Neu | neutral |

Rendering via bestehendes `StatusBadge` (Token-basiert, keine raw Status-Scales). **Sonder-Marker** (nicht Teil der Leiter, additiv als Badge): `reparaturwunsch='fiktiv'` → „Fiktiv" (keine Reparatur), damit die Werkstatt weiß, dass hier ggf. kein Reparaturauftrag folgt.

**Label-Normalisierung (die restlichen rohen Werte):**
- `reparaturwunsch`: `reparatur`→„Reparatur", `fiktiv`→„Fiktiv", `unentschieden`→„Unentschieden" (aktuell roh).
- `operative_status`: vollständige Map (aktuell nur 2 Werte).
- `richtung`: `inbound`→„Meine Vermittlung", `vermittelt`→„Auftrag" (heute „Eigener Kunde"/„Vermittelt" — an die neue Filter-Sprache angleichen).
- Datum/Geld: bereits `Intl`-formatiert (beibehalten).

### ② Filterbubble

Chips-Leiste über der Tabelle, **client-seitig gefiltert** (Liste ist klein — kein Server-Roundtrip). Filter-State in der **URL-Query** (`?richtung=…&status=…`) → teilbar + refresh-stabil.

- **Richtung** (Single): `Alle` · `Meine Vermittlungen` (inbound) · `Aufträge` (vermittelt)
- **Status** (Multi): die 8 Phasen aus ① (als Chips; leere Kategorien optional ausgrauen)
- **Optional** (Multi): `Reparatur` · `Fiktiv` · `Totalschaden`

Aktive Chips zeigen Count. „Alle zurücksetzen"-Chip wenn Filter aktiv. Reuse `Chip` (`@/components/ui/Chip`).

### ③ Nachträgliche Aktionen (je Auftrag)

Alle server-actions gegatet auf **`is_werkstatt_for_claim`** (dieselbe Ownership wie die View — kein IDOR). Result-Object `{ ok, error? }`.

- **Link erneut senden** — der Kunde steckt im Flow (4/6 ohne Account). Reuse `ensureFlowLinkForLead` / `issueCanonicalFlowLinkForAnfrage` + `dispatchMagicLink` (WhatsApp→Email). Server-Action `resendeKundenLink(claimId)`: claim→lead→flow_link → re-dispatch. Non-fatal, Toast.
- **Flow öffnen / durchklicken** — die Werkstatt sitzt mit dem Kunden vor Ort und hilft durch den Flow. Server-Action `oeffneKundenFlow(claimId)`: gated resolve claim→flow_link.token → Redirect auf `/flow/<token>` (Werkstatt als Proxy). **⚠ siehe Offene Entscheidung 1 (Auth/Token-Exposition).**
- **KVA hoch­laden / ansehen** — die Werkstatt lädt einen Kostenvoranschlag hoch. Reuse `kostenvoranschlag-ocr` (Upload→OCR→an Claim/Storage). Anzeige „KVA vorhanden/fehlt" + Download.
- **Bearbeiten** — minimal (Kontakt-Korrektur / interne Notiz). **⚠ siehe Offene Entscheidung 4 (Feld-Scope).**

Aktionen als Zeilen-Menü (Kebab) oder Detail-Drawer, nicht als Button-Wand.

## Staffelung (Aaron: „Build gestaffelt")

- **P1 (klein, schnell, klärt „verfolgbar"):** ① normalisierter Status-Helper + Label-Normalisierung + ② Filterbubble. Rein Frontend + 1 Helper, keine DB-/Auth-Arbeit.
- **P2 (größer, Auth-/Flow-lastig):** ③ Aktionen. Braucht die Auth-Entscheidungen unten + berührt den Kunden-Flow (1069c2a2) und die KVA-Pipeline.

## Architektur

- `src/lib/werkstatt/werkstatt-auftrag-phase.ts` — **NEU**, pure/client-safe, vollständig unit-getestet (Präzedenz-Tabelle = Testfälle). Kein DB-Zugriff (liest die View-Row-Felder).
- `src/lib/werkstatt/auftrag-labels.ts` — **NEU** (oder in phase.ts), Label-Maps (reparaturwunsch/richtung/operative_status).
- `src/components/werkstatt/WerkstattAuftraege.tsx` — **ADDITIV** (cec48090s Datei): Filter-State (URL), Chips-Leiste, Status-Spalte → `werkstattAuftragPhase`. Bestehende SP2-Termin-Sektion + Spalten bleiben.
- `src/app/werkstatt/(shell)/auftraege/actions.ts` — **ADDITIV** (P2): `resendeKundenLink` / `oeffneKundenFlow` / KVA-Action, je `is_werkstatt_for_claim`-gated.
- **Keine `v_werkstatt_auftrag`-Migration.** Falls P2 doch ein Feld braucht (z.B. „KVA vorhanden"-Flag), additive LATERAL-Spalte — mit cec48090 abstimmen.

## Offene Entscheidungen (Aaron / Security)

1. **Flow-Proxy-Auth (③ „Flow durchklicken"):** Der `/flow/[token]` ist kunden-ownership (der Token ist die Zugangsberechtigung). Darf die Werkstatt ihn öffnen? **Vorschlag:** server-action `oeffneKundenFlow` gated auf `is_werkstatt_for_claim` liefert einen Redirect auf `/flow/<token>` (Werkstatt handelt „im Auftrag, vor Ort mit dem Kunden"). Alternative (strenger): read-only Vorschau statt voller Flow-Zugang. → **Security-Review vor P2-Build.**
2. **Link-Semantik (③ „Link resenden"):** flow-Magic-Link (pre-Account, 4/6) vs. Kunde-Portal-Login-Link (post-Account, 2/6). **Vorschlag:** hat der Claim einen `geschaedigter_user_id` → Portal-Hinweis/Portal-Link; sonst flow-Magic-Link.
3. **KVA-Attach-Punkt:** an den Claim (Storage-Bucket) via bestehende `kostenvoranschlag-ocr`-Pipeline (#3178). Verifizieren, wo die heute schreibt, + ob es einen „KVA-vorhanden"-Indikator gibt.
4. **„Bearbeiten"-Scope:** welche Felder darf die Werkstatt ändern? Minimal-Vorschlag: interne Notiz + Kontakt-Korrektur-Hinweis (kein Schreibzugriff auf Claim-Kernfelder).

## Koordination

- **cec48090** besitzt `WerkstattAuftraege.tsx` + `v_werkstatt_auftrag` + die Werkstatt-Portal-Lane (QR-Pool aktiv, SP1–4 gebaut). Diese Spec ist **additiv** (1 neuer Helper + Filter-UI + neue Actions) und ändert die View nicht. **Build: entweder cec48090 (Lane-Owner) oder abgestimmt/atomar** — nicht parallel-blind.
- Verwandt: [[coordination-werkstatt-auftrag-view]], [[coordination-kunde-werkstatt-vermittlung-4sp]] (SP2 `reparaturTerminPhase` = Vorbild), [[coordination-reparaturwunsch-werkstatt-vermittlung]] (der Vermittlungs-Flow + is_werkstatt_for_claim).

## Testing

- **Unit:** `werkstatt-auftrag-phase.test.ts` — je Präzedenz-Zeile ein Fall (inkl. Kollisionen: Termin bestätigt + Gutachten da → Termin gewinnt).
- **Filter:** die Chip-Kombinationen (richtung × status) filtern die Liste korrekt.
- **P2-Actions:** `is_werkstatt_for_claim`-Gate (Cross-Werkstatt = 0), Link-Resend dispatcht, Flow-Proxy nur eigener Claim.
- **Prod-Smoke (als echte Werkstatt-JWT, nicht service-role):** Filterbubble sichtbar, Status normalisiert, eigene Aufträge sichtbar/fremde nicht.
