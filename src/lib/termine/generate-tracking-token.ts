import { randomBytes } from 'crypto'

// KFZ-179: Crypto-sicherer Token fuer Kunden-Tracking-Links.
export function generateTrackingToken(): string {
  return randomBytes(32).toString('base64url')
}
