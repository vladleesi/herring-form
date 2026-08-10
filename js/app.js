import { sendCsv } from "./api.js";
import { CONFIG } from "./config.js";
import { createCsvFilename, downloadCsv, generateMeasurementsCsv } from "./csv.js";

export const MEASUREMENTS = [
  { imageNumber: 3, name: "@NckCirc", slug: "NckCirc", fullName: "Neck under collar" },
  { imageNumber: 5, name: "@NckToEarLngth", slug: "NckToEarLngth", fullName: "From the point on her neck under collar to ear" },
  { imageNumber: 7, name: "@CllrWdth", slug: "CllrWdth", fullName: "Collar width" },
  { imageNumber: 9, name: "@ChLngthToFL", slug: "ChLngthToFL", fullName: "Chest length from the point on her neck under collar to the point in front of the forepaws" },
  { imageNumber: 11, name: "@ChLngthToAntAxFld", slug: "ChLngthToAntAxFld", fullName: "Chest length from the point on her neck under collar to anterior axillary folds" },
  { imageNumber: 13, name: "@LngthBtwnFL", slug: "LngthBtwnFL", fullName: "Distance between the forepaw" },
  { imageNumber: 15, name: "@AntAxFldCirc", slug: "AntAxFldCirc", fullName: "Anterior axillary folds" },
  { imageNumber: 17, name: "@AntAxFldToGrndHght", slug: "AntAxFldToGrndHght", fullName: "From the point on the back where anterior axillary folds to the ground" },
  { imageNumber: 19, name: "@NckToAntAxFldLngth", slug: "NckToAntAxFldLngth", fullName: "From the point on her neck under collar to the point on the back where anterior axillary folds" },
  { imageNumber: 21, name: "@AntAxFldToTailLngth", slug: "AntAxFldToTailLngth", fullName: "From the point on the back where anterior axillary folds to the point above the tail" },
  { imageNumber: 23, name: "@NckToGrndHght", slug: "NckToGrndHght", fullName: "From the point on her neck under collar to the ground" },
  { imageNumber: 25, name: "@LngthOfOutSdFL", slug: "LngthOfOutSdFL", fullName: "Length of outer side of the forepaw" },
  { imageNumber: 27, name: "@LngthOfInSdFL", slug: "LngthOfInSdFL", fullName: "Length of inner side of the forepaw" },
  { imageNumber: 29, name: "@LngthBtwnFlds", slug: "LngthBtwnFlds", fullName: "Distance between folds" },
  { imageNumber: 31, name: "@PstAxFldCirc", slug: "PstAxFldCirc", fullName: "Posterior axillary folds" },
  { imageNumber: 33, name: "@PstAxFldToGrndHght", slug: "PstAxFldToGrndHght", fullName: "From the point on the back where posterior axillary folds to the ground" },
  { imageNumber: 35, name: "@LngthOfInSdHL", slug: "LngthOfInSdHL", fullName: "Length of inner side of the hind leg" },
  { imageNumber: 37, name: "@HLCirc", slug: "HLCirc", fullName: "Upper hind leg circumference" },
  { imageNumber: 39, name: "@LowFLCirc", slug: "LowFLCirc", fullName: "Lower forepaw circumference" },
  { imageNumber: 41, name: "@LowHLCirc", slug: "LowHLCirc", fullName: "Lower hind leg circumference" }
];

const REVIEW_STEP = MEASUREMENTS.length + 1;
const CONTACT_STEP = REVIEW_STEP + 1;
const TOTAL_STEPS = CONTACT_STEP + 1;

function createInitialState() {
  return {
    step: 0,
    dog: { name: "", sex: "", unit: "cm" },
    measurements: Object.fromEntries(
      MEASUREMENTS.map(({ slug }) => [slug, { value: "", unit: "" }])
    ),
    customer: { name: "", contactType: "email", contact: "", message: "" },
    turnstileToken: "",
    submission: { status: "idle", message: "", result: null },
    errors: {},
    completed: false
  };
}

let state = createInitialState();

