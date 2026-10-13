import { render } from 'preact';
import { App } from './app/App';
import { boot } from './app/boot';
import { registerServiceWorker } from './services/sw';
import '@styles/global.scss';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

// Theme was already applied by the inline script in index.html (no flash).
render(<App />, root);
void boot();
void registerServiceWorker();
