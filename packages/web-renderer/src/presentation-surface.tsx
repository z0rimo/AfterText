import { useState, type CSSProperties, type ReactNode } from "react";
import { isSafeAssetUrl } from "./asset-safety.js";
import type { PresentationState } from "./presentation-state.js";

export type AssetKind = "background" | "layer";
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
 * 20.17, 20.22, 22.9–22.13): a fixed, deterministic stack — a stable,
 * unkeyed `CameraSurface` wraps only Background and the single foreground
 * Layer; narrative UI remains a separate, untransformed sibling.
 * `CameraSurface` is always mounted (never conditionally rendered per
 * Camera command), which is what lets an ordinary CSS transition animate
 * from its previously committed `transform` to the next Camera target
 * (Section 22.11, 22.22) — no `key`, no two-render staging. `overflow:
 * hidden` on the outer viewport clips transformed visual content (Section
 * 22.13). Structural positioning only, via inline styles — no published
 * renderer CSS.
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
      </div>
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}
