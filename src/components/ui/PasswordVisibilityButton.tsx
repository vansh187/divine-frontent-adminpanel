interface PasswordVisibilityButtonProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordVisibilityButton({ visible, onToggle }: PasswordVisibilityButtonProps) {
  return (
    <button
      type="button"
      aria-label={visible ? "Hide password" : "Show password"}
      title={visible ? "Hide password" : "Show password"}
      onClick={onToggle}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-soft transition-colors hover:bg-surface-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-gold/20"
    >
      {visible ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.9 5.2A9.4 9.4 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13.3 13.3 0 0 1-2.1 3.2"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.2 6.6A13 13 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7a9.7 9.7 0 0 0 4.3-1"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.5 12c1-2.5 4.5-7 9.5-7s8.5 4.5 9.5 7c-1 2.5-4.5 7-9.5 7s-8.5-4.5-9.5-7z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
        </svg>
      )}
    </button>
  );
}
