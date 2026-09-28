import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <h2 className="text-lg font-bold text-text">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mt-4 overflow-y-auto px-5 pb-5 text-sm text-text-muted sm:px-6 sm:pb-6">
          {children}
          {footer && (
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
