"use client";

import { useEffect, useRef, useState } from "react";
import { loadStickerForge, type StickerForgeInstance } from "./sticker-forge";

type PeelableStickerProps = {
  label: string;
  source: string;
};

export function PeelableSticker({ label, source }: PeelableStickerProps) {
  const targetRef = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    let disposed = false;
    let instance: StickerForgeInstance | null = null;

    void loadStickerForge()
      .then((api) =>
        api.createSticker(target, {
          source: {
            type: "image",
            src: source,
            name: `${label}.svg`,
            padding: 48,
            textureMaxEdge: 512,
          },
          outline: { width: 7, color: "#fffaf0" },
          edge: { width: 2, strength: 0.65 },
          shadow: {
            color: "#2f271e",
            opacity: 0.22,
            blur: 12,
            distance: 8,
            angle: 38,
          },
          peel: {
            radius: 0.13,
            stiffness: 0.74,
            grabWidth: 22,
            maxAngle: 3.55,
            release: "reset",
          },
          back: { color: "#f7f3eb", gloss: 0.5, roughness: 0.48 },
          material: { type: "original", intensity: 0.78, scale: 1 },
          sound: { enabled: false, volume: 0 },
          quality: "low",
        }),
      )
      .then((created) => {
        if (disposed) {
          created.destroy();
          return;
        }
        instance = created;
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      instance?.destroy();
    };
  }, [label, source]);

  return (
    <span
      className={`peelable-sticker ${ready ? "is-ready" : ""} ${
        failed ? "is-fallback" : ""
      }`}
      data-testid="sticker-forge-active"
      title={failed ? `${label}贴纸` : `从边缘拖动，撕起${label}贴纸`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={source} alt="" draggable={false} />
      <span ref={targetRef} className="peelable-sticker__target" />
      {!ready && !failed ? <i aria-hidden="true" /> : null}
    </span>
  );
}
