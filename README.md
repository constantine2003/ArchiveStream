# ⚡ ARCHIVESTREAM

**ArchiveStream** is a privacy-first document workstation for high-speed document sequencing and merging. It processes files entirely client-side, ensuring sensitive data never leaves your browser. Featuring a high-fidelity "Live Stream" UI, it offers secure merging, real-time previews, cloud sharing, and end-to-end encryption in one seamless workstation.

---

## 🛠 Tech Stack

* **Svelte 5** – Modern reactive framework with `$state` and `$derived` runes
* **SvelteKit** – Full-stack framework with Vite
* **TypeScript** – Type-safe development
* **pdf-lib** – Client-side PDF manipulation and merging
* **pdfjs-dist** – Client-side PDF page thumbnail rendering
* **Tailwind CSS 4** – Utility-first styling with dark mode support
* **Supabase** – Cloud storage, database, and Edge Functions for server-side conversion
* **mammoth.js** – Word document preview parsing
* **qrcode** – QR code generation for sharing
* **ConvertAPI** – Server-side Office → PDF conversion (DOCX, PPTX, XLSX) with CloudConvert fallback
* **Web Crypto API** – Browser-native AES-256-GCM end-to-end encryption

---

## ✨ Features

### 📄 Multi-Format Support
* **PDF** – Merge, reorder pages, select specific page ranges, drag-to-reorder individual pages
* **Word Documents (.docx)** – Server-side conversion via ConvertAPI — tables, fonts, images preserved perfectly
* **PowerPoint (.pptx)** – Full slide deck → PDF conversion, scope/page range supported
* **Excel (.xlsx)** – Spreadsheet → PDF, each sheet becomes a page, fit-to-width applied
* **Images** – JPG, PNG, WebP with multiple sizing modes:
  - Original dimensions
  - Fit to A4
  - Custom dimensions (px)

### 🎨 Design Atelier
* **Custom Themes** – Presets: Default, Atelier, Midnight, Brutalist
* **Ink & Paper Colors** – Full color picker for text and background
* **Typography Control** – Sans, Serif, Monospace, Italic, Bold variants
* **Live Preview** – See chapter style update in real-time on the canvas
* **Watermarking** – DRAFT, CONFIDENTIAL, APPROVED overlays on export
* **Page Numbering** – Bottom-right X / Y footer on every exported page
* **Cover Page Generator** – Title, Subtitle, Author, Date, Logo — fully themed, auto-inserted at position 0

### 🔐 Security & Privacy
* **Password-Protected Export** – AES-256 PDF encryption via ConvertAPI edge function
* **End-to-End Encryption** – Encrypt uploads with AES-256-GCM in-browser before Supabase storage; decryption key embedded in QR URL fragment — server never sees plaintext
* **Client-Side Processing** – All PDF/image operations run entirely in your browser
* **Auto-Shred** – Cloud copies auto-delete after 5 hours (pg_cron scheduled)

### 🔧 Document Processing
* **Client-Side PDF Engine** – pdf-lib handles all PDF/image operations in-browser
* **Server-Side Office Conversion** – Supabase Edge Functions + ConvertAPI (CloudConvert fallback) for DOCX/PPTX/XLSX
* **Page Range Selection** – Extract specific pages (e.g. "1-3, 5, 8-10") from any file type
* **Page Reordering** – Drag individual pages within a PDF to reorder before export
* **Cover Page Generator** – Auto-inserts themed cover page at position 0, fully draggable
* **Chapter Separators** – Custom divider pages with title, subtitle, and theme styling
* **Compression Controls** – Toggle image and metadata optimization
* **Real-time Preview** – View documents before merging

### 🌐 Cloud Sharing (Optional)
* **Supabase Integration** – Optional cloud upload after export
* **QR Code Generation** – Instant QR codes for mobile access
* **E2E Encrypted QR** – When E2E enabled, QR link contains decryption key in URL fragment
* **Secure Decrypt Page** – `/decrypt` route decrypts file entirely in browser on QR scan
* **Auto-Shred** – Cloud copies auto-delete after 5 hours
* **Export History** – Track your last 5 exports

