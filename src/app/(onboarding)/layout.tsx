// Focused setup flow — no app sidebar/topbar, so a brand-new operator does one
// thing at a time. requireOrg() runs in the page, so this stays presentational.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-parchment text-ink">{children}</div>;
}
