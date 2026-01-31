import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { ParsedGtdData, FieldMapping, ExtractedField } from './interfaces';

const GRAPH_PATTERNS = [
  /[Гг]раф[аі]?\s*(\d+[a-zа-яіїє]?)/i,
  /[Гг]р\.?\s*(\d+[a-zа-яіїє]?)/i,
  /^(\d{1,2}[a-zа-яіїє]?)\s*[:\.\)]/,
  /^(\d{1,2})\s+\w/,
];

const SPECIAL_FIELDS: Record<string, string> = {
  VIN: 'VIN',
  'ідентифікаційний номер': 'VIN',
  'Код товару': '33',
  'Код товара': '33',
  'Маса брутто': '35',
  'Маса нетто': '38',
  'Масса брутто': '35',
  'Масса нетто': '38',
  'Ціна товару': '42',
  'Цена товара': '42',
  'Статистична вартість': '46',
  'Статистическая стоимость': '46',
  'Митна вартість': '45',
  'Таможенная стоимость': '45',
};

@Injectable()
export class XlsxParserService {
  private readonly logger = new Logger(XlsxParserService.name);
  private mapping: FieldMapping = {};

  constructor(private configService: ConfigService) {
    this.loadMapping();
  }

  private loadMapping(): void {
    const mappingPath = this.configService.get<string>('mappingFilePath') || './config/mapping.json';
    const absolutePath = path.isAbsolute(mappingPath)
      ? mappingPath
      : path.join(process.cwd(), mappingPath);

    try {
      if (fs.existsSync(absolutePath)) {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        this.mapping = JSON.parse(content);
        this.logger.log(`Loaded mapping with ${Object.keys(this.mapping).length} fields`);
      } else {
        this.logger.warn(`Mapping file not found: ${absolutePath}`);
      }
    } catch (error) {
      this.logger.error('Failed to load mapping file', error);
    }
  }

  async parseXlsx(filePath: string): Promise<ParsedGtdData> {
    this.logger.log(`Parsing XLSX: ${filePath}`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const extractedFields: ExtractedField[] = [];
    const warnings: string[] = [];

    workbook.eachSheet((worksheet) => {
      this.logger.debug(`Processing sheet: ${worksheet.name}`);

      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell, colNumber) => {
          const cellValue = this.getCellText(cell);
          if (!cellValue) return;

          // Try to extract graph number from cell
          const extracted = this.extractFieldFromCell(cellValue, worksheet, rowNumber, colNumber);
          if (extracted) {
            extractedFields.push(extracted);
          }

          // Check for special fields (VIN, etc.)
          const specialField = this.checkSpecialField(cellValue, worksheet, rowNumber, colNumber);
          if (specialField) {
            extractedFields.push(specialField);
          }
        });
      });
    });

    // Deduplicate and merge extracted fields
    const rawData: Record<string, string> = {};
    for (const field of extractedFields) {
      const key = field.graphNumber.toLowerCase();
      if (!rawData[key] || field.value.length > rawData[key].length) {
        rawData[key] = field.value;
      }
    }

    // Apply mapping to get Bitrix field names
    const fields = this.applyMapping(rawData, warnings);

    this.logger.log(`Parsed ${Object.keys(fields).length} mapped fields, ${warnings.length} warnings`);

    return {
      fields,
      warnings,
      rawData,
    };
  }

  private getCellText(cell: ExcelJS.Cell): string {
    if (cell.value === null || cell.value === undefined) {
      return '';
    }

    if (typeof cell.value === 'object') {
      if ('richText' in cell.value && Array.isArray(cell.value.richText)) {
        return cell.value.richText.map((rt: { text?: string }) => rt.text || '').join('');
      }
      if ('text' in cell.value) {
        return String((cell.value as { text: unknown }).text);
      }
      if ('result' in cell.value) {
        return String((cell.value as { result: unknown }).result);
      }
    }

    return String(cell.value).trim();
  }

  private extractFieldFromCell(
    cellValue: string,
    worksheet: ExcelJS.Worksheet,
    rowNumber: number,
    colNumber: number,
  ): ExtractedField | null {
    for (const pattern of GRAPH_PATTERNS) {
      const match = cellValue.match(pattern);
      if (match) {
        const graphNumber = match[1].toLowerCase();
        let value = '';

        // Try to get value from same cell after the pattern
        const afterMatch = cellValue.substring(match.index! + match[0].length).trim();
        if (afterMatch.startsWith(':') || afterMatch.startsWith('.')) {
          value = afterMatch.substring(1).trim();
        } else if (afterMatch.length > 0) {
          value = afterMatch;
        }

        // Try adjacent cell if no value found
        if (!value) {
          const nextCell = worksheet.getCell(rowNumber, colNumber + 1);
          value = this.getCellText(nextCell);
        }

        // Try cell below
        if (!value) {
          const belowCell = worksheet.getCell(rowNumber + 1, colNumber);
          value = this.getCellText(belowCell);
        }

        if (value) {
          return {
            graphNumber,
            value: this.cleanValue(value),
            source: `Sheet: ${worksheet.name}, Row: ${rowNumber}, Col: ${colNumber}`,
          };
        }
      }
    }

    return null;
  }

  private checkSpecialField(
    cellValue: string,
    worksheet: ExcelJS.Worksheet,
    rowNumber: number,
    colNumber: number,
  ): ExtractedField | null {
    const upperValue = cellValue.toUpperCase();

    for (const [keyword, graphNumber] of Object.entries(SPECIAL_FIELDS)) {
      if (upperValue.includes(keyword.toUpperCase())) {
        let value = '';

        // Try to extract value after colon
        const colonIndex = cellValue.indexOf(':');
        if (colonIndex !== -1) {
          value = cellValue.substring(colonIndex + 1).trim();
        }

        // Try adjacent cell
        if (!value) {
          const nextCell = worksheet.getCell(rowNumber, colNumber + 1);
          value = this.getCellText(nextCell);
        }

        // For VIN, try to extract 17-character code
        if (keyword === 'VIN' || keyword === 'ідентифікаційний номер') {
          const vinMatch = cellValue.match(/[A-HJ-NPR-Z0-9]{17}/i);
          if (vinMatch) {
            value = vinMatch[0].toUpperCase();
          }
        }

        if (value) {
          return {
            graphNumber,
            value: this.cleanValue(value),
            source: `Special field: ${keyword}`,
          };
        }
      }
    }

    return null;
  }

  private cleanValue(value: string): string {
    return value
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private applyMapping(rawData: Record<string, string>, warnings: string[]): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [graphNumber, value] of Object.entries(rawData)) {
      const bitrixField = this.mapping[graphNumber];

      if (bitrixField) {
        result[bitrixField] = value;
        this.logger.debug(`Mapped: Графа ${graphNumber} → ${bitrixField} = "${value.substring(0, 50)}..."`);
      } else {
        warnings.push(`No mapping found for Графа ${graphNumber}`);
        this.logger.debug(`No mapping for Графа ${graphNumber}`);
      }
    }

    return result;
  }

  getMapping(): FieldMapping {
    return { ...this.mapping };
  }

  reloadMapping(): void {
    this.loadMapping();
  }
}

