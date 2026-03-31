'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NavigationIcon, PhoneIcon, CameraIcon, CheckIcon, MapPinIcon, SunIcon, CloudIcon, CloudRainIcon, SnowflakeIcon, CloudLightningIcon, CloudFogIcon, ArrowLeftIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Termin = { id: string; fallNr: string | null; uhrzeit: string; kunde: string; telefon: string | null; email: string | null; adresse: string; kennzeichen: string | null; fahrzeug: string | null; schadentyp: string | null }
type NeuerKunde = { id: string; kunde: string; kennzeichen: string | null; schadentyp: string | null; datum: string }
type Task = { id: string; titel: string; fallId: string | null }
type Mode = 'overview' | 'navigation' | 'onsite'

const FOTO_SLOTS = ['Vorne', 'Hinten', 'Links', 'Rechts']

function wIcon(c: number) {
  if (c === 0) return <SunIcon className="w-4 h-4 text-amber-500" />
  if (c <= 3) return <CloudIcon className="w-4 h-4 text-gray-400" />
  if (c <= 48) return <CloudFogIcon className="w-4 h-4 text-gray-400" />
  if (c <= 67) return <CloudRainIcon className="w-4 h-4 text-blue-500" />
  if (c <= 77) return <SnowflakeIcon className="w-4 h-4 text-blue-300" />
  return <CloudLightningIcon className="w-4 h-4 text-yellow-500" />
}

