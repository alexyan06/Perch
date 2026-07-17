import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { MascotButtonSide } from "../../../shared/ipc";

type Stage = 0 | 1 | 2 | 3;
type BubblePlacement = "above" | "below";

// How long a transition speech bubble stays up before fading back to
// silence — long enough to read a short line, short enough that talking
// stays tied to the moment of change instead of becoming a status readout.
const BUBBLE_DURATION_MS = 6000;
const BUBBLE_FLIP_Y = 128;

function parseSessionId(): string | null {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) return null;
  return new URLSearchParams(hash.slice(queryIndex + 1)).get("sessionId");
}

const BODY_FILL: Record<Stage, string> = {
  0: "#F2C879",
  1: "#F2C879",
  2: "#E8A24D",
  3: "#C98F6B",
};

const ANIMATION_CLASS: Record<Stage, string> = {
  0: "mascot-anim-breathe",
  1: "mascot-anim-breathe",
  2: "mascot-anim-agitate",
  3: "mascot-anim-breakdown",
};

const STAGE_KEYS: Record<Stage, "calm" | "gentle" | "upset" | "breakdown"> = {
  0: "calm",
  1: "gentle",
  2: "upset",
  3: "breakdown",
};

type ActiveMascot = Record<"calm" | "gentle" | "upset" | "breakdown", string>;

// Body silhouette shared across all stages: a handful of stacked bands
// approximating a rounded blob on a 16x16 pixel grid, so only the face
// needs to change between stages.
function Body({ fill }: { fill: string }): React.JSX.Element {
  return (
    <>
      <rect x={5} y={3} width={6} height={2} fill={fill} />
      <rect x={4} y={5} width={8} height={1} fill={fill} />
      <rect x={3} y={6} width={10} height={5} fill={fill} />
      <rect x={4} y={11} width={8} height={1} fill={fill} />
      <rect x={5} y={12} width={6} height={2} fill={fill} />
    </>
  );
}

