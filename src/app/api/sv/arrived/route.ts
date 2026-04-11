import { NextRequest, NextResponse } from 'next/server'
import { arrived } from '@/lib/termine/actions'

// KFZ-200: API Route für SV Ankunft.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { terminId } = body as { terminId?: string }

    if (!terminId) {
      return NextResponse.json({ error: 'terminId required' }, { status: 400 })
    }

    const result = await arrived(terminId)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
