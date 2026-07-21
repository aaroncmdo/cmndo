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
- **Binden (Token ↔ Fahrzeug) = Flottenmanager + Admin.** Operativ, **device-agnostisch**, zwei Wege: **(a)** Karte **antippen** → das OS (iPhone + Android) öffnet `/schaden/<token>` → die Seite bietet dem eingeloggten Flottenmanager (ungebundene Karte seiner Firma) das Binden an; **(b)** in-app **QR-Scan** (Kamera) → Token → Fahrzeug. **Kein Web-NFC-Read, kein Schreiben.** Entscheidung (Aaron): den OS-Browser-Prompt beim Antippen NICHT bekämpfen, sondern als Bind-Einstieg **nutzen** — löst die scan-first-/Android-only-Reibung + funktioniert auf iPhone.
- **Nur gebundene Karten in den Flotten-Ansichten** — neue Karten bindet man durch **Antippen/Scannen der physischen Karte**, nicht aus einer Liste toter Tokens.

## Änderungen (Ist post-#4647 → Soll)

### 1. `/schaden/[token]` — rollen-bewusster Bind-Einstieg (der NFC-Tap-Weg)
Beim Antippen einer beschriebenen Karte öffnet das OS `/schaden/<token>`. **Neu — drei Zweige nach (Rolle × Karten-Status):**
- **Flottenmanager-der-Firma + Karte NICHT `gebunden`** → **„An Fahrzeug binden"-Panel** (Fahrzeug-Picker aus seiner Flotte → Bind-Action → `gebunden`).
- **Flottenmanager-der-Firma + Karte `gebunden`** → **Verwaltungs-/Info-View** (welches Fahrzeug, Status, QR) + bewusster **„Schaden melden"**-Button (startet den echten Claim-Flow **auf Klick**). **KEIN** automatisches Claim-Anlegen beim bloßen Antippen — sonst löst der Flottenmanager beim Prüfen seiner eigenen Karte versehentlich eine Schadenmeldung aus.
- **Alle anderen** (nicht eingeloggt / fremde Firma = Gegner bzw. Fahrer im Ernstfall) → der **bestehende Gegner-/Claim-Flow** unverändert.

**`SchadenkarteScanner` bleibt unverändert** (Kamera-QR + manuell) — **kein** `NDEFReader.scan()`. Auth-Gate: Bind-/Manage-Zweig verifiziert serverseitig Rolle=`flottenmanager` + `firma_id`-Match der Karte. Der Plan liest zuerst die aktuelle `/schaden/[token]/page.tsx`, um die Zweige sauber einzuhängen ohne den Gegner-Flow zu brechen.

### 2. Flottenmanager `/flotte/karten` — Schreiben RAUS, Liste nur-gebunden
- `KartenClient.tsx`: `<NfcKarteBeschreiben …>` (Zeile ~112) **entfernen** (Flottenmanager schreibt nicht mehr) + die Props `onMintToken`/`onFinalize`. „Fahrzeug per Karte identifizieren" (SchadenkarteScanner) + Karten-Liste bleiben.
- `karten/page.tsx` + `karten/actions.ts`: die reinen Write-Actions `provisioniereKarteToken` + `finalisiereKarte` **entfernen** (dead nach Provisioner-Ausbau).
- Karten-Liste: **nur `status='gebunden'`** (via neuem Param `getKartenFuerFirma(db, firmaId, { nurGebunden: true })`).

### 3. Flottenmanager `/flotte/flotte` „Schadenkarte binden" (`SchadenkarteBindenSection`)
Bleibt **QR-Scan-Bind** (Kamera + manuell, überall) — `bindeKarte` unverändert. Hinweis ergänzen: „QR scannen **oder Karte antippen**" (der Tap öffnet die Bind-Seite aus Änderung 1). **Keine** Web-NFC-Read-Ergänzung hier.

