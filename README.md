# Sales Target

Lahore sales floor sign-ups against target. Teams, agents and targets come from "Lahore Sales Target.xlsx" in Google Drive (one tab per month). From November 2026 on, sign-ups are logged on the dashboard ("Log a sign-up").

## Run locally

    npm install
    DEV_LOGIN_EMAIL=emilia@myaio.com npx next dev -p 3110

Without Redis, data is kept in `.data/sales-target.json`. Without a Drive connection, the dashboard reads `data/snapshot.json`.

## Environment (Vercel)

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth client (sign-in and the Drive connection). Redirect URI: `https://<domain>/api/auth/callback`. The Google Drive API must be enabled.
- `REDIS_URL` (or any `REDIS…URL`): stores logged sign-ups and the Drive connection, under `st:` keys.
- Optional: `SESSION_SECRET`, `ADMIN_EMAILS` (comma-separated, besides emilia@myaio.com), `SALES_FILE_ID`, `ALLOWED_DOMAIN`.

After deploying, an admin opens Settings → Connect Google Drive.
