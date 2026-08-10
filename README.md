# Dog measurement guide

A responsive, framework-free wizard for collecting a dog's measurements and downloading them as a CSV file.

## Form flow

1. Enter the dog's name, sex, and main unit.
2. Complete one illustrated step for each of the 20 measurements. Step order follows the numeric image prefixes.
3. Review the dog details and values. Every measurement uses the main unit selected on the first step.
4. Confirm the measurements, add contact details and an optional message, then send the request by email.
5. Download `[Dog_name]_[Sex]_[YYYYMMDD].csv` from the success screen when needed.

The generated CSV contains exactly four columns: `Name`, `Calculated value ([Unit])`, `Full name`, and `Formula ([Unit])`. The main unit selected on the first step is used in the two unit-bearing column names.

Email delivery uses the configured Cloudflare Worker and Turnstile widget in `js/config.js`. The generated CSV is attached using the dog-specific filename.

## Images

Source images live in `public/images/measurements/`. The UI uses relative `./public/images/…` URLs so assets work both locally and when GitHub Pages hosts the project under `/herring-form/`. Desktop/mobile files are paired by their numeric prefixes, and those prefixes define the form order.

## Local development

Run the included dependency-free development server:

```bash
node dev-server.mjs
```

Then open `http://127.0.0.1:8765`. The server mounts `public/` at the web root so the production image paths work locally too.
