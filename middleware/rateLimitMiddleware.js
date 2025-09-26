const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const transferRateLimit = rateLimit({
  windowMs: 2 * 60 * 1000,
  max: 2,
  message: {
    success: false,
    message: 'Too many transfer completion attempts. Please wait 2 minutes before trying again.',
    rateLimited: true
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req);
    const key = `${ip}_${req.body.reference || 'no-ref'}`;
    console.log(`[RATE_LIMIT_MIDDLEWARE] Generated key: ${key} for IP: ${ip}, Reference: ${req.body.reference}`);
    return key;
  },
  skip: (req) => {
    const shouldSkip = !req.body.reference;
    console.log(`[RATE_LIMIT_MIDDLEWARE] Skip: ${shouldSkip}, Reference: ${req.body.reference}`);
    return shouldSkip;
  },
  handler: (req, res) => {
    console.log(`[RATE_LIMIT_MIDDLEWARE] Rate limit exceeded for key: ${req.rateLimit.key}`);
    res.status(429).json({
      success: false,
      message: 'Too many transfer completion attempts. Please wait 2 minutes before trying again.',
      rateLimited: true,
      rateLimitType: 'middleware'
    });
  }
});

const paymentRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many payment requests. Please wait before trying again.',
    rateLimited: true
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  transferRateLimit,
  paymentRateLimit
};
