import type { ImportKind, Issue, Mapping, RowResult, summarize } from './model';

export const importOrder: readonly ImportKind[] = ['brand', 'category', 'template', 'variant'];

export interface DatasetSettings {
  key: string;
  kind?: ImportKind;
  mapping?: Mapping;
}

export interface DatasetPlan {
  key: string;
  name: string;
  entry: string | null;
  kind: ImportKind;
  mapping: Mapping;
  currency: '' | 'NGN';
  expected: number;
  decisions: string;
}

export interface WorkflowPlan {
  id: string;
  filename: string;
  source: string;
  hash: string;
  datasets: DatasetPlan[];
}

export interface DatasetReview {
  key: string;
  name: string;
  kind: ImportKind | null;
  headers: string[];
  mapping: Mapping;
  generated: boolean;
  error?: string;
  counts: ReturnType<typeof summarize>;
  rows: RowResult[];
  issues: Issue[];
}

export interface ImportJob {
  id: string;
  filename: string;
  source: string;
  kind: ImportKind;
  status: 'uploading' | 'ready' | 'processing' | 'complete' | 'cancelled';
  expected: number;
  staged: number;
  new: number;
  updated: number;
  invalid: number;
  skipped: number;
  pending: number;
  issues: Issue[];
}

export interface WorkflowProgress {
  id: string;
  filename: string;
  source: string;
  status: 'in progress' | 'complete' | 'failed' | 'paused';
  datasets: Array<Pick<DatasetPlan, 'key' | 'name' | 'kind' | 'expected'> & { job: ImportJob | null }>;
}

export interface ReviewResponse {
  source: string;
  images: number;
  datasets: DatasetReview[];
  approval?: { plan: WorkflowPlan; signature: string };
  existing?: WorkflowProgress;
}

export function workflowStatus(datasets: WorkflowProgress['datasets']): WorkflowProgress['status'] {
  if (datasets.some(({ job }) => job?.status === 'complete' && job.invalid > 0)) return 'failed';
  if (datasets.every(({ job }) => job?.status === 'complete')) return 'complete';
  if (datasets.some(({ job }) => job?.status === 'cancelled')) return 'paused';
  return 'in progress';
}
