import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { ToastProvider } from '@/ui/toast';
import { AuthProvider } from '@/app/auth';
import App from '@/App';
import { ErrorBoundary, UpdateBanner, reloadOnce } from '@/app/recovery';
import './index.css';

// A tab left open across an update asks for page files that no longer exist: reload onto the new version.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ErrorBoundary full>
            <ToastProvider>
              <AuthProvider>
                <App />
                <UpdateBanner />
              </AuthProvider>
            </ToastProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
