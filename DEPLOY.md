# Deploying ZeroSlip to Render

This deploys the backend (Node), web dashboard (React), and Postgres database
to [Render](https://render.com) using the `render.yaml` blueprint at the root
of this repo. All three services live in the same Render account and the
backend's `DATABASE_URL` is auto-wired to the Postgres instance.

Free tier is enough to try it; the backend sleeps after 15 min of inactivity
and Postgres free expires after 30 days. For real production, upgrade.

## What you need to do

### 1. Push this repo to GitHub

If you haven't yet:

```sh
cd ~/Downloads/bor-systems
git status                              # confirm everything's committed
gh repo create bor-systems --private --source=. --push
# or, if you don't have the gh CLI: create a repo at https://github.com/new
# then:
#   git remote add origin git@github.com:<your-username>/bor-systems.git
#   git push -u origin main
```

### 2. Create a Render account

1. Go to [render.com](https://render.com) → **Sign up** with GitHub.
2. Authorise Render to read the `bor-systems` repo (or all repos).

### 3. Spin up the blueprint

1. In the Render dashboard, click **New** → **Blueprint**.
2. Pick the `bor-systems` repo.
3. Render reads `render.yaml` and shows the three services it'll create:
   - `bor-systems-db` (Postgres, free, EU)
   - `bor-systems-backend` (Node web service, free)
   - `bor-systems-web` (static site)
4. Click **Apply**. First build takes ~5 min.

### 4. First-time setup

Once `bor-systems-backend` is **Live** with a green dot:

1. The Postgres database is empty. Migrations ran automatically on startup.
2. **Seed the initial admin user**: open the backend's Render dashboard →
   **Shell** tab → run `npm run db:seed`. This prints the admin email and
   password — *write them down*.
3. Open the web URL Render gave you (something like
   `https://bor-systems-web.onrender.com`) — you should see the login screen.
4. Sign in with the admin credentials. Change your password from the **More
   tab → My profile**.

### 5. Test new-organisation signup

On the web login screen, click **Create an organisation** and walk through the
signup flow with a different email. You'll get a fresh, isolated workspace —
no buildings, no users besides the new admin. This proves multi-tenant
isolation works.

## Custom domain

Render gives every service a `*.onrender.com` URL by default. To put it on
your own domain:

1. Settings → **Custom Domains** → add `app.your-domain.com`
2. Add the DNS record Render shows (CNAME)
3. SSL is handled automatically.

## Hooking up your LoRaWAN gateway later

The webhook endpoint is `https://bor-systems-backend.onrender.com/webhook/tts`.
In your The Things Stack application's **Webhooks** integration, point it
there and set the `X-BOR-Secret` header to the value of the
`TTS_WEBHOOK_SECRET` env var (Render generated one — copy it from the backend's
Environment tab).

## Notification credentials

Render generated `JWT_SECRET` and `TTS_WEBHOOK_SECRET` for you. The optional
notification creds (FCM, Twilio, SMTP) are blank — set them in the backend's
Environment tab if/when you want real push / SMS / email delivery. Without
them, the system records every notification intent in the database (visible
in the **Notifications** page) but doesn't actually send.

## Floor-plan uploads

Render's free tier doesn't have persistent disk storage, so uploaded floor
plans live on the backend's ephemeral filesystem and are lost on every redeploy.
For real use:

- Upgrade the backend service and add a 1 GB disk (~£1/mo) — set `mountPath`
  to `/opt/render/project/src/uploads` in the disk config.
- Or swap the upload code to push to S3 / Cloudflare R2.

## iOS app

`ios/BORSystems/AppConfig.swift` controls the API base URL. After deploying,
change:

```swift
static let apiBaseURL = URL(string: "https://bor-systems-backend.onrender.com")!
```

Then re-run from Xcode. Also remove `NSAllowsArbitraryLoads` from
`ios/BORSystems/Info.plist` once you're on HTTPS — it's only there for
HTTP localhost during dev.
