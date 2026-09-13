import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "./Button";

const FRAME = 260;
const OUTPUT = 480;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(-max, value));
}

interface ImageCropModalProps {
  open: boolean;
  imageSrc: string | null;
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}

export function ImageCropModal({ open, imageSrc, onCancel, onSave }: ImageCropModalProps) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(
    null
  );
  const loadedImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!open || !imageSrc) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setNaturalSize(null);
    setLoadError(null);
    loadedImgRef.current = null;
    const img = new Image();
    img.onload = () => {
      loadedImgRef.current = img;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      loadedImgRef.current = null;
      setLoadError("Couldn't load this image. Please try a different photo.");
    };
    img.src = imageSrc;
  }, [open, imageSrc]);

  const coverScale = naturalSize ? Math.max(FRAME / naturalSize.w, FRAME / naturalSize.h) : 1;
  const scale = coverScale * zoom;
  const displayW = naturalSize ? naturalSize.w * scale : FRAME;
  const displayH = naturalSize ? naturalSize.h * scale : FRAME;
  const maxOffsetX = Math.max(0, (displayW - FRAME) / 2);
  const maxOffsetY = Math.max(0, (displayH - FRAME) / 2);

  useEffect(() => {
    setOffset((prev) => ({ x: clamp(prev.x, maxOffsetX), y: clamp(prev.y, maxOffsetY) }));
    // Re-clamp whenever zoom or image size changes so the frame always stays covered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxOffsetX, maxOffsetY]);

  if (!open || !imageSrc) return null;

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({
      x: clamp(dragRef.current.originX + dx, maxOffsetX),
      y: clamp(dragRef.current.originY + dy, maxOffsetY),
    });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleSave() {
    const img = loadedImgRef.current;
    if (!naturalSize || !img) return;
    setSaving(true);

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setSaving(false);
      setLoadError("Couldn't process this image. Please try again.");
      return;
    }

    const ratio = OUTPUT / FRAME;
    const drawW = displayW * ratio;
    const drawH = displayH * ratio;
    const drawX = OUTPUT / 2 - drawW / 2 + offset.x * ratio;
    const drawY = OUTPUT / 2 - drawH / 2 + offset.y * ratio;

    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    try {
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      const dataUrl = canvas.toDataURL("image/png");
      setSaving(false);
      onSave(dataUrl);
    } catch {
      setSaving(false);
      setLoadError("Couldn't process this image. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-text">Adjust photo</h2>

        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-full border-2 border-gold/40 bg-surface-muted"
          style={{ width: FRAME, height: FRAME, cursor: "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <img
            src={imageSrc}
            alt="Crop preview"
            draggable={false}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: displayW,
              height: displayH,
              maxWidth: "none",
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <span className="text-xs text-text-soft">Zoom</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-gold"
          />
        </div>

        {loadError ? (
          <p className="mt-3 text-center text-xs text-danger">{loadError}</p>
        ) : (
          <p className="mt-3 text-center text-xs text-text-soft">
            Drag the photo to reposition, use the slider to zoom.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!naturalSize || saving || !!loadError}>
            {saving ? "Saving..." : "Save Photo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
