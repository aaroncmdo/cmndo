// Render-Loader fuer den sv-onboarding-Flow (Basic-SV-Self-Service).
// Laedt die DB-Phasen fuer flow_key='sv-onboarding', bestimmt den
// Prefill-Status aus sachverstaendige + profiles + kalender_verbindungen
// und filtert bereits vollstaendig gefuellte Pflicht-Phasen heraus (Skip-logic).
// Reiner Server-Loader (kein 'use server') -- wird aus /gutachter/willkommen/page.tsx
// aufgerufen (der frueher hier genannte Pfad /sv/onboarding existiert nicht).

import { getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { localizePhase, localizeFeld } from './localize'
import { filterFelderByAudience } from './filter-felder-by-audience'
import type {
  OnboardingPhase,
  OnboardingFeld,
  FieldOption,
  DbTarget,
  ConditionalOn,
} from '@/components/onboarding/types'

export type SvOnboardingState = {
  phasen: OnboardingPhase[]
  prefilledValues: Record<string, unknown>
  svId: string
  abgeschlossen: boolean
  totalDefinedPhases: number
  skippedPhases: number
}

/**
 * Laedt die Onboarding-Phasen fuer den eingeloggten Basic-SV.
 * Gibt null zurueck wenn:
 *   - kein eingeloggter User
 *   - kein sachverstaendige-Datensatz fuer den User
 *   - paket != 'basic'
 */
export async function ladeSvOnboardingPhasen(): Promise<SvOnboardingState | null> {
  // Auth-Check via anon-Client (Cookie-Session)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const locale = await getLocale()

  // ─── 1. Phasen + Felder aus DB laden (ZUERST — fuer DB-getriebenen Prefill) ──
  // Die zu ladenden sachverstaendige-/profiles-Spalten werden aus den Feld-
  // db_targets abgeleitet (nicht hartkodiert). So wird JEDES Feld, das auf eine
  // echte Spalte zeigt und dort Daten hat, als "haben wir schon" erkannt (Phase
  // skippt / Feld prefillt) — auch kuenftige Felder, ohne diese Liste manuell
  // nachzupflegen. Das ist DB-Getriebenheit statt kuratierter Spaltenliste.
  const { data: phasenRows } = await admin
    .from('onboarding_phasen')
    .select(`
      id, flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on, i18n,
      onboarding_felder (
        id, phase_id, reihenfolge, feld_key, typ, label, hint, placeholder,
        pflicht, optionen, validation, db_target, conditional_on, i18n, audience, sektion
      )
    `)
    .eq('flow_key', 'sv-onboarding')
    .order('reihenfolge', { ascending: true })

  const alleFelder = (phasenRows ?? []).flatMap((p) =>
    Array.isArray(p.onboarding_felder) ? p.onboarding_felder : [],
  ) as Array<{ db_target: unknown }>
  const { sachverstaendige: svDbCols, profiles: profDbCols } = sammlePrefillSpalten(alleFelder)

  // Fixe Logik-Spalten + abgeleitete Quell-Spalten (kein db_target) + Feld-db_target-Spalten.
  const svSelect = [
    ...new Set(['id', 'paket', 'basic_onboarding_abgeschlossen_am', ...svDbCols]),
  ].join(', ')
  const profSelect = [
    // 'telefon': Prefill fuer das phone-verify-Feld (Registrierungs-Nummer).
    ...new Set(['twofa_telefon_verifiziert_am', 'google_connected_at', 'telefon', ...profDbCols]),
  ].join(', ')

  // ─── 2. sachverstaendige-Snapshot (DB-getrieben selektiert) ──────────
  const { data: sv } = await admin
    .from('sachverstaendige')
    .select(svSelect)
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!sv || (sv as unknown as Record<string, unknown>).paket !== 'basic') return null

  // ─── 3. profiles-Snapshot (DB-getrieben selektiert) ──────────────────
  const { data: profile } = await admin
    .from('profiles')
    .select(profSelect)
    .eq('id', user.id)
    .maybeSingle()

  const profileRec = (profile ?? null) as unknown as Record<string, unknown> | null

  // ─── 4. Kalender-Verbindungen pruefen ────────────────────────────────
  const { data: caldav } = await admin
    .from('kalender_verbindungen')
    .select('id')
    .eq('profile_id', user.id)
    .eq('provider', 'caldav')
    .limit(1)

  const gcal = !!profileRec?.google_connected_at
  const hasCaldav = Array.isArray(caldav) && caldav.length > 0

  // ─── 5. Prefill-Map ──────────────────────────────────────────────────
  // Beide Datensaetze flach kopieren; abgeleitete Felder ergaenzen.
  const prefilled: Record<string, unknown> = {
    ...flachKopie(sv as unknown as Record<string, unknown>),
    ...flachKopie((profileRec ?? {}) as Record<string, unknown>),
    // Abgeleitete Keys fuer die Wizard-Feld-Skip-Pruefung:
    phone_verified: profileRec?.twofa_telefon_verifiziert_am ?? null,
    kalender_connected: gcal || hasCaldav ? 'true' : null,
  }

  if (!phasenRows) {
    return {
      phasen: [],
      prefilledValues: prefilled,
      svId: (sv as unknown as Record<string, unknown>).id as string,
      abgeschlossen: !!((sv as unknown as Record<string, unknown>).basic_onboarding_abgeschlossen_am),
      totalDefinedPhases: 0,
      skippedPhases: 0,
    }
  }

  // ─── 6. Phasen bauen + Skip-Logik ────────────────────────────────────
  const phasen: OnboardingPhase[] = []
  let skipped = 0

  for (const p of phasenRows) {
    const felderRaw = Array.isArray(p.onboarding_felder) ? p.onboarding_felder : []

    // Felder: sortieren, lokalisieren, typisieren -- identisches Muster wie
    // ladeNoetigePhasen / ladeFlowPhasen (beide nutzen localizeFeld + lokale Map).
    const felder: OnboardingFeld[] = (felderRaw as typeof felderRaw)
      .sort(
        (a: { reihenfolge: number }, b: { reihenfolge: number }) =>
          a.reihenfolge - b.reihenfolge,
      )
      .map(
        (f: {
          id: string
          phase_id: string
          reihenfolge: number
          feld_key: string
          typ: string
          label: string
          hint: string | null
          placeholder: string | null
          pflicht: boolean
          optionen: unknown
          validation: unknown
          db_target: unknown
          conditional_on: unknown
          i18n: unknown
          audience: unknown
          sektion: unknown
        }) => {
          let optionen = (f.optionen as FieldOption[] | null) ?? null

          // calendar-connect-Felder brauchen svId + gcal/caldav-Flags als
          // optionen damit das Widget sie im Client-Context hat.
          if (f.typ === 'calendar-connect') {
            optionen = [
              { value: 'svId', label: (sv as unknown as Record<string, unknown>).id as string },
              { value: 'gcal', label: String(gcal) },
              { value: 'caldav', label: String(hasCaldav) },
            ]
          }

          // phone-verify: Registrierungs-Nummer als Prefill injizieren (gleiches
          // Options-Transport-Muster wie calendar-connect).
          if (f.typ === 'phone-verify' && profileRec?.telefon) {
            optionen = [{ value: 'telefonPrefill', label: String(profileRec.telefon) }]
          }

          const loc = localizeFeld(
            {
              label: f.label,
              hint: f.hint,
              placeholder: f.placeholder,
              optionen,
            },
            f.i18n,
            locale,
          )

          return {
            id: f.id,
            phase_id: f.phase_id,
            reihenfolge: f.reihenfolge,
            feld_key: f.feld_key,
            typ: f.typ as OnboardingFeld['typ'],
            label: loc.label,
            hint: loc.hint,
            placeholder: loc.placeholder,
            pflicht: f.pflicht,
            optionen: loc.optionen,
            validation: (f.validation as Record<string, unknown> | null) ?? null,
            db_target: f.db_target as DbTarget,
            conditional_on: (f.conditional_on as ConditionalOn | null) ?? null,
            audience: (f.audience as OnboardingFeld['audience']) ?? null,
            sektion: (f.sektion as string | null) ?? null,
          }
        },
      )

    // SV-Onboarding: audience='sv' oder 'beide' sehen -- kein Kunden-Filter.
    // filterFelderByAudience kennt nur 'kunde'/'dispatcher'; fuer SV-Phasen
    // sind alle Felder ohnehin audience=null/'beide' -> kein Filter noetig.
    const sichtbareFelder = felder

    // Skip-Logik: identisch mit ladeNoetigePhasen -- Lookup via feld_key UND
    // db_target.spalte (falls sie abweichen).
    const pflichtFelder = sichtbareFelder.filter((f) => f.pflicht)
    const allePflichtErfuellt =
      pflichtFelder.length > 0 &&
      pflichtFelder.every((f) => {
        const valByKey = prefilled[f.feld_key]
        const dbSpalte = f.db_target?.spalte ?? null
        const valBySpalte = dbSpalte ? prefilled[dbSpalte] : undefined
        const v = valByKey ?? valBySpalte
        return v !== null && v !== undefined && v !== ''
      })

    if (allePflichtErfuellt) {
      skipped++
      continue
    }

    // Phase lokalisieren + in Ergebnis aufnehmen -- identisch mit ladeFlowPhasen.
    const ploc = localizePhase(
      {
        titel: p.titel,
        eyebrow: p.eyebrow ?? null,
        beschreibung: p.beschreibung ?? null,
      },
      (p as { i18n?: unknown }).i18n,
      locale,
    )

    phasen.push({
      id: p.id,
      flow_key: p.flow_key,
      reihenfolge: p.reihenfolge,
      phase_key: p.phase_key,
      titel: ploc.titel,
      eyebrow: ploc.eyebrow,
      beschreibung: ploc.beschreibung,
      conditional_on: (p.conditional_on as ConditionalOn | null) ?? null,
      felder: sichtbareFelder,
    })
  }

  // AAR-939 Part B: Widget-Phase CODE-injiziert (nicht DB-seeded). Bewusst so —
  // der embed-site-create-Renderer + die Phase muessen atomar zusammen deployen.
  // Eine DB-geseedete Pflicht-Phase ohne deployten Renderer wuerde laufendes
  // Basic-Onboarding blockieren (default-Renderer = null -> Pflicht nie erfuellbar;
  // DB-ahead-of-code-Drift, Regel-3-Risiko). Skip wie bei Kalender: nur zeigen,
  // solange der SV noch kein Widget hat.
  // embed_sites fehlt in database.types.ts -> Cast (Lesen via service_role-admin).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: embedCount } = await (admin as any)
    .from('embed_sites')
    .select('id', { count: 'exact', head: true })
    .eq('inhaber_profile_id', user.id)
  if ((embedCount ?? 0) === 0) {
    phasen.push({
      id: '_widget',
      flow_key: 'sv-onboarding',
      reihenfolge: 45,
      phase_key: 'widget',
      titel: 'Dein Widget',
      eyebrow: 'Kostenlos starten',
      beschreibung:
        'Binde das Claimondo-Formular auf deiner Website ein — Anfragen landen direkt in deinem Posteingang.',
      conditional_on: null,
      felder: [
        {
          id: '_widget_embed_create',
          phase_id: '_widget',
          reihenfolge: 10,
          feld_key: 'embed_site_created',
          typ: 'embed-site-create',
          label: 'Widget anlegen',
          hint: 'Deine Domain + ein Name — fertig. Variante A (kostenlos, mit Claimondo-Branding).',
          placeholder: null,
          pflicht: true,
          optionen: null,
          validation: null,
          db_target: { tabelle: '_self', spalte: 'embed_site_created' },
          conditional_on: null,
          audience: null,
          sektion: null,
        },
      ],
    })
    phasen.sort((a, b) => a.reihenfolge - b.reihenfolge)
  }

  return {
    phasen,
    prefilledValues: prefilled,
    svId: (sv as unknown as Record<string, unknown>).id as string,
    abgeschlossen: !!((sv as unknown as Record<string, unknown>).basic_onboarding_abgeschlossen_am),
    totalDefinedPhases: phasenRows.length,
    skippedPhases: skipped,
  }
}

/**
 * DB-getrieben: sammelt die zu ladenden Prefill-Spalten je Tabelle aus den
 * Feld-db_targets. Nur echte Tabellen (sachverstaendige/profiles) -- Sentinels
 * (_self/_finalize/_termin) haben keine ladbare Spalte und werden uebersprungen.
 * Exportiert fuer den Unit-Test.
 */
export function sammlePrefillSpalten(
  felder: Array<{ db_target: unknown }>,
): { sachverstaendige: string[]; profiles: string[] } {
  const sv = new Set<string>()
  const prof = new Set<string>()
  for (const f of felder) {
    const dt = f.db_target as { tabelle?: string; spalte?: string } | null
    const spalte = dt?.spalte
    if (!spalte) continue
    if (dt?.tabelle === 'sachverstaendige') sv.add(spalte)
    else if (dt?.tabelle === 'profiles') prof.add(spalte)
    // andere Tabellen / Sentinels (_self/_finalize/_termin) -> ignorieren
  }
  return { sachverstaendige: [...sv], profiles: [...prof] }
}

// Flacht ein DB-Objekt ab und laesst null/undefined/'' heraus
// (identisch mit flachKopie in load-needed-phases.ts).
function flachKopie(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v
  }
  return out
}
