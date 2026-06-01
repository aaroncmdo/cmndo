// Render-Loader fuer den beauftragung-Flow (Gutachter-Finder->Self-Service, Y-Modell).
// Seit 2026-06-01 (P2a) ein duenner Wrapper um den generischen ladeFlowPhasen —
// die Lade-/Lokalisier-/audience-Filter-Logik liegt zentral in lade-flow-phasen.ts
// (geteilt mit dem Dispatcher-Renderer). beauftragung = Kunden-Sicht (audience='kunde').
// Reiner Server-Loader (kein 'use server' — wird aus /anfrage/[token]/page.tsx aufgerufen).

import type { OnboardingPhase } from '@/components/onboarding/types'
import { ladeFlowPhasen } from './lade-flow-phasen'

export async function ladeBeauftragungPhasen(): Promise<OnboardingPhase[]> {
  return ladeFlowPhasen('beauftragung', 'kunde')
}
