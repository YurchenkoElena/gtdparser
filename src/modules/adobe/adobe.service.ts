import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import { AdobeJobResponse } from './interfaces';

const ADOBE_AUTH_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const ADOBE_PDF_SERVICES_URL = 'https://pdf-services.adobe.io';

export class AdobeApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public adobeErrorCode?: string,
    public retryable: boolean = true,
  ) {
    super(message);
    this.name = 'AdobeApiError';
  }
}

@Injectable()
export class AdobeService {
  private readonly logger = new Logger(AdobeService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(private configService: ConfigService) {
    this.clientId = this.configService.get<string>('adobe.clientId') || '';
    this.clientSecret = this.configService.get<string>('adobe.clientSecret') || '';
    this.client = axios.create({
      timeout: 60000,
    });
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    this.logger.debug('Obtaining new Adobe access token');

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('scope', 'openid,AdobeID,read_organizations,additional_info.projectedProductContext');

      const response = await this.client.post(ADOBE_AUTH_URL, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
      this.logger.debug('Adobe access token obtained successfully');

      return this.accessToken;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new AdobeApiError(
          `Failed to obtain access token: ${error.message}`,
          error.response?.status,
          undefined,
          error.response?.status !== 401,
        );
      }
      throw error;
    }
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    data?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const token = await this.getAccessToken();

    const config = {
      method,
      url: `${ADOBE_PDF_SERVICES_URL}${endpoint}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': this.clientId,
        ...headers,
      },
      data,
    };

    try {
      const response = await this.client.request(config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data as { error?: { message?: string; code?: string } };
        const retryable = status ? status >= 500 || status === 429 : true;

        throw new AdobeApiError(
          errorData?.error?.message || error.message,
          status,
          errorData?.error?.code,
          retryable,
        );
      }
      throw error;
    }
  }

  async uploadPdf(filePath: string): Promise<string> {
    this.logger.log(`Uploading PDF to Adobe: ${filePath}`);

    const uploadResponse = await this.makeRequest<{ uploadUri: string; assetID: string }>(
      'POST',
      '/assets',
      { mediaType: 'application/pdf' },
      { 'Content-Type': 'application/json' },
    );

    const fileContent = fs.readFileSync(filePath);
    await this.client.put(uploadResponse.uploadUri, fileContent, {
      headers: {
        'Content-Type': 'application/pdf',
      },
    });

    this.logger.log(`PDF uploaded successfully, assetID: ${uploadResponse.assetID}`);
    return uploadResponse.assetID;
  }

  async createExportJob(assetId: string): Promise<string> {
    this.logger.log(`Creating export job for asset: ${assetId}`);

    const response = await this.makeRequest<{ location: string }>(
      'POST',
      '/operation/exportpdf',
      {
        assetID: assetId,
        targetFormat: 'xlsx',
      },
      { 'Content-Type': 'application/json' },
    );

    const jobId = response.location.split('/').pop() || '';
    this.logger.log(`Export job created: ${jobId}`);

    return response.location;
  }

  async pollJobStatus(
    jobLocation: string,
    maxAttempts: number = 60,
    intervalMs: number = 3000,
  ): Promise<AdobeJobResponse> {
    this.logger.log(`Polling job status: ${jobLocation}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const token = await this.getAccessToken();

      const response = await this.client.get(jobLocation, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': this.clientId,
        },
      });

      const jobStatus: AdobeJobResponse = response.data;
      this.logger.debug(`Job status (attempt ${attempt}/${maxAttempts}): ${jobStatus.status}`);

      if (jobStatus.status === 'done') {
        this.logger.log('Job completed successfully');
        return jobStatus;
      }

      if (jobStatus.status === 'failed') {
        throw new AdobeApiError(
          jobStatus.error?.message || 'Job failed',
          undefined,
          jobStatus.error?.code,
          false,
        );
      }

      if (attempt < maxAttempts) {
        await this.sleep(intervalMs);
      }
    }

    throw new AdobeApiError(`Job timed out after ${maxAttempts} attempts`, undefined, 'TIMEOUT', true);
  }

  async downloadResult(downloadUri: string, destPath: string): Promise<string> {
    this.logger.log(`Downloading result to: ${destPath}`);

    const response = await this.client.get(downloadUri, {
      responseType: 'arraybuffer',
    });

    fs.writeFileSync(destPath, response.data);
    this.logger.log('Result downloaded successfully');

    return destPath;
  }

  async convertPdfToXlsx(pdfPath: string, xlsxPath: string): Promise<string> {
    this.logger.log(`Converting PDF to XLSX: ${pdfPath} → ${xlsxPath}`);

    const assetId = await this.uploadPdf(pdfPath);
    const jobLocation = await this.createExportJob(assetId);
    const jobResult = await this.pollJobStatus(jobLocation);

    if (!jobResult.asset?.downloadUri) {
      throw new AdobeApiError('No download URI in job result', undefined, 'NO_DOWNLOAD_URI', false);
    }

    await this.downloadResult(jobResult.asset.downloadUri, xlsxPath);
    this.logger.log(`PDF converted to XLSX successfully: ${xlsxPath}`);

    return xlsxPath;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

