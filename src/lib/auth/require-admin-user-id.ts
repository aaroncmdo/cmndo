// Audit-Dedup 04.08.: EINE Implementierung des leichtgewichtigen Admin-Gates
// "userId wenn admin, sonst null" — ersetzt 4 byte-identische lokale Kopien
// (admin/ai-vorschlaege, admin/ki-aufsicht, api/admin/claim-copilot,
// faelle/[id]/claim-ai-actions). Fuer Result-orientierte Guards mit
// supabase-Handle weiterhin requireRole (lib/auth/guards) nutzen.
import { createClient } from '@/lib/supabase/server'

/** Liefert die User-Id des eingeloggten Admins — oder null (kein User / keine Admin-Rolle). */
export async function requireAdminUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  return profile?.rolle === 'admin' ? user.id : null
}
