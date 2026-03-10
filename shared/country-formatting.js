import { DATA_UNAVAILABLE, parseCountryMetric } from "./country-profile.js";

function parseNumericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return parseCountryMetric(value);
}

export function formatCurrencyCompact(value) {
  const amount = parseNumericValue(value);
  if (amount === null) {
    return DATA_UNAVAILABLE;
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

export function formatCurrencyStandard(value, { maximumFractionDigits = 0 } = {}) {
  const amount = parseNumericValue(value);
  if (amount === null) {
    return DATA_UNAVAILABLE;
  }

  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  })}`;
}

export function formatPercent(value, digits = 1) {
  const amount = parseNumericValue(value);
  if (amount === null) {
    return DATA_UNAVAILABLE;
  }

  return `${amount.toFixed(digits)}%`;
}

export function formatDecimal(value, digits = 2) {
  const amount = parseNumericValue(value);
  if (amount === null) {
    return DATA_UNAVAILABLE;
  }

  return amount.toFixed(digits);
}

export function formatScore(value, max = 5) {
  const amount = parseNumericValue(value);
  if (amount === null) {
    return DATA_UNAVAILABLE;
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
  const metrics = profile?.metrics || profile?.key_data;
  if (!profile?.name || !metrics) {
    return "Reliable macroeconomic indicators are currently unavailable.";
  }

  const growth = parseNumericValue(metrics.growth);
  const inflation = parseNumericValue(metrics.inflation);
  const unemployment = parseNumericValue(metrics.unemployment);
  const risk = riskScoreLabel(profile?.risk?.global ?? profile?.risk_global);

  if ([growth, inflation, unemployment].every((value) => value === null)) {
    return `${profile.name} has no fully sourced short-term macro snapshot available at the moment.`;
  }

  if ([growth, inflation, unemployment].some((value) => value === null)) {
    const partial = [];
    if (growth !== null) {
      partial.push(`GDP growth is ${formatPercent(growth)}`);
    }
    if (inflation !== null) {
      partial.push(`inflation is ${formatPercent(inflation)}`);
    }
    if (unemployment !== null) {
      partial.push(`unemployment is ${formatPercent(unemployment)}`);
    }
    return `${profile.name} has a partial sourced macro snapshot: ${partial.join(", ")}.`;
  }

  return `${profile.name} shows ${growthLabel(growth)} economic momentum with GDP growth at ${formatPercent(growth)}. Inflation remains ${inflationLabel(inflation)} at ${formatPercent(inflation)}. Unemployment stands at ${formatPercent(unemployment)}. Overall signals for the short-term outlook are ${risk}.`;
}

export const formatCurrency = formatCurrencyStandard;
