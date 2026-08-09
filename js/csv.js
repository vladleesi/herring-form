function escapeCsvValue(value) {
  const text = String(value ?? "");

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function generateMeasurementsCsv(measurements, customer = {}) {
  const rows = [
    ["field", "value", "unit"],
    ["name", customer.name || "", ""],
    ["contact_type", customer.contactType || "", ""],
    ["contact", customer.contact || "", ""],
    ["message", customer.message || "", ""],
    ["length", measurements.length, "cm"],
    ["width", measurements.width, "cm"],
    ["height", measurements.height, "cm"]
  ];

  return rows
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n");
}

export function downloadCsv(csv, filename = "measurements.csv") {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
