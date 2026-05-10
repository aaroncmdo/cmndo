// Claimondo Baileys-Service — Phase 1 (Read-Only-Spike).
//
// Persistente WhatsApp-Web-Connection auf dem VPS, expose'd 3 HTTP-Endpoints:
//   GET  /health           — Connection-State (für Monitoring)
//   POST /check            — Telefon-Nummer auf WhatsApp prüfen ({ phone })
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
} from '@whiskeysockets/baileys'
import express from 'express'
import pino from 'pino'
import qrcode from 'qrcode-terminal'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
const PORT = Number(process.env.BAILEYS_PORT ?? 3055)
const AUTH_TOKEN = process.env.BAILEYS_AUTH_TOKEN ?? ''
const AUTH_DIR = process.env.BAILEYS_AUTH_DIR ?? './auth_info_baileys'

let sock = null
let connectionState = 'disconnected' // disconnected | connecting | open
let lastQr = null

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: ['Claimondo Baileys', 'Chrome', '1.0.0'],
  })

  sock.ev.on('creds.update', saveCreds)

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
