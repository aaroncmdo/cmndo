// P5 T5: Mintet die §14-Rechnung fuer die einmalige Netzwerkpartner-Einrichtungsgebuehr
// ueber den DB-getriebenen Config-Pfad (createOnboardingRechnung -> createAbrechnung ->
// getAktuelleRechnungsKonfig; honoriert rechnungssteller). NIE ein Legacy-PDF-Generator (K14).
// Betrag = netzwerk_setup_cent aus Config. Idempotenz erbt der bestehende Schutz von
// createOnboardingRechnung. Scope-Notiz: NUR die Setup-Fee bekommt eine CM-ONB-Nummer;
// die wiederkehrenden Monatsrechnungen dokumentiert Stripe nativ (Customer-Portal, T9) —
// monatliche §14-DB-PDFs = bewusst deferred (Aaron-Entscheid, Spec §7.1).

import { createAdminClient } from '@/lib/supabase/admin'
import { ladeNetzwerkPreise } from '@/lib/billing/netzwerk-preise'
import { createOnboardingRechnung } from '@/lib/billing/create-onboarding-rechnung'

export async function mintNetzwerkEinrichtungsRechnung(svId: string): Promise<{ ok: boolean; error?: string }> {
  const preise = await ladeNetzwerkPreise()
  if (preise.setupCent <= 0) return { ok: true } // Waiver: keine Einrichtungsgebuehr

  const res = await createOnboardingRechnung({
    typ: 'netzwerk_einrichtung',
    sv_id: svId,
    netto_euro: preise.setupCent / 100,
    paket: null,
    kontingent: 0,
    bezahlt_am: new Date(),
  })
  if (!res.success) return { ok: false, error: res.error }

  // Beleg-Mail: bestehendes send-onboarding-rechnung-email reusen (try/catch -> non-fatal).
  // typ:'solo' ist nur die Mail-Huelle — der Beleg-Inhalt kommt aus dem PDF.
  try {
    const db = createAdminClient()
    const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', svId).single()
    const { data: p } = sv?.profile_id
      ? await db.from('profiles').select('email, vorname').eq('id', sv.profile_id).single()
      : { data: null }
    if (p?.email) {
      const { sendOnboardingRechnungEmail } = await import('@/lib/billing/send-onboarding-rechnung-email')
      await sendOnboardingRechnungEmail({
        rechnung_id: res.rechnung_id,
        rechnungs_nr: res.rechnungs_nr,
        rechnungs_pdf: res.pdf_buffer,
        empfaenger_email: p.email,
        vorname: p.vorname ?? null,
        typ: 'solo',
        paket: null,
        brutto_cent: res.brutto_cent,
        sv_id: svId,
      })
    }
  } catch (err) {
    console.error('[abo-rechnung] mail', err)
  }
  return { ok: true }
}
