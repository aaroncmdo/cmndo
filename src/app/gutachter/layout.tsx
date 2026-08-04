import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import GutachterShell from './GutachterShell'
import { svEigenBrandingErlaubt } from '@/lib/branding/gate'
import { istBrandingBezahlt } from '@/lib/branding/bezahl-status'

export default async function GutachterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // K5 / AAR-frontend-konsolidierung-p1: Auth + Rollen-Guard zentralisiert.
  const { supabase, user, displayName } = await requirePortalAccess(['sachverstaendiger'])

  // AAR-70: Konsistenter SV-Lookup nur ueber profile_id (user_id ist deprecated, alle rows haben profile_id)
  // AAR-184 Fix: `freigeschaltet` existiert NICHT — nur `portal_zugang_freigeschaltet`.
  // Der Alt-Spaltenname hatte PostgREST 400 zurückgegeben, sv=null, alle SVs
  // wurden zu /gutachter/willkommen redirected → Portal komplett unbenutzbar.
  // AAR-220: brand_theme + firmenname zusätzlich für Whitelabel-Theme + Logo-alt-Text.
  // AAR-359 W5 / AAR-360: verifizierung_* + gesperrt_* Felder für die
  // Sidebar-Sichtbarkeit (SA-Vorlage-Tier-1 mit AAR-360 entfernt).
  // AAR-512: `gcal_connected` für den generalisierten Onboarding-Banner ergänzt.
  const svSelect = 'id, logo_url, brand_primary, brand_secondary, brand_theme, firmenname, use_custom_branding, vertrag_unterschrieben, anzahlung_status, standort_lat, standort_lng, ist_aktiv, portal_zugang_freigeschaltet, organisation_id, rolle_in_organisation, ist_parent_account, geloescht_am, verifizierung_status, verifizierung_frist_bis, verifizierung_admin_notiz, gesperrt_seit, gesperrt_grund, gcal_connected'
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select(svSelect)
    .eq('profile_id', user.id)
    // Multi-Standort-safe: ein User kann mehrere sachverstaendige-Rows haben
    // (Inhaber + Sub-Standorte). Ohne Ordering+limit(1) wirft .maybeSingle() bei
    // >1 Row -> sv=null -> Redirect nach /willkommen (Portal-Lockout fuer den
    // ganzen SV-Bereich). Ordering identisch zu getGutachterForUser.
    .order('ist_parent_account', { ascending: true, nullsFirst: true })
    .order('paket_faelle_gesamt', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  // KFZ-152 Phase 2+3: Conditional Sidebar-Eintraege
  // - Community: nur fuer community_member
  // (Team/Verwalter-Nav retired 2026-07-28 — SV-Org-Modell dormant, s. docs/fundament/DECISIONS.md)
  const showCommunity = sv?.rolle_in_organisation === 'community_member'

  // AAR-359 W5 / AAR-714 / AAR-360: Verifizierungs-Link in Sidebar, solange
  // ein Verifizierungs-Zustand aktiv bleibt. Die Legacy-SA-Vorlage (Tier 1)
  // wurde mit AAR-360 entfernt — der Tier-2-Status ist der einzige Trigger.
  const tier2Offen = sv?.verifizierung_status && sv.verifizierung_status !== 'geprueft'
  const showVerifizierung = !!tier2Offen

  // Check if this gutachter has been soft-deleted → sign out + redirect
  if (sv?.geloescht_am) {
    await supabase.auth.signOut()
    redirect('/login?error=Ihr%20Account%20wurde%20deaktiviert.%20Bitte%20kontaktieren%20Sie%20den%20Support.')
  }

  // "Deaktiviert" = WAR freigeschaltet und wurde DANN deaktiviert (z.B. offene
  // Rechnungen). Ein frisch self-onboardender Basic-SV (ist_aktiv=false, aber NIE
  // freigeschaltet) ist NICHT "deaktiviert" — sonst klebt das rote "begleichen Sie
  // offene Rechnungen"-Banner ueber seinem Onboarding (Schritt 1/5). portal_zugang
  // als Trennlinie: nur wer freigeschaltet WAR, kann ueberhaupt deaktiviert werden.
  const isDeactivated = sv?.ist_aktiv === false && sv?.portal_zugang_freigeschaltet === true

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
  // Paid-Perk (Aaron 03.08.): Portal-Wirkung nur fuer zahlende SVs.
  const useBrand = svEigenBrandingErlaubt(sv) && (await istBrandingBezahlt(sv?.id ?? null))
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
      showCommunity={showCommunity}
      showVerifizierung={showVerifizierung}
      svId={sv?.id ? String(sv.id) : null}
      onboardingModus={sv?.portal_zugang_freigeschaltet === false}
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
      {/* AAR-692 / FG3: Tier-2-Banner (frist_ueberschritten + ausstehend-Countdown)
          entfernt — ein rotes Frist-Banner wäre irreführend. FG3-Update
          (Aaron 2026-07-11, decision A): 'frist_ueberschritten' blockt jetzt die
          Fall-Zuweisung — der Dispatchable-Filter (applyDispatchableFilter /
          svDarfFaelleEmpfangen) schließt solche SVs aus. 'ausstehend' und noch
          nicht Tier-2-verifizierte SVs bekommen weiterhin Fälle. Das
          „Verifiziert"-Badge bleibt eine separate, verifiziert-getriebene Anzeige
          (siehe Fallakte-Kunde-Anzeige). SA-Vorlage (Tier 1) bleibt das einzige
          Hard-Gate mit sichtbarem Banner. */}
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
