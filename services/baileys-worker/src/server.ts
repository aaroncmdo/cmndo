// AAR-898: HTTP-API fuer den Baileys-WhatsApp-Worker.
// Listen nur auf 127.0.0.1, Authentifizierung via X-Internal-Token Header.
// Wird von Next.js (src/lib/whatsapp/baileys-client.ts) konsumiert.

import express from 'express'
import pino from 'pino'
import { startBaileys, state, getSock } from './baileys-sock.js'

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

const PORT = Number(process.env.PORT ?? 4001)
const HOST = process.env.HOST ?? '127.0.0.1'
const AUTH_DIR =
  process.env.BAILEYS_AUTH_DIR ?? '/etc/claimondo/baileys-auth'
const INTERNAL_TOKEN = process.env.BAILEYS_INTERNAL_TOKEN

if (!INTERNAL_TOKEN) {
  logger.error('AAR-898: BAILEYS_INTERNAL_TOKEN ist nicht gesetzt — Service startet nicht.')
  process.exit(1)
}

const app = express()
app.use(express.json({ limit: '256kb' }))

// Auth-Middleware fuer alle Routen ausser /health
app.use((req, res, next) => {
  if (req.path === '/health') return next()
  if (req.header('x-internal-token') !== INTERNAL_TOKEN) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  next()
})

app.get('/health', (_req, res) => {
  res.json({
    connected: state.connected,
    lastSeenAt: state.lastSeenAt,
    lastQrAt: state.lastQrAt,
    reconnectsInWindow: state.reconnectsInWindow,
  })
})

function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s/()-]/g, '')
  if (p.startsWith('00')) p = '+' + p.slice(2)
  if (p.startsWith('0')) p = '+49' + p.slice(1)
  if (!p.startsWith('+')) p = '+' + p
  return p
}

function toJid(phone: string): string {
  const normalized = normalizePhone(phone).replace(/^\+/, '')
  return `${normalized}@s.whatsapp.net`
}

app.post('/lookup', async (req, res) => {
  const phone = String(req.body?.phone ?? '').trim()
  if (!phone) {
    res.status(400).json({ error: 'phone required' })
    return
  }
  try {
    const sock = getSock()
    const result = await sock.onWhatsApp(toJid(phone))
    const entry = result?.[0]
    res.json({
      hasWhatsApp: !!entry?.exists,
      jid: entry?.jid ?? null,
      checkedAt: new Date().toISOString(),
    })
  } catch (err) {
    logger.error({ err }, '/lookup failed')
    res.status(503).json({
      error: err instanceof Error ? err.message : 'baileys unavailable',
    })
  }
})

app.post('/send', async (req, res) => {
  const phone = String(req.body?.phone ?? '').trim()
  const text = String(req.body?.text ?? '').trim()
  if (!phone || !text) {
    res.status(400).json({ error: 'phone + text required' })
    return
  }
  try {
    const sock = getSock()
    const jid = toJid(phone)
    const result = await sock.sendMessage(jid, { text })
    res.json({
      sent: true,
      messageId: result?.key?.id ?? null,
      jid,
    })
  } catch (err) {
    logger.error({ err, phone }, '/send failed')
    res.status(503).json({
      error: err instanceof Error ? err.message : 'baileys unavailable',
      sent: false,
    })
  }
})

async function main() {
  logger.info({ authDir: AUTH_DIR }, 'AAR-898: starte Baileys-Worker …')
  await startBaileys(AUTH_DIR)
  app.listen(PORT, HOST, () => {
    logger.info(`AAR-898: HTTP-API auf http://${HOST}:${PORT}`)
  })
}

main().catch((err) => {
  logger.error({ err }, 'AAR-898: Worker-Start fehlgeschlagen')
  process.exit(1)
})
