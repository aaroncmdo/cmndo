# J4 — Reparatur-Weg: KVA → Freigabe → Schlussrechnung

> Fundament A1 · Journey-Bibel. **Soll-Ablauf aus Nutzersicht** (Soll ≠ Ist — Abweichungen unter „⚠ IST weicht ab").
> Neben **J1** die von B1 (Oracle/Smokes) + C2 (createCase) als Pflicht-Grundlage genannte Journey.
> Status-Rückgrat (verifiziert `reparatur-cursor.ts`): `reparatur-werkstatt-suche → -angefragt → -laeuft → -erledigt → abgeschlossen`,
> gegatet auf `abrechnungsweg IN (selbstzahler, kasko)` (die „reduced-repair"-Achse), durch die Engine (`transitionFallStatus`).

**Rollen:** Kunde (wählt Werkstatt, gibt KVA frei) · Werkstatt (KVA + Reparatur + Schlussrechnung) · KB/Admin (Aufsicht, Staff-Freigabe) · Flottenmanager (bei Firmen-Fahrzeug) · System.
**Vorbedingungen:** ein Claim existiert (aus J1/J2); der Abrechnungsweg ist bestimmt (→ J5).
**Startpunkt(e):** Kunde-Portal Werkstatt-Finder · Dispatch-Werkstatt-Vermittlung · FlowLink-Werkstatt-Auswahl.

## Ablauf (Soll)

Der Reparatur-Weg ist die **Selbstzahler/Kasko-Hauptachse**: hier ersetzt die Reparatur die Gutachten-/Regulierungs-Kette.
Bei **Haftpflicht** läuft die Reparatur als Nebenschauplatz neben der SV-/Regulierungs-Achse (→ Offene Frage 3).

1. **Werkstatt-Suche** (`reparatur-werkstatt-suche`) — Kunde findet/wählt eine Werkstatt (Werkstatt-Finder, Umkreis) **oder** Dispatch vermittelt eine. **Screen:** Werkstatt-Liste mit Distanz. Bei reduced-repair: Cursor fädelt aus `ersterfassung/onboarding` in die Lane ein.
2. **Auftrag** (`reparatur-angefragt`) — die gewählte Werkstatt wird beauftragt. **Notif:** Werkstatt „neuer Auftrag" (`notify-werkstatt-auftrag`). **Screen:** Werkstatt sieht den Auftrag im Portal.
3. **KVA-Einreichung** — Werkstatt lädt den **Kostenvoranschlag** hoch (`erstelleKvaFuerAuftrag`): **PDF Pflicht**, `kostenvoranschlag_netto/_brutto`, `kva_quelle='werkstatt'`; optional ein **Reparaturtermin-Vorschlag** + geschätzte Dauer (AV5). Ein (Gegen-)KVA **nullt** eine frühere Freigabe/Ablehnung (`reparatur_freigegeben_am=null, kva_abgelehnt_am=null`) → Gate „wartet auf Freigabe". **Slots:** KVA-PDF → `fall_dokumente` (sichtbar inkl. Kunde). **Notif:** Kunde „KVA liegt vor, bitte freigeben".
4. **KVA-Freigabe ODER -Ablehnung** (Loop):
   - **Freigabe** — Kunde (`genehmigeKvaPortal`, mit **Reparaturauftrag-Unterschrift** AV6 — **KEINE Sicherungsabtretung**, das ist ein eigenes Dokument, vgl. J3) **oder** Staff (`reparaturFreigeben`, `requireStaff`) → `reparatur_freigegeben_am` + `_von`. Idempotent.
   - **Ablehnung** — Kunde (`lehneKvaAbPortal`, mit Grund) → `kva_abgelehnt_am` + `_grund`. **Notif:** Werkstatt „KVA abgelehnt" (`notifyWerkstattKundenreaktion`). Werkstatt lädt revidierten KVA (Schritt 3) → Reset → Loop schließt sich (#4824).
5. **Reparatur läuft** (`reparatur-laeuft`) — nach Freigabe; Reparaturtermin bestätigt (Werkstatt-Vorschlag → Kunde bestätigt). **Soll-Invariante Terminabstimmung (Tranche W, 08.08.):** Sobald eine Reparatur-Werkstatt am Claim gebunden ist (egal ob Flow/Embed-Convert, Akte-Finder, Dispatch/KB oder QR-Referral-Trigger), existiert **genau eine offene `reparatur_termine`-Row** (`status='angefragt'`, `wunschtermin` nullable — „Terminvorschlag offen"): der Funnel (`assignReparaturWerkstatt`/Convert) legt sie an (`ensureReparaturTerminAngefragt`). Die Werkstatt kann damit **proaktiv** einen Termin vorschlagen (Sektion rendert auch row-los als Fallback); der Kunde kann einen fehlenden Wunschtermin auf der offenen `angefragt`-Row **nachtragen** (kein „bereits vorhanden"-Block bei `wunschtermin IS NULL`).
6. **Abschluss** (`reparatur-erledigt → abgeschlossen`) — Werkstatt lädt die **Schlussrechnung** hoch (`markiereReparaturErledigt`) → Claim-Close **durch die Engine** (`closeReparaturClaimViaEngine`: Timeline + `phase_transitions` + `fall.status_changed`, `abgeschlossen_am`) → **Werkstatt-Provision** `pending → freigegeben` (nur inbound Haftpflicht provisioniert) → Termin `erledigt`. **Notif:** Kunde „Reparatur abgeschlossen".

## Varianten / Abzweige

- **Staff-Freigabe** statt Kunde (KB/Admin gibt frei) — z.B. wenn der Kunde nicht reagiert.
- **Firmen-Fahrzeug (Flotte):** Flottenmanager statt Kunde in der Aufsicht (→ J-Flotte).
- **Gegen-KVA-Loop:** mehrfaches Ablehnen/Revidieren, bis der Betrag passt.
- **Haftpflicht mit Reparatur:** Reparatur neben der SV-Achse (die Reparatur-Lane greift nur bei selbstzahler/kasko).

## Fehlerfälle und ihr Soll-Verhalten

- **KVA ohne Betrag** → dürfte gar nicht speicherbar sein: ohne Betrag kann der Kunde nicht freigeben (stiller Deadlock, #4804). **Soll:** Betrag Pflicht beim Einreichen.
- **Close scheitert** (unerwarteter Rest-Status) → Termin bleibt auf `bestaetigt`, Werkstatt kann sauber erneut einreichen; **keine** Dubletten-Schlussrechnung (deterministischer Pfad + Alt-Beleg-Replace, #4799).
- **Doppelter Abschluss-Klick** → idempotent (`istReparaturClaimAbschliessbar`-Guard: terminal → abgewiesen; Close zusätzlich idempotent).
- **Werkstatt-Notify/Provision-Fail** → non-fatal, Claim-Close bleibt committed (Cron heilt Provision nach).

## ⚠ IST weicht ab (mit Fundort)

1. **KVA-Betrag server-seitig optional (#4804):** `erstelleKvaFuerAuftrag` nimmt `netto/brutto: number | null` (`auftraege/actions.ts:398`) — nur das Modal validiert. Ein betragsloser KVA ist speicherbar → Kunde-Freigabe-Deadlock. Soll: Betrag server-seitig Pflicht.
2. **Werkstatt-Abschluss-Bypass (17.07., gefixt):** früher schrieb der Abschluss `operative_status='abgeschlossen'` per Direkt-`.update()` an der Engine vorbei → Cursor blieb stehen, Abschluss **unsichtbar** für KB/Admin/Flottenmanager (Prod-Beleg: einziger `reparatur_termine`-Claim stand auf `ersterfassung`). Fix: `reparatur-cursor.ts` funnelt durch die Engine.
3. **Schlussrechnung-Dublette (#4799, gefixt):** `Date.now()`-Pfad legte bei Close-Fail-Retry/Doppelklick eine zweite Schlussrechnung an. Fix: deterministischer Pfad `${fallId}/schlussrechnung.${ext}` + Alt-Beleg-Replace.
4. **Cursor-Vorschub nur teilverdrahtet:** der Cursor rückt an „natürlichen Flow-Punkten" vor (`reparatur-cursor.ts`), aber ob **jeder** Übergang (Suche→angefragt→laeuft) einen Trigger hat, ist im C-Umbau zu schließen (Register-Input).

## Offene Fragen an Aaron (max. 5)

1. **Kasko-Freigabe:** Wer gibt bei **Kasko** den KVA frei — der Kunde (wie Selbstzahler) oder die Kasko-VS? Bei Selbstzahler=Kunde, Haftpflicht=Staff/VS ist klar, Kasko nicht.
2. **KVA-Betrag-Pflicht (#4804):** Soll der Betrag server-seitig erzwungen werden (nicht nur im Modal)?
3. **Haftpflicht-Reparatur:** Läuft die `reparatur-*`-Lane bei Haftpflicht überhaupt, oder bleibt die Reparatur dort ein reiner Nebenschauplatz an der SV-/Regulierungs-Achse? Wie dockt sie an?
4. **Reparaturauftrag vs. SA:** Die Reparaturauftrag-Unterschrift (AV6) ist bewusst getrennt von der SA (J3) — soll dem Kunden dieser Unterschied erklärt werden?
