import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CheckCircleIcon, ClockIcon, XCircleIcon, AlertTriangleIcon, FileTextIcon, IdCardIcon } from 'lucide-react'
import QualiSlotUpload from './QualiSlotUpload'

// AAR-359 W5 + AAR-515 v4.1 + AAR-360: Verifizierungs-Übersicht für SVs.
// Read-only — zeigt die Tier-2-Frist plus die conditional Tier-2-Slots
// die sich aus der Quali-Auswahl ergeben:
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
      'id, verifizierung_status, verifizierung_frist_bis, verifizierung_admin_notiz, verifiziert_am, qualifikationen_neu, gutachter_typ, bvsk_mitgliedsnummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer',
    )
    .eq('profile_id', user.id)
    // multi-standort-safe: Ordering+limit(1) wie getGutachterForUser (sonst
    // maybeSingle-Fehler bei >1 SV-Row -> sv=null -> Redirect /willkommen).
    .order('ist_parent_account', { ascending: true, nullsFirst: true })
    .order('paket_faelle_gesamt', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (!sv) redirect('/gutachter/willkommen')

  // AAR-515: Conditional Slots abhängig von Quali-Auswahl + gutachter_typ
  // AAR-647: Plus fixe Abtretungs-Slots die jeder SV im Onboarding hochlädt
  const qualis = (sv.qualifikationen_neu as string[] | null) ?? []
  const conditionalSlots: Array<{ slotId: string; label: string; quali: string | null; nummer: string | null; nummerLabel: string | null; pflicht: boolean }> = []

  // AAR-647 / AAR-714: Pflicht-Dokumente für jeden SV, unabhängig von Quali.
  // Sicherungsabtretung ODER Honorarvereinbarung reicht (Client entscheidet),
  // Datenschutz + Widerruf sind immer Pflicht.
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
    {
      slotId: 'sv_honorarvereinbarung',
      label: 'Honorarvereinbarung',
      quali: null,
      nummer: null,
      nummerLabel: null,
      pflicht: true,
    },
    {
      slotId: 'sv_datenschutzerklaerung',
      label: 'Datenschutzerklärung',
      quali: null,
      nummer: null,
      nummerLabel: null,
      pflicht: true,
    },
    {
      slotId: 'sv_widerrufsbelehrung',
      label: 'Widerrufsbelehrung',
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
      {/* Tier 2: 14-Tage-Dokumente */}
      <section className="bg-white rounded-2xl border border-claimondo-border p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--brand-primary)]">Tier 2 — Verifizierungs-Unterlagen</h2>
            <p className="text-xs text-claimondo-ondo">
              Berufshaftpflicht, Gewerbeanmeldung und ggf. Bestellungsurkunde. 14-Tage-Frist ab Anzahlung.
            </p>
          </div>
          <StatusBadge status={sv.verifizierung_status} />
        </div>

        {sv.verifizierung_status === null && (
          <p className="text-sm text-claimondo-navy bg-claimondo-bg rounded-ios-lg px-3 py-2">
            Die Frist startet automatisch nach Eingang Ihrer Anzahlung.
          </p>
        )}
        {sv.verifizierung_status === 'ausstehend' && sv.verifizierung_frist_bis && tageOffen !== null && (
          <div className={`text-sm rounded-ios-lg px-3 py-2 ${tageOffen <= 4 ? 'bg-warning-soft text-warning-strong' : 'bg-claimondo-bg text-claimondo-ondo'}`}>
            <p className="font-medium">
              Frist: {formatDatum(sv.verifizierung_frist_bis)} — noch {tageOffen} Tag{tageOffen === 1 ? '' : 'e'} offen
            </p>
            <p className="text-xs mt-0.5 opacity-90">Der Upload-Bereich wird in Kürze freigeschaltet.</p>
          </div>
        )}
        {sv.verifizierung_status === 'frist_ueberschritten' && (
          <div className="text-sm bg-danger-soft rounded-ios-lg px-3 py-2 space-y-1">
            <p className="text-danger-strong font-medium">Frist überschritten</p>
            <p className="text-danger text-xs">
              Bitte reichen Sie die fehlenden Unterlagen umgehend nach, damit Ihr Dispatch-Zugang nicht gesperrt wird.
            </p>
          </div>
        )}
        {sv.verifizierung_status === 'geprueft' && (
          <p className="text-sm text-success-strong bg-success-soft rounded-ios-lg px-3 py-2">
            Vollständig verifiziert{sv.verifiziert_am ? ` am ${formatDatum(sv.verifiziert_am)}` : ''}.
          </p>
        )}
      </section>

      {/* AAR-515 + AAR-647: Abtretungs-Pflicht + Conditional Tier-2-Slots */}
      {qualiSlots.length > 0 && (
        <section className="bg-white rounded-2xl border border-claimondo-border p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--brand-primary)]">Pflicht-Dokumente &amp; Qualifikations-Nachweise</h2>
            <p className="text-xs text-claimondo-ondo">
              Abtretungen sind im Onboarding verpflichtend. Qualifikations-Nachweise erscheinen in der Kundenkommunikation erst nach Admin-Freigabe.
            </p>
          </div>

          <div className="divide-y divide-claimondo-border">
            {qualiSlots.map(slot => {
              const istFreigegeben = slot.status === 'geprueft'
              const istHochgeladen = slot.status === 'hochgeladen' || !!slot.hochgeladenAm
              return (
                <div key={slot.slotId} className="py-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-ios-lg bg-claimondo-ondo/10 flex items-center justify-center shrink-0">
                      <FileTextIcon className="w-4 h-4 text-claimondo-ondo" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-claimondo-navy">
                        {slot.label}
                        {slot.pflicht && (
                          <span className="ml-2 text-[10px] text-danger font-semibold">Pflicht</span>
                        )}
                      </p>
                      {slot.quali ? (
                        <p className="text-[11px] text-claimondo-ondo">
                          Schaltet Quali „{slot.quali}" in Kundenkommunikation frei
                        </p>
                      ) : (
                        <p className="text-[11px] text-claimondo-ondo">
                          Wird vom Admin geprüft und freigegeben
                        </p>
                      )}
                      {slot.nummer && (
                        <p className="text-[11px] text-claimondo-ondo mt-1 flex items-center gap-1">
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

          <p className="text-[11px] text-claimondo-ondo bg-claimondo-bg rounded-ios-lg px-3 py-2">
            Pro Upload wird automatisch ein Prüf-Task beim Admin erstellt. Nach Freigabe ändert sich der Status auf „Freigegeben".
          </p>
        </section>
      )}

      <p className="text-xs text-claimondo-ondo text-center">
        Fragen zur Verifizierung? Melden Sie sich beim Support.
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (status === 'geprueft') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-success-soft text-success-strong text-xs font-medium">
        <CheckCircleIcon className="w-3.5 h-3.5" /> Freigegeben
      </span>
    )
  }
  if (status === 'ausstehend') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-warning-soft text-warning-strong text-xs font-medium">
        <ClockIcon className="w-3.5 h-3.5" /> Ausstehend
      </span>
    )
  }
  if (status === 'zurueckgewiesen') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-danger-soft text-danger-strong text-xs font-medium">
        <XCircleIcon className="w-3.5 h-3.5" /> Zurückgewiesen
      </span>
    )
  }
  if (status === 'frist_ueberschritten') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-danger-soft text-danger-strong text-xs font-medium">
        <AlertTriangleIcon className="w-3.5 h-3.5" /> Frist abgelaufen
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-claimondo-bg text-claimondo-ondo text-xs font-medium">
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success-soft text-success-strong text-[10px] font-medium shrink-0">
        <CheckCircleIcon className="w-3 h-3" /> Freigegeben
      </span>
    )
  }
  if (status === 'abgelehnt') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger-soft text-danger-strong text-[10px] font-medium shrink-0">
        <XCircleIcon className="w-3 h-3" /> Abgelehnt
      </span>
    )
  }
  if (status === 'hochgeladen' || hochgeladenAm) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-claimondo-bg text-claimondo-ondo text-[10px] font-medium shrink-0">
        <ClockIcon className="w-3 h-3" /> In Prüfung
      </span>
    )
  }
  if (status === 'ausstehend') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-soft text-warning-strong text-[10px] font-medium shrink-0">
        <ClockIcon className="w-3 h-3" /> Upload offen
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-claimondo-bg text-claimondo-ondo text-[10px] font-medium shrink-0">
      Noch nicht angefordert
    </span>
  )
}

function formatDatum(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
