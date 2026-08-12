# EatHub

Recipe sharing site. Express + SQLite API, Vue 3 frontend. Sign in with Google or
with an email address confirmed by a verification link.

```
.                     express api (routes/, db.js, google_strategy.js)
└── frontend/         vue 3 + vite app, builds into frontend/dist
```

---

## Sending the verification emails

Email signup needs somewhere to send the confirmation link.

**In development you can skip this entirely.** With `SMTP_HOST` empty, the link is
printed to the server console instead of being sent:

```
--- verification link for cook@example.com ---
http://localhost:4000/verify-email?token=3a587e65…
---
```

Paste that into the browser and the account is confirmed.

**For real delivery**, fill in the SMTP block in `.env` with any provider:

```dotenv
SMTP_HOST=smtp.sendgrid.net      # or smtp.gmail.com, smtp.mailgun.org, …
SMTP_PORT=587                    # 465 if the provider wants implicit TLS
SMTP_USER=apikey
SMTP_PASS=your-smtp-password
MAIL_FROM=EatHub <no-reply@yourdomain.com>
PUBLIC_URL=https://eathub.example.com
```

Set `PUBLIC_URL` in production. The link inside the email has to be absolute, and
deriving it from the request headers gets it wrong when you sit behind a proxy.

> With Gmail, `SMTP_PASS` must be an [App Password](https://myaccount.google.com/apppasswords),
> not your account password.

How the flow behaves:

- Signing up creates the account but leaves it unusable until the link is opened.
- Logging in before confirming answers `403` with `code: "unverified"`, and the
  sign-in page then offers to resend the link.
- Links last 24 hours and work once. Asking for a new one invalidates the old.
- Signing up with an address that already exists returns the same message as a new
  signup and quietly sends nothing, so the endpoint cannot be used to discover who
  has an account.
- Google accounts skip all of this — Google has already verified the address.

---

## Registering the app with Google

You need a Google OAuth client before sign-in works. This takes about five minutes.

### 1. Create a project

1. Go to <https://console.cloud.google.com/>.
2. Open the project dropdown in the top bar → **New project**.
3. Name it `EatHub` → **Create**, then make sure it is the selected project.

### 2. Configure the consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Pick **External** (unless you have a Google Workspace and only want your own
   organisation to sign in) → **Create**.
3. Fill in the required fields:
   - **App name**: `EatHub`
   - **User support email**: your address
   - **Developer contact information**: your address
4. **Save and continue**.
5. On the **Scopes** step click **Add or remove scopes** and tick:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`

   These are the only two the app uses. **Update** → **Save and continue**.
6. On the **Test users** step, add every Google account you want to sign in with
   while the app is still unpublished — including your own. **Save and continue**.

> While the app is in *Testing*, only the listed test users can sign in, and their
> sessions expire after 7 days. That is fine for development. To open it up to
> anyone, go back to the consent screen and press **Publish app**. An app that only
> asks for email and profile does not need Google's verification review.

### 3. Create the OAuth client

1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type**: `Web application`.
3. **Name**: `EatHub web`.
4. Under **Authorised JavaScript origins** add:
   - `http://localhost:4000`
   - `http://localhost:5173` (only needed for the Vite dev server)
   - your production origin, e.g. `https://eathub.example.com`
5. Under **Authorised redirect URIs** add — these must match
   `GOOGLE_CALLBACK_URL` **exactly**, including scheme, port and trailing path:
   - `http://localhost:4000/auth/google/callback`
   - `https://eathub.example.com/auth/google/callback`
6. **Create**. Copy the **Client ID** and **Client secret**.

### 4. Put the credentials in `.env`

```bash
cp .env.example .env
```

```dotenv
GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback
CLIENT_URL=
SESSION_SECRET=paste-the-output-of-openssl-rand-hex-32
PORT=4000
```

`SESSION_SECRET` — generate one with:

```bash
openssl rand -hex 32
```

`.env` is gitignored. Never commit the client secret.

### 5. In production

Set the same variables in your host's environment (on DigitalOcean: App → Settings
→ App-Level Environment Variables) with the production values:

