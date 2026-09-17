# Instagram AI Publisher 🚀🤖

A production-grade, backend-only automation system in Node.js (ES Modules) that generates images using **Google Gemini's Nano Banana multimodal models** and automatically publishes them to your Instagram account via **Meta's official Instagram Graph API (v22.0)**.

Designed for automated execution via scheduled **GitHub Actions** and safe local development with a dedicated **Dry Run** mode.

---

## Architecture Overview

```
GitHub Actions Cron / Manual Dispatch
               │
               ▼
   Node.js CLI Application Start
               │
       [1. Load & Validate Env]
               │
      [2. Check Idempotency] (Prevents duplicate posts on retried runners)
               │
     [3. Generate Content Prompt] (prompts/content.json)
               │
    [4. Call Gemini Nano Banana] (@google/genai SDK: gemini-2.5-flash-image)
               │
      [5. Receive Image Buffer] (Multimodal inlineData part parsing)
               │
     [6. Supabase Storage] (Uploads to dedicated public bucket)
               │
               ├─────────────────────────────────────────┐
               │                                         │
        [DRY_RUN = true]                         [DRY_RUN = false]
               │                                         │
     Print Dry Run Summary                     [7. Verify Meta Account]
     Skip Instagram Publish                              │
     Exit Cleanly (0)                          [8. Create Media Container]
                                                         │
                                               [9. Check Processing Status]
                                                         │
                                               [10. Publish to Feed]
                                                         │
                                               [11. Save State & Finish]
```

---

## Project Structure

```
instagram-ai-publisher/
│
├── src/
│   ├── config/
│   │   └── env.js                   # Validates env vars & registers secrets for redaction
│   │
│   ├── services/
│   │   ├── gemini.service.js        # Google GenAI SDK (Nano Banana image models)
│   │   ├── instagram.service.js     # Meta Graph API v22.0 Content Publishing
│   │   ├── storage.service.js       # AWS S3 / R2 upload + presigned HTTPS URLs
│   │   └── state.service.js         # Idempotency engine (Local file & S3 stores)
│   │
│   ├── utils/
│   │   ├── logger.js                # Structured stage logger with secret masking
│   │   ├── retry.js                 # Exponential backoff retry for transient errors
│   │   └── validation.js            # URL, image aspect ratio, size & prompt checks
│   │
│   ├── content/
│   │   └── prompt-generator.js      # Visual prompt builder & SHA-256 fingerprinting
│   │
│   └── index.js                     # Main CLI orchestrator
│
├── tests/
│   ├── validation.test.js           # Unit tests for image/URL/prompt validation
│   ├── retry.test.js                # Unit tests for retry logic & transient filtering
│   ├── prompt-generator.test.js     # Unit tests for prompt generation
│   ├── gemini.service.test.js       # Unit tests for Gemini Nano Banana integration
│   ├── storage.service.test.js      # Unit tests for S3 storage & presigned URLs
│   ├── instagram.service.test.js    # Unit tests for Meta Graph API calls
│   └── workflow.test.js             # End-to-end mocked workflow tests
│
├── prompts/
│   └── content.json                 # Content themes, styles, and prompt directives
│
├── .github/
│   └── workflows/
│       └── publish-instagram.yml    # Scheduled & manual GitHub Actions workflow
│
├── .env.example                     # Environment template (no secrets)
├── .gitignore                       # Git ignore configuration
├── eslint.config.js                 # Flat ESLint configuration
├── package.json                     # Node.js dependencies & scripts
├── LICENSE                          # MIT License
└── README.md                        # Documentation
```

---

## Prerequisites

- **Node.js**: Version `20.x` or `22.x` LTS.
- **Google AI Studio Account**: For the Gemini API Key.
- **Meta for Developers Account**: An App with Instagram API configured.
- **Instagram Professional Account**: A Creator or Business account linked to a Facebook Page (or added as an Instagram Tester during development).
- **S3-Compatible Object Storage**: AWS S3, Cloudflare R2, DigitalOcean Spaces, or MinIO.

