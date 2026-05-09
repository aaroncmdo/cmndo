import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// AAR-467 C1: Client-seitiger Store für den Kunden-Flow /schaden-melden.
// Persistiert bewusst in sessionStorage (nicht localStorage) — bei Tab-Close
// wird der State geleert. Resume zwischen Sessions läuft über Magic-Link
// (AAR-477 C11) nicht über persistenten lokalen State.

export type FlowFoto = { bereich: string; url: string }

export type FlowState = {
  leadId: string | null
  currentStep: 1 | 2 | 3 | 4
  // Schritt 1
  schadenhergangMode: 'tippen' | 'voice' | null
  voiceTranscript: string | null
  voiceInputQuelle: boolean
  // Schritt 2
  fotos: FlowFoto[]
  claudeVisionResult: unknown | null
  datResult: unknown | null
  // Schritt 2c
  gegnerDatenErfasst: boolean
  // Schritt 3
  zb1Erfasst: boolean
  // Konditionelle Flow-Flags aus Schritt 1 (bestimmen Schritte und Validierungen)
  istFahrzeughalter: boolean
  hatVorschaeden: boolean
  schuldfrage: 'gegner' | 'unklar' | 'eigenverantwortung' | null
  // Makler-Attribution
  promotionCode: string | null

  setLeadId: (id: string) => void
  setCurrentStep: (step: 1 | 2 | 3 | 4) => void
  setSchadenhergang: (mode: 'tippen' | 'voice', transcript?: string) => void
  setFotos: (fotos: FlowFoto[]) => void
  setVisionResult: (r: unknown) => void
  setDatResult: (r: unknown) => void
  markGegnerErfasst: () => void
  markZb1Erfasst: () => void
  setFlowFlags: (flags: { istFahrzeughalter: boolean; hatVorschaeden: boolean; schuldfrage: 'gegner' | 'unklar' | 'eigenverantwortung' }) => void
  setPromotionCode: (code: string) => void
  reset: () => void
}

type InitialState = Omit<
  FlowState,
  | 'setLeadId'
  | 'setCurrentStep'
  | 'setSchadenhergang'
  | 'setFotos'
  | 'setVisionResult'
  | 'setDatResult'
  | 'markGegnerErfasst'
  | 'markZb1Erfasst'
  | 'setFlowFlags'
  | 'setPromotionCode'
  | 'reset'
>

const INITIAL: InitialState = {
  leadId: null,
  currentStep: 1,
  schadenhergangMode: null,
  voiceTranscript: null,
  voiceInputQuelle: false,
  fotos: [],
  claudeVisionResult: null,
  datResult: null,
  gegnerDatenErfasst: false,
  zb1Erfasst: false,
  istFahrzeughalter: true,
  hatVorschaeden: false,
  schuldfrage: null,
  promotionCode: null,
}

export const useFlowStore = create<FlowState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setLeadId: (leadId) => set({ leadId }),
      setCurrentStep: (currentStep) => set({ currentStep }),
      setSchadenhergang: (mode, transcript) =>
        set({
          schadenhergangMode: mode,
          voiceTranscript: mode === 'voice' ? (transcript ?? null) : null,
          voiceInputQuelle: mode === 'voice',
        }),
      setFotos: (fotos) => set({ fotos }),
      setVisionResult: (claudeVisionResult) => set({ claudeVisionResult }),
      setDatResult: (datResult) => set({ datResult }),
      markGegnerErfasst: () => set({ gegnerDatenErfasst: true }),
      markZb1Erfasst: () => set({ zb1Erfasst: true }),
      setFlowFlags: (flags) => set(flags),
      setPromotionCode: (promotionCode) => set({ promotionCode }),
      reset: () => set(INITIAL),
    }),
    {
      name: 'claimondo-flow',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)
