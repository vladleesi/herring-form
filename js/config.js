const isDevelopment = ["127.0.0.1", "localhost"].includes(window.location.hostname);
const deploymentConfig = window.__DOG_MEASUREMENT_CONFIG__ || {};

const environments = {
  development: {
    apiUrl: "http://127.0.0.1:8787/api/send-csv",
    mockMode: false,
    turnstileSiteKey: "1x00000000000000000000AA"
  },
  production: {
    apiUrl: deploymentConfig.apiUrl || "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/send-csv",
    mockMode: false,
    turnstileSiteKey: deploymentConfig.turnstileSiteKey || "YOUR_TURNSTILE_SITE_KEY"
  }
};

export const CONFIG = Object.freeze(
  isDevelopment ? environments.development : environments.production
);
