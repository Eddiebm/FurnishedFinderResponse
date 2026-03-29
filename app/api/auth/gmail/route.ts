import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  // Verify this is a legitimate request from the dashboard
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = getAuthUrl()
  return NextResponse.redirect(url)
}
