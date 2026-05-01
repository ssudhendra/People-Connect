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
- Provides a LinkedIn Jobs-style search experience with title, location, date posted, experience, workplace, job type, company, and sort controls.
- Generates 50-100 curated opportunities in demo mode so the full workflow can be validated immediately.
- Enriches each opportunity with likely recruiters or hiring managers, existing organization connections, degree labels, and relationship paths.
- Ships OpenAPI and connector manifest files for importing into AI-tool connector environments.
- Builds a downloadable ZIP package with one command.

## Important LinkedIn API boundary

LinkedIn's self-serve Sign In with LinkedIn product supports OIDC profile and email scopes. Broad job search, recruiter discovery, and member connection graph access are not generally available through public self-serve APIs. This connector avoids scraping and password collection. It uses provider interfaces so approved LinkedIn Partner APIs, ATS APIs, CRM exports, or user-provided network exports can be connected later.

To show exact live LinkedIn Jobs data, configure `CONNECTOR_MODE=live` and point `JOB_SOURCE_API_URL` to an approved LinkedIn Talent Solutions/Jobs API integration or another licensed jobs provider. Without that approved source, the app uses generated demo jobs that exercise the same filters and enrichment flow. Set `REQUIRE_LIVE_JOB_SOURCE=true` when you want the API to fail instead of falling back to demo data.

## Run locally

```bash
cp .env.example .env
npm start
```

Open `http://localhost:8787`.

The app runs in `demo` mode by default. You can test the whole job and connection-path flow without LinkedIn credentials.

Use **Local Login** in the app when you want to validate the connector without LinkedIn OAuth. Use **Connect LinkedIn** for the newer OpenID Connect product, or **Try Legacy** for older LinkedIn sign-in apps.

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
JOB_SOURCE_API_URL=https://your-approved-jobs-provider.example/search
JOB_SOURCE_API_KEY=your-provider-token
JOB_SOURCE_PROVIDER_NAME=LinkedIn Jobs
REQUIRE_LIVE_JOB_SOURCE=true
```

5. Restart:

```bash
npm start
```

Use `LINKEDIN_AUTH_TYPE=oidc` for self-serve **Sign In with LinkedIn using OpenID Connect**. Do not use `local-pkce` unless LinkedIn has explicitly enabled Native PKCE protocol access for your app.

LinkedIn requires an exact redirect URI match. `LINKEDIN_REDIRECT_URI=auto` sends a callback matching the host you opened, so registering both local URLs prevents localhost versus 127.0.0.1 mismatches.

If your LinkedIn app has the older **Sign In with LinkedIn** product, set `LINKEDIN_AUTH_TYPE=legacy` and `LINKEDIN_SCOPES=r_liteprofile r_emailaddress`.

## Live jobs provider contract

When `CONNECTOR_MODE=live` and `JOB_SOURCE_API_URL` is configured, Search posts this payload to the provider:

```json
{
  "source": "linkedin-jobs-search",
  "keywords": "AI Product Manager",
  "location": "Remote",
  "filters": {
    "industries": ["AI", "SaaS"],
    "datePosted": "past-week",
    "experienceLevel": "mid-senior",
    "workplace": "remote",
    "jobType": "full-time",
    "company": "LinkedIn",
    "sort": "recent",
    "maxResults": 75
  },
  "profile": {
    "name": "Connected Member",
    "headline": "Product leader",
    "skills": ["AI", "SaaS"]
  }
}
```

The provider should return an array or `{ "jobs": [...] }`. Each job can include `title`, `company`, `industry`, `location`, `workplace`, `salaryRange`, `posted`, `experienceLevel`, `jobType`, `applyMethod`, `applicants`, `jobUrl`, `tags`, and `summary`.

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
