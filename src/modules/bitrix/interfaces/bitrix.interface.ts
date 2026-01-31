export interface BitrixFileInfo {
  ID: string;
  NAME: string;
  SIZE: string;
  DOWNLOAD_URL?: string;
}

export interface BitrixDealFields {
  [key: string]: string | number | boolean | null;
}

export interface BitrixApiResponse<T = unknown> {
  result: T;
  error?: string;
  error_description?: string;
}

export interface BitrixUploadResult {
  ID: number;
  NAME: string;
}

