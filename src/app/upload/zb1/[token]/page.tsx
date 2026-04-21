// AAR-296 W1: Server-Component für /upload/zb1/[token].
// Validiert Token + Status — entweder Upload-UI oder Status-Screen.

import { getZb1TokenStatus } from './actions'
import Zb1UploadClient from './Zb1UploadClient'

export default async function Zb1UploadPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const status = await getZb1TokenStatus(token)

  if (!status.ok) {
    const cfg =
      status.reason === 'expired'
        ? { title: 'Link abgelaufen', text: 'Dieser Upload-Link ist nicht mehr gültig. Bitte kontaktieren Sie Ihren Ansprechpartner für einen neuen Link.' }
        : status.reason === 'already_uploaded'
          ? { title: 'Foto bereits empfangen', text: 'Wir haben Ihren Fahrzeugschein bereits erhalten. Falls Sie ein neues Foto schicken möchten, kontaktieren Sie bitte Ihren Ansprechpartner.' }
          : { title: 'Link nicht gültig', text: 'Dieser Upload-Link ist ungültig. Bitte prüfen Sie die URL oder kontaktieren Sie Ihren Ansprechpartner.' }
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-md w-full p-8 text-center space-y-3">
          <div className="text-3xl">⚠</div>
          <h1 className="text-lg font-semibold text-gray-900">{cfg.title}</h1>
          <p className="text-sm text-gray-600">{cfg.text}</p>
        </div>
      </div>
    )
  }

  return <Zb1UploadClient token={token} vorname={status.vorname ?? ''} />
}
