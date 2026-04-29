const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET is not configured (set a long random value in .env)');
  }
  return secret;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, name: user.full_name },
    getSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

// Express middleware — requires a valid Bearer token.
function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return next(new ApiError(401, 'Missing or invalid Authorization header'));

  try {
    const payload = verifyToken(match[1]);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      name: payload.name,
    };
    next();
  } catch (err) {
    next(new ApiError(401, 'Invalid or expired token'));
  }
}

// Returns middleware that checks the user has one of the allowed roles.
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Not authenticated'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, `Forbidden: requires role ${roles.join(' or ')}`));
    }
    next();
  };
}

module.exports = { signToken, verifyToken, requireAuth, requireRole };
