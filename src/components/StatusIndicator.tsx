import { AlertTriangle, CheckCircle2, Clock3, HelpCircle, XCircle } from 'lucide-react';
import type { ClaimStatus, DecayState } from '../types/truthos';

export function ClaimStatusLabel({ status }: { status: ClaimStatus }) {
  switch (status) {
    case 'VERIFIED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Verified</span>
        </span>
      );
    case 'OUTDATED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
          <Clock3 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Outdated</span>
        </span>
      );
    case 'CONFLICTING':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Conflicting</span>
        </span>
      );
    case 'UNVERIFIED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-400 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Unverified</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
          <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Insufficient Evidence</span>
        </span>
      );
  }
}

export function DecayStateLabel({ state }: { state: DecayState }) {
  const colorMap: Record<DecayState, string> = {
    Fresh: 'text-emerald-700 dark:text-emerald-400',
    Aging: 'text-teal-700 dark:text-teal-400',
    'At Risk': 'text-amber-700 dark:text-amber-400',
    Stale: 'text-rose-700 dark:text-rose-400',
  };
  return <span className={`text-xs font-medium whitespace-nowrap ${colorMap[state]}`}>{state}</span>;
}
