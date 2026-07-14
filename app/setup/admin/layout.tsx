import AdminShell from '@/components/admin/AdminShell';

export default function SetupAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
