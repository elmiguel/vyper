import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Note: StrictMode is intentionally omitted — its double-invoked effects would
// create/dispose the Babylon WebGL engine twice on mount.
createRoot(document.getElementById('root')!).render(<App />);
