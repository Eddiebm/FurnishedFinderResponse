import { NextRequest, NextResponse } from 'next/server'
import { saveProperty, getAllProperties, saveSettings, getSettings } from '@/lib/db'
import { PROPERTY_ACCOUNTS, MASTER_EMAIL } from '@/lib/seed'
import type { Property } from '@/types'

// POST /api/setup?secret=xxx
// Seeds all four Bannerman Group properties on first deploy.
// Safe to re-run — skips properties that already exist by email match.
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await getAllProperties()
  const existingEmails = new Set(existing.map(p => p.propertyEmail))
  const seeded: string[] = []
  const skipped: string[] = []

  for (const account of PROPERTY_ACCOUNTS) {
    if (existingEmails.has(account.propertyEmail)) {
      skipped.push(account.propertyEmail)
      continue
    }

    const property: Property = {
      id: `prop_${account.propertyEmail.split('@')[0]}`,
      address: account.address,
      city: account.city,
      state: account.state,
      type: account.type,
      bedrooms: account.bedrooms,
      bathrooms: account.bathrooms,
      pricePerMonth: account.pricePerMonth,
      available: true,
      availableFrom: '',
      minStay: 1,
      maxStay: 12,
      furnished: true,
      petsAllowed: false,
      parkingIncluded: false,
      utilitiesIncluded: account.utilitiesIncluded,
      houseRules: account.notes,
      description: account.notes
        ? `${account.type} in ${account.city}, ${account.state}. ${account.notes}.`
        : '',
      furnishedFinderUrl: account.furnishedFinderUrl,
      propertyEmail: account.propertyEmail,
      propertyEmailName: account.propertyEmailName,
    }

    await saveProperty(property)
    seeded.push(`${account.address} (${account.propertyEmail})`)
  }

  // Seed default settings with master email and owner name pre-filled
  const currentSettings = await getSettings()
  if (!currentSettings.ownerEmail) {
    await saveSettings({
      ...currentSettings,
      ownerName: 'Eddie Bannerman-Menson',
      ownerEmail: MASTER_EMAIL,
      responseSignature: 'The Bannerman Group',
      autoRespondNew: true,
      autoRespondActive: true,
      requireReviewFlagged: true,
    })
  }

  return NextResponse.json({
    success: true,
    seeded,
    skipped,
    message: seeded.length > 0
      ? `Seeded ${seeded.length} properties. Complete missing details in the dashboard.`
      : 'All properties already seeded.',
    reminder: 'Visit /api/setup?secret=xxx (GET) to check Send As alias status.',
  })
}

// GET /api/setup?secret=xxx — full setup checklist
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { getGmailTokens, getPollState } = await import('@/lib/db')
  const { getSendAsAliases } = await import('@/lib/gmail')

  const [tokens, pollState, properties] = await Promise.all([
    getGmailTokens(), getPollState(), getAllProperties(),
  ])

  let aliases: any[] = []
  try { aliases = tokens ? await getSendAsAliases() : [] } catch {}

  const verifiedEmails = new Set(
    aliases.filter((a: any) => a.verified).map((a: any) => a.email.toLowerCase())
  )

  const propertyChecklist = PROPERTY_ACCOUNTS.map(account => {
    const prop = properties.find(p => p.propertyEmail === account.propertyEmail)
    const isMaster = account.propertyEmail === MASTER_EMAIL
    const needsDetails = prop && (!prop.pricePerMonth || !prop.type || !prop.description)
    return {
      address: `${account.address}, ${account.city} ${account.zip}`,
      email: account.propertyEmail,
      furnishedFinderUrl: account.furnishedFinderUrl || null,
      status: {
        propertySeeded: !!prop,
        detailsComplete: !!prop && !needsDetails,
        sendAsVerified: isMaster || verifiedEmails.has(account.propertyEmail.toLowerCase()),
        forwardingNote: isMaster
          ? 'Is master inbox — no forwarding needed'
          : 'Must forward FF emails to eddie@bannermanmenson.com',
      },
    }
  })

  const allReady = propertyChecklist.every(p =>
    p.status.propertySeeded && p.status.sendAsVerified
  )

  return NextResponse.json({
    gmailConnected: !!tokens,
    lastPollAt: pollState?.lastPollAt ?? null,
    systemReady: allReady,
    properties: propertyChecklist,
    pendingActions: [
      ...propertyChecklist
        .filter(p => !p.status.sendAsVerified)
        .map(p => `Add ${p.email} as a verified Send As alias in master Gmail`),
      ...propertyChecklist
        .filter(p => p.status.propertySeeded && !p.status.detailsComplete)
        .map(p => `Complete property details for ${p.address} in dashboard`),
      ...(!tokens ? ['Connect Gmail via /api/auth/gmail?secret=xxx'] : []),
    ],
  })
}
