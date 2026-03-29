# LeaseAI Backend
**Furnished Finder Automation — Multi-Property Gmail Monitor + AI Responder**

---

## How the Multi-Account Setup Works

You have one Gmail per property. Rather than connecting each one separately,
all property Gmails forward Furnished Finder emails to one master Gmail.
The system watches only the master Gmail, but replies go out FROM each
property's email address using Gmail's built-in "Send Mail As" (alias) feature.

**The flow:**
```
Tenant emails Furnished Finder
  → FF sends notification to 4421lindell@gmail.com
  → 4421lindell@gmail.com auto-forwards to master@gmail.com
  → LeaseAI polls master Gmail every 5 min
  → Reads X-Forwarded-To header → knows it's the Lindell property
  → Generates AI response → sends FROM 4421lindell@gmail.com (Send As alias)
  → Tenant sees reply from 4421lindell@gmail.com ✓
```

---

## Step-by-Step Setup

### 1. Set up forwarding in each property Gmail

For EACH property Gmail account:
1. Open that Gmail → Settings (gear icon) → See all settings
2. Go to **Forwarding and POP/IMAP** tab
3. Click **Add a forwarding address** → enter your master Gmail
4. Google sends a confirmation email to master Gmail — click confirm
5. Back in the property Gmail settings, set it to **Forward a copy** to master Gmail
6. Optional (recommended): Add a filter so only FF emails forward:
   - Settings → Filters → Create new filter
   - From: `furnishedfinder.com`
   - Action: Forward to master Gmail

### 2. Add each property Gmail as a Send As alias in master Gmail

This lets the system reply FROM each property address.

In your **master Gmail**:
1. Settings → See all settings → **Accounts and Import** tab
2. Under **Send mail as**, click **Add another email address**
3. Enter the property Gmail (e.g. `4421lindell@gmail.com`)
4. Name: something like "4421 Lindell — Bannerman Group"
5. Leave "Treat as an alias" checked
6. Google sends a confirmation to that property Gmail → open it and click confirm
7. Repeat for each property

After setup, visit `/api/gmail/aliases` to verify all aliases show as `verified: true`.

### 3. Google Cloud project

1. Go to https://console.cloud.google.com → new project → "LeaseAI"
2. Enable **Gmail API**
3. Create **OAuth 2.0 Client ID** (Web application)
4. Authorized redirect URI: `https://YOUR-VERCEL-URL/api/auth/gmail/callback`
5. Copy Client ID and Client Secret

### 4. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

### 5. Add Vercel KV

Vercel dashboard → your project → Storage → Create KV → connect to project.

### 6. Environment variables

In Vercel → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `GOOGLE_CLIENT_ID` | From Google Cloud |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-VERCEL-URL/api/auth/gmail/callback` |
| `CRON_SECRET` | `openssl rand -hex 32` |

### 7. Deploy + connect Gmail

```bash
vercel --prod
```

Then visit:
```
https://YOUR-VERCEL-URL/api/auth/gmail?secret=YOUR-CRON-SECRET
```

Authorize with your **master Gmail** account.

### 8. Add properties in the dashboard

For each property, fill in the **Property Email** field with that property's
Gmail address (e.g. `4421lindell@gmail.com`). This is how the system knows
which alias to reply from.

### 9. Verify

```
GET /api/status           → gmailConnected: true
GET /api/gmail/aliases    → list of verified Send As aliases
GET /api/gmail/poll?secret=xxx  → trigger manual poll
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/status` | System health + lead counts |
| GET | `/api/gmail/aliases` | Verified Send As aliases |
| GET | `/api/gmail/poll?secret=xxx` | Manual poll trigger |
| GET | `/api/leads` | All leads |
| POST | `/api/leads` | Create lead manually |
| PATCH | `/api/leads/:id` | Update lead |
| DELETE | `/api/leads/:id` | Delete lead |
| GET | `/api/respond?leadId=xxx` | Generate AI draft (no send) |
| POST | `/api/respond` | Send AI or custom response |
| GET | `/api/properties` | All properties |
| POST | `/api/properties` | Add property |
| GET/POST | `/api/properties/settings` | AI settings |

---

## Property Matching Logic

When a forwarded email arrives, the system identifies which property it belongs to:

1. **X-Forwarded-To header** — Gmail sets this on forwarded mail. Matched against `propertyEmail` field on each property. Most reliable.
2. **Furnished Finder URL** — if the email body contains a FF listing URL, matched against `furnishedFinderUrl` on each property.
3. **Address keywords** — body text scanned for 2+ words matching a property address.
4. **Fallback** — first available property.

---

## File Structure

```
leaseai-backend/
├── app/api/
│   ├── auth/gmail/          # OAuth connect + callback
│   ├── gmail/
│   │   ├── poll/            # Cron job — core engine (runs every 5 min)
│   │   └── aliases/         # List verified Send As aliases
│   ├── leads/               # Lead CRUD
│   ├── respond/             # AI draft + send
│   ├── properties/          # Property CRUD + settings
│   └── status/              # System health
├── lib/
│   ├── db.ts                # Vercel KV (Redis) operations
│   ├── gmail.ts             # OAuth, Send As, fetch/send messages
│   ├── parser.ts            # Email parsing, property matching, flag detection
│   └── ai.ts                # Claude response generation
├── types/index.ts
├── vercel.json              # Cron: every 5 minutes
└── .env.example
```

---

## Cost Estimate

| Service | Cost |
|---|---|
| Vercel hobby | Free |
| Vercel KV | Free up to 256MB |
| Gmail API + OAuth | Free |
| Anthropic Claude | ~$0.003/response |

Under $1/month at typical lead volume for 4–10 properties.
