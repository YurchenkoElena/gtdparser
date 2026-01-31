export interface ProcessingContext {
  jobId: string;
  deal_id: number;
  file_id: number;
  file_name: string;
  pdfPath?: string;
  xlsxPath?: string;
  fileHash?: string;
  parsedData?: Record<string, string>;
  normalizedData?: Record<string, string | number>;
  xlsxFileId?: number;
  validationWarnings?: string[];
  validationErrors?: string[];
}

export interface ProcessingResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

