<div align="center">
  <img src="./public/icons/logo_icon.png" alt="MyTalk logo" width="96" height="96">

  # MyTalk

  **Premium audio conferencing for everyone — built for meetings of up to 2,500 participants.**

  <a href="https://mytalk-wheat.vercel.app/"><strong>Live app →</strong></a>

</div>

---

MyTalk is an audio-first conferencing web app with a clean, light neumorphic UI. It supports public and private (knock-to-join) rooms, rich host/moderation controls, an admin console for monitoring live meetings, Google sign-in, and is installable as a PWA with background audio.

Built on top of [LiveKit](https://livekit.io/) (WebRTC), [Next.js 15](https://nextjs.org/) (App Router), and [NextAuth](https://next-auth.js.org/).

## ✨ Features

- **Audio-only meetings** — low-latency voice built for real conversations, scales from a quick call to a town hall (up to 2,500 participants).
- **Public & private rooms** — private rooms use **knock-to-join**; hosts/admins approve or decline each guest.
- **Host & moderation controls** — grant/revoke speak, make/demote host, raise hand, mute all / unmute all, remove participant, lock room, and **End meeting for everyone**.
- **Admin console** (`/admin`) — password-protected dashboard to monitor live meetings in real time, create meetings, moderate participants, approve join requests, and view ended-meeting history.
- **Secure roles** — host rights require a signed (HMAC) credential, so nobody can self-promote by editing `?role=host` in the URL. Role survives page reloads and rejoins.
- **Google sign-in** — one-tap Google OAuth, or join as a guest with just a name.
- **Chat, raise hand & participants panel** — in-meeting text chat, raised-hand indicators, and a live participants sidebar.
- **Picture-in-Picture & background audio** — floating PiP window on desktop (Chrome/Edge) and a MediaSession "ongoing call" notification so audio keeps playing when the browser is minimised.
- **Installable PWA** — add to home screen on mobile/desktop, with an install prompt, offline shell, and iOS safe-area support.
- **Permanent meeting links** — ended meetings show an "expired" screen so stale links can't be rejoined.
- **Responsive & polished** — light neumorphic design (Plus Jakarta Sans), fully responsive down to the smallest phones, with iOS notch/home-indicator handling.

## 🧰 Tech stack

| Area | Tech |
| --- | --- |
| Framework | Next.js 15 (App Router) |
| Realtime | LiveKit Cloud + `@livekit/components-react`, `livekit-client`, `livekit-server-sdk` |
| Auth | NextAuth (Google provider) |
| Styling | Hand-written CSS (neumorphic, light theme) + Plus Jakarta Sans |
| PWA | Web App Manifest + service worker + `beforeinstallprompt` |
| Hosting | Vercel |
| Package manager | pnpm |

## 🚀 Getting started

**Prerequisites:** [Node.js](https://nodejs.org/) 18+, [pnpm](https://pnpm.io/), a [LiveKit Cloud](https://cloud.livekit.io/) project, and a [Google OAuth](https://console.cloud.google.com/apis/credentials) client.

```bash
# 1. Install dependencies
pnpm install

# 2. Create your env file
cp .env.example .env.local   # then fill in the values below

# 3. Run the dev server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000). 🎉

### Environment variables

Add these to `.env.local`:

```bash
# LiveKit (from your LiveKit Cloud project)
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
LIVEKIT_URL=wss://your-project.livekit.cloud

# Google OAuth (Google Cloud Console → Credentials)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# NextAuth
NEXTAUTH_SECRET=run `openssl rand -base64 32` to generate
NEXTAUTH_URL=http://localhost:3000   # your deployed URL in production

# Admin console password (optional — defaults to "admin123")
ADMIN_PASSWORD=choose_a_strong_password
```

> For production (Vercel), set the same variables in **Project → Settings → Environment Variables**, and make sure `NEXTAUTH_URL` exactly matches your deployed domain (e.g. `https://mytalk-wheat.vercel.app`).

## 🛠️ Admin console

Visit `/admin` and sign in with `ADMIN_PASSWORD`. From there you can:

- Monitor every live meeting, participant, speaker, and raised hand in real time
- Create new public/private meetings and copy the host link
- Approve/decline join requests, mute/unmute, grant speak, make/demote hosts, remove participants
- Edit a meeting's title and end a meeting for everyone
- Browse ended-meeting history

## 📜 Available scripts

```bash
pnpm dev      # start the dev server
pnpm build    # production build
pnpm start    # run the production build
pnpm lint     # lint
```

## ☁️ Deployment

MyTalk deploys to [Vercel](https://vercel.com/) out of the box — import the repo, add the environment variables above, and deploy. The production app runs at **https://mytalk-wheat.vercel.app/**.

## 🙏 Credits

Realtime audio is powered by [LiveKit](https://livekit.io/) and the [LiveKit Components](https://github.com/livekit/components-js) library. MyTalk started from the LiveKit Meet example and was redesigned and extended into a full audio-conferencing product.

Developed by **Hasib Talukder**.
