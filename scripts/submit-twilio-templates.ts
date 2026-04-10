/**
 * One-shot Script: Alle 26 WhatsApp-Templates aus Notion automatisiert
 * bei Twilio Content API submitten + Approval beantragen.
 *
 * Ausfuehrung: npx tsx scripts/submit-twilio-templates.ts
 *
 * Benoetigt in .env.local:
 *   TWILIO_ACCOUNT_SID=ACxxxxxxxx
 *   TWILIO_AUTH_TOKEN=xxxxxxxx
 *
 * Output: Liste der SIDs zum Copy-Paste in Vercel env vars.
 */

import twilio from 'twilio'

const DRY_RUN_EARLY = process.argv.includes('--dry-run')

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN

if (!DRY_RUN_EARLY && (!ACCOUNT_SID || !AUTH_TOKEN)) {
  console.error('TWILIO_ACCOUNT_SID und TWILIO_AUTH_TOKEN muessen in .env.local gesetzt sein.')
  console.error('Fuer Validierung ohne Twilio: npx tsx scripts/submit-twilio-templates.ts --dry-run')
  process.exit(1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = DRY_RUN_EARLY ? null as any : twilio(ACCOUNT_SID!, AUTH_TOKEN!)

// ─── Template-Definitionen (aus Notion-Page 33e1da4c-9124-817b) ──────────

type Template = {
  name: string
  envKey: string
  body: string
  variableCount: number
}

const TEMPLATES: Template[] = [
  {
    name: 'flowlink_versand',
    envKey: 'TWILIO_TPL_FLOWLINK_VERSAND',
    variableCount: 6,
    body: `Hallo {{1}}, herzlich willkommen bei Claimondo! 👋🎉
Wie soeben besprochen haben wir bereits {{2}} {{3}} als zertifizierten DAT-Sachverständigen für deinen Fall ausgewählt und einen Termin am {{4}} um {{5}} Uhr für dich reserviert. 📅
Damit wir diesen Termin verbindlich bestätigen können, benötigen wir noch kurz deine Sicherungsabtretung ✍️ — damit erteilst du uns offiziell den Auftrag zur Schadenbegutachtung. Hier geht's zum Schadenlink, dauert ca. 3 Minuten: {{6}}
✅ Sobald du fertig bist, wird dein Termin automatisch bestätigt.
💰 Für dich vollständig kostenlos — ohne Wenn und Aber.
Bei Fragen sind wir jederzeit für dich da.
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'fall_eroeffnet',
    envKey: 'TWILIO_TPL_FALL_EROEFFNET',
    variableCount: 2,
    body: `Hallo {{1}}, deine Sicherungsabtretung ist eingegangen — vielen Dank! ✅🙌
Dein reservierter Sachverständigentermin ist damit jetzt verbindlich bestätigt. Die Termindetails erhältst du gleich hier auf WhatsApp. 📅
Jetzt folgt noch ein letzter kurzer Schritt:
1️⃣ Die Verkehrsrechtskanzlei LexDrive GmbH schreibt dir gleich direkt hier auf WhatsApp. 📲
2️⃣ Bitte bestätige dort den Kanzleiauftrag ✍️ — damit bevollmächtigst du Rechtsanwalt Kevin Genter, deinen Schadensersatz gegenüber der gegnerischen Versicherung rechtlich durchzusetzen.
3️⃣ Das war's! LexDrive übernimmt ab diesem Moment alles für dich. ⚖️
💡 LexDrive ist auf KFZ-Haftpflichtschäden spezialisiert und holt das Maximum aus deinem Schaden heraus — für dich entstehen keinerlei Kosten, weder für das Gutachten noch für die anwaltliche Vertretung.
Deinen Fallstatus sowie alle Termindetails findest du jederzeit hier: {{2}} 📱
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'termin_bestaetigt',
    envKey: 'TWILIO_TPL_TERMIN_BESTAETIGT',
    variableCount: 6,
    body: `Hallo {{1}}, dein Begutachtungstermin ist bestätigt! 📅✅
📌 Datum: {{2}}
⏰ Uhrzeit: {{3}} Uhr
🔍 Sachverständiger: {{4}}
📍 Adresse: {{5}}
Bitte stelle sicher, dass dein Fahrzeug 🚗 zum Termin erreichbar ist. Terminänderungen kannst du jederzeit bequem über dein Kundenportal vornehmen 👉 {{6}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'reminder_24h',
    envKey: 'TWILIO_TPL_REMINDER_24H',
    variableCount: 4,
    body: `Hallo {{1}}, kurze Erinnerung! 🔔
Morgen um {{3}} Uhr kommt {{2}} zur Fahrzeugbegutachtung. 🔍🚗 Bitte stelle sicher, dass dein Fahrzeug erreichbar ist.
Falls sich etwas geändert hat, kannst du den Termin jederzeit über dein Kundenportal anpassen 👉 {{4}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'reminder_2h',
    envKey: 'TWILIO_TPL_REMINDER_2H',
    variableCount: 3,
    body: `Hallo {{1}}, ⏰ {{2}} ist in ca. 2 Stunden bei dir!
Bitte stelle sicher, dass dein Fahrzeug 🚗 jetzt zugänglich ist. Bei kurzfristigen Änderungen bitte sofort über dein Kundenportal handeln 👉 {{3}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'sv_tagesroute',
    envKey: 'TWILIO_TPL_SV_TAGESROUTE',
    variableCount: 4,
    body: `Guten Morgen {{1}}! ☀️🗓️
Heute stehen {{2}} Termin(e) auf deiner Route. Erster Einsatz: {{3}} Uhr. Deine komplette Tagesübersicht findest du hier 👉 {{4}}
Viel Erfolg heute! 💪
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'gutachten_fertig',
    envKey: 'TWILIO_TPL_GUTACHTEN_FERTIG',
    variableCount: 3,
    body: `Hallo {{1}}, das Gutachten ist fertiggestellt! 📋✅
💶 Festgestellter Schadenbetrag: {{2}} €
Die Akte wird jetzt intern geprüft und anschließend an die Verkehrsrechtskanzlei LexDrive GmbH übergeben ⚖️ — sie übernimmt die vollständige Regulierung gegenüber der Versicherung. Du musst nichts tun.
Den aktuellen Status deines Falls siehst du hier 👉 {{3}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'kanzlei_uebergabe',
    envKey: 'TWILIO_TPL_KANZLEI_UEBERGABE',
    variableCount: 2,
    body: `Hallo {{1}}, die Qualitätsprüfung ist abgeschlossen! 🎯
📂 Deine vollständige Akte wurde soeben an die Verkehrsrechtskanzlei LexDrive GmbH übergeben. Rechtsanwalt Kevin Genter übernimmt ab jetzt die rechtliche Durchsetzung deines Schadensersatzes. ⚖️
Du wirst direkt von LexDrive kontaktiert. Bei juristischen Fragen wende dich jederzeit direkt an LexDrive — per WhatsApp oder Telefon 📞
Deinen Fallstatus verfolgst du hier 👉 {{2}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'as_gesendet',
    envKey: 'TWILIO_TPL_AS_GESENDET',
    variableCount: 2,
    body: `Hallo {{1}}, wichtiges Update! ✉️
Das Anspruchsschreiben an die gegnerische Versicherung wurde heute durch die Verkehrsrechtskanzlei LexDrive GmbH versendet. ⚖️
⏱️ Die Versicherung ist nun gesetzlich verpflichtet, innerhalb von 14 Tagen zu antworten. Wir haben das im Blick!
Bei juristischen Fragen wende dich direkt an LexDrive — per WhatsApp oder Telefon 📞
Den aktuellen Stand verfolgst du hier 👉 {{2}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'regulierung_angekuendigt',
    envKey: 'TWILIO_TPL_REGULIERUNG_ANGEKUENDIGT',
    variableCount: 2,
    body: `Hallo {{1}}, gute Neuigkeiten! 🎉👍
Die Versicherung hat eine Regulierung angekündigt. Rechtsanwalt Kevin Genter prüft den Betrag und stellt sicher, dass er dem vollen festgestellten Schadensumfang entspricht. 🔍💶
Bei Fragen wende dich direkt an die Verkehrsrechtskanzlei LexDrive GmbH per WhatsApp oder Telefon 📞
Aktuellen Stand hier 👉 {{2}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'zahlung_eingegangen',
    envKey: 'TWILIO_TPL_ZAHLUNG_EINGEGANGEN',
    variableCount: 3,
    body: `Hallo {{1}}, es ist so weit! 🎉💶
Der Schadensersatz von {{2}} € ist eingegangen! Die abschließende Abrechnung wird jetzt vorbereitet — wir melden uns in Kürze mit allen Details. 📊
Alles einsehen kannst du hier 👉 {{3}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'fall_abgeschlossen',
    envKey: 'TWILIO_TPL_FALL_ABGESCHLOSSEN',
    variableCount: 2,
    body: `Hallo {{1}}, dein Fall ist offiziell abgeschlossen! ✅🏁
Vielen Dank für dein Vertrauen in Claimondo — es war uns eine Freude, deinen Schaden erfolgreich für dich durchzusetzen. 🙏
⭐ Falls du kurz Zeit hast, würden wir uns sehr über eine Bewertung freuen — du hilfst damit anderen Geschädigten, den richtigen Partner zu finden: {{2}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'eskalation_tag14',
    envKey: 'TWILIO_TPL_ESKALATION_TAG14',
    variableCount: 2,
    body: `Hallo {{1}}, wichtiges Update zu deinem Fall. ⚠️
Die Versicherung hat die 14-Tages-Frist verstreichen lassen. Unser Team hat die Versicherung heute persönlich kontaktiert 📞 und auf die ausstehende Regulierung hingewiesen.
Bei juristischen Fragen wende dich direkt an die Verkehrsrechtskanzlei LexDrive GmbH per WhatsApp oder Telefon 📞
Aktuellen Stand hier 👉 {{2}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'eskalation_tag28',
    envKey: 'TWILIO_TPL_ESKALATION_TAG28',
    variableCount: 2,
    body: `Hallo {{1}}, wir erhöhen den Druck. ⚖️🔴
Die Versicherung hat nach 28 Tagen immer noch nicht reguliert. Rechtsanwalt Kevin Genter hat heute eine formelle Mahnung mit Verzugszinsen an die Versicherung verschickt. 📨
💡 Dein Anspruch wächst mit jedem weiteren Tag — wir setzen ihn durch!
Bei Fragen direkt an die Verkehrsrechtskanzlei LexDrive GmbH per WhatsApp oder Telefon 📞
Status hier 👉 {{2}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'eskalation_tag42',
    envKey: 'TWILIO_TPL_ESKALATION_TAG42',
    variableCount: 2,
    body: `Hallo {{1}}, wir lassen das nicht auf sich beruhen. ⚡⚖️
Dein Fall läuft seit über 6 Wochen ohne Regulierung. Rechtsanwalt Kevin Genter hat alle weiteren rechtlichen Eskalationsmaßnahmen eingeleitet.
📞 Einer unserer Mitarbeiter wird dich in Kürze persönlich anrufen, um die nächsten Schritte mit dir zu besprechen. Bei dringenden Fragen wende dich direkt an die Verkehrsrechtskanzlei LexDrive GmbH per WhatsApp oder Telefon.
Status hier 👉 {{2}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'chat_fallback_kunde',
    envKey: 'TWILIO_TPL_CHAT_FALLBACK_KUNDE',
    variableCount: 3,
    body: `Hallo {{1}}, du hast eine neue Nachricht zu deinem Fall! 💬📲
„{{2}}"
Antworten und deinen Fallstatus einsehen kannst du hier 👉 {{3}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'chat_fallback_kb',
    envKey: 'TWILIO_TPL_CHAT_FALLBACK_KB',
    variableCount: 3,
    body: `Hey {{1}}, 🔔 {{2}} hat geschrieben:
„{{3}}"
Bitte kurz im Portal antworten 👉
Claimondo-System`,
  },
  {
    name: 'kuerzung_eingetragen',
    envKey: 'TWILIO_TPL_KUERZUNG_EINGETRAGEN',
    variableCount: 4,
    body: `Hallo {{1}}, wichtiges Update zu deinem Fall. ⚠️
Die Versicherung hat eine Kürzung vorgenommen:
📋 Gutachtenbetrag: {{3}} €
❌ Anerkannt von der Versicherung: {{2}} €
⚖️ Rechtsanwalt Kevin Genter prüft die Kürzung rechtlich und widerspricht, sofern sie nicht vollständig gerechtfertigt ist. Dein voller Anspruch bleibt das Ziel!
Bei Fragen direkt an die Verkehrsrechtskanzlei LexDrive GmbH per WhatsApp oder Telefon 📞
Aktuellen Stand hier 👉 {{4}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'sv_losgefahren',
    envKey: 'TWILIO_TPL_SV_LOSGEFAHREN',
    variableCount: 5,
    body: `Hallo {{1}}, es geht los! 🚗💨
{{2}} ist auf dem Weg zu dir und trifft in ca. {{3}} Minuten ein.
📍 Adresse: {{4}}
📡 Live-Tracking: {{5}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'sv_fast_da',
    envKey: 'TWILIO_TPL_SV_FAST_DA',
    variableCount: 2,
    body: `Hallo {{1}}, gleich ist es soweit! ⏱️🚗
{{2}} ist in ca. 5 Minuten bei dir. Bitte kurz zum Fahrzeug — es geht gleich los! 👍
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'sv_angekommen',
    envKey: 'TWILIO_TPL_SV_ANGEKOMMEN',
    variableCount: 2,
    body: `Hallo {{1}}, {{2}} ist eingetroffen! ✅🔍
Die Begutachtung deines Fahrzeugs hat begonnen.
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'termin_storniert',
    envKey: 'TWILIO_TPL_TERMIN_STORNIERT',
    variableCount: 4,
    body: `Hallo {{1}}, leider eine kurzfristige Änderung. ❌📅
{{2}} musste den Termin am {{3}} absagen. Wir entschuldigen uns für die Unannehmlichkeit!
🔄 Einen neuen Termin kannst du direkt über dein Kundenportal buchen 👉 {{4}} — wir koordinieren alles Weitere für dich.
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'sv_verspaetet',
    envKey: 'TWILIO_TPL_SV_VERSPAETET',
    variableCount: 4,
    body: `Hallo {{1}}, kurze Info. ⏰
{{2}} verspätet sich heute um ca. {{3}} Minuten. Der Termin findet planmäßig statt — wir entschuldigen uns für die Verzögerung! 🙏
Änderungen kannst du jederzeit über dein Portal vornehmen 👉 {{4}}
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'dokumente_nachreichen',
    envKey: 'TWILIO_TPL_DOKUMENTE_NACHREICHEN',
    variableCount: 3,
    body: `Hallo {{1}}, noch ein kurzer Schritt! 📎
Für deinen Fall fehlen noch folgende Unterlagen:
📁 {{2}}
Bitte lade sie zeitnah in deinem Kundenportal hoch ⚡ — eine vollständige Akte beschleunigt die Regulierung erheblich 👉 {{3}}
Danke dir! 🙏
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
  {
    name: 'rechnung_verfuegbar',
    envKey: 'TWILIO_TPL_RECHNUNG_VERFUEGBAR',
    variableCount: 2,
    body: `Hallo {{1}}, deine Rechnung ist da! 🧾✅
Sie steht jetzt in deinem Kundenportal zur Verfügung 👉 {{2}}
Bei Fragen sind wir jederzeit für dich da.
Viele Grüße,
Dein Claimondo-Team
*Schaden einfach abwickeln.*`,
  },
]

// ─── Main ─────────────────────────────────────────────────────────────────

async function submitTemplate(tpl: Template): Promise<{ name: string; sid: string; envKey: string } | { name: string; error: string }> {
  try {
    // Build variables object: { "1": "placeholder", "2": "placeholder", ... }
    const variables: Record<string, string> = {}
    for (let i = 1; i <= tpl.variableCount; i++) {
      variables[String(i)] = `placeholder_${i}`
    }

    // Create content template
    const content = await client.content.v1.contents.create({
      friendlyName: `claimondo_${tpl.name}`,
      language: 'de',
      variables: variables,
      types: {
        'twilio/text': { body: tpl.body },
      },
    })

    const sid = content.sid

    // Submit for WhatsApp approval
    try {
      await client.content.v1.contents(sid).approvalRequests.create({
        name: `claimondo_${tpl.name}`,
        category: 'UTILITY',
      })
    } catch (approvalErr) {
      console.warn(`  [WARN] Approval-Request fuer ${tpl.name} fehlgeschlagen (Template trotzdem erstellt): ${approvalErr}`)
    }

    return { name: tpl.name, sid, envKey: tpl.envKey }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { name: tpl.name, error: msg }
  }
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  const TEST_ONE = process.argv.includes('--test-one')

  console.log(`\n=== Twilio WhatsApp Template Submission ===`)
  console.log(`Templates: ${TEMPLATES.length}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (keine API-Calls)' : TEST_ONE ? 'TEST (nur 1 Template)' : 'LIVE (alle Templates)'}`)
  console.log()

  if (DRY_RUN) {
    for (const tpl of TEMPLATES) {
      const charCount = tpl.body.length
      const ok = charCount <= 1024 ? '✅' : '❌ ZU LANG'
      console.log(`${ok} ${tpl.name} (${tpl.variableCount} vars, ${charCount} chars) -> ${tpl.envKey}`)
    }
    console.log('\n--- Dry run complete. Use --test-one or run without flags for live submission. ---')
    return
  }

  const templatesToSubmit = TEST_ONE ? [TEMPLATES[0]] : TEMPLATES
  const results: Array<{ name: string; sid: string; envKey: string }> = []
  const errors: Array<{ name: string; error: string }> = []

  for (const tpl of templatesToSubmit) {
    process.stdout.write(`Submitting ${tpl.name}...`)
    const result = await submitTemplate(tpl)
    if ('error' in result) {
      console.log(` ❌ ${result.error}`)
      errors.push(result)
    } else {
      console.log(` ✅ ${result.sid}`)
      results.push(result)
    }
    // Rate limiting: 1 Sekunde zwischen Calls
    await new Promise(r => setTimeout(r, 1000))
  }

  // Output
  console.log('\n\n=== ERGEBNIS ===\n')

  if (results.length > 0) {
    console.log('--- Vercel env vars (Copy-Paste) ---\n')
    for (const r of results) {
      console.log(`${r.envKey}=${r.sid}`)
    }
  }

  if (errors.length > 0) {
    console.log('\n--- FEHLER ---\n')
    for (const e of errors) {
      console.log(`❌ ${e.name}: ${e.error}`)
    }
  }

  console.log(`\n--- ${results.length}/${templatesToSubmit.length} erfolgreich, ${errors.length} Fehler ---`)
}

main().catch(console.error)
