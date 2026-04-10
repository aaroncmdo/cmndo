# Disaster Recovery Runbook - Claimondo

Letzte Aktualisierung: 2026-04-10

---

## Szenario A: Supabase Production DB komplett kaputt

**Symptome:** App zeigt 500er, Supabase Dashboard meldet DB-Fehler

**Recovery-Optionen:**

1. **Supabase Dashboard Restore (bevorzugt)**
   - Supabase Dashboard > Project Settings > Database > Backups
   - Letzten verfuegbaren Point-in-Time Backup waehlen
   - "Restore" klicken
   - Geschaetzte Recovery-Zeit: 15-30 Min

2. **Aus db-backups Storage Bucket**
   - Supabase Dashboard > Storage > db-backups > daily/
   - Letzten `YYYY-MM-DD.json` Dump herunterladen
   - JSON enthaelt alle kritischen Tabellen (profiles, sachverstaendige, gutachter_organisationen, faelle, fall_dokumente, vertraege_unterzeichnet, rechnungen, vertragsvorlagen)
   - Import per Script oder manuell via SQL Editor
   - Geschaetzte Recovery-Zeit: 30-60 Min
   - ACHTUNG: JSON-Backup ist taeglich, Daten seit letztem Backup gehen verloren

**Nach Recovery:**
- Vercel Deployment neu triggern (Redeploy)
- Alle Cron-Jobs pruefen (vercel.json)
- Stichprobe: ein Fall oeffnen, Dokumente pruefen, Login testen

---

## Szenario B: Stripe-Webhooks seit Stunden down

**Symptome:** Zahlungen gehen durch in Stripe, aber SVs werden nicht freigeschaltet, Rechnungsstatus nicht aktualisiert

**Recovery:**

1. **Stripe Dashboard pruefen**
   - https://dashboard.stripe.com/webhooks
   - Webhook-Endpoint Status pruefen
   - Fehlgeschlagene Events identifizieren

2. **Events manuell nachverarbeiten**
   ```bash
   # Stripe CLI installieren falls noetig
   npm install -g stripe

   # Login
   stripe login

   # Fehlgeschlagene Events erneut senden
   stripe events resend evt_XXXXXXXXXXXXXX

   # Oder alle Events eines Zeitraums listen
   stripe events list --created=">2026-04-10T00:00:00Z" --type=checkout.session.completed
   ```

3. **Manuelle Freischaltung**
   - Supabase Dashboard > Table Editor > sachverstaendige
   - SV finden dessen Zahlung durch ist aber nicht freigeschaltet
   - `status` auf `aktiv` setzen, `bezahlt_am` setzen

**Nach Recovery:**
- Webhook-Endpoint in Stripe auf "Enabled" pruefen
- STRIPE_WEBHOOK_SECRET in Vercel env vars pruefen
- Monitoring: naechste Stunde Stripe Dashboard beobachten

---

## Szenario C: Vercel-Deploy kaputt

**Symptome:** App zeigt Fehler nach neuem Deploy, White Screen, Build-Fehler

**Recovery:**

1. **Sofort-Rollback**
   - Vercel Dashboard > Deployments
   - Letzten funktionierenden Deploy finden (gruener Punkt)
   - Drei-Punkt-Menue > "Promote to Production"
   - Recovery-Zeit: ~2 Min

2. **Wenn Build fehlschlaegt**
   - Build-Logs in Vercel pruefen
   - Env vars pruefen (Settings > Environment Variables)
   - Ggf. letzten Commit reverten und neu pushen

**Nach Recovery:**
- Fehlerursache im fehlgeschlagenen Deploy analysieren
- Fix auf separatem Branch testen bevor erneuter Deploy

---

## Szenario D: DNS-Ausfall claimondo.de

**Symptome:** Domain nicht erreichbar, DNS-Lookup schlaegt fehl

**Recovery:**

1. **Status pruefen**
   - https://downdetector.com oder dig/nslookup:
     ```bash
     nslookup claimondo.de
     dig claimondo.de
     ```

2. **DNS-Provider Login**
   - DNS-Provider Dashboard oeffnen (Hetzner/Strato/etc.)
   - DNS-Records pruefen:
     - A Record -> Vercel IP
     - CNAME -> cname.vercel-dns.com
   - Falls Records fehlen: neu anlegen

3. **Vercel Domain Settings**
   - Vercel Dashboard > Project Settings > Domains
   - claimondo.de Status pruefen
   - Falls "Invalid Configuration": DNS Records nach Vercel-Anweisung korrigieren

**Recovery-Zeit:** 5 Min (DNS Cache) bis 48h (DNS Propagation)

---

## Wichtige Environment Variables

Diese muessen in Vercel UND .env.local gesetzt sein:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

# Email
RESEND_API_KEY
RESEND_FROM

# Monitoring
NEXT_PUBLIC_SENTRY_DSN
SENTRY_AUTH_TOKEN

# Cron Auth
CRON_SECRET

# Google
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

# Twilio
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID

# AI
ANTHROPIC_API_KEY

# Vercel (nur lokal fuer MCP-Fallback)
VERCEL_API_TOKEN
VERCEL_PROJECT_ID
VERCEL_TEAM_ID
```

---

## Kontakte

- **Aaron** (Tech Lead): aaron@claimondo.de
- **Supabase Support**: support@supabase.io (Pro Plan)
- **Stripe Support**: https://support.stripe.com
- **Vercel Support**: https://vercel.com/support
