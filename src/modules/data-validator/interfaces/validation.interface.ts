export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  normalizedData: Record<string, string | number>;
}

export interface ValidationError {
  field: string;
  value: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

export interface FieldValidationRule {
  type: 'number' | 'date' | 'vin' | 'string' | 'code';
  required?: boolean;
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
}

export const FIELD_VALIDATION_RULES: Record<string, FieldValidationRule> = {
  '33': { type: 'code', required: false },
  '35': { type: 'number', required: false },
  '38': { type: 'number', required: false },
  '42': { type: 'number', required: false },
  '45': { type: 'number', required: false },
  '46': { type: 'number', required: false },
  '47': { type: 'string', required: false },
  'VIN': { type: 'vin', required: false },
};

