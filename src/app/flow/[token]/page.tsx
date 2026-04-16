import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import FlowWizardKfz from './FlowWizardKfz'
// AAR-316 W2: Sprach-Banner für nicht-deutsche Kunden
import { SprachBanner } from '@/components/i18n/SprachBanner'

export default async function FlowPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  try {
  const svc = createServiceClient()

  // 1. Look up flow_links by token + check expiry (BUG-100)
  // AAR-316: sprache mitladen für Sprach-Banner (Google-Translate-Fallback)
  const { data: flowLink } = await svc
    .from('flow_links')
    .select('id, lead_id, status, geoeffnet_am, expires_at, sprache')
    .eq('token', token)
    .maybeSingle()

  // Fallback: Try token as lead_id directly (backward compat)
  let leadId: string
  let flowLinkId: string | null = null

  if (flowLink) {
    // BUG-100: Token-Expiry prüfen
    if (flowLink.expires_at && new Date(flowLink.expires_at) < new Date()) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4">&#x23F3;</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Link abgelaufen</h1>
            <p className="text-gray-500">Dieser FlowLink ist nicht mehr gueltig. Bitte kontaktieren Sie Ihren Berater fuer einen neuen Link.</p>
          </div>
        </div>
      )
    }

    // BUG-100: Bereits abgeschlossene Links blockieren
    if (flowLink.status === 'abgeschlossen') {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4">&#x2705;</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Bereits abgeschlossen</h1>
            <p className="text-gray-500">Dieser FlowLink wurde bereits verwendet.</p>
          </div>
        </div>
      )
    }

    leadId = flowLink.lead_id
    flowLinkId = flowLink.id

    // Mark as opened if first visit
    if (!flowLink.geoeffnet_am) {
      await svc.from('flow_links').update({ geoeffnet_am: new Date().toISOString(), status: 'geoeffnet' }).eq('id', flowLink.id)
      await svc.from('leads').update({ flow_link_geoeffnet: true, updated_at: new Date().toISOString() }).eq('id', leadId)

      // AAR-229 W4: Mitteilung an zugewiesenen MA + SV
      try {
        const { data: zugehFall } = await svc.from('faelle').select('id, sv_id').eq('lead_id', leadId).limit(1).maybeSingle()
        const { data: leadForName } = await svc.from('leads').select('vorname, nachname, zugewiesen_an').eq('id', leadId).single()
        const name = [leadForName?.vorname, leadForName?.nachname].filter(Boolean).join(' ') || 'Kunde'
        const { createMitteilungMulti } = await import('@/lib/mitteilungen/create-mitteilung')
        const empfaenger: Array<{ id: string; rolle: 'admin' | 'sachverstaendiger' }> = []
        if (leadForName?.zugewiesen_an) empfaenger.push({ id: leadForName.zugewiesen_an, rolle: 'admin' })
        if (zugehFall?.sv_id) {
          const { data: svP } = await svc.from('sachverstaendige').select('profile_id').eq('id', zugehFall.sv_id).single()
          if (svP?.profile_id) empfaenger.push({ id: svP.profile_id, rolle: 'sachverstaendiger' })
        }
        if (empfaenger.length) {
          await createMitteilungMulti(empfaenger, {
            kategorie: 'update',
            titel: 'Kunde hat FlowLink geöffnet',
            inhalt: name,
            kontext_typ: 'fall',
            kontext_id: zugehFall?.id,
          })
        }
      } catch { /* non-critical */ }
    }

    // KFZ-207: Auto-Reaktivierung kalt-Lead wenn FlowLink geöffnet wird
    const { data: lead } = await svc.from('leads').select('qualifizierungs_phase, vorname, nachname').eq('id', leadId).single()
    if (lead?.qualifizierungs_phase === 'kalt') {
      await svc.from('leads').update({ qualifizierungs_phase: 'in-qualifizierung', updated_at: new Date().toISOString() }).eq('id', leadId)
      const { data: linkedFall } = await svc.from('faelle').select('id').eq('lead_id', leadId).limit(1).maybeSingle()
      const fallId = linkedFall?.id ?? null
      await svc.from('tasks').insert({ fall_id: fallId, titel: `Lead reaktiviert: ${lead.vorname ?? ''} ${lead.nachname ?? ''} (FlowLink geöffnet)`, typ: 'dispatch', prioritaet: 'dringend', status: 'offen' })
      if (fallId) {
        await svc.from('timeline').insert({ fall_id: fallId, typ: 'system', titel: 'Lead reaktiviert (FlowLink geöffnet)', beschreibung: `${lead.vorname ?? ''} ${lead.nachname ?? ''} war kalt, hat sich selbst reaktiviert.` })
      }
    }
  } else {
    // Backward compat: token might be lead_id
    leadId = token
  }

  // 2. Load lead data (extended for KFZ-117 FlowLink flow)
  // AAR-71: SELECT * statt hardcoded Liste — verhindert dass neue Felder
  // (Halter, Leasing/Finanzierung, Vorschaeden, Schadenkonstellation) verloren gehen
  const { data: lead } = await svc
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) return notFound()

  // AAR-99: Reservierten SV+Termin laden fuer Schritt 2
  const { data: terminMitSv } = await svc
    .from('gutachter_termine')
    .select('id, start_zeit, sv_id, sachverstaendige(profile_id, profiles(vorname, avatar_url))')
    .eq('lead_id', leadId)
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: false })
    .limit(1)
    .maybeSingle()

  let gutachter: { vorname: string; avatarUrl: string | null; terminDatum: string | null } | null = null
  if (terminMitSv?.sachverstaendige) {
    const svJoin = terminMitSv.sachverstaendige as unknown as { profile_id: string; profiles: { vorname: string | null; avatar_url: string | null } | { vorname: string | null; avatar_url: string | null }[] | null } | { profile_id: string; profiles: unknown }[] | null
    const svRow = Array.isArray(svJoin) ? svJoin[0] : svJoin
    const profile = svRow?.profiles as { vorname: string | null; avatar_url: string | null } | { vorname: string | null; avatar_url: string | null }[] | null
    const profileRow = Array.isArray(profile) ? profile[0] : profile
    if (profileRow?.vorname) {
      gutachter = {
        vorname: profileRow.vorname,
        avatarUrl: profileRow.avatar_url ?? null,
        terminDatum: (terminMitSv.start_zeit as string | null) ?? null,
      }
    }
  }

  // AAR-316: Sprach-Priorität flow_links.sprache > lead.sprache > 'de'
  const sprache =
    (flowLink?.sprache as string | null) ?? (lead.sprache as string | null) ?? 'de'

  return (
    <>
      <SprachBanner sprache={sprache as Parameters<typeof SprachBanner>[0]['sprache']} />
      <FlowWizardKfz
      token={token}
      flowLinkId={flowLinkId}
      gutachter={gutachter}
      lead={{
        id: lead.id,
        vorname: lead.vorname ?? '',
        nachname: lead.nachname ?? '',
        email: lead.email ?? '',
        telefon: lead.telefon ?? '',
        schadenfall_typ: lead.schadenfall_typ ?? 'sf-01',
        schadentyp: lead.schadentyp ?? null,
        schadentyp_freitext: lead.schadentyp_freitext ?? null,
        kunden_konstellation: lead.kunden_konstellation ?? 'kk-01',
        personenschaden_flag: lead.personenschaden_flag ?? false,
        mietwagen_flag: lead.mietwagen_flag ?? false,
        polizeibericht_pflicht: lead.polizeibericht_pflicht ?? false,
        polizei_vor_ort: lead.polizei_vor_ort ?? false,
        gutachter_termin: lead.gutachter_termin ?? null,
        kennzeichen: lead.kennzeichen ?? '',
        fahrzeug_hersteller: lead.fahrzeug_hersteller ?? '',
        fahrzeug_modell: lead.fahrzeug_modell ?? '',
        fahrzeug_standort_adresse: lead.fahrzeug_standort_adresse ?? '',
        fahrzeug_standort_plz: lead.fahrzeug_standort_plz ?? '',
        gegner_name: lead.gegner_name ?? '',
        gegner_versicherung: lead.gegner_versicherung ?? '',
        unfallhergang: lead.unfallhergang ?? '',
        // AAR-305: steuert Mietwagen-Empfehlungs-Box im neuen Step „Weitere Angaben"
        fahrzeug_fahrbereit: lead.fahrzeug_fahrbereit ?? null,
      }}
      />
    </>
  )

  } catch (err) {
    console.error('[FlowPage] Server Error:', err)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="text-center max-w-md">
          <h1 className="text-lg font-semibold text-red-600 mb-2">Fehler beim Laden</h1>
          <p className="text-gray-500 text-sm">Bitte versuchen Sie es erneut oder kontaktieren Sie uns.</p>
        </div>
      </div>
    )
  }
}
