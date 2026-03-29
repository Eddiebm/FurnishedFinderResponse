import { NextResponse } from 'next/server'
import { getGmailTokens, getPollState, getAllLeads } from '@/lib/db'

export async function GET() {
  try {
    const [tokens, pollState, leads] = await Promise.all([
      getGmailTokens(),
      getPollState(),
      getAllLeads(),
    ])

    return NextResponse.json({
      gmailConnected: !!tokens,
      lastPollAt: pollState?.lastPollAt ?? null,
      totalLeads: leads.length,
      byStatus: {
        new: leads.filter(l => l.status === 'new').length,
        active: leads.filter(l => l.status === 'active').length,
        flagged: leads.filter(l => l.status === 'flagged').length,
        handoff: leads.filter(l => l.status === 'handoff').length,
        closed: leads.filter(l => l.status === 'closed').length,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
