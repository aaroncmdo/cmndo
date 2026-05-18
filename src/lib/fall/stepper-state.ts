import { createAdminClient } from '@/lib/supabase/admin'

// ─── Phase + Subprozess Definitionen ────────────────────────────────────────
// Basierend auf Miro Process-Flowchart + bestehendem Status-System

export type SubProzess = {
  key: string
  label: string
  status: 'offen' | 'aktiv' | 'erledigt' | 'uebersprungen'
}

export type HauptPhase = {
  key: string
  label: string
  desc: string
  status: 'offen' | 'aktiv' | 'erledigt'
  subs: SubProzess[]
}

export type VorPhase = {
  label: string
  erledigt: boolean
  datum?: string | null
}

export type StepperState = {
  vorPhasen: VorPhase[]
  hauptPhasen: HauptPhase[]
  activePhaseIndex: number
}

// ─── Hauptphasen-Definition ─────────────────────────────────────────────────

const PHASEN_KEYS = [
  'besichtigung',
  'gutachten',
  'qualitaetssicherung',
  'kanzlei_uebergabe',
  'versicherung',
  'regulierung',
  'abschluss',
] as const

const PHASEN_LABELS: Record<string, { label: string; desc: string }> = {
  besichtigung: { label: 'Besichtigung', desc: 'Gutachter besichtigt das Fahrzeug' },
  gutachten: { label: 'Gutachten', desc: 'Gutachten wird erstellt und hochgeladen' },
  qualitaetssicherung: { label: 'Qualitätssicherung', desc: 'Filmcheck und Dokumentenprüfung' },
  kanzlei_uebergabe: { label: 'Kanzlei-Übergabe', desc: 'Akte wird an Partnerkanzlei übergeben' },
  versicherung: { label: 'Versicherung', desc: 'Korrespondenz mit der gegnerischen Versicherung' },
  regulierung: { label: 'Regulierung', desc: 'Schadensregulierung und Zahlung' },
  abschluss: { label: 'Abschluss', desc: 'Fall abgeschlossen' },
}

// ─── Status → Phase Mapping ─────────────────────────────────────────────────

function fallStatusToPhaseIndex(status: string): number {
  const map: Record<string, number> = {
    'ersterfassung': 0,
    'sv-zugewiesen': 0,
    'sv-termin': 0,
    'besichtigung': 0,
    'gutachten-eingegangen': 1,
    'filmcheck': 2,
    'kanzlei-uebergeben': 3,
    'anschlussschreiben': 4,
    'regulierung': 5,
    'abgeschlossen': 6,
    'storniert': -1,
  }
  return map[status] ?? 0
}

// ─── Server-Side Computation ────────────────────────────────────────────────

