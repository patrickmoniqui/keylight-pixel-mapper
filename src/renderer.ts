import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(createElement(App));
}
