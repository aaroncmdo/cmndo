import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ResumeHandler } from './ResumeHandler'

// AAR-477 C11: Resume-Route — Magic-Link aus Reminder-Emails.
//
// Token wird in leads.reminder_token nachgeschlagen (Admin-Client, kein
// Cookie/Login nötig — der Token selbst ist das Auth-Secret). Bei
// disqualifizierten oder nicht gefundenen Leads → redirect /.
// Ansonsten rendert ResumeHandler (Client), setzt Flow-Store und leitet
// auf den nächsten offenen Schritt weiter.

type ResumeProps = {
  params: Promise<{ token: string }>
}

export default async function ResumePage({ params }: ResumeProps) {
  const { token } = await params
  if (!token) redirect('/')

  const admin = createAdminClient()
  const { data: lead, error } = await admin
    .from('leads')
    .select(
      'id, status, disqualifiziert, gegner_name, fin, hsn, tsn, konvertiert_zu_fall_id',
    )
    .eq('reminder_token', token)
    .maybeSingle()

  if (error || !lead) redirect('/')
  if (lead.disqualifiziert) redirect('/')
  if (lead.konvertiert_zu_fall_id) {
    // Lead wurde schon in Fall umgewandelt — Resume macht keinen Sinn, der
    // User hat ein Portal-Account und kommt über /kunde rein.
    redirect('/kunde')
  }

  // Ableitung des nächsten offenen Schritts aus Lead-Daten, weil die
  // sessionStorage-Flags (gegnerDatenErfasst/zb1Erfasst) beim Reminder-Klick
  // auf einem anderen Device/Browser nicht mehr da sind.
  const hasZb1 = !!lead.fin && !!lead.hsn && !!lead.tsn
  const hasGegner = !!lead.gegner_name
  const nextStep: '/schaden-melden/schritt-2' | '/schaden-melden/schritt-2/gegner' | '/schaden-melden/schritt-3' | '/schaden-melden/schritt-4' = hasZb1
    ? '/schaden-melden/schritt-4'
    : hasGegner
      ? '/schaden-melden/schritt-3'
      : '/schaden-melden/schritt-2'

  return (
    <ResumeHandler
      leadId={lead.id as string}
      gegnerDatenErfasst={hasGegner}
      zb1Erfasst={hasZb1}
      nextStep={nextStep}
    />
  )
}
