import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CheckCircleIcon, ClockIcon, XCircleIcon, FileTextIcon, IdCardIcon } from 'lucide-react'
import QualiSlotUpload from './QualiSlotUpload'

// AAR-359 W5 + AAR-515 v4.1 + AAR-360: Nachweise-Übersicht für SVs.
//
// 19.09.2026 (Aaron): „ich möchte nicht mehr verifizieren und ich möchte auch nicht mehr
// nachhalten müssen, ob die Dokumente fehlen oder nicht … wenn Dokumente fehlen, soll der
// Sachverständige trotzdem angezeigt werden und sogar auch buchbar sein." Diese Seite ist
// seitdem KEIN Gate mehr: keine 14-Tage-Frist, kein „Dispatch-Zugang gesperrt", kein Prüf-Task
// je Upload. Sie zeigt den Stand und nimmt Dokumente an — jederzeit, ohne Bedingung.
//
// Slots:
//   - Nachweise: sv_berufshaftpflicht, sv_gewerbeanmeldung (Akte bei Claimondo)
//   - Kunden-Unterlagen: sv_sicherungsabtretung | sv_honorarvereinbarung, sv_datenschutzerklaerung,
//     sv_widerrufsbelehrung (werden dem Kunden im FlowLink vorgelegt + mit-signiert, sobald da)
//   - Qualifikations-Nachweise (conditional aus der Quali-Auswahl): BVSK, IHK, ö.b.u.v., DAT

type QualiSlot = {
  slotId: string
  label: string
  quali: string | null
  status: string | null
  hochgeladenAm: string | null
  nummer: string | null
  nummerLabel: string | null
  /** Wirkt im Kundenflow (SA-Tool/FlowLink) — im Gegensatz zu Nachweisen und Quali-Belegen. */
  kundenflow: boolean
}

