export interface ParsedGtdData {
  fields: Record<string, string>;
  warnings: string[];
  rawData: Record<string, string>;
}

export interface FieldMapping {
  [graphNumber: string]: string;
}

export interface ExtractedField {
  graphNumber: string;
  value: string;
  source: string;
}

