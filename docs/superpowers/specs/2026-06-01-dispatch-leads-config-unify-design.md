# Dispatch-Leads × Flowlink — Config-getriebene Vereinheitlichung (Design)

**Datum:** 2026-06-01 · **Branch:** `kitta/dispatch-leads-config-unify` (ab staging) · **Status:** Design / Review

## 1. Problem & Ziel

Der Dispatcher-Lead-Detail-View (`/dispatch/leads/[id]`) ist heute **hart an eine 6-Phasen-Sequenz gebunden**: `page.tsx` rechnet `initialPhase` aus der Daten-Vollstaendigkeit, die `_lib/qualification-engine.ts` (q1–q8) + `_actions/hard-gate.ts` gaten den Fortschritt und setzen `qualifizierungs_phase` automatisch (inkl. **Auto-Disqualifikation**). Im Tagesgeschaeft ist das hinderlich — **kein Gespraech laeuft gleich**, aber die UI zwingt den Dispatcher in die Reihenfolge.

Gleichzeitig erfassen **Self-Service-Flowlink** (der `beauftragung`-Wizard, AAR-940/Y-Modell) und der **Dispatcher** dieselben Lead-Daten — nur erfasst beim Dispatch der Mensch im Vor-Gespraech Werte, *bevor* der Flowlink an den Kunden rausgeht. Onboarding + Flowlink laufen also faktisch **1:1 parallel** zum Dispatch.

**Ziel:** Dispatch + Onboarding/Flowlink erzeugen gemeinsam einen **production-ready Claim** — sauber, funktional, mit **allen relevanten Infos klar am Lead**, **ohne** Phasen-Zwang/Hard-Gates, **ohne** den Kunden zu verwirren. Einfachste Loesung.

## 2. Entscheidung (Aaron, 2026-06-01)

**Voll config-getrieben: ein Modell, zwei Renderer.** Die `onboarding_felder`-Config wird die **einzige** Definition „was ein Lead/Claim braucht". Sowohl der Kunden-Flowlink als auch der Dispatcher-View rendern aus derselben Config — der Kunde gestuft+simpel, der Dispatcher flach+frei.

## 3. Architektur

```
                onboarding_felder  (EINE Definition + audience + sektion)
                 /                                    \
   Kunden-Renderer (bleibt)                  Dispatcher-Renderer (NEU)
   WizardClient, gestuft,                    DispatchLeadForm, flach,
   audience in {kunde, beide}                audience in {dispatcher, beide}
   simpel, Kunde unverwirrt                  alle Sektionen sichtbar,
                                             frei editierbar, Autosave/Feld,
                                             kein Phasen-Lock, kein Hard-Block
                 \                                    /
                  -> dieselben Lead-Spalten (db_target) ->
                       Lead fuellt sich -> Convert -> Claim (claim-nativ)
```

## 4. Config-Schema-Erweiterung (`onboarding_felder` / `onboarding_phasen`)

Rein additiv:
- **`audience`** pro Feld: `kunde` | `dispatcher` | `beide` (default `beide`). Steuert, welcher Renderer ein Feld zeigt.
- **`sektion`** pro Feld: logische Gruppe fuer den flachen Dispatcher-View (`kontakt` · `schaden` · `unfall` · `termin_sv` · `service_kanzlei` · `status`). Der gestufte Kunden-Renderer nutzt weiter `onboarding_phasen.reihenfolge`.
- **Feld-Inventar:** alle heute in den 6 Dispatch-Phasen (`_phases/*`) + `hard-gate.ts` erfassten Felder werden als `onboarding_felder`-Eintraege modelliert (`db_target` = die bestehende leads-Spalte): Qualifizierung (unfallhergang, schuldfrage, aufklaerung_teilschuld, schaden_sichtbar, personenschaden/sachschaden/mietwagen/nutzungsausfall, hat_haftpflicht), Unfall (unfallort/kategorie/geo, unfalldatum, unfall_uhrzeit, polizei_vor_ort/aktenzeichen/pflicht, fahrzeug_fahrbereit), Schadentyp, Stammdaten (Personen, Fahrzeug, Gegner-KZ), Service/Kanzlei (schon im `beauftragung`-Flow), Termin/SV, Status. **Die exhaustive 1:1-Mapping-Tabelle (jedes Dispatch-Feld -> onboarding_felder-Zeile mit audience/sektion/db_target) ist ein Plan-Schritt** und wird gegen `_phases/*` + `hard-gate.ts` + `_actions/types.ts` + `qualification-engine.ts` verifiziert.
- Bestehende Flows (`beauftragung`, `kunde-onboarding`, `gutachter-finden`) bleiben unangetastet (default audience=beide).

