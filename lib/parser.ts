import type { ParsedEmail } from './gmail'
import type { Lead, Property, AISettings } from '@/types'

// ─── Match email to property ──────────────────────────────────────────────────
// Priority order:
// 1. originalRecipient header matches a property email exactly (most reliable)
// 2. Furnished Finder property URL in the email body
// 3. Address words mentioned in body
// 4. Fall back to first available property
export function matchProperty(email: ParsedEmail, properties: Property[]): Property | null {
  // 1. Match by forwarded-to address (the property's Gmail)
  if (email.originalRecipient) {
    const recipientEmail = email.originalRecipient.toLowerCase().replace(/.*<|>.*/g, '').trim()
    const match = properties.find(p =>
      p.propertyEmail?.toLowerCase() === recipientEmail
    )
    if (match) return match
  }

  // 2. Match by Furnished Finder listing URL
  if (email.furnishedFinderPropertyUrl) {
    const match = properties.find(p =>
      p.furnishedFinderUrl && email.furnishedFinderPropertyUrl!.includes(p.furnishedFinderUrl)
    )
    if (match) return match
  }

  // 3. Match by address keywords in body
  const bodyLower = email.body.toLowerCase()
  let bestMatch: Property | null = null
  let bestScore = 0
  for (const prop of properties) {
    const addressWords = prop.address.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3)
    const score = addressWords.filter(w => bodyLower.includes(w)).length
    if (score > bestScore) { bestScore = score; bestMatch = prop }
  }
  if (bestScore >= 2) return bestMatch

  // 4. Fall back to first available
  return properties.find(p => p.available) ?? properties[0] ?? null
}

// ─── Extract lead data from a Furnished Finder email ─────────────────────────
export function extractLeadFromEmail(
  email: ParsedEmail,
  matchedProperty: Property | null
): Omit<Lead, 'id' | 'createdAt' | 'lastActivity'> {
  const body = email.body
  const name = extractName(email.fromName, body)
  const moveInDate = extractMoveInDate(body)
  const lengthOfStay = extractLengthOfStay(body)
  const occupation = extractOccupation(body)
  const reasonForStay = extractReasonForStay(body)

  return {
    propertyId: matchedProperty?.id ?? 'unknown',
    name,
    email: email.from,
    moveInDate,
    lengthOfStay,
    occupation,
    reasonForStay,
    status: 'new',
    flagReasons: [],
    gmailThreadId: email.threadId,
    // Store which property email received this — used for Send As on replies
    receivedAt: email.originalRecipient ?? matchedProperty?.propertyEmail ?? undefined,
    messages: [
      {
        id: `msg_${email.messageId}`,
        role: 'inbound',
        content: cleanBody(body),
        timestamp: new Date(email.receivedAt).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        }),
        isAI: false,
        gmailMessageId: email.messageId,
        gmailThreadId: email.threadId,
      },
    ],
    infoCollected: {
      moveInDate: !!moveInDate,
      lengthOfStay: lengthOfStay > 0,
      occupation: !!occupation,
      reasonForStay: !!reasonForStay,
    },
  }
}

// ─── Flag detection ───────────────────────────────────────────────────────────
export function detectFlags(text: string, settings: AISettings): string[] {
  const lower = text.toLowerCase()
  const flags: string[] = []

  if (settings.flagTriggers.cashOnly) {
    if (/\bcash\b/.test(lower) && /(only|prefer|want|pay)/.test(lower)) {
      flags.push('Prefers cash-only payment')
    }
  }
  if (settings.flagTriggers.pressureToMoveIn) {
    if (/(asap|immediately|today|tomorrow|this week|urgent|right away|move in now)/.test(lower)) {
      flags.push('Pressuring for immediate move-in')
    }
  }
  if (settings.flagTriggers.unusualRequest) {
    if (/(wire transfer|western union|zelle only|no lease|no contract|skip the background|no credit check)/.test(lower)) {
      flags.push('Unusual or suspicious request detected')
    }
  }

  return flags
}

// ─── Handoff detection ────────────────────────────────────────────────────────
export function detectHandoff(text: string, settings: AISettings): boolean {
  const lower = text.toLowerCase()

  if (settings.handoffTriggers.wantsToApply) {
    if (/(apply|application|fill out|submit|rent it|take it|move forward|ready to proceed)/.test(lower)) return true
  }
  if (settings.handoffTriggers.wantsShowing) {
    if (/(showing|tour|view|visit|see the|can i come|walk.?through|schedule)/.test(lower)) return true
  }
  if (settings.handoffTriggers.asksAboutLease) {
    if (/(lease|sign|agreement|contract|terms|deposit|month.to.month)/.test(lower)) return true
  }

  return false
}

// ─── Private helpers ──────────────────────────────────────────────────────────
function extractName(fromName: string, body: string): string {
  if (fromName && fromName.length > 0 && !fromName.includes('@')) return fromName
  const match = body.match(/(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+ [A-Z][a-z]+)/i)
  if (match) return match[1]
  return fromName || 'Unknown'
}

function extractMoveInDate(body: string): string {
  const patterns = [
    /(?:move.?in|start|available|from|beginning|starting)\s+(?:on|around|date[:\s])?\s*([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i,
    /([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)\s+(?:move.?in|start|available)/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
    /(\d{4}-\d{2}-\d{2})/,
  ]
  for (const p of patterns) {
    const m = body.match(p)
    if (m) return m[1].trim()
  }
  return ''
}

function extractLengthOfStay(body: string): number {
  const patterns = [
    /(\d+)\s*(?:-|to)?\s*month/i,
    /(\d+)\s*weeks?/i,
    /(?:for|about|approximately|around)\s+(\d+)\s*(?:months?|mo\.)/i,
  ]
  for (const p of patterns) {
    const m = body.match(p)
    if (m) {
      const num = parseInt(m[1])
      return p.source.includes('week') ? Math.ceil(num / 4) : num
    }
  }
  return 0
}

function extractOccupation(body: string): string {
  const patterns = [
    /(?:i(?:'m| am) an?|work(?:ing)? as an?|my (?:job|occupation|profession) is)\s+([a-zA-Z\s]+?)(?:\.|,|\s+at\s|\s+for\s|$)/i,
    /(nurse|doctor|physician|engineer|consultant|contractor|teacher|professor|manager|analyst|therapist|pharmacist|attorney|developer|technician)/i,
    /travel(?:ing)?\s+(nurse|physician|doctor|worker|professional)/i,
  ]
  for (const p of patterns) {
    const m = body.match(p)
    if (m) return (m[1] || m[0]).trim()
  }
  return ''
}

function extractReasonForStay(body: string): string {
  const m = body.match(/(rotation|assignment|contract|project|residency|fellowship|internship|relocation|transfer+|training)/i)
  return m ? m[0] : ''
}

function cleanBody(body: string): string {
  return body
    .split(/\n-- \n|\nOn .+ wrote:/m)[0]
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim()
    .slice(0, 2000)
}
