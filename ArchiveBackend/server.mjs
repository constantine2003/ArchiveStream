import express from "express";
import multer from "multer";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import cors from "cors";

const app = express();
const upload = multer({ dest: os.tmpdir() });
const port = process.env.PORT || 10000;

/* LibreOffice path */
const librePath =
  process.platform === "win32"
    ? `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`
    : "soffice";

/* =========================
   MIDDLEWARE
========================= */

app.use(cors());
app.use(express.json());

/* =========================
   HEALTH CHECK (Render)
========================= */

app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

/* =========================
   ROOT CHECK
========================= */

app.get("/", (req, res) => {
  res.send("ArchiveStream DOCX → PDF API is running 🚀");
});

/* =========================
   DOCX → PDF CONVERSION
========================= */

app.post("/convert-docx", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  const tempInput = req.file.path;
  const outputDir = path.dirname(tempInput);
  const outputFileName =
    path.basename(tempInput, path.extname(tempInput)) + ".pdf";
  const tempOutput = path.join(outputDir, outputFileName);

  try {
    await new Promise((resolve, reject) => {
      exec(
        `${librePath} --headless --convert-to pdf --outdir "${outputDir}" "${tempInput}"`,
        { timeout: 20000 }, // 20 second timeout protection
        (err, stdout, stderr) => {
          console.log("LibreOffice stdout:", stdout);
          console.error("LibreOffice stderr:", stderr);

          if (err) {
            return reject(err);
          }
          resolve();
        }
      );
    });

    if (!fs.existsSync(tempOutput)) {
      throw new Error("PDF file not created.");
    }

    const pdfBuffer = fs.readFileSync(tempOutput);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${req.file.originalname.replace(
        /\.docx$/i,
        ".pdf"
      )}"`
    );

    res.send(pdfBuffer);
  } catch (err) {
    console.error("DOCX → PDF conversion error:", err);
    res.status(500).send("Conversion failed.");
  } finally {
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
  }
});

/* =========================
   START SERVER (ALWAYS LAST)
========================= */

app.listen(port, "0.0.0.0", () => {
  console.log(`DOCX converter running on port ${port}`);
});