/**
 * Utility controller – categories and currency helpers.
 */
const expenseService = require('../services/expense.service');
const currencyService = require('../services/currency.service');
const { success, error } = require('../utils/apiResponse');

/**
 * GET /api/categories – list all active expense categories.
 */
async function getCategories(req, res) {
  try {
    const categories = await expenseService.listCategories();
    return success(res, categories, 'Categories retrieved successfully');
  } catch (err) {
    console.error('getCategories error:', err);
    return error(res, err.message, 500);
  }
}

/**
 * GET /api/currencies – list all world currencies sourced from restcountries.
 */
async function getCurrencies(req, res) {
  try {
    const currencies = await currencyService.listCurrencies();
    return success(res, currencies, 'Currencies retrieved successfully');
  } catch (err) {
    console.error('getCurrencies error:', err);
    return error(res, err.message, 500);
  }
}

/**
 * GET /api/currencies/convert?from=&to=&amount= – convert currency.
 */
async function convertCurrency(req, res) {
  try {
    const { from, to, amount } = req.query;
    const result = await currencyService.convert(from, to, parseFloat(amount));
    return success(res, {
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      originalAmount: parseFloat(amount),
      ...result,
    }, 'Currency converted successfully');
  } catch (err) {
    console.error('convertCurrency error:', err);
    return error(res, err.message, 500);
  }
}

module.exports = { getCategories, getCurrencies, convertCurrency };
