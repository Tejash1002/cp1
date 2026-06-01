import * as userService from '../services/userService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const profile = asyncHandler(async (req, res) => {
  const user = await userService.getProfile(req.params.id);
  res.json({ user });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateMe(req.user, req.body);
  res.json({ user });
});

export const activity = asyncHandler(async (req, res) => {
  const result = await userService.getActivity(req.user, req.query.limit);
  res.json(result);
});

export const requestModerator = asyncHandler(async (req, res) => {
  res.json(await userService.requestModerator(req.user));
});
