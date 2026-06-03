import { createServiceClient } from '@/lib/supabase/server'

export async function createNotification(
  userId: string,
  typ: string,
  titel: string,
  beschreibung?: string,
  link?: string,
) {
  const svc = createServiceClient()
  await svc.from('benachrichtigungen').insert({
    user_id: userId,
    typ,
    titel,
    beschreibung: beschreibung ?? null,
    link: link ?? null,
  })
}
