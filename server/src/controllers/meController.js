import * as userService from '../services/userService.js';

export async function getMe(req, res) {
  res.json(await userService.getMe(req.user.id));
}

export async function updateMe(req, res) {
  res.json(await userService.updateMe(req.user.id, req.body));
}

export async function changePassword(req, res) {
  await userService.changePassword(req.user.id, req.body);
  res.status(204).end();
}

export async function deleteMe(req, res) {
  await userService.deleteAccount(req.user.id, req.body);
  res.status(204).end();
}