import { isTrueValue } from '../attendanceLogic.mjs';

export function faceLabAllowed({ enabled, user }) {
  return enabled === 'true' && user?.role === 'admin' && isTrueValue(user.active);
}