const app = document.querySelector("#app");
const progressStep = document.querySelector("#progress-step");
const progressLabel = document.querySelector("#progress-label");
const progressTrack = document.querySelector(".progress-track");
const progressFill = document.querySelector("#progress-fill");
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

function picture(slug, alt, imageNumber, className = "step-picture") {
  const desktopPrefix = String(imageNumber).padStart(2, "0");
  const mobilePrefix = String(imageNumber + 1).padStart(2, "0");

  return `
    <picture class="${className}">
      <source media="(max-width: 640px)" srcset="./public/images/measurements/${mobilePrefix}_${slug}_mobile.png">
      <img src="./public/images/measurements/${desktopPrefix}_${slug}_desktop.png" alt="${escapeHtml(alt)}">
    </picture>`;
}

function unitOptions(name, selectedUnit) {
  return `
    <div class="choice-group unit-choice" role="radiogroup" aria-label="Unit">
      ${["cm", "inch"].map((unit) => `
        <label class="choice-pill">
          <input type="radio" name="${name}" value="${unit}" ${selectedUnit === unit ? "checked" : ""} required>
          <span>${unit}</span>
        </label>`).join("")}
    </div>`;
}

function updateProgress() {
  const visibleStep = state.completed ? TOTAL_STEPS : state.step + 1;
  let label = "About your dog";

  if (state.step > 0 && state.step <= MEASUREMENTS.length) {
    label = MEASUREMENTS[state.step - 1].fullName;
  } else if (state.step === REVIEW_STEP) {
    label = "Review and confirm";
  } else if (state.step === CONTACT_STEP) {
    label = state.completed ? "Request sent" : "Contact and message";
  }

  progressStep.textContent = state.completed ? "Complete" : `Step ${visibleStep} of ${TOTAL_STEPS}`;
  progressLabel.textContent = label;
  progressTrack.setAttribute("aria-valuenow", String(visibleStep));
  progressFill.style.width = `${(visibleStep / TOTAL_STEPS) * 100}%`;
}

function aboutCard() {
  return `
    <form class="step-card" id="about-form" novalidate>
      ${picture("21_untitled", "Dog measurement overview", 1)}
      <div class="step-content">
        <p class="step-kicker">STEP 1 · ABOUT YOUR DOG</p>
        <h2 tabindex="-1">Let’s get acquainted</h2>
        <p class="card-subtitle">Tell us who we’re measuring and choose the unit you’ll use most often.</p>

        <label class="field-label" for="dog-name">Dog’s name</label>
        <input
          class="text-input"
          id="dog-name"
          name="dogName"
          type="text"
          maxlength="50"
          autocomplete="off"
          value="${escapeHtml(state.dog.name)}"
          aria-invalid="${Boolean(state.errors.name)}"
          aria-describedby="dog-name-error"
          required
        >
        <p class="field-error" id="dog-name-error">${escapeHtml(state.errors.name || "")}</p>

        <fieldset class="field-group">
          <legend class="field-label">Sex</legend>
          <div class="choice-group">
            ${["male", "female"].map((sex) => `
              <label class="choice-pill">
                <input type="radio" name="sex" value="${sex}" ${state.dog.sex === sex ? "checked" : ""} required>
                <span>${sex[0].toUpperCase()}${sex.slice(1)}</span>
              </label>`).join("")}
          </div>
          <p class="field-error">${escapeHtml(state.errors.sex || "")}</p>
        </fieldset>

        <fieldset class="field-group compact-field-group">
          <legend class="field-label">Main unit</legend>
          ${unitOptions("mainUnit", state.dog.unit)}
        </fieldset>

        <div class="actions">
          <button class="button button-primary" type="submit">Start measuring <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </form>`;
}