## 5. Renderer

### 5.1 Kunden-Renderer (bestehend, unveraendert)
`WizardClient` (gestuft). Laedt nur Felder mit `audience in {kunde, beide}` — der Loader (`ladeBeauftragungPhasen` / `load-needed-phases`) filtert nach audience. Kunde bleibt simpel; Dispatcher-only-Felder tauchen nie im Flowlink auf.

### 5.2 Dispatcher-Renderer (NEU — `DispatchLeadForm`)
Flache Seite, ersetzt `DispatchShell` + die Phasen-Komponenten:
- Laedt Felder mit `audience in {dispatcher, beide}`, gruppiert nach `sektion` in aufklappbare Abschnitte (alle sichtbar).
- **Alle Felder frei editierbar, jederzeit** — keine Reihenfolge, kein Lock.
- **Autosave pro Feld** (debounced) auf den Lead, ueber das geteilte `db_target`-Mapping (`groupFelderByTarget` + eine token-/auth-Dispatcher-Save-Action; Dispatcher ist authentifiziert, daher RLS-Pfad wie heute).
- Feld-Renderer = die bestehenden `components/onboarding/fields/*` (text/segmented/toggle-cards/slot/signature/…) — wiederverwendet, kein neuer Feld-Typ-Zoo.
- Reiche Dispatch-Bausteine (SV-Dispatch-Panel, Gespraechsleitfaden, Kunden-Match) wandern als **Sektion-Inhalte** mit, nicht als Phasen-Gates.

## 6. Gates -> nicht-blockierende Flags

