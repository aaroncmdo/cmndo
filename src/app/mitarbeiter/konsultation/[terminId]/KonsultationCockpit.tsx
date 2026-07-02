'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives/Button'
import PhoneButton from '@/components/shared/PhoneButton'
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { sendeKonsultationsFlowLink, protokolliereKonsultation } from './actions'
import type { KonsultationDisposition } from './types'

export type Lead = {
  id: string; vorname: string | null; nachname: string | null; telefon: string | null; email: string | null
  service_typ: string | null; schadentyp: string | null; schadentyp_freitext: string | null
  schadens_hergang: string | null; unfalldatum: string | null; unfallort: string | null; kennzeichen: string | null
  fahrzeug_hersteller: string | null; fahrzeug_modell: string | null; fahrzeug_baujahr: number | null
  qualifizierungs_phase: string | null; status: string | null
  flow_link_geoeffnet: boolean | null; flow_link_abgeschlossen: boolean | null
  anruf_versuche: number | null; letzter_anruf_status: string | null; notiz: string | null
} | null

export type FlowLink = {
  gesendet_am: string | null; gesendet_kanal: string | null; gesendet_anzahl: number | null
  geoeffnet_am: string | null; abgeschlossen_am: string | null
} | null

type Props = {
  termin: { id: string; startZeit: string; status: string; kanal: string | null; notizIntern: string | null; durchgefuehrtAm: string | null }
  lead: Lead
  flowLink: FlowLink
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
    }).format(new Date(iso))
  } catch { return iso }
}

const PHASE_LABEL: Record<string, string> = {
  neu: 'Neu — noch nicht gestartet',
  'flow-versendet': 'FlowLink versendet',
  'flow-gesendet': 'FlowLink gesendet',
}

