import { formatCurrency, formatDecimal, formatPercent, formatScore } from "../shared/country-formatting.js";

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angle = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}

export function renderRadarChart(barometer) {
  const entries = Object.entries(barometer);
  const cx = 150;
  const cy = 150;
  const radius = 96;
  const rings = [1, 2, 3, 4, 5].map((ring) => {
    const ringRadius = (radius / 5) * ring;
    const points = entries
      .map((_, index) => {
        const point = polarToCartesian(cx, cy, ringRadius, (360 / entries.length) * index);
        return `${point.x},${point.y}`;
      })
      .join(" ");
    return `<polygon points="${points}" fill="none" stroke="rgba(83,96,109,0.18)" stroke-width="1" />`;
  });

  const axes = entries
    .map((_, index) => {
      const end = polarToCartesian(cx, cy, radius, (360 / entries.length) * index);
      return `<line x1="${cx}" y1="${cy}" x2="${end.x}" y2="${end.y}" stroke="rgba(83,96,109,0.2)" stroke-width="1" />`;
    })
    .join("");

  const valuePoints = entries
    .map(([_, value], index) => {
      const point = polarToCartesian(cx, cy, (radius / 5) * value, (360 / entries.length) * index);
      return `${point.x},${point.y}`;
    })
    .join(" ");

  const labels = entries
    .map(([key], index) => {
      const point = polarToCartesian(cx, cy, radius + 26, (360 / entries.length) * index);
      return `<text x="${point.x}" y="${point.y}" text-anchor="middle" font-size="11" fill="#53606d">${key.replace(/_/g, " ")}</text>`;
    })
    .join("");

  return `
    <svg viewBox="0 0 300 300" class="chart-svg" aria-label="Risk radar chart">
      ${rings.join("")}
      ${axes}
      <polygon points="${valuePoints}" fill="rgba(15,118,110,0.22)" stroke="#0f766e" stroke-width="2" />
      ${labels}
    </svg>
  `;
}

export function renderBarChart(items, valueKey, labelKey, modifier = "") {
  const max = Math.max(...items.map((item) => item[valueKey]), 1);
  return `
    <div class="bar-chart ${modifier}">
      ${items
        .map(
          (item) => `
            <div class="bar-row">
              <span>${item[labelKey]}</span>
              <div class="bar-track">
                <div class="bar-fill" style="width:${(item[valueKey] / max) * 100}%"></div>
              </div>
              <strong>${item[valueKey]}</strong>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderComparisonChart(countries) {
  const rows = [
    { label: "Risk Index", key: "synthetic_index", format: (v) => v.toFixed(2) },
    { label: "Global Risk", key: "risk_global", format: (v) => formatScore(v) },
    { label: "GDP per capita", key: "gdp_per_capita", format: (v) => formatCurrency(v) },
    { label: "HDI", key: "hdi", format: (v) => formatDecimal(v, 3) },
    { label: "Unemployment", key: "unemployment", format: (v) => formatPercent(v) }
  ];

  return `
    <div class="comparison-table">
      <div class="comparison-header">
        <span>Metric</span>
        ${countries.map((country) => `<strong>${country.name}</strong>`).join("")}
      </div>
      ${rows
        .map(
          (row) => `
            <div class="comparison-line">
              <span>${row.label}</span>
              ${countries.map((country) => `<strong>${row.format(country[row.key])}</strong>`).join("")}
            </div>
          `
        )
        .join("")}
    </div>
  `;
}
