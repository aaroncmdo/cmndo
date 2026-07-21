# Schadenkarte NFC — Blanko-Write-First-Provisioner (Flottenmanager + Admin)

Stand: 2026-07-21
Status: Design (approved Aaron: Richtung A + Detail A). Noch nicht implementiert.
Branch/Worktree: `kitta/flotte-kartenbindung-nfc` (aus `origin/staging`).

## Problem / Befund

Die „Kartenbindung per NFC" wirkt für Flottenmanager **und** Admin kaputt („es gibt schlicht keine NFC-Funktion die geöffnet wird oder wo ich eine Karte per NFC beschreiben könnte" — getestet auf Android/Chrome).

Ist-Zustand:

- Das NFC-Beschreiben existiert **nur** im Flottenmanager-Portal `/flotte/karten`, Kachel „Karte beschreiben (NFC)" (`src/components/flotte/NfcKarteBeschreiben.tsx`, gemountet in `KartenClient.tsx:110`).
- Es ist dort hinter **„erst den aufgeklebten QR scannen"** verriegelt (Phase `scannen` → `auflegen`). Der eigentliche NFC-Schreiben-Button erscheint erst **nach** einem QR-Scan.
- → Legt man eine **Blanko-Karte ohne aufgedruckten QR** auf, kommt man nie zum NFC-Schritt. Sackgasse = „keine NFC-Funktion".
- Der Admin (`/admin/vertrieb/firmen-flotte/[id]`, „Schaden-Karten") kann nur Karten **minten** + per **Dropdown** an ein Fahrzeug binden — **gar kein NFC**.

Grund für das QR-first-Design (`NfcKarteBeschreiben.tsx` Kopfkommentar): bei **vorbedruckten** Karten soll „Chip == Aufdruck" erzwungen werden. Bei **Blanko-Karten (Aarons Modell: leere Karten, selbst beschrieben)** gibt es keinen Aufdruck → der Zwang ist reine Reibung.

## Ziel

Blanko-Karten **NFC-primär** provisionieren: Chip auflegen → Karte wird beschrieben (Token entsteht beim Antippen), optional in einem Tap ans Fahrzeug gebunden. Für **beide** Rollen erreichbar, mit ehrlicher Behandlung der Plattform-Grenze.

## Constraints (unverhandelbar)

1. **Web NFC (`NDEFReader`) = nur Chrome/Android.** Desktop (auch Chrome) und iPhone haben es nicht. Der **Admin am Desktop kann physisch nie einen Chip beschreiben** — das echte Schreiben ist immer ein Android-Handy-Job, egal welche Rolle. (Ausnahme USB-NFC-Leser via WebUSB = eigenes Projekt, hier out-of-scope.)
2. **„Beschreiben" und „binden" sind orthogonal.** In `schadenkarten`: `nfc_uid IS NULL` = noch nicht beschrieben (Inventar, **keine** Security — beim Antippen überträgt das OS nur die URL, nicht die UID). `status='gebunden'` + `fahrzeug_id` = gebunden; **nur `gebunden` öffnet den Gegner-Flow** (`schadenkarte.ts:163`). Eine beschriebene, aber ungebundene Karte ist „programmiert, aber noch nicht scharf".
3. **Kein DB-Change.** `schadenkarten` trägt `nfc_uid`, `status` (`bestellt`/`frei`/`gebunden`/`gesperrt`/`ersetzt`), `fahrzeug_id`, `charge`, `karten_token` bereits. Reiner App-Layer-Umbau → kein Migration/Regel-2-Risiko. Schema aus dem laufenden `src/lib/schadenkarte/schadenkarte.ts` abgeleitet (Consumer-Verifikation).

## Design

### Kern: `KarteNfcProvisioner` (Rework von `NfcKarteBeschreiben.tsx`)

Ersetzt die QR-first-Kachel durch einen write-first Ablauf. **Kein QR-Zwang.**

Pro Karte:

1. **(Optional) Fahrzeug wählen** — Dropdown aus den Fahrzeugen der Firma. Kein Fahrzeug = nur beschreiben (Batch vorbereiten). Fahrzeug gewählt = beschreiben **+ binden** in einem Tap.
2. **„Karte beschreiben"** →
   a. Server `provisioniereKarteToken()` → frischer Token `T` (mint 1, `status='bestellt'`). Der Token wird **über Retries desselben Kartenversuchs wiederverwendet** (nicht bei jedem Fehlversuch neu minten → begrenzt verwaiste `bestellt`-Zeilen).
   b. Client `NDEFReader.write(buildSchadenkarteUrl(T), { overwrite: false, signal })`.
      - **Leere Karte:** schreibt. → Rücklesen + verifizieren (`chipTraegtToken`, bestehendes Muster).
      - **Karte nicht leer** (`overwrite:false` lehnt ab): klare Meldung „Diese Karte ist nicht leer — bitte eine leere Karte auflegen." (Der geminteten Token bleibt als harmlose `bestellt`-Waise; Verwalten bestehender Karten läuft über die Liste.)
   c. Nach verifiziertem Schreiben: Server `finalisiereKarte(T, nfcUid, fahrzeugId | null)` → `speichereNfcUid` (+ falls Fahrzeug: `bindeSchadenkarteAnFahrzeug`).
   d. Erfolg → „Fertig ✓ — nächste Karte" (Reset, `pendingToken` freigeben).
3. Wiederholen.

**Warum mint-first statt token-client-seitig-generieren:** folgt dem bestehenden Modell (`mintSchadenkarten` legt `bestellt`-Zeilen an, die dann beschrieben/gebunden werden) und vermeidet die „Chip beschrieben, aber keine DB-Zeile"-Dud-Karte (schwer rückgängig, weil `overwrite:false` sie danach blockiert). Preis: harmlose `bestellt`-Waisen bei Abbruch — sichtbar in der Liste, nie gebunden, nie funktional; optionaler Cleanup = Iteration 2.

**Erhalten bleibt:** Rücklese-Verifikation, Firma-Scoping, mint-Retry (`schadenkarte.ts`). **Neu:** kein QR-Zwang, `overwrite:false`-Clobber-Schutz, optionale Bindung im selben Screen, Desktop-Bridge.

### Rollen & Desktop-Bridge

- **Flottenmanager** `/flotte/karten`: Provisioner prominent (eigene Firma). Auf Android = funktional; auf Desktop/iPhone = Bridge.
- **Admin** `/admin/vertrieb/firmen-flotte/[id]`: **derselbe** Provisioner (gewählte Firma, staff-Actions), zusätzlich zu mint-Batch + Dropdown-bind. Auf Android (Admin öffnet die Seite am Handy, als Admin eingeloggt) = funktional; auf Desktop = Bridge.
- **Bridge** (kein `NDEFReader`, also Desktop/iPhone): ersetzt die heutige Sackgasse-Meldung durch einen ehrlichen Hinweis + **QR/Link „auf einem Android-Handy öffnen"**, der auf **genau diese** Seite (`window.location.href`) zeigt. QR client-seitig via bestehende `qrcode`-Dep. Kein separater Magic-Link/Auth-Flow — am Handy gilt die normale Session.

## Komponenten & Files

- `src/components/flotte/NfcKarteBeschreiben.tsx` — Rework zum Provisioner: Fahrzeug-Dropdown, mint-first, `overwrite:false`, optionale Bindung, Bridge-Fallback. Props als Dependency-Injection (portal-agnostisch): `{ fahrzeuge, onMintToken, onFinalize }`. (Dateiname bleibt → minimaler Import-Churn; ggf. Rename in der Umsetzung entscheiden.)
- `src/lib/schadenkarte/nfc.ts` — `NdefReaderLike.write`-Signatur um `options?: { overwrite?: boolean; signal?: AbortSignal }` erweitern. `nfcVerfuegbar`, `chipTraegtToken`, `NDEF_RECORD_TYPE` bleiben.
- `src/app/flotte/(shell)/karten/actions.ts` — neu: `provisioniereKarteToken()`, `finalisiereKarte(token, nfcUid, fahrzeugId|null)`. `merkeNfcUid` entfernen, falls nach Rework ungenutzt (Dead-Code-Check).
- `src/app/flotte/(shell)/karten/page.tsx` — Fahrzeuge der Firma laden (Reuse `@/lib/kunde/firma-flotte`) und an `KartenClient` durchreichen.
- `src/app/flotte/(shell)/karten/KartenClient.tsx` — neue Props an den Provisioner verdrahten.
- `src/app/admin/vertrieb/_actions/firmen-flotte-karten.ts` — neu: `provisioniereKarteTokenStaff(firmaId)`, `finalisiereKarteStaff(firmaId, token, nfcUid, fahrzeugId|null)` (requireRole, ruft dieselben Lib-Funktionen mit Admin-Client + `firmaId`).
- `src/app/admin/vertrieb/firmen-flotte/[id]/FirmenFlotteDetailClient.tsx` — Provisioner in „Schaden-Karten" mounten (Fahrzeuge sind dort schon geladen), staff-Actions verdrahten.

**Reuse (keine Neuimplementierung):** `mintSchadenkarten` (n=1), `speichereNfcUid`, `bindeSchadenkarteAnFahrzeug`, `buildSchadenkarteUrl`, `extractSchadenkarteToken`, `SchadenkarteScanner` (nur noch als **sekundärer** manueller/QR-Fallback), `qrcode`-Dep (Bridge-QR).

## Server-Action-Verhalten (AGENTS.md-Pattern)

- Result-Object `{ ok, error? }` bzw. `{ ok: true; token }` — kein `throw`.
- Firma-Scoping in **jeder** Action (Flotte: eigene Firma via `getFlottenmanagerFirma`; Admin: gewählte `firmaId` + `requireRole`).
- `revalidatePath('/flotte/karten')` bzw. die Admin-Detailroute nach Finalize.
- Bind-Fehler des Partial-Unique (`fahrzeug_id WHERE gebunden`) → „Dieses Fahrzeug hat bereits eine aktive Karte." (bereits in `bindeSchadenkarteAnFahrzeug`).

## Testing & Regel 4

- **Automatisierbar (Playwright):** `/flotte/karten` und Admin-firmen-flotte rendern den Provisioner ohne Crash; Desktop zeigt die **Bridge** (kein `NDEFReader`); Fahrzeug-Dropdown listet die Firmen-Fahrzeuge. Flow-Logik testbar mit **gestubbtem `window.NDEFReader`** via `addInitScript` (write/scan/read-back gegen einen Fake-Chip) → deckt mint→write→verify→finalize inkl. `overwrite:false`-Zweig ab.
- **Nicht automatisierbar:** der echte Chip-Write braucht physisches NFC. → **Manueller Android-Smoke** (Aaron/Nicolas, `/flotte/karten` auf Android/Chrome, Blanko-Karte): beschreiben, verifizieren, antippen öffnet `/schaden/<token>`. Regel-4-Abschluss = dieser manuelle Android-Smoke + der automatisierte Render-Smoke; im PR/Marker dokumentieren.
- `nfc.ts`-Unit-Tests (bestehend) um den `overwrite`-Options-Pfad ergänzen, falls Logik dazukommt.

## Risiken

- `overwrite:false` ist Web-NFC-Standard; ignoriert eine UA es, ist der Worst Case ein Clobber (selten, tolerierbar).
- `bestellt`-Waisen bei Abbruch — harmlos (nie gebunden/funktional), Liste zeigt „Bestellt"; Cleanup = Iteration 2.
- `schadenkarten` nicht in `database.types.ts` → `AnyDb`-Cast-Muster beibehalten (bestehend).

## Out of Scope / Iteration 2

- Tap-auf-bestehende-Karte → Status zeigen + gezielt neu binden/überschreiben (statt nur „nicht leer"-Meldung).
- Mobiler Batch-Durchtapp-Modus (Approach C).
- Per-Karte-QR-Druck direkt nach dem Schreiben.
- Verwaiste-`bestellt`-Cleanup.
- USB-NFC am Desktop (WebUSB).

Unberührt: „Fahrzeug per Karte identifizieren", „Alle QR-Codes als PDF", Sperren/Entsperren/Entbinden-Lebenszyklus, `/flotte/flotte`-QR-Bindung.