export async function getStepperState(fallId: string): Promise<StepperState> {
  const admin = createAdminClient()

  // CMM-44 SP-B PR2b: abtretung_signiert_am lebt auf claims (SSoT) — via claims-Embed.
  const { data: fall } = await admin.from('v_faelle_mit_aktuellem_termin').select(
    'status, lead_id, sv_id, sv_zugewiesen_am, sv_termin, gutachten_eingegangen_am, filmcheck_ok, filmcheck_am, kanzlei_uebergeben_am, anschlussschreiben_am, regulierung_am, regulierung_betrag, konvertiert_am, gutachter_termin_status, claims:claim_id(abtretung_signiert_am)'
  ).eq('id', fallId).single()

  if (!fall) {
    return { vorPhasen: [], hauptPhasen: [], activePhaseIndex: 0 }
  }
  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  const abtretungSigniertAm = (fallClaim as { abtretung_signiert_am?: string | null } | null)?.abtretung_signiert_am ?? null

  // Termin-Status laden
  const { data: termin } = await admin.from('gutachter_termine')
    .select('status, gegenvorschlag_von')
    .eq('fall_id', fallId)
    .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag', 'abgelehnt'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // ─── Vor-Phasen (kompakter Header) ─────────────────────────────────────

  const vorPhasen: VorPhase[] = [
    { label: 'Lead aufgenommen', erledigt: true, datum: fall.konvertiert_am },
    { label: 'Vertrag unterschrieben', erledigt: !!abtretungSigniertAm, datum: abtretungSigniertAm },
    { label: 'SV zugewiesen', erledigt: !!fall.sv_id || !!fall.sv_zugewiesen_am, datum: fall.sv_zugewiesen_am },
  ]

  // ─── Aktive Phase bestimmen ─────────────────────────────────────────────

  const activeIdx = fallStatusToPhaseIndex(fall.status)

  // ─── Hauptphasen aufbauen ───────────────────────────────────────────────

  const hauptPhasen: HauptPhase[] = PHASEN_KEYS.map((key, idx) => {
    const { label, desc } = PHASEN_LABELS[key]
    const status: 'offen' | 'aktiv' | 'erledigt' = idx < activeIdx ? 'erledigt' : idx === activeIdx ? 'aktiv' : 'offen'
    const subs: SubProzess[] = []

    // Subprozesse pro Phase
    if (key === 'besichtigung') {
      // Termin-Abstimmung
      if (termin?.status === 'gegenvorschlag') {
        subs.push({
          key: 'termin_abstimmung',
          label: termin.gegenvorschlag_von === 'kunde'
            ? 'Termin-Abstimmung: Warten auf SV'
            : 'Termin-Abstimmung: Warten auf Kunde',
          status: 'aktiv',
        })
      } else if (termin?.status === 'reserviert') {
        subs.push({ key: 'termin_bestaetigung', label: 'Termin reserviert, Bestätigung ausstehend', status: 'aktiv' })
      } else if (termin?.status === 'bestaetigt') {
        subs.push({ key: 'termin_bestaetigt', label: 'Termin bestätigt', status: 'erledigt' })
      }

      // SV-Neuzuweisung
      if (termin?.status === 'abgelehnt' || fall.gutachter_termin_status === 'abgelehnt') {
        subs.push({ key: 'sv_neuzuweisung', label: 'SV-Neuzuweisung läuft', status: 'aktiv' })
      }

      // Vor-Ort Erfassung
      if (fall.status === 'sv-termin' && termin?.status === 'bestaetigt') {
        subs.push({ key: 'vor_ort', label: 'Vor-Ort Besichtigung steht an', status: 'aktiv' })
      }
    }

    if (key === 'gutachten') {
      if (fall.gutachten_eingegangen_am) {
        subs.push({ key: 'gutachten_hochgeladen', label: 'Gutachten hochgeladen', status: 'erledigt' })
      } else if (status === 'aktiv') {
        subs.push({ key: 'gutachten_ausstehend', label: 'Gutachten wird erstellt', status: 'aktiv' })
      }
    }

    if (key === 'qualitaetssicherung') {
      if (fall.filmcheck_ok) {
        subs.push({ key: 'filmcheck_ok', label: 'Filmcheck bestanden', status: 'erledigt' })
      } else if (status === 'aktiv') {
        subs.push({ key: 'filmcheck_pending', label: 'Filmcheck ausstehend', status: 'aktiv' })
      }
    }

    if (key === 'kanzlei_uebergabe') {
      if (fall.kanzlei_uebergeben_am) {
        subs.push({ key: 'kanzlei_uebergeben', label: 'An Kanzlei übergeben', status: 'erledigt' })
      }
      if (fall.anschlussschreiben_am) {
        subs.push({ key: 'anschlussschreiben', label: 'Anschlussschreiben versendet', status: 'erledigt' })
      } else if (fall.kanzlei_uebergeben_am && !fall.anschlussschreiben_am) {
        subs.push({ key: 'anschlussschreiben_pending', label: 'Anschlussschreiben ausstehend', status: 'aktiv' })
      }
    }

    if (key === 'versicherung') {
      if (fall.regulierung_am) {
        subs.push({ key: 'antwort_erhalten', label: 'Versicherung hat geantwortet', status: 'erledigt' })
      } else if (status === 'aktiv') {
        subs.push({ key: 'warten_antwort', label: 'Warten auf Antwort der Versicherung', status: 'aktiv' })
      }
    }

    if (key === 'regulierung') {
      if (fall.regulierung_betrag) {
        subs.push({ key: 'zahlung_eingegangen', label: `Zahlung: ${Number(fall.regulierung_betrag).toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR`, status: 'erledigt' })
      } else if (status === 'aktiv') {
        subs.push({ key: 'zahlung_ausstehend', label: 'Zahlung ausstehend', status: 'aktiv' })
      }
    }

    return { key, label, desc, status, subs }
  })

  return {
    vorPhasen,
    hauptPhasen,
    activePhaseIndex: Math.max(0, activeIdx),
  }
}
