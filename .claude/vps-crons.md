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
curl -s -H "Authorization: Bearer $CRON_SECRET" https://cmndo.vercel.app/api/cron/termin-morgen-erinnerung
```

PM2 cron-Eintrag auf VPS hinzufügen:
```js
{
  name: 'termin-morgen-erinnerung',
  script: 'curl',
  args: ['-s', '-H', 'Authorization: Bearer <CRON_SECRET>', 'https://cmndo.vercel.app/api/cron/termin-morgen-erinnerung'],
  cron_restart: '0 5 * * *',
  autorestart: false,
}
```
