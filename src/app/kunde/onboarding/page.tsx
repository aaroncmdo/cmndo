// CMM-14 Diag: temporär maximal vereinfacht — nur ein Hello-Div um zu
// testen ob die Page überhaupt zum Render kommt oder ob der Crash im
// Layout oder Provider darüber sitzt. Die volle Page-Logik liegt im
// Backup OnboardingWizard.tsx + actions.ts und kommt nach Diag zurück.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  return (
    <div style={{ padding: 32, background: '#00aaff', color: 'white', minHeight: '100vh', fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>✅ ONBOARDING MINIMAL TEST</h1>
      <p style={{ marginTop: 8, fontSize: 14 }}>User-ID: {user.id}</p>
      <p style={{ marginTop: 4, fontSize: 14 }}>Email: {user.email}</p>
      <p style={{ marginTop: 16, fontSize: 12, opacity: 0.8 }}>
        Wenn du diese blaue Seite siehst, rendert die Page korrekt. Der White-Screen-Bug
        liegt dann in einem entfernten Wizard-Render-Pfad. Sag mir Bescheid und ich stelle
        die volle Page wieder her und debugge gezielt.
      </p>
    </div>
  )
}
