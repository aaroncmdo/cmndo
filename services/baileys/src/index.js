// Claimondo Baileys-Service — Phase 1 (Read-Only) + Send-Smoke.
//
// Persistente WhatsApp-Web-Connection auf dem VPS, expose'd 4 HTTP-Endpoints:
//   GET  /health           — Connection-State (für Monitoring)
//   POST /check            — Telefon-Nummer auf WhatsApp prüfen ({ phone })
//   POST /send             — Nachricht senden ({ phone, text }) — Smoke/Test.
//                            Production-Sends laufen später über die Next.js-
//                            Send-Wrapper mit Templates/Logging.
//   GET  /qr               — Aktuelles QR-Code-Bild (nur bei Re-Auth nötig)
//
// Auth-State liegt in ./auth_info_baileys/ — bei Neustart wird die Session
// wiederhergestellt. Erster Start braucht QR-Scan via Aaron's Phone (eigene
// Business-Nummer ist empfohlen wegen Banning-Risiko).
//
// Risiken siehe docs/backlog-2026-05-10.md (Baileys-Block):
// - Banning-Risiko bei Mass-Sending
// - Re-Auth alle ~14 Tage
// - 1 Service = 1 Account

import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import express from 'express'
import pino from 'pino'
import qrcode from 'qrcode-terminal'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const PORT = Number(process.env.BAILEYS_PORT ?? 3055)
const AUTH_TOKEN = process.env.BAILEYS_AUTH_TOKEN ?? ''
const AUTH_DIR = process.env.BAILEYS_AUTH_DIR ?? './auth_info_baileys'
const NEXT_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.claimondo.de'
const CRON_SECRET = process.env.CRON_SECRET ?? ''

let sock = null
let connectionState = 'disconnected' // disconnected | connecting | open
let lastQr = null

/** Device-Suffix abschneiden: "4915153608515:4" → "4915153608515". */
function stripDevice(id) {
  return String(id ?? '').split(':')[0]
}

/**
 * Telefon-Nummer aus dem Absender-JID gewinnen.
 *
 * WhatsApp liefert seit Juni 2026 zunehmend LID-JIDs ("<lid>@lid") statt der
 * frueheren "<nummer>@s.whatsapp.net". Das alte split('@')[0] gab dann die LID
 * als vermeintliche Telefonnummer weiter — die App findet damit keinen Fall
 * mehr (matchInboundToFall matcht auf die letzten 9 Ziffern). Ab 10.07.2026 kam
 * dadurch keine einzige zuordenbare Nummer mehr an; auf prod waren 200 von 200
 * inbound-Nachrichten ohne Fall-/Lead-Bezug und damit in keiner UI sichtbar.
 *
 * Reihenfolge: klassischer PN-JID → key.remoteJidAlt → persistenter LID-Store.
 * Laesst sich nichts aufloesen, wird die LID durchgereicht (Nachricht geht
 * nicht verloren) und geloggt — via kennzeichnet den Pfad.
 */
