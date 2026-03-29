import { NextRequest, NextResponse } from 'next/server'
import { fetchNewMessages, sendReply } from '@/lib/gmail'
import { extractLeadFromEmail, matchProperty, detectFlags, detectHandoff } from '@/lib/parser'
import { generateResponse } from '@/lib/ai'
import {
  getAllLeads, saveLead, getAllProperties, getLeadByThreadId,
  getSettings, getPollState, savePollState, getLead,
} from '@/lib/db'
import type { Lead, Message, Property } from '@/types'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isManual = req.nextUrl.searchParams.get('secret') === process.env.CRON_SECRET

  if (!isVercelCron && !isManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = {
    newLeads: 0, updatedLeads: 0, responded: 0,
    flagged: 0, handoffs: 0, errors: [] as string[],
  }

  try {
    const [pollState, properties, settings] = await Promise.all([
      getPollState(), getAllProperties(), getSettings(),
    ])

    const { messages, newHistoryId } = await fetchNewMessages(pollState?.lastHistoryId)

    for (const email of messages) {
      try {
        const existingLead = await getLeadByThreadId(email.threadId)
        if (existingLead) {
          await handleReply(existingLead, email, properties, settings, results)
        } else {
          await handleNewLead(email, properties, settings, results)
        }
      } catch (err: any) {
        results.errors.push(`Email ${email.messageId}: ${err.message}`)
      }
    }

    await savePollState({ lastHistoryId: newHistoryId, lastPollAt: new Date().toISOString() })

    return NextResponse.json({
      success: true, processedEmails: messages.length,
      ...results, pollTime: new Date().toISOString(),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function handleNewLead(email: any, properties: Property[], settings: any, results: any) {
  const matchedProp = matchProperty(email, properties)
  const leadData = extractLeadFromEmail(email, matchedProp)
  const flags = detectFlags(email.body, settings)
  const isHandoff = detectHandoff(email.body, settings)

  let status: Lead['status'] = 'new'
  if (flags.length > 0) { status = 'flagged'; results.flagged++ }
  else if (isHandoff) { status = 'handoff'; results.handoffs++ }

  const lead: Lead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...leadData, status, flagReasons: flags,
    createdAt: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    lastActivity: new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }

  await saveLead(lead)
  results.newLeads++

  const shouldRespond = settings.autoRespondNew && status !== 'flagged' && matchedProp
  if (shouldRespond) await sendAIResponse(lead, matchedProp!, email, settings, results)
}

async function handleReply(lead: Lead, email: any, properties: Property[], settings: any, results: any) {
  const inboundMsg: Message = {
    id: `msg_${email.messageId}`, role: 'inbound',
    content: email.body.slice(0, 2000),
    timestamp: new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }),
    isAI: false, gmailMessageId: email.messageId, gmailThreadId: email.threadId,
  }

  const newFlags = detectFlags(email.body, settings)
  const isHandoff = detectHandoff(email.body, settings)

  const updatedLead: Lead = {
    ...lead,
    messages: [...lead.messages, inboundMsg],
    lastActivity: inboundMsg.timestamp,
    flagReasons: [...new Set([...lead.flagReasons, ...newFlags])],
    status:
      newFlags.length > 0 ? 'flagged' :
      isHandoff ? 'handoff' :
      lead.status === 'new' ? 'active' : lead.status,
  }

  if (newFlags.length > 0) results.flagged++
  if (isHandoff && lead.status !== 'handoff') results.handoffs++

  await saveLead(updatedLead)
  results.updatedLeads++

  const prop = properties.find(p => p.id === lead.propertyId)
  const shouldRespond = settings.autoRespondActive &&
    updatedLead.status !== 'flagged' && updatedLead.status !== 'handoff' && prop
  if (shouldRespond) await sendAIResponse(updatedLead, prop!, email, settings, results)
}

async function sendAIResponse(lead: Lead, property: Property, email: any, settings: any, results: any) {
  try {
    const responseText = await generateResponse(lead, property, settings)
    const fullResponse = `${responseText}\n\n— ${settings.responseSignature}`

    const lastInbound = [...lead.messages].reverse().find(m => m.role === 'inbound')

    await sendReply({
      to: lead.email,
      subject: email.subject,
      body: fullResponse,
      threadId: email.threadId,
      inReplyToMessageId: lastInbound?.gmailMessageId,
      // Reply FROM the property's dedicated email address (Send As alias)
      fromAlias: property.propertyEmail,
      fromAliasName: property.propertyEmailName ?? property.address,
    })

    const outboundMsg: Message = {
      id: `msg_out_${Date.now()}`, role: 'outbound',
      content: fullResponse,
      timestamp: new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }),
      isAI: true, gmailThreadId: email.threadId,
    }

    const refreshed = await getLead(lead.id)
    if (refreshed) {
      await saveLead({
        ...refreshed,
        messages: [...refreshed.messages, outboundMsg],
        lastActivity: outboundMsg.timestamp,
        status: refreshed.status === 'new' ? 'active' : refreshed.status,
      })
    }

    results.responded++
  } catch (err: any) {
    results.errors.push(`AI response failed for lead ${lead.id}: ${err.message}`)
  }
}