### 4. Fahrzeug-Detail `/flotte/(shell)/fahrzeug/[id]/page.tsx`
Zeigt gebundene Karte + QR bereits ✓. **Neu:** wenn **keine** Karte gebunden → Bind-Widget (neues Client-Component `FahrzeugKarteBindClient`) mit `SchadenkarteScanner` (**QR-Kamera + manuell**) → `bindeKarte(token, vehicleId=diese Seite)`. Fahrzeug durch die Route vorbestimmt. (Der NFC-Tap-Bind läuft device-agnostisch über `/schaden/token`, Änderung 1.)

### 5. Admin `firmen-flotte/[id]` — Mint-Batch RAUS, Beschreiben bleibt
- **Mint-Batch entfernen:** `kartenErzeugen`, State `mintAnzahl`/`mintCharge`/`mintBusy`/`mintFehler`, „Anzahl/Charge"-Inputs + „Karten erzeugen"-Button (`FirmenFlotteDetailClient.tsx`).
- **Behalten:** der `NfcKarteBeschreiben`-Provisioner (Zeile ~236) = Admin write+optional-bind (Android-Brücke). Dropdown-Bind (`karteBinden`) bleibt (Admin kann binden).
- Admin-Karten-Liste zeigt **alle** Status (Fulfillment-Tracking) — `getKartenFuerFirma` ohne `nurGebunden`.
- `firmen-flotte-karten.ts`: `minteKartenFuerFlotte` **entfernen** (dead). `provisioniereKarteTokenStaff` + `finalisiereKarteStaff` (Provisioner) + `bindeKarteAnFahrzeug` (Dropdown) bleiben.

### 6. Lib `getKartenFuerFirma`
Optionaler zweiter Param `opts?: { nurGebunden?: boolean }` → `if (opts?.nurGebunden) query.eq('status','gebunden')`. Default (kein Param) = alle (rückwärtskompatibel für Admin).

## Error-Handling / Konsistenz
- Result-Object, kein `throw`. `bindeKarte`/`bindeSchadenkarteAnFahrzeug` bestehende Fehlermeldungen. `revalidatePath` der betroffenen Flotten-/Fahrzeug-/Admin-Routen.
- `/schaden/token`-Bind/Manage: Auth-/Firma-Gate **serverseitig**; Result-Object; Fehlschlag → Meldung, kein Crash. Der **Gegner-Flow für Fremde bleibt unangetastet** (keine Regression am Ernstfall-Pfad).
- `schadenkarten` nicht in `database.types.ts` → `AnyDb`-Cast.

## Testing
- **Unit (vitest):** `getKartenFuerFirma` mit `nurGebunden` (filtert `status='gebunden'`). Die `/schaden/token`-Verzweigungs-Logik als **pure Guard-Funktion** (Rolle × firma-Match × Karten-Status → `bind` | `manage` | `gegner`). `bindeKarte`/`bindeSchadenkarteAnFahrzeug` sind bereits getestet.
- **Regel 4 (Prod-Smoke, nach Deploy, Test-Konto):** Admin beschreibt Karte (Android-Brücke). Flottenmanager bindet auf **zwei Wegen**: (a) Karte **antippen** → `/schaden/token` → „an Fahrzeug binden" (iPhone **und** Android), (b) in-app **QR-Scan** (Fahrzeug-Detail / „Schadenkarte binden"). Dann: **gebundene** Karte als FM antippen → **Info + „Schaden melden"** (kein Auto-Claim); als Nicht-FM/Gegner → normaler Claim-Flow. Flotten-Liste nur gebunden, Mint-Batch weg.

## Risiken / Abgrenzung
- **Kollision mit A (#4657, noch offen):** beide fassen `FirmenFlotteDetailClient.tsx` + `firmen-flotte-karten.ts` an (A: FIN-Felder + staff-Actions; C: mint-Batch raus). Verschiedene Sektionen → meist auto-mergebar; bei Konflikt: A zuerst mergen, C rebasen. **Reihenfolge: #4647 (done) → A (#4657) → C.**
- NFC-Read nur Android — QR ist überall der Bind-Weg (kein Feature-Verlust auf iPhone/Desktop).
- Alt-`bestellt`-Karten-Cleanup (Bestand aus alten Mint-Batches) = optionaler späterer Datenlauf, nicht MVP.
- Sub-Projekt B (Foto-Zustandsdoku) separat.
