import { ensureNotificationPermission } from '@/modules/platform';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { playAgentNotificationSound } from './sound';

export type OsNotificationResult = 'requested' | 'denied' | 'failed';

export async function osNotify(title: string, body: string): Promise<OsNotificationResult> {
  try {
    if (!(await ensureNotificationPermission())) return 'denied';
    sendNotification({ title, body });
    return 'requested';
  } catch (e) {
    console.warn('[lut] os notification failed:', e);
    return 'failed';
  }
}

export async function testAgentOsNotification(withSound = true): Promise<OsNotificationResult> {
  const result = await osNotify(
    'lut notifications are working',
    'You will be notified when an agent needs your attention.',
  );
  if (result === 'requested' && withSound) playAgentNotificationSound();
  return result;
}
