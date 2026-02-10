import fs from 'fs/promises';

const thresholds = {
  Europe: 40,
  Afrique: 50,
  Asie: 40,
  'Amérique du Nord': 20,
  'Amérique du Sud': 10,
  'Océanie': 10
};

const raw = await fs.readFile(new URL('../assets/countries.json', import.meta.url), 'utf-8');
const data = JSON.parse(raw);
const countries = Array.isArray(data.countries) ? data.countries : [];

const counts = Object.keys(thresholds).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
for (const c of countries) {
  if (c?.continent in counts) counts[c.continent] += 1;
}

const failures = Object.entries(thresholds)
  .filter(([continent, min]) => counts[continent] <= min)
  .map(([continent, min]) => `${continent}=${counts[continent]} (attendu > ${min})`);

if (failures.length) {
  throw new Error(`countries.json ne respecte pas les seuils: ${failures.join(', ')}`);
}

console.log('OK continents thresholds', counts);
