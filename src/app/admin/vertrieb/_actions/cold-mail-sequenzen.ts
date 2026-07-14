'use server'
// Cold-Mailer S4: Vorlagen + Sequenzen + Steps + Enrollment.
// Die Sequenz-LOGIK liegt in der getesteten Engine (src/lib/cold-mail/advance.ts);
// hier nur die duenne DB-/Guard-Schale drumherum.
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { generiereColdMailVorlage } from '@/lib/cold-mail/compose-ki'
import { ersteFaelligkeit, type ColdMailStep } from '@/lib/cold-mail/advance'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type Vorlage = {
  id: string
  name: string
  rolle: string | null
  betreff: string
  body_html: string
}

export type SequenzMitSteps = {
  id: string
  rolle: string
  name: string
  aktiv: boolean
  auto_enroll: boolean
  steps: ColdMailStep[]
}

// ─── Vorlagen ──────────────────────────────────────────────────────────────

export async function ladeVorlagen(): Promise<Result<Vorlage[]>> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const { data, error } = await guard.supabase
    .from('cold_mail_vorlagen')
    .select('id, name, rolle, betreff, body_html')
    .order('erstellt_am', { ascending: false })
  if (error) return { ok: false, error: 'Vorlagen konnten nicht geladen werden.' }
  return { ok: true, data: (data ?? []) as Vorlage[] }
}

/** KI-Entwurf — wird NICHT gespeichert; der Admin editiert und speichert bewusst. */
export async function generiereVorlage(input: {
  rolle: 'makler' | 'werkstatt' | 'sachverstaendiger'
  ziel: string
  tonalitaet?: string
}): Promise<Result<{ betreff: string; body_html: string }>> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  if (!input.ziel.trim()) return { ok: false, error: 'Bitte ein Ziel angeben (z.B. „Termin vereinbaren").' }
  const res = await generiereColdMailVorlage(input)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, data: { betreff: res.betreff, body_html: res.body_html } }
}

export async function speichereVorlage(input: {
  id?: string
  name: string
  rolle: string | null
  betreff: string
  body_html: string
}): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  if (!input.name.trim() || !input.betreff.trim() || !input.body_html.trim()) {
    return { ok: false, error: 'Name, Betreff und Text dürfen nicht leer sein.' }
  }
  const zeile = {
    name: input.name.trim(),
    rolle: input.rolle,
    betreff: input.betreff.trim(),
    body_html: input.body_html,
    erstellt_von: guard.user.id,
    aktualisiert_am: new Date().toISOString(),
  }
  const { error } = input.id
    ? await guard.supabase.from('cold_mail_vorlagen').update(zeile).eq('id', input.id)
    : await guard.supabase.from('cold_mail_vorlagen').insert(zeile)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/vertrieb')
  return { ok: true }
}

// ─── Sequenzen + Steps ─────────────────────────────────────────────────────

export async function ladeSequenzen(): Promise<Result<SequenzMitSteps[]>> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }

  const { data: seqs, error } = await guard.supabase
    .from('cold_mail_sequenzen')
    .select('id, rolle, name, aktiv, auto_enroll')
    .order('erstellt_am', { ascending: false })
  if (error) return { ok: false, error: 'Sequenzen konnten nicht geladen werden.' }

  const { data: steps, error: sErr } = await guard.supabase
    .from('cold_mail_steps')
    .select('id, sequenz_id, position, vorlage_id, delay_tage, bedingung')
    .order('position', { ascending: true })
  if (sErr) return { ok: false, error: 'Steps konnten nicht geladen werden.' }

  const data = (seqs ?? []).map((s) => ({
    ...s,
    steps: (steps ?? [])
      .filter((st) => st.sequenz_id === s.id)
      .map((st) => ({
        id: st.id,
        position: st.position,
        vorlage_id: st.vorlage_id,
        delay_tage: st.delay_tage,
        bedingung: st.bedingung as ColdMailStep['bedingung'],
      })),
  })) as SequenzMitSteps[]
  return { ok: true, data }
}

