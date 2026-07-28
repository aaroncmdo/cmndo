# OFFENE FRAGEN AN AARON — konsolidiert aus A3/A4 + J1–J10

> **Zweck:** A1-DoD verlangt Aaron-Review, bevor die Journeys B1/C-Grundlage werden (§3). Die ~30 „Offene Fragen"
> aus den zehn Journeys + A3/A4 sind hier **thematisch gebündelt, priorisiert und mit einer Empfehlung** versehen —
> damit das Review eine fokussierte Entscheidungs-Sitzung wird statt zehn Einzel-PRs.
> **P1** blockt den C-Code-Umbau (echte Produkt-Weichen). **P2** = Soll-Klärungen (Default vorgeschlagen, kann ich annehmen).
> **P3** = C-interne Konsolidierung (kein Aaron-Input nötig, nur Transparenz). Getroffene Antworten wandern nach `DECISIONS.md`.

---

## P1 — kritische Entscheidungen (blocken C / fundamentale Weichen)

### P1.1 · Notification-Redundanz am SA-Moment → blockt C3 (Outbox)
**Fund (A3/J1/J3):** Der SA-Konversionsmoment feuert **bis zu 6 Kunden-WhatsApp ohne gemeinsamen Dedup** (`flow/[token]/actions.ts:750/1306/1312/1421` direkt + `:1554-1555` kanonisch); zusätzlich existieren **drei überlappende Sende-Systeme** (emit/EVENT_MATRIX, `sendFallCommunication`, Direkt-Helper).
**Frage:** Ist die Mehrfach-WA Absicht (verschiedene Inhalte) oder Redundanz?
**Empfehlung:** Ein Willkommens-Set pro Ereignis; alles Ausgehende über die C3-Outbox mit Dedup-Key. → Ja/Nein genügt.

### P1.2 · Status-Dubletten → blockt C1 (transitionClaim) + A2-State-Machine
**Fund (J1/A2):** Die 33-Wert-`operative_status`-Achse trägt scheinbare Dubletten: `abgelehnt`/`abgelehnt_final`, `regulierung`/`regulierung-laeuft`/`reguliert_vollstaendig`, `kanzlei-uebergeben`/`an_externe_kanzlei_uebergeben`, `in_kommunikation_vs`.
**Frage:** Welche sind kanonisch, welche verschmelzen?
**Empfehlung:** Mit der A2-State-Machine (#4819) eine bereinigte Achse festlegen, bevor C1 den Single-Writer baut. → Liste „behalten/verschmelzen" von dir.

### P1.3 · KVA-Betrag server-seitig Pflicht → J4-Deadlock (#4804)
**Fund (J4):** `erstelleKvaFuerAuftrag` nimmt `netto/brutto: number | null` (`auftraege/actions.ts:398`) — ein **betragsloser KVA ist speicherbar**, dann kann der Kunde nicht freigeben (stiller Deadlock).
**Empfehlung:** Betrag server-seitig Pflicht machen. → Ja/Nein (Umsetzung ist ein kleiner, klar abgegrenzter Fix).

### P1.4 · Netzwerkpartner-Ranking-Härte → blockt Dispatch-Umbau + Netzwerk-Lane
**Fund (J10, Netzwerk-Modell):** Netzwerkpartner (zahlender SV) soll über kostenfreien SVs ranken (`istZahlenderNetzwerkPartner` löst `paketPrio`).
**Frage:** Rankt ein Netzwerkpartner **immer** über jedem kostenfreien SV — auch wenn letzterer geografisch/fachlich deutlich besser passt? Und: werden „Dein Netzwerk"-Partner nur *angezeigt* oder auch im Auto-Dispatch bevorzugt?
**Empfehlung:** Netzwerk-Boost als **Tiebreaker innerhalb vergleichbarer Eignung**, nicht als Override über klar bessere Passung (sonst leidet die Kunden-Erfahrung). → deine Härte-Grenze.

### P1.5 · Freundes-Graph-Definition → blockt Provision/C3 + Netzwerk-Lane
**Fund (J9, Netzwerk-Modell):** Intra-Netzwerk (befreundete Parteien) = **keine** Provision (Abo deckt es); Suppression an Release-Zeit.
**Frage:** Wann gelten zwei Parteien als „befreundet" — gegenseitige Bestätigung, Owner-Bindung (`netzwerk_owner_id`), beides?
**Empfehlung:** Gegenseitige, bestätigte Verbindung im Graph (nicht einseitig). → Definition von dir.

### P1.6 · Netzwerk-Preismodell-Zahlen → blockt Stripe-Umsetzung (J8/J9)
**Frage:** Höhe der **Einrichtungsgebühr** + **Monats-Flat**? Werden **alle** Bestands-`paket`-SV als Netzwerkpartner comped oder nur aktive?
**Empfehlung:** — (reine Produkt-/Preis-Entscheidung, keine technische Empfehlung). → Zahlen + Comp-Politik von dir.

---

## P2 — Soll-Klärungen (Default vorgeschlagen; ohne Antwort nehme ich den Default an)

| # | Journey | Frage | Vorgeschlagener Default |
|---|---|---|---|
| P2.1 | J4/J5 | Kasko-Freigeber + Kasko-Umfang | Kunde gibt frei (wie Selbstzahler); voller SV-Service für die eigene Kasko-VS |
| P2.2 | J3 | SA + Vollmacht ein Vorgang oder zwei? Vollmacht-Zeitpunkt? | Ein präsentierter Vorgang; Vollmacht im selben Flow (Komplettservice) |
| P2.3 | J6 | LexDrive Default? Mandat-Zeitpunkt? | LexDrive Default für Haftpflicht; Vollmacht aus J3 reicht als Mandat |
| P2.4 | J7 | Storno-Frist? Partner-Storno-Rechte? | Kunden-Storno bis vor Kanzlei-Übergabe; Partner nur via Admin |
| P2.5 | J5 | Weg-Korrigierbarkeit nach Konversion? | Im Dispatch/Portal korrigierbar mit Ketten-Neuberechnung |
| P2.6 | A4 | Gegner-Flow/Schadenkarte ohne Pflichtdok bewusst? | Nein — Pflichtdok-Slots nachziehen (C2) |
| P2.7 | J8 | DAT-Gating-Abbau + Werkstatt-Self-Flow? | Registrierung für alle offen; Werkstatt-Flow = Netzwerk-Lane-Entscheid |

---

## P3 — C-interne Konsolidierung (kein Aaron-Input; wird in der C-Phase gelöst)

- **Doppel-Ableitung Abrechnungsweg** client (`abrechnungsweg.ts`) vs. DB (`derive_abrechnungsweg`) → eine Quelle (C5/C2).
- **`findBestSV` zweigleisig** (`findBestSV` + `findBestSVviaEngine`) → Kanon (C1-nah).
- **Kanzlei-Status als Direkt-Writer** (`an_externe_kanzlei_uebergeben`/`in_kommunikation_vs`) → Engine-Funnel (C1).
- **Zwei Provisions-Achsen** (`provision-status.ts` + `partner-billing-actions.ts`) + Alt-Tabellen-Drop → Unifikation.
- **Dedup nur an EINEM Pfad** (`erstelleVsDispatchTask`) → Outbox-weit (C3).
- **`sv-zuweisung`-Org-Branche tot** (A2-Fund #6, WILD-Write) → C1-Retire.

---

## Nach den Antworten
P1 beantwortet → Journey-Review-Haken (§2) setzbar → **B1** (Journey-Smokes J1+J4) + **C1/C2** entblockt.
Antworten wandern nach `DECISIONS.md` (append-only, §8).
