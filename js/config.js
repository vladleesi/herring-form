const isDevelopment = ["127.0.0.1", "localhost"].includes(window.location.hostname);

const environments = {
  development: {
    apiUrl: "https://measurement-email-api-dev.vladleesi.workers.dev/api/send-csv",
    mockMode: false,
    turnstileSiteKey: "1x00000000000000000000AA"
  },
  production: {
    apiUrl: "https://measurement-email-api.vladleesi.workers.dev/api/send-csv",
    mockMode: false,
    turnstileSiteKey: "0x4AAAAAAEK7jn8MLR_KWa8k"
  }
};

export const CONFIG = Object.freeze(
  isDevelopment ? environments.development : environments.production
);
