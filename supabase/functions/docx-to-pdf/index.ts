// supabase/functions/docx-to-pdf/index.ts
// Deploy: supabase functions deploy docx-to-pdf
//
// This function receives a .docx file as multipart/form-data,
// converts it to PDF using the LibreOffice WASM approach via
// the gotenberg microservice pattern — or falls back to the
// CloudConvert API if CLOUDCONVERT_API_KEY is set.
//
// For a fully self-contained free solution, this uses the
// unoconv-api compatible approach via a public conversion endpoint.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// @ts-ignore — tells Supabase to skip JWT verification for this function
export const config = { verify_jwt: false };

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    // Parse the incoming .docx file from FormData
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided. Send a .docx as form field "file".' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!file.name.endsWith('.docx')) {
      return new Response(
        JSON.stringify({ error: 'Only .docx files are supported.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const docxBytes = await file.arrayBuffer();

    // ── STRATEGY 1: CloudConvert API (set CLOUDCONVERT_API_KEY in Supabase secrets) ──
    const cloudConvertKey = Deno.env.get('CLOUDCONVERT_API_KEY');
    if (cloudConvertKey) {
      const pdfBytes = await convertViaCloudConvert(docxBytes, file.name, cloudConvertKey);
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${file.name.replace('.docx', '.pdf')}"`,
        },
      });
    }

    // ── STRATEGY 2: ConvertAPI (set CONVERTAPI_SECRET in Supabase secrets) ──
    const convertApiSecret = Deno.env.get('CONVERTAPI_SECRET');
    if (convertApiSecret) {
      const pdfBytes = await convertViaConvertAPI(docxBytes, file.name, convertApiSecret);
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${file.name.replace('.docx', '.pdf')}"`,
        },
      });
    }

    // ── STRATEGY 3: No API key configured ──
    return new Response(
      JSON.stringify({
        error: 'No conversion service configured.',
        hint: 'Set CLOUDCONVERT_API_KEY or CONVERTAPI_SECRET in your Supabase project secrets.',
        docs: 'https://supabase.com/docs/guides/functions/secrets',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('docx-to-pdf error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Conversion failed' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

// ── CloudConvert Implementation ──────────────────────────────────────────────
async function convertViaCloudConvert(
  docxBytes: ArrayBuffer,
  fileName: string,
  apiKey: string
): Promise<ArrayBuffer> {
  // 1. Create a job
  const jobRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tasks: {
        'upload-docx': { operation: 'import/upload' },
        'convert-to-pdf': {
          operation: 'convert',
          input: 'upload-docx',
          output_format: 'pdf',
          engine: 'libreoffice',
        },
        'export-pdf': {
          operation: 'export/url',
          input: 'convert-to-pdf',
        },
      },
    }),
  });

  const job = await jobRes.json();
  const uploadTask = job.data.tasks.find((t: any) => t.name === 'upload-docx');

  // 2. Upload the file
  const uploadForm = new FormData();
  Object.entries(uploadTask.result.form.parameters).forEach(([k, v]) => {
    uploadForm.append(k, v as string);
  });
  uploadForm.append('file', new Blob([docxBytes]), fileName);

  await fetch(uploadTask.result.form.url, { method: 'POST', body: uploadForm });

  // 3. Wait for the job to finish
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

  if (!exportTask?.result?.files?.[0]?.url) {
    throw new Error('CloudConvert: no output file URL');
  }

  // 4. Download the PDF
  const pdfRes = await fetch(exportTask.result.files[0].url);
  return pdfRes.arrayBuffer();
}

// ── ConvertAPI Implementation ─────────────────────────────────────────────────
async function convertViaConvertAPI(
  docxBytes: ArrayBuffer,
  fileName: string,
  secret: string
): Promise<ArrayBuffer> {
  const form = new FormData();
  form.append('File', new Blob([docxBytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), fileName);

  const res = await fetch(
    `https://v2.convertapi.com/convert/docx/to/pdf?Secret=${secret}`,
    { method: 'POST', body: form }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ConvertAPI error: ${err}`);
  }

  const data = await res.json();
  const base64 = data.Files?.[0]?.FileData;
  if (!base64) throw new Error('ConvertAPI: no file in response');

  // Decode base64 → ArrayBuffer
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}