export async function speichereSequenz(input: {
  id?: string
  rolle: string
  name: string
  aktiv: boolean
  auto_enroll: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  if (!input.name.trim()) return { ok: false, error: 'Bitte einen Namen angeben.' }

  const zeile = { rolle: input.rolle, name: input.name.trim(), aktiv: input.aktiv, auto_enroll: input.auto_enroll }
  const { error } = input.id
    ? await guard.supabase.from('cold_mail_sequenzen').update(zeile).eq('id', input.id)
    : await guard.supabase.from('cold_mail_sequenzen').insert(zeile)
  if (error) {
    // Partial-unique: hoechstens EINE aktive Auto-Enroll-Sequenz je Rolle (DDL-Constraint).
    if (error.message.includes('cms_seq_one_autoenroll_per_rolle')) {
      return {
        ok: false,
        error: 'Für diese Rolle gibt es bereits eine aktive Sequenz mit Auto-Aufnahme. Bitte zuerst dort die Auto-Aufnahme abschalten.',
      }
    }
    return { ok: false, error: error.message }
  }
  revalidatePath('/admin/vertrieb')
  return { ok: true }
}

export async function speichereStep(input: {
  id?: string
  sequenz_id: string
  position: number
  vorlage_id: string
  delay_tage: number
  bedingung: ColdMailStep['bedingung']
}): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  if (input.delay_tage < 0) return { ok: false, error: 'Die Wartezeit darf nicht negativ sein.' }

  const zeile = {
    sequenz_id: input.sequenz_id,
    position: input.position,
    vorlage_id: input.vorlage_id,
    delay_tage: Math.floor(input.delay_tage),
    bedingung: input.bedingung,
  }
  const { error } = input.id
    ? await guard.supabase.from('cold_mail_steps').update(zeile).eq('id', input.id)
    : await guard.supabase.from('cold_mail_steps').insert(zeile)
  if (error) {
    if (error.message.includes('cold_mail_steps_sequenz_id_position_key')) {
      return { ok: false, error: `Position ${input.position} ist in dieser Sequenz schon vergeben.` }
    }
    return { ok: false, error: error.message }
  }
  revalidatePath('/admin/vertrieb')
  return { ok: true }
}

export async function loescheStep(id: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  const { error } = await guard.supabase.from('cold_mail_steps').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/vertrieb')
  return { ok: true }
}

// ─── Enrollment ────────────────────────────────────────────────────────────

/**
 * Nimmt Leads in eine Sequenz auf. Ueberspringt (mit Report) alles, was nicht
 * anschreibbar ist: keine Email, abgemeldet, oder schon in dieser Sequenz.
 */
export async function enrolleLeads(
  leadIds: string[],
  sequenzId: string,
): Promise<
  { ok: true; aufgenommen: number; uebersprungen: number } | { ok: false; error: string }
> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }
  if (leadIds.length === 0) return { ok: false, error: 'Keine Leads ausgewählt.' }

  const { data: steps, error: stErr } = await guard.supabase
    .from('cold_mail_steps')
    .select('id, position, vorlage_id, delay_tage, bedingung')
    .eq('sequenz_id', sequenzId)
    .order('position', { ascending: true })
  if (stErr) return { ok: false, error: 'Steps konnten nicht geladen werden.' }
  if (!steps || steps.length === 0) {
    return { ok: false, error: 'Diese Sequenz hat noch keine Schritte — es gäbe nichts zu senden.' }
  }

  const { data: leads, error: lErr } = await guard.supabase
    .from('partner_leads')
    .select('id, email, ansprechpartner_email')
    .in('id', leadIds)
  if (lErr) return { ok: false, error: 'Leads konnten nicht geladen werden.' }

  // Abgemeldete Adressen NIE aufnehmen (sonst wuerde der Advancer sie anschreiben).
  const { data: supp } = await guard.supabase.from('cold_mail_suppression').select('email')
  const gesperrt = new Set((supp ?? []).map((s) => s.email))

  const faellig = ersteFaelligkeit(steps as ColdMailStep[], new Date())
  const zeilen = (leads ?? [])
    .filter((l) => {
      const mail = (l.ansprechpartner_email?.trim() || l.email?.trim() || '').toLowerCase()
      return mail.length > 0 && !gesperrt.has(mail)
    })
    .map((l) => ({
      lead_id: l.id,
      sequenz_id: sequenzId,
      aktueller_step: 0,
      status: 'aktiv',
      next_send_at: faellig?.toISOString() ?? null,
    }))

  if (zeilen.length === 0) {
    return { ok: false, error: 'Keiner der Leads ist anschreibbar (keine E-Mail oder abgemeldet).' }
  }

  // Doppel-Aufnahme faengt der UNIQUE(lead_id, sequenz_id) ab -> ignoreDuplicates.
  const { data: angelegt, error } = await guard.supabase
    .from('cold_mail_enrollments')
    .upsert(zeilen, { onConflict: 'lead_id,sequenz_id', ignoreDuplicates: true })
    .select('id')
  if (error) return { ok: false, error: error.message }

  const aufgenommen = angelegt?.length ?? 0
  revalidatePath('/admin/vertrieb')
  return { ok: true, aufgenommen, uebersprungen: leadIds.length - aufgenommen }
}
