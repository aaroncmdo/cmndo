'use client'

import { useClarityConsentInit } from './useClarityConsentInit'

// LP-spezifische Microsoft-Clarity-Init mit Consent-Gate.
//
// Warum eigene Komponente (statt ClarityInit): die kfzgutachter-LP nutzt eine
// eigene Clarity-Project-ID (CLARITY_ID in src/app/kfzgutachter-lp/page.tsx) und
// soll zusaetzlich native Google-Consent-Mode-Updates (gtag('consent','update'))
// als Gate-Trigger akzeptieren — nicht nur das CMP-Event. ClarityInit ueber-
// springt /kfzgutachter-lp ohnehin via SKIP_ROUTES (ausser projectId gesetzt);
// hier uebernimmt ClarityInitLP die Init mit listenNativeGcm. Die geteilte
// Consent-Init-Logik liegt in useClarityConsentInit — kein Duplikat.
export function ClarityInitLP({ projectId }: { projectId: string }) {
  useClarityConsentInit(projectId, { listenNativeGcm: true })
  return null
}
