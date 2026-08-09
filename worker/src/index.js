const RESEND_API_URL = "https://api.resend.com/emails";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_CSV_BYTES = 100 * 1024;
const MAX_REQUEST_BYTES = 120 * 1024;

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

function isValidPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

async function validateTurnstile(token, request, expectedHostname, env) {
  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: request.headers.get("CF-Connecting-IP") || undefined
    })
  });
  if (!response.ok) return false;
  const result = await response.json();

  return result.success === true &&
    result.action === "measurement_csv" &&
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
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "measurement-email-api/1.0"
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [env.RECIPIENT_EMAIL],
      subject: env.EMAIL_SUBJECT || "New measurement request",
      text,
      attachments: [{ filename: "measurements.csv", content }]
    })
  });

  if (!response.ok) {
    const details = await response.text();
    console.error(JSON.stringify({ message: "Resend rejected the email request", status: response.status, details }));
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
      const contentLength = Number(request.headers.get("Content-Length") || "0");
      if (contentLength > MAX_REQUEST_BYTES) {
        return jsonResponse({ message: "The request is too large." }, 413, origin, env);
      }

      const form = await request.formData();
      const submission = {
        name: String(form.get("name") || "").trim(),
        contactType: String(form.get("contactType") || "").trim(),
        contact: String(form.get("contact") || "").trim(),
        message: String(form.get("message") || "").trim()
      };
      const turnstileToken = String(form.get("turnstileToken") || "");
      const file = form.get("file");

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

      if (!isValidEmail(String(env.RECIPIENT_EMAIL || ""))) {
        throw new Error("Recipient email is not configured");
      }

      if (!(file instanceof File) || file.size === 0 || file.size > MAX_CSV_BYTES) {
        return jsonResponse({ message: "The CSV file is missing or too large." }, 400, origin, env);
      }

      if (!turnstileToken || turnstileToken.length > 2048) {
        return jsonResponse({ message: "Complete the security verification and try again." }, 400, origin, env);
      }

      const expectedHostname = new URL(origin).hostname;
      if (!(await validateTurnstile(turnstileToken, request, expectedHostname, env))) {
        return jsonResponse({ message: "Security verification failed. Please try again." }, 400, origin, env);
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
