/**
 * OCR service – uses Tesseract.js to extract text from a receipt image
 * and then parses the raw text into structured expense fields.
 */
const Tesseract = require('tesseract.js');

const { Mistral } = require('@mistralai/mistralai');

/**
 * Run OCR on an image buffer or URL and return raw text.
 * @param {string|Buffer} imageSource – URL or Buffer of the receipt image
 * @returns {Promise<string>} – raw extracted text
 */
async function extractText(imageSource) {
  const { data: { text } } = await Tesseract.recognize(imageSource, 'eng', {
    logger: () => {},   // suppress progress logs
  });
  return text;
}

/**
 * Passes the raw Tesseract OCR string to Mistral AI to extract structured data flawlessly.
 * @param {string} text - Raw OCR output
 * @returns {Promise<{ amount: number|null, currency: string|null, date: string|null, description: string|null, vendor: string|null, category: string|null }>}
 */
async function llmParseReceiptText(text) {
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error("MISTRAL_API_KEY is missing from your .env file.");
  }

  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  
  const prompt = `
You are an expert financial receipt parser. Read the following raw extracted text and extract these fields: 
- amount (number only, the grand total)
- currency (3-letter ISO code like USD, EUR, INR, GBP)
- date (YYYY-MM-DD format if possible, otherwise string)
- vendor (string, the name of the store or company)
- description (short 3-5 word string describing the purchase generally)
- category (Choose exactly one: Meals, Travel, Software, Office, Miscellaneous)

Return ONLY a valid JSON object matching this structure exactly, with no additional text or markdown formatting:
{
  "amount": 0.00,
  "currency": "USD",
  "date": "2024-01-01",
  "vendor": "Uber",
  "description": "City transit",
  "category": "Travel"
}

Receipt Text:
${text}
`;

  try {
    const chatResponse = await client.chat.complete({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: prompt }],
      responseFormat: { type: 'json_object' }
    });

    const jsonStr = chatResponse.choices[0].message.content;
    const parsed = JSON.parse(jsonStr);
    
    // Safety fallback parsing for amount if Mistral returned a string like "$10.00"
    if (typeof parsed.amount === 'string') {
       parsed.amount = parseFloat(parsed.amount.replace(/[^0-9.]/g, ''));
    }

    return {
      amount: parsed.amount || null,
      currency: parsed.currency || 'INR', // Default to UI fallback
      date: parsed.date || null,
      vendor: parsed.vendor || null,
      description: parsed.description || null,
      category: parsed.category || 'Miscellaneous'
    };
  } catch (err) {
    console.error("Mistral Parsing Failed:", err);
    throw new Error("Unable to parse receipt with Mistral AI.");
  }
}

/**
 * Full pipeline: run OCR on an image and return parsed fields.
 * @param {string|Buffer} imageSource
 * @returns {Promise<{ amount: number|null, currency: string|null, date: string|null, description: string|null, vendor: string|null, category: string|null, rawText: string }>}
 */
async function processReceipt(imageSource) {
  const rawText = await extractText(imageSource);
  const parsed = await llmParseReceiptText(rawText);
  return { ...parsed, rawText };
}

module.exports = { processReceipt, extractText, llmParseReceiptText };
