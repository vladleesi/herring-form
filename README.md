# Dog Measurement Guide

A responsive, framework-free wizard for collecting a dog's measurements, emailing the completed request, and downloading the measurements as CSV.

The browser application is static HTML, CSS, and JavaScript. Email delivery is handled by a Cloudflare Worker, protected by Turnstile, an exact-origin allowlist, request validation, and rate limiting. Resend is the default email provider.

## Features

- Guided flow for 20 illustrated measurements
- Centimetre and inch support
- Review and CSV download
- Optional email delivery through a separately deployed Worker
- Local mock delivery that never calls Resend
- Server-side validation, bounded uploads, CORS, Turnstile, and per-contact rate limiting
- No build step for the frontend

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html`, `css/`, `js/` | Static frontend |
| `public/images/measurements/` | Paired desktop/mobile measurement illustrations |
| `dev-server.mjs` | Dependency-free local static server |
| `worker/` | Cloudflare Worker, configuration, and security tests |

## Requirements

- Node.js 22 or newer (required by current Wrangler releases)
- A Cloudflare account for deployment
- A Resend account and verified sending domain for live email
- A production Turnstile widget

The repository contains no reusable hosted service, account, domain, email address, or credential. Every fork must configure and deploy its own resources.

## Local development

Clone your fork and install the Worker development dependency:

```bash
git clone https://github.com/your-github-username/herring-form.git
cd herring-form/worker
npm install
```

Create the ignored development secret file from the template:

```bash
cp .dev.vars.example .dev.vars.dev
```

On PowerShell, use `Copy-Item .dev.vars.example .dev.vars.dev` instead. Replace the placeholder in `.dev.vars.dev` with Cloudflare's documented always-pass **test secret**. The matching public test sitekey is already limited to the development configuration in `js/config.js`.

Start the local Worker:

```bash
npm run dev
```

In another terminal, start the frontend from the repository root:

```bash
node dev-server.mjs
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). The frontend calls the Worker at `http://127.0.0.1:8787`. The `dev` Worker environment validates Turnstile and returns a mock success without contacting Resend.

Cloudflare publishes its testing keys for development and automated tests. Never use them in production. See [Test your Turnstile implementation](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

## Deploy your own copy

### 1. Configure the Worker

Edit `worker/wrangler.jsonc`:

- Choose Worker names for the default and `dev` environments.
- Replace `ALLOWED_ORIGINS` with the exact origins that host your frontend. Origins contain a scheme and hostname, plus a port when non-default, but no path or trailing slash.
- Replace rate-limit namespace IDs `1001` and `1002` if either is already used in your Cloudflare account. Each value must be a positive integer encoded as a string and should be unique when counters must remain separate.
- Optionally change `EMAIL_SUBJECT`.

Non-sensitive settings belong in `vars`. Do not put API keys, Turnstile secret keys, or email addresses there.

### 2. Configure the frontend

Edit the `production` object in `js/config.js`:

- Replace `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/send-csv` with the deployed Worker endpoint.
- Replace `YOUR_TURNSTILE_SITE_KEY` with your production Turnstile sitekey. A sitekey is public but deployment-specific.

Make the same Worker-host replacement in the `connect-src` directive in `index.html`. Keeping an exact host in the Content Security Policy prevents the frontend from sending data to arbitrary Worker endpoints.

For a production-only branch, you may also remove the two local `http://...:8787` entries from `connect-src`. They are present in the template so the same checkout can run the local Worker.

Create the production Turnstile widget with every real frontend hostname and no local development hostnames.

### 3. Add production secrets

From `worker/`, authenticate and set each value through Wrangler's interactive prompt:

```bash
npx wrangler login
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put RECIPIENT_EMAIL
npx wrangler secret put SENDER_EMAIL
```

`SENDER_EMAIL` can include a display name, such as `Measure & Send <no-reply@example.com>`. The sender domain must be verified with Resend. Secret values must never be passed as command-line arguments, added to `wrangler.jsonc`, or committed to Git.

Deploy the production Worker:

```bash
npm run deploy
```

The deployed URL printed by Wrangler must match both `js/config.js` and the frontend Content Security Policy.

### 4. Publish the frontend

Any static host works. For GitHub Pages:

1. Open **Settings → Pages** in your fork.
2. Select **Deploy from a branch**, choose the production branch and `/(root)`, and save.
3. If using a custom domain, configure and verify it, enable HTTPS, and keep the generated `CNAME` file.
4. Add the final origin to the Worker's `ALLOWED_ORIGINS` and the Turnstile widget.
5. Submit one real request before announcing the site.

Relative asset paths support GitHub Pages project URLs such as `/herring-form/`.

## Configuration reference

| Name | Location | Secret | Purpose |
| --- | --- | --- | --- |
| `DELIVERY_MODE` | `wrangler.jsonc` | No | `live` in production, `mock` in development |
| `EMAIL_SUBJECT` | `wrangler.jsonc` | No | Subject for delivered messages |
| `ALLOWED_ORIGINS` | `wrangler.jsonc` | No | Comma-separated exact frontend origins |
| `RESEND_API_KEY` | Cloudflare secret | Yes | Authenticates Resend requests |
| `TURNSTILE_SECRET_KEY` | Cloudflare secret / local `.dev.vars.dev` | Yes | Validates Turnstile tokens |
| `RECIPIENT_EMAIL` | Cloudflare secret | Yes | Receives submitted measurement files |
| `SENDER_EMAIL` | Cloudflare secret | Yes | Verified sender identity |
| Worker API URL | `js/config.js` and `index.html` CSP | No | Submission endpoint |
| Turnstile sitekey | `js/config.js` | No | Public browser widget identifier |

Cloudflare supports declaring required secret names in `wrangler.jsonc`; values remain in local ignored environment files or encrypted Worker secrets. See [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Tests and validation

Run the Worker tests:

```bash
cd worker
npm test
```

Validate a production bundle without deploying:

```bash
npm run check
```

The security tests cover valid mock submissions, origin rejection, CSV formula-injection rejection, and request-size limits.

## Data and privacy

The form collects a person's name, contact details, optional message, and dog measurements. Cloudflare and Resend process this data for delivery. A public deployment should provide a privacy notice describing its controller, purpose, retention period, processors, and contact method as required by the applicable jurisdiction.

Worker application logs intentionally omit request bodies, contact details, CSV contents, and provider response bodies. Review platform-level logging and retention settings before launch.

## Measurement images

Desktop and mobile files in `public/images/measurements/` are paired by numeric prefixes. Those prefixes define the form order, so preserve the numbering when replacing an illustration.

## Contributing and security

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## License

Unless noted otherwise, the repository contents are released under the [MIT License](LICENSE). The license does not grant access to any third-party account or hosted resource.
