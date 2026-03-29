import Anthropic from '@anthropic-ai/sdk'
import type { Lead, Property, AISettings } from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function generateResponse(
  lead: Lead,
  property: Property,
  settings: AISettings
): Promise<string> {
  const systemPrompt = buildSystemPrompt(lead, property, settings)
  const messages = lead.messages.map(m => ({
    role: m.role === 'inbound' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }))

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages,
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

function buildSystemPrompt(lead: Lead, property: Property, settings: AISettings): string {
  const collected = lead.infoCollected
  const missing = []
  if (!collected.moveInDate) missing.push('move-in date')
  if (!collected.lengthOfStay) missing.push('length of stay')
  if (!collected.occupation) missing.push('occupation')
  if (!collected.reasonForStay) missing.push('reason for stay')

  return `${settings.responsePersona}

PROPERTY DETAILS (use these to answer questions — do not invent information):
Address: ${property.address}, ${property.city}, ${property.state}
Type: ${property.type} (${property.bedrooms} bed / ${property.bathrooms} bath)
Monthly Rate: $${property.pricePerMonth.toLocaleString()}
Available From: ${property.availableFrom}
Stay Range: ${property.minStay}–${property.maxStay} months
Utilities: ${property.utilitiesIncluded ? 'Included in rent' : 'Tenant pays utilities'}
Parking: ${property.parkingIncluded ? 'One spot included' : 'Not included'}
Pets: ${property.petsAllowed ? 'Allowed' : 'Not allowed'}
House Rules: ${property.houseRules}
Description: ${property.description}

LEAD INFO ALREADY COLLECTED:
- Move-in date: ${lead.infoCollected.moveInDate ? lead.moveInDate : 'not yet collected'}
- Length of stay: ${lead.infoCollected.lengthOfStay ? `${lead.lengthOfStay} months` : 'not yet collected'}
- Occupation: ${lead.infoCollected.occupation ? lead.occupation : 'not yet collected'}
- Reason for stay: ${lead.infoCollected.reasonForStay ? lead.reasonForStay : 'not yet collected'}

${missing.length > 0
  ? `STILL NEED TO COLLECT: ${missing.join(', ')}. Work these in naturally if not already discussed.`
  : 'ALL INFO COLLECTED. Focus on moving toward next steps.'}

RESPONSE RULES:
1. Answer their specific question first, then collect missing info
2. If they express intent to apply, sign a lease, or schedule a showing — say the property owner will be in touch directly to arrange that
3. Keep responses to 3–5 sentences. Be warm but efficient.
4. Never mention being an AI. Sign off as: ${settings.responseSignature}
5. Do not make up prices, availability, or features not listed above
6. If they ask something you don't know — say you'll check and follow up

Lead is flagged: ${lead.flagReasons.length > 0 ? 'YES — ' + lead.flagReasons.join('; ') : 'No'}`
}

// ─── Classify a message for flags and handoff triggers ────────────────────────
export async function classifyMessage(
  message: string,
  settings: AISettings
): Promise<{ flags: string[]; isHandoff: boolean }> {
  const prompt = `Analyze this rental inquiry message for the following signals.

MESSAGE: "${message}"

Return a JSON object with:
- flags: array of strings describing any red flags detected. Check for:
  ${settings.flagTriggers.cashOnly ? '- Cash-only payment insistence' : ''}
  ${settings.flagTriggers.noEmployment ? '- Refusal to provide employment information' : ''}
  ${settings.flagTriggers.pressureToMoveIn ? '- Pressure to move in immediately or urgently' : ''}
  ${settings.flagTriggers.refusesInfo ? '- Refusal to answer basic screening questions' : ''}
  ${settings.flagTriggers.unusualRequest ? '- Unusual requests (skip background check, no lease, wire transfer, etc.)' : ''}
- isHandoff: boolean, true if the message indicates:
  ${settings.handoffTriggers.wantsToApply ? '- Readiness to apply or rent' : ''}
  ${settings.handoffTriggers.wantsShowing ? '- Request for a showing or tour' : ''}
  ${settings.handoffTriggers.asksAboutLease ? '- Questions about signing a lease or agreement' : ''}

Return ONLY valid JSON, no other text.`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return {
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      isHandoff: Boolean(parsed.isHandoff),
    }
  } catch {
    return { flags: [], isHandoff: false }
  }
}
