import { redirect } from 'next/navigation';

// Canonical admin path is /setup/admin. This legacy route redirects.
export default function LegacyAdminRedirect() {
  redirect('/setup/admin');
}
