import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { signToken, cookieOptions, COOKIE_NAME } from '../utils/jwt.js';

/**
 * Strip sensitive/internal fields before returning a user to the client.
 * `select('-password')` already removes the hash; this is a defensive shape.
 */
const toPublicUser = (user) => {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  return obj;
};

/**
 * POST /api/auth/login
 * Authenticates by email + password, issues a JWT in an HTTP-only cookie.
 * US 1.1: invalid credentials always return a generic 401 (no user enumeration).
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Password is select:true in the schema, so it's available here.
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  const genericError = new ApiError(401, 'Invalid email or password');
  if (!user) throw genericError;

  const matches = await user.comparePassword(password);
  if (!matches) throw genericError;

  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated. Contact your administrator.');
  }

  user.lastLogin = new Date();
  await user.save();

  const token = signToken(user);
  res.cookie(COOKIE_NAME(), token, cookieOptions());

  res.status(200).json({
    success: true,
    message: 'Logged in successfully',
    user: toPublicUser(user)
  });
});

/**
 * POST /api/auth/logout
 * Clears the auth cookie. Idempotent — safe to call when already logged out.
 */
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie(COOKIE_NAME(), { ...cookieOptions(), maxAge: undefined });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user (set by verifyToken).
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: toPublicUser(req.user) });
});
