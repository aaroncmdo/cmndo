// AAR-898: Baileys-Connection-Manager. Persistente Auth-State im
// AUTH_DIR (default /etc/claimondo/baileys-auth auf VPS, lokal
// ./auth-state-local). Auto-Reconnect bei DisconnectReason != logged-out.

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys'
import qrcodeTerminal from 'qrcode-terminal'
import pino from 'pino'

// Baileys uses @hapi/boom internally — wir typen den disconnect-Error nur
// so weit wie nötig statt eine extra dependency aufzunehmen.
type DisconnectError = Error & {
  output?: { statusCode?: number }
}

export type SockState = {
  sock: WASocket | null
  connected: boolean
  lastSeenAt: string | null
  lastQrAt: string | null
  /** Anzahl Reconnects in den letzten 60 Sekunden — Trigger fuer
   *  Sentry-Alert wenn > 3. */
  reconnectsInWindow: number
}

const RECONNECT_WINDOW_MS = 60_000
const RECONNECT_THRESHOLD = 3

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

export const state: SockState = {
  sock: null,
  connected: false,
  lastSeenAt: null,
  lastQrAt: null,
  reconnectsInWindow: 0,
}

const reconnectTimestamps: number[] = []

function trackReconnect() {
  const now = Date.now()
  reconnectTimestamps.push(now)
  while (
    reconnectTimestamps.length > 0 &&
    reconnectTimestamps[0]! < now - RECONNECT_WINDOW_MS
  ) {
    reconnectTimestamps.shift()
  }
  state.reconnectsInWindow = reconnectTimestamps.length
  if (state.reconnectsInWindow > RECONNECT_THRESHOLD) {
    logger.error(
      { reconnects: state.reconnectsInWindow },
      'AAR-898: Reconnect-Loop ueber Threshold — vermutlich WA-Session-Block',
    )
    // TODO: Sentry-Alert sobald @sentry/node installiert ist
  }
}

export async function startBaileys(authDir: string): Promise<void> {
  const { state: authState, saveCreds } = await useMultiFileAuthState(authDir)

  const sock = makeWASocket({
    auth: authState,
    logger: logger.child({ scope: 'baileys' }),
    printQRInTerminal: false, // wir machen das manuell, damit QR ueber pm2 logs sichtbar wird
    browser: ['Claimondo', 'Chrome', '120'],
  })

  state.sock = sock

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      state.lastQrAt = new Date().toISOString()
      logger.info('AAR-898: QR-Code zur einmaligen Authentifizierung:')
      qrcodeTerminal.generate(qr, { small: true })
      logger.info('AAR-898: Bitte mit Handy scannen (WhatsApp → Verknüpfte Geräte → Gerät hinzufügen)')
    }

    if (connection === 'open') {
      state.connected = true
      state.lastSeenAt = new Date().toISOString()
      logger.info('AAR-898: Verbindung zu WhatsApp Web aufgebaut.')
    } else if (connection === 'close') {
      state.connected = false
      const err = lastDisconnect?.error as DisconnectError | undefined
      const code = err?.output?.statusCode
      const isLoggedOut = code === DisconnectReason.loggedOut

      logger.warn(
        { code, reason: err?.message },
        'AAR-898: Verbindung getrennt',
      )

      if (isLoggedOut) {
        logger.error(
          'AAR-898: WA-Session manuell entkoppelt — Auth-State loeschen und Worker neu starten fuer neuen QR.',
        )
        return
      }

      trackReconnect()
      setTimeout(() => {
        logger.info('AAR-898: Reconnect-Versuch …')
        void startBaileys(authDir)
      }, 2_000)
    }
  })

  sock.ev.on('messages.upsert', (m) => {
    // Wir empfangen nur, antworten nicht automatisch. Eingehende Messages
    // werden in einem spaeteren Slice in eine `wa_inbound_messages`-Tabelle
    // gespiegelt damit der Dispatch sie sieht.
    logger.debug({ messageCount: m.messages.length }, 'inbound')
  })
}

export function getSock(): WASocket {
  if (!state.sock || !state.connected) {
    throw new Error('AAR-898: Baileys-Sock nicht verbunden — bitte warten oder /health pruefen')
  }
  return state.sock
}
