# Fallakte — Semantik-Dopplungs-Audit

**Datum:** 2026-06-03 · **Auslöser:** Aaron — *"alles was eine semantische Dopplung ist muss raus … der claim soll die SSoT sein im Datenmodell"* (Beispiele: zwei claim-nummern, zwei Ansprechpartner).
**Zweck:** Vor dem Festlegen des globalen SSoT-Musters (betrifft die ~133 faelle-Spalten + #2315) alle Dopplungen mappen + pro Domäne die natürliche Heimat benennen.

> **Kernfrage zum Entscheiden:** Ist **claim = eine breite flache Tabelle** (alle Felder auf `claims`) ODER **claim = eine Entität mit normalisierten Sub-Tabellen** (`claim_parties`/`vehicles`/`kanzlei_faelle`/`gutachten`/`auftraege`/`claim_payments`)? Beide haben "claims als SSoT", aber nur die zweite ist dopplungsfrei. **Empfehlung: zweite.**

---

## A · Datenmodell-Dopplungen (gleiches Konzept in 2+ Tabellen)

### A1 — Personen-Daten · **DIE Hauptdopplung** 🔴
Dasselbe Personen-Datum liegt **flach auf `claims`** UND **normalisiert in `claim_parties`** (1:N; Rollen geschädigter/verursacher/halter/fahrer mit `vorname/nachname/geburtsdatum/adresse_*/telefon/email/versicherung_*/ist_halter/ist_fahrer`).

| Konzept | flach auf `claims` | normalisiert in `claim_parties` | Heimat |
|---|---|---|---|
| Halter | `halter_*` (9, **mein #2315**) | Party mit `ist_halter=true` (73/76 befüllt) | **claim_parties** |
| Kunde/Geschädigter | `kunde_email`, `geschaedigter_user_id` | Party `rolle='geschaedigter'` | **claim_parties** |
| Gegner | `gegner_versicherung_id/_nummer`, `gegner_aktenzeichen` | Party `rolle='verursacher'` (+ versicherung_*) | **claim_parties** (Versicherungs-Akt.-Nr. ggf. claim-skalar) |

`convert-lead-to-claim` schreibt bereits `claim_parties`; `v_claim_full.parties` + `v_claim_parties_safe` (security_invoker=true, PII-maskiert) exposen es. → **claim_parties ist die natürliche, schon gelebte Heimat. Die flachen claims-Personen-Spalten sind die Dopplung.** Das schließt #2315 ein: `claims.halter_*` dupliziert die Halter-Party.

### A2 — `faelle` ↔ `claims` (der faelle-Schatten)
278 faelle-Spalten; ~133 noch faelle-only live-read, der Rest dupliziert `claims` (teils schon via `CLAIM_OWNED_DUPLICATE_COLUMNS` / `CLUSTER*_RENAMED_TO_CLAIMS` gemappt). **Heimat: claims bzw. die passende Sub-Tabelle.** Das ist genau der laufende faelle-Drop (P1 Reader-Repoint → P3 DROP).

### A3 — Kanzlei / Mandat
- **`claim_nummer` (claims) vs `mandatsnummer` (kanzlei_faelle):** *keine* Datenmodell-Dopplung — zwei **verschiedene** Identifier (Claimondo-Aktennr. vs Salesforce-Mandatsnr.). Aber UI-verwechselbar (s. B).
- `kanzlei_ansprechpartner_*` (name/email/telefon/position) liegen **nur auf claims** (nicht in kanzlei_faelle) → keine Dopplung, aber konzeptionell Kanzlei-Domäne (Heimat-Frage: claims-skalar ok, oder `kanzlei_faelle`).
- Mandat/VS-Lifecycle (`regulierung_*`, `eskalation_tag_*`, `ruege_*`, `vs_quote_*`, `as_*`) leben sauber auf **`kanzlei_faelle`** (1:1). Gut.

### A4 — Fahrzeug
`vehicles` (SSoT) ↔ `faelle.fahrzeug_*/kennzeichen/hsn/tsn` (Schatten; in v_claim_full via COALESCE). **Heimat: vehicles.** faelle-Drop räumt den Schatten ab. `claims` hat **keine** flachen Fahrzeug-Spalten (gut, nur `vehicle_id`-FK).

### A5 — Gutachten-Werte
`gutachten` (SSoT, alle Werte). **Keine** flache Dopplung auf `claims` (gut). `v_claim_full.gutachten_betrag` etc. sind nur View-Projektionen.

### A6 — Auftrag-Lifecycle
`auftraege` (sv_briefing_*, technische_stellungnahme_*, storno_*, filmcheck_*) — schon aus faelle migriert (`AUFTRAEGE_OWNED_COLUMNS`), **keine** claims-flat-Dopplung. Gut.

**Muster:** A5/A6/A4 zeigen, dass das normalisierte Sub-Entitäten-Modell **bereits der gelebte Standard** ist — nur A1 (Personen) ist noch flach-dupliziert (und #2315 würde es verstärken).

---

## B · UI-Render-Dopplungen (Admin-Fallakte) — genau Aarons Beispiele

| Datum | gerendert in | Anmerkung |
|---|---|---|
| **claim-nummer** | `FallakteShell.tsx:187` (FallIdentityHeader) **+** `_tabs/UebersichtTab.tsx:147` ("Fall-Nummer"-Status-Header) | Datenmodell sauber (claim_nummer ist claims-only); **reine UI-Dopplung** → einmal rendern (Header). |
| **Ansprechpartner** | KB-Block `_sidebar/FallSidebar.tsx` (FallKontakteCard) **+** `KanzleiAnsprechpartnerBlock` (`page.tsx:861`) | Zwei *verschiedene* Rollen (Kundenbetreuer vs Kanzlei-Kontakt) → konsolidieren/klar trennen, nicht „doppelt". |

→ UI-Dopplungen räumt der faelle-Drop **nicht** automatisch ab; separater UI-Pass nötig.

---

## C · Security-Bezug (gleiche „claims-Sauberkeit")
Die 9 `v_claim_*`/`faelle_*`-Views laufen `security_invoker=false` (RLS-Bypass) → anon-PII-Leak (separat gefixt: **PR #2318**, REVOKE anon). Follow-up `security_invoker=true` gehört zur selben Aufräum-Linie. Details: `docs/03.06.2026/cmm49-p0-halter-pilot.md` + Memory.

---

## D · Empfehlung — globales SSoT-Muster

**claims = SSoT-*Entität* mit normalisierten Sub-Entitäten** (nicht flat-wide):

| Domäne | SSoT (Heimat) |
|---|---|
| Personen (Halter/Kunde/Gegner/Fahrer) | **claim_parties** (Rollen) |
| Fahrzeug | **vehicles** |
| Mandat/VS/Kanzlei-Lifecycle | **kanzlei_faelle** |
| Gutachten-Werte | **gutachten** |
| Auftrag-Lifecycle | **auftraege** |
| Zahlungen | **claim_payments** |
| Echte claim-Skalare (status, schadentag, schadenort_*, kanzlei_wunsch, kundenbetreuer_id, …) | **claims** (flach) |

**Konsequenzen:**
1. **#2315 (halter flat) → umbauen auf `claim_parties`** (Reader lesen Halter-Party aus `v_claim_full.parties`/`v_claim_parties_safe`; Writer schreiben die Halter-Party). `claims.halter_*` (Mig 20260603082646) wieder droppen (additiv/leer → Cleanup-Drop risikolos). = ursprüngliche Empfehlung, deckt sich mit deinem Prinzip.
2. **P0-Muster für die 133:** pro Cluster die Domänen-Heimat oben — nur echte Skalare flach auf claims. (Personen-Cluster kunde_*/gegner_* → claim_parties; Fahrzeug → vehicles; etc.)
3. **UI-Pass:** claim-nummer einmal; Ansprechpartner-Blöcke konsolidieren.

---

## E · Was du entscheiden musst
**Bestätige das Modell:** „claims = normalisierte Entität, Sub-Tabellen sind SSoT pro Domäne, keine flachen Personen-/Fahrzeug-Spalten auf claims." → dann setze ich #2315 auf claim_parties um und ziehe das per-Cluster-Heimat-Muster für die 133.
*(Alternative flat-wide: nur falls du claims bewusst als eine breite Tabelle willst — dann müssten umgekehrt claim_parties/vehicles für diese Felder entwertet werden, was das gelebte Modell zerlegt. Nicht empfohlen.)*

## F · Offen (mechanischer Folge-Schritt)
Die exhaustive Spalte-für-Spalte-Tabelle (alle 278 faelle + 184 claims gegen die Sub-Entitäten) ist nach der Modell-Entscheidung mechanisch erstellbar — die Kategorien + Heimaten oben sind die Entscheidungsgrundlage. Liefere ich auf Wunsch als nächstes.
