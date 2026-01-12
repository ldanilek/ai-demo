# AI Demo Arena

Compare HTML/CSS outputs from different AI models side by side.

## Features

- 🔐 **Authentication**: Sign in as a guest or with Google
- 🎨 **AI Generation**: Create prompts and watch multiple AI models generate HTML/CSS
- 🔄 **Real-time Updates**: See outputs appear in real-time as models complete
- 📱 **Responsive**: Works on desktop and mobile
- 🔗 **Shareable**: Every demo has a public URL

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Convex
- **AI**: Vercel AI SDK with OpenAI and Anthropic
- **Auth**: @convex-dev/auth

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This will:
- Create a new Convex project (or link to existing)
- Generate `convex/_generated` files
- Create `.env.local` with your `VITE_CONVEX_URL`

### 3. Configure environment variables

In the Convex dashboard, add these environment variables:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. (Optional) Set up Google OAuth

1. Create OAuth credentials in Google Cloud Console
2. Add these environment variables in Convex dashboard:
   ```
   AUTH_GOOGLE_ID=your-client-id
   AUTH_GOOGLE_SECRET=your-client-secret
   ```
3. Set the authorized redirect URI to: `https://your-deployment.convex.site/api/auth/callback/google`

### 5. Start the dev server

```bash
npm run dev
```

## Usage

1. Sign in (as guest or with Google)
2. Enter a prompt like "display a clock" or "a neon sign that says hello"
3. Click "Generate with All Models"
4. Watch as GPT-4o, GPT-4o-mini, Claude Sonnet, and Claude Haiku generate HTML/CSS
5. Share the URL with anyone!

## Models

Currently configured models:
- `gpt-4o` (OpenAI)
- `gpt-4o-mini` (OpenAI)
- `claude-sonnet-4-20250514` (Anthropic)
- `claude-3-5-haiku-latest` (Anthropic)

You can modify the models in `convex/demos.ts`.
