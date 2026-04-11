'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { createLinkedTask } from '@/lib/tasks/create-task'

// ─── Phase A: VS-Reaktion erfassen ──────────────────────────────────────────

export async function vsReguliertVoll(fallId: string, betrag: number) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await supabase.from('faelle').update({
    vs_reaktion_typ: 'voll_reguliert',
    vs_reaktion_am: new Date().toISOString(),
    regulierung_betrag: betrag,
  }).eq('id', fallId)

  await transitionFallStatus(fallId, 'regulierung-laeuft', { user_id: user.id })

  // T11: Regulierung angekuendigt
  sendFallCommunication(fallId, 'regulierung_angekuendigt').catch(() => {})

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: 'VS reguliert vollständig',
    beschreibung: `Regulierungsbetrag: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(betrag)}`,
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function vsKuerzt(fallId: string, originalBetrag: number, anerkanntBetrag: number) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const kuerzung = originalBetrag - anerkanntBetrag

  await supabase.from('faelle').update({
    vs_reaktion_typ: 'gekuerzt',
    vs_reaktion_am: new Date().toISOString(),
    regulierung_betrag: anerkanntBetrag,
    kuerzungs_betrag: kuerzung,
    ruege_counter: 1,
  }).eq('id', fallId)

  await transitionFallStatus(fallId, 'regulierung-laeuft', { user_id: user.id })

  // T19: Kuerzung eingetragen
  sendFallCommunication(fallId, 'kuerzung_eingetragen').catch(() => {})

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: 'VS kürzt Regulierung',
    beschreibung: `Anerkannt: ${fmt(anerkanntBetrag)}, Kürzung: ${fmt(kuerzung)}. Rüge wird vorbereitet.`,
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function vsLehntAb(fallId: string, grund: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await transitionFallStatus(fallId, 'vs-abgelehnt', { grund, user_id: user.id })

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: 'VS lehnt Regulierung ab',
    beschreibung: `Ablehnungsgrund: ${grund}`,
    erstellt_von: user.id,
  })

  // KFZ-205: Kunden-Anruf-Task erstellen
  const { data: fallInfo } = await supabase.from('faelle').select('fall_nummer, kundenbetreuer_id').eq('id', fallId).single()
  await createLinkedTask({
    fall_id: fallId,
    titel: `Kunden anrufen — VS-Ablehnung: Fall ${fallInfo?.fall_nummer ?? fallId.slice(0, 8)}`,
    typ: 'kundenbetreuer',
    prioritaet: 'dringend',
    faellig_am: new Date(),
    entity_type: 'case',
    entity_id: fallId,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function vsBrauchtMehrZeit(fallId: string, fristBis: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await supabase.from('faelle').update({
    vs_reaktion_typ: 'mehr_zeit',
    vs_reaktion_am: new Date().toISOString(),
    vs_frist_bis: fristBis,
  }).eq('id', fallId)

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'VS benötigt mehr Zeit',
    beschreibung: `Neue Frist: ${new Date(fristBis).toLocaleDateString('de-DE')}`,
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function vsWillNachbesichtigung(fallId: string, details: string, konfrontation?: boolean) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await supabase.from('faelle').update({
    vs_reaktion_typ: 'nachbesichtigung',
    vs_reaktion_am: new Date().toISOString(),
    nachbesichtigung_status: 'angefordert',
    nachbesichtigung_angefordert_am: new Date().toISOString(),
    nachbesichtigung_konfrontation: konfrontation ?? false,
  }).eq('id', fallId)

  // KFZ-210: Status → nachbesichtigung-laeuft (Soft-Blocker)
  try {
    await transitionFallStatus(fallId, 'nachbesichtigung-laeuft', { user_id: user.id })
  } catch {
    // Transition evtl. nicht erlaubt
  }

  const { data: fallInfo } = await supabase.from('faelle').select('fall_nummer').eq('id', fallId).single()

  await createLinkedTask({
    fall_id: fallId,
    titel: `Nachbesichtigung organisieren: Fall ${fallInfo?.fall_nummer ?? fallId.slice(0, 8)}`,
    typ: 'dispatch',
    prioritaet: 'dringend',
    faellig_am: new Date(),
    entity_type: 'case',
    entity_id: fallId,
  })

  // KFZ-210: Konfrontation → SV-Task
  if (konfrontation) {
    const { data: fallData } = await supabase.from('faelle').select('sv_id').eq('id', fallId).single()
    if (fallData?.sv_id) {
      await createLinkedTask({
        fall_id: fallId,
        titel: `Konfrontationstermin: Fall ${fallInfo?.fall_nummer ?? fallId.slice(0, 8)} — SV muss anwesend sein`,
        typ: 'gutachter',
        prioritaet: 'dringend',
        faellig_am: new Date(),
        entity_type: 'case',
        entity_id: fallId,
      })
    }
  }

  // KFZ-210: WA an Kunden
  sendFallCommunication(fallId, 'nachbesichtigung_angefordert').catch(() => {})

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: `VS fordert Nachbesichtigung${konfrontation ? ' (Konfrontation)' : ''}`,
    beschreibung: details || 'Versicherung hat eine erneute Besichtigung angefordert.',
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

// ─── Phase A: Rüge-Sub-Flow ────────────────────────────────────────────────

export async function ruegeAkzeptiert(fallId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: 'Nachforderung von VS akzeptiert',
    beschreibung: 'Versicherung hat die Nachforderung (Rüge) akzeptiert.',
    erstellt_von: user.id,
  })

  // T11: Regulierung angekuendigt
  sendFallCommunication(fallId, 'regulierung_angekuendigt').catch(() => {})

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function ruegeAbgelehnt(fallId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  const { data: fall } = await supabase.from('faelle').select('ruege_counter, sv_id, fall_nummer').eq('id', fallId).single()
  const counter = ((fall?.ruege_counter as number) ?? 0) + 1

  await supabase.from('faelle').update({
    ruege_counter: counter,
    ruege_gesendet_am: new Date().toISOString(),
    // KFZ-205: Bei 1. Ablehnung → Tech. Stellungnahme anfordern
    ...(counter === 1 && { technische_stellungnahme_status: 'beauftragt', technische_stellungnahme_beauftragt_am: new Date().toISOString() }),
  }).eq('id', fallId)

  // KFZ-205: SV-Task "Technische Stellungnahme" bei erster Rüge-Ablehnung
  if (counter === 1 && fall?.sv_id) {
    const { data: svProf } = await supabase.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
    if (svProf?.profile_id) {
      const slaDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000) // 72h SLA
      await createLinkedTask({
        fall_id: fallId,
        titel: `Technische Stellungnahme verfassen: Fall ${fall.fall_nummer ?? fallId.slice(0, 8)}`,
        typ: 'gutachter',
        prioritaet: 'dringend',
        faellig_am: slaDeadline,
        entity_type: 'case',
        entity_id: fallId,
      })
    }
  }

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: counter === 1
      ? 'Rüge abgelehnt — Technische Stellungnahme angefordert'
      : `Rüge ${counter}x abgelehnt`,
    beschreibung: counter === 1
      ? 'SV erstellt Technische Stellungnahme. KB prüft, dann geht Rüge an Kanzlei.'
      : `Versicherung hat die ${counter}. Nachforderung abgelehnt.`,
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

// KFZ-205: KB gibt Technische Stellungnahme frei → Rüge geht an Kanzlei
export async function techStellungnahmeFreigeben(fallId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await supabase.from('faelle').update({
    technische_stellungnahme_status: 'freigegeben',
    technische_stellungnahme_freigabe_am: new Date().toISOString(),
  }).eq('id', fallId)

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Technische Stellungnahme freigegeben',
    beschreibung: 'KB hat Plausibilitäts-Check bestanden. Rüge geht an Kanzlei.',
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

// KFZ-205: AS-Versand manuell eintragen
export async function asVersandManuell(fallId: string, datum: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await supabase.from('faelle').update({
    anschlussschreiben_am: datum || new Date().toISOString(),
  }).eq('id', fallId)

  await transitionFallStatus(fallId, 'anschlussschreiben', { user_id: user.id })

  sendFallCommunication(fallId, 'as_gesendet').catch(() => {})

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: 'Anschlussschreiben manuell eingetragen',
    beschreibung: `AS-Versand am ${new Date(datum || Date.now()).toLocaleDateString('de-DE')}`,
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

// ─── Phase B: Zahlungseingang ───────────────────────────────────────────────

export async function zahlungEingegangen(fallId: string, betrag: number, datum: string, zahlungsweg?: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await supabase.from('faelle').update({
    zahlung_betrag: betrag,
    zahlung_eingegangen_am: datum || new Date().toISOString(),
    ...(zahlungsweg && { zahlungsweg }),
  }).eq('id', fallId)

  await transitionFallStatus(fallId, 'zahlung-eingegangen', { betrag, user_id: user.id })

  // T12: Zahlung eingegangen
  sendFallCommunication(fallId, 'zahlung_eingegangen').catch(() => {})

  // Task: Schlussabrechnung erstellen
  const { data: fallInfo } = await supabase.from('faelle').select('fall_nummer, kundenbetreuer_id').eq('id', fallId).single()
  await supabase.from('tasks').insert({
    fall_id: fallId,
    typ: 'abrechnung',
    titel: `Schlussabrechnung erstellen: Fall ${fallInfo?.fall_nummer ?? fallId.slice(0, 8)}`,
    beschreibung: `Zahlungseingang ${fmt(betrag)} am ${new Date(datum || Date.now()).toLocaleDateString('de-DE')}. Bitte Schlussabrechnung erstellen und versenden.`,
    status: 'offen',
    prioritaet: 'normal',
    zugewiesen_an: fallInfo?.kundenbetreuer_id ?? null,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function schlussabrechnungErstellt(fallId: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await supabase.from('faelle').update({
    schlussabrechnung_am: new Date().toISOString(),
  }).eq('id', fallId)

  await transitionFallStatus(fallId, 'abgeschlossen', { user_id: user.id })

  // T13: Fall abgeschlossen
  sendFallCommunication(fallId, 'fall_abgeschlossen').catch(() => {})

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'status-change',
    titel: 'Schlussabrechnung erstellt — Fall abgeschlossen',
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

// ─── Phase C: VS-Ablehnung Actions ──────────────────────────────────────────

export async function klageEingeleitet(fallId: string, notiz: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Klage eingeleitet (LexDrive)',
    beschreibung: notiz || 'Klage-Prozess läuft über LexDrive.',
    erstellt_von: user.id,
  })

  revalidatePath(`/admin/faelle/${fallId}`)
}

export async function fallStornieren(fallId: string, grund: string) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')

  await transitionFallStatus(fallId, 'storniert', { grund: `vs_ablehnung_storno: ${grund}`, user_id: user.id })

  revalidatePath(`/admin/faelle/${fallId}`)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}
