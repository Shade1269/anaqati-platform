# Anaqati Platform

This repository contains the source code for **Anaqati**, a modern affiliate marketing platform for store owners.  The frontend is built with [Next.js](https://nextjs.org/) and connects to a [Supabase](https://supabase.com/) backend.  It integrates with Zoho Inventory, Tabby, Tamara and WhatsApp to handle inventory, payments and notifications.

## Getting Started

1. Copy `.env.example` to `.env.local` and fill in the environment variables for Supabase and your integrations.
2. Install dependencies with `npm install`.
3. Run the development server:
   ```bash
   npm run dev
   ```
   Then open `http://localhost:3000` in your browser.

## Project Structure

```
anaqati-next/
├── pages/          # Next.js routes
│   ├── api/        # API routes (serverless functions)
│   ├── index.js    # Landing page
│   ├── dashboard.js# Affiliate dashboard (placeholder)
│   ├── products.js # Products selection (placeholder)
│   ├── orders.js   # Orders management (placeholder)
│   └── commissions.js # Commissions overview (placeholder)
├── public/         # Static assets (images, icons)
├── lib/            # Client helpers (Supabase client)
└── .env.example    # Environment variable template
```

## Supabase Policies

Row level security (RLS) should be enabled on all tables.  Policies can be defined in Supabase to restrict each affiliate's access to their own stores, orders and commissions.  Refer to the docs or example policies in the `docs/policies.sql` file (to be added).

## License

This project is provided without warranty under the MIT License.
