// AAR-956 WP-B (Task 9): Fallback fuer Werkstaetten ohne aktiven Status.
// Wird vom Shell-Layout angesteuert wenn status != 'aktiv'.

export default function WerkstattPendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-claimondo-bg p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-heading-md font-bold text-claimondo-navy">
          Ihr Betrieb wird noch aktiviert
        </h1>
        <p className="text-body text-claimondo-ondo">
          Ihr Werkstatt-Zugang ist derzeit noch nicht freigegeben. Sobald wir
          Ihre Registrierung geprüft haben, erhalten Sie eine Benachrichtigung
          per E-Mail.
        </p>
        <p className="text-body-sm text-claimondo-shield">
          Bei Fragen wenden Sie sich an{' '}
          <a
            href="mailto:support@claimondo.de"
            className="text-claimondo-ondo underline underline-offset-2"
          >
            support@claimondo.de
          </a>
          .
        </p>
      </div>
    </div>
  )
}
