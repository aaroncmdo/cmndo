import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ShieldCheckIcon, CheckCircleIcon, ClockIcon, XCircleIcon, AlertTriangleIcon } from 'lucide-react'

// AAR-359 W5: Verifizierungs-Übersicht für SVs.
// Read-only in dieser Welle — zeigt SA-Vorlage-Status und Tier-2-Frist.
// Upload-Flow (SA-Vorlage + Tier-2-Dokumente) kommt mit W3 bzw. W6.
//
// Diese Seite wird nur in der Sidebar angezeigt, solange mindestens eine
// Verifizierungs-Pflicht offen ist (sa_vorlage_status != 'geprueft' ODER
// verifizierung_status != 'geprueft'). SVs mit komplett durchgewinkter
// Verifizierung sehen die Route zwar (Bookmark-Kompat), die Übersicht
// zeigt dann nur grüne Haken.

export default async function VerifizierungPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select(
      'id, sa_vorlage_status, sa_vorlage_hochgeladen_am, sa_vorlage_geprueft_am, sa_vorlage_admin_notiz, verifizierung_status, verifizierung_frist_bis, verifizierung_admin_notiz, verifiziert_am',
    )
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!sv) redirect('/gutachter/willkommen')

  const tageOffen = sv.verifizierung_frist_bis
    ? Math.max(
        0,
        Math.ceil(
          (new Date(sv.verifizierung_frist_bis).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      )
    : null

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#4573A2]/10 text-[#0D1B3E] flex items-center justify-center">
          <ShieldCheckIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0D1B3E]">Verifizierung</h1>
          <p className="text-sm text-gray-600">Status Ihrer Zulassungs-Unterlagen</p>
        </div>
      </header>

      {/* Tier 1: SA-Vorlage */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#0D1B3E]">Tier 1 — SA-Vorlage</h2>
            <p className="text-xs text-gray-500">
              Pflicht vor Dispatch-Freigabe. Ihre persönliche Schadenaufnahme-Vorlage als PDF.
            </p>
          </div>
          <StatusBadge status={sv.sa_vorlage_status} />
        </div>

        {sv.sa_vorlage_status === null && (
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
            Noch nicht hochgeladen. Der Upload erfolgt im Willkommen-Flow nach Abschluss der Anzahlung.
          </p>
        )}
        {sv.sa_vorlage_status === 'ausstehend' && sv.sa_vorlage_hochgeladen_am && (
          <p className="text-sm text-gray-700 bg-amber-50 rounded-lg px-3 py-2">
            Eingereicht am {formatDatum(sv.sa_vorlage_hochgeladen_am)} — wird vom Admin geprüft.
          </p>
        )}
        {sv.sa_vorlage_status === 'zurueckgewiesen' && (
          <div className="text-sm bg-red-50 rounded-lg px-3 py-2 space-y-1">
            <p className="text-red-700 font-medium">Zurückgewiesen</p>
            {sv.sa_vorlage_admin_notiz && (
              <p className="text-red-600 text-xs">Grund: {sv.sa_vorlage_admin_notiz}</p>
            )}
            <p className="text-red-600 text-xs">Bitte neu hochladen. Der Re-Upload-Weg kommt in Kürze.</p>
          </div>
        )}
        {sv.sa_vorlage_status === 'geprueft' && (
          <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
            Freigegeben am {sv.sa_vorlage_geprueft_am ? formatDatum(sv.sa_vorlage_geprueft_am) : '—'}. Dispatch ist aktiv.
          </p>
        )}
      </section>

      {/* Tier 2: 14-Tage-Dokumente */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#0D1B3E]">Tier 2 — Verifizierungs-Unterlagen</h2>
            <p className="text-xs text-gray-500">
              Berufshaftpflicht, Gewerbeanmeldung und ggf. Bestellungsurkunde. 14-Tage-Frist ab Anzahlung.
            </p>
          </div>
          <StatusBadge status={sv.verifizierung_status} />
        </div>

        {sv.verifizierung_status === null && (
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
            Die Frist startet automatisch nach Eingang Ihrer Anzahlung.
          </p>
        )}
        {sv.verifizierung_status === 'ausstehend' && sv.verifizierung_frist_bis && tageOffen !== null && (
          <div className={`text-sm rounded-lg px-3 py-2 ${tageOffen <= 4 ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
            <p className="font-medium">
              Frist: {formatDatum(sv.verifizierung_frist_bis)} — noch {tageOffen} Tag{tageOffen === 1 ? '' : 'e'} offen
            </p>
            <p className="text-xs mt-0.5 opacity-90">Der Upload-Bereich wird in Kürze freigeschaltet.</p>
          </div>
        )}
        {sv.verifizierung_status === 'frist_ueberschritten' && (
          <div className="text-sm bg-red-50 rounded-lg px-3 py-2 space-y-1">
            <p className="text-red-700 font-medium">Frist überschritten</p>
            <p className="text-red-600 text-xs">
              Bitte reichen Sie die fehlenden Unterlagen umgehend nach, damit Ihr Dispatch-Zugang nicht gesperrt wird.
            </p>
          </div>
        )}
        {sv.verifizierung_status === 'geprueft' && (
          <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
            Vollständig verifiziert{sv.verifiziert_am ? ` am ${formatDatum(sv.verifiziert_am)}` : ''}.
          </p>
        )}
      </section>

      <p className="text-xs text-gray-500 text-center">
        Fragen zur Verifizierung? Melden Sie sich beim Support.
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (status === 'geprueft') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
        <CheckCircleIcon className="w-3.5 h-3.5" /> Freigegeben
      </span>
    )
  }
  if (status === 'ausstehend') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
        <ClockIcon className="w-3.5 h-3.5" /> Ausstehend
      </span>
    )
  }
  if (status === 'zurueckgewiesen') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
        <XCircleIcon className="w-3.5 h-3.5" /> Zurückgewiesen
      </span>
    )
  }
  if (status === 'frist_ueberschritten') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
        <AlertTriangleIcon className="w-3.5 h-3.5" /> Frist abgelaufen
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
      Noch offen
    </span>
  )
}

function formatDatum(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
