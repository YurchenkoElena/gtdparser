import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { ProcessingContext, ProcessingResult } from './interfaces';
import { BitrixService, BitrixApiError } from '../bitrix';
import { PdfValidatorService } from '../pdf-validator';
import { IdempotencyService } from '../idempotency';
import { AdobeService, AdobeApiError } from '../adobe';
import { XlsxParserService } from '../xlsx-parser';
import { DataValidatorService } from '../data-validator';

export class ProcessingError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean = true,
  ) {
    super(message);
    this.name = 'ProcessingError';
  }
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);
  private readonly tmpDir: string;

  constructor(
    private configService: ConfigService,
    private bitrixService: BitrixService,
    private pdfValidatorService: PdfValidatorService,
    private idempotencyService: IdempotencyService,
    private adobeService: AdobeService,
    private xlsxParserService: XlsxParserService,
    private dataValidatorService: DataValidatorService,
  ) {
    this.tmpDir = this.configService.get<string>('tmpDir') || '/tmp/gtdparser';
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  async process(context: ProcessingContext): Promise<ProcessingResult> {
    this.logger.log(`Starting pipeline for job ${context.jobId}`);

    try {
      // Step 1: Download PDF from Bitrix
      await this.stepDownloadPdf(context);

      // Step 2: Pre-validation (check if PDF and if GTD)
      await this.stepPreValidation(context);

      // Step 3: Idempotency check (check if already processed)
      const isDuplicate = await this.stepIdempotencyCheck(context);
      if (isDuplicate) {
        this.logger.log(`Job ${context.jobId} is duplicate, skipping Adobe conversion`);
        await this.bitrixService.addDealComment(
          context.deal_id,
          `Файл "${context.file_name}" уже был обработан ранее (hash: ${context.fileHash})`,
        );
        return { success: true };
      }

      // Step 4: Adobe PDF → XLSX conversion
      await this.stepAdobeConvert(context);

      // Step 5: Parse XLSX + mapping
      await this.stepParseXlsx(context);

      // Step 6: Data validation
      await this.stepValidateData(context);

      // Step 7: Upload XLSX to Bitrix
      await this.stepUploadXlsx(context);

      // Step 8: Update deal fields in Bitrix
      await this.stepUpdateDealFields(context);

      this.logger.log(`Pipeline completed successfully for job ${context.jobId}`);
      return { success: true };
    } catch (error) {
      await this.handlePipelineError(context, error);

      if (error instanceof ProcessingError) {
        this.logger.error(`Pipeline failed for job ${context.jobId}: [${error.code}] ${error.message}`);
        return {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          },
        };
      }

      if (error instanceof BitrixApiError) {
        this.logger.error(`Bitrix API error for job ${context.jobId}: ${error.message}`);
        return {
          success: false,
          error: {
            code: error.bitrixError || 'BITRIX_ERROR',
            message: error.message,
            retryable: error.retryable,
          },
        };
      }

      if (error instanceof AdobeApiError) {
        this.logger.error(`Adobe API error for job ${context.jobId}: ${error.message}`);
        return {
          success: false,
          error: {
            code: error.adobeErrorCode || 'ADOBE_ERROR',
            message: error.message,
            retryable: error.retryable,
          },
        };
      }

      this.logger.error(`Unexpected error in pipeline for job ${context.jobId}`, error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
      };
    } finally {
      await this.cleanup(context);
    }
  }

  private async handlePipelineError(context: ProcessingContext, error: unknown): Promise<void> {
    try {
      let errorMessage = 'Unknown error';
      let statusText = 'Ошибка';

      if (error instanceof ProcessingError) {
        errorMessage = `[${error.code}] ${error.message}`;
        if (error.code === 'NOT_GTD' || error.code === 'NOT_PDF') {
          statusText = 'Ошибка формата';
        }
      } else if (error instanceof BitrixApiError) {
        errorMessage = `Bitrix API: ${error.message}`;
      } else if (error instanceof AdobeApiError) {
        errorMessage = `Adobe API: ${error.message}`;
        if (error.adobeErrorCode === 'INVALID_INPUT') {
          statusText = 'Ошибка формата';
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      await this.bitrixService.setDealStatus(context.deal_id, statusText);
      await this.bitrixService.addDealComment(
        context.deal_id,
        `Ошибка обработки файла "${context.file_name}": ${errorMessage}`,
      );
    } catch (notifyError) {
      this.logger.warn(`[${context.jobId}] Failed to notify Bitrix about error`, notifyError);
    }
  }

  private async stepDownloadPdf(context: ProcessingContext): Promise<void> {
    this.logger.debug(`[${context.jobId}] Step 1: Download PDF`);

    const pdfPath = path.join(this.tmpDir, `${context.jobId.replace(/:/g, '_')}.pdf`);

    try {
      await this.bitrixService.downloadFile(context.file_id, pdfPath);
      context.pdfPath = pdfPath;
      this.logger.debug(`[${context.jobId}] PDF downloaded to: ${pdfPath}`);
    } catch (error) {
      if (error instanceof BitrixApiError) {
        throw new ProcessingError('DOWNLOAD_FAILED', `Failed to download PDF: ${error.message}`, error.retryable);
      }
      throw error;
    }
  }

  private async stepPreValidation(context: ProcessingContext): Promise<void> {
    this.logger.debug(`[${context.jobId}] Step 2: Pre-validation`);

    if (!context.pdfPath) {
      throw new ProcessingError('NO_PDF_PATH', 'PDF path is not set', false);
    }

    const validationResult = await this.pdfValidatorService.validate(context.pdfPath);

    if (!validationResult.isPdf) {
      throw new ProcessingError('NOT_PDF', validationResult.errorMessage || 'File is not a valid PDF', false);
    }

    if (!validationResult.isGtd) {
      throw new ProcessingError('NOT_GTD', validationResult.errorMessage || 'Document does not appear to be a GTD', false);
    }

    this.logger.debug(
      `[${context.jobId}] Pre-validation passed. GTD markers: ${validationResult.markersFound.join(', ')}`,
    );
  }

  private async stepIdempotencyCheck(context: ProcessingContext): Promise<boolean> {
    this.logger.debug(`[${context.jobId}] Step 3: Idempotency check`);

    if (!context.pdfPath) {
      throw new ProcessingError('NO_PDF_PATH', 'PDF path is not set for idempotency check', false);
    }

    const result = await this.idempotencyService.checkAndMark(context.pdfPath, context.jobId);
    context.fileHash = result.fileHash;

    if (result.isDuplicate) {
      this.logger.log(
        `[${context.jobId}] Duplicate detected! File was already processed by job ${result.existingJobId}`,
      );
      return true;
    }

    this.logger.debug(`[${context.jobId}] Idempotency check passed, hash: ${result.fileHash}`);
    return false;
  }

  private async stepAdobeConvert(context: ProcessingContext): Promise<void> {
    this.logger.debug(`[${context.jobId}] Step 4: Adobe PDF → XLSX conversion`);

    if (!context.pdfPath) {
      throw new ProcessingError('NO_PDF_PATH', 'PDF path is not set for Adobe conversion', false);
    }

    const xlsxPath = path.join(this.tmpDir, `${context.jobId.replace(/:/g, '_')}.xlsx`);

    try {
      await this.adobeService.convertPdfToXlsx(context.pdfPath, xlsxPath);
      context.xlsxPath = xlsxPath;
      this.logger.debug(`[${context.jobId}] PDF converted to XLSX: ${xlsxPath}`);
    } catch (error) {
      if (error instanceof AdobeApiError) {
        throw new ProcessingError(
          error.adobeErrorCode || 'ADOBE_CONVERT_FAILED',
          `Failed to convert PDF to XLSX: ${error.message}`,
          error.retryable,
        );
      }
      throw error;
    }
  }

  private async stepParseXlsx(context: ProcessingContext): Promise<void> {
    this.logger.debug(`[${context.jobId}] Step 5: Parse XLSX + mapping`);

    if (!context.xlsxPath || !fs.existsSync(context.xlsxPath)) {
      this.logger.warn(`[${context.jobId}] No XLSX file to parse, skipping`);
      context.parsedData = {};
      return;
    }

    try {
      const parseResult = await this.xlsxParserService.parseXlsx(context.xlsxPath);
      context.parsedData = parseResult.fields;
      context.validationWarnings = parseResult.warnings;

      this.logger.debug(`[${context.jobId}] Parsed ${Object.keys(parseResult.fields).length} fields from XLSX`);

      if (parseResult.warnings.length > 0) {
        this.logger.debug(`[${context.jobId}] Parse warnings: ${parseResult.warnings.join(', ')}`);
      }
    } catch (error) {
      throw new ProcessingError(
        'PARSE_XLSX_FAILED',
        `Failed to parse XLSX: ${error instanceof Error ? error.message : 'Unknown error'}`,
        false,
      );
    }
  }

  private async stepValidateData(context: ProcessingContext): Promise<void> {
    this.logger.debug(`[${context.jobId}] Step 6: Data validation`);

    if (!context.parsedData || Object.keys(context.parsedData).length === 0) {
      this.logger.warn(`[${context.jobId}] No parsed data to validate`);
      context.validationErrors = ['Не удалось извлечь данные из документа'];
      return;
    }

    const validationResult = this.dataValidatorService.validate(context.parsedData);

    context.normalizedData = validationResult.normalizedData;
    context.validationErrors = validationResult.errors.map((e) => e.message);
    context.validationWarnings = [
      ...(context.validationWarnings || []),
      ...validationResult.warnings.map((w) => w.message),
    ];

    this.logger.debug(
      `[${context.jobId}] Validation complete: valid=${validationResult.isValid}, ` +
        `errors=${validationResult.errors.length}, warnings=${validationResult.warnings.length}`,
    );

    if (validationResult.errors.length > 0) {
      const summary = this.dataValidatorService.formatValidationSummary(validationResult);
      await this.bitrixService.addDealComment(
        context.deal_id,
        `Предупреждения при парсинге файла "${context.file_name}":\n${summary}`,
      );
    }

    if (!validationResult.isValid) {
      throw new ProcessingError(
        'VALIDATION_FAILED',
        `Ошибки валидации: ${validationResult.errors.map((e) => e.message).join('; ')}`,
        false,
      );
    }
  }

  private async stepUploadXlsx(context: ProcessingContext): Promise<void> {
    this.logger.debug(`[${context.jobId}] Step 7: Upload XLSX to Bitrix`);

    if (!context.xlsxPath || !fs.existsSync(context.xlsxPath)) {
      this.logger.debug(`[${context.jobId}] No XLSX file to upload, skipping`);
      return;
    }

    try {
      const fileName = `GTD_${context.deal_id}_${Date.now()}.xlsx`;
      const result = await this.bitrixService.uploadFile(context.xlsxPath, fileName);
      context.xlsxFileId = result.ID;
      this.logger.debug(`[${context.jobId}] XLSX uploaded, file_id=${result.ID}`);
    } catch (error) {
      if (error instanceof BitrixApiError) {
        throw new ProcessingError('UPLOAD_FAILED', `Failed to upload XLSX: ${error.message}`, error.retryable);
      }
      throw error;
    }
  }

  private async stepUpdateDealFields(context: ProcessingContext): Promise<void> {
    this.logger.debug(`[${context.jobId}] Step 8: Update deal fields in Bitrix`);

    const dataToSave = context.normalizedData || context.parsedData || {};
    const stringData: Record<string, string> = {};
    for (const [key, value] of Object.entries(dataToSave)) {
      stringData[key] = String(value);
    }

    try {
      await this.bitrixService.processDealSuccess(context.deal_id, stringData, context.xlsxFileId);

      if (context.validationWarnings && context.validationWarnings.length > 0) {
        await this.bitrixService.addDealComment(
          context.deal_id,
          `Предупреждения при обработке:\n- ${context.validationWarnings.join('\n- ')}`,
        );
      }

      this.logger.debug(`[${context.jobId}] Deal fields updated successfully`);
    } catch (error) {
      if (error instanceof BitrixApiError) {
        throw new ProcessingError('UPDATE_DEAL_FAILED', `Failed to update deal: ${error.message}`, error.retryable);
      }
      throw error;
    }
  }

  private async cleanup(context: ProcessingContext): Promise<void> {
    this.logger.debug(`[${context.jobId}] Cleanup temporary files`);

    const filesToClean = [context.pdfPath, context.xlsxPath].filter(Boolean) as string[];

    for (const filePath of filesToClean) {
      try {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.debug(`[${context.jobId}] Deleted: ${filePath}`);
        }
      } catch (error) {
        this.logger.warn(`[${context.jobId}] Failed to delete ${filePath}`, error);
      }
    }
  }
}

