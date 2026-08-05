/**
 * AAR-929 Followup: Payload-Zugriff fuer den Stripe-Reconcile-Cron.
 *
 * Der Webhook (src/app/api/stripe/webhook/route.ts) speichert in
 * stripe_events.payload das FLACHE event.data.object (PI-/Charge-Objekt,
 * PI-Id top-level) — NICHT den Stripe-Event-Envelope. Der Reconcile-Cron las
 * bisher nur den Envelope-Pfad payload.data.object.* und fand daher nie eine
 * PI-Id (Dauer-Drift "event_ohne_abrechnung", Report blind fuer echte Drifts).
 *
 * Diese Helper toleriert beide Formate: Envelope-Pfad zuerst (falls der Writer
 * kuenftig das volle Event speichert), sonst flach. Bewusst KEIN Fallback von
 * "Envelope ohne data.object" auf die Root — dort waere id die Event-Id
 * (evt_...), nicht die PI-Id; der pi_-Prefix-Guard sichert das zusaetzlich ab.
 */

type JsonRecord = Record<string, unknown>

function asRecord(v: unknown): JsonRecord | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as JsonRecord) : null
}

/** Envelope -> data.object; flaches Writer-Format -> payload selbst. */
function resolveEventObject(payload: unknown): JsonRecord | null {
  const root = asRecord(payload)
  if (!root) return null
  const data = asRecord(root.data)
  if (data) return asRecord(data.object)
  return root
}

/**
 * PI-Id aus einem gespeicherten stripe_events.payload ziehen.
 * payment_intent.succeeded -> id des (PI-)Objekts; charge.succeeded -> dessen
 * payment_intent-Feld. Liefert nur pi_-prefixte Strings (sonst null).
 */
export function extractPaymentIntentId(eventType: string, payload: unknown): string | null {
  const obj = resolveEventObject(payload)
  if (!obj) return null
  const raw = eventType === 'payment_intent.succeeded' ? obj.id : obj.payment_intent
  return typeof raw === 'string' && raw.startsWith('pi_') ? raw : null
}

/**
 * Testmode-Event (livemode=false)? Nur bei EXPLIZITEM false true — fehlt das
 * Feld, wird das Event als live behandelt (lieber melden als verschlucken).
 */
export function isTestmodeEvent(payload: unknown): boolean {
  const root = asRecord(payload)
  if (!root) return false
  if (root.livemode === false) return true
  return resolveEventObject(payload)?.livemode === false
}

/**
 * PostgREST-or-Ausdruck, der ein Success-Event zu einer PI-Id in BEIDEN
 * Payload-Formaten findet (flach + Envelope, PI-Objekt + Charge-Objekt).
 * Analog zum bezugOrExpr-Muster in @/lib/termine/bezug-filter.
 * null bei unerwartetem Id-Format (PostgREST-Syntaxzeichen wie , ( ) —
 * Stripe-Ids sind [A-Za-z0-9_]).
 */
export function buildPiMatchOrExpr(piId: string): string | null {
  if (!/^[A-Za-z0-9_]+$/.test(piId)) return null
  return [
    `payload->>id.eq.${piId}`,
    `payload->>payment_intent.eq.${piId}`,
    `payload->data->object->>id.eq.${piId}`,
    `payload->data->object->>payment_intent.eq.${piId}`,
  ].join(',')
}
