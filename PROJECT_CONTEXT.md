# MyTalk — Project Context & Handoff

> Paste this file into a new chat to give the assistant full context about the project. It summarizes what MyTalk is, how it's built, the environment, security model, design system, deployment, and the key decisions made so far.

---

## 1. What it is

**MyTalk** is an **audio-first web conferencing app** (think "audio-only Google Meet") with a clean, light **neumorphic** UI. Public & private (knock-to-join) rooms, host/moderation controls, an admin console, Google sign-in, installable PWA with background audio.

- **Live (Vercel):** `https://mytalk-wheat.vercel.app`
- **Custom domain (being set up):** `https://meet.appletalk.live` (Namecheap DNS → Vercel)
- **Repo:** GitHub fork of `livekit-examples/meet` (owner is detaching the fork relationship via GitHub Support so Vercel stays connected).
- **Local dev path:** `c:\Users\hasib\OneDrive\Desktop\meet` (Windows, PowerShell + Git Bash)
- **Developer:** Hasib Talukder.

## 2. Tech stack

| Area | Tech |
| --- | --- |
| Framework | **Next.js 15.5.28** (App Router) — patched from 15.5.21 for a DoS CVE |
| Realtime | **LiveKit** Cloud — `@livekit/components-react`, `livekit-client` 2.22.4, `livekit-server-sdk` 2.19.1 |
| Auth | **NextAuth v4** (Google provider) |
| Styling | Hand-written CSS in `styles/globals.css` (~6k lines, neumorphic light theme) + **Plus Jakarta Sans** |
| PWA | Web App Manifest + service worker (`public/sw.js`) + custom `beforeinstallprompt` banner |
| Hosting | **Vercel** |
| Package manager | **pnpm 10.18.2** |

## 3. Environment variables (Vercel + `.env.local`)

Secret values are NOT in this doc. Keys required:

```
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
LIVEKIT_URL            # wss://...livekit.cloud
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_SECRET        # strong random (openssl rand -base64 32). REQUIRED — now also used to sign all server tokens.
NEXTAUTH_URL           # MUST match the live domain. Currently needs to be https://meet.appletalk.live (was vercel.app)
ADMIN_PASSWORD         # admin dashboard login password. Set a strong one (NOT admin123).
```

> **Important for the custom domain:** NextAuth uses a single `NEXTAUTH_URL`. For login to work on `meet.appletalk.live`, set `NEXTAUTH_URL=https://meet.appletalk.live`, **redeploy**, and add to Google OAuth: redirect URI `https://meet.appletalk.live/api/auth/callback/google` and JS origin `https://meet.appletalk.live`.

## 4. Features

