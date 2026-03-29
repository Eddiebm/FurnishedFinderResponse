import { NextResponse } from 'next/server'
import { getSendAsAliases } from '@/lib/gmail'

// GET /api/gmail/aliases
// Returns all verified Send As aliases in master Gmail.
// Dashboard uses this to validate each property has its alias set up correctly.
export async function GET() {
  try {
    const aliases = await getSendAsAliases()
    return NextResponse.json(aliases)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
