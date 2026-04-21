import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ShieldCheckIcon, CheckCircleIcon, ClockIcon, XCircleIcon, AlertTriangleIcon, FileTextIcon, IdCardIcon } from 'lucide-react'
import QualiSlotUpload from './QualiSlotUpload'

// AAR-359 W5 + AAR-515 v4.1: Verifizierungs-Übersicht für SVs.
// Read-only — zeigt SA-Vorlage-Status und Tier-2-Frist plus die
// conditional Tier-2-Slots die sich aus der Quali-Auswahl ergeben:
//   - sv_bvsk_mitgliedschaft       (wenn Quali „BVSK-Mitglied")
//   - sv_ihk_zertifikat            (wenn Quali „IHK-zertifiziert")
//   - sv_bestellungsurkunde_oebuv  (wenn Quali „Öffentlich bestellt und vereidigt")
//   - sv_dat_nachweis              (wenn gutachter_typ='dat-gutachter')
//
// Diese Seite wird nur in der Sidebar angezeigt, solange mindestens eine
// Verifizierungs-Pflicht offen ist. SVs mit komplett durchgewinkter
// Verifizierung sehen die Route zwar (Bookmark-Kompat), die Übersicht
// zeigt dann nur grüne Haken.

type QualiSlot = {
  slotId: string
  label: string
  quali: string | null
  status: string | null
  hochgeladenAm: string | null
  nummer: string | null
  nummerLabel: string | null
  // AAR-647: pflicht=true für Abtretungs-Slots (nicht Quali-abhängig),
  // false für die conditional Tier-2-Slots die an Quali-Auswahl hängen.
  pflicht: boolean
}

