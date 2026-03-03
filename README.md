# ⚡ ARCHIVESTREAM

**ArchiveStream** is a privacy-first PDF workstation for high-speed document sequencing. It processes files entirely client-side, ensuring sensitive data never leaves your browser. Featuring a high-fidelity "Live Stream" UI, it offers secure, serverless merging and real-time previews in one seamless workstation.

---

## 🛠 Tech Stack

* **Svelte 5** – Modern reactive framework with `$state` and `$derived` runes
* **SvelteKit** – Full-stack framework with Vite
* **TypeScript** – Type-safe development
* **pdf-lib** – Client-side PDF manipulation and merging
* **Tailwind CSS 4** – Utility-first styling with dark mode support
* **Supabase** – Cloud storage and database for optional sharing
* **mammoth.js** – Word document parsing
* **html2pdf.js** – HTML to PDF conversion
* **qrcode** – QR code generation for sharing

---

## ✨ Features

### 📄 Multi-Format Support
* **PDF** – Merge, reorder, and select specific page ranges
* **Word Documents (.docx)** – Convert to PDF with formatting preservation
* **Images** – JPG, PNG, WebP support with multiple sizing modes:
  - Original dimensions
  - Fit to A4
  - Custom dimensions

### 🎨 Advanced Customization
* **Custom Themes** – Multiple color presets (Midnight, etc.)
* **Typography Control** – Adjustable fonts and sizes for chapters and body text
* **Watermarking** – Add DRAFT, CONFIDENTIAL, or APPROVED watermarks
* **Chapter Separators** – Create custom divider pages with titles and descriptions
* **Dark/Light Mode** – Seamless theme switching

### 🔧 Document Processing
* **Zero-Server Processing** – All operations run in your browser
* **Page Range Selection** – Extract specific pages from PDFs and Word docs (e.g., "1-3,5,8-10")
* **Compression Controls** – Toggle image and metadata optimization
* **Real-time Preview** – View documents before merging
* **Drag-and-Drop** – Intuitive file upload and reordering

### 🌐 Cloud Sharing (Optional)
* **Supabase Integration** – Optional cloud upload for sharing
* **QR Code Generation** – Instant QR codes for mobile access
* **Auto-Shred** – Cloud copies expire and auto-delete after 5 hours
* **Export History** – Track your last 5 exports

### 💻 User Experience
* **Live Stream UI** – Real-time vertical queue with drag-and-drop
* **Search & Filter** – Quickly find files in your queue
* **Context Menu** – Right-click for quick actions
* **View Modes** – Switch between stream and grid layouts
* **Progress Tracking** – Visual feedback during export
* **Responsive Design** – Works on desktop and mobile

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

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

### Build for Production

```bash
# Create optimized build
npm run build

# Preview production build
npm run preview
```

---

## 🔒 Privacy & Security

* **Client-Side Processing** – All document operations happen in your browser
* **No Data Collection** – Your files never touch external servers (unless you opt-in to cloud sharing)
* **Optional Cloud Sync** – Supabase integration is opt-in and temporary (5-hour auto-delete)
* **Local Storage** – Preferences stored locally in your browser

---

## 📦 Project Structure

```
src/
├── lib/
│   ├── components/      # Svelte components
│   │   ├── Canvas.svelte
│   │   ├── Sidebar.svelte
│   │   ├── ContextMenu.svelte
│   │   ├── ExportOverlay.svelte
│   │   └── QRModal.svelte
│   ├── stores/          # State management
│   │   └── archiveState.svelte.ts
│   ├── utils/           # Utility functions
│   │   ├── pdfUtils.ts
│   │   └── themeUtils.ts
│   ├── supabaseClient.ts
│   └── types.ts
└── routes/              # SvelteKit routes
    ├── +layout.svelte
    └── +page.svelte
```

---

## 🎯 Usage

1. **Import Files** – Click "Import" or drag-and-drop PDFs, Word docs, or images
2. **Organize** – Drag to reorder, add chapter separators, select page ranges
3. **Customize** – Apply themes, watermarks, and adjust settings
4. **Export** – Generate merged PDF with optional cloud sharing

---

## 📝 Development

```bash
# Type checking
npm run check

# Linting
npm run lint

# Format code
npm run format
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

MIT

---

## 🔗 Links

- [Supabase Documentation](https://supabase.com/docs)
- [Svelte 5 Documentation](https://svelte.dev/docs)
- [pdf-lib Documentation](https://pdf-lib.js.org/)

---

**Built with ⚡ by Daniel Montesclaros**
