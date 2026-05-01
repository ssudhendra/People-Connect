# People Connections Connector

Local, Docker-free connector for LinkedIn-safe profile authentication, curated job opportunity discovery, and people/network enrichment.

## Customer download

Download the ready-to-upload connector package here:

```text
https://raw.githubusercontent.com/ssudhendra/People-Connect/main/dist/people-connections-connector.zip
```

Use that ZIP when an AI tool asks you to upload or install a custom connector package.

## What it does

- Runs directly from Node.js with no Docker and no third-party runtime dependencies.
- Uses LinkedIn OAuth/OIDC for safe authentication and profile retrieval.
- Generates 50-100 curated opportunities in demo mode so the full workflow can be validated immediately.
- Enriches each opportunity with likely recruiters or hiring managers, existing organization connections, degree labels, and relationship paths.
- Ships OpenAPI and connector manifest files for importing into AI-tool connector environments.
- Builds a downloadable ZIP package with one command.

## Important LinkedIn API boundary

LinkedIn's self-serve Sign In with LinkedIn product supports OIDC profile and email scopes. Broad job search, recruiter discovery, and member connection graph access are not generally available through public self-serve APIs. This connector avoids scraping and password collection. It uses provider interfaces so approved LinkedIn Partner APIs, ATS APIs, CRM exports, or user-provided network exports can be connected later.

## Run locally

```bash
cp .env.example .env
npm start
```

Open `http://localhost:8787`.

The app runs in `demo` mode by default. You can test the whole job and connection-path flow without LinkedIn credentials.

Use **Local Login** in the app when you want to validate the connector without LinkedIn OAuth. Use **Connect LinkedIn** for legacy LinkedIn sign-in apps, or **Try OIDC** if your app has the newer OpenID Connect product.

## Enable LinkedIn sign-in

1. Create a LinkedIn Developer app.
2. Enable **Sign In with LinkedIn using OpenID Connect**.
3. Add both redirect URLs:

```text
http://localhost:8787/auth/linkedin/callback
http://127.0.0.1:8787/auth/linkedin/callback
```

4. Fill in `.env`:

```bash
LINKEDIN_CLIENT_ID=your-client-id
LINKEDIN_CLIENT_SECRET=your-client-secret
LINKEDIN_REDIRECT_URI=auto
LINKEDIN_AUTH_TYPE=oidc
LINKEDIN_SCOPES=openid profile email
LINKEDIN_OAUTH_FLOW=web
CONNECTOR_MODE=live
```

5. Restart:

```bash
npm start
```

Use `LINKEDIN_AUTH_TYPE=oidc` for self-serve **Sign In with LinkedIn using OpenID Connect**. Do not use `local-pkce` unless LinkedIn has explicitly enabled Native PKCE protocol access for your app.

LinkedIn requires an exact redirect URI match. `LINKEDIN_REDIRECT_URI=auto` sends a callback matching the host you opened, so registering both local URLs prevents localhost versus 127.0.0.1 mismatches.

If your LinkedIn app has the older **Sign In with LinkedIn** product, set `LINKEDIN_AUTH_TYPE=legacy` and `LINKEDIN_SCOPES=r_liteprofile r_emailaddress`.

## Connector endpoints

- `GET /api/health`
- `GET /api/profile`
- `POST /api/opportunities`
- `POST /api/logout`
- `GET /openapi.yaml`
- `GET /.well-known/ai-plugin.json`

## Build ZIP package

```bash
npm run package
```

The ZIP is created at `dist/people-connections-connector.zip`.

## Production notes

- Use HTTPS and a real `SESSION_SECRET`.
- Keep LinkedIn client secrets server-side only.
- Replace demo providers with approved APIs or first-party data sources.
- Do not scrape LinkedIn pages or ask users for LinkedIn passwords.
