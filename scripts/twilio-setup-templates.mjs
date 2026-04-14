#!/usr/bin/env node
// AAR-119: Twilio Content API Setup-Script
// Legt alle 33 WhatsApp-Templates an + reicht sie zur WhatsApp-Approval ein.
// Idempotent: bereits existierende Templates werden geskippt.
//
// Ausführung:
//   TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx node scripts/twilio-setup-templates.mjs
//
// Output am Ende: .env.local-Format mit allen TWILIO_TPL_* Content-SIDs zum
// Copy-Paste in Vercel ENV.
//
// Template-Texte sind wortwörtlich aus der Notion-Page:
// https://www.notion.so/3421da4c9124817fbc29e8078a23e9cc

const PORTAL = 'https://claimondo.de/kunde'
const HEUTE  = 'https://claimondo.de/gutachter/heute'
const TRACK  = 'https://claimondo.de/track/xyz'
const FLOW   = 'https://claimondo.de/flow/abc123'
const REVIEW = 'https://g.page/r/claimondo-review'
const MEET   = 'https://meet.google.com/abc-defg-hij'

// ─── 33 Templates ───────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    envKey: 'TWILIO_TPL_FLOWLINK_VERSAND',
    friendly_name: 'flowlink_versand',
    body: 'Hallo {{1}}, dein Schadensfall bei Claimondo ist angelegt. Dein Gutachter {{2}} {{3}} kommt am {{4}} um {{5}} Uhr vorbei. Bitte gib uns noch deine letzten Daten in unserem kurzen Formular ab: {{6}}',
    sampleVars: { '1': 'Aaron', '2': 'Markus', '3': 'Müller', '4': '15.04.2026', '5': '14:30', '6': FLOW },
  },
  {
    envKey: 'TWILIO_TPL_FALL_EROEFFNET',
    friendly_name: 'fall_eroeffnet',
    body: 'Hallo {{1}}, dein Fall ist bei uns eröffnet und du bekommst alle nächsten Schritte direkt im Portal: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_SV_BEAUFTRAGT',
    friendly_name: 'sv_beauftragt',
    body: 'Hallo {{1}}, dein Gutachter {{2}} ist nun beauftragt. Du kannst alle Details im Portal einsehen: {{3}}',
    sampleVars: { '1': 'Aaron', '2': 'Markus', '3': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_TERMIN_BESTAETIGT',
    friendly_name: 'termin_bestaetigt',
    body: 'Hallo {{1}}, dein Gutachtertermin ist bestätigt. Am {{2}} um {{3}} Uhr kommt {{4}} zu dir nach {{5}}. Alle Details: {{6}}',
    sampleVars: { '1': 'Aaron', '2': '15.04.2026', '3': '14:30', '4': 'Markus', '5': 'Hauptstraße 12, 50667 Köln', '6': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_REMINDER_24H',
    friendly_name: 'reminder_24h',
    body: 'Hallo {{1}}, kleine Erinnerung: morgen kommt dein Gutachter {{2}} um {{3}} Uhr zu dir. Bitte halte deinen Fahrzeugschein bereit. Details: {{4}}',
    sampleVars: { '1': 'Aaron', '2': 'Markus', '3': '14:30', '4': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_REMINDER_2H',
    friendly_name: 'reminder_2h',
    body: 'Hallo {{1}}, in 2 Stunden kommt dein Gutachter {{2}} zu dir. Wir sehen uns gleich. Details: {{3}}',
    sampleVars: { '1': 'Aaron', '2': 'Markus', '3': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_SV_TAGESROUTE',
    friendly_name: 'sv_tagesroute',
    body: 'Guten Morgen {{1}}, du hast heute {{2}} Termine. Erster Termin um {{3}} Uhr. Deine Route: {{4}}',
    sampleVars: { '1': 'Markus', '2': '5', '3': '09:00', '4': HEUTE },
  },
  {
    envKey: 'TWILIO_TPL_GUTACHTEN_FERTIG',
    friendly_name: 'gutachten_fertig',
    body: 'Hallo {{1}}, dein Gutachten ist fertig. Schadenshöhe: {{2}} Euro. Du kannst es im Portal einsehen: {{3}}',
    sampleVars: { '1': 'Aaron', '2': '4.250', '3': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_KANZLEI_UEBERGABE',
    friendly_name: 'kanzlei_uebergabe',
    body: 'Hallo {{1}}, dein Fall ist nun an unsere Partner-Kanzlei übergeben. Sie kümmert sich ab jetzt um die Kommunikation mit der Versicherung. Details: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_AS_GESENDET',
    friendly_name: 'as_gesendet',
    body: 'Hallo {{1}}, das Anspruchsschreiben wurde an die gegnerische Versicherung gesendet. Sie hat nun 14 Tage Zeit zu antworten. Status im Portal: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_REGULIERUNG_ANGEKUENDIGT',
    friendly_name: 'regulierung_angekuendigt',
    body: 'Hallo {{1}}, gute Nachricht: die Versicherung hat eine Regulierung angekündigt. Wir halten dich auf dem Laufenden. Details: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_ZAHLUNG_EINGEGANGEN',
    friendly_name: 'zahlung_eingegangen',
    body: 'Hallo {{1}}, die Zahlung in Höhe von {{2}} Euro ist auf unserem Konto eingegangen und wird heute an dich weitergeleitet. Details: {{3}}',
    sampleVars: { '1': 'Aaron', '2': '4.250', '3': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_FALL_ABGESCHLOSSEN',
    friendly_name: 'fall_abgeschlossen',
    body: 'Hallo {{1}}, dein Fall ist erfolgreich abgeschlossen. Wir würden uns sehr über deine Bewertung freuen, wenn du zufrieden warst: {{2}}',
    sampleVars: { '1': 'Aaron', '2': REVIEW },
  },
  {
    envKey: 'TWILIO_TPL_ESKALATION_TAG14',
    friendly_name: 'eskalation_tag14',
    body: 'Hallo {{1}}, die Versicherung hat nach 14 Tagen noch nicht reagiert. Wir leiten jetzt eine erste Mahnung ein. Status: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_ESKALATION_TAG21',
    friendly_name: 'eskalation_tag21',
    body: 'Hallo {{1}}, wir haben heute direkt bei der Versicherung nachgefragt. Status: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_ESKALATION_TAG28',
    friendly_name: 'eskalation_tag28',
    body: 'Hallo {{1}}, die Versicherung reagiert weiterhin nicht. Wir bereiten jetzt rechtliche Schritte vor. Alle Infos im Portal: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_CHAT_FALLBACK_KUNDE',
    friendly_name: 'chat_fallback_kunde',
    body: 'Hallo {{1}}, du hast eine neue Nachricht in deinem Portal: {{2}}. Antworte direkt im Portal: {{3}}',
    sampleVars: { '1': 'Aaron', '2': 'Wir benötigen noch den Fahrzeugschein...', '3': 'https://claimondo.de/kunde/chat' },
  },
  {
    envKey: 'TWILIO_TPL_CHAT_FALLBACK_KB',
    friendly_name: 'chat_fallback_kb',
    body: 'Hallo {{1}}, neue Nachricht von {{2}}: {{3}}',
    sampleVars: { '1': 'Sarah', '2': 'Aaron Sprafke', '3': 'Wann kommt der Gutachter?' },
  },
  {
    envKey: 'TWILIO_TPL_KUERZUNG_EINGETRAGEN',
    friendly_name: 'kuerzung_eingetragen',
    body: 'Hallo {{1}}, die Versicherung hat den Schaden um {{2}} Euro gekürzt (von {{3}} Euro). Wir prüfen die Begründung. Details: {{4}}',
    sampleVars: { '1': 'Aaron', '2': '850', '3': '4.250', '4': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_SV_LOSGEFAHREN',
    friendly_name: 'sv_losgefahren',
    body: 'Hallo {{1}}, dein Gutachter {{2}} ist gerade losgefahren und voraussichtlich in {{3}} Minuten bei dir in {{4}}. Live-Tracking: {{5}}',
    sampleVars: { '1': 'Aaron', '2': 'Markus', '3': '25', '4': 'Hauptstraße 12', '5': TRACK },
  },
  {
    envKey: 'TWILIO_TPL_SV_FAST_DA',
    friendly_name: 'sv_fast_da',
    body: 'Hallo {{1}}, dein Gutachter {{2}} ist gleich da — bitte halte dein Fahrzeug bereit.',
    sampleVars: { '1': 'Aaron', '2': 'Markus' },
  },
  {
    envKey: 'TWILIO_TPL_SV_ANGEKOMMEN',
    friendly_name: 'sv_angekommen',
    body: 'Hallo {{1}}, dein Gutachter {{2}} ist jetzt bei dir angekommen.',
    sampleVars: { '1': 'Aaron', '2': 'Markus' },
  },
  {
    envKey: 'TWILIO_TPL_TERMIN_STORNIERT',
    friendly_name: 'termin_storniert',
    body: 'Hallo {{1}}, leider muss der Termin mit {{2}} am {{3}} verschoben werden. Wir melden uns mit einem neuen Termin. Details: {{4}}',
    sampleVars: { '1': 'Aaron', '2': 'Markus', '3': '15.04.2026', '4': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_SV_VERSPAETET',
    friendly_name: 'sv_verspaetet',
    body: 'Hallo {{1}}, dein Gutachter {{2}} verspätet sich um etwa {{3}} Minuten. Sorry für die Unannehmlichkeiten! Live-Tracking: {{4}}',
    sampleVars: { '1': 'Aaron', '2': 'Markus', '3': '15', '4': TRACK },
  },
  {
    envKey: 'TWILIO_TPL_DOKUMENTE_NACHREICHEN',
    friendly_name: 'dokumente_nachreichen',
    body: 'Hallo {{1}}, für die schnelle Bearbeitung benötigen wir noch: {{2}}. Bitte lade sie im Portal hoch: {{3}}',
    sampleVars: { '1': 'Aaron', '2': 'Fahrzeugschein, Führerschein-Vorderseite', '3': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_RECHNUNG_VERFUEGBAR',
    friendly_name: 'rechnung_verfuegbar',
    body: 'Hallo {{1}}, deine Rechnung steht jetzt im Portal zum Download bereit: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_KB_TERMIN_BESTAETIGT',
    friendly_name: 'kb_termin_bestaetigt',
    body: 'Hallo {{1}}, dein Beratungstermin am {{2}} um {{3}} Uhr ist bestätigt. Kanal: {{4}}. Video-Link: {{5}}. Alle Details: {{6}}',
    sampleVars: { '1': 'Aaron', '2': '15.04.2026', '3': '14:30', '4': 'Video', '5': MEET, '6': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_KB_TERMIN_REMINDER_24H',
    friendly_name: 'kb_termin_reminder_24h',
    body: 'Hallo {{1}}, kleine Erinnerung: dein Beratungstermin ist morgen am {{2}} um {{3}} Uhr per {{4}}.',
    sampleVars: { '1': 'Aaron', '2': '15.04.2026', '3': '14:30', '4': 'Video' },
  },
  {
    envKey: 'TWILIO_TPL_KB_TERMIN_REMINDER_1H',
    friendly_name: 'kb_termin_reminder_1h',
    body: 'Hallo {{1}}, in 1 Stunde startet dein Beratungstermin um {{2}} Uhr. Video-Link: {{3}}',
    sampleVars: { '1': 'Aaron', '2': '14:30', '3': MEET },
  },
  {
    envKey: 'TWILIO_TPL_NO_SHOW_KUNDE',
    friendly_name: 'no_show_kunde',
    body: 'Hallo {{1}}, leider warst du heute nicht beim Gutachtertermin. Bitte melde dich, damit wir einen neuen Termin vereinbaren können: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_NACHBESICHTIGUNG_ANGEFORDERT',
    friendly_name: 'nachbesichtigung_angefordert',
    body: 'Hallo {{1}}, die Versicherung möchte eine Nachbesichtigung deines Fahrzeugs. Bitte wähle einen Termin: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_NACHBESICHTIGUNG_TERMIN',
    friendly_name: 'nachbesichtigung_termin',
    body: 'Hallo {{1}}, der Nachbesichtigungstermin ist für {{2}} bestätigt. Details: {{3}}',
    sampleVars: { '1': 'Aaron', '2': '20.04.2026 um 10:00', '3': PORTAL },
  },
  {
    envKey: 'TWILIO_TPL_NACHBESICHTIGUNG_ABGESCHLOSSEN',
    friendly_name: 'nachbesichtigung_abgeschlossen',
    body: 'Hallo {{1}}, die Nachbesichtigung ist abgeschlossen. Wir warten jetzt auf die finale Reaktion der Versicherung. Status: {{2}}',
    sampleVars: { '1': 'Aaron', '2': PORTAL },
  },
]

// ─── Twilio Content API Helpers ─────────────────────────────────────────────

async function findExisting(auth, friendlyName) {
  const url = `https://content.twilio.com/v1/Content?FriendlyName=${encodeURIComponent(friendlyName)}`
  const resp = await fetch(url, { headers: { Authorization: auth } })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`List failed (${resp.status}): ${text}`)
  }
  const data = await resp.json()
  return data.contents?.[0] ?? null
}

async function createContent(auth, tpl) {
  const body = {
    friendly_name: tpl.friendly_name,
    language: 'de',
    variables: tpl.sampleVars,
    types: {
      'twilio/text': { body: tpl.body },
    },
  }
  const resp = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Create failed (${resp.status}): ${text}`)
  }
  return await resp.json()
}

async function submitApproval(auth, contentSid, name) {
  const resp = await fetch(
    `https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests/whatsapp`,
    {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, category: 'UTILITY' }),
    },
  )
  if (!resp.ok) {
    const text = await resp.text()
    // Approval kann fehlschlagen wenn schon eingereicht — nicht fatal
    console.warn(`  ⚠ Approval-Submit failed (${resp.status}): ${text}`)
    return null
  }
  return await resp.json()
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN

  if (!sid || !token) {
    console.error('TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN müssen gesetzt sein')
    console.error('Beispiel: TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx node scripts/twilio-setup-templates.mjs')
    process.exit(1)
  }

  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
  console.log(`Starte Setup für ${TEMPLATES.length} Templates...\n`)

  const results = []

  for (const tpl of TEMPLATES) {
    try {
      const existing = await findExisting(auth, tpl.friendly_name)
      if (existing) {
        console.log(`✓ ${tpl.friendly_name} existiert bereits (${existing.sid})`)
        results.push({ envKey: tpl.envKey, sid: existing.sid, status: 'existing' })
        await sleep(300)
        continue
      }

      const content = await createContent(auth, tpl)
      console.log(`+ ${tpl.friendly_name} angelegt (${content.sid})`)

      await submitApproval(auth, content.sid, tpl.friendly_name)
      console.log(`  → zur WhatsApp-Approval eingereicht`)

      results.push({ envKey: tpl.envKey, sid: content.sid, status: 'created' })
      await sleep(700)
    } catch (err) {
      console.error(`✗ ${tpl.friendly_name}: ${err.message}`)
      results.push({ envKey: tpl.envKey, sid: null, status: 'error', error: err.message })
    }
  }

  // .env.local-Output
  console.log('\n=== Vercel ENV-Variablen (zum Copy-Paste) ===\n')
  for (const r of results.filter((r) => r.sid)) {
    console.log(`${r.envKey}=${r.sid}`)
  }

  // Summary
  const created = results.filter((r) => r.status === 'created').length
  const existing = results.filter((r) => r.status === 'existing').length
  const errors = results.filter((r) => r.status === 'error').length
  console.log(`\n✓ ${created} neu angelegt, ${existing} bereits existierend, ${errors} Fehler`)

  if (errors > 0) {
    console.log('\nFehler-Details:')
    for (const r of results.filter((r) => r.status === 'error')) {
      console.log(`  ${r.envKey}: ${r.error}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
