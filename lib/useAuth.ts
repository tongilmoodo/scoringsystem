'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface AppUser {
  id: string;
  name: string;
  role: 'admin' | 'controller' | 'judge';
  court_access: number | null;
}

const STORAGE_KEY = 'app_user';

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* ignore corrupted storage */
    }
    setReady(true);
  }, []);

  async function login(pin: string): Promise<string | null> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return body.error ?? 'Login failed';
    }
    const { user: u, email } = await res.json();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pin.padEnd(6, '0'),
    });
    if (error) return error.message;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
    return null;
  }

  function logout() {
    supabase.auth.signOut();
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return { user, ready, login, logout };
}