### 💻 User Experience
* **Landing Page** – Hero, feature highlights, format showcase, dark/light mode sync
* **Live Stream UI** – Real-time vertical queue
* **Grid View** – Bird's eye view of all files with drag-to-reorder
* **Context Menu** – Right-click for quick actions
* **Dark / Light Mode** – Seamless theme switching, synced across landing and app
* **Progress Tracking** – Visual feedback during export
* **Responsive Design** – Works on desktop and mobile

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Supabase project (for cloud features)
- ConvertAPI account (free tier: 250 conversions/month — no card needed)
- CloudConvert account (free tier: 25/day — automatic fallback)

### Installation

```bash
# Clone the repository
git clone https://github.com/constantine2003/ArchiveStream
cd ArchiveStream

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file:

```env
PUBLIC_SUPABASE_URL=your_supabase_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Supabase Setup

1. Create a `sessions` table and `document_queue` table (see schema in `/supabase`)
2. Create a storage bucket called `archives`
3. Enable `pg_cron` extension and schedule auto-shred:

```sql
select cron.schedule(
  'shred-old-sessions',
  '0 * * * *',
  $$ delete from sessions where created_at < now() - interval '5 hours'; $$
);
```

### Edge Function Deployment

```bash
# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Set API secrets
supabase secrets set CONVERTAPI_SECRET=your_convertapi_secret
supabase secrets set CLOUDCONVERT_API_KEY=your_cloudconvert_key  # fallback

# Deploy office-to-pdf converter
supabase functions deploy docx-to-pdf --no-verify-jwt

# Deploy pdf password protection
supabase functions deploy encrypt-pdf --no-verify-jwt
```

### Build for Production

```bash
npm run build
npm run preview
```

---

## 🔒 Privacy & Security

* **Client-Side Processing** – PDF and image operations happen entirely in your browser
* **No Data Collection** – Files never touch external servers unless you opt-in to cloud sharing
* **Office Conversion** – DOCX/PPTX/XLSX sent to ConvertAPI via Edge Function and immediately discarded
* **Password Protection** – PDF encrypted server-side via ConvertAPI before download
* **End-to-End Encryption** – AES-256-GCM encryption in-browser; key never sent to server, embedded in QR fragment only
* **Optional Cloud Sync** – Supabase integration is opt-in and temporary (5-hour auto-delete)

---

## 📦 Project Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── Canvas.svelte              # Main document viewer + floating action bar
│   │   ├── Sidebar.svelte             # Controls, Design Atelier, theme, watermark
│   │   ├── ContextMenu.svelte
│   │   ├── ExportOverlay.svelte
│   │   ├── QRModal.svelte
│   │   ├── PasswordModal.svelte       # Password protection before export
│   │   ├── CoverEditor.svelte         # Cover page generator with live preview
│   │   └── PageReorderModal.svelte    # Drag-to-reorder PDF pages
│   ├── stores/
│   │   └── archiveState.svelte.ts     # Centralized reactive store
│   ├── utils/
│   │   ├── pdfUtils.ts                # PDF helpers, compression
│   │   └── themeUtils.ts              # Theme presets, font maps, CSS helpers
│   ├── supabaseClient.ts
│   └── types.ts
└── routes/
    ├── +layout.svelte
    ├── +page.svelte                   # Landing page
    ├── app/
    │   └── +page.svelte               # Main app orchestration + export logic
    └── decrypt/
        └── +page.svelte               # E2E decryption page for QR links

supabase/
└── functions/
    ├── docx-to-pdf/
    │   └── index.ts                   # DOCX/PPTX/XLSX → PDF (ConvertAPI + CloudConvert fallback)
    └── encrypt-pdf/
        └── index.ts                   # PDF password protection via ConvertAPI
```

---

## 🎯 Usage

1. **Import Files** – Click "Import" or drag-and-drop PDFs, Word docs, PowerPoints, Excel sheets, or images
2. **Organize** – Drag to reorder files, reorder pages within PDFs, add chapter separators and cover pages
3. **Customize** – Apply themes, watermarks, typography, and page numbering via Design Atelier
4. **Export** – Set optional password, generate merged PDF with optional E2E encrypted cloud sharing and QR code

---

## 📝 Development

```bash
npm run check   # Type checking
npm run lint    # Linting
npm run format  # Format code
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

MIT

---

**Built with ⚡ by Daniel Montesclaros**
