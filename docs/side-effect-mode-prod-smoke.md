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

## SMOKE-Fixtures — IMMER nur diese

Prod-Smokes zielen **ausschliesslich** auf die SMOKE-Test-Entities, **nie** auf echte
Kunden/SVs/Werkstaetten (Aaron: „immer nur mit dem smoke SV"):

| Entity | id | Kontakt |
|---|---|---|
| **Smoke SV** | `b52e79df-9318-4c31-bebd-bb7c91d52aa5` | `smoke-sv@claimondo.test` |
| **SMOKE Werkstatt (Test)** | `badecb82-aa29-461c-876b-007455aa8dd3` | `werkstatt-smoke@claimondo.de` |

Fuer Write-Pfad-Smokes zusaetzlich `dry-run` (nichts geht raus) oder `test-recipient` (an
Test-Adresse) — das Ziel bleibt aber immer eine SMOKE-Entity, nie ein echter Empfaenger.

## Runner: `npm run smoke:db`

Laedt prod-Creds (aus `.env.local` oder Env), setzt `PROD_SMOKE=1` + `SIDE_EFFECT_MODE=dry-run`
und faehrt `src/**/*.prod-smoke.ts` (eigene Config `vitest.prod-smoke.config.ts` → laufen NIE
im normalen `npm test`/CI).

```bash
npm run smoke:db                                   # alle, dry-run
npm run smoke:db -- werkstatt                        # nur passende
SIDE_EFFECT_MODE=test-recipient npm run smoke:db     # Sends an Test-Adresse (statt suppress)
```

Smoke-Tests heissen `<name>.prod-smoke.ts` (NICHT `.test.ts`). Hinweis: knip kennt diese Endung
(noch) nicht als Test-Glob → ein neues `*.prod-smoke.ts` ggf. in der knip-Config als Test-Pattern
registrieren, sonst meldet der knip-Ratchet es als „ungenutzte Datei".
