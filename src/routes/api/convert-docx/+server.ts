import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs';
import { exec } from 'child_process';
import path from 'path';
import { tmpdir } from 'os';

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.formData();
  const file = data.get('file') as File;

  if (!file) return new Response('No file uploaded', { status: 400 });

  // TEMP FILES
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const inputName = `${timestamp}-${file.name}`;
  const outputName = inputName.replace(/\.docx$/i, '.pdf');
  const tempInput = path.join(tempDir, inputName);
  const tempOutput = path.join(tempDir, outputName);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(tempInput, buffer);

  // Determine LibreOffice path (Windows default)
  let librePath = 'soffice'; // Linux / Mac default
  if (process.platform === 'win32') {
    // Adjust this if LibreOffice is in a different location
    librePath = `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      exec(
        `${librePath} --headless --convert-to pdf --outdir "${tempDir}" "${tempInput}"`,
        (err, stdout, stderr) => {
          console.log('LibreOffice stdout:', stdout);
          console.error('LibreOffice stderr:', stderr);
          if (err) reject(stderr || err);
          else resolve();
        }
      );
    });

    if (!fs.existsSync(tempOutput)) {
      throw new Error('Conversion did not produce a PDF.');
    }

    const pdfBuffer = fs.readFileSync(tempOutput);

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${path.basename(outputName)}"`
      }
    });
  } catch (err) {
    console.error('DOCX → PDF conversion error:', err);
    return new Response('Conversion failed. Check server logs.', { status: 500 });
  } finally {
    // CLEANUP: remove temp files safely
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
  }
};