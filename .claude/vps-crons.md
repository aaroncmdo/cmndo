# VPS PM2 Cron-Jobs

Alle Cron-Jobs laufen auf dem VPS via PM2, NICHT via Vercel.

Die API-Routes bleiben in `/api/cron/*` mit CRON_SECRET Auth.
Der VPS-PM2-Job ruft sie per curl auf.

## Bestehende Jobs (PM2 ecosystem.config.js auf VPS)

Siehe VPS unter `/home/claimondo/ecosystem.config.js` oder `pm2 list`.

## termin-morgen-erinnerung

Schedule: täglich 07:00 Berliner Zeit (05:00 UTC Sommer, 06:00 UTC Winter)
Route: /api/cron/termin-morgen-erinnerung
Curl-Befehl:
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/termin-morgen-erinnerung
```

PM2 cron-Eintrag auf VPS hinzufügen:
```js
{
  name: 'termin-morgen-erinnerung',
  script: 'curl',
  args: ['-s', '-H', 'Authorization: Bearer <CRON_SECRET>', 'https://app.claimondo.de/api/cron/termin-morgen-erinnerung'],
  cron_restart: '0 5 * * *',
  autorestart: false,
}
```

## zustandsaufnahme-faellig (Flotte: 3-Monats-Reminder)

Schedule: wöchentlich, Montag 08:00 UTC (= 10:00 MESZ). Wöchentlich reicht — der Dedup
(max. 1 Reminder je Fahrzeug / 30 Tage) bremst Spam; ein täglicher Lauf brächte nichts.
Route: /api/cron/zustandsaufnahme-faellig
Curl-Befehl:
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/zustandsaufnahme-faellig
```

PM2 cron-Eintrag auf VPS hinzufügen:
```js
{
  name: 'zustandsaufnahme-faellig',
  script: 'curl',
  args: ['-s', '-H', 'Authorization: Bearer <CRON_SECRET>', 'https://app.claimondo.de/api/cron/zustandsaufnahme-faellig'],
  cron_restart: '0 8 * * 1',
  autorestart: false,
}
```

Was er tut: findet Flotten-Fahrzeuge mit letzter abgeschlossener Zustandsdoku > 3 Monate und
erinnert die Flottenmanager der Firma (in-App-Mitteilung + WhatsApp-Push). Nur bereits-gescannte
Fahrzeuge (>=1 abgeschlossener Scan). Idempotent — Mehrfachlauf schadet nicht.

## Baileys Inbound Logger

Der Baileys-VPS-Service (`services/baileys`) postet eingehende WA-Nachrichten an:
```
POST https://app.claimondo.de/api/baileys/inbound
Authorization: Bearer $CRON_SECRET
```

Benötigte Env-Vars auf dem VPS (in `ecosystem.config.js` unter `env`):
```
NEXT_PUBLIC_SITE_URL=https://app.claimondo.de
CRON_SECRET=<gleicher Wert wie in Vercel>
BAILEYS_AUTH_TOKEN=<lokaler Auth-Token für /check und /send Endpoints>
```
