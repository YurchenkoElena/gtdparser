export interface AdobeTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface AdobeUploadResponse {
  uploadUri: string;
  assetID: string;
}

export interface AdobeJobResponse {
  jobID?: string;
  status: 'in progress' | 'done' | 'failed';
  asset?: {
    downloadUri: string;
    assetID: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface AdobeAssetUploadRequest {
  mediaType: string;
}

export interface AdobeExportJobRequest {
  assetID: string;
  targetFormat: 'xlsx' | 'docx' | 'pptx';
}

