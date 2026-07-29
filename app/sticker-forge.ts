import { stickerAssetUrl } from "./stickers";

export type StickerForgeInstance = {
  destroy: () => void;
  reset: () => void;
  resize: () => void;
};

type StickerForgeOptions = {
  source: {
    type: "image";
    src: string;
    name?: string;
    padding?: number;
    textureMaxEdge?: number;
  };
  outline?: { width?: number; color?: string };
  edge?: { width?: number; strength?: number };
  shadow?: {
    color?: string;
    opacity?: number;
    blur?: number;
    distance?: number;
    angle?: number;
  };
  peel?: {
    radius?: number;
    stiffness?: number;
    grabWidth?: number;
    maxAngle?: number;
    release?: "reset" | "stay" | "snap";
  };
  back?: { color?: string; gloss?: number; roughness?: number };
  material?: {
    type?: "original" | "holographic" | "glitter" | "reflective";
    intensity?: number;
    scale?: number;
  };
  sound?: { enabled?: boolean; volume?: number };
  quality?: "low" | "medium" | "high";
};

type StickerForgeApi = {
  createSticker: (
    target: HTMLElement,
    options: StickerForgeOptions,
  ) => Promise<StickerForgeInstance>;
};

declare global {
  interface Window {
    StickerForge?: StickerForgeApi;
  }
}

let stickerForgePromise: Promise<StickerForgeApi> | null = null;

export function loadStickerForge() {
  if (window.StickerForge) return Promise.resolve(window.StickerForge);
  if (stickerForgePromise) return stickerForgePromise;

  stickerForgePromise = new Promise<StickerForgeApi>((resolve, reject) => {
    const source = stickerAssetUrl(
      "vendor/sticker-forge/sticker-forge.iife.js",
    );
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-sticker-forge="true"]',
    );
    const script = existing ?? document.createElement("script");

    const finish = () => {
      if (window.StickerForge) resolve(window.StickerForge);
      else {
        script.remove();
        reject(new Error("Sticker Forge did not initialize"));
      }
    };
    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => {
        script.remove();
        reject(new Error("Sticker Forge could not be loaded"));
      },
      { once: true },
    );

    if (!existing) {
      script.src = source;
      script.async = true;
      script.dataset.stickerForge = "true";
      document.head.append(script);
    } else if (window.StickerForge) {
      finish();
    }
  }).catch((error) => {
    stickerForgePromise = null;
    throw error;
  });

  return stickerForgePromise;
}
