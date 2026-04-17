import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import GutachterShell from './GutachterShell'
import { PageContainer } from '@/components/PageContainer'

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

  if (profile?.rolle !== 'sachverstaendiger') redirect('/login')

  const displayName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || user.email || ''

  // AAR-70: Konsistenter SV-Lookup nur ueber profile_id (user_id ist deprecated, alle rows haben profile_id)
  // AAR-184 Fix: `freigeschaltet` existiert NICHT — nur `portal_zugang_freigeschaltet`.
  // Der Alt-Spaltenname hatte PostgREST 400 zurückgegeben, sv=null, alle SVs
  // wurden zu /gutachter/willkommen redirected → Portal komplett unbenutzbar.
  // AAR-220: brand_theme + firmenname zusätzlich für Whitelabel-Theme + Logo-alt-Text.
  // AAR-359 W5: sa_vorlage_* + verifizierung_* + gesperrt_* Felder für
  // den Verifizierungs-Banner und die Sidebar-Sichtbarkeit.
  const svSelect = 'logo_url, brand_primary, brand_secondary, brand_theme, firmenname, use_custom_branding, vertrag_unterschrieben, anzahlung_status, standort_lat, standort_lng, ist_aktiv, portal_zugang_freigeschaltet, organisation_id, rolle_in_organisation, ist_parent_account, geloescht_am, sa_vorlage_status, sa_vorlage_admin_notiz, verifizierung_status, verifizierung_frist_bis, verifizierung_admin_notiz, gesperrt_am, gesperrt_grund'
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

  // AAR-359 W5: Verifizierungs-Link in Sidebar, solange ein Verifizierungs-
  // Zustand aktiv bleibt (SA-Vorlage ausstehend/zurückgewiesen ODER Tier-2
  // nicht vollständig geprüft). Sobald beide auf 'geprueft' → Link verschwindet.
  const saVorlageOffen = sv?.sa_vorlage_status !== 'geprueft'
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
  if (!sv || sv.portal_zugang_freigeschaltet === false) {
    const h = await headers()
    const pathname = h.get('x-pathname') ?? h.get('x-next-url') ?? h.get('x-invoke-path') ?? ''
    const isOnboardingPath =
      pathname.includes('/gutachter/onboarding') ||
      pathname.includes('/gutachter/willkommen')
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
      {sv?.gesperrt_am && (
        <div className="bg-red-600 border-b border-red-700 px-4 py-2.5 text-center text-xs text-white font-semibold">
          Ihr Account wurde gesperrt{sv.gesperrt_grund ? `: ${sv.gesperrt_grund}` : '.'} Bitte wenden Sie sich an den Support.
        </div>
      )}
      {/* AAR-359 W5: SA-Vorlage zurückgewiesen (rot) — Dispatch-Gate-Blocker. */}
      {!sv?.gesperrt_am && sv?.sa_vorlage_status === 'zurueckgewiesen' && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center text-xs text-red-700 font-medium">
          Ihre SA-Vorlage wurde zurückgewiesen{sv.sa_vorlage_admin_notiz ? `: ${sv.sa_vorlage_admin_notiz}` : ''}. Bitte laden Sie eine korrigierte Version hoch.{' '}
          <Link href="/gutachter/verifizierung" className="underline font-semibold">Zur Verifizierung</Link>
        </div>
      )}
      {/* AAR-359 W5: Tier-2-Frist überschritten (rot). */}
      {!sv?.gesperrt_am && sv?.verifizierung_status === 'frist_ueberschritten' && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center text-xs text-red-700 font-medium">
          Ihre 14-Tage-Frist für die Verifizierungs-Unterlagen ist abgelaufen. Bitte reichen Sie die fehlenden Dokumente umgehend nach.{' '}
          <Link href="/gutachter/verifizierung" className="underline font-semibold">Zur Verifizierung</Link>
        </div>
      )}
      {/* AAR-359 W5: SA-Vorlage wird geprüft (gelb). */}
      {!sv?.gesperrt_am && sv?.sa_vorlage_status === 'ausstehend' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-700 font-medium">
          Ihre SA-Vorlage wurde hochgeladen und wird vom Admin geprüft. Dispatch wird freigeschaltet, sobald die Freigabe erteilt ist.
        </div>
      )}
      {/* AAR-359 W5: Tier-2-Countdown läuft (gelb) — wenn < 4 Tage bis
          verifizierung_frist_bis. */}
      {!sv?.gesperrt_am
        && sv?.verifizierung_status === 'ausstehend'
        && sv.verifizierung_frist_bis
        && (() => {
          const tageOffen = Math.max(
            0,
            Math.ceil((new Date(sv.verifizierung_frist_bis).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          )
          if (tageOffen > 4) return null
          return (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-700 font-medium">
              Noch {tageOffen} Tag{tageOffen === 1 ? '' : 'e'} bis zum Ablauf Ihrer Verifizierungs-Frist. Bitte reichen Sie die fehlenden Dokumente rechtzeitig nach.{' '}
              <Link href="/gutachter/verifizierung" className="underline font-semibold">Zur Verifizierung</Link>
            </div>
          )
        })()}
      {/* Anzahlung-Banner */}
      {!isDeactivated && sv?.vertrag_unterschrieben && sv?.anzahlung_status !== 'bezahlt' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-700 font-medium">
          Ihre Anzahlung ist noch ausstehend. Sie erhalten Fälle sobald die Zahlung eingegangen ist.
        </div>
      )}
      {/* BUG-98: PageContainer gibt Desktop ~15-20% horizontale Marge,
          Tablet quer großflächig, Mobile fast volle Breite. Banner liegen
          bewusst außerhalb damit sie weiterhin volle Breite haben. */}
      <PageContainer className="h-full">{children}</PageContainer>
    </GutachterShell>
  )
}
