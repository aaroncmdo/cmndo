# Reduziertes Reparatur-Onboarding für No-SV-Claims (Selbstzahler + Kasko-frei) — Design & Handoff

**Datum:** 2026-07-08
**Herkunft:** Session e1581bd7 (Werkstatt-Finder-Smoke → abrechnungsweg-Dormanz-Fund)
**Handoff-Ziel:** Session **3724ced2** (`kitta/werkstatt-flow-enrichment`) — deren aktive Lane (Werkstatt-KVA/Reparaturtermin/Unterschrift). Diese Spec = Übergabe.

## Kontext (Aaron 08.07.)
> „die Feststellung brauchen wir nur begrenzt … der Fahrzeugschein wäre schon gut … da wären Schadenfotos sinnvoll + die OCR der ZB1 … es wird kein SV gebucht … der Werkstatt-Wunschtermin muss angefragt werden … die Werkstatt sollte den KVA hochladen und der Kunde kann den in diesem Claim hochladen und dann muss da auch ein Reparaturtermin dabei sein."

**Scope-Entscheidung (Aaron):** **Selbstzahler + Kasko-OHNE-Werkstattbindung** (Kasko-Policen mit freier Werkstattwahl → wir vermitteln trotzdem). Haftpflicht bleibt der volle kanonische Flow (SV/Gutachten/Regulierung).

## Ziel (eine Zeile)
Für Claims ohne Claimondo-SV ein schlankes Reparatur-Onboarding: **Auto identifizieren (ZB1-OCR) → Schaden zeigen (Schadenfotos) → Werkstatt wählen + Wunschtermin → Werkstatt lädt KVA + Reparaturtermin → Kunde sieht/lädt KVA im Claim.** KEIN SV/Gutachten/Regulierung, getrimmte Feststellung + Pflichtdokumente.

## Operatives Zielbild — der Loop MUSS sich selbst schließen (das macht es „operativ 1+")
Das reduzierte Onboarding (WS1–WS5) macht den Vorgang technisch möglich — aber operativ ist ein Selbstzahler-Claim **unbetreut** (KEIN Kundenbetreuer, per Design). Ohne Selbstlauf verrottet er still. Der Ende-zu-Ende-Loop:

`Onboarding (Kunde)` → `Vermittlung (Werkstatt-Auftrag + Provision entsteht)` → `KVA (Werkstatt lädt hoch)` → `Reparaturtermin (angefragt → bestätigt)` → `Reparatur erledigt` → **`Claim automatisch abgeschlossen + Provision abgerechnet`** + **`Rechnung/Beleg-Paket für den Kunden`** (Kasko-Erstattung beim eigenen Versicherer).

**Money-Model (warum das überhaupt zählt):** Ohne SV-Honorar und ohne Kanzlei-Gebühr ist die **Werkstatt-Vermittlungs-Provision** (`partner_provisionen`, ~150–200 €) der EINZIGE Claimondo-Umsatz dieser Claims. Deshalb muss die Vermittlung sitzen UND der Loop bis zur Provisions-Abrechnung wasserdicht sein — sonst arbeitet Claimondo umsonst. Die operative Vollständigkeit (WS6) ist kein Nice-to-have, sondern die Bedingung, dass sich das Segment trägt.

---

## KERNBEFUND: ~75 % ist gebaut, aber DORMANT
Die komplette Selbstzahler-Reparatur-Strecke existiert, hängt aber an `abrechnungsweg='selbstzahler'` — und das ist in Prod bei **allen 323 Leads + 32 Claims NULL** → die Strecke ist nie aktiv.

### Was schon existiert — NICHT neu bauen
| Baustein | Ort |
|---|---|
| Flow-Branch → Selbstzahler-Claim | `FlowQualiStep.tsx:43-52` → `erzeugeSelbstzahlerClaim` |
| Portal-Stepper (schaden→werkstatt→termin→reparatur) | `components/kunde/SelbstzahlerReparaturStepper.tsx`, gerendert `kunde/faelle/[id]/page.tsx:752` (Gate `abrechnungsweg==='selbstzahler'`), State `selbstzahler-stepper.ts:19-34` |
| ZB1-Foto + OCR | `FlowZb1Upload.tsx` (immer sichtbar, `feststellung-steps.ts:37`) |
| Wunschtermin → Reparaturtermin | `FlowWerkstattStep.tsx:62-72` → `leads.wunschtermin` → `kunde/faelle/[id]/reparatur-termin-actions.ts:14-83` (`schlageReparaturTerminVorPortal`) → `reparatur_termine` (status `angefragt→bestaetigt→abgelehnt→erledigt`), Lifecycle `reparatur-termin-phase.ts`, Notify `notify-kunde-reparaturtermin.ts` |
| Werkstatt-KVA-Upload + OCR | `components/werkstatt/KvaErstellenModal.tsx` + `lib/ai/kostenvoranschlag-ocr.ts`; Staff-KVA `app/faelle/[id]/_stammdaten/WerkstattKvaSection.tsx` |
| VS-Folgefrage (Kasko ja/nein) | `FlowQualiStep.tsx:96-126` |
| Ableitungs-Logik | `resolveAbrechnungsweg` (`lib/werkstatt/abrechnungsweg.ts:18-29`), `qualiFlowOutcome` (`lib/self-service/quali-flow-outcome.ts:22`) |

