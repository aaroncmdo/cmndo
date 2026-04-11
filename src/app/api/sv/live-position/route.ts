import { NextRequest, NextResponse } from 'next/server'
import { updateLivePosition } from '@/lib/termine/actions'

// KFZ-200: API Route für SV Live-Position Update.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { terminId, lat, lng } = body as { terminId?: string; lat?: number; lng?: number }

    if (!terminId || lat == null || lng == null) {
      return NextResponse.json({ error: 'terminId, lat, lng required' }, { status: 400 })
    }

    const result = await updateLivePosition(terminId, lat, lng)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
