import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient } from '@/lib/gmail'
import { saveGmailTokens, savePollState } from '@/lib/db'
import { google } from 'googleapis'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.json({ error: 'No auth code provided' }, { status: 400 })
  }

  try {
    const oauth2Client = getOAuthClient()
    const { tokens } = await oauth2Client.getToken(code)

    await saveGmailTokens({
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      expiry_date: tokens.expiry_date!,
    })

    // Grab starting historyId so we only process NEW emails from this point
    oauth2Client.setCredentials(tokens)
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const profile = await gmail.users.getProfile({ userId: 'me' })

    await savePollState({
      lastHistoryId: profile.data.historyId!,
      lastPollAt: new Date().toISOString(),
    })

    return new NextResponse(`
      <html>
        <body style="font-family:sans-serif;padding:40px;background:#0a0a0b;color:#f0f0f2;text-align:center">
          <h2 style="color:#e8ff5a">✓ Gmail Connected</h2>
          <p>LeaseAI is now monitoring your inbox for Furnished Finder inquiries.</p>
          <p style="color:#4a4a5a;font-size:13px">You can close this tab and return to your dashboard.</p>
        </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
