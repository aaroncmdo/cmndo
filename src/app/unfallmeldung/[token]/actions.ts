'use server'

// Slice 2c — der Gegner bestaetigt per SMS-Magic-Link seine Angaben. Das ist der Trigger
// fuer die Unfallmeldung an seine Haftpflicht (Fraud-Gate: nur wer die Nummer wirklich
// besitzt, kann bestaetigen).
import { revalidatePath } from 'next/cache'
import { bestaetigeInvite, resolveInviteToken } from '@/lib/airdrop/gegner-invite'
import { sendeUnfallmeldungAnGegnerVs } from '@/lib/vs-meldung/sende-unfallmeldung'

export async function bestaetigeGegnerMeldung(token: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolveInviteToken(token)
  if (!ctx) return { ok: false, error: 'Dieser Link ist ungültig.' }
  if (ctx.abgelaufen) {
    return { ok: false, error: 'Dieser Link ist abgelaufen. Bitte wenden Sie sich an uns.' }
  }
  if (ctx.bereitsBestaetigt) return { ok: true } // idempotent: schon bestaetigt = Erfolg

  const { gewonnen } = await bestaetigeInvite(ctx.inviteId)
  // Verloren = ein paralleler Aufruf (Doppelklick) war schneller und meldet bereits.
  // Fuer den Nutzer ist das ebenfalls Erfolg — aber wir senden NICHT ein zweites Mal.
  if (!gewonnen) return { ok: true }

  // Nur der CAS-Gewinner meldet. Fail-soft: der Gegner hat seinen Teil getan; scheitert der
  // Versand, faengt ihn der Dead-Letter + Dispatch-Task ab (in sendeUnfallmeldung gekapselt).
  try {
    await sendeUnfallmeldungAnGegnerVs(ctx.claimId)
  } catch (err) {
    console.error('[unfallmeldung] VS-Meldung nach Bestaetigung fehlgeschlagen:', err)
  }

  // vs_korrespondenz-Zeile / evtl. Dispatch-Task sollen ohne Verzoegerung in den
  // internen Portalen auftauchen.
  revalidatePath('/admin/faelle')
  revalidatePath('/dispatch/dashboard')

  return { ok: true }
}
