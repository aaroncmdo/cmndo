# Spec: ZB1-OCR-Field-Type im DynamicWizard

**Datum:** 2026-05-12
**Bezugsplan:** `docs/plans/funnel-vollmacht-im-wizard-2026-05-12.md`
**Backlog-Eintrag:** `docs/11.05.2026/backlog-status-funnel-v3.md` — Punkt 1 (ZB1-OCR-Field-Type, ~3h)
**Branch:** `kitta/aar-backlog-zb1-ocr-field`

## Ziel

Der Kunde fotografiert beim ersten Onboarding-Schritt seinen Fahrzeugschein. OCR
liest Kennzeichen, FIN, Hersteller, Modell, Baujahr, Halter und schreibt die
Werte direkt nach `leads`. Die `fahrzeug`-Phase wird zur **ersten** Phase im
`flow_key='kunde-onboarding'` und kann via `ladeNoetigePhasen` automatisch
übersprungen werden, wenn `vehicles.kennzeichen_aktuell` bereits gesetzt ist.

## Nicht-Ziele (Out-of-Scope für diesen PR)

- Andere Onboarding-Phasen (Fotos, Polizei, Gegner) — eigener PR im v3-Backlog.
- ZB2-Upload — nicht Teil von Funnel v3.
- Refactor des bestehenden OCR-Endpoints `uploadDokumentViaAnfrageToken`. Der
  bleibt der einzige OCR-Pfad. Nur eine kleine Anpassung am Mehrfach-Upload-Check.
- Cardentity-Enrich — läuft bereits non-blocking aus dem bestehenden Endpoint.

## Architektur (Überblick)

Neuer Field-Typ `zb1-upload` im DynamicWizard. Der Wizard erzeugt beim
Server-Render eine Pending-`dokument_upload_anfragen`-Row (slot
`fahrzeugschein`, `ocr=true`) und reicht den Token an den Field-Renderer.
Das Field nutzt kamera-basierten Capture (mit Datei-Fallback), schickt das
Bild an die bestehende `uploadDokumentViaAnfrageToken`-Server-Action, zeigt
die extrahierten Werte als **editierbare Preview-Card** und schreibt beim
"Weiter"-Klick ggf. korrigierte Werte zurück.

Keine Anpassung an der OCR-Pipeline selbst. Eine punktuelle Erweiterung in
`uploadDokumentViaAnfrageToken`: der `slot.hochgeladen`-Block muss
`fahrzeugschein` durchlassen, damit "Neu fotografieren" nach erfolgreichem
OCR funktioniert (analog zur bereits bestehenden Ausnahme für `unfallfotos`).

## Komponenten & Files

### Neu

- `src/components/onboarding/fields/Zb1UploadField.tsx` — Client-Component.
  Zustands-Maschine: `idle → capturing → uploading → preview → confirmed`,
  Fehlerzweig `error` mit Retry-Button. Nach 2 Fehlversuchen wird ein
  Skip-Link "Daten später manuell eingeben" eingeblendet.
- `src/lib/onboarding/ensure-zb1-anfrage.ts` — Server-Helper. Sucht eine
  bestehende Pending-`dokument_upload_anfragen`-Row für
  `(lead_id, slot='fahrzeugschein')` oder legt eine neue an. Returnt den
  Token. Idempotent gegenüber Page-Reload.
- `src/app/kunde/onboarding-details/zb1-actions.ts` — Server-Actions:
  - `confirmZb1Korrekturen(fallId, corrections)` — Override-Update auf
    `leads`, wenn der Kunde im Preview Werte editiert hat. Ignoriert
    H6-Regel; Kunde-Eingabe gewinnt.
  - `clearZb1Felder(fallId)` — wird vor "Neu fotografieren" aufgerufen,
    resettet `kennzeichen`/`fin`/`fahrzeug_hersteller`/`fahrzeug_modell`/
    `fahrzeug_baujahr`/`erstzulassung`/`hsn`/`tsn`/`halter_*` auf `null`,
    damit der zweite OCR-Run die neuen Werte tatsächlich schreibt
    (sonst blockiert die H6-Regel im bestehenden Endpoint).

### Geändert

- `src/components/onboarding/types.ts` — `FieldTyp` um `'zb1-upload'`
  erweitern.
- `src/components/onboarding/WizardClient.tsx` — Render-Switch um den
  neuen Field-Typ erweitern. Phase-spezifischen Token als Prop
  durchreichen.
- `src/components/onboarding/DynamicWizard.tsx` — wenn eine Phase ein
  `zb1-upload`-Feld enthält, `ensureZb1Anfrage(leadId)` aufrufen und
  Token an den `WizardClient` weitergeben. `leadId` wird aus dem Fall
  resolved (`faelle.lead_id`).
