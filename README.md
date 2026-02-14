# Perth Cabinet Doors - Next.js Setup

This project is now structured to run on:
- Next.js (app router)
- Vercel
- GitHub Actions
- Supabase
- Resend

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
copy .env.example .env.local
```

3. Fill `.env.local` with your Supabase and Resend values.

4. Start dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Existing pages and assets

Your existing static files are served via Next from `public/`:
- `public/*.html`
- `public/css/*`
- `public/js/*`
- `public/images/*`

`/` redirects to `/index.html`.

## Quote API

Endpoint: `POST /api/quote`

Used by `public/js/quote.js` to:
- save quote data into Supabase table `quote_requests` (when Supabase env vars exist)
- send quote email via Resend (when Resend env vars exist)

### Recommended Supabase table

Create a `quote_requests` table with columns:
- `id` (uuid, pk)
- `created_at` (timestamp, default now())
- `customer_name` (text)
- `customer_email` (text)
- `required_by_date` (date)
- `project` (text)
- `phone` (text)
- `address` (text)
- `po_reference` (text)
- `notes` (text)
- `lines_json` (jsonb)
- `totals_json` (jsonb)

## Deploy to Vercel

1. Push repo to GitHub.
2. Import repo into Vercel.
3. Add env vars from `.env.example` in Vercel project settings.
4. Deploy.