---

## Google Gemini API Setup (Nano Banana Image Models)

Google has deprecated older standalone Imagen `:predict` endpoints and replaced them with **Gemini Nano Banana multimodal models** that natively generate images.

### 1. Obtain Gemini API Key
1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Click **Get API key** and create a new key.
3. Keep this key safe; it will be used as `GEMINI_API_KEY`.

### 2. Supported Models
The application defaults to `gemini-2.5-flash-image`, but you can change it via the environment variable `GEMINI_IMAGE_MODEL`:
- `gemini-2.5-flash-image` (Default Nano Banana model)
- `gemini-3.1-flash-image` (Next-gen Nano Banana model)

### 3. How the Integration Works
Using the official `@google/genai` Node.js SDK:
- **Call**: `ai.models.generateContent({ model: config.model, contents: prompt, config: { responseModalities: ['IMAGE', 'TEXT'] } })`
- **Response Format**: Parsed from `candidates[0].content.parts` looking for `inlineData: { mimeType: 'image/jpeg', data: '<base64>' }`.
- **Output**: Converted into a native Node.js `Buffer`.

---

## Meta Developer & Instagram Setup

Meta's official Content Publishing API allows programmatic posting to Instagram feeds.

### 1. Account Requirements
1. **Instagram Professional Account**: Switch your personal Instagram account to a **Business** or **Creator** account in Instagram Mobile App (`Settings > Account type and tools > Switch to professional account`).
2. **Facebook Page Link**: Connect your Instagram professional account to a Facebook Page in Meta Accounts Centre.

