/**
 * 文件解析器 — 支持 TXT / MD / PDF / DOCX / XLSX / CSV / JSON
 */
import * as fs from 'fs';

export interface ParsedResult {
  text: string;
  metadata?: { pages?: number; error?: string; warning?: string };
}

export async function parseFile(filePath: string, fileType: string): Promise<ParsedResult> {
  const ft = fileType.toLowerCase();
  if (['txt', 'md', 'mdx', 'csv'].includes(ft)) return parseText(filePath);
  if (ft === 'json') return parseJSON(filePath);
  if (ft === 'pdf') return parsePDF(filePath);
  if (['docx', 'doc'].includes(ft)) return parseDocx(filePath);
  if (['xlsx', 'xls'].includes(ft)) return parseExcel(filePath);
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ft)) {
    return { text: '', metadata: { warning: '图片文件暂不支持 OCR 文本解析' } };
  }
  return { text: '', metadata: { error: `不支持的文件类型: ${ft}` } };
}

/**
 * Parse the upload bytes already held by the request. Production object storage
 * keys are not local filesystem paths, so this is the only safe way to parse a
 * file before it is persisted to Vercel Blob or a future COS adapter.
 */
export async function parseBuffer(buffer: Buffer, fileType: string): Promise<ParsedResult> {
  const ft = fileType.toLowerCase();
  try {
    if (['txt', 'md', 'mdx', 'csv'].includes(ft)) return { text: buffer.toString('utf-8') };
    if (ft === 'json') return { text: flattenJSON(JSON.parse(buffer.toString('utf-8'))) };
    if (ft === 'pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return { text: data.text || '', metadata: { pages: data.numpages } };
    }
    if (['docx', 'doc'].includes(ft)) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value || '' };
    }
    if (['xlsx', 'xls'].includes(ft)) {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const texts = workbook.SheetNames
        .map((name) => {
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
          return csv.trim() ? `[Sheet: ${name}]\n${csv}` : '';
        })
        .filter(Boolean);
      return { text: texts.join('\n\n') };
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ft)) {
      return { text: '', metadata: { warning: '图片文件暂不支持 OCR 文本解析' } };
    }
    return { text: '', metadata: { error: `不支持的文件类型: ${ft}` } };
  } catch (e: any) {
    return { text: '', metadata: { error: e instanceof Error ? e.message : '文件解析失败' } };
  }
}

function parseText(filePath: string): ParsedResult {
  try { return { text: fs.readFileSync(filePath, 'utf-8') }; }
  catch (e: any) { return { text: '', metadata: { error: e.message } }; }
}

function parseJSON(filePath: string): ParsedResult {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const obj = JSON.parse(raw);
    return { text: flattenJSON(obj) };
  } catch (e: any) { return { text: '', metadata: { error: e.message } }; }
}

function flattenJSON(obj: any, prefix = ''): string {
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) return obj.map((v, i) => flattenJSON(v, `${prefix}[${i}]`)).join('\n');
  if (typeof obj === 'object' && obj !== null) {
    return Object.entries(obj).map(([k, v]) => flattenJSON(v, prefix ? `${prefix}.${k}` : k)).join('\n');
  }
  return '';
}

async function parsePDF(filePath: string): Promise<ParsedResult> {
  try {
    const buffer = fs.readFileSync(filePath);
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return { text: data.text || '', metadata: { pages: data.numpages } };
  } catch (e: any) {
    return { text: '', metadata: { error: `PDF 解析失败: ${e.message}` } };
  }
}

async function parseDocx(filePath: string): Promise<ParsedResult> {
  try {
    const mammoth = await import('mammoth');
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value || '' };
  } catch (e: any) {
    return { text: '', metadata: { error: `Word 解析失败: ${e.message}` } };
  }
}

async function parseExcel(filePath: string): Promise<ParsedResult> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.readFile(filePath);
    const texts: string[] = [];
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) texts.push(`[Sheet: ${name}]\n${csv}`);
    }
    return { text: texts.join('\n\n') };
  } catch (e: any) {
    return { text: '', metadata: { error: `Excel 解析失败: ${e.message}` } };
  }
}

export function getFileParserStatus(text: string | null | undefined): string {
  if (!text || text.trim().length === 0) return 'parse_failed';
  if (text.trim().length < 50) return 'low_content';
  return 'ready';
}
