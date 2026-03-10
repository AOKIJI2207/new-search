function parseNumericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCurrencyCompact(value) {
  const amount = parseNumericValue(value);
  if (amount === null) {
    return "n/a";
  }

  const absolute = Math.abs(amount);
  if (absolute >= 1e12) {
    return `$${(amount / 1e12).toFixed(2)}T`;
  }
  if (absolute >= 1e9) {
    return `$${(amount / 1e9).toFixed(2)}B`;
  }
  if (absolute >= 1e6) {
    return `$${(amount / 1e6).toFixed(2)}M`;
  }

  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

export function formatCurrency(value, { maximumFractionDigits = 0 } = {}) {
  const amount = parseNumericValue(value);
  if (amount === null) {
    return "n/a";
  }

  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  })}`;
}

export function formatPercent(value, digits = 1) {
  const amount = parseNumericValue(value);
  if (amount === null) {
    return "n/a";
  }

  return `${amount.toFixed(digits)}%`;
}

export function formatDecimal(value, digits = 2) {
  const amount = parseNumericValue(value);
  if (amount === null) {
    return "n/a";
  }

  return amount.toFixed(digits);
}

export function formatScore(value, max = 5) {
  const amount = parseNumericValue(value);
  if (amount === null) {
    return "n/a";
  }

  return `${amount}/${max}`;
}

export function riskScoreLabel(score) {
  const amount = parseNumericValue(score);
  if (amount === null) {
    return "unclear";
  }
  if (amount <= 1.5) {
    return "contained";
  }
  if (amount <= 2.5) {
    return "guarded";
  }
  if (amount <= 3.5) {
    return "mixed";
  }
  if (amount <= 4.5) {
    return "elevated";
  }
  return "severe";
}

function growthLabel(value) {
  if (value === null) {
    return "uncertain";
  }
  if (value < 0.5) {
    return "very weak";
  }
  if (value <= 2) {
    return "moderate";
  }
  return "solid";
}

function inflationLabel(value) {
  if (value === null) {
    return "uncertain";
  }
  if (value < 2) {
    return "contained";
  }
  if (value <= 4) {
    return "moderate";
  }
  return "elevated";
}

export function generateCountrySummary(profile) {
  if (!profile?.name || !profile?.key_data) {
    return "Short-term economic signals are currently unavailable.";
  }

  const growth = parseNumericValue(profile.key_data.growth);
  const inflation = parseNumericValue(profile.key_data.inflation);
  const unemployment = parseNumericValue(profile.key_data.unemployment);
  const risk = riskScoreLabel(profile.risk_global);

  return `${profile.name} shows ${growthLabel(growth)} economic momentum with GDP growth at ${formatPercent(growth)}. Inflation remains ${inflationLabel(inflation)} at ${formatPercent(inflation)}. Unemployment stands at ${formatPercent(unemployment)}. Overall signals for the short-term outlook are ${risk}.`;
}
