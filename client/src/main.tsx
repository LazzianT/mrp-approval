import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ApprovePage } from './pages/ApprovePage';
import { StateMessage } from './components/StateMessage';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Elemen #root tidak ditemukan di index.html');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/approve" element={<ApprovePage />} />
          <Route
            path="*"
            element={
              <div className="min-h-screen bg-slate-50 p-4">
                <StateMessage
                  tone="info"
                  title="Halaman tidak ditemukan"
                  description="Buka tautan approval yang Anda terima melalui WhatsApp."
                />
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);