- `src/app/upload/dokumente/[token]/actions.ts` — Zeile 134:
  `slotId !== 'unfallfotos' && slotId !== 'fahrzeugschein'`.
  Erlaubt Mehrfach-Upload für ZB1 (Retry- und Korrektur-Foto).
- `src/lib/onboarding/load-needed-phases.ts` — Skip-Logik für Phase
  `fahrzeug`: wenn `vehicles.kennzeichen_aktuell` oder
  `leads.kennzeichen` bereits gesetzt sind, Phase überspringen.

### DB-Migration

Neue Migration via `npx supabase migration new add_fahrzeug_phase`:

1. `UPDATE onboarding_phasen SET reihenfolge = reihenfolge + 1
   WHERE flow_key = 'kunde-onboarding';` — schiebt alle bestehenden
   Phasen nach hinten.
2. `INSERT INTO onboarding_phasen (flow_key, phase_key, reihenfolge,
   titel, eyebrow, beschreibung) VALUES ('kunde-onboarding', 'fahrzeug',
   1, 'Ihr Fahrzeug', 'Schritt 1', 'Fotografieren Sie Ihren
   Fahrzeugschein …');`
3. `INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ,
   label, pflicht, db_target) VALUES (<neue phase_id>, 1,
   'fahrzeugschein_foto', 'zb1-upload', 'Fahrzeugschein',
   true, '{"tabelle":"leads","spalte":"zb1_status"}');`

`db_target` zeigt auf `leads.zb1_status` — das ist die Trigger-Spalte für
die Skip-Logik. Die eigentlichen Fahrzeug-Felder schreibt der
OCR-Endpoint direkt; das Field selbst muss nichts via `saveStep` ablegen.

## Daten-Flow

```
DynamicWizard (Server-Component, /kunde/onboarding-details)
  ↓ Phase 'fahrzeug' enthält 'zb1-upload'-Feld
  ↓ ensureZb1Anfrage(leadId) → token
  ↓ token als Prop an WizardClient
  ↓
WizardClient (Client) → Zb1UploadField({ token, fallId })
  ↓ User klickt "Foto aufnehmen" → <input capture="environment">
  ↓ FileReader.readAsDataURL → base64
  ↓ uploadDokumentViaAnfrageToken(token, 'fahrzeugschein', base64)
  ↓ [Endpoint: Foto → Storage, OCR-Pipeline, leads-Update via H6-Regel]
  ↓ returns { success: true, extracted: { kennzeichen, fahrzeug_hersteller,
  ↓                                       fahrzeug_modell, halter_name } }
  ↓
Preview-Card (editierbare Inputs, prefilled aus 'extracted')
  ↓ User klickt "Weiter"
  ↓ Diff: form-state vs. extracted
  ↓ wenn Diff ≠ leer: confirmZb1Korrekturen(fallId, diff)
  ↓ Wizard navigiert zu Phase 2 ('hergang')
```

## Edge-Cases

### Retry nach OCR-Fail (Versuch 1 + 2)

Der bestehende Endpoint markiert den Slot bei OCR-Fehler **nicht** als
`hochgeladen=true` (siehe `actions.ts` Zeile 167–168 — `return`
vor dem Slot-Update). Damit funktioniert Retry ohne Code-Anpassung.

Nach 2 Fehlversuchen blendet das Field einen Skip-Link "Daten später
manuell eingeben" ein. Das markiert die Phase als "übersprungen" im
Client-Wizard-State, Felder bleiben leer. Der KB sieht in Dispatch
`leads.zb1_status='fehlgeschlagen'` + `zb1_upload_versuche=2`.

### "Neu fotografieren" nach erfolgreichem OCR

Nach OCR-Success ist `slots.fahrzeugschein.hochgeladen=true`. Der
bestehende Endpoint würde den zweiten Upload mit "Dieses Dokument wurde
bereits empfangen" blocken.

**Lösung:**

1. Endpoint-Anpassung Zeile 134 — `slotId !== 'unfallfotos' &&
   slotId !== 'fahrzeugschein'`. Mehrfach-Upload für ZB1 erlauben.
2. Bevor das Field den zweiten Upload startet, ruft es
   `clearZb1Felder(fallId)` auf. Damit kann die H6-Regel im Endpoint
   die neuen Werte tatsächlich schreiben.

### User-Editierung im Preview

Das Preview zeigt **vier** editierbare Inputs (mehr wäre Form-Overhead
und reduziert die Konvertierungs-Geschwindigkeit, die das ganze Feature
rechtfertigt):