---

## DIE LÜCKEN (das echte To-Do) — priorisiert

### WS1 — Aktivierung (LINCHPIN, zuerst). `abrechnungsweg` zuverlässig ableiten
Ursache der Dormanz: `resolveAbrechnungsweg` wird **nur** von `speichereQualiFlow` (nur `/flow`) genutzt; die anderen ~7 Lead-Entstehungspfade (embed/gfa `issueCanonicalFlowLinkForAnfrage`→`create-lead.ts`, `/start`, Dispatch-Quick-Create, native) leiten NICHT ab; und `convert-lead-to-claim` kopiert den (oft null) Wert.
- **1a** — `speichereQualiFlow` (`self-service-actions.ts:88-90`): `ueberEigeneVersicherung` nach **`leads.eigene_versicherung`** persistieren (aktuell session-lokal → verloren; blockiert jede spätere Re-Ableitung).
- **1b (CRITICAL)** — `convert-lead-to-claim.ts:486-487`: statt `lead.abrechnungsweg ?? null` → wenn null, `resolveAbrechnungsweg({ schuldfrage: lead.schuldfrage, ueberEigeneVersicherung: <lead.eigene_versicherung als bool> })` ableiten. So bekommt JEDER Claim einen Weg.
- **1c** — Backfill: 155 `schuldfrage='gegner'`-Leads → `abrechnungsweg='haftpflicht'` (deterministisch, `gegner` dominiert). Via `apply_migration` (Regel 2). `eigenverantwortung`-Leads (69) nur backfillbar, wenn `eigene_versicherung` vorliegt — sonst offen lassen.
- **1d (optional)** — Dispatcher-UI: `schuldfrage` in `STAMMDATEN_ALLOWED_FIELDS` (`dispatch/leads/[id]/_actions/stammdaten.ts`) + Post-Save-Derive.

> WS1 allein belebt die gesamte bestehende Strecke — schon das ist ein sichtbarer Prod-Gewinn.

### WS2 — Kasko-frei-Verzweigung (Aaron-Zusatz). Heute GAP (0 Vorkommen)
- **2a (DDL)** — neues Feld `leads.freie_werkstattwahl` (bool, nullable) via `apply_migration`.
- **2b** — `FlowQualiStep`: bei `eigenverantwortung` + „Ja, Kasko" → Folgefrage **„Bist du an eine Werkstatt deiner Versicherung gebunden?"** → *nein* = freie Wahl / *ja* = gebunden.
- **2c** — `resolveAbrechnungsweg`/`qualiFlowOutcome` erweitern: `kasko` + freie Wahl → `ergebnis:'weiter'`, `reparaturwunsch:'reparatur'` (wie selbstzahler für die Werkstatt-Strecke); `kasko` + gebunden → `ergebnis:'abbruch'` + `KaskoEndansicht` (wie heute).
- **2d** — Reparatur-only-Gate verallgemeinern: `istReparaturOnly` (`abrechnungsweg.ts:48`, heute nur `'selbstzahler'`) → neuer Helper `istWerkstattReparaturWeg(weg, freieWahl)` der `selbstzahler` ODER `kasko`+freie Wahl abdeckt. Portal-Stepper-Gate (`page.tsx:752`) + Werkstatt-Vermittlungs-Gate (`brauchtWerkstattVermittlung`) entsprechend.

### WS3 — Schadenfotos im Onboarding (NEU, Aaron explizit). Heute GAP
Ohne SV nimmt niemand Fotos → der Kunde muss sie liefern.
- **3a** — Schadenfotos-Upload in der reduzierten Strecke (eigener Micro-Step ODER im Portal-`schaden`-Step des SelbstzahlerReparaturStepper). Ziel-Spalte `leads.schadensfoto_urls` (existiert) bzw. Claim-Foto-Storage.
- **3b** — Fotos an den Werkstatt-Auftrag hängen (Werkstatt sieht, was zu reparieren ist) — `v_werkstatt_auftrag`/Auftrags-Detail (3724ced2-Fläche).

