import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { roleToPath } from '@/lib/auth/role-redirect'
import GutachterShell from './GutachterShell'

export default async function GutachterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()

  // AAR-718: Eingeloggte User mit anderer Rolle in ihr eigenes Portal statt
  // auf /login.
  if (profile?.rolle !== 'sachverstaendiger') {
    redirect(profile?.rolle ? roleToPath(profile.rolle as string) : '/login')
  }

  const displayName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || user.email || ''

  // AAR-70: Konsistenter SV-Lookup nur ueber profile_id (user_id ist deprecated, alle rows haben profile_id)
  // AAR-184 Fix: `freigeschaltet` existiert NICHT — nur `portal_zugang_freigeschaltet`.
  // Der Alt-Spaltenname hatte PostgREST 400 zurückgegeben, sv=null, alle SVs
  // wurden zu /gutachter/willkommen redirected → Portal komplett unbenutzbar.
  // AAR-220: brand_theme + firmenname zusätzlich für Whitelabel-Theme + Logo-alt-Text.
  // AAR-359 W5: sa_vorlage_* + verifizierung_* + gesperrt_* Felder für
  // den Verifizierungs-Banner und die Sidebar-Sichtbarkeit.
  // AAR-512: `gcal_connected` für den generalisierten Onboarding-Banner ergänzt.
  const svSelect = 'logo_url, brand_primary, brand_secondary, brand_theme, firmenname, use_custom_branding, vertrag_unterschrieben, anzahlung_status, standort_lat, standort_lng, ist_aktiv, portal_zugang_freigeschaltet, organisation_id, rolle_in_organisation, ist_parent_account, geloescht_am, sa_vorlage_status, sa_vorlage_admin_notiz, verifizierung_status, verifizierung_frist_bis, verifizierung_admin_notiz, gesperrt_seit, gesperrt_grund, gcal_connected'
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select(svSelect)
    .eq('profile_id', user.id)
    .maybeSingle()

  // KFZ-152 Phase 2+3: Conditional Sidebar-Eintraege
  // - Team: nur fuer Inhaber (Buero) oder Akademie-Verwalter (rolle='inhaber' + ist_parent_account)
  // - Community: nur fuer community_member
  const showTeam = !!(sv?.ist_parent_account || (sv?.rolle_in_organisation === 'inhaber'))
  const showCommunity = sv?.rolle_in_organisation === 'community_member'

  // AAR-359 W5 / AAR-714: Verifizierungs-Link in Sidebar, solange ein
  // Verifizierungs-Zustand aktiv bleibt. Legacy-SA-Vorlage (sv_sa_vorlage_*)
  // gilt nur noch wenn aktiv ausstehend/zurückgewiesen — null ist seit
  // AAR-714 der Default für neue SVs (die laufen über Pflichtdokumente).
  const saVorlageOffen =
    sv?.sa_vorlage_status === 'ausstehend' || sv?.sa_vorlage_status === 'zurueckgewiesen'
  const tier2Offen = sv?.verifizierung_status && sv.verifizierung_status !== 'geprueft'
  const showVerifizierung = !!(saVorlageOffen || tier2Offen)

  // Check if this gutachter has been soft-deleted → sign out + redirect
  if (sv?.geloescht_am) {
    await supabase.auth.signOut()
    redirect('/login?error=Ihr%20Account%20wurde%20deaktiviert.%20Bitte%20kontaktieren%20Sie%20den%20Support.')
  }

  const isDeactivated = sv?.ist_aktiv === false

  // KFZ-148: Hard-Blocker — Portal-Zugang nur wenn freigeschaltet.
  // BUG-A.1 fix: greift jetzt auch fuer User die noch GAR KEINEN
  // sachverstaendige-Eintrag haben.
  // ARCH-1 Phase 1: /gutachter/willkommen ist der neue Onboarding-Pfad
  // (3-Step Konditionen → Vertrag → Stripe). /gutachter/onboarding ist nur
  // noch eine Redirect-Logik, bleibt aber whitelisted fuer Backwards-Compat.
  // AAR-510: pathname einmal laden für Hard-Blocker-Redirect + Banner-
  // Unterdrückung auf der Willkommens-Seite (doppelter Hinweis sonst).
  const h = await headers()
  const pathname = h.get('x-pathname') ?? h.get('x-next-url') ?? h.get('x-invoke-path') ?? ''
  const isWillkommenPath = pathname.includes('/gutachter/willkommen')
  const isOnboardingPath = isWillkommenPath || pathname.includes('/gutachter/onboarding')

  if (!sv || sv.portal_zugang_freigeschaltet === false) {
    if (!isOnboardingPath) {
      redirect('/gutachter/willkommen')
    }
  }

  // AAR-220: Theme + Firmenname nur wenn use_custom_branding aktiv.
  // AAR-419 Follow-up: hydrateTheme() statt raw-Fallback — garantiert V2-
  // Volle-Hydrierung auch für alte V1-only brand_theme-Records in der DB
  // (sonst waren primaryHover/Status/Neutrale undefined im Consumer).
  const useBrand = !!sv?.use_custom_branding
  const { hydrateTheme } = await import('@/lib/branding/theme')
  const brandTheme = useBrand
    ? hydrateTheme(
        sv?.brand_theme as Parameters<typeof hydrateTheme>[0],
        sv?.brand_primary ?? null,
        sv?.brand_secondary ?? null,
      )
    : null

  return (
    <GutachterShell
      displayName={displayName}
      userId={user.id}
      logoUrl={useBrand ? (sv?.logo_url ?? null) : null}
      brandTheme={brandTheme}
      firmenname={useBrand ? (sv?.firmenname ?? null) : null}
      standortLat={sv?.standort_lat ? Number(sv.standort_lat) : null}
      standortLng={sv?.standort_lng ? Number(sv.standort_lng) : null}
      showTeam={showTeam}
      showCommunity={showCommunity}
      showVerifizierung={showVerifizierung}
    >
      {/* Deaktiviert-Banner */}
      {isDeactivated && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5 text-center text-xs text-red-700 font-medium">
          Ihr Account ist deaktiviert. Sie erhalten keine neuen Fälle. Bitte begleichen Sie offene Rechnungen.
        </div>
      )}
      {/* AAR-359 W5: Account-Sperre (rot, höchste Priorität) — getrennt von
          verifizierung_status, wird nur manuell vom Admin gesetzt. */}
      {sv?.gesperrt_seit && (
        <div className="bg-red-600 border-b border-red-700 px-4 py-2.5 text-center text-xs text-white font-semibold">
          Ihr Account wurde gesperrt{sv.gesperrt_grund ? `: ${sv.gesperrt_grund}` : '.'} Bitte wenden Sie sich an den Support.
        </div>
      )}
      {/* AAR-359 W5: SA-Vorlage zurückgewiesen (rot) — Dispatch-Gate-Blocker. */}
      {!sv?.gesperrt_seit && sv?.sa_vorlage_status === 'zurueckgewiesen' && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center text-xs text-red-700 font-medium">
          Ihre SA-Vorlage wurde zurückgewiesen{sv.sa_vorlage_admin_notiz ? `: ${sv.sa_vorlage_admin_notiz}` : ''}. Bitte laden Sie eine korrigierte Version hoch.{' '}
          <Link href="/gutachter/verifizierung" className="underline font-semibold">Zur Verifizierung</Link>
        </div>
      )}
      {/* AAR-359 W5: SA-Vorlage wird geprüft (gelb). */}
      {!sv?.gesperrt_seit && sv?.sa_vorlage_status === 'ausstehend' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-700 font-medium">
          Ihre SA-Vorlage wurde hochgeladen und wird vom Admin geprüft. Dispatch wird freigeschaltet, sobald die Freigabe erteilt ist.
        </div>
      )}
      {/* AAR-692: Tier-2-Banner (frist_ueberschritten + ausstehend-Countdown)
          entfernt. Tier 2 (Berufshaftpflicht, Gewerbeanmeldung etc.) ist
          kein Matching-Blocker — der Dispatchable-Filter lässt SVs durch
          auch ohne Tier-2-Freigabe. Tier 2 schaltet lediglich das
          „Verifiziert"-Badge frei (siehe Fallakte-Kunde-Anzeige). Ein
          rotes Frist-Banner wäre irreführend. SA-Vorlage (Tier 1) bleibt
          das einzige Hard-Gate mit sichtbarem Banner. */}
      {/* AAR-700: AAR-512-Onboarding-Banner entfernt — verwies auf nichts
          Konkretes mehr und blieb auch nach abgeschlossenem Onboarding
          stehen. Hard-Gate liegt im Layout-Redirect (portal_zugang_
          freigeschaltet=false → /gutachter/willkommen) + im SA-Vorlage-
          Banner (Tier 1). */}
      {/* AAR-697: PageContainer raus — Aaron-Vorgabe Gutachter-Portal full
          width. Banner liegen sowieso außerhalb dieses Wrappers. */}
      <div className="h-full w-full">{children}</div>
    </GutachterShell>
  )
}
