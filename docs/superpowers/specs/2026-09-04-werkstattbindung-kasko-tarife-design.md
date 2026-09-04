# Werkstattbindung in Kasko-Tarifen — Design

**Datum:** 04.09.2026 · **Status:** von Aaron freigegeben („dann gieß es in einen Plan", 04.09.; Empfehlungen
E1–E7 aus dem Scan unverändert übernommen) · **Scan:** `docs/2026-09-03-werkstattbindung-kasko-tarife-scan.md`
· **Quelle:** `werkstattbindung-kasko-tarife-2026.md` (CHECK24-Tarifliste 20.07.2026, 71 Marken, 538 Varianten)

## 1 · Problem

Bei einem selbstverschuldeten Schaden reguliert die eigene Kasko. Ob Claimondo dem Kunden eine
Partner-Werkstatt vermitteln darf, hängt vom Kasko-Tarif ab: Tarife mit **Werkstattbindung** (HUK „Kasko
SELECT", Allianz „WerkstattBonus", VHV „Schadenservice PLUS mit Werkstattservice" …) lassen den Versicherer die
Werkstatt benennen; bei freier Werkstatt drohen Kürzung auf 80/85 %, Sonder-Selbstbeteiligung und Wegfall der
Servicebausteine. Heute fragt der FlowLink binär „Dürfen Sie die Werkstatt frei wählen?" (Selbstauskunft,
`freie_werkstattwahl`), zeigt bei „gebunden" einen fachlich falschen Text (Gutachterkosten/Haftpflicht), und
drei Eingänge (Embed-Werkstatt-Finder, Kunden-Schadenmeldung, Werkstatt-QR) vermitteln Kasko-Kunden eine
Werkstatt, ohne die Bindung je zu fragen. Der Name der eigenen Versicherung wird nirgends erfasst.

## 2 · Ziel (Phase 1)

Der Kunde wählt im Kasko-Fall **Versicherer-Marke und Tarif**; daraus wird `freie_werkstattwahl` abgeleitet
und mit Herkunft gespeichert. Frei → Werkstatt-Strecke wie heute. Gebunden → ehrliche Endseite mit Marke,
Tarif, Sanktion, Versicherer-Kontakt, nächsten Schritten und optionalem Rückruf; keine Vermittlung; Dispatch
sieht Tarif und Grund. Unklar → durchlassen mit Hinweis plus Dispatch-Aufgabe. Alle drei Umgehungen
stellen dieselbe Frage. Die Wissensbasis liegt in der Datenbank (Aaron), ist anon lesbar (FlowLink läuft
ohne Login) und per Admin-Seite einsehbar.

**Nicht in Phase 1** (eigene Pläne): Anspruchsprüfung (`/check`-Tier `kasko` mit Tariffrage, Befund 4
`selbst → eigenverantwortung`, API-Parameter `werkstattbindung`, Foto-Tool-Hinweis) = Phase 2;
Marketing/GEO (Ratgeber-Seite, Tarif-Check-Tool, 173 Stadtseiten, `llms.txt`, Versicherer-Seiten,
autounfall-io-FAQ) = Phase 3; Admin-**Bearbeitung** der Tarife (Phase 1 nur Liste); i18n der neuen
Flow-Texte (Phase 1 deutsch, wie der ersetzte Step); OCR des Versicherungsscheins.

