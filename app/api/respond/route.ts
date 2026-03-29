import { NextRequest, NextResponse } from 'next/server'
import { getLead, saveLead, getAllProperties, getSettings } from '@/lib/db'
import { generateResponse } from '@/lib/ai'
import { sendReply } from '@/lib/gmail'
import type { Message } from '@/types'

// POST /api/respond — generate + send (manual trigger from dashboard)
export async function POST(req: NextRequest) {
  try {
    const { leadId, customMessage } = await req.json()
    const [lead, properties, settings] = await Promise.all([
      getLead(leadId), getAllProperties(), getSettings(),
    ])

    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    const property = properties.find(p => p.id === lead.propertyId)
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    const responseText = customMessage?.trim()
      ? customMessage.trim()
      : await generateResponse(lead, property, settings)

    const fullResponse = `${responseText}\n\n— ${settings.responseSignature}`
    const lastInbound = [...lead.messages].reverse().find(m => m.role === 'inbound')

    const sentMessageId = await sendReply({
      to: lead.email,
      subject: `Re: Your Inquiry about ${property.address}`,
      body: fullResponse,
      threadId: lead.gmailThreadId,
      inReplyToMessageId: lastInbound?.gmailMessageId,
      // Send from the property's dedicated address
      fromAlias: property.propertyEmail,
      fromAliasName: property.propertyEmailName ?? property.address,
    })

    const outboundMsg: Message = {
      id: `msg_${sentMessageId}`, role: 'outbound',
      content: fullResponse,
      timestamp: new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }),
      isAI: !customMessage, gmailMessageId: sentMessageId, gmailThreadId: lead.gmailThreadId,
    }

    const updatedLead = {
      ...lead,
      messages: [...lead.messages, outboundMsg],
      lastActivity: outboundMsg.timestamp,
      status: (lead.status === 'new' ? 'active' : lead.status) as typeof lead.status,
    }

    await saveLead(updatedLead)
    return NextResponse.json({ success: true, messageId: sentMessageId, lead: updatedLead, response: fullResponse })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/respond?leadId=xxx — draft only, no send
export async function GET(req: NextRequest) {
  try {
    const leadId = req.nextUrl.searchParams.get('leadId')
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })

    const [lead, properties, settings] = await Promise.all([
      getLead(leadId), getAllProperties(), getSettings(),
    ])
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    const property = properties.find(p => p.id === lead.propertyId)
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    const draft = await generateResponse(lead, property, settings)
    return NextResponse.json({ draft, sendAsAlias: property.propertyEmail })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
