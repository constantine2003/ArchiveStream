import express from 'express';
import multer from 'multer';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
const upload = multer({ dest: os.tmpdir() });
const port = process.env.PORT || 3001;

// LibreOffice path (Windows example)
const librePath =
  process.platform === 'win32'
    ? `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`
    : 'soffice';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Change '*' to your frontend URL in production
  next();
});

app.post('/convert-docx', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');

  const tempInput = req.file.path;
  const tempOutput = tempInput.replace(/\.docx$/i, '.pdf');

  try {
    await new Promise((resolve, reject) => {
      exec(
        `${librePath} --headless --convert-to pdf --outdir "${path.dirname(tempInput)}" "${tempInput}"`,
        (err, stdout, stderr) => {
          console.log('LibreOffice stdout:', stdout);
          console.error('LibreOffice stderr:', stderr);
          if (err) reject(stderr || err);
          else resolve();
        }
      );
    });

    if (!fs.existsSync(tempOutput)) throw new Error('Conversion failed');

    const pdfBuffer = fs.readFileSync(tempOutput);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${req.file.originalname.replace(/\.docx$/i, '.pdf')}"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error('DOCX → PDF conversion error:', err);
    res.status(500).send('Conversion failed. Check server logs.');
  } finally {
    fs.existsSync(tempInput) && fs.unlinkSync(tempInput);
    fs.existsSync(tempOutput) && fs.unlinkSync(tempOutput);
  }
});

app.listen(port, () => console.log(`DOCX converter running on port ${port}`));