import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ClassificationTickPayload, MascotGetActiveResponse } from "../../../shared/ipc";
import { Button, SectionCard } from "./ui";

type Classification = ClassificationTickPayload["classification"] | null;

function statusCopy(classification: Classification): { label: string; detail: string } {
  if (classification === "on_task") return { label: "On task", detail: "Perch is keeping a quiet eye on this session." };
  if (classification === "distraction") return { label: "A shift was noticed", detail: "Your mascot will share a note if it needs to." };
  if (classification === "drift") return { label: "A shift was noticed", detail: "Perch is still following the session." };
  if (classification === "ambiguous") return { label: "Monitoring", detail: "Perch is waiting for a clearer read." };
  if (classification === "paused") return { label: "Waiting", detail: "Perch will continue when an active window is available." };
  return { label: "Getting started", detail: "Perch is getting this session ready." };
}

function useElapsed(startedAt: string): string {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { const start = new Date(startedAt).getTime(); const tick = (): void => setElapsed(Math.floor((Date.now() - start) / 1000)); tick(); const interval = setInterval(tick, 1000); return () => clearInterval(interval); }, [startedAt]);
  const hours = Math.floor(elapsed / 3600); const minutes = Math.floor((elapsed % 3600) / 60); const seconds = elapsed % 60; const pad = (value: number): string => String(value).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

interface Props { sessionId: string; startedAt: string; task: string; onEnded: () => void; }
export function SessionActive({ sessionId, startedAt, task, onEnded }: Props): React.JSX.Element {
  const elapsed = useElapsed(startedAt); const [loading, setLoading] = useState(false); const [classification, setClassification] = useState<Classification>(null); const [mascot, setMascot] = useState<MascotGetActiveResponse | null>(null);
  useEffect(() => { const unsub = window.api.classification.onTick((payload) => { if (payload.sessionId === sessionId) setClassification(payload.classification); }); return unsub; }, [sessionId]);
  useEffect(() => { window.api.mascot.getActive().then(setMascot).catch((error: unknown) => console.error("[SessionActive] mascot:getActive failed:", error)); }, []);
  const handleEnd = async (): Promise<void> => { setLoading(true); try { await window.api.session.end({ sessionId }); onEnded(); } catch (error) { console.error("[SessionActive] session:end failed:", error); toast.error("The session couldn't end right now. Try again in a moment."); } finally { setLoading(false); } };
  const status = statusCopy(classification);
  return <main className="grid min-h-screen place-items-center bg-canvas p-5 text-foreground"><div className="w-full max-w-[680px] overflow-hidden rounded-xl border border-border/80 bg-panel shadow-[0_20px_60px_rgba(74,51,28,0.13)]"><div className="flex min-h-[520px] flex-col items-center justify-center px-10 py-12 text-center"><div className="mb-5 grid h-24 w-24 place-items-center rounded-full bg-warm/50">{mascot ? <img src={mascot.calm} alt="Your mascot" className="h-20 w-20 object-contain" style={{ imageRendering: "pixelated" }} /> : <span className="font-serif text-3xl">P</span>}</div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-clay">Session active</p><h1 className="mt-2 max-w-lg font-serif text-3xl font-semibold tracking-tight">{task}</h1><p className="mt-7 font-mono text-6xl font-light tabular-nums tracking-tight">{elapsed}</p><SectionCard className="mt-7 w-full max-w-md bg-card/70"><p className="text-sm font-semibold">{status.label}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{status.detail}</p></SectionCard><p className="mt-6 max-w-sm text-sm leading-6 text-muted-foreground">Your floating mascot stays nearby while you work. You can end the session here or from its close control.</p><Button variant="secondary" className="mt-7" disabled={loading} onClick={() => void handleEnd()}>{loading ? "Ending…" : "End session"}</Button></div></div></main>;
}
