# Measure & Send

A responsive, framework-free request form for collecting measurements, contact details, and an optional message. It sends every request and an attached CSV to a fixed owner email address and is designed to run directly on GitHub Pages.

## Project structure

```text
.
├── index.html
├── css/
│   └── styles.css
└── js/
    ├── app.js
    ├── api.js
    ├── config.js
    └── csv.js
└── worker/
    ├── src/index.js
    └── wrangler.jsonc
```

- `app.js` manages the explicit form step and user-entered state.
- `csv.js` generates and downloads correctly escaped CSV data.
- `api.js` contains the browser-side request API integration.
- `config.js` contains the public Worker URL and Turnstile site key.
- `worker/` contains the Cloudflare Worker that validates requests and sends email through Resend.

## Run locally

Because the JavaScript uses ES modules, serve the folder with any static HTTP server instead of opening `index.html` directly. For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Delivery mode

Public configuration lives in `js/config.js`:

```js
const CONFIG = {
  apiUrl: "https://measurement-email-api.vladleesi.workers.dev/api/send-csv",
  mockMode: false,
  turnstileSiteKey: "YOUR_TURNSTILE_SITE_KEY"
};
```

Live mode is enabled by default. Until the Worker URL and Turnstile site key are configured, the form clearly reports that request delivery is unavailable. Set `mockMode` to `true` temporarily if you only need to test the UI and download the CSV without sending email.

## Configure real email delivery

1. Create a Resend account, add a sending domain, and complete its DNS verification.
2. Create a Resend API key.
3. Create a Cloudflare Turnstile widget for the GitHub Pages hostname. Keep the site key and secret key.
4. Edit `worker/wrangler.jsonc`:
   - set `FROM_EMAIL` to an address on the verified Resend domain;
   - set `RECIPIENT_EMAIL` to the fixed address that should receive every request;
   - replace the example GitHub Pages origin in `ALLOWED_ORIGINS` with the real site origin.
5. From the `worker` directory, add the server-only secrets:

```bash
npx wrangler@latest secret put RESEND_API_KEY
npx wrangler@latest secret put TURNSTILE_SECRET_KEY
```

6. Deploy the Worker:

```bash
npx wrangler@latest deploy
```

7. Copy the deployed Worker URL and the public Turnstile site key into `js/config.js`.

The frontend sends `multipart/form-data` to the Worker with:

- `name`: the visitor's required name
- `contactType`: `email` or `phone`
- `contact`: the visitor's validated email address or phone number
- `message`: an optional message
- `file`: a UTF-8 `measurements.csv` file
- `turnstileToken`: a short-lived security verification token

The Worker validates the origin, contact details, file size, and Turnstile token before sending the request to the fixed `RECIPIENT_EMAIL` through Resend. Never store the Resend API key or Turnstile secret key in frontend code. GitHub Pages serves public static files, so any embedded secret is visible to visitors.

For local Worker development, copy `worker/.dev.vars.example` to `worker/.dev.vars`, replace the placeholders, and run `npx wrangler@latest dev`. The real `.dev.vars` file is ignored by Git.

## Deploy to GitHub Pages

1. Push the project to a GitHub repository.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the branch and the `/ (root)` folder, then save.

All project asset paths are relative, so the site works at repository subpaths such as `https://username.github.io/measurement-form/`.
