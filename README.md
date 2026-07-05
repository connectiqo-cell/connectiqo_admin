# Connect Admin Dashboard

Web-based admin panel for full operational control of app data and VideoSDK resources.

## Features

- Single-admin login (`VITE_ADMIN_EMAIL` / `VITE_ADMIN_PASSWORD`)
- Environment switcher (`staging` / `production`)
- Full Supabase CRUD (view/create/update/delete) with table explorer
- VideoSDK sessions and recordings viewer
- VideoSDK recording delete action (with confirmation)
- Mutation audit log viewer
- Responsive Bootstrap UI + Framer Motion transitions
- Light/Dark mode toggle with persistence

## Setup

1. Copy `.env.example` to `.env`.
2. Fill all required `VITE_*` environment variables.
3. Install and run:

```bash
npm install
npm run dev
```

## Required Environment Variables

- `VITE_ADMIN_EMAIL`
- `VITE_ADMIN_PASSWORD`
- `VITE_SUPABASE_URL_STAGING`
- `VITE_SUPABASE_ANON_KEY_STAGING`
- `VITE_AUTH_SERVER_URL_STAGING`
- `VITE_VIDEOSDK_BASE_URL_STAGING` (default: `https://api.videosdk.live/v2`)
- `VITE_SUPABASE_URL_PRODUCTION`
- `VITE_SUPABASE_ANON_KEY_PRODUCTION`
- `VITE_AUTH_SERVER_URL_PRODUCTION`
- `VITE_VIDEOSDK_BASE_URL_PRODUCTION` (default: `https://api.videosdk.live/v2`)

## Login Bootstrap

Use the credentials defined in:

- `VITE_ADMIN_EMAIL`
- `VITE_ADMIN_PASSWORD`

## Safety Checklist (Production)

- Use different admin credentials for production.
- Ensure production Supabase keys are correct and limited where possible.
- Keep `VITE_AUTH_SERVER_URL_PRODUCTION` pointing to a hardened backend.
- Confirm delete/update actions from audit logs regularly.
