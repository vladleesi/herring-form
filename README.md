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

The frontend uses the deployed Worker configured in `js/config.js`. To test only the interface without sending real email or loading Turnstile, temporarily set `mockMode` to `true` in that file.

## Configure your own deployment

Forks and derived deployments must use their own service configuration. The original hosted Worker, email addresses, domains, Turnstile widget, and API credentials are not reusable project resources.

1. Create your own Resend API key and verified sending domain.
2. Create your own Cloudflare Turnstile widget. Add the production hostname and `127.0.0.1` if local Turnstile testing is needed.
3. Update `worker/wrangler.jsonc`:
   - replace `FROM_EMAIL` with an address on your verified sending domain;
   - replace `ALLOWED_ORIGINS` with the exact frontend origins, without paths;
   - optionally change `EMAIL_SUBJECT` and the Worker `name`.
4. Authenticate Wrangler and add all server-only values as secrets:

```bash
cd worker
wrangler login
wrangler secret put RESEND_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put RECIPIENT_EMAIL
wrangler deploy
```

5. Copy the deployed Worker URL and the public Turnstile sitekey into `js/config.js`.

Never place the Resend API key, Turnstile secret key, or recipient email in frontend code or committed configuration. For local Worker development, copy `worker/.dev.vars.example` to `worker/.dev.vars`, fill in your own values, and run `wrangler dev` from the `worker` directory. The real `.dev.vars` file is ignored by Git.

## GitHub Pages

The frontend is static and can be published from the repository root with GitHub Pages. Image URLs are relative, so project subpaths such as `/herring-form/` are supported. Before publishing a fork, complete the configuration steps above and add the final Pages origin to `ALLOWED_ORIGINS` and Turnstile hostname management.

## Images

Source images live in `public/images/measurements/`. Desktop/mobile files are paired by their numeric prefixes, and those prefixes define the form order.

## License

The source code is available under the [MIT License](LICENSE). The license does not grant access to the original hosted services, credentials, email accounts, or domains; derived deployments need their own configuration.
