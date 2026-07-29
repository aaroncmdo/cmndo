// Kalt-Einladung: create+send + redeem->edge. KEIN 'use server' — importierbar von Action UND Registrier-Flows.
// Reuse: invite-email.ts (HTML) + sendEmail (Versand); anlegePartnerKern + /{rolle}/registrieren liefern den Account (Wiring T6).
import { createAdminClient } from '@/lib/supabase/admin'
import { einladungEmailHtml } from '@/lib/auth/invite-email'
import { sendEmail } from '@/lib/email/google/client'
import {
  generateEinladungToken,
  hashEinladungToken,
  istEinloesbar,
  ROLLE_TO_REGISTRIER_PFAD,
  type EinladungZielRolle,
} from './einladung-core'

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function erstelleNetzwerkEinladung(
  einladerProfilId: string,
  email: string,
  zielRolle: EinladungZielRolle,
): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const mail = email.trim().toLowerCase()
  if (!EMAIL_RX.test(mail)) return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }
  const admin = createAdminClient()
  // Kein Doppel-Account: existiert bereits ein Profil zur Mail -> das ist eine Freund-Anfrage, keine Kalt-Einladung.
  const { data: existing } = await admin.from('profiles').select('id').eq('email', mail).maybeSingle()
  if (existing)
    return { ok: false, error: 'Zu dieser E-Mail existiert bereits ein Konto — nutze „Vernetzen" im Verzeichnis.' }

  const { token, tokenHash, lookupPrefix } = generateEinladungToken()
  const { error } = await admin.from('netzwerk_einladungen').insert({
    einlader_id: einladerProfilId,
    email: mail,
    ziel_rolle: zielRolle,
    token_hash: tokenHash,
    token_lookup_prefix: lookupPrefix,
  })
  if (error) return { ok: false, error: 'Einladung konnte nicht erstellt werden.' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  const link = `${appUrl}${ROLLE_TO_REGISTRIER_PFAD[zielRolle]}?einladung=${token}`
  const { data: einlader } = await admin
    .from('profiles')
    .select('vorname, nachname, firma, anzeigename')
    .eq('id', einladerProfilId)
    .maybeSingle()
  const einladerName =
    (einlader?.anzeigename as string | null) ||
    [einlader?.vorname, einlader?.nachname].filter(Boolean).join(' ').trim() ||
    (einlader?.firma as string | null) ||
    'Ein Partner'
  try {
    await sendEmail({
      to: mail,
      subject: `${einladerName} lädt dich ins Claimondo-Netzwerk ein`,
      html: einladungEmailHtml({
        vorname: 'zusammen',
        email: mail,
        appUrl,
        magicLink: link,
        introHtml: `<p><strong>${einladerName}</strong> möchte sich mit dir im Claimondo-Netzwerk verbinden. Registriere dich kostenlos über den Button — ihr seid danach automatisch vernetzt.</p>`,
      }),
    })
  } catch (e) {
    console.error('[erstelleNetzwerkEinladung] email', e) // non-fatal: Einladung steht, Link ist da
  }
  return { ok: true, link }
}

/** Redemption: aus /{rolle}/registrieren nach anlegePartnerKern aufgerufen. Best-effort — ein Fehler bricht die Registrierung NIE. */
export async function loeseNetzwerkEinladungEin(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
  neuesProfilId: string,
): Promise<{ ok: boolean }> {
  try {
    const { data: row } = await admin
      .from('netzwerk_einladungen')
      .select('id, einlader_id, status, ablauf_am')
      .eq('token_hash', hashEinladungToken(token))
      .maybeSingle()
    if (!row || !istEinloesbar(row as { status: string; ablauf_am: string }, new Date())) return { ok: false }
    // Auto-Kante: die Einladung IST die Anfrage, die Registrierung die Annahme -> direkt 'angenommen'.
    const { error: edgeErr } = await admin.from('netzwerk_verbindungen').insert({
      anfrager_id: row.einlader_id,
      empfaenger_id: neuesProfilId,
      status: 'angenommen',
      beantwortet_am: new Date().toISOString(),
    })
    if (edgeErr && edgeErr.code !== '23505') return { ok: false } // 23505 = Kante existiert schon -> Einladung trotzdem schliessen
    await admin
      .from('netzwerk_einladungen')
      .update({ status: 'eingeloest', eingeloest_am: new Date().toISOString(), eingeloest_profil_id: neuesProfilId })
      .eq('id', row.id)
    return { ok: true }
  } catch (e) {
    console.error('[loeseNetzwerkEinladungEin]', e)
    return { ok: false }
  }
}