```dotenv
GOOGLE_CALLBACK_URL=https://eathub.example.com/auth/google/callback
CLIENT_URL=
NODE_ENV=production
```

Leave `CLIENT_URL` empty in production — the API serves the built Vue app from the
same origin. `NODE_ENV=production` turns on the `Secure` flag for the session
cookie, so the site must be served over HTTPS.

### Common errors

| Message | Cause |
| --- | --- |
| `redirect_uri_mismatch` | The URI in **Credentials** is not character-for-character equal to `GOOGLE_CALLBACK_URL`. Check `http` vs `https`, the port, and the trailing `/callback`. |
| `access_blocked: EatHub has not completed the Google verification process` | The account is not in **Test users** and the app is unpublished. |
| `invalid_client` | Wrong `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, or `.env` was not loaded — restart the server after editing it. |
| Signed in, but bounced straight back to `/signin` | The session cookie was rejected. In production check `NODE_ENV=production` **and** HTTPS; in dev check `CLIENT_URL=http://localhost:5173`. |

---

## Running it

### Development (two processes, hot reload)

```bash
npm install
npm run dev                       # api on http://localhost:4000
```

```bash
cd frontend
npm install
npm run dev                       # ui on http://localhost:5173
```

Set `CLIENT_URL=http://localhost:5173` in `.env` so Google sends you back to the
Vite server after signing in. Vite proxies the API routes through to port 4000.

### Production (one process)

```bash
npm install
npm run build                     # builds frontend/dist
npm start                         # serves the api and the built ui on :4000
```

---

## Auth notes

- Two ways in: Google, or an email address plus a password of at least 8 characters
  confirmed by a verification link. Passwords are stored as bcrypt hashes.
- `users.google_id` identifies a Google account. If a Google email matches a row
  that already existed, that row is linked instead of a duplicate being created,
  and it counts as verified from then on.
- Wrong password and unknown address give the same `401` and the same wording, so
  the login route cannot be used to enumerate accounts.
- On first start, `db.js` migrates an older database: it adds `google_id`,
  `email_verified` and a nullable `password`, creates the `email_tokens` and
  `comments` tables, and marks existing Google accounts verified. Password hashes
  from the original schema are not carried over — those accounts sign in with
  Google, or sign up again with the same address.
- Sessions live in the same SQLite file; the cookie lasts a week.

## API

| Method | Route | Auth | |
| --- | --- | --- | --- |
| POST | `/signup` | – | Body `{ email, password }`. Sends the confirmation link. |
| POST | `/login` | – | Body `{ email, password }`. `403` + `code: "unverified"` if unconfirmed. |
| GET | `/verify-email?token=` | – | Opened from the email, redirects to `/signin?verify=…`. |
| POST | `/resend-verification` | – | Body `{ email }`. |
| GET | `/auth/google` | – | Starts sign-in. Takes `?next=/path` to return to. |
| GET | `/auth/google/callback` | – | Google redirects here. |
| GET | `/getProfileInfo` | ✔ | Current user. |
| POST | `/logout` | – | Destroys the session. |
| GET | `/recipes` | – | All recipes, most liked first. |
| GET | `/recipe/:id` | – | One recipe. |
| DELETE | `/recipe/:id` | ✔ | Author only. Removes the photo and cascades likes and comments. |
| GET | `/myRecipes` | ✔ | Recipes you posted. |
| POST | `/createRecipe` | ✔ | Multipart: `name`, `info`, `image`, and `recipe` / `ingredients` as JSON arrays. |
| POST | `/like/:recipe_id` | ✔ | Body `{ "like": 1 }` or `{ "like": 0 }`. |
| GET | `/recipe/:id/comments` | – | Newest first, with author name and picture. |
| POST | `/recipe/:id/comments` | ✔ | Body `{ body }`, up to 1000 characters. |
| DELETE | `/comments/:comment_id` | ✔ | The comment's author or the recipe's author. |

Protected routes answer `401` with `{ "message": "you are not signed in" }`.
