import type { ReactNode } from 'react'
import { Building2Icon, UserIcon, CreditCardIcon, GraduationCapIcon, UsersIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import type { OrganisationDetail } from '@/lib/organisationen/queries'
import { orgOnboardingBadge } from '@/lib/organisationen/onboarding-status'

function Feld({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-claimondo-ondo/70">{label}</dt>
      <dd className="text-body-sm text-claimondo-navy break-words">{value || '—'}</dd>
    </div>
  )
}

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4'

const TYP_LABEL: Record<string, string> = {
  akademie: 'Akademie',
  buero: 'Büro',
  community: 'Community',
}

export default function StammdatenTab({ org }: { org: OrganisationDetail }) {
  const istAkademie = org.typ === 'akademie'
  // Communities sind organisationen mit typ='community' — eigene Tabelle gibt es nicht.
  const istCommunity = org.typ === 'community'

  return (
    <div className="space-y-4">
      <SectionCard
        title="Stammdaten"
        icon={<Building2Icon className="w-4 h-4 text-claimondo-ondo" />}
        bodyClassName={GRID}
      >
        <Feld label="Name" value={org.name} />
        <Feld label="Typ" value={org.typ ? (TYP_LABEL[org.typ] ?? org.typ) : null} />
        <Feld label="Rechtsform" value={org.rechtsform} />
        <Feld label="Onboarding-Status" value={orgOnboardingBadge(org.onboardingStatus).label} />
        <Feld label="Anschrift" value={org.anschrift} />
        <Feld label="Standort" value={org.standortAdresse ?? org.standortPlz} />
        <Feld label="Steuernummer" value={org.steuernummer} />
        <Feld label="USt-IdNr." value={org.ustId} />
        <Feld
          label="Angelegt"
          value={org.createdAt ? new Date(org.createdAt).toLocaleDateString('de-DE') : null}
        />
        <Feld label="Zuletzt geändert" value={new Date(org.updatedAt).toLocaleDateString('de-DE')} />
      </SectionCard>

      <SectionCard
        title="Hauptansprechpartner"
        icon={<UserIcon className="w-4 h-4 text-claimondo-ondo" />}
        bodyClassName={GRID}
      >
        {org.verwalter ? (
          <>
            <Feld
              label="Name"
              value={[org.verwalter.vorname, org.verwalter.nachname].filter(Boolean).join(' ')}
            />
            <Feld label="E-Mail" value={org.verwalter.email} />
          </>
        ) : (
          <p className="text-body-sm text-claimondo-ondo/70">
            Kein Hauptansprechpartner hinterlegt.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Abrechnung"
        icon={<CreditCardIcon className="w-4 h-4 text-claimondo-ondo" />}
        bodyClassName={GRID}
      >
        <Feld
          label="Stripe-Kunde"
          value={org.stripeCustomerId ?? 'Nicht verknüpft'}
        />
        <Feld
          label="Zahlungsmethode"
          value={org.stripeDefaultPmId ? 'Hinterlegt' : 'Keine hinterlegt'}
        />
        <Feld
          label="Vertrag"
          value={org.vertragUnterzeichnetId ? 'Unterzeichnet' : 'Nicht unterzeichnet'}
        />
      </SectionCard>

      {istAkademie && (
        <SectionCard
          title="Akademie-Konditionen"
          icon={<GraduationCapIcon className="w-4 h-4 text-claimondo-ondo" />}
          bodyClassName={GRID}
        >
          <Feld
            label="Erst-Anzahlung"
            value={
              org.akademieErstAnzahlungEur != null
                ? `${org.akademieErstAnzahlungEur.toLocaleString('de-DE')} €`
                : null
            }
          />
          <Feld label="Max. Fälle / Monat" value={org.akademieMaxFaelleMonat} />
          <Feld
            label="Radius"
            value={org.akademieRadiusKm != null ? `${org.akademieRadiusKm} km` : null}
          />
        </SectionCard>
      )}

      {istCommunity && (
        <SectionCard
          title="Community-Konditionen"
          icon={<UsersIcon className="w-4 h-4 text-claimondo-ondo" />}
          bodyClassName={GRID}
        >
          <Feld label="Exklusives Gebiet" value={org.communityExklusiv ? 'Ja' : 'Nein'} />
          <Feld label="Max. Fälle / Monat" value={org.communityMaxFaelleMonat} />
          <Feld
            label="Leaderboard"
            value={org.communityLeaderboardAktiv ? 'Aktiv' : 'Inaktiv'}
          />
          <Feld
            label="Einsatzgebiet-Radius"
            value={
              org.einsatzgebietRadiusKm != null ? `${org.einsatzgebietRadiusKm} km` : null
            }
          />
        </SectionCard>
      )}
    </div>
  )
}
