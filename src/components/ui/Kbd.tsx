/**
 * A single keyboard key cap — one consistent look for every shortcut hint
 * (command palette, sidebar quick-find, the approvals triage bar). `dark` is for
 * the charcoal rail; default suits light surfaces.
 */
export function Kbd({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <kbd
      className={`inline-flex min-w-[18px] items-center justify-center rounded-[5px] border px-1.5 py-0.5 font-sans text-[10.5px] font-semibold leading-none ${
        dark ? "border-[#34393f] bg-charcoal-soft text-on-dark-mute" : "border-line-3 bg-cream text-muted-2"
      }`}
    >
      {children}
    </kbd>
  );
}
