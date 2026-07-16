import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Step =
  | "loading"
  | "noKey"
  | "photo"
  | "generating"
  | "review"
  | "variants"
  | "saved";

type StageName = "calm" | "gentle" | "upset" | "breakdown";
type CellStatus = "pending" | "generating" | "done" | "error";

interface CellState {
  status: CellStatus;
  image: string | null;
}

const VARIANT_STAGES: Array<{
  name: "gentle" | "upset" | "breakdown";
  number: 1 | 2 | 3;
  label: string;
}> = [
  { name: "gentle", number: 1, label: "Gentle" },
  { name: "upset", number: 2, label: "Upset" },
  { name: "breakdown", number: 3, label: "Breakdown" },
];

const EMPTY_CELL: CellState = { status: "pending", image: null };

interface Props {
  onBack: () => void;
}

function StageCell({
  label,
  cell,
  disabled,
  onRegenerate,
}: {
  label: string;
  cell: CellState;
  disabled: boolean;
  onRegenerate: () => void;
}): React.JSX.Element {
  return (
    <div className="space-y-1 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-md bg-muted">
        {cell.status === "generating" && (
          <span className="text-xs text-muted-foreground">…</span>
        )}
        {cell.status === "error" && cell.image === null && (
          <span className="text-xs text-destructive">Failed</span>
        )}
        {cell.image !== null && cell.status !== "generating" && (
          <img
            src={cell.image}
            alt={label}
            className="h-full w-full object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <button
        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        onClick={onRegenerate}
        disabled={disabled || cell.status === "generating"}
      >
        Regenerate
      </button>
    </div>
  );
}

export function MascotSetup({ onBack }: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>("loading");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [cells, setCells] = useState<Record<StageName, CellState>>({
    calm: EMPTY_CELL,
    gentle: EMPTY_CELL,
    upset: EMPTY_CELL,
    breakdown: EMPTY_CELL,
  });

  useEffect(() => {
    window.api.mascot
      .getKeyStatus()
      .then((res) => setStep(res.hasKey ? "photo" : "noKey"))
      .catch((err: unknown) => {
        console.error("[MascotSetup] getKeyStatus failed:", err);
        setStep("noKey");
      });
  }, []);

  const generateVariantCell = async (
    name: "gentle" | "upset" | "breakdown",
    stageNumber: 1 | 2 | 3,
  ): Promise<void> => {
    setCells((prev) => ({
      ...prev,
      [name]: { status: "generating", image: prev[name].image },
    }));
    try {
      const result = await window.api.mascot.generateStage({
        stage: stageNumber,
      });
      setCells((prev) => ({
        ...prev,
        [name]: { status: "done", image: result.image },
      }));
    } catch (err) {
      console.error(`[MascotSetup] generateStage(${stageNumber}) failed:`, err);
      setCells((prev) => ({
        ...prev,
        [name]: { status: "error", image: prev[name].image },
      }));
    }
  };

  // Auto-kicks off the moment the base is approved and we land on "variants"
  // — matches docs/mascot-generation.md §3: generate all 3 as one step, then
  // review as a grid, not a one-at-a-time generate/approve loop.
  useEffect(() => {
    if (step !== "variants") return;
    let cancelled = false;
    void (async () => {
      setAutoRunning(true);
      for (const { name, number } of VARIANT_STAGES) {
        if (cancelled) return;
        await generateVariantCell(name, number);
      }
      if (!cancelled) setAutoRunning(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleSelectPhoto = async (): Promise<void> => {
    setErrorMessage(null);
    try {
      const result = await window.api.mascot.selectPhoto();
      if (result === null) return;
      setPhotoPreview(result.photoPreviewDataUrl);
      setGeneratedImage(null);
    } catch (err) {
      console.error("[MascotSetup] selectPhoto failed:", err);
      setErrorMessage("Couldn't open that photo — try a different one.");
    }
  };

  const handleGenerate = async (): Promise<void> => {
    setStep("generating");
    setErrorMessage(null);
    try {
      const result = await window.api.mascot.generateBase();
      setGeneratedImage(result.image);
      setStep("review");
    } catch (err) {
      console.error("[MascotSetup] generateBase failed:", err);
      setErrorMessage(
        "Couldn't generate that — try again, or choose a different photo.",
      );
      setStep("photo");
    }
  };

  const handleChooseDifferentPhoto = (): void => {
    setPhotoPreview(null);
    setGeneratedImage(null);
    setErrorMessage(null);
    setCells({
      calm: EMPTY_CELL,
      gentle: EMPTY_CELL,
      upset: EMPTY_CELL,
      breakdown: EMPTY_CELL,
    });
    setStep("photo");
  };

  const handleApproveBase = (): void => {
    if (generatedImage === null) return;
    setCells((prev) => ({
      ...prev,
      calm: { status: "done", image: generatedImage },
    }));
    setStep("variants");
  };

  const handleRegenerateCalm = async (): Promise<void> => {
    setCells((prev) => ({
      ...prev,
      calm: { status: "generating", image: prev.calm.image },
    }));
    try {
      const result = await window.api.mascot.generateBase();
      setCells((prev) => ({
        ...prev,
        calm: { status: "done", image: result.image },
      }));
    } catch (err) {
      console.error("[MascotSetup] regenerate calm failed:", err);
      setCells((prev) => ({
        ...prev,
        calm: { status: "error", image: prev.calm.image },
      }));
    }
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setErrorMessage(null);
    try {
      await window.api.mascot.save();
      setStep("saved");
    } catch (err) {
      console.error("[MascotSetup] save failed:", err);
      setErrorMessage("Couldn't save the mascot — try again.");
    } finally {
      setSaving(false);
    }
  };

  const allDone = (
    ["calm", "gentle", "upset", "breakdown"] as StageName[]
  ).every((name) => cells[name].status === "done");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-card p-8 text-card-foreground shadow-md">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Customize mascot</h1>
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            Back
          </button>
        </div>

        {step === "loading" && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {step === "noKey" && (
          <p className="text-sm text-muted-foreground">
            Add <code className="text-foreground">OPENAI_API_KEY</code> to your{" "}
            <code className="text-foreground">.env</code> file at the project
            root, then restart the app.
          </p>
        )}

        {step === "photo" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose a photo — yourself, a pet, a drawing, whatever you want
              your mascot to be based on.
            </p>
            <button
              className={cn(
                "w-full rounded-md border border-input bg-background px-4 py-2 text-sm",
                "hover:bg-accent hover:text-accent-foreground",
              )}
              onClick={() => void handleSelectPhoto()}
            >
              Choose photo
            </button>

            {photoPreview !== null && (
              <>
                <img
                  src={photoPreview}
                  alt="Selected"
                  className="mx-auto h-40 w-40 rounded-md object-cover"
                />
                <button
                  className={cn(
                    "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
                    "hover:bg-primary/90",
                  )}
                  onClick={() => void handleGenerate()}
                >
                  Generate mascot
                </button>
              </>
            )}
          </div>
        )}

        {step === "generating" && (
          <div className="space-y-3">
            {photoPreview !== null && (
              <img
                src={photoPreview}
                alt="Selected"
                className="mx-auto h-40 w-40 rounded-md object-cover opacity-50"
              />
            )}
            <p className="text-center text-sm text-muted-foreground">
              Generating…
            </p>
          </div>
        )}

        {step === "review" && generatedImage !== null && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Preview your mascot.
            </p>
            <img
              src={generatedImage}
              alt="Generated mascot"
              className="mx-auto h-40 w-40 rounded-md bg-muted object-contain"
              style={{ imageRendering: "pixelated" }}
            />
            <button
              className={cn(
                "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
                "hover:bg-primary/90",
              )}
              onClick={handleApproveBase}
            >
              Use this
            </button>
            <div className="flex gap-2">
              <button
                className={cn(
                  "flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={() => void handleGenerate()}
              >
                Try again
              </button>
              <button
                className={cn(
                  "flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm",
                  "hover:bg-accent hover:text-accent-foreground",
                )}
                onClick={handleChooseDifferentPhoto}
              >
                Choose a different photo
              </button>
            </div>
          </div>
        )}

        {step === "variants" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generating the other three expressions.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <StageCell
                label="Calm"
                cell={cells.calm}
                disabled={autoRunning}
                onRegenerate={() => void handleRegenerateCalm()}
              />
              {VARIANT_STAGES.map(({ name, number, label }) => (
                <StageCell
                  key={name}
                  label={label}
                  cell={cells[name]}
                  disabled={autoRunning}
                  onRegenerate={() => void generateVariantCell(name, number)}
                />
              ))}
            </div>
            <button
              className={cn(
                "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
                "hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50",
              )}
              disabled={!allDone || saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}

        {step === "saved" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Mascot saved.</p>
            <button
              className={cn(
                "w-full rounded-md border border-input bg-background px-4 py-2 text-sm",
                "hover:bg-accent hover:text-accent-foreground",
              )}
              onClick={onBack}
            >
              Done
            </button>
          </div>
        )}

        {errorMessage !== null && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}
      </div>
    </div>
  );
}