### WS4 — Kunde-KVA-Ansicht/-Upload im Claim (NEU, Aaron explizit). Heute GAP
- **4a** — Kunde-KVA-Card in `kunde/faelle/[id]` für Reparatur-only-Claims: `claims.kostenvoranschlag_netto/brutto` (existieren) anzeigen, wenn Werkstatt hochgeladen + Kunde-Upload erlauben.
- **4b** — mit Werkstatt-KVA-Upload (`KvaErstellenModal`, 3724ced2 aktiv) koordinieren: EIN KVA-Dokument, zwei Upload-Quellen (Werkstatt via Modal, Kunde via Claim). Aaron 08.07. zu 3724ced2: „Unterschrift soll auf dem Gerät der Werkstatt passieren, Links senden = zusätzliche Option" → KVA-Freigabe/Signatur ist deren Design.

### WS5 — Feststellung trimmen + Pflichtdokumente. Heute GAP
- **5a** — Feststellung für Reparatur-only trimmen. Zwei Optionen:
  - **A (Config-Gate):** `computeActiveFeststellungSteps` (`feststellung-steps.ts:65`) um `abrechnungsweg` erweitern → skip `hergang/folgeschaeden/wann_wo/polizei_zeugen/gegner/vorschaeden`; behalte `zb1` + `dein_fahrzeug`(minimal) + `reparatur` + neuer Schadenfotos-Step. Weniger invasiv.
  - **B (früher Cut, EMPFOHLEN):** selbstzahler/kasko-frei überspringt die Feststellung ganz (erzeugeSelbstzahlerClaim wird eh früh gerufen); ZB1 + Schadenfotos wandern in den Portal-`schaden`-Step. Wirklich kurzer Flow, passt zu „das Onboarding für diese Claims verändern". 3724ced2 entscheidet final.
- **5b** — Pflichtdokumente-Matrix (`pflicht-dokumente.ts:9,15`): `Szenario`-Type um `selbstzahler` (+ ggf. `kasko_frei`) erweitern → minimal `['fahrzeugschein','fotos_schaden_uebersicht','fotos_schaden_detail']`, KEIN vollmacht/gutachten/versicherung. Sonst fallen diese Claims durch (heute kein passendes Szenario).