export default function GutachterDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [datum, setDatum] = useState('')
  const [termine, setTermine] = useState<Termin[]>([])
  const [neueKunden, setNeueKunden] = useState<NeuerKunde[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState({ faelle: 0, maxFaelle: 25, guthaben: 0, monat: 0 })
  const [routeUrl, setRouteUrl] = useState<string | null>(null)
  const [gutachtenFaellig, setGutachtenFaellig] = useState<{ id: string; kunde: string } | null>(null)
  const [svLat, setSvLat] = useState<number | null>(null)
  const [svLng, setSvLng] = useState<number | null>(null)
  const [weather, setWeather] = useState<{ temp: number; code: number; hourly: { hour: number; temp: number; code: number }[]; tip: string } | null>(null)

  const [mode, setMode] = useState<Mode>('overview')
  const [activeFall, setActiveFall] = useState<Termin | null>(null)
  const [fotos, setFotos] = useState<Record<string, boolean>>({})
  const [fin, setFin] = useState(''); const [km, setKm] = useState(''); const [notizen, setNotizen] = useState('')
  const [uploading, setUploading] = useState(false); const [completing, setCompleting] = useState(false)
  const [mobileTab, setMobileTab] = useState<'route' | 'kunde' | 'uploads'>('route')

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: sv } = await supabase.from('sachverstaendige').select('id, standort_lat, standort_lng, paket_faelle_genutzt, paket_faelle_gesamt, guthaben, offene_faelle, max_faelle_monat').eq('profile_id', user.id).single()
    if (!sv) { setLoading(false); return }

    const { data: profile } = await supabase.from('profiles').select('vorname').eq('id', user.id).single()
    const now = new Date()
    const h = now.getHours()
    setGreeting(`${h < 12 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend'}${profile?.vorname ? ` ${profile.vorname}` : ''}`)
    setDatum(now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }))
    setSvLat(sv.standort_lat ? Number(sv.standort_lat) : null)
    setSvLng(sv.standort_lng ? Number(sv.standort_lng) : null)
    setStats({ faelle: sv.offene_faelle ?? sv.paket_faelle_genutzt ?? 0, maxFaelle: sv.max_faelle_monat ?? sv.paket_faelle_gesamt ?? 25, guthaben: typeof sv.guthaben === 'number' ? sv.guthaben : 0, monat: 0 })

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

    const [todayRes, neueRes, tasksRes, faelligRes] = await Promise.all([
      supabase.from('faelle').select('id, fall_nummer, schadens_adresse, schadens_plz, schadens_ort, sv_termin, lead_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, schadenfall_typ')
        .eq('sv_id', sv.id).gte('sv_termin', todayStart).lt('sv_termin', todayEnd).not('status', 'in', '("abgeschlossen","storniert")').order('sv_termin', { ascending: true }),
      supabase.from('faelle').select('id, lead_id, kennzeichen, schadenfall_typ, created_at')
        .eq('sv_id', sv.id).is('sv_termin', null).not('status', 'in', '("abgeschlossen","storniert")').order('created_at', { ascending: false }).limit(10),
      supabase.from('tasks').select('id, titel, fall_id').or(`zugewiesen_an.eq.${user.id},empfaenger_user_id.eq.${user.id}`).in('status', ['offen', 'in-arbeit']).limit(10),
      supabase.from('faelle').select('id, lead_id').eq('sv_id', sv.id).not('sv_termin', 'is', null).lt('sv_termin', now.toISOString()).is('gutachten_eingegangen_am', null).not('status', 'in', '("abgeschlossen","storniert")').limit(1),
    ])

    // Resolve lead names
    const allIds = [...new Set([...(todayRes.data ?? []), ...(neueRes.data ?? []), ...(faelligRes.data ?? [])].map(f => f.lead_id).filter(Boolean) as string[])]
    let lm: Record<string, { name: string; tel: string | null; email: string | null }> = {}
    if (allIds.length) {
      const { data: leads } = await supabase.from('leads').select('id, vorname, nachname, telefon, email').in('id', allIds)
      for (const l of leads ?? []) lm[l.id] = { name: [l.vorname, l.nachname].filter(Boolean).join(' ') || '—', tel: l.telefon, email: l.email }
    }

    setTermine((todayRes.data ?? []).map(f => ({
      id: f.id, fallNr: f.fall_nummer, uhrzeit: f.sv_termin ? new Date(f.sv_termin).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—',
      kunde: lm[f.lead_id ?? '']?.name ?? '—', telefon: lm[f.lead_id ?? '']?.tel ?? null, email: lm[f.lead_id ?? '']?.email ?? null,
      adresse: [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', '),
      kennzeichen: f.kennzeichen ?? null, fahrzeug: [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ') || null, schadentyp: f.schadenfall_typ ?? null,
    })))

    setNeueKunden((neueRes.data ?? []).map(f => ({
      id: f.id, kunde: lm[f.lead_id ?? '']?.name ?? '—', kennzeichen: f.kennzeichen ?? null, schadentyp: f.schadenfall_typ ?? null,
      datum: f.created_at ? new Date(f.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '',
    })))

    setTasks((tasksRes.data ?? []).map(t => ({ id: t.id, titel: t.titel, fallId: t.fall_id })))

    const ff = (faelligRes.data ?? [])[0]
    setGutachtenFaellig(ff ? { id: ff.id, kunde: lm[ff.lead_id ?? '']?.name ?? '—' } : null)

    const stops = (todayRes.data ?? []).map(f => [f.schadens_adresse, f.schadens_plz, f.schadens_ort].filter(Boolean).join(', ')).filter(Boolean)
    setRouteUrl(stops.length ? `https://www.google.com/maps/dir/${stops.map(s => encodeURIComponent(s)).join('/')}` : null)

    // Weather
    if (sv.standort_lat && sv.standort_lng) {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${sv.standort_lat}&longitude=${sv.standort_lng}&current=temperature_2m,weathercode&hourly=temperature_2m,weathercode&timezone=Europe/Berlin&forecast_days=1`)
        .then(r => r.json()).then(d => {
          if (!d.current) return
          const hourly = (d.hourly?.time ?? []).map((t: string, i: number) => ({ hour: new Date(t).getHours(), temp: Math.round(d.hourly.temperature_2m[i]), code: d.hourly.weathercode[i] })).filter((h: { hour: number }) => h.hour >= 8 && h.hour <= 18)
          const c = d.current.weathercode
          const tip = c >= 95 ? 'Vorsicht, Gewitter möglich!' : c >= 71 ? 'Straßen können glatt sein!' : c >= 61 ? 'Regenjacke einpacken!' : d.current.temperature_2m > 30 ? 'Wasser mitnehmen!' : d.current.temperature_2m < 5 ? 'Warm anziehen!' : 'Perfektes Gutachter-Wetter!'
          setWeather({ temp: Math.round(d.current.temperature_2m), code: c, hourly, tip })
        }).catch(() => {})
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  function startNav(t: Termin) { setActiveFall(t); setMode('navigation'); setFotos({}); setFin(''); setKm(''); setNotizen(''); setMobileTab('route') }

  async function handleFoto(slot: string, file: File) {
    if (!activeFall) return; setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${activeFall.id}/gutachter-fotos/${slot.toLowerCase()}_${Date.now()}.${ext}`
      await supabase.storage.from('dokumente').upload(path, file, { contentType: file.type })
      const { data: { publicUrl } } = supabase.storage.from('dokumente').getPublicUrl(path)
      await supabase.from('dokumente').insert({ fall_id: activeFall.id, typ: 'schadensfoto', datei_url: publicUrl, datei_name: `${slot}.${ext}`, datei_groesse: file.size, kategorie: 'schadensfotos', hochgeladen_von_rolle: 'sachverstaendiger', quelle: 'gutachter-app' })
      setFotos(p => ({ ...p, [slot]: true }))
    } catch { /* */ } setUploading(false)
  }

  async function complete() {
    if (!activeFall) return; setCompleting(true)
    try {
      const u: Record<string, unknown> = { status: 'besichtigung' }
      if (fin.length === 17) u.fin_vin = fin.toUpperCase()
      await supabase.from('faelle').update(u).eq('id', activeFall.id)
      await supabase.from('timeline').insert({ fall_id: activeFall.id, typ: 'system', titel: 'Besichtigung abgeschlossen', beschreibung: `${FOTO_SLOTS.filter(s => fotos[s]).length} Fotos, FIN: ${fin || '—'}, KM: ${km || '—'}` })
      setMode('overview'); setActiveFall(null); loadData()
    } catch { /* */ } setCompleting(false)
  }

  const fc = FOTO_SLOTS.filter(s => fotos[s]).length
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const embedUrl = activeFall && mapsKey && svLat && svLng ? `https://www.google.com/maps/embed/v1/directions?key=${mapsKey}&origin=${svLat},${svLng}&destination=${encodeURIComponent(activeFall.adresse)}&mode=driving` : null
  const navUrl = activeFall ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(activeFall.adresse)}` : null

  if (loading) return <div className="h-[calc(100vh-64px)] flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="h-[calc(100vh-64px)] overflow-hidden flex flex-col">
      {/* ═══ STICKY TOPBAR h-14 ═══ */}
      <div className="h-14 flex items-center justify-between px-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {mode !== 'overview' && <button onClick={() => { setMode('overview'); setActiveFall(null) }} className="text-gray-400 hover:text-gray-600 mr-1"><ArrowLeftIcon className="w-4 h-4" /></button>}
          <span className="text-sm font-semibold text-gray-900 truncate">{greeting}</span>
          <span className="text-xs text-gray-400 hidden sm:inline">{datum}</span>
        </div>
        {weather && <div className="flex items-center gap-1.5 text-xs text-gray-600">{wIcon(weather.code)}<span className="font-semibold">{weather.temp}°C</span></div>}
        <div className="flex items-center gap-2 text-[10px] font-medium shrink-0">
          <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{termine.length} Termine</span>
          <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-full hidden sm:inline">{tasks.length} Tasks</span>
        </div>
      </div>

      {/* Mobile tabs */}
      {mode !== 'overview' && <div className="flex lg:hidden border-b border-gray-200 flex-shrink-0">{(['route', 'kunde', 'uploads'] as const).map(t => <button key={t} onClick={() => setMobileTab(t)} className={`flex-1 py-2 text-xs font-medium border-b-2 ${mobileTab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400'}`}>{t === 'route' ? (mode === 'onsite' ? 'Erfassung' : 'Route') : t === 'kunde' ? 'Kunde' : 'Uploads'}</button>)}</div>}

      {/* ═══ WETTER-BANNER ═══ */}
      {weather && mode === 'overview' && (
        <div className={`flex-shrink-0 px-4 py-3 flex items-center gap-4 ${weather.code >= 61 ? 'bg-gradient-to-r from-gray-600 to-gray-500 text-white' : weather.code >= 45 ? 'bg-gradient-to-r from-gray-400 to-gray-300 text-white' : 'bg-gradient-to-r from-blue-500 to-sky-400 text-white'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-4xl">{weather.code === 0 ? '☀️' : weather.code <= 3 ? '☁️' : weather.code <= 48 ? '🌫️' : weather.code <= 67 ? '🌧️' : weather.code <= 77 ? '❄️' : weather.code <= 82 ? '🌦️' : '⛈️'}</span>
            <div>
              <p className="text-2xl font-bold">{weather.temp}°C</p>
              <p className="text-xs opacity-80">{weather.code === 0 ? 'Sonnig' : weather.code <= 3 ? 'Bewölkt' : weather.code <= 48 ? 'Nebel' : weather.code <= 67 ? 'Regen' : weather.code <= 77 ? 'Schnee' : weather.code <= 82 ? 'Schauer' : 'Gewitter'}</p>
            </div>
          </div>
          {/* Stunden-Leiste */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0">
            {weather.hourly.filter((_, i) => i % 2 === 0).map(h => (
              <div key={h.hour} className="text-center shrink-0 px-1">
                <p className="text-[9px] opacity-60">{String(h.hour).padStart(2, '0')}:00</p>
                <p className="text-xs font-semibold">{h.temp}°</p>
              </div>
            ))}
          </div>
          <div className="shrink-0 text-right hidden sm:block">
            <p className="text-sm font-medium">Gute Fahrt!</p>
            <p className="text-[10px] opacity-80">{weather.tip}</p>
          </div>
        </div>
      )}

      {/* ═══ HAUPTBEREICH ═══ */}
      <div className="flex-1 min-h-0">

        {/* MODUS 1: ÜBERSICHT */}
        {mode === 'overview' && <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
          {/* LINKS: Tagesplan */}
          <div className="overflow-y-auto p-4 border-r border-gray-200 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-800">Heutige Termine</span>
              {routeUrl && <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-medium px-2.5 py-1 rounded-lg"><NavigationIcon className="w-3 h-3" /> Alle navigieren</a>}
            </div>
            {termine.length === 0 ? <div className="bg-gray-50 rounded-xl p-10 text-center"><p className="text-gray-400">Keine Termine für heute</p></div>
            : termine.map((t, i) => (
              <div key={t.id}>
                <div className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-blue-600 tabular-nums w-14 shrink-0">{t.uhrzeit}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-900">{t.kunde}</span>
                      {t.kennzeichen && <span className="ml-2 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{t.kennzeichen}</span>}
                      <p className="text-xs text-gray-500 truncate mt-0.5">{t.adresse}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => startNav(t)} className="flex items-center gap-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium px-3 py-1.5 rounded-lg"><NavigationIcon className="w-3 h-3" /> Route starten</button>
                    {t.telefon && <a href={`tel:${t.telefon}`} className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-lg"><PhoneIcon className="w-3 h-3" /> Anrufen</a>}
                    <Link href={`/gutachter/fall/${t.id}`} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">Details</Link>
                  </div>
                </div>
                {i < termine.length - 1 && <p className="text-[10px] text-gray-400 text-center py-1">↓ ~25 Min · 18 km</p>}
              </div>
            ))}
          </div>
          {/* RECHTS: Widgets */}
          <div className="overflow-y-auto p-4 space-y-3 hidden lg:block">
            {neueKunden.length > 0 && <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-800 mb-2">Neue Aufträge ({neueKunden.length})</p>
              {neueKunden.map(k => <div key={k.id} onClick={() => router.push(`/gutachter/fall/${k.id}`)} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                <div className="flex-1 min-w-0"><p className="text-sm text-gray-900 truncate">{k.kunde}</p><div className="flex gap-1 mt-0.5">{k.kennzeichen && <span className="text-[9px] bg-gray-100 text-gray-600 px-1 py-0.5 rounded">{k.kennzeichen}</span>}{k.schadentyp && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded">{k.schadentyp.toUpperCase()}</span>}</div></div>
                <span className="text-[9px] text-gray-400">{k.datum}</span>
              </div>)}
            </div>}
            {tasks.length > 0 && <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-800 mb-2">Offene Aufgaben ({tasks.length})</p>
              {tasks.slice(0, 5).map(t => <div key={t.id} onClick={() => t.fallId && router.push(`/gutachter/fall/${t.fallId}`)} className="text-xs text-gray-700 hover:text-blue-600 py-1.5 cursor-pointer truncate border-b border-gray-50 last:border-0">{t.titel}</div>)}
            </div>}
            <div className="grid grid-cols-2 gap-2">
              <Link href="/gutachter/faelle" className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:border-blue-300"><p className="text-lg font-bold text-gray-900">{stats.faelle}/{stats.maxFaelle}</p><p className="text-[10px] text-gray-500">Fälle gesamt</p></Link>
              <Link href="/gutachter/faelle" className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:border-blue-300"><p className="text-lg font-bold text-gray-900">{stats.monat}</p><p className="text-[10px] text-gray-500">Diesen Monat</p></Link>
              <Link href="/gutachter/profil" className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:border-blue-300"><p className="text-lg font-bold text-gray-900">{Math.round((stats.faelle / Math.max(1, stats.maxFaelle)) * 100)}%</p><p className="text-[10px] text-gray-500">Auslastung</p></Link>
              <Link href="/gutachter/abrechnung" className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:border-blue-300"><p className="text-lg font-bold text-gray-900">{stats.guthaben}€</p><p className="text-[10px] text-gray-500">Guthaben</p></Link>
            </div>
            {gutachtenFaellig && <Link href={`/gutachter/fall/${gutachtenFaellig.id}`} className="block bg-amber-50 border border-amber-200 rounded-lg p-3 hover:bg-amber-100">
              <p className="text-xs font-semibold text-amber-700">Nächstes Gutachten fällig</p>
              <p className="text-sm text-gray-900 mt-0.5">{gutachtenFaellig.kunde}</p>
              <span className="text-[10px] text-amber-600">→ Jetzt hochladen</span>
            </Link>}
          </div>
        </div>}

        {/* MODUS 2+3 */}
        {mode !== 'overview' && activeFall && <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
          {/* LINKS */}
          <div className={`flex flex-col ${mobileTab === 'kunde' ? 'hidden lg:flex' : ''}`}>
            {mode === 'navigation' && <>
              {embedUrl ? <iframe src={embedUrl} className="flex-1 w-full border-0" allowFullScreen loading="lazy" /> : <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-400">Karte nicht verfügbar</div>}
              <div className="h-16 flex-shrink-0 p-2 border-t border-gray-200 flex gap-2">
                {navUrl && <a href={navUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg"><NavigationIcon className="w-4 h-4" /> In Google Maps öffnen</a>}
                <button onClick={() => setMode('onsite')} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg"><MapPinIcon className="w-4 h-4" /> Bin angekommen</button>
              </div>
            </>}
            {mode === 'onsite' && <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">Vor-Ort Dokumentation</p>
              <div className="h-1.5 bg-gray-200 rounded-full"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${((fc + (fin.length === 17 ? 1 : 0) + (km ? 1 : 0)) / (FOTO_SLOTS.length + 2)) * 100}%` }} /></div>
              <div className="grid grid-cols-2 gap-2">{FOTO_SLOTS.map(s => <label key={s} className={`flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed cursor-pointer min-h-[48px] ${fotos[s] ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-blue-300'}`}>{fotos[s] ? <CheckIcon className="w-5 h-5" /> : <CameraIcon className="w-5 h-5" />}<span className="text-sm font-medium">{s}</span><input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFoto(s, e.target.files[0]) }} disabled={uploading} /></label>)}</div>
              <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                <div><label className="text-xs text-gray-500 block mb-1">FIN (17 Zeichen)</label><input type="text" value={fin} onChange={e => setFin(e.target.value.toUpperCase().slice(0, 17))} maxLength={17} placeholder="WVWZZZ3CZWE123456" className="w-full bg-white border border-gray-300 text-sm font-mono rounded-lg px-3 py-2 tracking-wider" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Kilometerstand</label><input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="45230" className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Notizen</label><textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={2} placeholder="Bemerkungen..." className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 resize-none" /></div>
              </div>
              <button onClick={complete} disabled={completing || fc < 4} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-3 rounded-xl min-h-[48px]">{completing ? 'Speichert...' : 'Besichtigung abschliessen'}</button>
              {fc < 4 && <p className="text-gray-400 text-[10px] text-center">Min. 4 Fotos</p>}
            </div>}
          </div>
          {/* RECHTS: Kunden-Info */}
          <div className={`overflow-y-auto p-4 space-y-2 border-l border-gray-200 ${mobileTab !== 'kunde' ? 'hidden lg:block' : ''}`}>
            <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-400 uppercase mb-1">Kunde</p><p className="text-base font-semibold text-gray-900">{activeFall.kunde}</p>{activeFall.telefon && <a href={`tel:${activeFall.telefon}`} className="flex items-center gap-1.5 text-blue-600 text-sm mt-1"><PhoneIcon className="w-3.5 h-3.5" /> {activeFall.telefon}</a>}{activeFall.email && <p className="text-xs text-gray-500 mt-0.5">{activeFall.email}</p>}</div>
            <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-400 uppercase mb-1">Fahrzeug</p>{activeFall.kennzeichen && <p className="text-sm font-mono font-semibold text-gray-900">{activeFall.kennzeichen}</p>}{activeFall.fahrzeug && <p className="text-xs text-gray-500">{activeFall.fahrzeug}</p>}{activeFall.schadentyp && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded mt-1 inline-block">{activeFall.schadentyp.toUpperCase()}</span>}</div>
            <div className="bg-white border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-400 uppercase mb-1">Termin</p><p className="text-sm text-gray-700">{activeFall.adresse}</p><p className="text-xs text-gray-500 mt-1">{activeFall.uhrzeit} Uhr</p></div>
            {activeFall.telefon && <a href={`tel:${activeFall.telefon}`} className="flex items-center justify-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium py-2.5 rounded-xl w-full"><PhoneIcon className="w-4 h-4" /> Kunden anrufen</a>}
          </div>
        </div>}
      </div>
    </div>
  )
}
