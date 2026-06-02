// Reservierungs-TTL: wie lange ein 'reserviert'-Hold gilt, bevor die zentrale
// Expiry (Cron expire_geblockte_termine_ohne_sa) ihn auf 'storniert' flippt.
export const RESERVIERUNG_TTL_MIN = 15
