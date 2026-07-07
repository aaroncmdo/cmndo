// Testbare DB-Mutation fuer das Stripe-Webhook-Event payment_intent.payment_failed,
// wenn der PI zu einer Abrechnung gehoert (metadata.abrechnung_id). Setzt die
// Abrechnung idempotent auf 'fehlgeschlagen'. Der Admin-Alert (IO) bleibt im Route-Handler.

type PiLike = {
  metadata?: Record<string, string> | null
  amount?: number | null
  amount_received?: number | null
  last_payment_error?: { message?: string } | null
}
type DbLike = { from: (t: string) => any }

export async function handleEinzugPaymentFailed(
  db: DbLike,
  pi: PiLike,
): Promise<{ acted: boolean; abrId?: string; grund?: string; abrechnungsNr?: string; betragBrutto?: number }> {
  const meta = (pi.metadata ?? {}) as Record<string, string>
  const abrId = meta.abrechnung_id ?? null
  if (!abrId) return { acted: false }
  const grund = pi.last_payment_error?.message ?? 'Lastschrift fehlgeschlagen'
  const { error } = await db.from('abrechnungen').update({
    status: 'fehlgeschlagen',
    einzug_fehler: grund,
    updated_at: new Date().toISOString(),
  }).eq('id', abrId).neq('status', 'bezahlt')
  if (error) throw new Error(`[einzug-webhook] abrechnungen update failed for ${abrId}: ${error.message ?? 'unknown'}`)
  return {
    acted: true,
    abrId,
    grund,
    abrechnungsNr: meta.abrechnungs_nr,
    betragBrutto: Number(pi.amount ?? 0) / 100,
  }
}

export async function handleEinzugPaymentSucceeded(
  db: DbLike,
  pi: PiLike,
): Promise<{ acted: boolean; abrId?: string; betrag?: number }> {
  const meta = (pi.metadata ?? {}) as Record<string, string>
  const abrId = meta.abrechnung_id ?? null
  if (!abrId) return { acted: false }
  const nowIso = new Date().toISOString()
  const betrag = Number(pi.amount_received ?? pi.amount ?? 0) / 100
  const { error } = await db.from('abrechnungen').update({
    bezahlt_am: nowIso,
    bezahlt_betrag: betrag,
    einzug_fehler: null,
    status: 'bezahlt',
    updated_at: nowIso,
  }).eq('id', abrId).neq('status', 'bezahlt')
  if (error) throw new Error(`[einzug-webhook] abrechnungen bezahlt update failed for ${abrId}: ${error.message ?? 'unknown'}`)
  return { acted: true, abrId, betrag }
}
