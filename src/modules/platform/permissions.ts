import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

let notificationsGranted = false;

/**
 * Whether lut may show OS notifications, asking the user the first time. Only a grant is remembered, so a later call
 * sees the user allowing them in the OS settings after a denial.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (notificationsGranted) return true;
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === 'granted';
  notificationsGranted = ok;
  return ok;
}
