import { createAdminClient } from '@/lib/supabase/admin'
import { markRechnungVersendet } from './create-onboarding-rechnung'

/**
 * AAR-401: Versendet Onboarding-Rechnung + KV + NB als 3 PDF-Anhänge.
 *
 * Lädt bereits generierte Vertrags-PDFs (KV + NB) aus `vertraege` Storage,
 * hängt die Rechnung dran und sendet per Google/Resend mit Attachment-Support.
 * Non-critical: try/catch, Status-Insert bleibt atomar.
 */
export async function sendOnboardingRechnungEmail({
  rechnung_id,
  rechnungs_nr,
  rechnungs_pdf,
  empfaenger_email,
  vorname,
  typ,
  orgName,
  paket,
  brutto_cent,
  sv_id,
  organisation_id,
  portalUrl,
}: {
  rechnung_id: string
  rechnungs_nr: string
  rechnungs_pdf: Buffer
  empfaenger_email: string
  vorname: string | null
  typ: 'solo' | 'buero' | 'akademie'
  orgName?: string | null
  paket?: string | null
  brutto_cent: number
  sv_id?: string | null
  organisation_id?: string | null
  portalUrl?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const db = createAdminClient()

  try {
    // 1. Vertrags-PDFs (KV + NB) aus Storage laden — beide in vertraege-Bucket
    const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [
      {
        filename: `Rechnung-${rechnungs_nr}.pdf`,
        content: rechnungs_pdf,
        contentType: 'application/pdf',
      },
    ]

    // NB/KV-Unterschriften aus vertraege_unterzeichnet — je nach Kontext sv_id oder org
    const query = db
      .from('vertraege_unterzeichnet')
      .select('id, vorlage_typ, pdf_storage_path, vorlage_version')
      .not('pdf_storage_path', 'is', null)
    if (sv_id) {
      query.eq('sv_id', sv_id)
    } else if (organisation_id) {
      query.eq('organisation_id', organisation_id)
    }
    const { data: vertraege } = await query

    for (const v of vertraege ?? []) {
      if (!v.pdf_storage_path) continue
      const { data: file } = await db.storage.from('vertraege').download(v.pdf_storage_path as string)
      if (!file) continue
      const buf = Buffer.from(await file.arrayBuffer())
      const vTyp = String(v.vorlage_typ ?? 'vertrag')
      const version = v.vorlage_version ? `-v${v.vorlage_version}` : ''
      const label = vTyp.startsWith('nutzungsbedingungen')
        ? `Nutzungsbedingungen${version}.pdf`
        : vTyp.startsWith('kooperationsvertrag')
          ? `Kooperationsvertrag${version}.pdf`
          : `${vTyp}${version}.pdf`
      attachments.push({
        filename: label,
        content: buf,
        contentType: 'application/pdf',
      })
      // Markiere Vertrag als final-PDF-generiert (falls noch nicht gesetzt)
      await db
        .from('vertraege_unterzeichnet')
        .update({ pdf_generiert_am: new Date().toISOString() })
        .eq('id', v.id as string)
        .is('pdf_generiert_am', null)
    }

    // 2. Email-Template rendern
    const { render } = await import('@react-email/render')
    const { SvOnboardingRechnungEmail, subject: rechnungSubject } = await import(
      '@/lib/email/google/templates/SvOnboardingRechnung'
    )
    const bruttoFormatted =
      new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(brutto_cent / 100) + ' \u20AC'

    const props = {
      vorname,
      typ,
      orgName: orgName ?? null,
      rechnungs_nr,
      rechnungs_datum: new Date().toLocaleDateString('de-DE'),
      paket: paket ?? null,
      brutto: bruttoFormatted,
      portalUrl: portalUrl ?? null,
    }
    const html = await render(SvOnboardingRechnungEmail(props))

    // 3. Senden
    const { sendEmail } = await import('@/lib/email/google/client')
    await sendEmail({
      to: empfaenger_email,
      subject: rechnungSubject(props),
      html,
      fallId: null,
      empfaengerTyp: 'sv',
      template: 'sv_onboarding_rechnung',
      attachments,
    })

    // 4. versendet_am
    await markRechnungVersendet(rechnung_id)

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unbekannter Fehler beim Rechnungsversand',
    }
  }
}
