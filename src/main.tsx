import './styles/globals.css';

import ReactDOM from 'react-dom/client';
import App from './app/App';
import { bootstrap } from './app/bootstrap';

await bootstrap(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
});
