import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { EmployeeAuthProvider } from './context/EmployeeAuthContext';
import { ToastProvider } from './components/ui';
import { ThemeApplier } from './components/ThemeApplier';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AdminAuthProvider>
          <EmployeeAuthProvider>
            <ThemeApplier />
            <App />
          </EmployeeAuthProvider>
        </AdminAuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
