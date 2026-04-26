import { notFound } from 'next/navigation'
import { validateAirdropToken } from './actions'
import GegnerDashboard from './_components/GegnerDashboard'

interface Props {
  params: Promise<{ token: string }>
}

const FEHLER_TEXTE: Record<string, { titel: string; text: string }> = {
  UNGUELTIG: {
    titel: 'Ungültiger Link',
    text: 'Dieser Einladungslink ist nicht gültig. Bitte prüfen Sie, ob Sie den vollständigen Link verwendet haben.',
  },
  ABGELAUFEN: {
    titel: 'Link abgelaufen',
    text: 'Dieser Einladungslink ist leider abgelaufen (Gültigkeit: 7 Tage). Bitte wenden Sie sich an den Absender.',
  },
  WIDERRUFEN: {
    titel: 'Link nicht mehr gültig',
    text: 'Dieser Einladungslink wurde zurückgezogen. Bitte wenden Sie sich an den Absender.',
  },
  BEREITS_KONVERTIERT: {
    titel: 'Bereits abgeschlossen',
    text: 'Sie haben Ihre Daten bereits erfolgreich übermittelt.',
  },
}

export default async function GegnerTokenPage({ params }: Props) {
  const { token } = await params

  if (!token || token.length < 8) notFound()

  const result = await validateAirdropToken(token)

  if (!result.ok) {
    const info = FEHLER_TEXTE[result.error] ?? FEHLER_TEXTE['UNGUELTIG']
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"
          style={{ backgroundColor: '#fef2f2' }}
        >
          ✕
        </div>
        <h1 className="text-lg font-semibold mb-2" style={{ color: '#0D1B3E' }}>
          {info.titel}
        </h1>
        <p className="text-sm text-gray-600">{info.text}</p>
      </div>
    )
  }

  return (
    <GegnerDashboard
      invitationId={result.invitation_id}
      tokenKlartext={token}
      claim={result.claim}
      alreadyResponded={result.already_responded}
    />
  )
}
