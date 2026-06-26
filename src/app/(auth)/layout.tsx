export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-6 py-12">
      {children}
    </div>
  );
}
