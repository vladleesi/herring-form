const MOCK_DELAY_MS = 900;

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

export async function sendCsv({ customer, csv, filename, turnstileToken, config }) {
  if (config.mockMode) {
    await wait(MOCK_DELAY_MS);
    return { delivered: false, mode: "mock" };
  }

  const csvFile = new File([csv], filename || "measurements.csv", {
    type: "text/csv;charset=utf-8"
  });
  const body = new FormData();

  body.append("name", customer.name);
  body.append("contactType", customer.contactType);
  body.append("contact", customer.contact);
  body.append("message", customer.message);
  body.append("file", csvFile);
  body.append("turnstileToken", turnstileToken);

  const response = await fetch(config.apiUrl, {
    method: "POST",
    body
  });

  if (!response.ok) {
    let message = "The request could not be sent. Please try again.";

    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // Keep the safe fallback message for non-JSON error responses.
    }

    throw new Error(message);
  }

  return { delivered: true, mode: "live" };
}
