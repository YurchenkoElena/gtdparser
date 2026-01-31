import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { BitrixFileInfo, BitrixDealFields, BitrixUploadResult } from './interfaces';

export class BitrixApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public bitrixError?: string,
    public retryable: boolean = true,
  ) {
    super(message);
    this.name = 'BitrixApiError';
  }
}

@Injectable()
export class BitrixService {
  private readonly logger = new Logger(BitrixService.name);
  private readonly client: AxiosInstance;
  private readonly webhookUrl: string;
  private readonly dealStatusFieldCode: string;
  private readonly commentFieldCode: string;

  constructor(private configService: ConfigService) {
    this.webhookUrl = this.configService.get<string>('bitrix.webhookUrl') || '';
    this.dealStatusFieldCode =
      this.configService.get<string>('bitrix.dealStatusFieldCode') || 'UF_GTD_STATUS';
    this.commentFieldCode =
      this.configService.get<string>('bitrix.commentFieldCode') || 'UF_GTD_COMMENT';

    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private buildUrl(method: string): string {
    const baseUrl = this.webhookUrl.replace(/\/$/, '');
    return `${baseUrl}/${method}`;
  }

  private async callApi<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = this.buildUrl(method);

    try {
      this.logger.debug(`Bitrix API call: ${method}`);
      const response = await this.client.post(url, params);

      if (response.data.error) {
        throw new BitrixApiError(
          response.data.error_description || response.data.error,
          response.status,
          response.data.error,
          this.isRetryableError(response.data.error),
        );
      }

      return response.data.result;
    } catch (error) {
      if (error instanceof BitrixApiError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const retryable = status ? status >= 500 || status === 429 : true;
        throw new BitrixApiError(error.message, status, undefined, retryable);
      }

      throw new BitrixApiError(
        error instanceof Error ? error.message : 'Unknown error',
        undefined,
        undefined,
        true,
      );
    }
  }

  private isRetryableError(errorCode: string): boolean {
    const nonRetryableErrors = [
      'ACCESS_DENIED',
      'ERROR_NOT_FOUND',
      'INVALID_REQUEST',
    ];
    return !nonRetryableErrors.includes(errorCode);
  }

  async getFileInfo(fileId: number): Promise<BitrixFileInfo> {
    this.logger.log(`Getting file info for file_id=${fileId}`);
    const result = await this.callApi<BitrixFileInfo>('disk.file.get', {
      id: fileId,
    });
    return result;
  }

  async downloadFile(fileId: number, destPath: string): Promise<string> {
    this.logger.log(`Downloading file_id=${fileId} to ${destPath}`);

    const fileInfo = await this.getFileInfo(fileId);

    if (!fileInfo.DOWNLOAD_URL) {
      const downloadUrl = await this.callApi<string>('disk.file.getExternalLink', {
        id: fileId,
      });

      if (!downloadUrl) {
        throw new BitrixApiError(
          'Unable to get download URL for file',
          undefined,
          'NO_DOWNLOAD_URL',
          false,
        );
      }

      fileInfo.DOWNLOAD_URL = downloadUrl;
    }

    const response = await axios.get(fileInfo.DOWNLOAD_URL, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(destPath, response.data);
    this.logger.log(`File downloaded successfully: ${destPath}`);

    return destPath;
  }

  async uploadFile(filePath: string, fileName: string, folderId?: number): Promise<BitrixUploadResult> {
    this.logger.log(`Uploading file ${fileName} to Bitrix`);

    const fileContent = fs.readFileSync(filePath);
    const base64Content = fileContent.toString('base64');
    const targetFolderId = folderId || 1;

    const result = await this.callApi<BitrixUploadResult>('disk.folder.uploadfile', {
      id: targetFolderId,
      data: {
        NAME: fileName,
      },
      fileContent: [fileName, base64Content],
    });

    this.logger.log(`File uploaded successfully, ID=${result.ID}`);
    return result;
  }

  async updateDealFields(dealId: number, fields: BitrixDealFields): Promise<boolean> {
    this.logger.log(`Updating deal ${dealId} with fields: ${Object.keys(fields).join(', ')}`);

    const result = await this.callApi<boolean>('crm.deal.update', {
      id: dealId,
      fields,
    });

    this.logger.log(`Deal ${dealId} updated successfully`);
    return result;
  }

  async setDealStatus(dealId: number, status: string): Promise<boolean> {
    return this.updateDealFields(dealId, {
      [this.dealStatusFieldCode]: status,
    });
  }

  async addDealComment(dealId: number, comment: string): Promise<number | null> {
    this.logger.log(`Adding comment to deal ${dealId}`);

    try {
      const result = await this.callApi<number>('crm.timeline.comment.add', {
        fields: {
          ENTITY_ID: dealId,
          ENTITY_TYPE: 'deal',
          COMMENT: comment,
        },
      });

      this.logger.log(`Comment added to deal ${dealId}, comment_id=${result}`);
      return result;
    } catch (error) {
      this.logger.warn(`Failed to add timeline comment, trying UF field fallback`);

      try {
        await this.updateDealFields(dealId, {
          [this.commentFieldCode]: comment,
        });
        return null;
      } catch (fallbackError) {
        this.logger.error(`Failed to add comment via fallback`, fallbackError);
        throw error;
      }
    }
  }

  async attachFileToDeal(dealId: number, fileId: number, fieldCode?: string): Promise<boolean> {
    this.logger.log(`Attaching file ${fileId} to deal ${dealId}`);

    const targetFieldCode =
      fieldCode ||
      this.configService.get<string>('bitrix.resultFileFieldCode') ||
      'UF_GTD_RESULT_FILE';

    return this.updateDealFields(dealId, {
      [targetFieldCode]: fileId,
    });
  }

  async processDealSuccess(
    dealId: number,
    parsedData: Record<string, string>,
    xlsxFileId?: number,
  ): Promise<void> {
    this.logger.log(`Processing success for deal ${dealId}`);

    const fields: BitrixDealFields = {
      ...parsedData,
      [this.dealStatusFieldCode]: 'Успешно',
    };

    if (xlsxFileId) {
      const resultFileFieldCode =
        this.configService.get<string>('bitrix.resultFileFieldCode') || 'UF_GTD_RESULT_FILE';
      fields[resultFileFieldCode] = xlsxFileId;
    }

    await this.updateDealFields(dealId, fields);
    await this.addDealComment(dealId, 'ГТД успешно обработана');
  }

  async processDealError(dealId: number, errorMessage: string): Promise<void> {
    this.logger.log(`Processing error for deal ${dealId}: ${errorMessage}`);
    await this.setDealStatus(dealId, 'Ошибка');
    await this.addDealComment(dealId, `Ошибка обработки ГТД: ${errorMessage}`);
  }
}

