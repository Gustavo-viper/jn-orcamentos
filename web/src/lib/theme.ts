import { useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121419' : '#0a1630');
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => (localStorage.getItem('jn_theme') as ThemePref) || 'system');
  useEffect(() => {
    apply(pref);
    localStorage.setItem('jn_theme', pref);
    if (pref !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const h = () => apply('system');
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [pref]);
  return [pref, setPref] as const;
}

export function useDensity() {
  const [compact, setCompact] = useState(() => localStorage.getItem('jn_compact') === '1');
  useEffect(() => {
    localStorage.setItem('jn_compact', compact ? '1' : '0');
    document.documentElement.classList.toggle('compact', compact);
  }, [compact]);
  return [compact, setCompact] as const;
}
