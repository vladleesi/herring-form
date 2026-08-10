# Dog measurement guide

A responsive, framework-free wizard for collecting a dog's measurements, sending the completed request by email, and downloading it as a CSV file.

## Form flow

1. Enter the dog's name, sex, and main unit.
2. Complete one illustrated step for each of the 20 measurements. Step order follows the numeric image prefixes.
3. Review the dog details and values. Every measurement uses the main unit selected on the first step.
4. Add contact details and an optional message, then send the request by email.
5. Download `[Dog_name]_[Sex]_[YYYYMMDD].csv` from the success screen when needed.

The CSV contains exactly four columns: `Name`, `Calculated value ([Unit])`, `Full name`, and `Formula ([Unit])`. The `Formula` values are empty.

## Run locally

Requirements: Node.js 18 or newer. No package installation is needed.

```bash
git clone https://github.com/vladleesi/herring-form.git
cd herring-form
node dev-server.mjs
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). Stop the server with `Ctrl+C`.

The frontend selects its configuration automatically. On `127.0.0.1` or `localhost` it calls the isolated `measurement-email-api-dev` Worker with Cloudflare's public always-pass Turnstile test sitekey. On every other hostname it uses the production Worker and production sitekey. No source-file switching is required.

Set up the development Worker once. Use Cloudflare's documented always-pass Turnstile test secret when Wrangler prompts for `TURNSTILE_SECRET_KEY`:

```bash
cd worker
wrangler secret put TURNSTILE_SECRET_KEY --env dev
wrangler deploy --env dev
cd ..
node dev-server.mjs
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). The development Worker validates the request with Cloudflare's always-pass test secret, returns a mock success, and never calls Resend. Cloudflare's dummy response uses synthetic action and hostname metadata, so exact action and hostname matching remains a production-only check; the dev Worker still enforces its local Origin allowlist. It allows `http://127.0.0.1:8765` and `http://localhost:8765`; neither is part of the production allowlist.

## Configure your own deployment

Forks and derived deployments must use their own service configuration. The original hosted Worker, email addresses, domains, Turnstile widget, and API credentials are not reusable project resources.

1. Create your own Resend API key and verified sending domain.
2. Create your own production Cloudflare Turnstile widget with only the production frontend hostnames. Local development uses Cloudflare's public test keys instead of the production widget.
3. Update `worker/wrangler.jsonc`:
   - replace `ALLOWED_ORIGINS` with the exact frontend origins, without paths;
   - optionally change `EMAIL_SUBJECT` and the Worker `name`;
   - choose rate-limit namespace IDs that are unique within your Cloudflare account.
4. Authenticate Wrangler and add all server-only values as secrets. `SENDER_EMAIL` may include a display name, for example `Measure & Send <no-reply@example.com>`:

```bash
cd worker
wrangler login
wrangler secret put RESEND_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put RECIPIENT_EMAIL
wrangler secret put SENDER_EMAIL
wrangler deploy
```

5. Copy the deployed Worker URL and the public Turnstile sitekey into `js/config.js`.

Never place the Resend API key, Turnstile secret key, recipient email, or sender email in frontend code or committed configuration. They are Cloudflare Worker secrets. The real `.dev.vars` file is ignored by Git; only the placeholder `.dev.vars.example` is tracked.

Deploy production explicitly with `wrangler deploy --env=""`. The production API uses `https://measurement-email-api.vladleesi.workers.dev/api/send-csv`; it remains protected by the exact-origin allowlist, Turnstile hostname and action validation, per-contact rate limiting, bounded multipart parsing, strict CSV validation, upstream timeouts, and server-side input validation. Worker observability is enabled, but request contents and provider response bodies are not written to application logs.

## GitHub Pages

The frontend is static and has no build step. It can be published from the repository root with GitHub Pages, and its relative asset URLs support project paths such as `/herring-form/`.

For production:

1. In GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**, choose the production branch and `/(root)`, then save.
3. If using a custom domain, configure it in the same Pages screen, verify the domain for the GitHub account, and enable **Enforce HTTPS**. Keep the Pages-generated `CNAME` file if the site publishes from a branch.
4. Ensure every real frontend hostname is present in both production `ALLOWED_ORIGINS` and the production Turnstile widget. Do not add `localhost` or `127.0.0.1` to production.
5. Set all four production Worker secrets, deploy the Worker with `wrangler deploy --env=""`, and test one real submission before announcing the site.

The page includes a restrictive Content Security Policy suitable for the current same-origin assets, Turnstile, and the two configured Worker endpoints. Update the policy in `index.html` together with `js/config.js` if an endpoint or required third-party resource changes.

The form collects a name, contact details, an optional message, and dog measurements. The UI tells visitors that Cloudflare and Resend process this data for email delivery. Add the site's full privacy notice and retention/contact details if required for the jurisdiction and intended audience.

Run the Worker security tests without installing dependencies:

```bash
cd worker
npm test
```

## Images

Source images live in `public/images/measurements/`. Desktop/mobile files are paired by their numeric prefixes, and those prefixes define the form order.

## License

The source code is available under the [MIT License](LICENSE). The license does not grant access to the original hosted services, credentials, email accounts, or domains; derived deployments need their own configuration.
