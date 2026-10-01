import { useCallback, useEffect, useState } from 'react';

const KEY = 'nuuke-theme';

function read(): 'light' | 'dark' {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* private mode */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(read);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', theme === 'dark' ? '#08080d' : '#f3f2f8');
  }, [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { theme, toggle };
}
