import { kv } from '@vercel/kv'
import type { Lead, Property, AISettings, GmailTokens, PollState } from '@/types'

// ─── Keys ────────────────────────────────────────────────────────────────────
const KEYS = {
  leads: 'leaseai:leads',
  lead: (id: string) => `leaseai:lead:${id}`,
  properties: 'leaseai:properties',
  property: (id: string) => `leaseai:property:${id}`,
  settings: 'leaseai:settings',
  gmailTokens: 'leaseai:gmail:tokens',
  pollState: 'leaseai:gmail:pollstate',
  threadToLead: (threadId: string) => `leaseai:thread:${threadId}`,
}

// ─── Leads ───────────────────────────────────────────────────────────────────
export async function getAllLeads(): Promise<Lead[]> {
  const ids = await kv.smembers(KEYS.leads)
  if (!ids || ids.length === 0) return []
  const leads = await Promise.all((ids as string[]).map(id => kv.get<Lead>(KEYS.lead(id))))
  return leads.filter(Boolean) as Lead[]
}

export async function getLead(id: string): Promise<Lead | null> {
  return kv.get<Lead>(KEYS.lead(id))
}

export async function saveLead(lead: Lead): Promise<void> {
  await kv.set(KEYS.lead(lead.id), lead)
  await kv.sadd(KEYS.leads, lead.id)
  // Index by Gmail thread ID for quick lookup on incoming emails
  if (lead.gmailThreadId) {
    await kv.set(KEYS.threadToLead(lead.gmailThreadId), lead.id)
  }
}

export async function getLeadByThreadId(threadId: string): Promise<Lead | null> {
  const leadId = await kv.get<string>(KEYS.threadToLead(threadId))
  if (!leadId) return null
  return getLead(leadId)
}

export async function deleteLead(id: string): Promise<void> {
  const lead = await getLead(id)
  if (lead?.gmailThreadId) {
    await kv.del(KEYS.threadToLead(lead.gmailThreadId))
  }
  await kv.del(KEYS.lead(id))
  await kv.srem(KEYS.leads, id)
}

// ─── Properties ──────────────────────────────────────────────────────────────
export async function getAllProperties(): Promise<Property[]> {
  const ids = await kv.smembers(KEYS.properties)
  if (!ids || ids.length === 0) return []
  const props = await Promise.all((ids as string[]).map(id => kv.get<Property>(KEYS.property(id))))
  return props.filter(Boolean) as Property[]
}

export async function getProperty(id: string): Promise<Property | null> {
  return kv.get<Property>(KEYS.property(id))
}

export async function saveProperty(property: Property): Promise<void> {
  await kv.set(KEYS.property(property.id), property)
  await kv.sadd(KEYS.properties, property.id)
}

export async function deleteProperty(id: string): Promise<void> {
  await kv.del(KEYS.property(id))
  await kv.srem(KEYS.properties, id)
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS: AISettings = {
  ownerName: '',
  ownerEmail: '',
  ownerPhone: '',
  responseSignature: 'The Bannerman Group Team',
  autoRespondNew: true,
  autoRespondActive: true,
  requireReviewFlagged: true,
  responsePersona: 'You are a professional, friendly property management assistant. Be warm but concise. Protect the owner\'s time by only escalating leads that are genuinely ready to move forward.',
  handoffTriggers: {
    wantsToApply: true,
    wantsShowing: true,
    stayOver6Months: false,
    asksAboutLease: true,
  },
  flagTriggers: {
    cashOnly: true,
    noEmployment: true,
    pressureToMoveIn: true,
    refusesInfo: true,
    unusualRequest: true,
  },
}

export async function getSettings(): Promise<AISettings> {
  const saved = await kv.get<AISettings>(KEYS.settings)
  return saved ?? DEFAULT_SETTINGS
}

export async function saveSettings(settings: AISettings): Promise<void> {
  await kv.set(KEYS.settings, settings)
}

// ─── Gmail Tokens ─────────────────────────────────────────────────────────────
export async function getGmailTokens(): Promise<GmailTokens | null> {
  return kv.get<GmailTokens>(KEYS.gmailTokens)
}

export async function saveGmailTokens(tokens: GmailTokens): Promise<void> {
  await kv.set(KEYS.gmailTokens, tokens)
}

// ─── Poll State ───────────────────────────────────────────────────────────────
export async function getPollState(): Promise<PollState | null> {
  return kv.get<PollState>(KEYS.pollState)
}

export async function savePollState(state: PollState): Promise<void> {
  await kv.set(KEYS.pollState, state)
}
