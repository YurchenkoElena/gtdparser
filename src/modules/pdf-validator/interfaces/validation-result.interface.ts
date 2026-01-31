export interface PdfValidationResult {
  isValid: boolean;
  isPdf: boolean;
  isGtd: boolean;
  markersFound: string[];
  errorCode?: string;
  errorMessage?: string;
}

export const GTD_KEYWORD_MARKERS: string[] = [
  'ГРУЗОВАЯ ТАМОЖЕННАЯ ДЕКЛАРАЦИЯ',
  'ДЕКЛАРАЦИЯ НА ТОВАРЫ',
  'ТАМОЖЕННАЯ ДЕКЛАРАЦИЯ',
  'ДЕКЛАРАЦІЯ',
  'МИТНА ДЕКЛАРАЦІЯ',
  'ВАНТАЖНА МИТНА ДЕКЛАРАЦІЯ',
  'TRANSIT DECLARATION',
  'CUSTOMS DECLARATION',
];

export const GTD_STRUCTURE_MARKERS: string[] = [
  'Графа 1',
  'Графа 31',
  'Графа 47',
  'ГРАФА 1',
  'ГРАФА 31',
  'ГРАФА 47',
  'гр.1',
  'гр.31',
  'гр.47',
  'Вантажовідправник',
  'Вантажопідержувач',
  'Декларант',
  'Код товару',
  'Маса брутто',
  'Маса нетто',
  'Ціна товару',
  'Статистична вартість',
  'Розрахунок податків',
  'VIN',
  'ідентифікаційний номер',
];

export const MIN_MARKERS_REQUIRED = 2;