**Geparkt (Aaron 04.09.: „zu advanced, lassen wir weg"):** Schein-Upload mit Tarif-OCR · Soft-Gate bei „unbekannt" an der Reparaturfreigabe · Marke/Tarif im Makler-Drawer · Flotten-Police je Firma · juristische Prüfung der Sanktionstexte · Kontaktfelder für Marken ohne Rechtsträger · Sammlung der Freitext-Versicherer · i18n des neuen Steps · Werkstatt-Seite (Partnernetze als Matching-Kriterium, Kasko-Infokarte im Werkstatt-Portal, Policennummer, Kostenübernahme/Selbstbeteiligung, Vergütung vermittelter Kasko-Aufträge). Bleibt als Ideenliste für spätere Phasen, keine Zusage.

## 3 · Entscheidungen (Aaron 04.09.)

| # | Entscheidung |
|---|---|
| E1 | Eigene **Marken-Ebene** (`kasko_versicherer_marken`), optionaler Link auf `versicherungen` (Rechtsträger, Hotline/Schaden-Mail). `versicherungen` bleibt unverändert. |
| E2 | Bindung erkannt → Endseite mit konkreten nächsten Schritten **und** optionalem Rückruf-Button (bestehende `fordereRueckrufAn`); **keine** Werkstatt-Vermittlung. |
| E3 | „Kann ich gerade nicht prüfen" → **durchlassen mit Hinweis** plus Dispatch-Aufgabe „Kasko: Werkstattbindung klären" (`createLinkedTask`). |
| E4 | Phase 1 = Wissensbasis + FlowLink + Umgehungen + Dispatch-Sichtbarkeit; Phase 2 Anspruchsprüfung; Phase 3 Marketing. |
| E5 | Admin in Phase 1 **nur Liste** (`/admin/einstellungen/kasko-tarife`); Pflege über neu generierten Seed. |
| E6 | **Zusammenfassungs-Mail** nach Abbruch wegen Bindung (Marke, Sanktion, Versicherer-Kontakt, nächste Schritte). |
| E7 | Bindungsumfang **nur Glas** (Signal Iduna/VÖDAG „Sorglos Kasko Glas", KRAVAG „Glas") gilt bei Karosserieschaden als **frei**, mit Hinweis. |

Annahmen: Die Tariffrage wird nur im Kasko-Szenario gestellt (Haftpflicht = freie Wahl kraft BGH,
Selbstzahler = keine Police, Teilschuld = Dispatch-Rückruf). Im Flow ist der Schaden ein Unfall-/
Karosserieschaden (`schadenIstGlas=false`).

## 4 · Datenmodell

### 4.1 Wissensbasis (neu, Referenzdaten: RLS an, SELECT für anon+authenticated, Schreiben nur service_role)

```
kasko_versicherer_marken   id · slug (unique) · marke (unique) · versicherung_id (FK versicherungen, nullable, SET NULL)
                           · wb_status CHECK optional|standard|keine · wb_marker text[] · nicht_wb_marker text[]
                           · hinweis · varianten_hinweis · check24_vertrieb CHECK P|L · quelle · stand date
                           · sortierung · aktiv · erstellt_am · aktualisiert_am
kasko_tarife               id · marke_id (FK, CASCADE) · linie · wb_zusatz (nullable) · anzeigename
                           · hat_werkstattbindung bool · bindungsumfang CHECK keine|voll|nur_glas|unklar
                           · verlaesslichkeit CHECK belegt|abgeleitet|nicht_belegt · reihenfolge · aktiv
                           · UNIQUE (marke_id, anzeigename)
kasko_wb_konditionen       id · key (unique; slug oder '__default__') · marke_id (FK, nullable, CASCADE)
                           · nachlass_text · sanktion_modell CHECK kuerzung_80|kuerzung_85|sonder_sb|deckelung
                             |vollverweigerung|kuerzung_unbestimmt|keine|unbekannt · sanktion_text · gilt_fuer
                           · ausnahmen_text · partnernetz · akb_fundstelle · quelle
```

Seed-Regeln: Quelle ist die versionierte Datei `scripts/kasko-wb/wissensbasis-2026-07-20.json` (72 Marken:
71 CHECK24 + HDI ohne Tarife); ein Generator (`scripts/lib/kasko-wb-seed.mjs`) baut daraus idempotentes
Upsert-SQL **ohne UUIDs** (Marken per `slug`, Tarife per `(slug, anzeigename)`, `versicherung_id` per
`UPDATE … FROM versicherungen v WHERE v.name = …`) — Replay-fest trotz nicht versioniertem
`versicherungen`-Seed. Tariflinien werden expandiert: pro Linie eine Zeile ohne Zusatz (frei) und je
WB-Zusatz eine Zeile mit Zusatz (gebunden); `linien_ohne_wb` nur frei, `linien_nur_wb` nur gebunden;
Marken mit `wb_status=keine` nur freie Zeilen; `standard` nur gebundene. Nicht bindungsrelevante Zusätze
(„(Mitglieder)", „Vorkasse", „Elektro Paket", „Kasko PLUS", „Nix-Passiert" …) werden **nicht** als Zeilen
vervielfacht, sondern als `varianten_hinweis` bzw. `nicht_wb_marker` geführt.

### 4.2 Lead und Claim (beide Tabellen identisch)

```
eigene_versicherung_marke_id uuid FK kasko_versicherer_marken ON DELETE SET NULL
eigene_versicherung_name     text        -- Freitext-Fallback („Meine Versicherung ist nicht dabei")
eigene_kasko_tarif_id        uuid FK kasko_tarife ON DELETE SET NULL
eigene_kasko_tarif_name      text        -- Anzeigename zum Zeitpunkt der Wahl (Historie)
werkstattbindung_quelle      text CHECK NULL|tarif|marker|kunde|dispatcher|dokument|unbekannt
```

`freie_werkstattwahl` (bestehend) bleibt **das** Entscheidungsfeld; alle Leser (`quali-flow-outcome`,
`istWerkstattReparaturWeg`, Reminder-Cron, Convert, Spiegel, QR-Trigger) bleiben gültig. Auf `claims` werden
die fünf neuen Spalten **kundensichtbar gegrantet** (`GRANT SELECT (…) TO authenticated`; der Kunde hat sie
selbst eingegeben; `freie_werkstattwahl` ist bereits gegrantet) → der Claims-Column-Grants-Check bleibt grün.
`convert-lead-to-claim.ts` kopiert die fünf Felder; `spiegle-quali-auf-claim.ts` (`QUALI_FELDER`) trägt sie
nach, wenn der Claim vor der Antwort entstand.

### 4.3 Flow-Config

Step `werkstattbindung_check` (Szenario `kasko`, Position 3) bleibt; **Bedingung** wird
`{"freie_werkstattwahl": null, "werkstattbindung_quelle": null}` — so verschwindet der Step auch nach einer
„unbekannt"-Antwort (`quelle='unbekannt'`, `freie_werkstattwahl` bleibt NULL) und fragt beim Re-Visit nicht
erneut. `bauFlowKontext` liefert `werkstattbindung_quelle` (Rohspalte, beim Betreten des Flows final).

### 4.4 QR-Trigger

`set_reparatur_werkstatt_from_qr`: Bedingung `NEW.freie_werkstattwahl IS NOT TRUE` → `IS NULL`. Auto-Zuweisung
der werbenden Werkstatt nur, wenn die Bindung noch **unbekannt** ist; `false` (gebunden) und `true` (Kunde
wählt selbst, Entscheidung 13.07.) unterbleiben beide.

## 5 · Ableitung (pure, getestet)

`leiteWerkstattbindungAb({ wbStatus, tarif, markerAntwort, schadenIstGlas })` →
`{ freieWerkstattwahl: boolean|null, quelle, grund }`, Reihenfolge:

1. `wbStatus='keine'` → frei (`tarif`, `keine_wb_bei_marke`) · `'standard'` → gebunden (`standard_wb`)
2. Tarif gewählt: `hat_werkstattbindung=false` → frei (`tarif_ohne_wb`); `nur_glas` und kein Glasschaden → frei
   (`nur_glas_karosserie`, Hinweis); sonst gebunden (`tarif_mit_wb`)
3. Marker-Antwort: ja → gebunden (`marker`); nein → frei (`marker`)
4. sonst → `null` (`unbekannt`)

## 6 · Kundenweg

**Komponente `KaskoTarifFrage`** (client, wiederverwendet in FlowLink, Embed und Kunde-Portal), drei Stufen:

1. „Bei welcher Versicherung ist Ihr Fahrzeug kaskoversichert?" — `VersichererSelect` über die Marken
   (Suche), Option „Meine Versicherung ist nicht dabei" → Freitext → Stufe 3 (generische Marker-Frage).
2. Marke `optional` mit Tarifen: „Welchen Tarif haben Sie bei {Marke}?" — Liste der Tarife mit Badge
   „freie Werkstattwahl" / „Werkstattbindung" / „Glas-Bindung", Verlässlichkeits-Hinweis bei
   `abgeleitet`/`nicht_belegt`, Option „Ich weiß es nicht / mein Tarif steht nicht dabei" → Stufe 3.
   Marke `keine`/`standard` oder ohne Tarife (HDI): Stufe 2 entfällt.
3. „Steht auf Ihrem Versicherungsschein einer dieser Zusätze?" (Marker der Marke als Chips) —
   Ja / Nein / Kann ich gerade nicht prüfen.

Immer sichtbar: „Maßgeblich sind Ihr Versicherungsschein und Ihre AKB (Stand CHECK24 20.07.2026)."

**Ergebnis-Routing (FlowLink, `speichereKaskoTarifFlow`):** frei → Tariffelder speichern, bestehendes
`speichereQualiFlow(token,'eigenverantwortung',true,true)` → Werkstatt-Strecke · gebunden → `…,false` →
Disqualifikation (bestehend, Grund `werkstattbindung`) + **`KaskoBindungEndansicht`** + Mail (E6) ·
unbekannt → `…,undefined` (weiter) + `werkstattbindung_quelle='unbekannt'` + Dispatch-Task (E3) + Hinweis-
Screen „Wir vermitteln trotzdem — bitte vorher im Schein prüfen".

**`KaskoBindungEndansicht`**: Marke/Tarif, Marker, Sanktion (Konditionen der Marke oder GDV-Default),
„Was das bedeutet", „So geht es weiter" (Schaden melden: Hotline/Schaden-Mail aus `versicherungen`;
Partnerwerkstatt benennen lassen; Ausnahmen Totalschaden/Ausland/keine erreichbare Partnerwerkstatt),
Disclaimer, Button „Rückruf anfordern" (→ `fordereRueckrufAn`). Ersetzt `KaskoEndansicht` für
`disqualifiziert_grund_key='werkstattbindung'` (Quali-Step, WB-Step, Re-Visit-Gate im Wizard).

**Umgehungen schließen:**
- Embed-Werkstatt-Finder: Karte „Über meine Kaskoversicherung" öffnet `KaskoTarifFrage` inline; „Weiter"
  erst mit Antwort; gebunden → kompakter Bindungs-Hinweis, Kontakt-Schritt wird zum Rückruf-Formular,
  Lead entsteht **ohne** Werkstatt-Zuweisung und wird disqualifiziert (Grund `werkstattbindung`).
- Kunde-Portal: Kasko-Claim ohne Bindungsantwort zeigt statt `WerkstattFinderCard` eine `KaskoTarifCard`;
  gebunden → `KaskoBindungCard` (Info, keine Vermittlung). `brauchtWerkstattVermittlung` liefert bei
  `freie_werkstattwahl=false` false; `assignReparaturWerkstatt` verweigert die Zuweisung bei `false`
  (Defense in Depth für Dispatch/KB/SV).
- Werkstatt-QR: Trigger-Bedingung (4.4).

## 7 · Dispatch und Admin

- `DispatchGatesPanel`: Warn-Badges „Kasko mit Werkstattbindung ({Tarif}) — keine Vermittlung" bzw.
  „Kasko — Werkstattbindung noch nicht geklärt"; Badge mit `disqualifiziert_grund_key` (heute nie sichtbar).
- Neues Dispatcher-Feld `eigene_kasko_tarif` (onboarding_felder, Sektion `schuld`, nur bei
  `schuldfrage=eigenverantwortung`, `audience=dispatcher`) mit Rich-Override `DispatchKaskoTarifField`:
  Marke, Tarif, Bindung (frei/gebunden/unbekannt) — Override schreibt `werkstattbindung_quelle='dispatcher'`.
  `saveStammdaten`-Allowlist um die sechs Felder erweitert.
- Admin `/admin/einstellungen/kasko-tarife`: read-only Tabelle Marken (Status, Marker, Tarife frei/gebunden,
  Rechtsträger verknüpft ja/nein, Stand).

## 8 · Fehlerbehandlung

Server-Actions liefern `{ ok, … } | { ok:false, error }`. Nicht-kritisch (try/catch, nur Log): Mail,
Dispatch-Task, Spiegel auf den Claim, FK-Backfill. Kritisch: Lead-Update der Tariffelder und der
Quali-Pfad (bestehend). Fehlt die Wissensbasis (0 Zeilen), fällt `KaskoTarifFrage` auf die generische
Marker-Frage zurück — der Flow läuft weiter (kein leerer Screen).

## 9 · Tests

- vitest: `leiteWerkstattbindungAb` (alle acht Gründe), Seed-Generator (Expansion, Escaping, Idempotenz,
  Validierung: 72 Marken, eindeutige Slugs, optional ⇒ Marker vorhanden, keine ⇒ nur freie Zeilen),
  `buildDisqualifikationPatch`, `bauFlowKontext` (neues Feld), `brauchtWerkstattVermittlung` (false bei
  gebunden), `kannWeiter('abrechnung')` mit Kasko, `buildWerkstattFinderLeadExtra` (keine Zuweisung bei
  gebunden), E-Mail-HTML-Builder (Escaping).
- Build-Gates: `tsc`, `next build`, `check:use-server-exports`, `check:server-actions`,
  `check:claims-column-grants`, `check:query-drift`/`check:query-parse` (Types + Snapshot regeneriert),
  `check:component-set`, `check:token-audit`, `check:migration-files`, `check:i18n`.
- Regel 4 (staging, manuell, per UI): FlowLink Kasko → HUK-COBURG → „Classic SELECT" → Endseite mit
  Hotline und Rückruf-Button; → „Classic" → Werkstatt-Strecke; → „weiß nicht" → Hinweis + Dispatch-Task;
  Embed-Finder Kasko gebunden → kein Werkstatt-Angebot, Lead disqualifiziert; Kunde-Portal Kasko-Claim →
  Tarif-Card statt Finder; Dispatch zeigt Tarif, Badge und Feld.

## 10 · Risiken und Gegenmaßnahmen

- **Regel 2 / Twin-Drift:** drei Migrationen ausschließlich über `apply_migration`, Version aus
  `list_migrations`, Datei exakt danach benennen; danach `generate_typescript_types` und Schema-Snapshot.
- **Stille CHECK-Rejects:** neue CHECK-Werte (`werkstattbindung_quelle`) stehen in Types **und** Zod-freier
  TS-Union; Tests decken jeden Wert ab.
- **Config wirkt sofort, Code erst nach Deploy** (Migration 3 ändert die Step-Bedingung): die Bedingung
  ist mit altem Code kompatibel (`werkstattbindung_quelle` ist im alten Kontext `undefined` = leer ⇒
  Step erscheint wie bisher). Onboarding-Feld ohne Override-Code rendert als Textfeld — harmlos.
- **Marketing-Build** hat eigene Types: nicht betroffen in Phase 1.
- **Datenqualität:** `verlaesslichkeit` und `hinweis` sichtbar; Disclaimer auf jedem Screen; Stand-Datum
  in der DB; Re-Seed über Generator.