async function resolvePhoneFromJid(msg, remoteJid) {
  if (remoteJid.endsWith('@s.whatsapp.net')) {
    return { phone: stripDevice(remoteJid.split('@')[0]), via: 'pn_jid' }
  }

  if (remoteJid.endsWith('@lid')) {
    const lid = stripDevice(remoteJid.split('@')[0])

    // remoteJidAlt traegt bei LID-Nachrichten die PN-Variante mit.
    const alt = msg.key?.remoteJidAlt
    if (alt && alt.endsWith('@s.whatsapp.net')) {
      return { phone: stripDevice(alt.split('@')[0]), via: 'remoteJidAlt' }
    }

    // Persistenter LID→PN-Store (auth_info_baileys/lid-mapping-*_reverse.json).
    try {
      const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(`${lid}@lid`)
      if (pn) return { phone: stripDevice(String(pn).split('@')[0]), via: 'lid_store' }
    } catch (err) {
      logger.warn({ err, lid }, 'LID→PN-Lookup fehlgeschlagen')
    }

    return { phone: lid, via: 'unresolved_lid' }
  }

  return { phone: stripDevice(remoteJid.split('@')[0]), via: 'other_jid' }
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

  // AAR (31.07.): live WA-web version from the Baileys endpoint instead of the
  // (stale) bundled default — else WhatsApp rejects the login with code 405
  // ("Connection Failure"). Prod-Outage 02.07.-31.07. was exactly this.
  const { version } = await fetchLatestBaileysVersion()
  logger.info({ version }, 'Baileys: live WA version')

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: ['Claimondo Baileys', 'Chrome', '1.0.0'],
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      // Eigene Nachrichten werden MITGENOMMEN (Aaron 23.08.). Frueher stand hier
      // `if (msg.key.fromMe) continue` — dadurch fehlte im System alles, was vom
      // Handy oder WhatsApp-Web geschrieben wurde, und der Verlauf jeder Akte war
      // einseitig. Zugleich schliesst das die groessere Luecke: 11 App-Stellen
      // senden direkt ueber sendWhatsAppText, ohne in `nachrichten` zu schreiben
      // (800 Sends standen 36 DB-Zeilen gegenueber). Ihr Echo laeuft hier durch —
      // der Kanal erfasst sich damit selbst, statt dass jeder Sender daran denken
      // muss. Doppelte werden App-seitig ueber external_message_id verworfen.
      const fromMe = !!msg.key.fromMe

      const remoteJid = msg.key.remoteJid ?? ''
      // Gruppen-Nachrichten ignorieren (JID endet auf @g.us)
      if (remoteJid.endsWith('@g.us')) continue
      // Status-/Broadcast-Updates ignorieren ("status@broadcast"). Sie liefen
      // bisher als vermeintliche Kundennachricht durch und endeten in einem 400
      // (`phone: "status"`), sichtbar im Log am 21.08.
      if (remoteJid.endsWith('@broadcast')) continue

      // Telefon-Nummer aus JID gewinnen — haelt LID-JIDs ("<lid>@lid") aus.
      const { phone, via } = await resolvePhoneFromJid(msg, remoteJid)
      if (via === 'unresolved_lid') {
        logger.warn(
          { remote_jid: remoteJid, phone },
          'LID nicht aufloesbar — LID wird als phone durchgereicht, Fall-Match wird fehlschlagen',
        )
      }

      // Nachrichtentext — unterstützt conversation + extendedTextMessage
      const text =
        msg.message?.conversation ??
        msg.message?.extendedTextMessage?.text ??
        ''

      const hasMedia = !!(
        msg.message?.imageMessage ||
        msg.message?.videoMessage ||
        msg.message?.documentMessage ||
        msg.message?.audioMessage
      )

      if (!phone) continue

      // Medien herunterladen + base64 an die App schicken. Die Inbound-Route
      // loest base64 -> Buffer auf (processInboundMedia) — KEIN Supabase-Key im
      // Worker noetig. Bei Download-Fehler oder zu grosser Datei bleibt `media`
      // undefined; die App greift dann auf den has_media-Notification-Pfad.
      let media
      if (hasMedia) {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { logger, reuploadRequest: sock.updateMediaMessage },
          )
          const MAX_INLINE = 12 * 1024 * 1024 // 12 MB roh (~16 MB base64-POST)
          if (buffer && buffer.length > 0 && buffer.length <= MAX_INLINE) {
            const m = msg.message ?? {}
            const mime =
              m.imageMessage?.mimetype ??
              m.videoMessage?.mimetype ??
              m.documentMessage?.mimetype ??
              m.audioMessage?.mimetype ??
              'application/octet-stream'
            const filename = m.documentMessage?.fileName ?? undefined
            media = [{ base64: buffer.toString('base64'), mime, filename }]
          } else if (buffer && buffer.length > MAX_INLINE) {
            logger.warn({ phone, size: buffer.length }, 'media zu gross fuer base64-inline — has_media-Pfad')
          }
        } catch (err) {
          logger.warn({ phone, err: err?.message }, 'media download fehlgeschlagen — has_media ohne Bytes')
        }
      }

      try {
        const res = await fetch(`${NEXT_URL}/api/baileys/inbound`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${CRON_SECRET}`,
          },
          body: JSON.stringify({
            phone,
            text,
            message_id: msg.key.id ?? null,
            timestamp: msg.messageTimestamp
              ? Number(msg.messageTimestamp)
              : Date.now(),
            has_media: hasMedia,
            // Bei fromMe ist `phone` der EMPFAENGER, nicht der Absender — die
            // App speichert die Zeile dann als outbound und loest keinen der
            // Inbound-Effekte aus (kein Lead, keine Team-WA, keine Text-Intents).
            from_me: fromMe,
            ...(media ? { media } : {}),
          }),
        })
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          logger.warn({ phone, status: res.status, body }, 'inbound-callback fehlgeschlagen')
        } else {
          logger.info(
            { phone, via, from_me: fromMe, message_id: msg.key.id },
            fromMe ? 'eigene nachricht geloggt' : 'inbound-nachricht geloggt',
          )
        }
      } catch (err) {
        logger.error({ err, phone }, 'inbound-callback Netzwerk-Fehler')
      }
    }
  })

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      lastQr = qr
      logger.info('Neues QR-Code generiert — siehe Terminal-Output:')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      connectionState = 'open'
      lastQr = null
      logger.info({ connection: 'open' }, '✓ WhatsApp-Connection live')
    } else if (connection === 'connecting') {
      connectionState = 'connecting'
    } else if (connection === 'close') {
      connectionState = 'disconnected'
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      logger.warn({ code, shouldReconnect }, 'Connection geschlossen')

      if (shouldReconnect) {
        setTimeout(startSock, 3000) // 3s Backoff
      } else {
        logger.error(
          'logged out — Auth-Files in ' +
            AUTH_DIR +
            ' löschen + Service neu starten + QR neu scannen',
        )
      }
    }
  })
}

function authenticate(req, res, next) {
  if (!AUTH_TOKEN) return next() // kein Token konfiguriert → public (nur lokal!)
  const token = req.headers['x-baileys-token']
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

function normalizePhone(raw) {
  // E.164 ohne + → digits only mit Land-Prefix
  let p = String(raw ?? '').replace(/\D/g, '')
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith('0')) p = '49' + p.slice(1) // DE-Default für 0151...
  return p
}

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/health', (req, res) => {
  res.json({
    state: connectionState,
    has_qr: !!lastQr,
    timestamp: new Date().toISOString(),
  })
})

app.post('/check', authenticate, async (req, res) => {
  if (connectionState !== 'open') {
    return res.status(503).json({ error: 'baileys_not_connected', state: connectionState })
  }
  const phone = normalizePhone(req.body?.phone)
  if (!phone || phone.length < 8) {
    return res.status(400).json({ error: 'invalid_phone' })
  }
  try {
    const jid = phone + '@s.whatsapp.net'
    const result = await sock.onWhatsApp(jid)
    const exists = Array.isArray(result) && result.length > 0 && result[0]?.exists === true
    res.json({
      phone,
      on_whatsapp: exists,
      jid: exists ? result[0].jid : null,
    })
  } catch (err) {
    logger.error({ err }, '/check failed')
    res.status(500).json({ error: 'lookup_failed', message: err?.message })
  }
})

app.post('/send', authenticate, async (req, res) => {
  if (connectionState !== 'open') {
    return res.status(503).json({ error: 'baileys_not_connected', state: connectionState })
  }
  const phone = normalizePhone(req.body?.phone)
  const text = String(req.body?.text ?? '').trim()
  if (!phone || phone.length < 8) {
    return res.status(400).json({ error: 'invalid_phone' })
  }
  if (!text) {
    return res.status(400).json({ error: 'empty_text' })
  }
  if (text.length > 4096) {
    return res.status(400).json({ error: 'text_too_long', max: 4096 })
  }
  try {
    // Pre-Check: Empfänger muss WhatsApp haben — sonst silent fail in Baileys.
    const candidateJid = phone + '@s.whatsapp.net'
    const checkResult = await sock.onWhatsApp(candidateJid)
    const exists =
      Array.isArray(checkResult) &&
      checkResult.length > 0 &&
      checkResult[0]?.exists === true
    if (!exists) {
      return res.status(404).json({ error: 'recipient_not_on_whatsapp', phone })
    }
    const targetJid = checkResult[0].jid
    const message = await sock.sendMessage(targetJid, { text })
    logger.info(
      { phone, jid: targetJid, message_id: message?.key?.id, text_len: text.length },
      '/send ok',
    )
    res.json({
      ok: true,
      phone,
      jid: targetJid,
      message_id: message?.key?.id ?? null,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err, phone }, '/send failed')
    res.status(500).json({ error: 'send_failed', message: err?.message })
  }
})

app.get('/qr', authenticate, (req, res) => {
  if (!lastQr) {
    return res.status(404).json({ error: 'no_qr_pending', state: connectionState })
  }
  res.json({ qr: lastQr })
})

app.listen(PORT, () => {
  logger.info(`Baileys-Service auf :${PORT} bereit`)
  startSock().catch((err) => logger.error({ err }, 'startSock crashed'))
})
