import rateLimit from 'express-rate-limit';
function clientIp(req) {
    const forwarded = req.header('x-forwarded-for');
    if (forwarded)
        return forwarded.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
    return req.ip ?? 'unknown';
}
function authedKey(req, salt) {
    const id = req.auth?.accountId ?? clientIp(req);
    return `${salt}:${id}`;
}
const baseOptions = {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } },
};
export const loginLimiter = rateLimit({
    ...baseOptions,
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
        return `login:${clientIp(req)}:${email}`;
    },
});
export const registrationLimiter = rateLimit({
    ...baseOptions,
    windowMs: 60 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => `register:${clientIp(req)}`,
});
export const emergencyCreateLimiter = rateLimit({
    ...baseOptions,
    windowMs: 60 * 1000,
    limit: 10,
    keyGenerator: (req) => authedKey(req, 'emergency'),
});
// The incident channel. Generous enough that someone adding "gate is locked"
// then "we moved to the roof" is never blocked, tight enough that a stuck
// finger cannot bury the dispatcher's notification list mid-incident. Its own
// key salt keeps it out of the budget for raising a fresh alert.
//
// A resident is talking about one emergency; a responder or a dispatcher may be
// working several at once, tapping one-line updates on each, so they get more
// room before the same stuck-finger ceiling applies.
export const emergencyMessageLimiter = rateLimit({
    ...baseOptions,
    windowMs: 60 * 1000,
    limit: (req) => (req.auth?.role === 'user' ? 12 : 40),
    keyGenerator: (req) => authedKey(req, 'emergency-message'),
});
// The panic button streams a fix roughly every 10 s for as long as its incident
// stays open, and retries after a dropped cellular connection arrive in bursts.
// This gets its own key salt so a long GPS stream can never exhaust the budget
// the same account needs to raise a fresh alert.
export const deviceLocationLimiter = rateLimit({
    ...baseOptions,
    windowMs: 60 * 1000,
    limit: 60,
    keyGenerator: (req) => authedKey(req, 'device-location'),
});
export const ambulanceRequestLimiter = rateLimit({
    ...baseOptions,
    windowMs: 60 * 1000,
    limit: 6,
    keyGenerator: (req) => authedKey(req, 'ambulance'),
});
export const ambulanceAvailabilityLimiter = rateLimit({
    ...baseOptions,
    windowMs: 60 * 1000,
    limit: 60,
    keyGenerator: (req) => authedKey(req, 'ambulance-avail'),
});
export const fileUploadLimiter = rateLimit({
    ...baseOptions,
    windowMs: 60 * 60 * 1000,
    limit: 20,
    keyGenerator: (req) => authedKey(req, 'upload'),
});
export const refreshTokenLimiter = rateLimit({
    ...baseOptions,
    windowMs: 60 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) => `refresh:${req.auth?.accountId ?? clientIp(req)}:${clientIp(req)}`,
});
export const adminActionLimiter = rateLimit({
    ...baseOptions,
    windowMs: 60 * 1000,
    limit: 60,
    keyGenerator: (req) => authedKey(req, 'admin'),
});
