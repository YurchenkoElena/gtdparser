import { JobStatus } from '../../../common';

export interface GtdJobData {
  jobId: string;
  deal_id: number;
  file_id: number;
  file_name: string;
}

export interface JobRecord {
  jobId: string;
  status: JobStatus;
  attempt: number;
  deal_id: number;
  file_id: number;
  file_name: string;
  file_hash?: string;
  created_at: string;
  updated_at: string;
  error_code?: string;
  error_message?: string;
  validation_errors?: string[];
  validation_warnings?: string[];
}

