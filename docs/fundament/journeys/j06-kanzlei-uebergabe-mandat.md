# J6 — Kanzlei-Übergabe / Mandat

> Fundament A1 · Journey-Bibel. **Soll-Ablauf aus Nutzersicht** (Soll ≠ Ist — Abweichungen unter „⚠ IST weicht ab").
> Die rechtliche Durchsetzung nach dem Gutachten (J1-Schritt 7). Kern verifiziert: `gibKanzleipaketFrei` (`auftrag/qc.ts`),
> `setKanzleiWunsch`/`versendeKanzleiPaketAnEigeneKanzlei`/`bestaetigeSelbstEinreichungOhneKanzlei` (`kanzlei-wunsch/actions.ts`),
> `upsertKanzleiFall` (Bridge). Vollmacht-Grundlage aus **J3**.

**Rollen:** Kunde (wählt Kanzlei oder Selbst-Einreichung) · KB/Admin (gibt frei, steuert) · SV/QC (liefert das Paket) · Kanzlei (LexDrive-Partner **oder** eigene Kanzlei des SV) · System.
**Vorbedingungen:** Gutachten fertig + QC bestanden; **Vollmacht signiert** (J3) für die Vertretung.
**Startpunkt(e):** QC-Freigabe (`gibKanzleipaketFrei`) · Kanzlei-Wunsch-Auswahl im Portal.

## Ablauf (Soll)

Nach dem geprüften Gutachten setzt Claimondo die Ansprüche rechtlich durch — über eine **Partnerkanzlei (LexDrive)**
oder eine vom Kunden/SV gewünschte **eigene Kanzlei**. Der Kunde kann auch **selbst einreichen**.

1. **Paket-Freigabe** — QC gibt das Kanzleipaket frei (`gibKanzleipaketFrei`): Gutachten + Belege + Falldaten sind vollständig. **Status:** `kanzlei-uebergeben` (bzw. `an_externe_kanzlei_uebergeben`). **Screen:** Fall zeigt „an Kanzlei übergeben".
2. **Kanzlei-Wahl** (`setKanzleiWunsch`) — Partnerkanzlei (LexDrive, Default) **oder** eigene Kanzlei (Ansprechpartner erfassen) **oder** Selbst-Einreichung (`bestaetigeSelbstEinreichungOhneKanzlei`).
3. **Übergabe** — Paket-Versand: an LexDrive (kanonisch) oder `versendeKanzleiPaketAnEigeneKanzlei`. **Bridge:** `upsertKanzleiFall` legt die `kanzlei_faelle`-Zuordnung an (SSoT + RLS-Scope für die Kanzlei-Sicht). **Mandat:** die Vollmacht (J3) ermächtigt die Kanzlei; ggf. `pushMandatManuell`.
4. **Vertretung läuft** — Kanzlei kommuniziert mit der gegnerischen VS (`kanzleiVsKontaktErfasst`, Status `in_kommunikation_vs`); Anschlussschreiben, Regulierung (→ J1-Schritt 8, J9).
5. **Abschluss** — Kanzlei-Auszahlung eingegangen (`kanzleiAuszahlungEingegangen`) → Weiterreichung an den Kunden (J9).

## Varianten / Abzweige

- **Selbst-Einreichung ohne Kanzlei** (`bestaetigeSelbstEinreichungOhneKanzlei`) — der Kunde übernimmt die Durchsetzung selbst; keine Kanzlei-Bridge.
- **Eigene Kanzlei des SV/Kunden** statt LexDrive — Ansprechpartner via `saveKanzleiAnsprechpartner`.
- **Klage** — reicht die außergerichtliche Regulierung nicht: `uebergebeFallKlage` → Status `klage`/`klage_rechtsstreit`.
- **Kanzlei-Wunsch zurücksetzen** (`resetKanzleiWunsch`) — Kunde ändert die Wahl vor Versand.

## Fehlerfälle und ihr Soll-Verhalten

- **Vollmacht fehlt** → Übergabe blockiert; Resurface „Unterschrift ausstehend" (J3-Nachsignieren), statt tot zu enden.
- **Paket unvollständig** (Beleg fehlt) → QC gibt nicht frei; die Lücke wird als Pflicht-Slot sichtbar.
- **Kanzlei-Bridge-Insert scheitert** → die Kanzlei sieht den Fall nicht; muss laut/retrybar sein (nicht still, vgl. #4630 KB-Whitelist).

## ⚠ IST weicht ab (mit Fundort)

1. **Kanzlei-Status als Nicht-Matrix-Terminal + Direkt-Write:** `kanzlei-wunsch/actions.ts` schreibt `an_externe_kanzlei_uebergeben`/`in_kommunikation_vs` per Direkt-`.update()` (Operative-Status-Write-Gate-Baseline, grandfathered) — nicht durch die Engine. C-Kandidat (Single-Writer-Funnel).
2. **Zwei Kanzlei-Modelle nebeneinander:** LexDrive-Partner (`lexdrive/process-event.ts`, VS-Webhook-`manual_status_override`) **und** eigene Kanzlei (`kanzlei_faelle` + `/kanzlei`-Portal) — welcher Status-Pfad kanonisch ist, ist heterogen.
3. **`kanzlei_faelle` = SSoT ohne Spalten-Grant:** die Kanzlei-Sicht liest über `kanzlei_faelle` (RLS), `claims.kanzlei_id` wird bewusst **nicht** gegrantet (intern gecappt) — korrekt, aber die Doppelung Bridge/Spalte ist erklärungsbedürftig.

## Offene Fragen an Aaron (max. 5)

1. **LexDrive vs. eigene Kanzlei:** Ist LexDrive der Default für alle Haftpflicht-Fälle, oder wählt der Kunde immer aktiv?
2. **Mandat-Zeitpunkt:** Reicht die Vollmacht aus J3, oder braucht die Kanzlei ein separates Mandat pro Fall (`pushMandatManuell`)?
3. **Kanzlei-Status-Funnel:** Sollen die Kanzlei-Terminals (`an_externe_kanzlei_uebergeben`/`in_kommunikation_vs`) in die State-Machine gehoben werden (C1)?