function Face({ stage }: { stage: Stage }): React.JSX.Element {
  const ink = "#2E2115";
  const tear = "#4FA8E0";

  if (stage === 0) {
    // calm: round dot eyes, gentle upward smile
    return (
      <>
        <rect x={6} y={7} width={1.4} height={1.4} fill={ink} />
        <rect x={9} y={7} width={1.4} height={1.4} fill={ink} />
        <path
          d="M6,11 Q8.5,13.2 11,11"
          stroke={ink}
          strokeWidth={0.5}
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }

  if (stage === 1) {
    // gentle: round eyes, one brow raised (noticing), flat neutral mouth
    return (
      <>
        <rect x={6} y={6} width={2} height={1} fill={ink} />
        <rect x={9} y={5.2} width={2} height={1} fill={ink} />
        <rect x={6} y={7.4} width={1.4} height={1.4} fill={ink} />
        <rect x={9} y={7.4} width={1.4} height={1.4} fill={ink} />
        <path
          d="M6.5,11.5 L11.5,11.5"
          stroke={ink}
          strokeWidth={0.5}
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }

  if (stage === 2) {
    // noticeable: angled angry brows converging inward, narrow eyes, frown
    return (
      <>
        <path
          d="M5,6 L7,7.4"
          stroke={ink}
          strokeWidth={0.7}
          strokeLinecap="round"
        />
        <path
          d="M11,6 L9,7.4"
          stroke={ink}
          strokeWidth={0.7}
          strokeLinecap="round"
        />
        <rect x={6.2} y={8} width={1.2} height={0.9} fill={ink} />
        <rect x={9.2} y={8} width={1.2} height={0.9} fill={ink} />
        <path
          d="M6,12 Q8.5,10 11,12"
          stroke={ink}
          strokeWidth={0.5}
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }

  // stage 3 — breakdown: squeezed-shut X eyes, streaming tears, jagged mouth
  return (
    <>
      <path
        d="M5.2,7 L7,8.8 M5.2,8.8 L7,7"
        stroke={ink}
        strokeWidth={0.6}
        strokeLinecap="round"
      />
      <path
        d="M9,7 L10.8,8.8 M9,8.8 L10.8,7"
        stroke={ink}
        strokeWidth={0.6}
        strokeLinecap="round"
      />
      <rect x={5.7} y={9} width={0.8} height={2.6} fill={tear} opacity={0.85} />
      <rect x={9.7} y={9} width={0.8} height={2.6} fill={tear} opacity={0.85} />
      <path
        d="M6,12 L7,11 L8,13 L9,11 L10,13 L11,12"
        stroke={ink}
        strokeWidth={0.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function EndSessionButton({
  onEndSession,
}: {
  onEndSession: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label="End session"
      title="End session"
      onClick={(e) => {
        e.stopPropagation();
        onEndSession();
      }}
      style={
        {
          width: 28,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          border: "none",
          background: "rgba(46, 33, 21, 0.62)",
          color: "#FFF8E7",
          borderRadius: 6,
          cursor: "pointer",
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties
      }
    >
      <X size={15} aria-hidden="true" />
    </button>
  );
}

function SpeechBubble({
  text,
  placement,
}: {
  text: string;
  placement: BubblePlacement;
}): React.JSX.Element {
  const isBelow = placement === "below";
  return (
    <div
      data-speech-bubble="true"
      style={{
        position: "relative",
        maxWidth: 190,
        marginTop: isBelow ? 14 : 0,
        marginBottom: isBelow ? 0 : 18,
        padding: "8px 10px",
        background: "#FFF8E7",
        border: "2px solid #2E2115",
        color: "#2E2115",
        fontSize: 12,
        lineHeight: 1.35,
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {text}
      <div
        style={{
          position: "absolute",
          top: isBelow ? -8 : undefined,
          bottom: isBelow ? undefined : -8,
          left: "50%",
          transform: "translateX(-50%) rotate(45deg)",
          width: 14,
          height: 14,
          background: "#FFF8E7",
          borderTop: isBelow ? "2px solid #2E2115" : undefined,
          borderLeft: isBelow ? "2px solid #2E2115" : undefined,
          borderRight: isBelow ? undefined : "2px solid #2E2115",
          borderBottom: isBelow ? undefined : "2px solid #2E2115",
        }}
      />
    </div>
  );
}

export function Mascot(): React.JSX.Element {
  const [stage, setStage] = useState<Stage>(0);
  const [sessionId] = useState<string | null>(() => parseSessionId());
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [activeMascot, setActiveMascot] = useState<ActiveMascot | null>(null);
  const [bubblePlacement, setBubblePlacement] =
    useState<BubblePlacement>("above");
  const [buttonSide, setButtonSide] = useState<MascotButtonSide>("right");
  const bubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Independent of the nudge subscription below — "what to show" and "which
  // expression to show" don't depend on each other. Checked once on mount;
  // a custom mascot can only be (re)generated from the setup screen, which
  // can't be open at the same time as a session (and thus this window).
  useEffect(() => {
    window.api.mascot
      .getActive()
      .then(setActiveMascot)
      .catch((err: unknown) => {
        console.error("[Mascot] getActive failed, using default:", err);
        setActiveMascot(null);
      });
  }, []);

  useEffect(() => {
    const unsubscribe = window.api.mascot.onButtonSideChange(setButtonSide);
    void window.api.mascot.getButtonSide().then(setButtonSide).catch((err) => {
      console.error("[Mascot] getButtonSide failed:", err);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const hideBubble = (): void => {
      setBubbleText(null);
      void window.api.mascot.setSpeechBubble({ placement: null });
    };

    const showBubble = (text: string): void => {
      if (bubbleTimeoutRef.current !== null) {
        clearTimeout(bubbleTimeoutRef.current);
      }

      void window.api.mascot
        .getBounds()
        .then((bounds) => {
          const placement =
            bounds !== null && bounds.y < BUBBLE_FLIP_Y ? "below" : "above";
          setBubblePlacement(placement);
          setBubbleText(text);
          return window.api.mascot.setSpeechBubble({ placement });
        })
        .catch((err: unknown) => {
          console.error("[Mascot] speech bubble placement failed:", err);
          setBubblePlacement("above");
          setBubbleText(text);
        });

      bubbleTimeoutRef.current = setTimeout(hideBubble, BUBBLE_DURATION_MS);
    };

    const unsubTrigger = window.api.nudge.onTrigger((payload) => {
      if (payload.sessionId === sessionId) {
        setStage(payload.stage);
        showBubble(payload.message);
      }
    });
    const unsubClear = window.api.nudge.onClear((payload) => {
      if (payload.sessionId === sessionId) {
        setStage(0);
        showBubble(payload.message);
      }
    });
    return () => {
      unsubTrigger();
      unsubClear();
      if (bubbleTimeoutRef.current !== null) {
        clearTimeout(bubbleTimeoutRef.current);
      }
      void window.api.mascot.setSpeechBubble({ placement: null });
    };
  }, [sessionId]);

  const handleEndSession = (): void => {
    if (sessionId === null) return;
    void window.api.session.end({ sessionId });
  };

  const mascotArt =
    activeMascot !== null ? (
      <img
        src={activeMascot[STAGE_KEYS[stage]]}
        alt=""
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        width={120}
        height={120}
        className={ANIMATION_CLASS[stage]}
        style={
          {
            transformOrigin: "50% 50%",
            imageRendering: "pixelated",
            userSelect: "none",
            WebkitUserDrag: "none",
          } as React.CSSProperties
        }
      />
    ) : (
      <svg
        viewBox="0 0 16 16"
        width={120}
        height={120}
        className={ANIMATION_CLASS[stage]}
        onDragStart={(e) => e.preventDefault()}
        style={
          {
            transformOrigin: "50% 50%",
            userSelect: "none",
            WebkitUserDrag: "none",
          } as React.CSSProperties
        }
      >
        <Body fill={BODY_FILL[stage]} />
        <Face stage={stage} />
      </svg>
    );

  const isBubbleBelow = bubbleText !== null && bubblePlacement === "below";

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: isBubbleBelow ? "flex-start" : "flex-end",
        background: "transparent",
        paddingTop: isBubbleBelow ? 28 : 0,
        paddingBottom: isBubbleBelow ? 0 : 8,
      }}
    >
      <div
        data-mascot="true"
        data-stage={stage}
        style={{
          position: "relative",
          width: 154,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {bubbleText !== null && bubblePlacement === "above" && (
          <SpeechBubble text={bubbleText} placement="above" />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexDirection: buttonSide === "left" ? "row-reverse" : "row",
          }}
        >
          <div
            aria-label="Move mascot"
            title="Move mascot"
            style={
              {
                width: 120,
                height: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "grab",
                WebkitAppRegion: "drag",
              } as React.CSSProperties
            }
          >
            {mascotArt}
          </div>
          <EndSessionButton onEndSession={handleEndSession} />
        </div>
        {bubbleText !== null && bubblePlacement === "below" && (
          <SpeechBubble text={bubbleText} placement="below" />
        )}
      </div>
    </div>
  );
}
