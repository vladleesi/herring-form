function escapeCsvValue(value) {
  const text = String(value ?? "");

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function generateMeasurementsCsv(measurements, definitions, mainUnit) {
  const rows = [
    ["Name", `Calculated value (${mainUnit})`, "Full name", `Formula (${mainUnit})`],
    ...definitions.map(({ name, slug, fullName }) => [
      name,
      measurements[slug].value,
      fullName,
      ""
    ])
  ];

  return rows
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n");
}

export function createCsvFilename(dog, date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${dog.name}_${dog.sex}_${year}${month}${day}.csv`;
}

export function downloadCsv(csv, filename) {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
