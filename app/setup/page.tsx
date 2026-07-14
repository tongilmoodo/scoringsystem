'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import PinPad from '@/components/PinPad';

// Admin login lives ONLY here. On success, route to the admin dashboard.
export default function SetupLogin() {
  const router = useRouter();
  const { user, ready, login } = useAuth();

  useEffect(() => {
    if (ready && user?.role === 'admin') router.replace('/setup/admin');
  }, [ready, user, router]);

  async function handle(pin: string) {
    const err = await login(pin);
    if (err) return err;
    return null;
  }

  return <PinPad title="Admin Login" onSubmit={handle} />;
}
