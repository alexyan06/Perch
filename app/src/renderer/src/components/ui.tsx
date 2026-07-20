import { type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "destructive" }): React.JSX.Element {
  const variants = {
    primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
    secondary: "border border-border bg-card text-foreground hover:bg-accent",
    quiet: "text-muted-foreground hover:bg-accent hover:text-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };
  return <button className={cn("inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50", variants[variant], className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={cn("flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return <textarea className={cn("flex w-full resize-none rounded-md border border-input bg-card px-3 py-2.5 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />;
}

export function SectionCard({ className, children }: React.PropsWithChildren<{ className?: string }>): React.JSX.Element {
  return <section className={cn("rounded-lg border border-border/80 bg-card p-5 shadow-[0_2px_10px_rgba(73,51,31,0.05)]", className)}>{children}</section>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }): React.JSX.Element {
  return <div className="flex items-start justify-between gap-6"><div className="space-y-1.5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-clay">{eyebrow}</p><h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">{title}</h1>{description && <p className="max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>{action}</div>;
}

export function LoadingCard(): React.JSX.Element {
  return <SectionCard className="space-y-3"><div className="h-4 w-1/3 animate-pulse rounded bg-muted" /><div className="h-16 animate-pulse rounded bg-muted" /></SectionCard>;
}
