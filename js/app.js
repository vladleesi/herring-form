import { sendCsv } from "./api.js";
import { CONFIG } from "./config.js";
import { downloadCsv, generateMeasurementsCsv } from "./csv.js";

const STEPS = ["Length", "Width", "Height", "Review", "Contact"];
const MEASUREMENT_STEPS = [
  { key: "length", title: "Length", prompt: "Enter the longest side." },
  { key: "width", title: "Width", prompt: "Enter the side-to-side measurement." },
  { key: "height", title: "Height", prompt: "Enter the top-to-bottom measurement." }
];

const initialState = () => ({
  step: 0,
  measurements: { length: "", width: "", height: "" },
  customer: { name: "", contactType: "email", contact: "", message: "" },
  turnstileToken: "",
  fieldError: "",
  submission: { status: "idle", message: "", result: null }
});

let state = initialState();

const app = document.querySelector("#app");
const progressList = document.querySelector("#progress-list");
const progressMobile = document.querySelector("#progress-mobile");
let turnstileWidgetId = null;
let turnstileRetryTimer = null;

function isLiveEmailConfigured() {
  return CONFIG.mockMode || (
    !CONFIG.apiUrl.includes("YOUR-WORKER") &&
    !CONFIG.turnstileSiteKey.includes("YOUR_TURNSTILE_SITE_KEY")
  );
}

function removeTurnstileWidget() {
  if (turnstileRetryTimer) {
    window.clearTimeout(turnstileRetryTimer);
    turnstileRetryTimer = null;
  }

  if (turnstileWidgetId !== null && window.turnstile) {
    window.turnstile.remove(turnstileWidgetId);
  }

  turnstileWidgetId = null;
}

