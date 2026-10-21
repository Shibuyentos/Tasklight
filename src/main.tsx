import { render } from 'solid-js/web';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado em index.html');

render(() => <App />, root);
