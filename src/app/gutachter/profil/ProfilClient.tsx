'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { loadGoogleMaps } from '@/lib/maps/load-google-maps'
import { ProfilSpezialisierung } from './_components/ProfilSpezialisierung'
import { ProfilCommunityPrivacy } from './_components/ProfilCommunityPrivacy'
import { ProfilVertrag } from './_components/ProfilVertrag'
import { ProfilDarstellung } from './_components/ProfilDarstellung'
import { ProfilStammdaten } from './_components/ProfilStammdaten'
import { SectionCard } from '@/components/shared/SectionCard'
import type { Profile, SV } from './_components/fields'

// KFZ-154: Qualifikationen / Spezifikationen / Schadenarten kommen jetzt aus
// /admin/sachverstaendige/anlegen/constants.ts (single source of truth).
// Die alten SF-01..SF-06 Codes wurden ersetzt durch die 3 sauberen Listen.

const PAKET_LABELS: Record<string, string> = {
  standard: 'Standard (10 Fälle/Monat)', 'starter-10': 'Standard (10 Fälle/Monat)',
  pro: 'Pro (25 Fälle/Monat)', 'standard-25': 'Pro (25 Fälle/Monat)',
  premium: 'Premium (50 Fälle/Monat)', 'premium-50': 'Premium (50 Fälle/Monat)',
}
type PendingTermin = { id: string; fall_id: string; start_zeit: string; end_zeit: string; claim_nummer?: string }

