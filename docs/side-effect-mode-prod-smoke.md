# SIDE_EFFECT_MODE — Write-/Notify-Pfade gefahrlos gegen prod smoken

Server-Write-Pfade feuern oft WhatsApp/Email an **echte Kunden**. Um sie gegen die prod-DB
testen zu koennen, OHNE echte Empfaenger zu spammen, gaten `sendWhatsApp` (`src/lib/whatsapp.ts`)
und `sendEmail` (`src/lib/email/google/client.ts`) auf die Env-Var `SIDE_EFFECT_MODE`.

## Modi

| `SIDE_EFFECT_MODE` | Verhalten |
|---|---|
| (unset) / `live` | Normal senden. **Default — der Prod-Betrieb aendert sich NICHT.** |
| `dry-run` | NICHT senden. Loggt `[side-effect:dry-run] ... UNTERDRUECKT ...` und gibt synthetischen Erfolg zurueck — der Write-Pfad laeuft ansonsten normal durch (Status-Updates, DB-Writes passieren). |
| `test-recipient` | An `SIDE_EFFECT_TEST_PHONE` / `SIDE_EFFECT_TEST_EMAIL` umleiten. Fehlt die Test-Adresse -> **fail-safe suppress** (nie an echt). |

## Nutzung (lokaler Smoke gegen die prod-DB)

```bash
SIDE_EFFECT_MODE=dry-run \
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm test -- <test-der-den-write-pfad-aufruft>
```

Der DB-Write persistiert (prod), aber **keine Nachricht geht raus**. Danach im DB verifizieren
und aufraeumen (Test-Daten loeschen / Felder zuruecksetzen). Fuer `test-recipient` gehen echte
Nachrichten NUR an die konfigurierte Test-Nummer/-Adresse.

## Wichtig

- `SIDE_EFFECT_MODE` **niemals** im normalen Prod-/Preview-Deploy setzen — nur in Test-/Smoke-Sessions.
- Gegatet sind aktuell die externen Kanaele `sendWhatsApp` + `sendEmail` (dort ist die „nicht-echte-
  Kunden-spammen"-Gefahr). In-App `createMitteilung` ist bewusst nicht gegatet (kein externer
  Side-Effect). Weitere Sender koennen `resolveSideEffectRecipient` aus `src/lib/side-effects/mode.ts`
  analog adoptieren.
