/**
 * 文件解析模块
 * 支持: TXT, Markdown, JSON 直接解析
 */

import * as fs from 'fs';

export interface ParsedResult { text: string; metadata?: { pages?: number; error?: string }; }

export async function parseFile(filePath: string, fileType: string): Promise<ParsedResult> {
  const ft = fileType.toLowerCase();
  if (['txt', 'md', 'mdx', 'csv'].includes(ft)) return parseText(filePath);
  if (ft === 'json') return parseJSON(filePath);
  if (ft === 'pdf') return parseBuffer(filePath, 'pdf');
  if (['docx', 'doc'].includes(ft)) return parseBuffer(filePath, 'docx');
  if (['xlsx', 'xls'].includes(ft)) return parseBuffer(filePath, 'xlsx');
  if (['pptx', 'ppt'].includes(ft)) return parseBuffer(filePath, 'pptx');
  return { text: '', metadata: { error: `Unsupported: ${fileType}` } };
}

function parseText(filePath: string): ParsedResult {
  try { return { text: fs.readFileSync(filePath, 'utf-8') }; }
  catch (e: any) { return { text: '', metadata: { error: e.message } }; }
}

function parseJSON(filePath: string): ParsedResult {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const obj = JSON.parse(raw);
    const text = flattenJSON(obj);
    return { text };
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

function parseBuffer(filePath: string, type: string): ParsedResult {
  try {
    const buffer = fs.readFileSync(filePath);
    const asText = buffer.toString('utf-8');
    const cleaned = asText.replace(/[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\n\r]/g, ' ');
    const words = cleaned.split(/\s+/).filter((w: string) => w.length > 2);
    if (words.length > 10) return { text: words.join(' ').slice(0, 5000) };
    return { text: `[${type.toUpperCase()} file: ${filePath} - needs dedicated parser]` };
  } catch (e: any) { return { text: '', metadata: { error: e.message } }; }
}