export default async function VerifizierungPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select(
      'id, sa_vorlage_status, sa_vorlage_hochgeladen_am, sa_vorlage_geprueft_am, sa_vorlage_admin_notiz, verifizierung_status, verifizierung_frist_bis, verifizierung_admin_notiz, verifiziert_am, qualifikationen_neu, gutachter_typ, bvsk_mitgliedsnummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer',
    )
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!sv) redirect('/gutachter/willkommen')

  // AAR-515: Conditional Slots abhängig von Quali-Auswahl + gutachter_typ
  // AAR-647: Plus fixe Abtretungs-Slots die jeder SV im Onboarding hochlädt
  const qualis = (sv.qualifikationen_neu as string[] | null) ?? []
  const conditionalSlots: Array<{ slotId: string; label: string; quali: string | null; nummer: string | null; nummerLabel: string | null; pflicht: boolean }> = []

  // AAR-647: Abtretungs-Pflicht-Slots (immer für jeden SV, unabhängig von Quali)
  conditionalSlots.push(
    {
      slotId: 'sv_abtretungserklaerung',
      label: 'Sachverständigen-Abtretungserklärung',
      quali: null,
      nummer: null,
      nummerLabel: null,
      pflicht: true,
    },
    {
      slotId: 'sv_sicherungsabtretung',
      label: 'Sicherungsabtretung',
      quali: null,
      nummer: null,
      nummerLabel: null,
      pflicht: true,
    },
  )

  if (qualis.includes('BVSK-Mitglied')) {
    conditionalSlots.push({
      slotId: 'sv_bvsk_mitgliedschaft',
      label: 'BVSK-Mitgliedschaft',
      quali: 'BVSK-Mitglied',
      nummer: sv.bvsk_mitgliedsnummer ?? null,
      nummerLabel: 'BVSK-Mitgliedsnummer',
      pflicht: false,
    })
  }
  if (qualis.includes('IHK-zertifiziert')) {
    conditionalSlots.push({
      slotId: 'sv_ihk_zertifikat',
      label: 'IHK-Zertifikat',
      quali: 'IHK-zertifiziert',
      nummer: sv.ihk_zertifikat_nummer ?? null,
      nummerLabel: 'IHK-Zertifikats-Nummer',
      pflicht: false,
    })
  }
  if (qualis.includes('Öffentlich bestellt und vereidigt')) {
    conditionalSlots.push({
      slotId: 'sv_bestellungsurkunde_oebuv',
      label: 'Bestellungsurkunde ö.b.u.v.',
      quali: 'Öffentlich bestellt und vereidigt',
      nummer: sv.oebuv_bestellungsnummer ?? null,
      nummerLabel: 'Bestellungsnummer',
      pflicht: false,
    })
  }
  if (sv.gutachter_typ === 'dat-gutachter') {
    conditionalSlots.push({
      slotId: 'sv_dat_nachweis',
      label: 'DAT-Expert-Nachweis',
      quali: 'DAT-Expert',
      nummer: null,
      nummerLabel: 'DAT-Nummer',
      pflicht: false,
    })
  }

  // Pflichtdokumente-Rows für die conditional Slots
  let slotRows: Array<{ slotId: string; status: string | null; hochgeladenAm: string | null }> = []
  if (conditionalSlots.length > 0) {
    const { data: pdRows } = await supabase
      .from('pflichtdokumente')
      .select('dokument_typ, status, hochgeladen_am')
      .eq('sv_id', sv.id)
      .in('dokument_typ', conditionalSlots.map(s => s.slotId))
    slotRows = (pdRows ?? []).map(r => ({
      slotId: r.dokument_typ as string,
      status: r.status as string | null,
      hochgeladenAm: r.hochgeladen_am as string | null,
    }))
  }

  const qualiSlots: QualiSlot[] = conditionalSlots.map(s => {
    const row = slotRows.find(r => r.slotId === s.slotId)
    return {
      slotId: s.slotId,
      label: s.label,
      quali: s.quali,
      pflicht: s.pflicht,
      status: row?.status ?? null,
      hochgeladenAm: row?.hochgeladenAm ?? null,
      nummer: s.nummer,
      nummerLabel: s.nummerLabel,
    }
  })

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
        <div className="w-10 h-10 rounded-full bg-[var(--brand-secondary)]/10 text-[var(--brand-primary)] flex items-center justify-center">
          <ShieldCheckIcon className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-primary)]">Verifizierung</h1>
          <p className="text-sm text-gray-600">Status Ihrer Zulassungs-Unterlagen</p>
        </div>
      </header>

      {/* Tier 1: SA-Vorlage */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--brand-primary)]">Tier 1 — SA-Vorlage</h2>
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
            <h2 className="text-base font-semibold text-[var(--brand-primary)]">Tier 2 — Verifizierungs-Unterlagen</h2>
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

      {/* AAR-515 + AAR-647: Abtretungs-Pflicht + Conditional Tier-2-Slots */}
      {qualiSlots.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--brand-primary)]">Pflicht-Dokumente &amp; Qualifikations-Nachweise</h2>
            <p className="text-xs text-gray-500">
              Abtretungen sind im Onboarding verpflichtend. Qualifikations-Nachweise erscheinen in der Kundenkommunikation erst nach Admin-Freigabe.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {qualiSlots.map(slot => {
              const istFreigegeben = slot.status === 'geprueft'
              const istHochgeladen = slot.status === 'hochgeladen' || !!slot.hochgeladenAm
              return (
                <div key={slot.slotId} className="py-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#4573A2]/10 flex items-center justify-center shrink-0">
                      <FileTextIcon className="w-4 h-4 text-[#4573A2]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {slot.label}
                        {slot.pflicht && (
                          <span className="ml-2 text-[10px] text-red-600 font-semibold">Pflicht</span>
                        )}
                      </p>
                      {slot.quali ? (
                        <p className="text-[11px] text-gray-500">
                          Schaltet Quali „{slot.quali}" in Kundenkommunikation frei
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-500">
                          Wird vom Admin geprüft und freigegeben
                        </p>
                      )}
                      {slot.nummer && (
                        <p className="text-[11px] text-gray-600 mt-1 flex items-center gap-1">
                          <IdCardIcon className="w-3 h-3" />
                          {slot.nummerLabel}: <span className="font-mono">{slot.nummer}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <QualiSlotBadge status={slot.status} hochgeladenAm={slot.hochgeladenAm} />
                    {/* AAR-647: Upload-Button pro Slot — disable nach Freigabe */}
                    <QualiSlotUpload
                      slotId={slot.slotId}
                      disabled={istFreigegeben}
                      label={istHochgeladen ? 'Neu hochladen' : 'Hochladen'}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Pro Upload wird automatisch ein Prüf-Task beim Admin erstellt. Nach Freigabe ändert sich der Status auf „Freigegeben".
          </p>
        </section>
      )}

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

// AAR-515: Badge für Qualifikations-Nachweis-Slots.
// Status-Werte aus pflichtdokumente.status: null (noch nicht angefordert),
// 'ausstehend' (angefordert, wartet auf Upload), 'hochgeladen' (SV hat
// hochgeladen, wartet auf Admin-Review), 'geprueft' (freigegeben),
// 'abgelehnt' (Admin hat abgelehnt).
function QualiSlotBadge({ status, hochgeladenAm }: { status: string | null; hochgeladenAm: string | null }) {
  if (status === 'geprueft') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium shrink-0">
        <CheckCircleIcon className="w-3 h-3" /> Freigegeben
      </span>
    )
  }
  if (status === 'abgelehnt') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-medium shrink-0">
        <XCircleIcon className="w-3 h-3" /> Abgelehnt
      </span>
    )
  }
  if (status === 'hochgeladen' || hochgeladenAm) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium shrink-0">
        <ClockIcon className="w-3 h-3" /> In Prüfung
      </span>
    )
  }
  if (status === 'ausstehend') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium shrink-0">
        <ClockIcon className="w-3 h-3" /> Upload offen
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium shrink-0">
      Noch nicht angefordert
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
