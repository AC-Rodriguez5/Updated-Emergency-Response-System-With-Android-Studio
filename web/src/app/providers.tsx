import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RealtimeProvider } from '@/features/realtime/RealtimeProvider';
import { NotificationProvider } from '@/features/notifications/NotificationProvider';
import { NotificationToasts } from '@/features/notifications/NotificationToasts';
import { MotionConfig } from 'motion/react';

/*
  This is a live operations console, so nothing here is cached for being recent.

  `staleTime: 30_000` meant an invalidation raised by a socket event could be
  answered out of the cache, and `refetchOnWindowFocus: false` meant a dispatcher
  coming back to the tab read whatever was on screen when they left it. Both are
  sensible defaults for a content site and wrong for a page whose job is to say
  what is happening right now. `RealtimeProvider` drives the refetches off the
  event stream; the window and reconnect hooks cover the gaps it cannot see.
*/
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RealtimeProvider>
            <NotificationProvider>
              {children}
              <NotificationToasts />
            </NotificationProvider>
          </RealtimeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
