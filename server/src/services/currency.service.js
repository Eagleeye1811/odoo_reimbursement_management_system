/**
 * Currency service – handles live exchange-rate lookups and country currency lists.
 */
const axios = require('axios');

const EXCHANGE_API = 'https://api.exchangerate-api.com/v4/latest';
const COUNTRIES_API = 'https://restcountries.com/v3.1/all?fields=name,currencies';

// Simple in-memory cache (rate → 10 min TTL, countries → 1 h)
let rateCache = {};          // { "USD": { rates: {…}, fetchedAt } }
let countryCurrencyCache = null;
let countryCacheFetchedAt = 0;

const RATE_TTL = 10 * 60 * 1000;       // 10 minutes
const COUNTRY_TTL = 60 * 60 * 1000;    // 1 hour

/**
 * Fetch live exchange rates for a given base currency.
 * @param {string} base – ISO 4217 currency code (e.g. "USD")
 * @returns {Promise<object>} – { base, rates: { INR: 83.5, … } }
 */
async function getRates(base) {
  const upper = base.toUpperCase();
  const cached = rateCache[upper];
  if (cached && Date.now() - cached.fetchedAt < RATE_TTL) {
    return cached.data;
  }

  const { data } = await axios.get(`${EXCHANGE_API}/${upper}`);
  rateCache[upper] = { data, fetchedAt: Date.now() };
  return data;
}

/**
 * Convert an amount from one currency to another.
 * @param {string} from   – source currency code
 * @param {string} to     – target currency code
 * @param {number} amount – amount in source currency
 * @returns {Promise<{ convertedAmount: number, rate: number }>}
 */
async function convert(from, to, amount) {
  const fromUpper = from.toUpperCase();
  const toUpper = to.toUpperCase();

  if (fromUpper === toUpper) {
    return { convertedAmount: parseFloat(amount), rate: 1 };
  }

  const data = await getRates(fromUpper);
  const rate = data.rates[toUpper];
  if (!rate) {
    throw new Error(`Unsupported target currency: ${toUpper}`);
  }
  const convertedAmount = parseFloat((amount * rate).toFixed(2));
  return { convertedAmount, rate };
}

/**
 * Fetch a deduplicated list of world currencies with their countries.
 * @returns {Promise<Array<{ code: string, name: string, symbol: string, countries: string[] }>>}
 */
async function listCurrencies() {
  if (countryCurrencyCache && Date.now() - countryCacheFetchedAt < COUNTRY_TTL) {
    return countryCurrencyCache;
  }

  const { data: countries } = await axios.get(COUNTRIES_API);

  const currencyMap = {};
  for (const country of countries) {
    if (!country.currencies) continue;
    for (const [code, info] of Object.entries(country.currencies)) {
      if (!currencyMap[code]) {
        currencyMap[code] = {
          code,
          name: info.name || code,
          symbol: info.symbol || '',
          countries: [],
        };
      }
      currencyMap[code].countries.push(country.name?.common || '');
    }
  }

  const list = Object.values(currencyMap).sort((a, b) => a.code.localeCompare(b.code));
  countryCurrencyCache = list;
  countryCacheFetchedAt = Date.now();
  return list;
}

module.exports = { convert, listCurrencies, getRates };
