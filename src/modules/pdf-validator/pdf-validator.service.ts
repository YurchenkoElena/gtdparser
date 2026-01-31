import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import {
  PdfValidationResult,
  GTD_KEYWORD_MARKERS,
  GTD_STRUCTURE_MARKERS,
  MIN_MARKERS_REQUIRED,
} from './interfaces';

const PDF_SIGNATURE = Buffer.from('%PDF-');

@Injectable()
export class PdfValidatorService {
  private readonly logger = new Logger(PdfValidatorService.name);
  private pdfParse: ((buffer: Buffer) => Promise<{ text: string }>) | null = null;

  private async getPdfParser(): Promise<(buffer: Buffer) => Promise<{ text: string }>> {
    if (!this.pdfParse) {
      const module = await import('pdf-parse');
      this.pdfParse = module.default || module;
    }
    return this.pdfParse;
  }

  async validate(filePath: string): Promise<PdfValidationResult> {
    this.logger.log(`Validating PDF: ${filePath}`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return {
        isValid: false,
        isPdf: false,
        isGtd: false,
        markersFound: [],
        errorCode: 'FILE_NOT_FOUND',
        errorMessage: `File not found: ${filePath}`,
      };
    }

    // Check PDF signature
    const isPdf = await this.checkPdfSignature(filePath);
    if (!isPdf) {
      return {
        isValid: false,
        isPdf: false,
        isGtd: false,
        markersFound: [],
        errorCode: 'NOT_PDF',
        errorMessage: 'File is not a valid PDF document',
      };
    }

    // Check GTD markers
    const { isGtd, markersFound } = await this.checkGtdMarkers(filePath);
    if (!isGtd) {
      return {
        isValid: false,
        isPdf: true,
        isGtd: false,
        markersFound,
        errorCode: 'NOT_GTD',
        errorMessage: `Document does not appear to be a GTD. Found ${markersFound.length} markers (minimum ${MIN_MARKERS_REQUIRED} required)`,
      };
    }

    this.logger.log(`PDF validation passed. Markers found: ${markersFound.join(', ')}`);

    return {
      isValid: true,
      isPdf: true,
      isGtd: true,
      markersFound,
    };
  }

  private async checkPdfSignature(filePath: string): Promise<boolean> {
    try {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(5);
      fs.readSync(fd, buffer, 0, 5, 0);
      fs.closeSync(fd);

      const isPdf = buffer.equals(PDF_SIGNATURE);
      this.logger.debug(`PDF signature check: ${isPdf ? 'PASS' : 'FAIL'}`);
      return isPdf;
    } catch (error) {
      this.logger.error('Error checking PDF signature', error);
      return false;
    }
  }

  private async checkGtdMarkers(
    filePath: string,
  ): Promise<{ isGtd: boolean; markersFound: string[] }> {
    try {
      const pdfParse = await this.getPdfParser();
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      const text = pdfData.text.toUpperCase();

      const markersFound: string[] = [];

      // Check keyword markers
      for (const marker of GTD_KEYWORD_MARKERS) {
        if (text.includes(marker.toUpperCase())) {
          markersFound.push(marker);
        }
      }

      // Check structure markers
      for (const marker of GTD_STRUCTURE_MARKERS) {
        if (text.includes(marker.toUpperCase())) {
          if (!markersFound.includes(marker)) {
            markersFound.push(marker);
          }
        }
      }

      const isGtd = markersFound.length >= MIN_MARKERS_REQUIRED;

      this.logger.debug(
        `GTD markers check: found ${markersFound.length}/${MIN_MARKERS_REQUIRED} required. ` +
          `Markers: ${markersFound.join(', ') || 'none'}`,
      );

      return { isGtd, markersFound };
    } catch (error) {
      this.logger.error('Error parsing PDF for GTD markers', error);
      return { isGtd: false, markersFound: [] };
    }
  }

  async extractText(filePath: string): Promise<string> {
    try {
      const pdfParse = await this.getPdfParser();
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.text;
    } catch (error) {
      this.logger.error('Error extracting text from PDF', error);
      throw error;
    }
  }
}

