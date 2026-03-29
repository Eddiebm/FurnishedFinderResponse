import { google } from 'googleapis'
import { getGmailTokens, saveGmailTokens } from './db'
import type { GmailTokens, SendAsAlias } from '@/types'

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  )
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuthClient()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
  })
}

export async function getAuthedClient() {
  const tokens = await getGmailTokens()
  if (!tokens) throw new Error('Gmail not connected. Please authorize via /api/auth/gmail.')

  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials(tokens)

  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 5 * 60 * 1000) {
    const { credentials } = await oauth2Client.refreshAccessToken()
    const updated: GmailTokens = {
      access_token: credentials.access_token!,
      refresh_token: credentials.refresh_token ?? tokens.refresh_token,
      expiry_date: credentials.expiry_date!,
    }
    await saveGmailTokens(updated)
    oauth2Client.setCredentials(updated)
  }

  return oauth2Client
}

// ─── List verified Send As aliases ───────────────────────────────────────────
// These are the property emails you added in Gmail Settings → Send Mail As.
// We use them to route replies from the correct property address.
export async function getSendAsAliases(): Promise<SendAsAlias[]> {
  const auth = await getAuthedClient()
  const gmail = google.gmail({ version: 'v1', auth })
  const res = await gmail.users.settings.sendAs.list({ userId: 'me' })
  return (res.data.sendAs ?? []).map(alias => ({
    email: alias.sendAsEmail!,
    displayName: alias.displayName ?? alias.sendAsEmail!,
    verified: alias.verificationStatus === 'accepted',
  }))
}

// ─── Detect which property email a forwarded message originally went to ───────
// Forwarded Gmail messages contain an X-Forwarded-To or Delivered-To header
// pointing to the original recipient — that's the property email.
export function detectOriginalRecipient(headers: Array<{ name: string; value: string }>): string | null {
  const get = (name: string) =>
    headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? null

  // Check multiple header candidates in priority order
  return (
    get('X-Forwarded-To') ??
    get('X-Original-To') ??
    get('Delivered-To') ??      // set by Gmail on delivery before forwarding
    get('To') ??
    null
  )
}

// ─── Fetch new messages ───────────────────────────────────────────────────────
export interface ParsedEmail {
  messageId: string
  threadId: string
  from: string
  fromName: string
  subject: string
  body: string
  receivedAt: string
  isFurnishedFinder: boolean
  furnishedFinderPropertyUrl?: string
  originalRecipient: string | null  // the property email this was forwarded from
}

export async function fetchNewMessages(sinceHistoryId?: string): Promise<{
  messages: ParsedEmail[]
  newHistoryId: string
}> {
  const auth = await getAuthedClient()
  const gmail = google.gmail({ version: 'v1', auth })

  const profile = await gmail.users.getProfile({ userId: 'me' })
  const currentHistoryId = profile.data.historyId!

  if (!sinceHistoryId) {
    return { messages: [], newHistoryId: currentHistoryId }
  }

  let historyItems: any[] = []
  try {
    const historyRes = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: sinceHistoryId,
      historyTypes: ['messageAdded'],
      labelId: 'INBOX',
    })
    historyItems = historyRes.data.history ?? []
  } catch (err: any) {
    if (err?.code === 404) {
      return fetchViaSearch(gmail, currentHistoryId)
    }
    throw err
  }

  const messageIds = new Set<string>()
  for (const item of historyItems) {
    for (const msg of item.messagesAdded ?? []) {
      messageIds.add(msg.message.id)
    }
  }

  const messages = await Promise.all([...messageIds].map(id => parseMessage(gmail, id)))
  const filtered = messages.filter(Boolean).filter(m => m!.isFurnishedFinder) as ParsedEmail[]
  return { messages: filtered, newHistoryId: currentHistoryId }
}

async function fetchViaSearch(gmail: any, currentHistoryId: string): Promise<{
  messages: ParsedEmail[]
  newHistoryId: string
}> {
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'from:furnishedfinder.com newer_than:1d',
    maxResults: 50,
  })
  const ids = (res.data.messages ?? []).map((m: any) => m.id)
  const messages = await Promise.all(ids.map((id: string) => parseMessage(gmail, id)))
  const filtered = messages.filter(Boolean).filter(m => m!.isFurnishedFinder) as ParsedEmail[]
  return { messages: filtered, newHistoryId: currentHistoryId }
}

async function parseMessage(gmail: any, messageId: string): Promise<ParsedEmail | null> {
  try {
    const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
    const msg = res.data
    const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? []

    const get = (name: string) =>
      headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

    const from = get('From')
    const subject = get('Subject')

    const fromMatch = from.match(/^(.*?)\s*<(.+)>$/)
    const fromName = fromMatch ? fromMatch[1].trim().replace(/"/g, '') : from
    const fromEmail = fromMatch ? fromMatch[2] : from

    const body = extractBody(msg.payload)
    const originalRecipient = detectOriginalRecipient(headers)

    const isFurnishedFinder =
      fromEmail.includes('furnishedfinder.com') ||
      subject.toLowerCase().includes('furnished finder') ||
      body.toLowerCase().includes('furnishedfinder.com')

    const urlMatch = body.match(/https?:\/\/(?:www\.)?furnishedfinder\.com\/property\/[^\s"']+/)

    return {
      messageId,
      threadId: msg.threadId,
      from: fromEmail,
      fromName,
      subject,
      body,
      receivedAt: new Date(parseInt(msg.internalDate)).toISOString(),
      isFurnishedFinder,
      furnishedFinderPropertyUrl: urlMatch?.[0],
      originalRecipient,
    }
  } catch {
    return null
  }
}

function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8')
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
    for (const part of payload.parts) {
      const result = extractBody(part)
      if (result) return result
    }
  }
  return ''
}

// ─── Send a reply via Gmail using Send As ─────────────────────────────────────
// fromAlias: the property email address (must be a verified Send As alias)
// If not provided or not verified, falls back to master Gmail address.
export async function sendReply({
  to,
  subject,
  body,
  threadId,
  inReplyToMessageId,
  fromAlias,
  fromAliasName,
}: {
  to: string
  subject: string
  body: string
  threadId?: string
  inReplyToMessageId?: string
  fromAlias?: string        // property email e.g. "4421lindell@gmail.com"
  fromAliasName?: string    // display name e.g. "4421 Lindell — Bannerman Group"
}): Promise<string> {
  const auth = await getAuthedClient()
  const gmail = google.gmail({ version: 'v1', auth })

  // Verify the alias is actually set up in this Gmail account
  let fromAddress: string
  if (fromAlias) {
    const aliases = await getSendAsAliases()
    const match = aliases.find(a => a.email.toLowerCase() === fromAlias.toLowerCase() && a.verified)
    fromAddress = match
      ? (fromAliasName ? `"${fromAliasName}" <${match.email}>` : match.email)
      : (await gmail.users.getProfile({ userId: 'me' })).data.emailAddress!
  } else {
    fromAddress = (await gmail.users.getProfile({ userId: 'me' })).data.emailAddress!
  }

  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`
  const headers = [
    `From: ${fromAddress}`,
    `To: ${to}`,
    `Subject: ${replySubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    inReplyToMessageId ? `In-Reply-To: <${inReplyToMessageId}>` : '',
    inReplyToMessageId ? `References: <${inReplyToMessageId}>` : '',
  ].filter(Boolean).join('\r\n')

  const raw = Buffer.from(`${headers}\r\n\r\n${body}`)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId },
  })

  return res.data.id!
}
