"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  loadStickerLayout,
  type PlacedSticker,
  saveStickerLayout,
  stickerAssetUrl,
  stickerPack,
} from "./stickers";

type DragState = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  stickerX: number;
  stickerY: number;
};

type StickerCanvasProps = {
  bookId: string;
  pageId: string;
  editing: boolean;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function StickerCanvas({ bookId, pageId, editing }: StickerCanvasProps) {
  const [stickers, setStickers] = useState<PlacedSticker[]>(() =>
    loadStickerLayout(bookId, pageId),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const nextStickerId = useRef(
    Math.max(
      stickers.length,
      ...stickers.map((sticker) =>
        Number(sticker.id.match(/^placed-(\d+)-/)?.[1] ?? 0),
      ),
    ),
  );
  const selected = stickers.find((sticker) => sticker.id === selectedId);

  useEffect(() => {
    saveStickerLayout(bookId, pageId, stickers);
  }, [bookId, pageId, stickers]);

  const updateSelected = (update: (sticker: PlacedSticker) => PlacedSticker) => {
    if (!selectedId) return;
    setStickers((current) =>
      current.map((sticker) =>
        sticker.id === selectedId ? update(sticker) : sticker,
      ),
    );
  };

  const addSticker = (stickerId: string) => {
    const zIndex = Math.max(0, ...stickers.map((sticker) => sticker.zIndex)) + 1;
    const stagger = stickers.length % 5;
    nextStickerId.current += 1;
    const id = `placed-${nextStickerId.current}-${stickerId}`;
    setStickers((current) => [
      ...current,
      {
        id,
        stickerId,
        x: 64 + stagger * 3,
        y: 31 + stagger * 4,
        scale: 1,
        rotation: -8 + stagger * 4,
        zIndex,
      },
    ]);
    setSelectedId(id);
  };

  const startDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    sticker: PlacedSticker,
  ) => {
    if (!editing) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: sticker.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      stickerX: sticker.x,
      stickerY: sticker.y,
    };
    setSelectedId(sticker.id);
  };

  const dragSticker = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const layer = event.currentTarget.parentElement;
    if (!editing || !drag || drag.pointerId !== event.pointerId || !layer) return;
    const bounds = layer.getBoundingClientRect();
    const x = clamp(
      drag.stickerX + ((event.clientX - drag.startX) / bounds.width) * 100,
      4,
      96,
    );
    const y = clamp(
      drag.stickerY + ((event.clientY - drag.startY) / bounds.height) * 100,
      4,
      96,
    );
    setStickers((current) =>
      current.map((sticker) =>
        sticker.id === drag.id ? { ...sticker, x, y } : sticker,
      ),
    );
  };

  const stopDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div
      className={`sticker-canvas ${editing ? "is-editing" : ""}`}
      data-testid="sticker-canvas"
      onPointerDown={(event) => {
        if (editing && event.target === event.currentTarget) setSelectedId(null);
      }}
    >
      <div className="sticker-canvas__layer" aria-label="本页贴纸">
        {stickers.map((sticker) => {
          const definition = stickerPack.find(
            (candidate) => candidate.id === sticker.stickerId,
          );
          if (!definition) return null;
          return (
            <button
              key={sticker.id}
              type="button"
              className={`placed-sticker ${
                editing && sticker.id === selectedId ? "is-selected" : ""
              }`}
              aria-label={`${definition.label}贴纸`}
              tabIndex={editing ? 0 : -1}
              style={{
                left: `${sticker.x}%`,
                top: `${sticker.y}%`,
                zIndex: sticker.zIndex,
                transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg) scale(${sticker.scale})`,
              }}
              onPointerDown={(event) => startDrag(event, sticker)}
              onPointerMove={dragSticker}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stickerAssetUrl(definition.src)} alt="" draggable={false} />
            </button>
          );
        })}
      </div>

      {editing ? (
        <div className="sticker-editor" data-testid="sticker-editor">
          <div className="sticker-editor__pack" aria-label="选择贴纸">
            {stickerPack.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                aria-label={`添加${sticker.label}贴纸`}
                onClick={() => addSticker(sticker.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={stickerAssetUrl(sticker.src)} alt="" />
              </button>
            ))}
          </div>
          <div className="sticker-editor__selection" aria-label="调整选中贴纸">
            <span>{selected ? "调整贴纸" : "先选一枚贴纸"}</span>
            <button
              type="button"
              disabled={!selected}
              aria-label="缩小贴纸"
              onClick={() =>
                updateSelected((sticker) => ({
                  ...sticker,
                  scale: clamp(sticker.scale - 0.15, 0.45, 2.4),
                }))
              }
            >
              −
            </button>
            <button
              type="button"
              disabled={!selected}
              aria-label="放大贴纸"
              onClick={() =>
                updateSelected((sticker) => ({
                  ...sticker,
                  scale: clamp(sticker.scale + 0.15, 0.45, 2.4),
                }))
              }
            >
              +
            </button>
            <button
              type="button"
              disabled={!selected}
              aria-label="旋转贴纸"
              onClick={() =>
                updateSelected((sticker) => ({
                  ...sticker,
                  rotation: (sticker.rotation + 15) % 360,
                }))
              }
            >
              ↻
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => {
                const zIndex =
                  Math.max(0, ...stickers.map((sticker) => sticker.zIndex)) + 1;
                updateSelected((sticker) => ({ ...sticker, zIndex }));
              }}
            >
              置顶
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => {
                setStickers((current) =>
                  current.filter((sticker) => sticker.id !== selectedId),
                );
                setSelectedId(null);
              }}
            >
              删除
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
