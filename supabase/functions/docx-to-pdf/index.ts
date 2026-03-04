// supabase/functions/docx-to-pdf/index.ts
// Handles: .docx, .pptx, .xlsx → PDF conversion via ConvertAPI or CloudConvert
// Deploy: supabase functions deploy docx-to-pdf --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const config = { verify_jwt: false };

// Map file extension to ConvertAPI "from" format
const EXT_TO_FORMAT: Record<string, string> = {
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.xlsx': 'xlsx',
};

// MIME types for each format
const EXT_TO_MIME: Record<string, string> = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function getExt(fileName: string, mimeType?: string): string {
  const lower = fileName.toLowerCase();
  for (const ext of Object.keys(EXT_TO_FORMAT)) {
    if (lower.endsWith(ext)) return ext;
  }
  // Fallback: detect by MIME type
  if (mimeType?.includes('presentationml')) return '.pptx';
  if (mimeType?.includes('spreadsheetml')) return '.xlsx';
  if (mimeType?.includes('wordprocessingml')) return '.docx';
  return '';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const ext = getExt(file.name, file.type);
    if (!ext) {
      return new Response(
        JSON.stringify({ error: `Unsupported file type. Supported: .docx, .pptx, .xlsx` }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const fileBytes = await file.arrayBuffer();
    const pdfName = file.name.replace(/\.[^.]+$/, '.pdf');

    // ── ConvertAPI ──
    const convertApiSecret = Deno.env.get('CONVERTAPI_SECRET');
    if (convertApiSecret) {
      const pdfBytes = await convertViaConvertAPI(fileBytes, file.name, ext, convertApiSecret);
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfName}"`,
        },
      });
    }

    // ── CloudConvert ──
    const cloudConvertKey = Deno.env.get('CLOUDCONVERT_API_KEY');
    if (cloudConvertKey) {
      const pdfBytes = await convertViaCloudConvert(fileBytes, file.name, ext, cloudConvertKey);
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${pdfName}"`,
        },
      });
    }

    return new Response(
      JSON.stringify({ error: 'No conversion service configured. Set CONVERTAPI_SECRET in Supabase secrets.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('office-to-pdf error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Conversion failed' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

// ── ConvertAPI ───────────────────────────────────────────────────────────────
async function convertViaConvertAPI(
  fileBytes: ArrayBuffer,
  fileName: string,
  ext: string,
  secret: string
): Promise<ArrayBuffer> {
  const format = EXT_TO_FORMAT[ext];
  const mime = EXT_TO_MIME[ext];

  const form = new FormData();
  form.append('File', new Blob([fileBytes], { type: mime }), fileName);

  // Excel: fit each sheet to one page width for clean output
  if (ext === '.xlsx') {
    form.append('FitToPage', 'true');
    form.append('FitToWidth', '1');
  }

  const res = await fetch(
    `https://v2.convertapi.com/convert/${format}/to/pdf?Secret=${secret}`,
    { method: 'POST', body: form }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ConvertAPI error: ${err}`);
  }

  const data = await res.json();
  const base64 = data.Files?.[0]?.FileData;
  if (!base64) throw new Error('ConvertAPI: no file in response');

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── CloudConvert ─────────────────────────────────────────────────────────────
async function convertViaCloudConvert(
  fileBytes: ArrayBuffer,
  fileName: string,
  ext: string,
  apiKey: string
): Promise<ArrayBuffer> {
  const format = EXT_TO_FORMAT[ext];

  const jobRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tasks: {
        'upload-file': { operation: 'import/upload' },
        'convert-to-pdf': { operation: 'convert', input: 'upload-file', output_format: 'pdf', engine: 'libreoffice' },
        'export-pdf': { operation: 'export/url', input: 'convert-to-pdf' },
      },
    }),
  });

  const job = await jobRes.json();
  const uploadTask = job.data.tasks.find((t: any) => t.name === 'upload-file');

  const uploadForm = new FormData();
  Object.entries(uploadTask.result.form.parameters).forEach(([k, v]) => uploadForm.append(k, v as string));
  uploadForm.append('file', new Blob([fileBytes]), fileName);
  await fetch(uploadTask.result.form.url, { method: 'POST', body: uploadForm });

  let exportTask: any = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    const statusRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${job.data.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const status = await statusRes.json();
    exportTask = status.data.tasks.find((t: any) => t.name === 'export-pdf');
    if (exportTask?.status === 'finished') break;
    if (exportTask?.status === 'error') throw new Error('CloudConvert conversion failed');
  }

  if (!exportTask?.result?.files?.[0]?.url) throw new Error('CloudConvert: no output file URL');
  const pdfRes = await fetch(exportTask.result.files[0].url);
  return pdfRes.arrayBuffer();
}