### WS6 — Operative Vollständigkeit / Loop-Closure (das „1+"). Heute 5 offene Enden
Ohne WS6 „funktioniert" der Flow, aber die Claims verrotten unbetreut. Alle Punkte grounded (Ist-Zustand verifiziert).
- **6a — Repair-Status auf den Claim spiegeln.** Der echte Fortschritt lebt auf `reparatur_termine.status` (angefragt/bestätigt/erledigt, `reparatur-termin-phase.ts`) und ist **unsichtbar** für `claims.operative_status` (19 SV/Regulierungs-Werte, `faelle/state-machine.ts:20-48`, KEINER passt auf Reparatur) → ein Selbstzahler-Claim hängt in `ersterfassung`. **Fix:** eine Reparatur-Phase aus `reparatur_termine` ableiten und in die Ops-Sicht (`ops/claim-workstate.types.ts`, `v_claim_workstate`) mappen — mit **470d55c9 (ops-cockpit)** koordinieren (deren `deriveClaimWorkstate`-Muster spiegeln, nicht divergent bauen).
- **6b — Unmanaged-Queue / Ops-Sichtbarkeit.** Selbstzahler = KB null (`convert-lead-to-claim.ts:194-196`, gewollt), aber KEINE Ops-Fläche filtert `kundenbetreuer_id IS NULL`-Reparatur-Claims → niemand fängt Steckenbleiber. **Fix:** Reparatur-Linse/Queue im Admin/Ops-Cockpit (kein KB-Zwang, aber ein Fallback-Blick).
- **6c — Repair-Nudge-Loop (NEU, crons).** `send-lead-reminders` (`cron/send-lead-reminders/route.ts`) feuert nur **vor** der Claim-Konversion. Post-Conversion GAP: kein Nudge für „Kunde hat 24 h keine Werkstatt gewählt" (`reparatur_werkstatt_id IS NULL`), „Werkstatt bestätigt Termin 48 h nicht" (`reparatur_termin_status='angefragt'`), „Termin vorbei, nicht erledigt". **Fix:** neuer Repair-Reminder-Cron (Muster: send-lead-reminders + `werkstatt-auftrag-phase.ts`). Ohne KB ist DAS der Ersatz-Antrieb.
- **6d — Auto-Abschluss bei `erledigt` + Provisions-Settlement.** Heute schließt `termin='erledigt'` den Claim NICHT (`fall-abschluss/route.ts:35-56` braucht `status='zahlung-eingegangen'`, das eine Reparatur nie erreicht → hängt offen). **Fix:** Repair-Closure-Pfad: `reparatur_termine.status='erledigt'` → `claims.operative_status='abgeschlossen'` + Werkstatt-Provision freigeben (`release-werkstatt-provisionen`-Trigger an Repair-Completion koppeln, statt an die Vermittlung).
- **6e — Rechnung/Beleg-Export für den Kunden (NEU).** KVA existiert (`KvaErstellenModal`), aber es gibt KEINE finale **Reparaturrechnung** + keinen Kunde-Download (`/kunde/faelle/[id]` hat keine „Rechnung/Beleg herunterladen"-Sektion). **Für Kasko-frei ist das der Knackpunkt:** der Kunde zahlt vor und braucht KVA + Rechnung, um sie bei SEINEM Versicherer einzureichen. **Fix:** Werkstatt lädt finale Rechnung (analog KVA), Kunde lädt ein „Beleg-Paket" (KVA + Rechnung + Fotos) herunter.
- **6f — Provision = das Money-Model explizit machen.** `partner_provisionen` (werkstatt, ~150–200 €, Lifecycle pending→freigegeben→ausgezahlt via `release-werkstatt-provisionen`) ist der einzige Umsatz — sicherstellen, dass die Vermittlung sie zuverlässig anlegt und 6d sie abrechnet. Mit **Provisions-Unifikations-Lane** (457ab612) koordinieren.

---

## Datenmodell
| Feld | Status | Aktion |
|---|---|---|
| `leads.eigene_versicherung` | existiert, ungenutzt | schreiben (WS1a) |
| `leads.freie_werkstattwahl` (bool) | **NEU** | `apply_migration` (WS2a) |
| `leads.schadensfoto_urls` | existiert (Dispatch-seitig) | Onboarding-Upload (WS3) |
| `claims.kostenvoranschlag_netto/brutto` | existieren | Kunde-Ansicht/-Upload (WS4) |
| `leads.abrechnungsweg` / `claims.abrechnungsweg` | existieren, NULL | füllen (WS1) + Backfill (WS1c) |
| Reparatur-Phase aus `reparatur_termine` | existiert (nur termin-seitig) | in `operative_status`/`v_claim_workstate` spiegeln (WS6a) |
| `claims.reparaturrechnung_url` (o.ä.) | **NEU/prüfen** | finale Rechnung Werkstatt→Kunde (WS6e) |
| `partner_provisionen` (werkstatt) | existiert | Release an Repair-Completion koppeln (WS6d/f) |

## Reihenfolge
**WS1 (Aktivierung) → WS2 (Kasko-frei) → WS3+WS4 (Fotos+KVA, parallel) → WS5 (Trim/Pflichtdok) → WS6 (Loop-Closure).**
WS1 belebt die bestehende Strecke (sichtbarer Sofort-Gewinn). **WS6 ist NICHT optional** — ohne sie verrotten die Claims unbetreut und die Provision (= einziger Umsatz) wird nie abgerechnet. „Operativ 1+" = WS1–WS6 vollständig.

## Koordination
- **Owner:** 3724ced2 (`kitta/werkstatt-flow-enrichment`).
- **Cross-Lane-Files:** `abrechnungsweg.ts`/`quali-flow-outcome.ts`/`convert-lead-to-claim.ts` (Kern) · `flow/[token]/*` (aar-956-Flow-Lane) · `feststellung-steps.ts`/`pflicht-dokumente.ts` · `kunde/faelle/[id]/*` (Kunde-Portal) · `v_werkstatt_auftrag`/Auftrags-Detail (3724ced2).
- **Regel 2:** neues Feld (WS2a) + Backfill (WS1c) via `apply_migration`, NICHT `execute_sql`.

## Prod-Fakten (verifiziert 08.07. via MCP)
- `leads.schuldfrage`: gegner=155, eigenverantwortung=69, null=99.
- `abrechnungsweg`: NULL bei allen 323 Leads + 32 Claims.
- `ueberEigeneVersicherung` wird nie persistiert (`leads.eigene_versicherung` ungenutzt).
- Kasko-Werkstattbindungs-Feld: existiert nirgends (0 Vorkommen).