export default async function VerifizierungPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select(
      'id, verifizierung_status, verifiziert_am, qualifikationen_neu, gutachter_typ, bvsk_mitgliedsnummer, ihk_zertifikat_nummer, oebuv_bestellungsnummer',
    )
    .eq('profile_id', user.id)
    // multi-standort-safe: Ordering+limit(1) wie getGutachterForUser (sonst
    // maybeSingle-Fehler bei >1 SV-Row -> sv=null -> Redirect /willkommen).
    .order('ist_parent_account', { ascending: true, nullsFirst: true })
    .order('paket_faelle_gesamt', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (!sv) redirect('/gutachter/willkommen')

  const qualis = (sv.qualifikationen_neu as string[] | null) ?? []
  const slotDefs: Array<{ slotId: string; label: string; quali: string | null; nummer: string | null; nummerLabel: string | null; kundenflow: boolean }> = []

  slotDefs.push(
    { slotId: 'sv_berufshaftpflicht', label: 'Berufshaftpflicht', quali: null, nummer: null, nummerLabel: null, kundenflow: false },
    { slotId: 'sv_gewerbeanmeldung', label: 'Gewerbeanmeldung', quali: null, nummer: null, nummerLabel: null, kundenflow: false },
  )

  // AAR-647 / AAR-714: Kunden-Unterlagen. Sicherungsabtretung ODER Honorarvereinbarung reicht,
  // Datenschutz + Widerruf werden dem Kunden vorgelegt — alle vier nur, wenn hochgeladen.
  slotDefs.push(
    { slotId: 'sv_abtretungserklaerung', label: 'Sachverständigen-Abtretungserklärung', quali: null, nummer: null, nummerLabel: null, kundenflow: false },
    { slotId: 'sv_sicherungsabtretung', label: 'Sicherungsabtretung', quali: null, nummer: null, nummerLabel: null, kundenflow: true },
    { slotId: 'sv_honorarvereinbarung', label: 'Honorarvereinbarung', quali: null, nummer: null, nummerLabel: null, kundenflow: true },
    { slotId: 'sv_datenschutzerklaerung', label: 'Datenschutzerklärung', quali: null, nummer: null, nummerLabel: null, kundenflow: true },
    { slotId: 'sv_widerrufsbelehrung', label: 'Widerrufsbelehrung', quali: null, nummer: null, nummerLabel: null, kundenflow: true },
  )

  if (qualis.includes('BVSK-Mitglied')) {
    slotDefs.push({ slotId: 'sv_bvsk_mitgliedschaft', label: 'BVSK-Mitgliedschaft', quali: 'BVSK-Mitglied', nummer: sv.bvsk_mitgliedsnummer ?? null, nummerLabel: 'BVSK-Mitgliedsnummer', kundenflow: false })
  }
  if (qualis.includes('IHK-zertifiziert')) {
    slotDefs.push({ slotId: 'sv_ihk_zertifikat', label: 'IHK-Zertifikat', quali: 'IHK-zertifiziert', nummer: sv.ihk_zertifikat_nummer ?? null, nummerLabel: 'IHK-Zertifikats-Nummer', kundenflow: false })
  }
  if (qualis.includes('Öffentlich bestellt und vereidigt')) {
    slotDefs.push({ slotId: 'sv_bestellungsurkunde_oebuv', label: 'Bestellungsurkunde ö.b.u.v.', quali: 'Öffentlich bestellt und vereidigt', nummer: sv.oebuv_bestellungsnummer ?? null, nummerLabel: 'Bestellungsnummer', kundenflow: false })
  }
  if (sv.gutachter_typ === 'dat-gutachter') {
    slotDefs.push({ slotId: 'sv_dat_nachweis', label: 'DAT-Expert-Nachweis', quali: 'DAT-Expert', nummer: null, nummerLabel: 'DAT-Nummer', kundenflow: false })
  }

  // Seit Migration 2026-09-19 darf der SV seine eigenen pflichtdokumente-Zeilen lesen
  // (Policy-Zweig sv_id = eigener SV). Vorher lieferte dieser Read IMMER 0 Zeilen.
  const { data: pdRows } = await supabase
    .from('pflichtdokumente')
    .select('dokument_typ, status, hochgeladen_am')
    .eq('sv_id', sv.id)
    .in('dokument_typ', slotDefs.map((s) => s.slotId))
  const rowBySlot = new Map(
    (pdRows ?? []).map((r) => [r.dokument_typ as string, { status: r.status as string | null, hochgeladenAm: r.hochgeladen_am as string | null }]),
  )

  const qualiSlots: QualiSlot[] = slotDefs.map((s) => ({
    ...s,
    status: rowBySlot.get(s.slotId)?.status ?? null,
    hochgeladenAm: rowBySlot.get(s.slotId)?.hochgeladenAm ?? null,
  }))
  const anzahlDa = qualiSlots.filter((s) => s.status === 'hochgeladen' || s.status === 'geprueft').length

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      <section className="bg-white rounded-2xl border border-claimondo-border p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--brand-primary)]">Nachweise &amp; Unterlagen</h2>
            <p className="text-xs text-claimondo-ondo">
              Alles optional. Ihr Profil ist unabhängig davon freigeschaltet, auf der Karte sichtbar und buchbar.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-claimondo-bg text-claimondo-ondo text-xs font-medium" data-testid="nachweise-zaehler">
            {anzahlDa} von {qualiSlots.length} hochgeladen
          </span>
        </div>
        <p className="text-sm text-claimondo-navy bg-claimondo-bg rounded-ios-lg px-3 py-2">
          Sicherungsabtretung oder Honorarvereinbarung, Datenschutzerklärung und Widerrufsbelehrung legen wir
          Ihren Kunden bei der Unterschrift im Claimondo-Flow vor — sobald Sie sie hochgeladen haben. Fehlt ein
          Dokument, läuft die Unterschrift trotzdem; der Kunde sieht dann nur die Claimondo-Unterlagen.
        </p>
      </section>

      <section className="bg-white rounded-2xl border border-claimondo-border p-5 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--brand-primary)]">Dokumente</h2>
          <p className="text-xs text-claimondo-ondo">
            Hochgeladene Dokumente sind sofort aktiv und können jederzeit ersetzt werden. Qualifikations-Nachweise
            erscheinen in der Kundenkommunikation, sobald Claimondo sie freigegeben hat.
          </p>
        </div>

        <div className="divide-y divide-claimondo-border">
          {qualiSlots.map((slot) => {
            const istFreigegeben = slot.status === 'geprueft'
            const istHochgeladen = slot.status === 'hochgeladen' || !!slot.hochgeladenAm
            return (
              <div key={slot.slotId} className="py-3 flex items-start justify-between gap-3" data-slot-id={slot.slotId} data-slot-status={slot.status ?? 'leer'}>
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-ios-lg bg-claimondo-ondo/10 flex items-center justify-center shrink-0">
                    <FileTextIcon className="w-4 h-4 text-claimondo-ondo" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-claimondo-navy">{slot.label}</p>
                    {slot.quali ? (
                      <p className="text-[11px] text-claimondo-ondo">
                        Schaltet Quali „{slot.quali}“ in der Kundenkommunikation frei
                      </p>
                    ) : slot.kundenflow ? (
                      <p className="text-[11px] text-claimondo-ondo">
                        Wird Ihren Kunden im Flow vorgelegt — sofort nach dem Upload
                      </p>
                    ) : (
                      <p className="text-[11px] text-claimondo-ondo">Für Ihre Akte bei Claimondo</p>
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
                  <SlotBadge status={slot.status} hochgeladenAm={slot.hochgeladenAm} />
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
      </section>

      <p className="text-xs text-claimondo-ondo text-center">
        Fragen zu Ihren Unterlagen? Melden Sie sich beim Support.
      </p>
    </div>
  )
}

// Status-Werte aus pflichtdokumente.status: null (nichts da), 'ausstehend' (angefordert),
// 'hochgeladen' (da, sofort aktiv), 'geprueft' (von Claimondo freigegeben — nur für
// Quali-Nachweise relevant), 'abgelehnt'.
function SlotBadge({ status, hochgeladenAm }: { status: string | null; hochgeladenAm: string | null }) {
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
        <XCircleIcon className="w-3 h-3" /> Bitte erneut hochladen
      </span>
    )
  }
  if (status === 'hochgeladen' || hochgeladenAm) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success-soft text-success-strong text-[10px] font-medium shrink-0">
        <CheckCircleIcon className="w-3 h-3" /> Hochgeladen
      </span>
    )
  }
  if (status === 'ausstehend') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-soft text-warning-strong text-[10px] font-medium shrink-0">
        <ClockIcon className="w-3 h-3" /> Angefordert
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-claimondo-bg text-claimondo-ondo text-[10px] font-medium shrink-0">
      Noch nicht hochgeladen
    </span>
  )
}
