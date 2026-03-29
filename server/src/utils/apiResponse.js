/**
 * Standardised API response helpers.
 * Every controller should use these instead of raw res.json().
 */

/**
 * Send a success response.
 * @param {import('express').Response} res
 * @param {object|null} data    – payload
 * @param {string}      message – human-readable message
 * @param {number}      status  – HTTP status code (default 200)
 */
const success = (res, data = null, message = 'Success', status = 200) => {
  return res.status(status).json({
    success: true,
    data,
    message,
  });
};

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {string} error   – error description
 * @param {number} code    – HTTP status code (default 500)
 */
const error = (res, error = 'Internal server error', code = 500) => {
  return res.status(code).json({
    success: false,
    error,
    code,
  });
};

module.exports = { success, error };
