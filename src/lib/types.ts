export type FileItem = {
  id: number | string;
  name: string;
  url?: string;
  isEditing?: boolean;
  pageSelection?: string;
  selectionType: 'all' | 'custom';
  pageCount?: number;
  type?: 'pdf' | 'word' | 'image' | 'chapter';
  previewHtml?: string;
  rawFile?: File;
  title?: string;
  description?: string;
  // Image-specific size controls
  imageSizeMode?: 'original' | 'fit' | 'custom';
  imageCustomWidth?: number;
  imageCustomHeight?: number;
  [key: string]: any;
};

export type WatermarkType = 'NONE' | 'DRAFT' | 'CONFIDENTIAL' | 'APPROVED';

export type ExportHistoryItem = {
  name: string;
  date: string;
  url: string;
  cloudUrl?: string;
};

export type GlobalTheme = {
  preset: string;
  fontFamily: string;
  primaryColor: { hex: string; r: number; g: number; b: number };
  accentColor: { hex: string; r: number; g: number; b: number };
  chapterFontSize: number;
  bodyFontSize: number;
  lineHeight: number;
  customFileName?: string;
  qrUrl?: string;
};