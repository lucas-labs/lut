import { onWindowFocusChanged } from '@/modules/platform';
import { useEffect, useState } from 'react';

export function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(() =>
    typeof document !== 'undefined' ? document.hasFocus() : true,
  );

  useEffect(() => onWindowFocusChanged(setFocused), []);

  return focused;
}