- **Audio-only meetings**, up to 2,500 participants.
- **Public & private rooms** — private uses **knock-to-join** (host/admin approves each guest). Locked rooms admit only hosts.
- **Host/moderation controls:** grant/revoke speak, make host, **demote host**, raise hand, mute all / unmute all, remove participant, lock room, **End meeting for everyone** (permanent — link shows "expired" after).
- **Admin console** (`/admin`, password-gated): monitor live meetings in real time, create public/private meetings + copy host link, approve/decline join requests, moderate, **edit meeting title**, end meetings, **History tab** (ended-meeting tombstones), fully mobile-responsive.
- **Secure roles:** host rights require a signed HMAC credential (`hk`) — can't self-promote via URL. Role survives reload & rejoin.
- **Rejoin logic:** home/history shows recent meetings; **"Ended" meetings show a disabled "Ended" label instead of Rejoin** (checked via `/api/room-info`).
- **Google sign-in** or guest-by-name.
- **Chat, raise hand, participants sidebar** (with marquee-scrolling names/bios).
- **Picture-in-Picture** (desktop Document PiP, Chrome/Edge) + **MediaSession** background audio. Mobile PiP button hidden (browsers can't float audio-only windows).
- **Installable PWA** — `beforeinstallprompt` banner shows on load; iOS "Add to Home Screen" hint.
- **Light neumorphic design**, Plus Jakarta Sans, fully responsive incl. **iOS safe-area / notch / home-indicator / dvh** handling and input-zoom prevention (16px inputs).

## 5. Key files / architecture

```
app/
  page.tsx                      # Home: 3 tabs (Meet / History / Profile), desktop + mobile layouts
  login/page.tsx                # /login — "Welcome to MyTalk", Continue-with-Google (pulsing glow CTA) + feature cards
  layout.tsx                    # Root: fonts, viewport (viewport-fit=cover, interactiveWidget), PWAInstallPrompt, RegisterSW
  admin/page.tsx                # /admin — password-gated dashboard (inline-styled, S{} style object, isMobile responsive)
  rooms/[roomName]/
    page.tsx                    # Server: resolves role via verifyHostToken(hk)
    PageClientImpl.tsx          # Client: pre-join, auto-rejoin, knock lobby, mounts meeting components, ParticipantProfileImages (JS DOM injection for avatars/bio/marquee)
  api/
    connection-details/route.ts # Issues LiveKit token; role gating (host needs valid hk); knock/lock gating; sets pauth + postfix cookies; rate-limited
    admin/route.ts              # All admin actions (end_room, grant/revoke_speak, make_host, demote_host, remove_participant, mute/unmute_all, create_room, set_title, set_visibility, lock_room, approve/reject_knock, lower_hand); rate-limited (90/min); auth = HMAC token or ADMIN_PASSWORD; returns {rooms, endedRooms}
    admin-token/route.ts        # Mid-meeting host promotion → adminToken; verifies pauth cookie (caller is the participant)
    host-token/route.ts         # Mints hk for a BRAND-NEW room only (409 if exists); rate-limited
    raise-hand/route.ts         # Toggle own hand; verifies pauth cookie
    room-info/route.ts          # Public read: {exists, ended, title, participants...}
lib/
  adminAuth.ts                  # HMAC tokens — admin/host/participant. Signed with NEXTAUTH_SECRET (SIGNING_SECRET), NOT ADMIN_PASSWORD
  authOptions.ts                # NextAuth Google config
  validation.ts                 # validateRoomName/ParticipantName/ImageUrl/MetadataSize, sanitizeInput
  rateLimit.ts                  # In-memory per-IP limiter (rateLimit(bucket, ip, max), clientIp(req))
  CustomVideoConference.tsx     # Meeting shell: grid, control bar, desktop side panel (chat/participants), MeetingTitleBar (mic toggle "Mute/Unmute")
  CustomChat.tsx                # Neumorphic chat (ChatPanelContent + mobile CustomChat)
  ParticipantsSidebar.tsx       # Participants panel + MarqueeText (overflow-aware scrolling)
  KnockContext.tsx / KnockRequests.tsx  # Single shared poller for knock requests (host panel)
  HostLeaveButton.tsx           # Host leave dropdown (Leave Meeting / End Call for All) — works mobile + desktop
  MeetingPip.tsx                # Document PiP + MediaSession (desktop only button)
  PWAInstallPrompt.tsx          # beforeinstallprompt banner + iOS hint
  Debug.tsx                     # DebugMode — DEV ONLY (gated off in production)
styles/globals.css              # All styling. Neumorphic light theme.
next.config.js                  # Security headers (HSTS, X-Frame DENY, nosniff, Referrer-Policy, CSP), productionBrowserSourceMaps:false
middleware.ts                   # NextAuth middleware, matcher ['/'] (home requires login)
```

## 6. Auth & security model

- **Google OAuth** (NextAuth) gates the home page `/` (middleware).
- **Host role:** granted only with a valid signed `hk` HMAC (`/rooms/CODE?role=host&hk=...`). Minted for a new room via `/api/host-token` or by the authed admin. Server also auto-promotes a participant whose name is in the room metadata `hosts[]` list (set by admin "make host").
- **Admin:** `/admin` password-gated; `/api/admin` verifies an HMAC admin token OR the raw `ADMIN_PASSWORD`; rate-limited.
- **All server tokens** (admin / host / participant) are HMAC-**signed with `NEXTAUTH_SECRET`** (strong), so a weak `ADMIN_PASSWORD` can't make tokens forgeable.
- **Per-participant proof:** join sets an httpOnly `pauth` cookie = `signParticipant(identity)`. `/api/admin-token` and `/api/raise-hand` verify it so only the real participant can act (fixed a privilege-escalation bug).
- **Input validation** on all endpoints; **CORS** = same-origin (no permissive headers); **security headers** + CSP set; **source maps off** in prod; `.env.local` gitignored; no secrets in git history.
- **Rate limiting** on `/api/admin`, `/api/connection-details`, `/api/host-token`.
- **Dependencies:** production `pnpm audit` = **"No known vulnerabilities"** (Next.js updated; pnpm overrides force patched postcss ≥8.5.18, nanoid ≥3.3.18, source-map-js ≥1.2.2).
- **Debug mode** disabled in production (no verbose logs, no `window.__lk_room`, no Shift+D overlay).

## 7. Design system

- **Theme:** light **neumorphic** — base `#e6e9f0`; dual box-shadows `dark #cdd2de/#c3c8d4` + soft highlight `#eef1f7` (white highlights were deliberately softened from pure `#ffffff` to avoid harsh glow).
- **Font:** Plus Jakarta Sans (700 headings/logo, 600 buttons/labels, 500/400 body).
- **Palette:** text `#1f2440/#5a6180/#6a7192/#7d849f`; accent blue `#3f6fe0`, gradient `#7aa0ff→#5a83ee`; green `#16a34a`; orange `#d98a12`; red `#e04848`.
- **Logo:** `public/icons/logo_icon.png` (trimmed) in-app; PWA icons generated in `public/icons/` (app-192, app-512, apple-touch-icon, favicon-32).
- **Speaking indicator:** green "orb" glow on the avatar circle only (LiveKit's default blue tile border is suppressed).
- **Home tabs:** Meet / History / Profile (mobile bottom nav + desktop sidebar). History tab = timeline design (date rail + status dot + card).

## 8. Deployment & domain

- Deployed on **Vercel** (project "mytalk"). Primary URL `mytalk-wheat.vercel.app`; adding custom domain `meet.appletalk.live`.
- **DNS (Namecheap, domain `appletalk.live`, BasicDNS):** `CNAME  meet  cname.vercel-dns.com` (propagated & verified). After it goes "Valid" in Vercel, update `NEXTAUTH_URL` + Google OAuth to the new domain.
- Env changes require a **Redeploy**.

## 9. Important decisions & gotchas

- **`body { overflow:hidden; height:100dvh }`** globally (full-screen app). Any full-page screen (admin, login) must be its **own scroll container** (`height:100vh; overflow-y:auto`) or content gets clipped.
- **iOS:** `viewport-fit=cover` + `env(safe-area-inset-*)` on fixed bars; `100dvh` root; inputs ≥16px (prevent focus-zoom); `interactiveWidget: 'resizes-content'` so the keyboard shrinks the layout (chat header & pre-join stay above it).
- **Role on reload/rejoin:** `authRef` in PageClientImpl + role/hk saved in sessionStorage `rejoin_<room>` and localStorage history, so reload keeps the same role even if the URL is cleaned.
- **Google login after OAuth round-trip:** pre-join saves the full join URL to `sessionStorage` before `signIn`, restores host `hk` and auto-joins on return.
- **Ended meetings:** marked via metadata `{ended:true, endedAt}` + a long-emptyTimeout tombstone room (≈10y) so the link permanently shows "expired". These surface in the admin **History** tab (`endedRooms`), and in home/history the Rejoin button becomes a disabled "Ended" label.
- **Chat vanish bug (OPEN / not yet fixed):** desktop chat panel is conditionally mounted (`desktopPanelOpen && tab==='chat'`), so `useChat()` message state resets when the panel is closed/toggled → messages appear to vanish. Fix idea: keep the chat mounted (hidden via CSS) or lift chat state to a context so it persists. (User asked about this; investigation paused mid-way.)
- The user communicates mostly in **Bangla (Banglish)**; keep answers concise and act rather than over-explain.

## 10. Current state

- All code typechecks (`npx tsc --noEmit`) and **production build succeeds** (`pnpm build`).
- Full security audit done & hardened (see §6).
- README + `.env.example` updated for MyTalk (not LiveKit Meet).
- Open item: **chat-vanish fix** (§9). Pending user action: set `NEXTAUTH_URL` + Google OAuth for `meet.appletalk.live`, set a strong `ADMIN_PASSWORD` on Vercel.