function measurementCard(measurementIndex) {
  const measurement = MEASUREMENTS[measurementIndex];
  const record = state.measurements[measurement.slug];
  const selectedUnit = record.unit || state.dog.unit;

  return `
    <form class="step-card" id="measurement-form" novalidate>
      ${picture(measurement.slug, `Illustration showing how to measure: ${measurement.fullName}`, measurement.imageNumber)}
      <div class="step-content">
        <p class="step-kicker">MEASUREMENT ${measurementIndex + 1} OF ${MEASUREMENTS.length}</p>
        <h2 tabindex="-1">${escapeHtml(measurement.fullName)}</h2>
        <p class="card-subtitle">Use the highlighted points in the illustration, then enter the result below.</p>

        <label class="field-label" for="measurement-value">Measurement</label>
        <div class="measurement-input-row">
          <input
            class="number-input"
            id="measurement-value"
            name="measurementValue"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.0"
            value="${escapeHtml(record.value)}"
            aria-invalid="${Boolean(state.errors.measurement)}"
            aria-describedby="measurement-error"
            required
          >
          ${unitOptions("measurementUnit", selectedUnit)}
        </div>
        <p class="field-error" id="measurement-error">${escapeHtml(state.errors.measurement || "")}</p>

        <div class="actions split-actions">
          <button class="button button-secondary" type="button" data-action="back"><span aria-hidden="true">←</span> Back</button>
          <button class="button button-primary" type="submit">Continue <span aria-hidden="true">→</span></button>
        </div>
      </div>
    </form>`;
}

function reviewCard() {
  const rows = MEASUREMENTS.map((measurement, index) => {
    const record = state.measurements[measurement.slug];
    return `
      <div class="review-row">
        <div>
          <dt>${escapeHtml(measurement.fullName)}</dt>
          <dd>${escapeHtml(record.value)} ${escapeHtml(record.unit)}</dd>
        </div>
        <button class="edit-button" type="button" data-action="edit" data-step="${index + 1}" aria-label="Edit ${escapeHtml(measurement.fullName)}">Edit</button>
      </div>`;
  }).join("");

  return `
    <section class="review-card" aria-labelledby="review-title">
      <div class="review-header">
        <div>
          <p class="step-kicker">REVIEW</p>
          <h2 id="review-title" tabindex="-1">Check everything</h2>
          <p class="card-subtitle">Confirm the details below before adding your message and sending the request.</p>
        </div>
        <div class="dog-summary">
          <span class="dog-avatar" aria-hidden="true">${escapeHtml(state.dog.name.charAt(0).toUpperCase())}</span>
          <div><strong>${escapeHtml(state.dog.name)}</strong><span>${escapeHtml(state.dog.sex)} · main unit: ${escapeHtml(state.dog.unit)}</span></div>
          <button class="edit-button" type="button" data-action="edit" data-step="0">Edit</button>
        </div>
      </div>

      <dl class="review-list">${rows}</dl>
      <p class="form-error" role="alert">${escapeHtml(state.errors.form || "")}</p>
      <div class="actions split-actions review-actions">
        <button class="button button-secondary" type="button" data-action="back"><span aria-hidden="true">←</span> Back</button>
        <button class="button button-primary" type="button" data-action="confirm">Confirm &amp; continue <span aria-hidden="true">→</span></button>
      </div>
    </section>`;
}

function contactCard() {
  const isLoading = state.submission.status === "loading";
  const isConfigured = isLiveEmailConfigured();
  const needsVerification = !CONFIG.mockMode && !state.turnstileToken;
  const isEmail = state.customer.contactType === "email";

  return `
    <form class="review-card contact-card" id="contact-form" novalidate>
      <p class="step-kicker">FINAL STEP</p>
      <h2 tabindex="-1">Send your request</h2>
      <p class="card-subtitle">Add your contact details and an optional message. The completed CSV will be attached to the email.</p>

      <label class="field-label" for="name-input">Your name <span aria-hidden="true">*</span></label>
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
        aria-invalid="${Boolean(state.errors.contact)}"
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
            aria-invalid="${Boolean(state.errors.contact)}"
            ${isLoading ? "disabled" : ""}
          >
        </div>
      </div>

      <label class="field-label message-label" for="message-input">Message <span class="optional-label">Optional</span></label>
      <textarea
        class="text-input message-input"
        id="message-input"
        name="message"
        rows="4"
        maxlength="2000"
        placeholder="Add any details that may help us understand your request."
        ${isLoading ? "disabled" : ""}
      >${escapeHtml(state.customer.message)}</textarea>

      <p class="field-error" id="contact-error">${escapeHtml(state.errors.contact || "")}</p>
      ${CONFIG.mockMode ? "" : '<div class="turnstile-wrap" id="turnstile-container" aria-label="Security verification"></div>'}
      ${isConfigured ? "" : '<p class="configuration-note">Email delivery is not configured. Add the Worker URL and Turnstile site key in <code>js/config.js</code>.</p>'}
      <p class="submission-status" id="submission-status" role="status">${escapeHtml(state.submission.message)}</p>

      <div class="actions split-actions">
        <button class="button button-secondary" type="button" data-action="back" ${isLoading ? "disabled" : ""}><span aria-hidden="true">←</span> Back</button>
        <button class="button button-primary" id="send-csv-button" type="submit" ${isLoading || !isConfigured || needsVerification ? "disabled" : ""}>
          ${isLoading ? '<span class="spinner" aria-hidden="true"></span>Sending…' : 'Send request <span aria-hidden="true">→</span>'}
        </button>
      </div>
    </form>`;
}

