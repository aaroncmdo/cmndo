# J3 — Unterschriften: SA (Abtretung) + Vollmacht, inkl. Nachsignieren

> Fundament A1 · Journey-Bibel. **Soll-Ablauf aus Nutzersicht** (Soll ≠ Ist — Abweichungen unter „⚠ IST weicht ab").
> Detailliert den Signatur-Moment aus **J1** (Schritt 3). Signatur-Felder am Claim (verifiziert):
> SA = `sa_unterschrieben` + `sa_unterschrieben_am` + `abtretung_pdf`/`abtretung_signiert_am`; Vollmacht = `vollmacht_signiert_am` + `vollmacht_status`.

**Rollen:** Kunde (Geschädigter, unterschreibt) · System · SV (bekommt den Auftrag verbindlich) · Kanzlei (braucht die Vollmacht) · KB/Admin (Aufsicht).
**Vorbedingungen:** ein Lead existiert (aus J2); der Kunde ist im FlowLink oder eingeloggt im Portal.
**Startpunkt(e):** `/flow/[token]` (Signatur-Schritt) · Portal-Resurface „Unterschrift ausstehend" (Nachsignieren) → Resolver-Route `/kunde/faelle/[id]/unterschrift`.

## Ablauf (Soll)

Zwei Dokumente, ein rechtlicher Zweck: **SA (Sicherungs-Abtretung)** ermöglicht die Direktabrechnung ohne Eigenkosten des
Kunden (§249 BGB — die Forderung gegen die gegnerische Haftpflicht wird abgetreten); die **Vollmacht** ermächtigt die
Partnerkanzlei zur rechtlichen Vertretung.

1. **Kunde erreicht den Signatur-Schritt** (im /flow, nach Qualifizierung + ggf. Gutachter-Terminwahl) → System zeigt
   SA-Text + Unterschriftsfeld. Bei **Komplettservice** (`service_typ='komplett'`) zusätzlich die **Vollmacht**.
   **Screen:** Signatur-Pad; erklärender Text „keine Kosten für Sie".
2. **Kunde unterschreibt die SA** → System: **Konversion Lead → Claim** (`signSAandCreateFall` → `convertLeadToClaim`);
   `sa_unterschrieben=true`, `sa_unterschrieben_am`, `abtretung_pdf` (generiertes PDF). **Events:** `fall.created` + `sa.signed`.
   **Notif (Soll):** EIN Willkommens-Set an den Kunden (Portal-Zugang), SV „Auftrag verbindlich", KB/Admin in_app.
   **Slots:** Pflichtdok-Katalog (die Vollmacht ist einer der Pflicht-Slots). **Screen:** Kunde → Portal / Login-Daten.
3. **Kunde unterschreibt die Vollmacht** (Komplettservice) → `vollmacht_signiert_am`, `vollmacht_status='signiert'`.
   Damit ist der Fall **kanzlei-übergabe-bereit** (J1-Schritt 7 / J6). **Notif:** — (intern; keine Kunde-Notif nötig).
4. **Beide Signaturen liegen vor** → der Fall ist vollständig mandatiert; die Direktabrechnungs- + Vertretungs-Kette ist scharf.

## Varianten / Abzweige

- **`nur_gutachter`** (Kunde reguliert selbst): **nur SA** (Abtretung an den SV fürs Honorar), **keine Vollmacht** (keine Kanzlei).
- **Reparatur-Weg (Kasko/Selbstzahler, J5):** reduziertes Szenario — SA/Vollmacht entfallen bzw. sind nicht der Gate (der Fall ist im FlowLink erfasst, Reparatur läuft über eigene Freigaben, → J4).
- **Eingeloggter Kunde** (kein Token): Signatur über das Portal statt den Magic-Link.
- **SV-Vermittlungs-Kunde** (Netzwerk P4, `source_channel='gutachter-vermittlung'`): Der SV hat
  Fall + Kunde + Gutachten bereits vollständig erfasst — der FlowLink startet **direkt am
  Fokus-Signatur-Schritt** (keine Quali, keine Feststellung; kein Doppel-Ask erhobener Daten).
  Gilt nur solange die SA offen ist UND noch kein Kunden-Account existiert; danach greifen die
  regulären Pfade (eingeloggt → Fokus-Signatur bzw. Portal). (Soll-Delta 04.08., P4-UX-Followup —
  vorher lief der Vermittlungs-Kunde fälschlich durch den vollen Wizard.)
- **Airdrop-Gegner** (J2/E): der Gegner unterschreibt keine SA — er bestätigt nur seine Kontaktdaten.

## Fehlerfälle und ihr Soll-Verhalten

- **Kunde bricht vor der SA ab** → Lead bleibt bestehen (kein Claim); der FlowLink führt beim erneuten Öffnen zurück zum Signatur-Schritt. Kein Datenverlust.
- **SA da, Vollmacht fehlt** (oder umgekehrt) → Portal zeigt **„Unterschrift ausstehend"** mit funktionierendem Link **zurück in den Signatur-Flow** (Nachsignieren). Der Fall wartet, kein stiller Stillstand.
- **Nachforderung einer Signatur** (z.B. Kanzlei braucht eine erneuerte Vollmacht) → dieselbe Resurface-Mechanik.
- **Doppel-Submit der Signatur** (Reload) → idempotent: kein zweiter Claim, kein zweites Willkommens-Set.

## ⚠ IST weicht ab (mit Fundort)

1. **Nachsignier-Sackgasse (K6, #4790, gefixt):** „Unterschrift ausstehend" zeigte auf einen **toten Anchor** `#zone-status` — der Kunde kam nie zurück in den Flow. Fix: Resolver-Route `/kunde/faelle/[id]/unterschrift` → `/flow/[token]`. Zeigt die Klasse „Resurface ohne funktionierenden Rückweg".
2. **Verschluckter Logged-in-Redirect (#4793):** im /flow lag der Eingeloggt-Redirect im `try/catch` **ohne** `isRedirectError`-Re-throw → `NEXT_REDIRECT` wurde verschluckt, der Redirect lief nie. Fix: raus aus dem try, an `!feststellungNochOffen` gegatet. (FlowLink-nah, betrifft den Signatur-Einstieg.)
3. **6-WhatsApp-Redundanz am SA-Moment (A3 §5.3):** Schritt 2 löst statt EINES Willkommens-Sets bis zu 6 Kunden-WhatsApp ohne gemeinsamen Dedup aus (`flow/[token]/actions.ts:750/1306/1312/1421` + `:1554-1555`).
4. **SA/Vollmacht-Reihenfolge im Code:** die Konversion hängt an `sa_unterschrieben`; `vollmacht_signiert_am` ist ein separates Feld — die genaue UI-Sequenz (eine Signatur-Seite für beide, oder zwei Schritte) ist im Flow zu verifizieren (Soll: dem Kunden als EIN Vorgang präsentieren).

## Offene Fragen an Aaron (max. 5)

1. **Ein Vorgang oder zwei?** Sollen SA + Vollmacht dem Kunden als EINE Unterschrift präsentiert werden, oder bewusst als zwei getrennte Schritte (mit getrennter Aufklärung)?
2. **Vollmacht-Zeitpunkt:** wird die Vollmacht immer im selben Flow wie die SA verlangt, oder erst bei der Kanzlei-Übergabe (J6) nachgeholt?
3. **Nachsignier-Trigger:** welche Ereignisse lösen ein „Unterschrift ausstehend"-Resurface aus (nur fehlende Erst-Signatur, oder auch Kanzlei-Nachforderung / erneuerte Vollmacht)?
