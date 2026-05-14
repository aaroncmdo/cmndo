// AAR-745f (2026-05-13): Liquid-Glass-Field-Style als wiederverwendbare
// Tailwind-Klassen-Konstante. Wird von 4+ Stellen verwendet:
//   - src/app/flow/[token]/FlowWizardKfz.tsx (Input)
//   - src/app/gutachter/faelle/FaelleFilterBar.tsx (Search-Input)
//   - src/app/gutachter/reklamationen/ReklamationenClient.tsx (2× Select + Textarea)
//
// Bewusst KEINE Component — die 4 Vorkommen variieren in Padding/Rows/Icon-
// Slots zu stark, eine generische Component würde mehr Props als Wert bringen.
// Stattdessen: gemeinsame Basis-Klassen, Caller hängt Layout-Modifier (Padding,
// Width, Resize) selber dran.
//
// Wenn du das fünfte Vorkommen migrierst und ein klares Variant-Schema siehst,
// hier eine `LiquidField`-Component anlegen und die Konstante zum impl-detail
// degradieren.

/**
 * Basis-Klassen für Liquid-Glass-Form-Felder (input/select/textarea).
 *
 * Enthält: bg, border (transparent), text, hover, focus (white-bg, ondo-border,
 * focus-ring-shadow), transitions. Es fehlen bewusst: width, padding, radius —
 * die definiert der Caller, weil sie pro Use-Case variieren.
 *
 * Empfohlene Zusätze:
 *   - Standard-Field: `w-full rounded-claimondo-md px-4 py-3 text-sm`
 *   - Großes Field: `w-full rounded-claimondo-md px-4 py-3.5 text-base`
 *   - Textarea: + `resize-none`
 */
export const liquidFieldBase =
  'bg-claimondo-navy/[0.06] border-[1.5px] border-transparent text-claimondo-navy tracking-[-.005em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo'

/**
 * Standard-Field-Klassen — `liquidFieldBase` + Standard-Layout (w-full,
 * rounded-claimondo-md, px-4 py-3, text-sm). Deckt 90% der Vorkommen ab.
 */
export const liquidField = `w-full rounded-claimondo-md px-4 py-3 text-sm ${liquidFieldBase}`