function successCard() {
  const isMock = state.submission.result?.mode === "mock";
  return `
    <section class="success-card" aria-labelledby="success-title">
      <span class="success-icon" aria-hidden="true">✓</span>
      <p class="step-kicker">ALL DONE</p>
      <h2 id="success-title" tabindex="-1">Request sent</h2>
      <p class="card-subtitle">${isMock ? "The test submission was completed without sending a real email." : `Your message and ${escapeHtml(state.dog.name)}’s measurement CSV have been sent.`}</p>
      <p class="filename">${escapeHtml(createCsvFilename(state.dog))}</p>
      <div class="actions centered-actions">
        <button class="button button-secondary" type="button" data-action="edit" data-step="${REVIEW_STEP}">Review details</button>
        <button class="button button-primary" type="button" data-action="download">Download CSV <span aria-hidden="true">↓</span></button>
        <button class="button button-link" type="button" data-action="restart">Measure another dog</button>
      </div>
    </section>`;
}

function render({ focus = false } = {}) {
  removeTurnstileWidget();
  updateProgress();

  if (state.completed) {
    app.innerHTML = successCard();
  } else if (state.step === 0) {
    app.innerHTML = aboutCard();
  } else if (state.step <= MEASUREMENTS.length) {
    app.innerHTML = measurementCard(state.step - 1);
  } else if (state.step === REVIEW_STEP) {
    app.innerHTML = reviewCard();
  } else {
    app.innerHTML = contactCard();
  }

  if (!state.completed && state.step === CONTACT_STEP) renderTurnstileWidget();

  if (focus) {
    app.querySelector("h2")?.focus({ preventScroll: true });
    app.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function validateDog() {
  const errors = {};
  const name = state.dog.name.trim();

  if (!name) {
    errors.name = "Enter your dog’s name.";
  } else if (!/^\p{L}+$/u.test(name)) {
    errors.name = "Use letters only, without spaces or numbers.";
  }

  if (!state.dog.sex) errors.sex = "Choose your dog’s sex.";
  if (!["cm", "inch"].includes(state.dog.unit)) errors.unit = "Choose a unit.";
  return errors;
}

function isValidMeasurement(value) {
  const numericValue = Number(value);
  return value !== "" && Number.isFinite(numericValue) && numericValue > 0;
}

function allMeasurementsAreValid() {
  return MEASUREMENTS.every(({ slug }) => {
    const record = state.measurements[slug];
    return isValidMeasurement(record.value) && ["cm", "inch"].includes(record.unit);
  });
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

function saveAndDownload() {
  const csv = generateMeasurementsCsv(state.measurements, MEASUREMENTS, state.dog.unit);
  downloadCsv(csv, createCsvFilename(state.dog));
}

app.addEventListener("input", (event) => {
  if (event.target.matches("#dog-name")) state.dog.name = event.target.value;

  if (event.target.matches("#measurement-value")) {
    const measurement = MEASUREMENTS[state.step - 1];
    state.measurements[measurement.slug].value = event.target.value;
  }

  if (event.target.matches("#name-input")) state.customer.name = event.target.value;

  if (event.target.matches("#contact-input")) {
    const value = state.customer.contactType === "phone" ? formatPhone(event.target.value) : event.target.value;
    state.customer.contact = value;
    if (event.target.value !== value) event.target.value = value;
  }

  if (event.target.matches("#message-input")) state.customer.message = event.target.value;

  if (event.target.matches("input, textarea")) {
    event.target.setAttribute("aria-invalid", "false");
    state.errors = {};
    app.querySelectorAll(".field-error").forEach((error) => {
      error.textContent = "";
    });
  }
});

app.addEventListener("change", (event) => {
  if (event.target.name === "sex") state.dog.sex = event.target.value;
  if (event.target.name === "mainUnit") state.dog.unit = event.target.value;

  if (event.target.name === "measurementUnit") {
    const measurement = MEASUREMENTS[state.step - 1];
    state.measurements[measurement.slug].unit = event.target.value;
  }

  if (event.target.matches("#contact-type")) {
    state.customer.contactType = event.target.value;
    state.customer.contact = "";
    state.turnstileToken = "";
    state.submission = { status: "idle", message: "", result: null };
    state.errors = {};
    render({ focus: true });
    return;
  }

  state.errors = {};
  app.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });
});

app.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (event.target.id === "about-form") {
    state.dog.name = state.dog.name.trim();
    state.errors = validateDog();

    if (Object.keys(state.errors).length) {
      render();
      app.querySelector("[aria-invalid='true']")?.focus();
      return;
    }

    Object.values(state.measurements).forEach((record) => {
      if (!record.value) record.unit = state.dog.unit;
    });
    state.step = 1;
    render({ focus: true });
    return;
  }

  if (event.target.id === "measurement-form") {
    const measurement = MEASUREMENTS[state.step - 1];
    const record = state.measurements[measurement.slug];
    record.unit = event.target.elements.measurementUnit.value;

    if (!isValidMeasurement(record.value)) {
      state.errors = { measurement: "Enter a measurement greater than 0." };
      render();
      app.querySelector("#measurement-value")?.focus();
      return;
    }

    state.errors = {};
    state.step += 1;
    render({ focus: true });
    return;
  }

  if (event.target.id === "contact-form") {
    state.customer.name = event.target.elements.name.value.trim();
    state.customer.contact = event.target.elements.contact.value.trim();
    state.customer.message = event.target.elements.message.value.trim();
    const customerError = validateCustomer();
    state.errors = customerError ? { contact: customerError } : {};

    if (!CONFIG.mockMode && !state.turnstileToken) {
      state.errors.contact = state.errors.contact || "Complete the security verification before sending.";
    }

    if (state.errors.contact) {
      render();
      app.querySelector("[aria-invalid='true']")?.focus();
      return;
    }

    state.submission = { status: "loading", message: "Sending your request…", result: null };
    render();

    try {
      const filename = createCsvFilename(state.dog);
      const csv = generateMeasurementsCsv(state.measurements, MEASUREMENTS, state.dog.unit);
      const result = await sendCsv({
        customer: state.customer,
        csv,
        filename,
        turnstileToken: state.turnstileToken,
        config: CONFIG
      });
      state.submission = { status: "success", message: "", result };
      state.completed = true;
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
  const control = event.target.closest("[data-action]");
  if (!control) return;

  const action = control.dataset.action;

  if (action === "back") {
    state.errors = {};
    state.turnstileToken = "";
    state.submission = { status: "idle", message: "", result: null };
    state.step = Math.max(0, state.step - 1);
    render({ focus: true });
  }

  if (action === "edit") {
    state.errors = {};
    state.completed = false;
    state.step = Number(control.dataset.step);
    render({ focus: true });
  }

  if (action === "confirm") {
    if (!allMeasurementsAreValid() || Object.keys(validateDog()).length) {
      state.errors = { form: "Some required details are missing or invalid. Please review your entries." };
      state.step = REVIEW_STEP;
      render({ focus: true });
      return;
    }

    state.errors = {};
    state.step = CONTACT_STEP;
    render({ focus: true });
  }

  if (action === "download") saveAndDownload();

  if (action === "restart") {
    state = createInitialState();
    render({ focus: true });
  }
});

render();
