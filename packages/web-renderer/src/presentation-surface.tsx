import type { SpritePosition } from "@aftertext/compiler";
import { useState, type CSSProperties, type ReactNode } from "react";
import { isSafeAssetUrl } from "./asset-safety.js";
import type { PresentationState } from "./presentation-state.js";

export type AssetKind = "background" | "layer" | "sprite";
export type ResolveAsset = (ref: string, kind: AssetKind) => string | null;

const FULL_SLOT_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%"
};

interface VisualSlotProps {
  readonly kind: AssetKind;
  readonly reference: string;
  readonly resolved: string | null;
  readonly objectFit: "cover" | "contain";
}

/**
 * Renders one Background/Layer slot's resolved asset, or a small non-fatal
 * fallback (docs/CORE_SPEC.md Section 20.21) when the resolver returned
 * `null`, the resolved value fails asset-URL safety (20.14), or the
 * browser's own `<img>` load fails. The component is remounted (by its
 * caller's `key`) whenever the resolved URL changes, so a replacement
 * asset never inherits a stale failure state.
 */
function VisualSlot({ kind, reference, resolved, objectFit }: VisualSlotProps): ReactNode {
  const [failed, setFailed] = useState(false);

  if (resolved === null || !isSafeAssetUrl(resolved) || failed) {
    return (
      <div style={FULL_SLOT_STYLE}>
        <span>{`[${kind} unavailable: ${reference}]`}</span>
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt=""
      style={{ ...FULL_SLOT_STYLE, objectFit }}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Fixed Renderer-defined CSS for each of the three named Sprite Stage
 * positions (docs/CORE_SPEC.md Section 31.10): an absolute anchor within
 * `CameraSurface`, bottom-aligned, sized to the stage height. This is the
 * only place authored `left`/`center`/`right` is translated into concrete
 * geometry — no x/y/percent/pixel/scale/anchor value is ever derived from
 * or exposed back through the Core contract.
 */
function spritePositionStyle(position: SpritePosition): CSSProperties {
  const base: CSSProperties = { position: "absolute", bottom: 0, height: "100%" };
  switch (position) {
    case "left":
      return { ...base, left: 0 };
    case "center":
      return { ...base, left: "50%", transform: "translateX(-50%)" };
    case "right":
      return { ...base, right: 0 };
  }
}

interface SpriteVisualProps {
  readonly reference: string;
  readonly resolved: string | null;
}

/**
 * Renders one Sprite's resolved image, or the same small non-fatal
 * fallback convention as `VisualSlot` (docs/CORE_SPEC.md Section 20.21)
 * when the resolver returned `null`, the resolved value fails asset-URL
 * safety (20.14, reused unchanged — no Sprite-specific safety rule), or
 * the browser's own `<img>` load fails. Deliberately separate from
 * `VisualSlot`: Sprite sizing/positioning differs (fits the stage height
 * rather than covering it), and Sprite needs a two-level identity split
 * (Section 31 implementation) that `VisualSlot`'s single-slot callers
 * don't. The caller remounts this component (via `key`) specifically when
 * the resolved asset changes, independent of the owning Sprite's own
 * `id`-keyed identity, so an image replacement for the same Sprite never
 * inherits a stale failure state, and a position-only change for the same
 * Sprite never resets this component's own fresh-load state unnecessarily.
 */
function SpriteVisual({ reference, resolved }: SpriteVisualProps): ReactNode {
  const [failed, setFailed] = useState(false);

  if (resolved === null || !isSafeAssetUrl(resolved) || failed) {
    return <span>{`[sprite unavailable: ${reference}]`}</span>;
  }

  return (
    <img
      src={resolved}
      alt=""
      style={{ height: "100%", width: "auto", objectFit: "contain" }}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * `true` under `prefers-reduced-motion: reduce` (docs/CORE_SPEC.md
 * Section 22.25) — read directly via `matchMedia` each render; no live
 * subscription, no settings subsystem. Suppresses only the visual Camera
 * transition; the narrative timing gate (`timed-presentation.ts`) never
 * consults this and always waits the full authored duration.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface PresentationSurfaceProps {
  readonly presentation: PresentationState;
  readonly resolveAsset: ResolveAsset;
  /**
   * The CURRENT Camera Presentation's authored transition duration in
   * milliseconds — `0` for a durationless/explicit-zero-duration Camera or
   * any non-Camera result (Section 22.16). Never persisted; the caller
   * recomputes it from `PlayerState` every render. Reduced motion (above)
   * further suppresses this to `0` for rendering purposes only.
   */
  readonly cameraTransitionMs: number;
  readonly children: ReactNode;
}

/**
 * Internal, unexported visual surface (docs/CORE_SPEC.md Section 20.10,
 * 20.17, 20.22, 22.9–22.13, 31.14): a fixed, deterministic stack — a
 * stable, unkeyed `CameraSurface` wraps Background, the single foreground
 * Layer, and the Sprite Stage collection (Section 31.14: Sprites
 * participate in the scene/camera visual surface, so existing Camera zoom
 * naturally affects them — no second transform); narrative UI remains a
 * separate, untransformed sibling. `CameraSurface` is always mounted
 * (never conditionally rendered per Camera command), which is what lets an
 * ordinary CSS transition animate from its previously committed `transform`
 * to the next Camera target (Section 22.11, 22.22) — no `key`, no
 * two-render staging. `overflow: hidden` on the outer viewport clips
 * transformed visual content (Section 22.13). Structural positioning only,
 * via inline styles — no published renderer CSS. Sprites render in
 * `presentation.sprites`' own back-to-front array order (Section 31.5,
 * 31.9) with no authored z-index and no reordering: the first rendered
 * Sprite is back-most, the last is front-most, relying on ordinary DOM
 * paint order within this single stacking context.
 */
export function PresentationSurface({
  presentation,
  resolveAsset,
  cameraTransitionMs,
  children
}: PresentationSurfaceProps): ReactNode {
  const resolvedBackground =
    presentation.background !== null ? resolveAsset(presentation.background, "background") : null;
  const resolvedLayer = presentation.layer !== null ? resolveAsset(presentation.layer, "layer") : null;
  const effectiveTransitionMs = prefersReducedMotion() ? 0 : cameraTransitionMs;

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transform: `scale(${presentation.cameraZoom})`,
          transformOrigin: "center center",
          transitionProperty: "transform",
          transitionDuration: `${effectiveTransitionMs}ms`,
          transitionTimingFunction: "ease"
        }}
      >
        {presentation.background !== null && (
          <VisualSlot
            key={`background:${resolvedBackground ?? presentation.background}`}
            kind="background"
            reference={presentation.background}
            resolved={resolvedBackground}
            objectFit="cover"
          />
        )}
        {presentation.layer !== null && (
          <VisualSlot
            key={`layer:${resolvedLayer ?? presentation.layer}`}
            kind="layer"
            reference={presentation.layer}
            resolved={resolvedLayer}
            objectFit="contain"
          />
        )}
        {presentation.sprites.length > 0 && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {presentation.sprites.map((sprite) => {
              const resolvedSprite = resolveAsset(sprite.image, "sprite");
              return (
                <div key={sprite.id} style={spritePositionStyle(sprite.position)}>
                  <SpriteVisual key={resolvedSprite ?? sprite.image} reference={sprite.image} resolved={resolvedSprite} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}