- `kennzeichen` (Text)
- `fahrzeug_hersteller` (Text)
- `fahrzeug_modell` (Text)
- `halter_name` (Text, zusammengesetzt aus `halter_vorname` + " " +
  `halter_nachname`)

Beim "Weiter"-Klick berechnet das Field das Diff zwischen `extracted`
und dem aktuellen Form-State. Bei Änderungen läuft
`confirmZb1Korrekturen(fallId, diff)` als Force-Update — die H6-Regel
gilt hier nicht, Kunde-Eingabe gewinnt.

`halter_name` wird beim Submit per Whitespace-Split in
`halter_vorname` (erstes Token) + `halter_nachname` (Rest) zerlegt.
Bei nur einem Token landet alles in `halter_nachname`,
`halter_vorname` wird auf `null` gesetzt. Felder wie FIN/HSN/TSN/
Baujahr bleiben unangetastet (nicht editierbar im Preview — wenn
falsch, "Neu fotografieren").

### Wizard-Page-Reload mit pending Anfrage

`ensureZb1Anfrage(leadId)` ist idempotent: erst Lookup nach
Pending-Row für den Lead mit slot `fahrzeugschein`, sonst neue Row.
Kein Token-Müll bei mehrfachem Page-Load.

### Anfrage abgelaufen / komplett

Wenn die Pending-Row bereits `status='komplett'` oder `expires_at` in
der Vergangenheit hat, legt `ensureZb1Anfrage` eine neue Row an. Das
Field bekommt also immer einen verwendbaren Token.

## Error-Handling

Server-Actions folgen `{ ok: true; data?: T } | { ok: false; error: string }`
gemäß AGENTS.md.

- OCR-Fehler werden inline im Field als roter Hinweistext gezeigt
  (nicht als Toast — der Kunde steht aktiv im Wizard).
- `ensureZb1Anfrage`-Fehler → Field zeigt Fallback "Bitte später erneut
  versuchen" + Skip-Button. Wizard bleibt funktionsfähig ohne ZB1.
- `confirmZb1Korrekturen`-Fehler → Toast "Korrektur konnte nicht
  gespeichert werden", Wizard navigiert trotzdem weiter (OCR-Werte
  sind bereits in `leads`, Korrektur ist ein "nice to have").

## Sicherheits-Erwägungen

- `confirmZb1Korrekturen` muss prüfen, dass der aufrufende Auth-User
  dem `fallId` zugeordnet ist (`leads.kunde_user_id` oder
  `faelle.kunde_user_id`). Andernfalls `{ ok: false, error: 'forbidden' }`.
- `clearZb1Felder` muss denselben Auth-Check machen.
- `ensureZb1Anfrage` läuft Server-Side aus dem authentifizierten
  Onboarding-Page-Kontext; Token wird nur an den eingeloggten Kunden
  ausgeliefert. Kein direkter Token-Endpoint nach außen.

## Tests / Verifikation

Manual-Smoke auf Mobile durch Aaron nach Branch-Deploy:

1. Magic-Link-Login → `/kunde/onboarding-details`.
2. Wizard startet bei Phase `fahrzeug` (Step 1).
3. "Foto aufnehmen" → Kamera öffnet, ZB1 ablichten.
4. Preview-Card zeigt Kennzeichen/Hersteller/Modell/Halter,
   editierbar.
5. "Weiter" → Phase 2 (`hergang`). DB-Check:
   `leads.zb1_status='hochgeladen'`, Felder befüllt.
6. **Edge:** unscharfes Foto → OCR-Fail → "Erneut versuchen" → 2.
   Fail → Skip-Link erscheint → Skip → Phase 2 mit
   `zb1_status='fehlgeschlagen'`.
7. **Edge:** erfolgreich → Wert editieren ("BMW" → "Audi") →
   Weiter → DB-Check: `leads.fahrzeug_hersteller='Audi'`.
8. **Edge:** Fall mit bereits gesetztem `vehicles.kennzeichen_aktuell`
   → Wizard startet bei Phase 2 (fahrzeug übersprungen).

Plus `npm run build` + `npx tsc --noEmit` grün.

## Migration & Rollout

- Branch: `kitta/aar-backlog-zb1-ocr-field` (existiert).
- Migration via `npx supabase migration new add_fahrzeug_phase` +
  `npx supabase db push` (Regel 2 aus AGENTS.md).
- PR gegen `staging`. Kein direkter Push auf `main` (Regel 1).
- Nach Merge: backlog-doc updaten, conversion_events-Tracking checken
  ob neuer Step erscheint.
