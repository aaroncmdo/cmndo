// AAR-664 (Folge): Konstanten getrennt von der `'use server'`-Action.
// Siehe `manual-status-override.constants.ts` für die ausführliche Begründung —
// Next.js 15 exportiert non-function Werte aus `'use server'`-Modulen nicht
// als Original ans Client-Bundle. `for (... of ALLOWED_PHASE_VALUES)` warf
// `TypeError: ai is not iterable` und riss die ganze Fallakte runter
// (FallActionBar mountet den Modal immer, useMemo wird beim Render evaluiert).

import { SUBPHASE_VISIBILITY } from '@/lib/fall/subphase-visibility'

export const ALLOWED_PHASE_VALUES = Object.keys(SUBPHASE_VISIBILITY) as readonly string[]
