import type { SessionSummaryReadyPayload } from "../../../shared/ipc";
import { StatusBar } from "./StatusBar";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { Button, PageHeader, SectionCard } from "./ui";

interface Props { data: SessionSummaryReadyPayload; onStartAnother: () => void; onViewSessions: () => void; }
export function SessionSummary({ data, onStartAnother, onViewSessions }: Props): React.JSX.Element { return <div className="mx-auto max-w-2xl space-y-6"><PageHeader eyebrow="Session complete" title="Here's how it went" description={data.task} /><SectionCard className="space-y-5"><h2 className="text-sm font-medium">At a glance</h2><StatusBar onTaskSeconds={data.onTaskSeconds} distractedSeconds={data.distractedSeconds} ambiguousSeconds={data.ambiguousSeconds} /></SectionCard><SectionCard><CategoryBreakdown categories={data.categoryBreakdown} /></SectionCard><div className="flex items-center gap-3"><Button onClick={onStartAnother}>Start another session</Button><Button variant="quiet" onClick={onViewSessions}>View sessions</Button></div></div>; }
