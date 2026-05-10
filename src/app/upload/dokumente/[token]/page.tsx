// AAR-352: Server-Component für /upload/dokumente/[token].
// Validiert Token + Status — entweder Multi-Slot-Upload-UI oder Status-Screen.

import { getDokumenteAnfrageStatus } from './actions'
import MultiSlotUploadClient from './MultiSlotUploadClient'

export default async function DokumenteUploadPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const status = await getDokumenteAnfrageStatus(token)

  if (!status.ok) {
    // AAR-706: Bei `already_complete` zeigen wir eine schlichte
    // Bestätigungs-Page statt einer Warn-Box mit „Bitte kontaktieren
    // Sie Ihren Ansprechpartner". Der Kunde hat seinen Job gemacht —
    // ein freundliches Danke ist die richtige Antwort.
    if (status.reason === 'already_complete') {
      return (
        <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-sm border border-claimondo-border max-w-md w-full p-10 text-center space-y-4">
            <div className="text-5xl">✓</div>
            <h1 className="text-xl font-semibold text-claimondo-navy">Vielen Dank!</h1>
          </div>
        </div>
      )
    }

    const cfg =
      status.reason === 'expired'
        ? { title: 'Link abgelaufen', text: 'Dieser Upload-Link ist nicht mehr gültig. Bitte kontaktieren Sie Ihren Ansprechpartner für einen neuen Link.' }
        : { title: 'Link nicht gültig', text: 'Dieser Upload-Link ist ungültig. Bitte prüfen Sie die URL oder kontaktieren Sie Ihren Ansprechpartner.' }
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-claimondo-border max-w-md w-full p-8 text-center space-y-3">
          <div className="text-3xl">⚠</div>
          <h1 className="text-lg font-semibold text-claimondo-navy">{cfg.title}</h1>
          <p className="text-sm text-claimondo-ondo">{cfg.text}</p>
        </div>
      </div>
    )
  }

  return (
    <MultiSlotUploadClient
      token={token}
      vorname={status.vorname ?? ''}
      slots={status.slots}
    />
  )
}