Die heutige Auto-Disqualifikation (`hard-gate.ts`: `eigenverschulden` / `kein_schaden` / `kein_haftpflicht` -> `qualifizierungs_phase='disqualifiziert'`) entfaellt als **Block**. Stattdessen:
- Dieselben Fakten werden als **Warn-Badges** angezeigt („Achtung: Eigenverschulden — i.d.R. kein Haftpflicht-Anspruch").
- Der Dispatcher entscheidet selbst (markiert disqualifiziert manuell ODER macht weiter).
- Ein abgeleiteter **Vollstaendigkeits-Indikator** (welche `pflicht`-Felder fuer den Convert fehlen) bleibt als **Info**, nicht als Sperre. Die `qualification-engine`-Phasenableitung wird nicht mehr zur UI-Steuerung gebraucht.

## 7. Flowlink-aus-Dispatch & Claim

- Dispatcher erfasst im Call frei -> Button **„Flowlink schicken"** (bestehende Flowlink-Ausstellung) -> Kunde vervollstaendigt den Rest im simplen Wizard.
- Beide schreiben **denselben Lead**. „Lead vollstaendig" = alle `pflicht`-Felder (audience-uebergreifend) gefuellt -> **Convert -> Claim** (claim-nativ, `signSAandCreateFall` / `convertLeadToClaim`, schon verdrahtet). Kein Hard-Gate blockiert den Convert; fehlende Pflichtfelder werden angezeigt, nicht erzwungen.

## 8. Migrations-Phasierung (Live-Dispatch NICHT brechen)

1. **P0 — Schema additiv:** `onboarding_felder.audience` + `.sektion`. Default audience=beide -> bestehende Flows unveraendert. (Plugin-`apply_migration`, Twin-Drift-konform.)
2. **P1 — Feld-Inventar seeden:** alle Dispatch-Felder als `onboarding_felder` (audience, sektion, db_target=leads-Spalte). Additiv, kein UI-Change.
3. **P2 — `DispatchLeadForm` bauen** (flach, Autosave, Flags) — **hinter `?v2`-Flag**, NEBEN der Live-Phasen-UI. Smoke auf staging.
4. **P3 — Cutover:** `/dispatch/leads/[id]` rendert default `DispatchLeadForm`; Phasen-Maschinerie (`DispatchShell`, `qualification-engine`, `initialPhase`, hard-gate-Gating, `_phases/*` Gates) **entfernen** nach gruenem Smoke. Disqualifikation-als-Flag live.
5. **P4 — Kunden-Loader audience-filtern** + Re-Smoke beider Strecken (Flowlink simpel, Dispatcher vollstaendig).

## 8a. Datenfeld-Inventar nach Sektion (audience: K/D/B = kunde/dispatcher/beide)

- **Kontakt:** vorname, nachname, telefon, email, bevorzugter_kanal (B) · **WhatsApp-Check** `whatsapp_verfuegbar` (B) — prueft ob die Nummer WA hat (Flowlink-Kanal-Wahl).
- **Schaden:** schadentyp, schaden_sichtbar, hergang, Flags personen/sach/mietwagen/nutzungsausfall (B) · Schadenfotos-Upload (B) · **Vorschaeden** (hat_vorschaeden / Cardentity, B).
- **Unfall:** unfallhergang, unfallort+kategorie+geo, datum/uhrzeit, polizei, gegner-KZ + gegner-Versicherung (B) · **Unfallskizze** (B — Zeichen-Canvas, Kunde UND Dispatcher) · **Zeugen** (B) inkl. **Zeuge telefon/email** (damit wir den Zeugen direkt kontaktieren koennen) · **Unfallgegner-Kontakt** telefon/email (B — Erfassung jetzt, Gegner-Flowlink spaeter, s. 8d).
- **Fahrzeug/Stammdaten:** FIN/HSN/TSN, Hersteller/Modell/Baujahr, kennzeichen, fahrzeug_fahrbereit, Halter (B) · **ZB1/Fahrzeugschein: Upload -> OCR -> Preview/Korrektur -> manueller Fallback** (B, s. 8b).
- **Schuld/Haftpflicht:** schuldfrage, aufklaerung_teilschuld, hat_haftpflicht (B) -> als **Flags**, nicht Gate.
- **Service/Kanzlei:** service_typ, kanzlei_wunsch (B). **Termin/SV:** besichtigungsort, wunschtermin, Matching/Booking (B). **Vollmacht:** SA (B).
- **Status:** flow_link-Status, disqualifiziert = **manuelles Flag**.
- **NICHT im Scope (Aaron 2026-06-01):** Bankdaten / Vorsteuer.

## 8b. OCR — IMMER zuverlaessig in die DB (Bug-Fix)

**Ist (verifiziert an `Zb1UploadField`):** Upload -> `uploadDokumentViaAnfrageToken('fahrzeugschein')` schreibt die OCR-Extraktion serverseitig auf den Lead (H6-Regel: nur leere Felder). **ABER** die **Korrektur** (`confirmZb1Korrekturen(fallId, diff)`) und **Neu-Fotografieren** (`clearZb1Felder(fallId)`) brauchen eine `fallId` — die im **Pre-Fall-Flowlink nicht existiert** -> `handleBestaetigen` ist dort ein No-op. **Kunden-Korrekturen am OCR gehen im Self-Service verloren.**
**Soll:** OCR-Extraktion UND -Korrektur persistieren **immer** auf den Lead, **token-basiert** (token-Variante von `confirmZb1Korrekturen`/`clearZb1Felder`, nicht fallId-gated). Gilt fuer alle OCR/Beleg-Felder (`lib/ocr`, `lib/ocr-beleg`).

## 8c. Checkliste vor Flowlink-Versand (nicht-blockierend) + Anforderung

Vor dem Flowlink-Versand: **Uebersicht „erfasst / offen"** (welche pflicht-Felder fehlen) + **Anforder-Buttons** — der Dispatcher fordert fehlende Dokumente/Infos beim Kunden an (`dokumente-anfordern`). **Kein Hard-Gate** — Versand jederzeit moeglich.

## 8d. Future (erst Fundament, dann ausbauen)

**Unfallgegner-Flow:** Ist der Gegner-Kontakt (telefon/email) erfasst, kann der Dispatcher ODER der Kunde dem **Gegner einen simplen Flowlink schicken** — der Gegner fuellt nur **wie der Unfall ablief (Hergang)** + **bestaetigt, dass er schuld ist (Schuldeingestaendnis)**, ggf. seine VS-Daten -> Schaden wird gegen die gegnerische Haftpflicht gemeldet (NFC-Unfallgegner-Konzept). **Jetzt nur den Kontakt erfassen**; den Gegner-Flowlink bauen wir spaeter aus. Dieser simple „Hergang + Schuldeingestaendnis"-Capture ist auch direkt im Dispatch nutzbar.

## 9. Risiken / Offen

- **Live-Dispatch = Tagesgeschaeft** -> strikt flag-gated + Re-Smoke vor Cutover; P3-Drop erst nach gruenem Smoke (CMM-44-Lesson: Reader-Sweep vor Drop).
- **Viele aktive Sessions** auf dispatch/leads/monika-embed -> Datei-/Migrations-Koordination (eigener Branch hilft; vor Schema-Migration `information_schema` live pruefen).
- **Feld-Inventar-Vollstaendigkeit:** kein Dispatch-Feld darf verloren gehen — exhaustive Mapping-Tabelle im Plan, gegen `_phases/*` + `hard-gate.ts` + `types.ts` + `qualification-engine.ts` verifizieren.
- **Autosave-Semantik:** debounce, Konflikt-Handling, RLS sauber definieren (Dispatcher ist auth, kein anon-Token-Pfad noetig).
- **audience-Leak-Schutz:** Dispatcher-only-Felder duerfen NIE im Kunden-Flowlink erscheinen — Loader-Filter + Smoke.
- **Disqualifikations-Geschaeftsregel:** Reporting/Triage, das heute auf `qualifizierungs_phase='disqualifiziert'` filtert, muss auf das manuelle Flag umgestellt werden (sonst „verschwinden" disqualifizierte Leads nicht mehr aus den Queues).

## 10. Betroffene Files (grob)

- **DB:** `onboarding_felder` (+`audience`/`sektion`), Seed Dispatch-Felder.
- **Neu:** `DispatchLeadForm` (+ Sektion-Komponenten), eine Dispatcher-Save-Action (reuse `groupFelderByTarget`).
- **Geaendert:** `src/app/dispatch/leads/[id]/page.tsx` (flag-gated Render), Kunden-Loader (audience-Filter), `src/app/dispatch/leads/page.tsx` (Liste: source_channel/status sichtbar, optional).
- **Entfernt (P3):** `DispatchShell`, `_lib/qualification-engine.ts`, `_phases/*`-Gating, `hard-gate.ts`-Gating (Flag-Logik bleibt als Badge).

## 11. YAGNI / Non-Goals

- Kein neuer Feld-Typ-Zoo — bestehende `fields/*` reichen.
- Kein Rewrite des Kunden-Wizards — der bleibt wie er ist (nur audience-Filter).
- Keine Aenderung am Convert/Claim-Pfad — `signSAandCreateFall`/`convertLeadToClaim` bleiben.
- Kein Big-Bang — strikt P0->P4 gephased, jede Phase eigener PR + Smoke.
