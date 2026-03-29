import { NextRequest, NextResponse } from 'next/server'
import { getLead, saveLead, deleteLead } from '@/lib/db'

// GET /api/leads/[id]
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const lead = await getLead(params.id)
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(lead)
}

// PATCH /api/leads/[id] — partial update (status, flagReasons, info, messages)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const lead = await getLead(params.id)
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updates = await req.json()
    const updated = { ...lead, ...updates, lastActivity: new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }) }
    await saveLead(updated)
    return NextResponse.json(updated)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/leads/[id]
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteLead(params.id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
