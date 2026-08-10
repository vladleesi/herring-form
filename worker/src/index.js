const RESEND_API_URL = "https://api.resend.com/emails";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_CSV_BYTES = 100 * 1024;
const MAX_REQUEST_BYTES = 120 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;
const EXPECTED_MEASUREMENT_NAMES = [
  "@NckCirc",
  "@NckToEarLngth",
  "@CllrWdth",
  "@ChLngthToFL",
  "@ChLngthToAntAxFld",
  "@LngthBtwnFL",
  "@AntAxFldCirc",
  "@AntAxFldToGrndHght",
  "@NckToAntAxFldLngth",
  "@AntAxFldToTailLngth",
  "@NckToGrndHght",
  "@LngthOfOutSdFL",
  "@LngthOfInSdFL",
  "@LngthBtwnFlds",
  "@PstAxFldCirc",
  "@PstAxFldToGrndHght",
  "@LngthOfInSdHL",
  "@HLCirc",
  "@LowFLCirc",
  "@LowHLCirc"
];

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(origin, env) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin"
  };

  if (getAllowedOrigins(env).includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function jsonResponse(data, status, origin, env) {
  return Response.json(data, {
    status,
    headers: corsHeaders(origin, env)
  });
}

function isValidEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidFromEmail(value) {
  if (!value || value.length > 320 || /[\r\n]/.test(value)) return false;
  const displayAddress = value.match(/^[^<>]{1,100}<([^<>]+)>$/);
  return isValidEmail(displayAddress ? displayAddress[1].trim() : value);
}

function isValidPhone(value) {
  const digits = value.replace(/\D/g, "");
  return /^\+?[\d\s().-]+$/.test(value) && digits.length >= 10 && digits.length <= 15;
}

async function hasExpectedCsvContent(file) {
  const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== EXPECTED_MEASUREMENT_NAMES.length + 1) return false;

  const header = lines[0].match(/^Name,Calculated value \((cm|inch)\),Full name,Formula \(\1\)$/);
  if (!header) return false;

  return lines.slice(1).every((line, index) => {
    const cells = line.split(",");
    if (cells.length !== 4) return false;

    const [name, value, fullName, formula] = cells;
    const numericValue = Number(value);

    return name === EXPECTED_MEASUREMENT_NAMES[index] &&
      /^\d+(?:\.\d+)?$/.test(value) &&
      Number.isFinite(numericValue) &&
      numericValue > 0 &&
      /^\p{L}[\p{L}\p{N} .'-]{0,199}$/u.test(fullName) &&
      formula === "";
  });
}

async function readRequestBodyWithinLimit(request) {
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function getSubmissionRateLimitKey(submission) {
  const contact = submission.contactType === "email"
    ? submission.contact.toLowerCase()
    : submission.contact.replace(/\D/g, "");
  const data = new TextEncoder().encode(`${submission.contactType}:${contact}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));

  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateTurnstile(token, request, expectedHostname, deliveryMode, env) {
  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: request.headers.get("CF-Connecting-IP") || undefined
    })
  });
  if (!response.ok) return false;
  const result = await response.json();

  if (result.success !== true) return false;
  if (deliveryMode === "mock") return true;

  return result.action === "measurement_csv" &&
    result.hostname === expectedHostname;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];

  for (let index = 0; index < bytes.length; index += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  }

  return btoa(chunks.join(""));
}

async function sendEmail(submission, file, env) {
  const content = arrayBufferToBase64(await file.arrayBuffer());
  const sanitizedFilename = String(file.name || "measurements.csv")
    .replace(/[\\/\r\n"]/g, "_")
    .slice(0, 180);
  const filename = sanitizedFilename || "measurements.csv";
  const message = submission.message || "No message provided.";
  const text = [
    "New measurement request",
    "",
    `Name: ${submission.name}`,
    `Contact method: ${submission.contactType}`,
    `Contact: ${submission.contact}`,
    "",
    "Message:",
    message,
    "",
    "The submitted measurements are attached as a CSV file."
  ].join("\n");
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "measurement-email-api/1.0"
    },
    body: JSON.stringify({
      from: env.SENDER_EMAIL,
      to: [env.RECIPIENT_EMAIL],
      subject: env.EMAIL_SUBJECT || "New measurement request",
      text,
      attachments: [{ filename, content }]
    })
  });

  if (!response.ok) {
    await response.body?.cancel();
    console.error(JSON.stringify({ message: "Resend rejected the email request", status: response.status }));
    throw new Error("Email provider rejected the request");
  }

  return response.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = getAllowedOrigins(env).includes(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: allowedOrigin ? 204 : 403,
        headers: corsHeaders(origin, env)
      });
    }

    if (url.pathname !== "/api/send-csv") {
      return jsonResponse({ message: "Not found." }, 404, origin, env);
    }

    if (request.method !== "POST") {
      return jsonResponse({ message: "Method not allowed." }, 405, origin, env);
    }

    if (!allowedOrigin) {
      return jsonResponse({ message: "This website is not allowed to submit requests." }, 403, origin, env);
    }

    try {
      const contentType = request.headers.get("Content-Type") || "";
      if (!/^multipart\/form-data\s*;/i.test(contentType)) {
        return jsonResponse({ message: "Content-Type must be multipart/form-data." }, 415, origin, env);
      }

      const contentLength = request.headers.get("Content-Length");
      if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)) {
        return jsonResponse({ message: "The request is too large." }, 413, origin, env);
      }

      const requestBody = await readRequestBodyWithinLimit(request);
      if (requestBody === null) {
        return jsonResponse({ message: "The request is too large." }, 413, origin, env);
      }

      let form;
      try {
        form = await new Response(requestBody, {
          headers: { "Content-Type": contentType }
        }).formData();
      } catch {
        return jsonResponse({ message: "The form data is invalid." }, 400, origin, env);
      }

      const submission = {
        name: String(form.get("name") || "").trim(),
        contactType: String(form.get("contactType") || "").trim(),
        contact: String(form.get("contact") || "").trim(),
        message: String(form.get("message") || "").trim()
      };
      const turnstileToken = String(form.get("turnstileToken") || "");
      const file = form.get("file");
      const deliveryMode = String(env.DELIVERY_MODE || "");

      if (!["live", "mock"].includes(deliveryMode)) {
        throw new Error("Delivery mode is not configured");
      }

      if (!submission.name || submission.name.length > 100) {
        return jsonResponse({ message: "Enter a valid name." }, 400, origin, env);
      }

      if (!["email", "phone"].includes(submission.contactType)) {
        return jsonResponse({ message: "Choose email or phone as the contact method." }, 400, origin, env);
      }

      const validContact = submission.contactType === "email"
        ? isValidEmail(submission.contact)
        : isValidPhone(submission.contact);
      if (!validContact) {
        return jsonResponse({ message: "Enter a valid email address or phone number." }, 400, origin, env);
      }

      if (submission.message.length > 2000) {
        return jsonResponse({ message: "The message is too long." }, 400, origin, env);
      }

      if (
        deliveryMode === "live" &&
        (!isValidEmail(String(env.RECIPIENT_EMAIL || "")) || !isValidFromEmail(String(env.SENDER_EMAIL || "")))
      ) {
        throw new Error("Email delivery is not configured");
      }

      if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > MAX_CSV_BYTES ||
        !file.name.toLowerCase().endsWith(".csv") ||
        !(await hasExpectedCsvContent(file))
      ) {
        return jsonResponse({ message: "The CSV file is missing, invalid, or too large." }, 400, origin, env);
      }

      if (!turnstileToken || turnstileToken.length > 2048) {
        return jsonResponse({ message: "Complete the security verification and try again." }, 400, origin, env);
      }

      const expectedHostname = new URL(origin).hostname;
      if (!(await validateTurnstile(turnstileToken, request, expectedHostname, deliveryMode, env))) {
        return jsonResponse({ message: "Security verification failed. Please try again." }, 400, origin, env);
      }

      const rateLimitKey = await getSubmissionRateLimitKey(submission);
      const { success: withinRateLimit } = await env.SUBMISSION_RATE_LIMITER.limit({ key: rateLimitKey });
      if (!withinRateLimit) {
        return jsonResponse({ message: "Too many requests. Please wait a minute and try again." }, 429, origin, env);
      }

      if (deliveryMode === "mock") {
        return jsonResponse({ delivered: false, mode: "mock" }, 200, origin, env);
      }

      const result = await sendEmail(submission, file, env);
      return jsonResponse({ delivered: true, id: result.id }, 200, origin, env);
    } catch (error) {
      console.error(JSON.stringify({
        message: "Email submission failed",
        error: error instanceof Error ? error.message : String(error)
      }));
      return jsonResponse({ message: "The request could not be sent. Please try again later." }, 502, origin, env);
    }
  }
};
