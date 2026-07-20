import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./ui";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; }

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, busy = false, onConfirm }: Props): React.JSX.Element {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[1px]" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-xl focus:outline-none"><Dialog.Title className="font-serif text-xl font-semibold">{title}</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">{description}</Dialog.Description><div className="mt-6 flex justify-end gap-2"><Dialog.Close asChild><Button variant="secondary" disabled={busy}>Keep it</Button></Dialog.Close><Button variant="destructive" disabled={busy} onClick={onConfirm}>{busy ? "Removing…" : confirmLabel}</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
