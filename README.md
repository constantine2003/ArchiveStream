# ⚡ ARCHIVESTREAM

**ArchiveStream** is a privacy-first document workstation for high-speed document sequencing and merging. It processes files entirely client-side, ensuring sensitive data never leaves your browser. Featuring a high-fidelity "Live Stream" UI, it offers secure merging, real-time previews, and cloud sharing in one seamless workstation.

---

## 🛠 Tech Stack

* **Svelte 5** – Modern reactive framework with `$state` and `$derived` runes
* **SvelteKit** – Full-stack framework with Vite
* **TypeScript** – Type-safe development
* **pdf-lib** – Client-side PDF manipulation and merging
* **Tailwind CSS 4** – Utility-first styling with dark mode support
* **Supabase** – Cloud storage, database, and Edge Functions for server-side conversion
* **mammoth.js** – Word document preview parsing
* **qrcode** – QR code generation for sharing
* **ConvertAPI** – Server-side Office → PDF conversion (DOCX, PPTX, XLSX)

---

## ✨ Features

### 📄 Multi-Format Support
* **PDF** – Merge, reorder, and select specific page ranges
* **Word Documents (.docx)** – Server-side conversion via ConvertAPI — tables, fonts, images preserved perfectly
* **PowerPoint (.pptx)** – Full slide deck → PDF conversion, scope/page range supported
* **Excel (.xlsx)** – Spreadsheet → PDF, each sheet becomes a page, fit-to-width applied
* **Images** – JPG, PNG, WebP with multiple sizing modes:
  - Original dimensions
  - Fit to A4
  - Custom dimensions (px)

### 🎨 Design Atelier (Chapter Pages)
* **Custom Themes** – Presets: Default, Atelier, Midnight, Brutalist
* **Ink & Paper Colors** – Full color picker for text and background
* **Typography Control** – Sans, Serif, Monospace, Italic, Bold variants
* **Live Preview** – See your chapter style update in real-time on the canvas
* **Watermarking** – DRAFT, CONFIDENTIAL, APPROVED overlays on export

### 🔧 Document Processing
* **Client-Side PDF Engine** – pdf-lib handles all PDF/image operations in-browser
* **Server-Side Office Conversion** – Supabase Edge Function + ConvertAPI for DOCX/PPTX/XLSX
* **Page Range Selection** – Extract specific pages (e.g. "1-3, 5, 8-10") from any file type
* **Compression Controls** – Toggle image and metadata optimization
* **Real-time Preview** – View documents before merging
* **Drag-and-Drop** – Intuitive file upload and reordering
* **Chapter Separators** – Custom divider pages with title, subtitle, and theme styling

### 🌐 Cloud Sharing (Optional)
* **Supabase Integration** – Optional cloud upload after export
* **QR Code Generation** – Instant QR codes for mobile access
* **Auto-Shred** – Cloud copies auto-delete after 5 hours (pg_cron scheduled)
* **Export History** – Track your last 5 exports

### 💻 User Experience
* **Live Stream UI** – Real-time vertical queue
* **Grid View** – Bird's eye view of all files with drag-to-reorder
* **Context Menu** – Right-click for quick actions
* **Dark / Light Mode** – Seamless theme switching
* **Progress Tracking** – Visual feedback during export
* **Responsive Design** – Works on desktop and mobile

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Supabase project (for cloud features)
- ConvertAPI account (free tier: 250 conversions/month)

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
PUBLIC_SUPABASE_URL=(FINDITONYOOWNIMNOTTELLINGYOU XD)
PUBLIC_SUPABASE_ANON_KEY=(FINDITONYOOWNIMNOTTELLINGYOU XD)
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
supabase link --project-ref (FINDITONYOOWNIMNOTTELLINGYOU XD)

# Set your ConvertAPI secret (free at convertapi.com)
supabase secrets set CONVERTAPI_SECRET=(IMNOTTELLINGYOULMAO)

# Deploy
supabase functions deploy docx-to-pdf --no-verify-jwt
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
* **Office Conversion** – DOCX/PPTX/XLSX files are sent to ConvertAPI via a Supabase Edge Function and immediately discarded
* **Optional Cloud Sync** – Supabase integration is opt-in and temporary (5-hour auto-delete)

---

## 📦 Project Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── Canvas.svelte          # Main document viewer
│   │   ├── Sidebar.svelte         # Controls, theme, watermark
│   │   ├── ContextMenu.svelte
│   │   ├── ExportOverlay.svelte
│   │   └── QRModal.svelte
│   ├── stores/
│   │   └── archiveState.svelte.ts # Centralized reactive store
│   ├── utils/
│   │   ├── pdfUtils.ts            # PDF helpers, compression
│   │   └── themeUtils.ts          # Theme presets, font maps
│   ├── supabaseClient.ts
│   └── types.ts
└── routes/
    ├── +layout.svelte
    └── +page.svelte               # Main orchestration + export logic

supabase/
└── functions/
    └── docx-to-pdf/
        └── index.ts               # Edge function: DOCX/PPTX/XLSX → PDF
```

---

## 🎯 Usage

1. **Import Files** – Click "Import" or drag-and-drop PDFs, Word docs, PowerPoints, Excel sheets, or images
2. **Organize** – Drag to reorder, add chapter separators, select page ranges
3. **Customize** – Apply themes, watermarks, and typography to chapter pages
4. **Export** – Generate merged PDF with optional cloud sharing and QR code

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