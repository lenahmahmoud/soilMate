import * as authService from '../services/authService.js';
import { claimGuestFromRequest } from '../services/guestService.js';
import { logger } from '../config/logger.js';

export async function signup(req, res) {
  const result = await authService.signup(req.body);
  const guestData = await claimGuestFromRequest(req, result.user.id);
  res.status(201).json(guestData ? { ...result, guestData } : result);
}

export async function login(req, res) {
  const result = await authService.login(req.body);
  const guestData = await claimGuestFromRequest(req, result.user.id);
  res.json(guestData ? { ...result, guestData } : result);
}

// Stateless: the frontend deletes its token.
export function logout(req, res) {
  res.status(204).end();
}

// Stub until an email service exists. Same answer whether the email exists or not.
export function forgotPassword(req, res) {
  logger.info('Password reset requested'); // no email in the log
  res.json({ message: 'If this email is registered, you will receive reset instructions.' });
}