'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboardIcon,
  MapIcon,
  FolderOpenIcon,
  CalendarIcon,
  ReceiptIcon,
  UserIcon,
  LogOutIcon,
} from 'lucide-react'
import NotificationBell from '@/app/admin/_components/NotificationBell'

const NAV_ITEMS = [
  { href: '/gutachter', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/gutachter/faelle', label: 'Meine Fälle', icon: FolderOpenIcon },
  { href: '/gutachter/gebiet', label: 'Mein Gebiet', icon: MapIcon },
  { href: '/gutachter/kalender', label: 'Kalender', icon: CalendarIcon },
  { href: '/gutachter/abrechnung', label: 'Abrechnung', icon: ReceiptIcon },
]

type HourW = { hour: number; temp: number; code: number }
type DailyW = { date: string; tempMax: number; tempMin: number; code: number }

function wEmoji(c: number) { return c === 0 ? '☀️' : c <= 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌦️' : '⛈️' }
function wGrad(c: number) { return c >= 61 ? 'from-gray-700 to-gray-500' : c >= 45 ? 'from-gray-500 to-gray-400' : c <= 3 ? 'from-blue-500 to-sky-400' : 'from-gray-400 to-gray-300' }
function wTip(c: number, t: number) { return c >= 95 ? 'Vorsicht, Gewitter!' : c >= 71 ? 'Straßen können glatt sein!' : c >= 61 ? 'Regenjacke einpacken!' : t > 30 ? 'Wasser mitnehmen!' : t < 5 ? 'Warm anziehen!' : 'Perfektes Gutachter-Wetter!' }
function wLabel(c: number) { return c === 0 ? 'Sonnig' : c <= 3 ? 'Bewölkt' : c <= 48 ? 'Nebel' : c <= 67 ? 'Regen' : c <= 77 ? 'Schnee' : c <= 82 ? 'Schauer' : 'Gewitter' }

export default function GutachterShell({
  displayName,
  children,
  logoUrl,
  brandPrimary,
  brandSecondary,
  standortLat,
  standortLng,
}: {
  displayName: string
  children: React.ReactNode
  logoUrl?: string | null
  brandPrimary?: string | null
  brandSecondary?: string | null
  standortLat?: number | null
  standortLng?: number | null
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [weather, setWeather] = useState<{ temp: number; code: number; hourly: Record<string, HourW[]>; daily: DailyW[] } | null>(null)

  // Apply brand colors
  useEffect(() => {
    if (brandPrimary) document.documentElement.style.setProperty('--brand-primary', brandPrimary)
    if (brandSecondary) document.documentElement.style.setProperty('--brand-secondary', brandSecondary)
    return () => {
      document.documentElement.style.removeProperty('--brand-primary')
      document.documentElement.style.removeProperty('--brand-secondary')
    }
  }, [brandPrimary, brandSecondary])

  // Fetch 7-day weather
  useEffect(() => {
    if (!standortLat || !standortLng) return
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${standortLat}&longitude=${standortLng}&current=temperature_2m,weathercode&hourly=temperature_2m,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe/Berlin&forecast_days=7`)
      .then(r => r.json()).then(d => {
        if (!d.current) return
        // Group hourly data by date
        const hourlyByDate: Record<string, HourW[]> = {}
        for (let i = 0; i < (d.hourly?.time ?? []).length; i++) {
          const t = d.hourly.time[i]
          const dateKey = t.split('T')[0]
          const h: HourW = { hour: new Date(t).getHours(), temp: Math.round(d.hourly.temperature_2m[i]), code: d.hourly.weathercode[i] }
          if (!hourlyByDate[dateKey]) hourlyByDate[dateKey] = []
          hourlyByDate[dateKey].push(h)
        }
        // Daily data
        const daily: DailyW[] = (d.daily?.time ?? []).map((t: string, i: number) => ({
          date: t,
          tempMax: Math.round(d.daily.temperature_2m_max[i]),
          tempMin: Math.round(d.daily.temperature_2m_min[i]),
          code: d.daily.weathercode[i],
        }))
        setWeather({ temp: Math.round(d.current.temperature_2m), code: d.current.weathercode, hourly: hourlyByDate, daily })
      }).catch(() => {})
  }, [standortLat, standortLng])

  const [unreadCount, setUnreadCount] = useState(0)

  const loadUnread = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('id')
      .or(`profile_id.eq.${user.id},user_id.eq.${user.id}`)
      .single()
    if (!sv) return
    const { count } = await supabase
      .from('gutachter_mitteilungen')
      .select('id', { count: 'exact', head: true })
      .eq('sv_id', sv.id)
      .eq('gelesen', false)
    setUnreadCount(count ?? 0)
  }, [])

  useEffect(() => {
    loadUnread()
    const supabase = createClient()
    const channel = supabase
      .channel('gutachter-mitteilungen-count')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gutachter_mitteilungen' }, () => loadUnread())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gutachter_mitteilungen' }, () => loadUnread())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadUnread])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function isActive(href: string) {
    if (href === '/gutachter') return pathname === '/gutachter'
    return pathname.startsWith(href)
  }

  // Get today's hourly weather for the banner
  const todayKey = new Date().toISOString().split('T')[0]
  const todayHourly = weather?.hourly?.[todayKey]?.filter(h => h.hour >= 8 && h.hour <= 18) ?? []
  const tomorrowDaily = weather?.daily?.[1] ?? null

  return (
    <div className="h-screen bg-[#f8f9fb] flex overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-5 border-b border-gray-200">
          {logoUrl ? (
            <Link href="/gutachter"><img src={logoUrl} alt="Logo" className="h-8 w-auto max-w-36 object-contain" /></Link>
          ) : (
            <h2 className="text-gray-900 font-semibold text-lg">Claimondo</h2>
          )}
          <p className="text-gray-500 text-xs mt-0.5">Gutachter-Portal</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive(href)
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto px-3 py-3 border-t border-gray-200 space-y-2">
          <Link href="/gutachter/profil" onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors group">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 text-sm font-semibold truncate">{displayName}</p>
              <p className="text-gray-400 text-xs">Sachverständiger</p>
            </div>
            <UserIcon className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
          </Link>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-gray-50 transition-colors">
            <LogOutIcon className="w-4 h-4" /> Abmelden
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Mobile Header (nur Hamburger + Logo, Glocke ist im Wetter-Banner) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-gray-500 hover:text-gray-800 transition-colors" aria-label="Menu oeffnen">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="text-gray-900 font-semibold text-sm">Claimondo</span>
          <div className="w-8" />
        </header>

        {/* Wetter-Banner (auf ALLEN Seiten sichtbar) */}
        {weather && (
          <div className={`flex-shrink-0 px-4 py-2.5 flex items-center gap-4 bg-gradient-to-r ${wGrad(weather.code)} text-white`} style={{ minHeight: 64 }}>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-3xl">{wEmoji(weather.code)}</span>
              <div><p className="text-xl font-bold">{weather.temp}°C</p><p className="text-[10px] opacity-80">{wLabel(weather.code)}</p></div>
            </div>
            <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0">
              {todayHourly.filter((_, i) => i % 2 === 0).map(h => (
                <div key={h.hour} className="text-center shrink-0 px-1"><p className="text-[9px] opacity-60">{String(h.hour).padStart(2, '0')}h</p><p className="text-[10px]">{wEmoji(h.code)}</p><p className="text-xs font-semibold">{h.temp}°</p></div>
              ))}
            </div>
            {/* Mobile: nur Glocke */}
            <div className="shrink-0 sm:hidden"><NotificationBell /></div>
            {/* Desktop: Gute Fahrt + Glocke */}
            <div className="shrink-0 text-right hidden sm:flex sm:items-center sm:gap-3">
              <div>
                <p className="text-sm font-medium">Gute Fahrt!</p>
                <p className="text-[10px] opacity-80">{wTip(weather.code, weather.temp)}</p>
                {tomorrowDaily && (
                  <p className="text-[10px] opacity-70 mt-0.5">Morgen: {wEmoji(tomorrowDaily.code)} {tomorrowDaily.tempMax}°/{tomorrowDaily.tempMin}° {wLabel(tomorrowDaily.code)}</p>
                )}
              </div>
              <NotificationBell />
            </div>
          </div>
        )}

        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
