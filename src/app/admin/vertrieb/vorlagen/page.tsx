// Vertrieb-Konsole: Mail-Vorlagen-Verwaltung. RSC laedt die DB-Vorlagen (Staff-gegatet),
// Client rendert die editierbaren Formulare. Vollstaendig DB-driven (D5).
import { getVertriebMailVorlagen } from '../_actions/mail-vorlagen'
import MailVorlagenClient from './MailVorlagenClient'

export const dynamic = 'force-dynamic'

export default async function VorlagenPage() {
  const res = await getVertriebMailVorlagen()
  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl">
      <h2 className="text-heading-sm text-claimondo-navy mb-1">Mail-Vorlagen</h2>
      <p className="text-caption text-claimondo-ondo/70 mb-4">
        Vorstellungs-Mail &amp; Terminbestätigung — Betreff und Text hier editierbar, ohne Deploy. Platzhalter:{' '}
        <code>{'{{Ansprechpartner}}'}</code>, <code>{'{{Firma}}'}</code>, <code>{'{{Termin}}'}</code>.
      </p>
      {res.ok ? (
        <MailVorlagenClient vorlagen={res.data} />
      ) : (
        <p className="text-sm text-danger">{res.error}</p>
      )}
    </div>
  )
}