### 2. Development Mode & Instagram Tester (No App Review Needed for Testing)
Because your Meta App is in Development mode, you do not need App Review:
1. Go to [Meta for Developers](https://developers.facebook.com/) > Your App.
2. Under **App Roles** > **Roles**, scroll to **Instagram Testers**.
3. Click **Add Instagram Testers** and enter your Instagram username.
4. On your Instagram account (Mobile app or web), go to **Settings** > **Website permissions** > **Apps and Websites** > **Tester Invitations** and click **Accept**.

### 3. Required Permissions
Your User Access Token must have the following permissions:
- `instagram_content_publish` (or `instagram_business_content_publish`)
- `instagram_basic` (or `instagram_business_basic`)
- `pages_read_engagement`
- `pages_show_list`

### 4. How to Obtain the Instagram Access Token
1. Open the [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Select your Meta App.
3. In **User or Page**, select **User Token**.
4. Add the permissions above and click **Generate Access Token**.
5. Log in and authorize your Facebook Page and Instagram Account.
6. *(Recommended)* Exchange the short-lived token (1 hour) for a long-lived token (60 days) using Meta's Token Tool or:
   ```bash
   GET https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id={app-id}&client_secret={app-secret}&fb_exchange_token={short-lived-token}
   ```

### 5. How to Obtain the Instagram User ID (`INSTAGRAM_USER_ID`)
Query the Graph API Explorer:
```bash
GET https://graph.facebook.com/v22.0/me/accounts?fields=name,instagram_business_account{id,username}
```
The numeric ID returned under `instagram_business_account.id` (e.g. `17841400008460000`) is your `INSTAGRAM_USER_ID`.

---

## Object Storage Configuration (Supabase Storage)

Meta's servers must fetch the generated image via HTTPS when creating the media container (`POST /{ig-user-id}/media`).

### Meta Crawler Requirements: Public Bucket URLs vs. Signed URLs
- **Meta's Official Requirement**: Meta explicitly requires that *"The image must be on a public server"*. Meta's crawler (`facebookexternalhit` / `Facebot`) performs a direct `GET` request to fetch the raw JPEG bytes.
- **Why Supabase Public Bucket URLs are Standard**:
  - A Supabase **Public Bucket URL** looks like:
    `https://<project-ref>.supabase.co/storage/v1/object/public/instagram-images/posts/2026-09-17/image.jpg`
  - It provides a clean, direct static URL with no complex query parameters.
  - When using **Signed URLs** (`/object/sign/...`), the URL includes long signed JWT tokens and expiration query parameters (`?token=...`). Meta's crawler frequently encounters query string encoding/decoding errors (e.g. Meta Error `2207052`: *"Could not retrieve media"* or *"Invalid image URL"*).
  - Therefore, **Supabase Public Bucket URLs** on a dedicated bucket are the officially supported and reliable standard.

### Security Best Practices (Bucket Isolation)
- **Making the bucket public does NOT make your Supabase project public.**
- In Supabase, setting the bucket `instagram-images` to **Public** only permits anonymous `GET` (read-only download) of images within that specific bucket (which are public Instagram posts anyway!).
- All your database tables, authentication records, and other private storage buckets remain 100% protected by PostgreSQL Row Level Security (RLS) and API keys.
- Uploads and deletions still strictly require the server-side `SUPABASE_SERVICE_ROLE_KEY`.
- **Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code or client applications.** In this backend-only architecture, it is securely provided via GitHub Secrets and local `.env`.

---

### Step-by-Step Supabase Storage Setup

1. **Create / Open Your Supabase Project**:
   - Go to [Supabase](https://supabase.com/) and create a free project (or open your existing project).
2. **Create the Storage Bucket**:
   - In the left sidebar, click **Storage**.
   - Click **New Bucket**.
   - Set **Bucket name**: `instagram-images`.
   - Toggle **Public bucket**: **ON** (Enabled).
   - Click **Save bucket**.
3. **Retrieve Credentials**:
   - In the left sidebar, click **Project Settings** (gear icon) > **API**.
   - Copy the **Project URL** (e.g. `https://xyzproject.supabase.co`). This is your `SUPABASE_URL`.
   - Under **Project API keys**, find the **`service_role` (secret)** key. Click **Reveal** and copy it. This is your `SUPABASE_SERVICE_ROLE_KEY`.

---

## Local Development & Testing

### 1. Installation
```bash
git clone <your-repo>
cd instagram-ai-publisher
npm install
```

### 2. Environment Configuration
Copy the template and fill in your credentials:
```bash
cp .env.example .env
```

Edit `.env`:
```ini
# Testing Mode
DRY_RUN=true

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image

# Meta Instagram API
INSTAGRAM_ACCESS_TOKEN=your_access_token
INSTAGRAM_USER_ID=your_instagram_user_id

# Supabase Storage
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=instagram-images
SUPABASE_USE_SIGNED_URL=false
```

### 3. Run Unit Tests
```bash
npm test
```
All external APIs (Google Gemini, Meta Instagram, Supabase Storage) are fully mocked.

### 4. Run Code Linting
```bash
npm run lint
```

### 5. Safe First Test (DRY_RUN=true)
Ensure `DRY_RUN=true` in your `.env` (or pass it in the command):
```bash
DRY_RUN=true npm run start
```
**What happens in DRY RUN:**
1. Validates your configuration.
2. Generates the content prompt from `prompts/content.json`.
3. Calls Gemini Nano Banana to generate the real image.
4. Uploads the image to your Supabase `instagram-images` bucket.
5. **Stops before calling Instagram publishing.**
6. Prints a clean summary and the URL of the generated image so you can inspect it in your browser!

### 6. Live Publishing Test
Once you've verified the generated image in dry-run mode:
1. Set `DRY_RUN=false` in `.env`.
2. Run:
   ```bash
   npm run start
   ```
3. Check your Instagram profile to see your newly published post!

---

## GitHub Actions Automated Publishing

The workflow in `.github/workflows/publish-instagram.yml` supports both manual triggering and automated cron scheduling.

### 1. Configure GitHub Secrets
In your GitHub repository, go to **Settings** > **Secrets and variables** > **Actions** > **New repository secret**:

| Secret Name | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API Key from Google AI Studio |
| `GEMINI_IMAGE_MODEL` | *(Optional)* Model override, e.g. `gemini-2.5-flash-image` |
| `INSTAGRAM_ACCESS_TOKEN` | Meta Long-Lived Instagram User Access Token |
| `INSTAGRAM_USER_ID` | Numeric Instagram Business / Creator Account ID |
| `SUPABASE_URL` | Supabase Project URL (`https://your-project-id.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` secret API key |
| `SUPABASE_STORAGE_BUCKET` | *(Optional)* Bucket name (defaults to `instagram-images`) |

### 2. Configure Idempotency Across Ephemeral Runners
GitHub Actions runners are ephemeral, meaning local state files (`.state/publisher-state.json`) do not persist between separate runner instances.
- When `SUPABASE_URL` is provided, the application automatically uses `SupabaseStateStore` (`${SUPABASE_STORAGE_BUCKET}/state/publisher-state.json`).
- This persists publication history across GitHub Actions runs without requiring an external database, preventing duplicate posts if a scheduled run is retried or re-triggered rapidly!

### 3. Triggering Manually via GitHub UI
1. Go to the **Actions** tab in your GitHub repository.
2. Select **Publish Instagram AI Post**.
3. Click **Run workflow**.
4. Check the `dry_run` box for a safe test, or uncheck it to publish live.

### 4. Scheduled Publishing (Cron)
The workflow includes an automatic daily cron trigger:
```yaml
schedule:
  - cron: '0 12 * * *' # Daily at 12:00 UTC (5:30 PM IST)
```
Modify the cron expression in `.github/workflows/publish-instagram.yml` to change the publishing frequency.

---

## Troubleshooting & Common API Errors

### Meta Graph API Errors

| Error Code / Subcode | Cause | Resolution |
|---|---|---|
| **Code 190** | Access token expired or invalidated | Generate a new long-lived token via Meta Graph API Explorer. |
| **Code 10 / Subcode 2207050** | Insufficient permissions / Not authorized | Ensure your account is an accepted **Instagram Tester** on the Meta app and has `instagram_content_publish` permission. |
| **Code 100 / Subcode 2207001** | Image URL inaccessible or invalid format | Verify your storage URL is a publicly accessible HTTPS URL. Meta's crawler must be able to reach it. Ensure image is JPEG and between 4:5 and 1.91:1 aspect ratio. |
| **Code 32 / Code 4** | Rate limit reached | Meta allows a maximum of 25 API posts per 24-hour rolling window per account. |
| **Code 24 / Subcode 2207003** | Media container expired | Containers must be published within 24 hours of creation. |

### Google Gemini Errors

| Error | Cause | Resolution |
|---|---|---|
| **API key not valid** | Invalid `GEMINI_API_KEY` | Check key in Google AI Studio. |
| **Model not found / 404** | Invalid `GEMINI_IMAGE_MODEL` | Use a supported Nano Banana model: `gemini-2.5-flash-image` or `gemini-3.1-flash-image`. |
| **Safety block** | Prompt triggered safety filters | Adjust prompts in `prompts/content.json` to adhere to content safety guidelines. |

---

## Security Best Practices

1. **Zero Secret Leakage**: The logger automatically intercepts and sanitizes tokens (`EAA...`), Google API keys (`AIza...`), and AWS credentials before printing to stdout or writing to log files.
2. **No Hardcoded Secrets**: All credentials are provided strictly via environment variables or GitHub Secrets.
3. **Least Privilege**:
   - Storage uses temporary presigned GET URLs rather than public bucket policies.
   - GitHub Actions workflow runs with minimal permissions (`contents: read`).
4. **Git Protection**: `.env`, `.state/`, and local test logs are strictly excluded in `.gitignore`.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
