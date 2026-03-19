// supabase/functions/encrypt-pdf/index.ts
// Password-protects a PDF using ConvertAPI
// Deploy: supabase functions deploy encrypt-pdf --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const config = { verify_jwt: false };

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const password = formData.get('password') as string | null;

    if (!file) return new Response(JSON.stringify({ error: 'No file provided.' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    if (!password?.trim()) return new Response(JSON.stringify({ error: 'No password provided.' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

    const secret = Deno.env.get('CONVERTAPI_SECRET');
    if (!secret) return new Response(JSON.stringify({ error: 'CONVERTAPI_SECRET not set.' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

    const fileBytes = await file.arrayBuffer();

    const form = new FormData();
    form.append('File', new Blob([fileBytes], { type: 'application/pdf' }), 'doc.pdf');
    form.append('UserPassword', password.trim());
    form.append('OwnerPassword', password.trim());

    const res = await fetch(
      `https://v2.convertapi.com/convert/pdf/to/protect?Secret=${secret}`,
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

    return new Response(bytes.buffer, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="protected.pdf"',
      },
    });

  } catch (err: any) {
    console.error('encrypt-pdf error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Encryption failed' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});