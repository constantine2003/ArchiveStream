import type { GlobalTheme } from '$lib/types';

// ── Font Maps ────────────────────────────────────────────────────────────────
// fontFamily stores the pdf-lib StandardFonts key (used for export)
// CSS props are derived at render time for the UI preview

export const pdfToCss: Record<string, string> = {
  'Helvetica':          'Arial, Helvetica, sans-serif',
  'Helvetica-Bold':     'Arial, Helvetica, sans-serif',
  'Helvetica-Oblique':  'Arial, Helvetica, sans-serif',
  'Times-Roman':        '"Times New Roman", Times, serif',
  'Times-Bold':         '"Times New Roman", Times, serif',
  'Times-Italic':       '"Times New Roman", Times, serif',
  'Courier':            '"Courier New", Courier, monospace',
  'Courier-Bold':       '"Courier New", Courier, monospace',
  'Symbol':             'Symbol, serif',
  'ZapfDingbats':       'ZapfDingbats, serif',
};

export const pdfFontStyle: Record<string, string> = {
  'Helvetica-Oblique': 'italic',
  'Times-Italic':      'italic',
};

export const pdfFontWeight: Record<string, string> = {
  'Helvetica-Bold': 'bold',
  'Times-Bold':     'bold',
  'Courier-Bold':   'bold',
};

export function getCssFontFamily(pdfFont: string): string {
  return pdfToCss[pdfFont] ?? 'Arial, sans-serif';
}
export function getCssFontStyle(pdfFont: string): string {
  return pdfFontStyle[pdfFont] ?? 'normal';
}
export function getCssFontWeight(pdfFont: string): string {
  return pdfFontWeight[pdfFont] ?? 'normal';
}

// ── Default Theme ────────────────────────────────────────────────────────────
export const defaultTheme: GlobalTheme = {
  preset: 'corporate',
  fontFamily: 'Helvetica',
  primaryColor: { hex: '#000000', r: 0, g: 0, b: 0 },
  accentColor: { hex: '#FFFFFF', r: 255, g: 255, b: 255 },
  chapterFontSize: 32,
  bodyFontSize: 11,
  lineHeight: 16,
  pageNumbering: false,
};

export function updateThemeColor(
  theme: GlobalTheme,
  type: 'primaryColor' | 'accentColor',
  hex: string
): GlobalTheme {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { ...theme, [type]: { hex, r, g, b } };
}

export function applyPreset(theme: GlobalTheme, presetName: string): GlobalTheme {
  const updated = { ...theme, preset: presetName };
  switch (presetName) {
    case 'corporate':
    case 'default':
      return { ...updated, fontFamily: 'Helvetica', primaryColor: { hex: '#000000', r: 0, g: 0, b: 0 }, accentColor: { hex: '#FFFFFF', r: 255, g: 255, b: 255 }, chapterFontSize: 32, bodyFontSize: 11 };
    case 'atelier':
      return { ...updated, fontFamily: 'Times-Roman', primaryColor: { hex: '#78716c', r: 120, g: 113, b: 108 }, accentColor: { hex: '#fafaf9', r: 250, g: 250, b: 249 }, chapterFontSize: 40, bodyFontSize: 12 };
    case 'midnight':
      return { ...updated, fontFamily: 'Courier', primaryColor: { hex: '#09090b', r: 9, g: 9, b: 11 }, accentColor: { hex: '#d9f99d', r: 217, g: 249, b: 157 }, chapterFontSize: 36, bodyFontSize: 10 };
    case 'brutalist':
      return { ...updated, fontFamily: 'Helvetica', primaryColor: { hex: '#000000', r: 0, g: 0, b: 0 }, accentColor: { hex: '#ff3e00', r: 255, g: 62, b: 0 }, chapterFontSize: 48, bodyFontSize: 11 };
    default:
      return updated;
  }
}