'use server'

// AAR-956 P4-A: token-basierter Self-Service-Save der deklarativen Feststellungs-Felder auf den Lead.
// CMM-49 Onboarding-Writer-Kanonisierung: nur noch ein duenner Wrapper -> baut den Schreib-Kontext
// (audience='flow', Token-resolved leadId, admin-Client) und delegiert an saveOnboardingFields. Der
// leads-Handler uebernimmt SA-Lockdown + Coercion + Write. Felder/Allowlist serverseitig aus
// onboarding_felder (NIE Client-Mapping vertrauen).

import { revalidatePath } from 'next/cache'
import { ladeLeadErfassungLeadsFelder } from '@/lib/onboarding/lead-erfassung-allowlist'
import { saveOnboardingFields } from '@/lib/onboarding/save-onboarding-fields'
import { resolveFlowLeadId } from '@/lib/flow/flow-token'
import type { OnboardingFeld } from '@/components/onboarding/types'
import type { OnboardingWriteContext } from '@/lib/onboarding/write-context'

export async function speichereFeststellungFlow(
  token: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLeadId(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // Felder serverseitig aus onboarding_felder -> als felder fuer den Router synthetisieren
  // (db_target.tabelle='leads', typ aus der Config; zb1-upload ist im Loader bereits ausgelassen).
  const feldMap = await ladeLeadErfassungLeadsFelder()
  const felder: OnboardingFeld[] = [...feldMap].map(([feld_key, meta]) => ({
    id: feld_key,
    phase_id: '',
    reihenfolge: 0,
    feld_key,
    typ: meta.typ as OnboardingFeld['typ'],
    label: '',
    pflicht: false,
    db_target: { tabelle: 'leads', spalte: meta.spalte },
  }))

  const ctx: OnboardingWriteContext = {
    supabase: admin as unknown as OnboardingWriteContext['supabase'],
    user: null,
    audience: 'flow',
    leadId,
  }
  const r = await saveOnboardingFields(ctx, felder, values)
  if (!r.ok) return { ok: false, error: r.error }

  // Ops-Test 11.08. (RC-8): Der Unfallort wurde als reiner Text gespeichert —
  // unfallort_lat/lng blieben NULL (prod-Beleg: 'Ecke Wiesenstrasse' ohne Koordinaten).
  // Damit ist der Ort weder kartierbar noch als Anker fuer die Unfallskizze nutzbar.
  // Nur wenn der Ort in DIESEM Save vorkam -> kein Geocoding-Call bei jedem Schritt.
  // Non-critical: der Text steht bereits, ein Geocoding-Fehler darf ihn nicht zuruecknehmen.
  const ort = typeof values.unfallort === 'string' ? values.unfallort.trim() : ''
  if (ort.length >= 3) {
    try {
      const { geocodeAdresse } = await import('@/lib/mapbox/geocode')
      const geo = await geocodeAdresse(ort)
      if (geo) {
        const { error: geoErr } = await admin
          .from('leads')
          .update({ unfallort_lat: geo.lat, unfallort_lng: geo.lng } as never)
          .eq('id', leadId)
        if (geoErr) console.warn('[feststellung] unfallort-Koordinaten (non-critical):', geoErr.message)
      }
    } catch (err) {
      console.warn('[feststellung] Geocoding unfallort (non-critical):', err)
    }
  }

  // Ops-Test 11.08. (#11): „unfallskizze generieren fehlt". Der Generator (AAR-317)
  // existierte, war aber NUR im Dispatch-Portal verdrahtet — ein Kunde, der seinen
  // Hergang hier beschreibt, erzeugte nie eine Skizze; sie entstand erst, wenn ein
  // Mitarbeiter sie manuell anstiess.
  //
  // Die Skizze ist ein VORSCHLAG: unfallskizze_bestaetigt bleibt false, Dispatch gibt
  // frei oder lehnt ab (bestehendes Modell, approveSkizze/clearSkizze). Wir setzen also
  // niemanden vor vollendete Tatsachen.
  //
  // Non-critical wie das Geocoding darueber: der erfasste Text steht bereits, ein
  // fehlgeschlagener API-Call darf ihn nicht zuruecknehmen.
  //
  // FIRE-AND-FORGET (bewusst kein await): der Claude-Call braucht 5-15 s. Das Geocoding
  // darueber ist ein Mapbox-Lookup (~200 ms) und darf blockieren — ein KI-Call nicht.
  // Der Kunde klickt „Weiter" und soll weitergehen, nicht auf eine Zeichnung warten.
  // Die App laeuft als langlebiger Node-Prozess auf dem VPS (kein Serverless-Freeze),
  // die Promise laeuft also zu Ende. Geht sie bei einem Deploy verloren, bleibt der
  // manuelle Dispatch-Weg (generateAndSaveUnfallskizze) — die Skizze ist nirgends
  // Voraussetzung, sie ist eine Zugabe.
  void (async () => {
  try {
    const { sollSkizzeGenerieren } = await import('@/lib/unfallskizze/soll-generieren')
    const { data: standAlt } = await admin
      .from('leads')
      .select('unfallskizze_svg, schadentyp, gegner_fahrzeugtyp')
      .eq('id', leadId)
      .maybeSingle()

    if (
      sollSkizzeGenerieren({
        hergangImSave: values.unfallhergang,
        vorhandeneSkizze: (standAlt?.unfallskizze_svg as string | null) ?? null,
      })
    ) {
      const { generateUnfallskizze } = await import('@/lib/unfallskizze/generate')
      const skizze = await generateUnfallskizze({
        unfallhergang: String(values.unfallhergang),
        schadentyp: (standAlt?.schadentyp as string | null) ?? null,
        gegnerFahrzeugtyp: (standAlt?.gegner_fahrzeugtyp as string | null) ?? null,
      })
      if (skizze.success) {
        const { error: skizzeErr } = await admin
          .from('leads')
          .update({
            unfallskizze_svg: skizze.svg,
            unfallskizze_bestaetigt: false,
            unfallskizze_ablehnung_grund: null,
            unfallskizze_generiert_am: new Date().toISOString(),
          } as never)
          .eq('id', leadId)
        if (skizzeErr) console.warn('[feststellung] Unfallskizze speichern (non-critical):', skizzeErr.message)
      } else {
        console.warn('[feststellung] Unfallskizze-Generierung (non-critical):', skizze.error)
      }
    }
  } catch (err) {
    console.warn('[feststellung] Unfallskizze (non-critical):', err)
  }
  })()

  revalidatePath('/dispatch/leads')
  return { ok: true }
}
