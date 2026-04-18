# Rollen-Matrix Fallakte

Abgeleitet aus `src/lib/fall/field-permissions.ts` — Stand 2026-04-18 (AAR-545).

Die Quelle der Wahrheit bleibt die Code-Datei; dieses Dokument ist der Human-
Readable-Abzug für Product/Support/Onboarding. Bei Änderungen an
`field-permissions.ts` immer hier nachziehen.

## Rollen (DB: `profiles.rolle`)

Exakt 5 Werte, per `SELECT DISTINCT` verifiziert:

| Rolle               | Typischer User                                    |
| ------------------- | ------------------------------------------------- |
| `admin`             | Gründer / Senior-Support                          |
| `kundenbetreuer`    | Interne Fallbetreuung (z. B. Sarah, Max)          |
| `sachverstaendiger` | Externer Gutachter, erledigt die Besichtigung     |
| `kunde`             | Geschädigter selbst (Mandant)                     |
| `dispatch`          | Lead-Qualifizierung **vor** Fallerstellung        |

Dispatch hat bewusst **keine** Write-Permissions auf der Fallakte — sobald ein
Fall existiert, übernimmt Kundenbetreuer/Admin.

## Edit-Matrix

Legende: ✍ = darf bearbeiten · 👁 = nur lesen · — = kein Zugriff

### Globale Felder

| Feldgruppe                   | admin | kundenbetreuer | sachverstaendiger | kunde | dispatch |
| ---------------------------- | :---: | :------------: | :---------------: | :---: | :------: |
| System-Felder (siehe unten)  |   —   |       —        |         —         |   —   |    —     |
| Stammdaten (Name/Adresse/…)  |   ✍   |       ✍        |         👁        |   👁  |    —     |
| Unfall-/Schadensdaten        |   ✍   |       ✍        |         ✍ †       |   👁  |    —     |
| Fahrzeug-Detaildaten         |   ✍   |       ✍        |         ✍         |   👁  |    —     |
| FIN / HSN / TSN              |   ✍   |       ✍        |         ✍         |   👁  |    —     |
| Halter-Daten (Name/Adresse)  |   ✍   |       ✍        |         ✍ ‡       |   👁  |    —     |
| Besichtigungsort             |   ✍   |       ✍        |         ✍         |   👁  |    —     |
| Gutachten (Zahlen + Fotos)   |   ✍   |       ✍        |         ✍         |   👁  |    —     |
| Kernwerte (Reparatur/WBW/…)  |   ✍   |       ✍        |         ✍         |   👁  |    —     |
| Cardentity-Bericht           |   ✍   |       ✍        |         ✍         |   —   |    —     |
| Nachbesichtigung-Konfrontation |   ✍   |       ✍        |         ✍         |   —   |    —     |
| Kanzlei / VS / Eskalation    |   ✍   |       ✍        |         👁        |   👁  |    —     |
| Abrechnung / Honorar         |   ✍   |       ✍        |         👁        |   —   |    —     |

† Prefix-Match `schadens_*` — SV darf im Rahmen der Besichtigung korrigieren.
‡ Halter-Name/Adresse sind explizit SV-editierbar (Halter-Ausweis-Check).

### Status-Gate

Bei `status ∈ { abgeschlossen, storniert }` wird die gesamte Fallakte für
**alle** Rollen read-only. Nur `admin` kann einen Fall wieder reaktivieren
(dedizierter Status-Übergang, kein Feld-Edit).

## System-Felder (niemals editierbar)

| Feld              | Quelle / Warum unverrückbar                     |
| ----------------- | ------------------------------------------------ |
| `id`              | Primary-Key                                      |
| `fall_nummer`     | vergeben bei Fallerstellung, extern zitiert      |
| `lead_id`         | unveränderliche Herkunft                         |
| `kunde_id`        | FK auf Profil, wird beim Signup gesetzt          |
| `sv_id`           | via Termin-State-Machine gesetzt                 |
| `created_at`      | Audit                                            |
| `updated_at`      | Audit                                            |
| `abgeschlossen_am`| State-Machine-Timestamp                          |
| `as_salesforce_id`| externe ID (LexDrive)                            |
| `mandatsnummer`   | von Kanzlei vergeben                             |

## SV-Editier-Regeln im Detail

`sachverstaendiger` darf nur dann schreiben, wenn das Feld **eine** der
folgenden Bedingungen erfüllt:

1. Prefix-Match:
   - `fahrzeug_*`
   - `besichtigungsort_*`
   - `gutachten_*`
   - `kernwert_*`
   - `schadens_*`
   - `foto_*`
2. Explicit-Match: `fin`, `halter_vorname`, `halter_nachname`,
   `halter_strasse`, `halter_plz`, `halter_stadt`, `hsn`, `tsn`,
   `cardentity_report`, `nachbesichtigung_konfrontation`.

Alles andere ist für die SV-Rolle read-only — auch wenn das UI-Icon da wäre.
Server-Actions rufen `canEditField(rolle, feld, status)` vor jedem Write.

## Server-Durchsetzung

UI-Verstecken reicht nicht. Jede Write-Server-Action (`updateStammdaten`,
`updateProzess`, `updateGutachten`, …) muss `canEditField()` vor dem Update
aufrufen und bei `false` mit `{ success: false, error: 'kein Zugriff' }`
antworten. Bypass via direktem Fetch wäre sonst möglich.

## Siehe auch

- `src/lib/fall/field-permissions.ts` — Source of Truth
- `src/app/admin/faelle/[id]/_lib/permissions.ts` — Section-weite Guards
- `src/app/admin/faelle/[id]/FallContext.tsx` — Client-Side-Konsument
