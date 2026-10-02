const rateLimit = require('express-rate-limit');

// Brute-force/OTP-guessing protection for auth endpoints that are otherwise
// unthrottled. Each call site gets its OWN independent budget per IP — a
// shared single instance across routes would mean a legitimate user's
// register -> verify-OTP -> (later) forgot-password flow could burn through
// one combined allowance instead of each action having its own.
function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
  });
}

module.exports = { createAuthRateLimiter };
