'use server'

// Dispatcher Kunden-Match: findet bestehende Kunden anhand von E-Mail,
// Telefon und Name+Geburtsdatum, liefert deren Fall-Historie + KB.
// linkLeadToExistingKunde verknuepft den Lead mit dem gewaehlten Kunden,
// damit beim Convert faelle.kunde_id korrekt gesetzt wird (statt einem
// neuen Onboarding-Account).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type KundenMatch = {
  kunde_user_id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  /** Wodurch wurde gematcht? */
  match_basis: Array<'email' | 'telefon' | 'name_geburtsdatum'>
  /** Bisherige Faelle (max 5, neueste zuerst) */
  faelle: Array<{
    fall_id: string
    fall_nummer: string | null
    kennzeichen: string | null
    fahrzeug: string | null
    kb_name: string | null
    sv_name: string | null
    created_at: string | null
  }>
}

function normalizeTel(tel: string | null | undefined): string | null {
  if (!tel) return null
  return tel.replace(/[^0-9+]/g, '').replace(/^00/, '+').replace(/^0/, '+49')
}

export async function findKundenMatches(
  leadId: string,
): Promise<{ ok: true; matches: KundenMatch[] } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()

  const { data: lead } = await admin
    .from('leads')
    .select('id, vorname, nachname, email, telefon, halter_email, halter_telefon, halter_geburtsdatum, halter_vorname, halter_nachname')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Lead nicht gefunden' }

  const candidates: Map<string, KundenMatch> = new Map()

  function add(profile: { id: string; vorname: string | null; nachname: string | null; email: string | null; telefon: string | null }, basis: 'email' | 'telefon' | 'name_geburtsdatum') {
    const existing = candidates.get(profile.id)
    if (existing) {
      if (!existing.match_basis.includes(basis)) existing.match_basis.push(basis)
      return
    }
    candidates.set(profile.id, {
      kunde_user_id: profile.id,
      vorname: profile.vorname,
      nachname: profile.nachname,
      email: profile.email,
      telefon: profile.telefon,
      match_basis: [basis],
      faelle: [],
    })
  }

  // Match-Quellen: E-Mail (Lead-Erfasser + Halter), Telefon (Lead-Erfasser + Halter)
  const emails = [lead.email, lead.halter_email].filter(Boolean) as string[]
  const telefone = [lead.telefon, lead.halter_telefon]
    .map((t) => normalizeTel(t as string | null))
    .filter(Boolean) as string[]

  if (emails.length > 0) {
    const filters = emails.map((e) => `email.ilike.${e}`).join(',')
    const { data } = await admin
      .from('profiles')
      .select('id, vorname, nachname, email, telefon, rolle')
      .or(filters)
      .eq('rolle', 'kunde')
    for (const p of (data ?? []) as Array<{ id: string; vorname: string | null; nachname: string | null; email: string | null; telefon: string | null }>) {
      add(p, 'email')
    }
  }

  if (telefone.length > 0) {
    // Profile-Telefon ist nicht immer normalisiert — wir matchen breit per ILIKE
    const filters = telefone.map((t) => `telefon.ilike.%${t.slice(-9)}%`).join(',')
    const { data } = await admin
      .from('profiles')
      .select('id, vorname, nachname, email, telefon, rolle')
      .or(filters)
      .eq('rolle', 'kunde')
    for (const p of (data ?? []) as Array<{ id: string; vorname: string | null; nachname: string | null; email: string | null; telefon: string | null }>) {
      add(p, 'telefon')
    }
  }

  // Faelle + KB-Daten pro Kandidat anreichern
  const ids = Array.from(candidates.keys())
  if (ids.length > 0) {
    const { data: faelle } = await admin
      .from('faelle')
      .select('id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, kunde_id, kundenbetreuer_id, sv_id, created_at')
      .in('kunde_id', ids)
      .order('created_at', { ascending: false })
      .limit(50)

    const kbIds = Array.from(
      new Set(
        ((faelle ?? []) as Array<{ kundenbetreuer_id: string | null }>)
          .map((f) => f.kundenbetreuer_id)
          .filter(Boolean) as string[],
      ),
    )
    const kbMap = new Map<string, string>()
    if (kbIds.length > 0) {
      const { data: kbs } = await admin
        .from('profiles')
        .select('id, vorname, nachname')
        .in('id', kbIds)
      for (const kb of (kbs ?? []) as Array<{ id: string; vorname: string | null; nachname: string | null }>) {
        kbMap.set(kb.id, [kb.vorname, kb.nachname].filter(Boolean).join(' ') || '—')
      }
    }

    // SV-Name-Lookup (sachverstaendige.profile_id → profiles.vorname/nachname)
    const svIds = Array.from(
      new Set(
        ((faelle ?? []) as Array<{ sv_id: string | null }>)
          .map((f) => f.sv_id)
          .filter(Boolean) as string[],
      ),
    )
    const svMap = new Map<string, string>()
    if (svIds.length > 0) {
      const { data: svRows } = await admin
        .from('sachverstaendige')
        .select('id, profiles(vorname, nachname)')
        .in('id', svIds)
      for (const sv of (svRows ?? []) as Array<{ id: string; profiles?: { vorname: string | null; nachname: string | null } | { vorname: string | null; nachname: string | null }[] }>) {
        const p = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
        svMap.set(sv.id, [p?.vorname, p?.nachname].filter(Boolean).join(' ') || '—')
      }
    }

    for (const f of (faelle ?? []) as Array<{
      id: string
      fall_nummer: string | null
      kennzeichen: string | null
      fahrzeug_hersteller: string | null
      fahrzeug_modell: string | null
      kunde_id: string | null
      kundenbetreuer_id: string | null
      sv_id: string | null
      created_at: string | null
    }>) {
      if (!f.kunde_id) continue
      const cand = candidates.get(f.kunde_id)
      if (!cand) continue
      if (cand.faelle.length >= 5) continue
      cand.faelle.push({
        fall_id: f.id,
        fall_nummer: f.fall_nummer,
        kennzeichen: f.kennzeichen,
        fahrzeug: [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || null,
        kb_name: f.kundenbetreuer_id ? kbMap.get(f.kundenbetreuer_id) ?? null : null,
        sv_name: f.sv_id ? svMap.get(f.sv_id) ?? null : null,
        created_at: f.created_at,
      })
    }
  }

  return { ok: true, matches: Array.from(candidates.values()) }
}

export async function linkLeadToExistingKunde(
  leadId: string,
  kundeUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('leads')
    .update({ kunde_id: kundeUserId, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { ok: true }
}

export async function unlinkLeadKunde(
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('leads')
    .update({ kunde_id: null, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/dispatch/leads/${leadId}`)
  return { ok: true }
}
