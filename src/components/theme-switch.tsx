'use client';

import { useEffect, useState } from 'react';
import { THEME_KEY, type Theme } from '~/lib/theme';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** System / Light / Dark, as real radio buttons. Model-drafted labels. */
export function ThemeSwitch({ name = 'theme' }: { name?: string }) {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'system' || t === 'light') setTheme(t);
  }, []);
  const choose = (t: Theme) => {
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    try {
      if (t === 'light') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, t);
    } catch {
      /* storage blocked: the choice lasts until the page closes */
    }
  };
  return (
    <fieldset className="theme-switch">
      <legend>Theme</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} className="theme-option">
          <input type="radio" name={name} value={o.value} checked={theme === o.value} onChange={() => choose(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
