import { NextRequest, NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/lib/db'

export async function GET() {
  const settings = await getSettings()
  return NextResponse.json(settings)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    await saveSettings(body)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
