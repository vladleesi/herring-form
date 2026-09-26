import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(projectRoot, process.env.SITE_OUTPUT_DIR || "_site");
const workerApiValue = String(process.env.WORKER_API_URL || "").trim();
const turnstileSiteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();

if (!outputDirectory.startsWith(`${projectRoot}\\`) && !outputDirectory.startsWith(`${projectRoot}/`)) {
  throw new Error("SITE_OUTPUT_DIR must be inside the repository.");
}

let workerApiUrl;
try {
  workerApiUrl = new URL(workerApiValue);
} catch {
  throw new Error("WORKER_API_URL must be a valid absolute URL.");
}

if (
  workerApiUrl.protocol !== "https:" ||
  workerApiUrl.username ||
  workerApiUrl.password ||
  workerApiUrl.search ||
  workerApiUrl.hash ||
  workerApiUrl.pathname !== "/api/send-csv"
) {
  throw new Error("WORKER_API_URL must be an HTTPS URL ending exactly in /api/send-csv.");
}

if (
  turnstileSiteKey.length < 20 ||
  /\s/.test(turnstileSiteKey) ||
  turnstileSiteKey.includes("YOUR_TURNSTILE_SITE_KEY") ||
  turnstileSiteKey === "1x00000000000000000000AA"
) {
  throw new Error("TURNSTILE_SITE_KEY must be a production Turnstile sitekey.");
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

for (const entry of ["css", "js", "public"]) {
  cpSync(join(projectRoot, entry), join(outputDirectory, entry), { recursive: true });
}

for (const entry of ["index.html", "LICENSE"]) {
  cpSync(join(projectRoot, entry), join(outputDirectory, entry));
}

const placeholderOrigin = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev";
const sourceIndex = readFileSync(join(outputDirectory, "index.html"), "utf8");

if (!sourceIndex.includes(placeholderOrigin)) {
  throw new Error("The Worker CSP placeholder is missing from index.html.");
}

writeFileSync(
  join(outputDirectory, "index.html"),
  sourceIndex.replaceAll(placeholderOrigin, workerApiUrl.origin)
);

const browserConfig = {
  apiUrl: workerApiUrl.href,
  turnstileSiteKey
};

writeFileSync(
  join(outputDirectory, "js", "deployment-config.js"),
  `window.__DOG_MEASUREMENT_CONFIG__ = Object.freeze(${JSON.stringify(browserConfig, null, 2)});\n`
);

console.log(`Built static site in ${outputDirectory}`);
