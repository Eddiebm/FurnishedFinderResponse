export interface Property {
  id: string
  address: string
  city: string
  state: string
  type: string
  bedrooms: number
  bathrooms: number
  pricePerMonth: number
  available: boolean
  availableFrom: string
  minStay: number
  maxStay: number
  furnished: boolean
  petsAllowed: boolean
  parkingIncluded: boolean
  utilitiesIncluded: boolean
  houseRules: string
  description: string
  furnishedFinderUrl: string
  propertyEmail: string        // e.g. "4421lindell@gmail.com" — Send As alias in master Gmail
  propertyEmailName?: string   // e.g. "4421 Lindell — Bannerman Group"
}

export interface Message {
  id: string
  role: 'inbound' | 'outbound'
  content: string
  timestamp: string
  isAI: boolean
  gmailMessageId?: string
  gmailThreadId?: string
}

export interface Lead {
  id: string
  propertyId: string
  name: string
  email: string
  moveInDate: string
  lengthOfStay: number
  occupation: string
  reasonForStay: string
  status: 'new' | 'active' | 'flagged' | 'handoff' | 'closed'
  flagReasons: string[]
  messages: Message[]
  createdAt: string
  lastActivity: string
  gmailThreadId?: string
  receivedAt?: string          // which property email the inquiry landed in
  infoCollected: {
    moveInDate: boolean
    lengthOfStay: boolean
    occupation: boolean
    reasonForStay: boolean
  }
}

export interface AISettings {
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  responseSignature: string
  autoRespondNew: boolean
  autoRespondActive: boolean
  requireReviewFlagged: boolean
  responsePersona: string
  handoffTriggers: {
    wantsToApply: boolean
    wantsShowing: boolean
    stayOver6Months: boolean
    asksAboutLease: boolean
  }
  flagTriggers: {
    cashOnly: boolean
    noEmployment: boolean
    pressureToMoveIn: boolean
    refusesInfo: boolean
    unusualRequest: boolean
  }
}

export interface GmailTokens {
  access_token: string
  refresh_token: string
  expiry_date: number
}

export interface PollState {
  lastHistoryId: string
  lastPollAt: string
}

export interface SendAsAlias {
  email: string
  displayName: string
  verified: boolean
}
