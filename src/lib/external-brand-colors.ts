// Token-Audit-Exceptions: Externe Brand-Farben + dokumentierte Sonderfälle.
//
// Diese Hex-Werte tauchen in JSX als `bg-[#xxxxxx]`-Klassen auf — sie sind
// **bewusste Ausnahmen** vom Claimondo-Token-System. Jede Ausnahme hat einen
// dokumentierten Grund (Brand-Compliance, Map-Marker, externe Service-CI).
//
// Wenn der Token-Audit-Grep (`grep -rE "\[#[0-9a-fA-F]+\]" src/`) eine Stelle
// findet die NICHT in dieser Liste steht → Bug, sofort fixen.
//
// Konstanten werden **nicht** in Tailwind-Class-Strings importiert (Tailwind
// JIT scannt nur statische Literale). Dies ist eine reine Inventar-Doku.

// ─── 3rd-Party Service Brand-Compliance ────────────────────────────────────

/** WhatsApp Brand Green. Vorgabe Meta-Brand-Guidelines für WA-Action-Buttons. */
export const WHATSAPP_GREEN = '#25D366'

/** LinkedIn Brand Blue. Vorgabe LinkedIn Brand Guidelines für Profil-Buttons. */
export const LINKEDIN_BLUE = '#0A66C2'

/** LexDrive Kanzlei-Partner Brand-Blau. Stammt aus deren Style-Guide. */
export const LEXDRIVE_BLUE = '#0e5be9'

// ─── Interne Kategoriefarben (cross-referenziert) ──────────────────────────

/**
 * SV-Typ-Farb-Schema. Wird in 2 Stellen visuell genutzt:
 * 1. `src/app/admin/sachverstaendige/_karte/KarteHubClient.tsx` — Map-Pin-Fill
 * 2. `src/app/admin/sachverstaendige/anlegen/AnlegenTabs.tsx` — Onboarding-Tabs
 * Die 4 Farben sind kategorial (kein Status-Gefälle) und müssen visuell stark
 * differenzieren — Claimondo-Tonleiter (navy/ondo/shield/light-blue) reicht
 * nicht für 4-fache eindeutige Kategorisierung auf einem Map-View.
 * AAR-198: bewusste Außerhalb-Token-Wahl, dokumentiert.
 */
export const SV_TYP_COLORS = {
  kfzGutachter: '#3b82f6', // Solo-SV (Tailwind blue-500)
  gutachterbuero: '#a855f7', // Büro (Tailwind violet-500)
  akademie: '#22c55e', // Akademie (Tailwind green-500)
  community: '#0ea5e9', // Community (Tailwind sky-500)
} as const

// ─── 1-off Premium-Akzente (sehr eng begrenzte Verwendung) ─────────────────

/** Cream-Accent für Hero-Headline „Wir regeln Ihren KFZ-Schaden" auf Landing.
 *  Bewusst wärmlicher als reinweiß, kontrastiert mit dem navy-Hintergrund. */
export const LANDING_HERO_CREAM = '#F5F1E8'

/** Gold-Accent für „Premium-Termin"-Indikator in Navigation. Luxury-Marker. */
export const NAVIGATION_GOLD = '#C9A84C'
