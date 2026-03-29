import { NextRequest, NextResponse } from 'next/server'
import { getAllLeads, saveLead, deleteLead, getLead } from '@/lib/db'
import type { Lead } from '@/types'

// GET /api/leads — list all leads
export async function GET() {
  try {
    const leads = await getAllLeads()
    // Sort by urgency then recency
    const statusOrder = { flagged: 0, handoff: 1, new: 2, active: 3, closed: 4 }
    leads.sort((a, b) =>
      statusOrder[a.status] - statusOrder[b.status] ||
      b.lastActivity.localeCompare(a.lastActivity)
    )
    return NextResponse.json(leads)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/leads — create a manual lead
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const lead: Lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      propertyId: body.propertyId ?? 'unknown',
      name: body.name ?? '',
      email: body.email ?? '',
      moveInDate: body.moveInDate ?? '',
      lengthOfStay: body.lengthOfStay ?? 0,
      occupation: body.occupation ?? '',
      reasonForStay: body.reasonForStay ?? '',
      status: 'new',
      flagReasons: [],
      messages: [],
      createdAt: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      lastActivity: new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }),
      infoCollected: { moveInDate: false, lengthOfStay: false, occupation: false, reasonForStay: false },
    }
    await saveLead(lead)
    return NextResponse.json(lead, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
