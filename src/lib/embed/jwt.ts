import 'server-only'

// AAR-939 · Monika-Embed · Stream 5 — Site-Token JWT (dependency-free, HS256)
//
// Signiert/verifiziert kurzlebige Site-Tokens fuer den Embed-Widget-Submit.
// Bewusst OHNE `jose`/`jsonwebtoken`: Web Crypto (crypto.subtle) kann HMAC-SHA256
// nativ in Node 20+ und im Edge-Runtime — keine neue Dependency, kein Bundle-
// Overhead. Secret aus EMBED_JWT_SECRET (Plan Stream 5 / ENV-Liste).
//
// Token-Payload: { site, iat, exp } — site = embed_sites.slug, exp = iat + 1h.
// Verwendung: /api/embed/config gibt das Token aus, der Webhook
// /api/anfrage-from-lp verifiziert es (Stream 2 Auth-Schicht 4).

const ALG = { name: 'HMAC', hash: 'SHA-256' } as const
const TOKEN_TTL_SEC = 60 * 60 // 1 Stunde

export interface SiteTokenPayload {
  site: string // embed_sites.slug
  iat: number
  exp: number
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlEncodeString(s: string): string {
  return b64urlEncode(new TextEncoder().encode(s))
}

function b64urlDecodeToString(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function getSecret(): string {
  const secret = process.env.EMBED_JWT_SECRET
  if (!secret) throw new Error('EMBED_JWT_SECRET ist nicht konfiguriert')
  return secret
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), ALG, false, ['sign', 'verify'])
}

/** Signiert ein Site-Token (HS256, 1h gueltig). */
export async function signSiteToken(site: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload: SiteTokenPayload = { site, iat: now, exp: now + TOKEN_TTL_SEC }

  const head = b64urlEncodeString(JSON.stringify(header))
  const body = b64urlEncodeString(JSON.stringify(payload))
  const data = `${head}.${body}`

  const key = await importKey(getSecret())
  const sig = await crypto.subtle.sign(ALG, key, new TextEncoder().encode(data))
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`
}

/** Verifiziert ein Site-Token. Liefert das Payload oder null (ungueltig/abgelaufen). */
export async function verifySiteToken(token: string | null | undefined): Promise<SiteTokenPayload | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [head, body, sig] = parts
  const data = `${head}.${body}`

  try {
    const key = await importKey(getSecret())
    const sigBytes = Uint8Array.from(b64urlDecodeToString(sig), (c) => c.charCodeAt(0))
    const valid = await crypto.subtle.verify(ALG, key, sigBytes, new TextEncoder().encode(data))
    if (!valid) return null

    const payload = JSON.parse(b64urlDecodeToString(body)) as SiteTokenPayload
    if (!payload.site || typeof payload.exp !== 'number') return null
    if (Math.floor(Date.now() / 1000) >= payload.exp) return null // abgelaufen
    return payload
  } catch {
    return null
  }
}
