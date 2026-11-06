import {
  FINANCE_STATUS_LABEL,
  JOB_STATUS_LABEL,
  QUOTE_STATUS_LABEL,
  financeDisplayStatus,
  quoteDisplayStatus,
  type FinanceEntry,
  type JobStatus,
  type Quote,
} from '@jn/shared';
import { Badge, type Tone } from '../components/ui';

const QUOTE_TONE: Record<string, Tone> = { draft: 'gray', pending: 'amber', approved: 'green', refused: 'red', expired: 'violet' };
const JOB_TONE: Record<JobStatus, Tone> = { waiting: 'gray', scheduled: 'blue', in_progress: 'gold', paused: 'amber', completed: 'green', cancelled: 'red' };
const FIN_TONE: Record<string, Tone> = { pending: 'amber', paid: 'green', overdue: 'red', cancelled: 'gray' };

export function QuoteStatusBadge({ quote }: { quote: Pick<Quote, 'status' | 'validUntil'> }) {
  const s = quoteDisplayStatus(quote);
  return (
    <Badge tone={QUOTE_TONE[s]} dot>
      {QUOTE_STATUS_LABEL[s]}
    </Badge>
  );
}
export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge tone={JOB_TONE[status]} dot>
      {JOB_STATUS_LABEL[status]}
    </Badge>
  );
}
export function FinanceStatusBadge({ entry }: { entry: Pick<FinanceEntry, 'status' | 'dueDate'> }) {
  const s = financeDisplayStatus(entry);
  return (
    <Badge tone={FIN_TONE[s]} dot>
      {FINANCE_STATUS_LABEL[s]}
    </Badge>
  );
}
export { QUOTE_TONE, JOB_TONE, FIN_TONE };
