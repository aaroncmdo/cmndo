// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, InfoTable, Divider, APP_URL } from './layout'
import { Text } from '@react-email/components'

// AAR-927: Post-Faelligkeit-Mahnung an SVs. Wird vom Cron sv-mahnung-saeumnis
// ausgeloest wenn eine SV-Abrechnung 14/21/28 Tage ueberfaellig ist.
// Pre-Faelligkeit-Reminders (T-7/T-3/T-1) sitzen in AbrechnungReminder.tsx,
// Auto-Einzug in cron/abrechnung-einzug.

type Stufe = 'mahnung_14d' | 'mahnung_21d' | 'mahnung_28d'

type Props = {
  vorname: string | null
  abrechnungs_nr: string
  summe_brutto: number
  faellig_am: string  // 'YYYY-MM-DD'
  tage_ueberfaellig: number
  stufe: Stufe
}

export function subject(p: Props): string {
  switch (p.stufe) {
    case 'mahnung_14d':
      return `Mahnung 1: Abrechnung ${p.abrechnungs_nr} seit ${p.tage_ueberfaellig} Tagen überfällig`
    case 'mahnung_21d':
      return `Mahnung 2: Abrechnung ${p.abrechnungs_nr} weiterhin offen`
    case 'mahnung_28d':
      return `Letzte Mahnung: Abrechnung ${p.abrechnungs_nr} — Inkasso droht`
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatEuro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
}

export function SvMahnungSaeumnisEmail(props: Props) {
  const greeting = props.vorname ? `Hallo ${props.vorname},` : 'Hallo,'

  const koerper = (() => {
    switch (props.stufe) {
      case 'mahnung_14d':
        return (
          <>
            <Paragraph>
              unsere Abrechnung <strong>{props.abrechnungs_nr}</strong> ist seit <strong>{props.tage_ueberfaellig} Tagen</strong> überfällig.
              Falls die Lastschrift bei dir fehlgeschlagen ist oder du den offenen Betrag manuell überwiesen hast, prüfe bitte deine
              Zahlungsmethode im Portal oder melde dich bei uns.
            </Paragraph>
            <Paragraph>
              Bitte überweise den offenen Betrag oder hinterlege eine funktionierende Zahlungsmethode innerhalb der nächsten 7 Tage,
              damit wir keine weiteren Schritte einleiten müssen.
            </Paragraph>
          </>
        )
      case 'mahnung_21d':
        return (
          <>
            <Paragraph>
              die Abrechnung <strong>{props.abrechnungs_nr}</strong> ist weiterhin offen und mittlerweile <strong>{props.tage_ueberfaellig} Tage</strong> überfällig.
              Dies ist die zweite Mahnung.
            </Paragraph>
            <Paragraph>
              Falls bis zum {formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())} keine Zahlung eingeht,
              setzen wir deinen Portal-Zugang aus und übergeben den Fall an unser Inkasso.
            </Paragraph>
          </>
        )
      case 'mahnung_28d':
        return (
          <>
            <Paragraph>
              <strong>Letzte Mahnung.</strong> Die Abrechnung <strong>{props.abrechnungs_nr}</strong> ist seit
              <strong> {props.tage_ueberfaellig} Tagen</strong> überfällig und wir haben dich bereits mehrfach erinnert.
            </Paragraph>
            <Paragraph>
              Wenn bis zum {formatDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString())} keine Zahlung eingeht,
              übergeben wir den Vorgang an unser Inkasso und setzen deinen Portal-Zugang aus.
              Etwaige zusätzliche Kosten gehen zu deinen Lasten.
            </Paragraph>
          </>
        )
    }
  })()

  return (
    <EmailLayout preview={`Mahnung: Abrechnung ${props.abrechnungs_nr} seit ${props.tage_ueberfaellig} Tagen überfällig`}>
      <Heading>{greeting}</Heading>
      {koerper}

      <Divider />
      <Heading>Details</Heading>
      <InfoTable rows={[
        ['Rechnungsnummer', props.abrechnungs_nr],
        ['Fällig war', formatDate(props.faellig_am)],
        ['Tage überfällig', String(props.tage_ueberfaellig)],
        ['Endbetrag (brutto)', formatEuro(props.summe_brutto)],
      ]} />

      <Divider />
      <Paragraph>
        Rückfragen oder Klärungsbedarf? Schreib uns an <strong>aaron.sprafke@claimondo.de</strong>.
      </Paragraph>
      <Text style={{ color: '#6b7280', fontSize: 12, margin: '16px 0 0', fontStyle: 'italic' }}>
        Diese Mahnung wurde automatisch erstellt nach 14/21/28 Tagen Verzug.
      </Text>
      <Text style={{ color: '#6b7280', fontSize: 11, margin: '8px 0 0' }}>
        <a href={`${APP_URL}/gutachter/abrechnung`} style={{ color: '#4573A2' }}>Zur Abrechnungs-Übersicht im Portal</a>
      </Text>
    </EmailLayout>
  )
}