export function KonsultationCockpit({ termin, lead, flowLink }: Props) {
  const [sending, setSending] = useState<string | null>(null)
  const [status, setStatus] = useState(termin.status)
  const [startZeit, setStartZeit] = useState(termin.startZeit)
  const [durchgefuehrt, setDurchgefuehrt] = useState<boolean>(!!termin.durchgefuehrtAm)
  const [dispo, setDispo] = useState<KonsultationDisposition | null>(null)
  const [notiz, setNotiz] = useState('')
  const [neuLokal, setNeuLokal] = useState('')
  const [logging, setLogging] = useState(false)

  const name = [lead?.vorname, lead?.nachname].filter(Boolean).join(' ') || 'Unbekannter Kunde'
  const fahrzeug = [lead?.fahrzeug_hersteller, lead?.fahrzeug_modell, lead?.fahrzeug_baujahr].filter(Boolean).join(' ')
  const schaden = lead?.schadentyp_freitext || lead?.schadentyp || lead?.schadens_hergang

  async function resend(kanal: 'whatsapp' | 'sms' | 'email') {
    setSending(kanal)
    try {
      const r = await sendeKonsultationsFlowLink(termin.id, kanal)
      if (!r.ok) { toast.error(r.error ?? 'Versand fehlgeschlagen'); return }
      toast.success(`FlowLink per ${kanal === 'whatsapp' ? 'WhatsApp' : kanal === 'sms' ? 'SMS' : 'Email'} gesendet`)
    } finally { setSending(null) }
  }

  async function logge() {
    if (!dispo) return
    setLogging(true)
    try {
      const neuIso = dispo === 'verschoben' && neuLokal ? berlinWallClockToUtc(neuLokal) : undefined
      if (dispo === 'verschoben' && !neuIso) { toast.error('Bitte neuen Termin wählen'); return }
      const r = await protokolliereKonsultation(termin.id, dispo, notiz || undefined, neuIso)
      if (!r.ok) { toast.error(r.error ?? 'Speichern fehlgeschlagen'); return }
      toast.success('Ergebnis gespeichert')
      if (dispo === 'durchgefuehrt') setDurchgefuehrt(true)
      if (dispo === 'verschoben' && neuIso) { setStartZeit(neuIso); setStatus('bestaetigt') }
      setDispo(null); setNotiz(''); setNeuLokal('')
    } finally { setLogging(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-heading-lg font-bold text-claimondo-navy">Beratungstermin</h1>
        <p className="mt-0.5 text-body-sm text-claimondo-ondo">Konsultation mit {name}</p>
      </div>

      {/* Kunde-Karte */}
      <section className="rounded-ios-md border border-claimondo-border bg-white p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-body font-semibold text-claimondo-navy">{name}</p>
            {lead?.email && <p className="text-body-sm text-claimondo-ondo">{lead.email}</p>}
          </div>
          {lead?.telefon && (
            <PhoneButton nummer={lead.telefon} mode="aircall" variant="card" leadId={lead.id} label="Anrufen" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-body-sm">
          {fahrzeug && <p><span className="text-claimondo-ondo">Fahrzeug:</span> {fahrzeug}</p>}
          {lead?.kennzeichen && <p><span className="text-claimondo-ondo">Kennzeichen:</span> {lead.kennzeichen}</p>}
          {schaden && <p className="col-span-2"><span className="text-claimondo-ondo">Schaden:</span> {schaden}</p>}
          {lead?.unfallort && <p><span className="text-claimondo-ondo">Unfallort:</span> {lead.unfallort}</p>}
          {lead?.unfalldatum && <p><span className="text-claimondo-ondo">Unfalldatum:</span> {fmt(lead.unfalldatum)}</p>}
        </div>
        {lead?.notiz && <p className="text-body-sm text-claimondo-shield/80 border-t border-claimondo-border pt-2">{lead.notiz}</p>}
      </section>

      {/* Stand */}
      <section className="rounded-ios-md border border-claimondo-border bg-white p-5 space-y-2">
        <p className="text-caption uppercase tracking-wider text-claimondo-ondo">Stand</p>
        <p className="text-body-sm text-claimondo-navy">
          {(lead?.qualifizierungs_phase && PHASE_LABEL[lead.qualifizierungs_phase]) || lead?.qualifizierungs_phase || lead?.status || 'Unbekannt'}
        </p>
        <p className="text-body-sm text-claimondo-ondo">
          {flowLink?.gesendet_am
            ? `FlowLink zuletzt gesendet: ${fmt(flowLink.gesendet_am)}${flowLink.gesendet_kanal ? ` via ${flowLink.gesendet_kanal}` : ''}${flowLink.gesendet_anzahl ? ` (${flowLink.gesendet_anzahl}×)` : ''}`
            : 'FlowLink noch nie gesendet'}
          {flowLink?.geoeffnet_am && ' · geöffnet'}
          {flowLink?.abgeschlossen_am && ' · abgeschlossen'}
        </p>
      </section>

      {/* Termin-Info */}
      <section className="rounded-ios-md border border-claimondo-border bg-white p-5">
        <p className="text-caption uppercase tracking-wider text-claimondo-ondo mb-1">Termin</p>
        <p className="text-body font-semibold text-claimondo-navy">{fmt(startZeit)}</p>
        <p className="text-body-sm text-claimondo-ondo">
          {termin.kanal === 'video' ? 'Video-Call' : 'Telefon'} · {durchgefuehrt ? 'durchgeführt' : status}
        </p>
      </section>

      {/* Aktion: FlowLink erneut senden */}
      <section className="rounded-ios-md border border-claimondo-border bg-white p-5 space-y-3">
        <p className="text-caption uppercase tracking-wider text-claimondo-ondo">FlowLink erneut senden</p>
        <p className="text-body-sm text-claimondo-ondo">Der Kunde schließt den Flow selbst ab (Termin, Auftrag, alles Weitere).</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="ondo" loading={sending === 'whatsapp'} disabled={!lead?.telefon || !!sending} onClick={() => resend('whatsapp')}>WhatsApp</Button>
          <Button variant="ghost" loading={sending === 'sms'} disabled={!lead?.telefon || !!sending} onClick={() => resend('sms')}>SMS</Button>
          <Button variant="ghost" loading={sending === 'email'} disabled={!lead?.email || !!sending} onClick={() => resend('email')}>Email</Button>
        </div>
      </section>

      {/* Aktion: Ergebnis loggen */}
      <section className="rounded-ios-md border border-claimondo-border bg-white p-5 space-y-3">
        <p className="text-caption uppercase tracking-wider text-claimondo-ondo">Gesprächsergebnis</p>
        <div className="flex flex-wrap gap-2">
          {(['durchgefuehrt', 'nicht_erreicht', 'verschoben'] as KonsultationDisposition[]).map((d) => (
            <Button key={d} variant={dispo === d ? 'navy' : 'ghost'} disabled={logging} onClick={() => setDispo(d)}>
              {d === 'durchgefuehrt' ? 'Durchgeführt' : d === 'nicht_erreicht' ? 'Nicht erreicht' : 'Verschieben'}
            </Button>
          ))}
        </div>
        {dispo === 'verschoben' && (
          <WunschterminPicker value={neuLokal} onChange={setNeuLokal} />
        )}
        {dispo && (
          <>
            <textarea
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              placeholder="Notiz (optional)"
              rows={2}
              className="w-full rounded-ios-md border border-claimondo-border p-2 text-body-sm"
            />
            <div className="flex gap-2">
              <Button variant="ondo" loading={logging} disabled={dispo === 'verschoben' && !neuLokal} onClick={logge}>Speichern</Button>
              <Button variant="ghost" disabled={logging} onClick={() => { setDispo(null); setNotiz(''); setNeuLokal('') }}>Abbrechen</Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
