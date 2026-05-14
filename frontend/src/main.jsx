import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SimProvider } from './store/SimContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SimProvider>
        <App />
      </SimProvider>
    </BrowserRouter>
  </React.StrictMode>
);