export default function ProfilClient({
  email,
  profile,
  sv,
  faelleCount,
  pendingTermine,
}: {
  email: string
  profile: Profile
  sv: SV
  faelleCount: number
  pendingTermine: PendingTermin[]
}) {
  const [mapsReady, setMapsReady] = useState(
    typeof window !== 'undefined' && typeof google !== 'undefined' && !!google.maps?.places,
  )

  // F4-Fast-Follow: raw <Script> entfernt -> der geteilte Singleton loadGoogleMaps() laedt Maps
  // genau einmal (idempotent, promise-gecacht, immer libraries=places). Der fruehere UNBEDINGTE
  // <Script> injizierte einen ZWEITEN Maps-Tag, sobald der Singleton (via GooglePlaceAutocomplete
  // in ProfilStammdaten) Maps schon von einer anderen Seite geladen hatte -> "included multiple
  // times". Jetzt EINE Quelle; fehlender Key/Load-Fail -> mapsReady bleibt false -> Autocomplete
  // degradiert auf Freitext (unveraendertes Verhalten zum bisherigen no-key-Fall).
  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then(() => { if (!cancelled) setMapsReady(true) })
      .catch((err) => { console.error('[ProfilClient] Google Maps Load fehlgeschlagen', err) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="h-full flex flex-col">
      {/* BUG-91: Scroll-Container, max-w-full Page-Content
          BUG-98 Folge-Cleanup: Form von max-w-3xl auf max-w-4xl angehoben
          damit Desktop/Tablet quer den Platz nutzen. 4xl (~896px) bleibt
          fuer das einspaltige Profil-Form gut lesbar. */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-full">
        <ProfilStammdaten
          email={email}
          profile={profile}
          sv={sv}
          mapsReady={mapsReady}
        />

        <ProfilVertrag
          paketLabel={PAKET_LABELS[sv.paket] ?? sv.paket ?? '—'}
          offene={sv.offene_faelle}
          gesamt={sv.paket_faelle_gesamt}
          zugewiesen={faelleCount}
        />

        {/* KFZ-154: 3 Spezialisierungs-Listen */}
        <ProfilSpezialisierung
          svId={sv.id}
          qualifikationen={sv.qualifikationen_neu ?? []}
          spezifikationen={sv.spezifikationen ?? []}
          schadenarten={sv.schadenarten ?? []}
        />

        {/* KFZ-152 Phase 3 Follow-up: Privacy-Toggle (nur fuer Community-Mitglieder) */}
        {sv.rolle_in_organisation === 'community_member' && (
          <ProfilCommunityPrivacy svId={sv.id} initial={sv.community_anonym} />
        )}

        {/* Offene Terminanfragen */}
        {pendingTermine.length > 0 && (
          <SectionCard className="p-6 mt-5">
            <h2 className="text-sm font-medium text-claimondo-ondo mb-4">
              Offene Terminanfragen ({pendingTermine.length})
            </h2>
            <div className="space-y-3">
              {pendingTermine.map(termin => (
                <TerminAnfrage key={termin.id} termin={termin} svId={sv.id} />
              ))}
            </div>
          </SectionCard>
        )}
        {/* AAR-956 / KFZ-139: Darstellung-Section (Branding-Editor + Google-Business) */}
        <ProfilDarstellung _svId={sv.id} mapsReady={mapsReady} />
      </div>
    </div>
  )
}

function TerminAnfrage({ termin, svId }: { termin: PendingTermin; svId: string }) {
  const [responding, setResponding] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [gegenvorschlag, setGegenvorschlag] = useState('')
  const [ablehnungsgrund, setAblehnungsgrund] = useState('')
  const router = useRouter()

  async function handleAccept() {
    setResponding(true)
    const supabase = createClient()
    // Läuft über den RLS-Client: Ein gefiltertes UPDATE trifft 0 Zeilen OHNE Fehler.
    // Deshalb zusätzlich die getroffenen Zeilen prüfen — sonst meldet die Oberfläche
    // Erfolg (refresh), während der Termin unverändert bleibt.
    const { data, error } = await supabase
      .from('gutachter_termine')
      .update({ status: 'bestaetigt' })
      .eq('id', termin.id)
      .select('id')
    if (error || !data?.length) {
      console.error('[ProfilClient] Termin-Zusage nicht gespeichert:', error?.message ?? '0 Zeilen (RLS)')
      toast.error('Die Zusage konnte nicht gespeichert werden. Bitte erneut versuchen.')
      setResponding(false)
      return
    }
    router.refresh()
  }

  async function handleReject() {
    if (!gegenvorschlag) return
    setResponding(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('gutachter_termine')
      .update({
        status: 'abgelehnt',
        ablehnungsgrund,
        gegenvorschlag_zeit: gegenvorschlag,
      })
      .eq('id', termin.id)
      .select('id')
    if (error || !data?.length) {
      console.error('[ProfilClient] Termin-Absage nicht gespeichert:', error?.message ?? '0 Zeilen (RLS)')
      toast.error('Die Absage konnte nicht gespeichert werden. Bitte erneut versuchen.')
      setResponding(false)
      return
    }
    router.refresh()
  }

  const start = new Date(termin.start_zeit)
  const end = new Date(termin.end_zeit)

  return (
    <div className="bg-claimondo-bg/50 rounded-ios-xl p-4 border border-claimondo-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-claimondo-navy text-sm font-medium">
          {start.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' })}
          {' '}
          {start.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })}
          –
          {end.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })}
        </p>
        <span className="text-amber-400 text-[10px] font-medium bg-amber-50 px-2 py-0.5 rounded-full">Anfrage</span>
      </div>

      {!showReject ? (
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleAccept}
            disabled={responding}
            className="flex-1 py-2 rounded-ios-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-40"
          >
            Bestätigen
          </button>
          <button
            onClick={() => setShowReject(true)}
            disabled={responding}
            className="flex-1 py-2 rounded-ios-lg text-xs font-semibold bg-red-900 hover:bg-red-800 text-red-200 transition-colors disabled:opacity-40"
          >
            Ablehnen
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={ablehnungsgrund}
            onChange={e => setAblehnungsgrund(e.target.value)}
            placeholder="Grund (optional)"
            className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
          <input
            type="datetime-local"
            value={gegenvorschlag}
            onChange={e => setGegenvorschlag(e.target.value)}
            required
            className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
          <p className="text-claimondo-ondo text-xs">Gegenvorschlag ist Pflicht</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowReject(false)}
              className="flex-1 py-2 rounded-ios-lg text-xs text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg transition-colors"
            >
              Zurück
            </button>
            <button
              onClick={handleReject}
              disabled={responding || !gegenvorschlag}
              className="flex-1 py-2 rounded-ios-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-40"
            >
              Ablehnen + Gegenvorschlag
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// 2026-05-06 SV7 (Form-Audit): FieldRow, ControlledRow, SelectRow, ROW_*_CLS
// wurden nach ./_components/fields.tsx extrahiert (Task 1 Profil-Rebuild).
// inferInputMode/inferAutoComplete (0 Consumer) im Rebuild entfernt (Task 7).