function renderTurnstileWidget() {
  const container = document.querySelector("#turnstile-container");

  if (!container || CONFIG.mockMode || !isLiveEmailConfigured() || turnstileWidgetId !== null) return;

  if (!window.turnstile) {
    turnstileRetryTimer = window.setTimeout(renderTurnstileWidget, 100);
    return;
  }

  turnstileWidgetId = window.turnstile.render(container, {
    sitekey: CONFIG.turnstileSiteKey,
    action: "measurement_csv",
    theme: "light",
    size: "flexible",
    callback: (token) => {
      state.turnstileToken = token;
      const submitButton = document.querySelector("#send-csv-button");
      if (submitButton) submitButton.disabled = false;
    },
    "expired-callback": () => {
      state.turnstileToken = "";
      const submitButton = document.querySelector("#send-csv-button");
      if (submitButton) submitButton.disabled = true;
    },
    "error-callback": (errorCode) => {
      state.turnstileToken = "";
      const status = document.querySelector("#submission-status");
      if (status) {
        status.textContent = `Verification could not load (Turnstile ${errorCode || "unknown"}). Please refresh the page and try again.`;
      }
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateProgress() {
  const displayStep = Math.min(state.step, STEPS.length - 1);
  progressMobile.textContent = `Step ${displayStep + 1} of ${STEPS.length} — ${STEPS[displayStep]}`;
  progressList.innerHTML = STEPS.map((label, index) => {
    const status = index < displayStep ? "is-complete" : index === displayStep ? "is-active" : "";
    const current = index === displayStep ? ' aria-current="step"' : "";
    return `<li class="${status}" data-number="${index + 1}"${current}><span>${label}</span></li>`;
  }).join("");
}

function measurementCard(stepIndex) {
  const step = MEASUREMENT_STEPS[stepIndex];
  const value = escapeHtml(state.measurements[step.key]);
  const error = escapeHtml(state.fieldError);

  return `
    <form class="card" id="step-form" novalidate>
      <p class="step-kicker">Step ${stepIndex + 1} of 5</p>
      <h2 tabindex="-1">${step.title}</h2>
      <p class="card-subtitle">${step.prompt}</p>
      <label class="field-label" for="measurement-input">${step.title} in centimeters</label>
      <div class="input-wrap">
        <input
          id="measurement-input"
          name="${step.key}"
          type="number"
          min="0"
          step="any"
          inputmode="decimal"
          value="${value}"
          required
          aria-describedby="field-error"
          aria-invalid="${Boolean(state.fieldError)}"
          autocomplete="off"
        >
        <span class="unit" aria-hidden="true">cm</span>
      </div>
      <p class="field-error" id="field-error">${error}</p>
      <div class="actions">
        ${stepIndex > 0 ? '<button class="button button-secondary" type="button" data-action="back">Back</button>' : ""}
        <button class="button button-primary" type="submit">Continue</button>
      </div>
    </form>`;
}

function confirmationCard() {
  const rows = MEASUREMENT_STEPS.map(({ key, title }) => `
    <div class="measurement-row">
      <dt>${title}</dt>
      <dd>${escapeHtml(state.measurements[key])} cm</dd>
    </div>`).join("");

  return `
    <section class="card" aria-labelledby="confirm-title">
      <p class="step-kicker">Step 4 of 5</p>
      <h2 id="confirm-title" tabindex="-1">Review measurements</h2>
      <p class="card-subtitle">Check everything before you continue.</p>
      <dl class="measurements">${rows}</dl>
      <div class="actions">
        <button class="button button-secondary" type="button" data-action="back">Back</button>
        <button class="button button-primary" type="button" data-action="confirm">Continue</button>
      </div>
    </section>`;
}

function contactCard() {
  const isLoading = state.submission.status === "loading";
  const isConfigured = isLiveEmailConfigured();
  const needsVerification = !CONFIG.mockMode && !state.turnstileToken;
  const error = escapeHtml(state.fieldError);
  const submissionMessage = escapeHtml(state.submission.message);
  const isEmail = state.customer.contactType === "email";

  return `
    <form class="card" id="contact-form" novalidate>
      <p class="step-kicker">Step 5 of 5</p>
      <h2 tabindex="-1">Your contact details</h2>
      <p class="card-subtitle">Tell us who you are and how we can reach you.</p>

      <label class="field-label" for="name-input">Name <span aria-hidden="true">*</span></label>
      <input
        class="text-input"
        id="name-input"
        name="name"
        type="text"
        autocomplete="name"
        maxlength="100"
        value="${escapeHtml(state.customer.name)}"
        required
        aria-describedby="contact-error submission-status"
        aria-invalid="${Boolean(state.fieldError)}"
        ${isLoading ? "disabled" : ""}
      >

      <div class="contact-grid">
        <div>
          <label class="field-label" for="contact-type">Contact by</label>
          <select class="text-input contact-type" id="contact-type" name="contactType" ${isLoading ? "disabled" : ""}>
            <option value="email" ${isEmail ? "selected" : ""}>Email</option>
            <option value="phone" ${isEmail ? "" : "selected"}>Phone</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="contact-input">${isEmail ? "Email address" : "Phone number"} <span aria-hidden="true">*</span></label>
          <input
            class="text-input"
            id="contact-input"
            name="contact"
            type="${isEmail ? "email" : "tel"}"
            inputmode="${isEmail ? "email" : "tel"}"
            autocomplete="${isEmail ? "email" : "tel"}"
            placeholder="${isEmail ? "name@example.com" : "+7 (999) 123-45-67"}"
            maxlength="254"
            value="${escapeHtml(state.customer.contact)}"
            required
            aria-describedby="contact-error submission-status"
            aria-invalid="${Boolean(state.fieldError)}"
            ${isLoading ? "disabled" : ""}
          >
        </div>
      </div>

      <label class="field-label" for="message-input">Message <span class="optional-label">Optional</span></label>
      <textarea
        class="text-input message-input"
        id="message-input"
        name="message"
        rows="4"
        maxlength="2000"
        placeholder="Add any details that may help us understand your request."
        ${isLoading ? "disabled" : ""}
      >${escapeHtml(state.customer.message)}</textarea>

      <p class="field-error" id="contact-error">${error}</p>
      ${CONFIG.mockMode ? "" : '<div class="turnstile-wrap" id="turnstile-container" aria-label="Security verification"></div>'}
      ${isConfigured ? "" : '<p class="configuration-note">Request delivery is not configured yet. Add the Worker URL and Turnstile site key in <code>js/config.js</code>.</p>'}
      <p class="submission-status" id="submission-status" role="status">${submissionMessage}</p>
      <div class="actions">
        <button class="button button-secondary" type="button" data-action="back" ${isLoading ? "disabled" : ""}>Back</button>
        <button class="button button-primary" id="send-csv-button" type="submit" ${isLoading || !isConfigured || needsVerification ? "disabled" : ""}>
          ${isLoading ? '<span class="spinner" aria-hidden="true"></span>Sending…' : "Send request"}
        </button>
      </div>
    </form>`;
}

function successCard() {
  const isMock = state.submission.result?.mode === "mock";
  const message = isMock
    ? "Done! The prototype submission was successful. No real email was sent."
    : "Thanks! Your contact details and measurements have been sent.";

  return `
    <section class="card" aria-labelledby="success-title">
      <div class="success-icon" aria-hidden="true">✓</div>
      <p class="step-kicker">Complete</p>
      <h2 id="success-title" tabindex="-1">Request sent</h2>
      <p class="card-subtitle">${message}</p>
      ${isMock ? '<p class="success-note">Mock mode is on. Download the CSV below to verify its contents.</p>' : ""}
      <div class="actions done-actions">
        ${isMock ? '<button class="button button-secondary" type="button" data-action="download">Download CSV</button>' : ""}
        <button class="button button-primary" type="button" data-action="restart">Start over</button>
      </div>
    </section>`;
}

function render({ focus = false } = {}) {
  removeTurnstileWidget();
  updateProgress();

  if (state.step <= 2) app.innerHTML = measurementCard(state.step);
  if (state.step === 3) app.innerHTML = confirmationCard();
  if (state.step === 4) app.innerHTML = contactCard();
  if (state.step === 5) app.innerHTML = successCard();

  if (state.step === 4) renderTurnstileWidget();

  if (focus) {
    app.querySelector("input, h2")?.focus();
  }
}

function validateMeasurement(value) {
  if (value.trim() === "") return "Enter a measurement to continue.";
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "Enter a number greater than zero.";
  return "";
}

function formatPhone(value) {
  let digits = value.replace(/\D/g, "").slice(0, 15);
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;

  if (digits.startsWith("7")) {
    const local = digits.slice(1, 11);
    let formatted = "+7";
    if (local.length) formatted += ` (${local.slice(0, 3)}`;
    if (local.length >= 3) formatted += ")";
    if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
    if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
    if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
    return formatted;
  }

  return digits ? `+${digits.match(/.{1,3}/g).join(" ")}` : "";
}

function validateCustomer() {
  const name = state.customer.name.trim();
  const contact = state.customer.contact.trim();

  if (!name) return "Enter your name to continue.";
  if (name.length > 100) return "Name must be 100 characters or fewer.";
  if (!contact) return "Enter an email address or phone number to continue.";

  if (state.customer.contactType === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || contact.length > 254) {
      return "Enter a valid email address, such as name@example.com.";
    }
  } else {
    const digitCount = contact.replace(/\D/g, "").length;
    if (digitCount < 10 || digitCount > 15) return "Enter a valid phone number with 10 to 15 digits.";
  }

  if (state.customer.message.length > 2000) return "Message must be 2,000 characters or fewer.";
  return "";
}

app.addEventListener("input", (event) => {
  if (event.target.matches("#measurement-input")) {
    state.measurements[MEASUREMENT_STEPS[state.step].key] = event.target.value;
  }

  if (event.target.matches("#name-input")) {
    state.customer.name = event.target.value;
  }

  if (event.target.matches("#contact-input")) {
    const value = state.customer.contactType === "phone" ? formatPhone(event.target.value) : event.target.value;
    state.customer.contact = value;
    if (event.target.value !== value) event.target.value = value;
  }

  if (event.target.matches("#message-input")) {
    state.customer.message = event.target.value;
  }

  if (state.fieldError) {
    state.fieldError = "";
    event.target.setAttribute("aria-invalid", "false");
    const errorElement = app.querySelector(".field-error");
    if (errorElement) errorElement.textContent = "";
  }
});

app.addEventListener("change", (event) => {
  if (!event.target.matches("#contact-type")) return;
  state.customer.contactType = event.target.value;
  state.customer.contact = "";
  state.fieldError = "";
  render({ focus: true });
});

app.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (event.target.id === "step-form") {
    const current = MEASUREMENT_STEPS[state.step];
    state.fieldError = validateMeasurement(state.measurements[current.key]);

    if (state.fieldError) {
      render();
      app.querySelector("input")?.focus();
      return;
    }

    state.step += 1;
    render({ focus: true });
    return;
  }

  if (event.target.id === "contact-form") {
    state.customer.name = event.target.elements.name.value.trim();
    state.customer.contact = event.target.elements.contact.value.trim();
    state.customer.message = event.target.elements.message.value.trim();
    state.fieldError = validateCustomer();

    if (!CONFIG.mockMode && !state.turnstileToken) {
      state.fieldError = state.fieldError || "Complete the security verification before sending.";
    }

    if (state.fieldError) {
      render();
      app.querySelector("input")?.focus();
      return;
    }

    state.submission = { status: "loading", message: "Sending your request…", result: null };
    render();

    try {
      const csv = generateMeasurementsCsv(state.measurements, state.customer);
      const result = await sendCsv({
        customer: state.customer,
        csv,
        turnstileToken: state.turnstileToken,
        config: CONFIG
      });
      state.submission = { status: "success", message: "", result };
      state.step = 5;
      render({ focus: true });
    } catch (error) {
      state.turnstileToken = "";
      state.submission = {
        status: "error",
        message: error instanceof Error ? error.message : "The request could not be sent. Please try again.",
        result: null
      };
      render();
    }
  }
});

app.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;

  if (action === "back") {
    state.fieldError = "";
    state.turnstileToken = "";
    state.submission = { status: "idle", message: "", result: null };
    state.step = Math.max(0, state.step - 1);
    render({ focus: true });
  }

  if (action === "confirm") {
    state.step = 4;
    render({ focus: true });
  }

  if (action === "download") {
    downloadCsv(generateMeasurementsCsv(state.measurements, state.customer));
  }

  if (action === "restart") {
    state = initialState();
    render({ focus: true });
  }
});

render();
