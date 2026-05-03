// AAR-kanzlei-termin: Termin-Übersicht + Buchungs-Formular.
//
// Server-Page lädt:
//   - Auswählbare Admins (rolle='admin' + google_oauth_verbunden, damit
//     der Kalender-Event auch wirklich angelegt werden kann)
//   - Kommende Termine des eingeloggten Kanzlei-Users (nächste 90 Tage)
//   - Belegungen aller Admins für die nächsten 30 Tage (damit der Slot-
//     Picker im Client besetzt-Zeiten markieren kann — zunächst nur aus
//     kanzlei_admin_termine; Google-FreeBusy kommt in Folge-PR)
//
// Client-Komponente TerminBuchungClient rendert das Buchungs-Formular
// und die Termin-Liste.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import TerminBuchungClient, {
  type AdminAuswahl,
  type EigenerTermin,
  type AdminBelegung,
} from './TerminBuchungClient'
import PageHeader from '@/components/shared/PageHeader'

export default async function KanzleiTerminPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null

  // Admins laden — Service-Key, weil die RLS für profiles streng ist.
  // Wir filtern auf rolle='admin' und zusätzlich auf google_access_token
  // NOT NULL (nur Admins mit verbundener Calendar-API buchbar).
  const admin = createAdminClient()
  const { data: adminRows } = await admin
    .from('profiles')
    .select('id, vorname, nachname, email, google_access_token')
    .eq('rolle', 'admin')
    .order('vorname', { ascending: true })
  const alleAdmins: AdminAuswahl[] = (adminRows ?? []).map((a) => ({
    id: a.id as string,
    name:
      [a.vorname, a.nachname].filter(Boolean).join(' ') ||
      (a.email as string | null) ||
      'Admin',
    email: (a.email as string | null) ?? null,
    google_verbunden: !!a.google_access_token,
  }))
  const verfuegbareAdmins = alleAdmins.filter((a) => a.google_verbunden)

  // Eigene kommende Termine (Kanzlei-User)
  const { data: eigeneTermineRows } = await supabase
    .from('kanzlei_admin_termine')
    .select(
      'id, start_zeit, end_zeit, typ, titel, beschreibung, status, google_meet_link, admin_user_id, fall_id',
    )
    .eq('kanzlei_user_id', user.id)
    .in('status', ['gebucht'])
    .gte('start_zeit', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .order('start_zeit', { ascending: true })
    .limit(50)

  const adminNamesById = new Map(alleAdmins.map((a) => [a.id, a.name]))
  const eigeneTermine: EigenerTermin[] = (eigeneTermineRows ?? []).map((t) => ({
    id: t.id as string,
    start_zeit: t.start_zeit as string,
    end_zeit: t.end_zeit as string,
    typ: t.typ as 'video' | 'vor_ort',
    titel: t.titel as string,
    beschreibung: (t.beschreibung as string | null) ?? null,
    status: t.status as 'gebucht' | 'abgesagt' | 'durchgefuehrt',
    google_meet_link: (t.google_meet_link as string | null) ?? null,
    admin_name: adminNamesById.get(t.admin_user_id as string) ?? 'Admin',
    fall_id: (t.fall_id as string | null) ?? null,
  }))

  // Admin-Belegungen für Slot-Picker (alle Admins, nächste 30 Tage).
  // Kanzlei kann per RLS alle gebuchten Termine lesen solange sie die Rolle
  // hat — dadurch sieht sie nur anonyme Belegungs-Blöcke. Wir geben nur
  // start/end + admin_user_id weiter, keine Titel/Details.
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: belegungRows } = await admin
    .from('kanzlei_admin_termine')
    .select('admin_user_id, start_zeit, end_zeit')
    .in('status', ['gebucht'])
    .gte('start_zeit', new Date().toISOString())
    .lte('start_zeit', in30Days)
  const adminBelegungen: AdminBelegung[] = (belegungRows ?? []).map((b) => ({
    admin_user_id: b.admin_user_id as string,
    start_zeit: b.start_zeit as string,
    end_zeit: b.end_zeit as string,
  }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Termin mit Admin"
        description="Buche einen Video- oder Vor-Ort-Termin mit einem Claimondo-Admin. Der Termin landet direkt im Kalender des Admins, du erhältst per Mail eine Google-Einladung inkl. Meet-Link."
        size="lg"
      />
      <TerminBuchungClient
        verfuegbareAdmins={verfuegbareAdmins}
        alleAdminsCount={alleAdmins.length}
        eigeneTermine={eigeneTermine}
        adminBelegungen={adminBelegungen}
      />
    </div>
  )
}
