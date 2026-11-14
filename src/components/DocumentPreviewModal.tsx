import { useEffect, useState } from "react";
import { saveBlob } from "../lib/download";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

export interface DocumentPreview {
  title: string;
  /** Null while the document is still loading or if it failed. */
  blob: Blob | null;
  filename: string;
  error: string | null;
}

/**
 * Shows a fetched PDF so the admin can read it before downloading. Download saves the same
 * file that is on screen, so the server is not asked for it a second time.
 */
export function DocumentPreviewModal({ preview, onClose }: { preview: DocumentPreview | null; onClose: () => void }) {
  const blob = preview?.blob ?? null;
  const [shown, setShown] = useState<{ blob: Blob; url: string } | null>(null);
  // A URL made for an earlier document is never shown for this one.
  const url = blob && shown?.blob === blob ? shown.url : null;

  useEffect(() => {
    if (!blob) return;
    // Some servers send PDFs as octet-stream; the browser only shows them inline as a PDF.
    const pdf = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
    const objectUrl = URL.createObjectURL(pdf);
    setShown({ blob, url: objectUrl });
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const footer = (
    <>
      <Button variant="outline" onClick={onClose}>
        Close
      </Button>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-muted"
        >
          Open in new tab
        </a>
      )}
      <Button disabled={!blob} onClick={() => blob && preview && saveBlob(blob, preview.filename)}>
        Download
      </Button>
    </>
  );

  return (
    <Modal open={preview !== null} onClose={onClose} title={preview?.title ?? ""} footer={footer} size="lg">
      {preview?.error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {preview.error}
        </p>
      ) : url ? (
        <iframe title={preview?.title} src={url} className="h-[65dvh] w-full rounded-xl border border-border bg-surface-muted" />
      ) : (
        <p role="status" className="flex h-[65dvh] items-center justify-center rounded-xl bg-surface-muted text-sm">
          Loading the document...
        </p>
      )}
    </Modal>
  );
}
