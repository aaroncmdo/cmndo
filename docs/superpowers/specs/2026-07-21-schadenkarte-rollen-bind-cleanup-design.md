# Schadenkarte — Rollen-Split (Beschreiben=Admin / Binden=alle) + Binding-überall + Lifecycle-Cleanup

Stand: 2026-07-21
Status: Design (approved Aaron: „das passt" + Admin write+optional-bind + NFC-read & QR beide jetzt). Noch nicht implementiert.
Branch/Worktree: `kitta/schadenkarte-rollen-cleanup` (aus `origin/staging`, enthält gemergtes #4647).

## Problem / Kontext

Aarons Prod-Fehler: eine geminte Charge-Karte wurde per NFC **beschrieben**, aber nie **gebunden** → tot (Gegner-Flow `/schaden/<token>` öffnet nur bei `status='gebunden'`; Schreiben setzt nur `nfc_uid`). Zwei Ursachen-Klassen:
1. **Beschreiben und Binden sind zwei unabhängige Schritte** — und der write-first-Provisioner (#4647) ließ den Flottenmanager Karten **beschreiben**, auch ohne zu binden.
2. Die **„Karten erzeugen"-Mint-Batch** produziert unbound-`bestellt`-Karten, die im Zweifel nie gebunden werden.

## Zielbild (Rollen)

- **Beschreiben (NFC-write) = NUR Admin.** Fulfillment (leere Karte → Token minten-on-tap + Chip bespielen + optional binden). Braucht Android → „am-Handy-öffnen"-Brücke. Der Flottenmanager kann so **keine Chips wahllos beschreiben**.
- **Binden (Token ↔ Fahrzeug) = Flottenmanager + Admin.** Operativ. Token wird **ausgelesen** (Karte antippen = NFC-**READ**, Android-only, ODER QR-Scan = Kamera, überall) und einem Fahrzeug zugewiesen. **Kein Schreiben.**
- **Nur gebundene Karten in den Flotten-Ansichten** — neue Karten bindet man durch **Antippen/Scannen der physischen Karte**, nicht aus einer Liste toter Tokens.

## Änderungen (Ist post-#4647 → Soll)

### 1. `src/components/flotte/SchadenkarteScanner.tsx` — NFC-READ ergänzen
Der Scanner liefert heute einen Token via Kamera (BarcodeDetector/jsQR) + manueller Eingabe. **Neu:** ein „Karte antippen (NFC)"-Button (nur wenn `nfcVerfuegbar()`), der `NDEFReader.scan()` startet → `onreading` → URL dekodieren → `extractSchadenkarteToken` → `onToken`. Android-only, QR/manuell bleiben universeller Fallback. Beide Consumer (KartenClient „identifizieren" + SchadenkarteBindenSection „binden") bekommen NFC-Read damit automatisch.

### 2. Flottenmanager `/flotte/karten` — Schreiben RAUS, Liste nur-gebunden
- `KartenClient.tsx`: `<NfcKarteBeschreiben …>` (Zeile ~112) **entfernen** (Flottenmanager schreibt nicht mehr) + die Props `onMintToken`/`onFinalize`. „Fahrzeug per Karte identifizieren" (SchadenkarteScanner) + Karten-Liste bleiben.
- `karten/page.tsx` + `karten/actions.ts`: die reinen Write-Actions `provisioniereKarteToken` + `finalisiereKarte` **entfernen** (dead nach Provisioner-Ausbau).
- Karten-Liste: **nur `status='gebunden'`** (via neuem Param `getKartenFuerFirma(db, firmaId, { nurGebunden: true })`).

### 3. Flottenmanager `/flotte/flotte` „Schadenkarte binden" (`SchadenkarteBindenSection`)
Nutzt `SchadenkarteScanner` → bekommt NFC-Read (aus Änderung 1) **automatisch**. Ggf. Label/Hinweis anpassen („QR scannen oder Karte antippen"). Bind-Logik (`bindeKarte`) unverändert.

### 4. Fahrzeug-Detail `/flotte/(shell)/fahrzeug/[id]/page.tsx`
Zeigt gebundene Karte + QR bereits ✓. **Neu:** wenn **keine** Karte gebunden → Bind-Widget (neues Client-Component `FahrzeugKarteBindClient`) mit `SchadenkarteScanner` (NFC/QR/manuell) → `bindeKarte(token, vehicleId=diese Seite)`. Fahrzeug ist durch die Route vorbestimmt.

### 5. Admin `firmen-flotte/[id]` — Mint-Batch RAUS, Beschreiben bleibt
- **Mint-Batch entfernen:** `kartenErzeugen`, State `mintAnzahl`/`mintCharge`/`mintBusy`/`mintFehler`, „Anzahl/Charge"-Inputs + „Karten erzeugen"-Button (`FirmenFlotteDetailClient.tsx`).
- **Behalten:** der `NfcKarteBeschreiben`-Provisioner (Zeile ~236) = Admin write+optional-bind (Android-Brücke). Dropdown-Bind (`karteBinden`) bleibt (Admin kann binden).
- Admin-Karten-Liste zeigt **alle** Status (Fulfillment-Tracking) — `getKartenFuerFirma` ohne `nurGebunden`.
- `firmen-flotte-karten.ts`: `minteKartenFuerFlotte` **entfernen** (dead). `provisioniereKarteTokenStaff` + `finalisiereKarteStaff` (Provisioner) + `bindeKarteAnFahrzeug` (Dropdown) bleiben.

### 6. Lib `getKartenFuerFirma`
Optionaler zweiter Param `opts?: { nurGebunden?: boolean }` → `if (opts?.nurGebunden) query.eq('status','gebunden')`. Default (kein Param) = alle (rückwärtskompatibel für Admin).

## Error-Handling / Konsistenz
- Result-Object, kein `throw`. `bindeKarte`/`bindeSchadenkarteAnFahrzeug` bestehende Fehlermeldungen. `revalidatePath` der betroffenen Flotten-/Fahrzeug-/Admin-Routen.
- NFC-Read non-fatal (Timeout/Abort → „nicht gelesen", QR-Fallback bleibt).
- `schadenkarten` nicht in `database.types.ts` → `AnyDb`-Cast.

## Testing
- **Unit (vitest):** `getKartenFuerFirma` mit `nurGebunden` (filtert `status='gebunden'`). SchadenkarteScanner-Token-Extraktion (bestehende `token`-Tests decken `extractSchadenkarteToken`). Der NFC-Read-Pfad (NDEFReader) = wie beim Provisioner nicht node-unit-bar → gestubbt/Playwright.
- **Regel 4 (Prod-Smoke, nach Deploy, Test-Konto):** Admin beschreibt Karte (Android-Brücke) → Flottenmanager bindet dieselbe Karte per **QR** (jedes Gerät) UND per **NFC-tap** (Android) → Karte `gebunden`, Gegner-Flow öffnet. Flotten-Liste zeigt nur gebundene. Mint-Batch weg. Fahrzeug-Detail: unbound → binden dort möglich.

## Risiken / Abgrenzung
- **Kollision mit A (#4657, noch offen):** beide fassen `FirmenFlotteDetailClient.tsx` + `firmen-flotte-karten.ts` an (A: FIN-Felder + staff-Actions; C: mint-Batch raus). Verschiedene Sektionen → meist auto-mergebar; bei Konflikt: A zuerst mergen, C rebasen. **Reihenfolge: #4647 (done) → A (#4657) → C.**
- NFC-Read nur Android — QR ist überall der Bind-Weg (kein Feature-Verlust auf iPhone/Desktop).
- Alt-`bestellt`-Karten-Cleanup (Bestand aus alten Mint-Batches) = optionaler späterer Datenlauf, nicht MVP.
- Sub-Projekt B (Foto-Zustandsdoku) separat.
