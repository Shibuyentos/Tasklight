import { render } from 'solid-js/web';
import App from './App';
import './ui/tokens.css';
import './ui/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado em index.html');

render(() => <App />, root);
