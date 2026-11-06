import * as authService from '../services/authService.js';
import { logger } from '../config/logger.js';

export async function signup(req, res) {
  res.status(201).json(await authService.signup(req.body));
}

export async function login(req, res) {
  res.json(await authService.login(req.body));
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