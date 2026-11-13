import '../styles/globals.css';

import { initWindowFrame, showHiddenWindow } from '@/modules/platform';
import { ThemeProvider } from '@/modules/theme';
import ReactDOM from 'react-dom/client';
import { SettingsApp } from './SettingsApp';

initWindowFrame();

ReactDOM.createRoot(document.getElementById('settings-root') as HTMLElement).render(
  <ThemeProvider>
    <SettingsApp />
  </ThemeProvider>,
);

showHiddenWindow('settings show');
