import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsApp } from '@/lib/whatsapp'

async function handleTestWhatsApp() {
  // Auth check
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet — bitte zuerst einloggen.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rolle, telefon').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return NextResponse.json({ success: false, error: 'Nur fuer Admin.' }, { status: 403 })

  // Aaron 21.09.2026: "nimm fuer alle tests unsere nummern raus, nur das was echt ist soll
  // bei uns ankommen." Hier stand Aarons Mobilnummer fest verdrahtet — ein Selbsttest, den
  // JEDER Admin ausloesen konnte und der IMMER auf demselben Geraet ankam. Der Test geht
  // jetzt an die eigene Nummer des ausloesenden Admins; ohne hinterlegte Nummer schlaegt er
  // sichtbar fehl, statt still an jemand anderen zu gehen.
  const eigeneNummer = profile?.telefon ?? null
  if (!eigeneNummer) {
    return NextResponse.json(
      {
        success: false,
        error: 'Keine Telefonnummer im eigenen Profil hinterlegt — bitte unter Einstellungen eintragen.',
      },
      { status: 400 },
    )
  }

  // WhatsApp-Versand laeuft ueber den Baileys-Service (Twilio 2026-06-02 entfernt).
  const result = await sendWhatsApp(eigeneNummer, 'Test von Claimondo — WhatsApp funktioniert! 🚗✅')
  return NextResponse.json({ ...result, to: eigeneNummer, provider: 'baileys' })
}

export async function GET() { return handleTestWhatsApp() }
export async function POST() { return handleTestWhatsApp() }
