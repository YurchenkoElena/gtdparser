import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  FieldValidationRule,
  FIELD_VALIDATION_RULES,
} from './interfaces';

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;

const DATE_PATTERNS = [
  /(\d{2})\.(\d{2})\.(\d{4})/,
  /(\d{4})-(\d{2})-(\d{2})/,
  /(\d{2})\/(\d{2})\/(\d{4})/,
];

interface FieldValidationResult {
  error?: ValidationError;
  warning?: ValidationWarning;
  normalizedValue?: string | number;
}

@Injectable()
export class DataValidatorService {
  private readonly logger = new Logger(DataValidatorService.name);
  private readonly requiredFields: string[];

  constructor(private configService: ConfigService) {
    const requiredFieldsConfig = this.configService.get<string[]>('requiredFields') || [];
    this.requiredFields = requiredFieldsConfig;
    this.logger.log(`Required fields: ${this.requiredFields.join(', ') || 'none'}`);
  }

  validate(data: Record<string, string>, rawData?: Record<string, string>): ValidationResult {
    this.logger.debug(`Validating ${Object.keys(data).length} fields`);

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const normalizedData: Record<string, string | number> = {};

    // Check for required fields
    for (const requiredField of this.requiredFields) {
      const hasField = this.checkFieldPresent(requiredField, data, rawData);
      if (!hasField) {
        errors.push({
          field: requiredField,
          value: '',
          message: `Обязательное поле "Графа ${requiredField}" не найдено`,
          code: 'REQUIRED_FIELD_MISSING',
        });
      }
    }

    // Validate each field
    for (const [field, value] of Object.entries(data)) {
      const graphNumber = this.extractGraphNumber(field);
      const rule = graphNumber ? FIELD_VALIDATION_RULES[graphNumber] : undefined;

      if (rule) {
        const validationResult = this.validateField(field, value, rule);

        if (validationResult.error) {
          errors.push(validationResult.error);
        }
        if (validationResult.warning) {
          warnings.push(validationResult.warning);
        }
        normalizedData[field] = validationResult.normalizedValue ?? value;
      } else {
        normalizedData[field] = value;
      }
    }

    const isValid = errors.length === 0;
    this.logger.debug(
      `Validation complete: valid=${isValid}, errors=${errors.length}, warnings=${warnings.length}`,
    );

    return {
      isValid,
      errors,
      warnings,
      normalizedData,
    };
  }

  private checkFieldPresent(
    graphNumber: string,
    data: Record<string, string>,
    rawData?: Record<string, string>,
  ): boolean {
    const upperGraph = graphNumber.toUpperCase();
    const lowerGraph = graphNumber.toLowerCase();

    for (const key of Object.keys(data)) {
      if (key.includes(upperGraph) || key.includes(lowerGraph) || key.includes(`_${graphNumber}`)) {
        return true;
      }
    }

    if (rawData) {
      return lowerGraph in rawData || upperGraph in rawData;
    }

    return false;
  }

  private extractGraphNumber(fieldName: string): string | null {
    const match = fieldName.match(/(\d+[a-zA-Z]?)$/);
    if (match) {
      return match[1];
    }

    if (fieldName.toUpperCase().includes('VIN')) {
      return 'VIN';
    }

    return null;
  }

  private validateField(
    field: string,
    value: string,
    rule: FieldValidationRule,
  ): FieldValidationResult {
    if (!value || value.trim() === '') {
      if (rule.required) {
        return {
          error: {
            field,
            value,
            message: `Поле "${field}" обязательно для заполнения`,
            code: 'FIELD_REQUIRED',
          },
        };
      }
      return {};
    }

    switch (rule.type) {
      case 'number':
        return this.validateNumber(field, value);
      case 'date':
        return this.validateDate(field, value);
      case 'vin':
        return this.validateVin(field, value);
      case 'code':
        return this.validateCode(field, value);
      default:
        return { normalizedValue: value };
    }
  }

  private validateNumber(field: string, value: string): FieldValidationResult {
    const cleanValue = value
      .replace(/\s/g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.-]/g, '');

    const numValue = parseFloat(cleanValue);

    if (isNaN(numValue)) {
      return {
        warning: {
          field,
          message: `Значение "${value}" не удалось преобразовать в число`,
          code: 'INVALID_NUMBER',
        },
        normalizedValue: value,
      };
    }

    return { normalizedValue: numValue };
  }

  private validateDate(field: string, value: string): FieldValidationResult {
    for (const pattern of DATE_PATTERNS) {
      const match = value.match(pattern);
      if (match) {
        let isoDate: string;

        if (pattern.source.startsWith('(\\d{4})')) {
          // YYYY-MM-DD
          isoDate = `${match[1]}-${match[2]}-${match[3]}`;
        } else if (pattern.source.includes('\\.')) {
          // DD.MM.YYYY
          isoDate = `${match[3]}-${match[2]}-${match[1]}`;
        } else {
          // MM/DD/YYYY
          isoDate = `${match[3]}-${match[1]}-${match[2]}`;
        }

        const date = new Date(isoDate);
        if (!isNaN(date.getTime())) {
          return { normalizedValue: isoDate };
        }
      }
    }

    return {
      warning: {
        field,
        message: `Значение "${value}" не удалось распознать как дату`,
        code: 'INVALID_DATE',
      },
      normalizedValue: value,
    };
  }

  private validateVin(field: string, value: string): FieldValidationResult {
    const cleanVin = value.replace(/[\s-]/g, '').toUpperCase();

    if (VIN_REGEX.test(cleanVin)) {
      return { normalizedValue: cleanVin };
    }

    if (cleanVin.length === 17) {
      return {
        warning: {
          field,
          message: `VIN "${cleanVin}" содержит недопустимые символы (I, O, Q)`,
          code: 'INVALID_VIN_CHARS',
        },
        normalizedValue: cleanVin,
      };
    }

    return {
      error: {
        field,
        value,
        message: `VIN "${value}" имеет неверный формат (должен содержать 17 символов)`,
        code: 'INVALID_VIN_FORMAT',
      },
    };
  }

  private validateCode(field: string, value: string): FieldValidationResult {
    const cleanCode = value.replace(/\s/g, '');

    if (!/^\d{6,10}$/.test(cleanCode)) {
      return {
        warning: {
          field,
          message: `Код товара "${value}" может иметь нестандартный формат`,
          code: 'UNUSUAL_CODE_FORMAT',
        },
        normalizedValue: cleanCode,
      };
    }

    return { normalizedValue: cleanCode };
  }

  formatValidationSummary(result: ValidationResult): string {
    const lines: string[] = [];

    if (result.errors.length > 0) {
      lines.push('Ошибки валидации:');
      for (const error of result.errors) {
        lines.push(`  - ${error.message}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push('Предупреждения:');
      for (const warning of result.warnings) {
        lines.push(`  - ${warning.message}`);
      }
    }

    return lines.join('\n');
  }
}

