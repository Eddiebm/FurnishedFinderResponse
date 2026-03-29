import { NextRequest, NextResponse } from 'next/server'
import { getAllProperties, saveProperty, deleteProperty } from '@/lib/db'
import type { Property } from '@/types'

export async function GET() {
  const props = await getAllProperties()
  return NextResponse.json(props)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const property: Property = {
      id: `prop_${Date.now()}`,
      address: body.address ?? '',
      city: body.city ?? '',
      state: body.state ?? '',
      type: body.type ?? '',
      bedrooms: body.bedrooms ?? 1,
      bathrooms: body.bathrooms ?? 1,
      pricePerMonth: body.pricePerMonth ?? 0,
      available: body.available ?? true,
      availableFrom: body.availableFrom ?? '',
      minStay: body.minStay ?? 1,
      maxStay: body.maxStay ?? 12,
      furnished: body.furnished ?? true,
      petsAllowed: body.petsAllowed ?? false,
      parkingIncluded: body.parkingIncluded ?? false,
      utilitiesIncluded: body.utilitiesIncluded ?? false,
      houseRules: body.houseRules ?? '',
      description: body.description ?? '',
      furnishedFinderUrl: body.furnishedFinderUrl ?? '',
    }
    await saveProperty(property)
    return NextResponse.json(property, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
