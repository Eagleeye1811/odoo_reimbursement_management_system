const express = require('express');
const router = express.Router();
const utilityController = require('../controllers/utility.controller');
const validate = require('../middlewares/validate');

// Get categories
router.get('/categories', utilityController.getCategories);

// Get currencies
router.get('/currencies', utilityController.getCurrencies);

// Convert currency
router.get('/currencies/convert', validate.convertQueryRules, utilityController.convertCurrency);

module.exports = router;
