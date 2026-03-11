<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';
  import { PDFDocument } from 'pdf-lib';
  import { rgb, degrees, StandardFonts } from 'pdf-lib';
  import  mammoth  from 'mammoth';
  import { slide } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  // --- State Management ---
  type FileItem = {
    id: number | string;
    name: string;
    url?: string;
    isEditing?: boolean;
    pageSelection?: string;
    selectionType: 'all' | 'custom';
    pageCount?: number;
    type?: 'pdf' | 'word' | 'chapter'; 
    previewHtml?: string; 
    rawFile?: File; 
    title?: string; 
    description?: string; // <--- MUST HAVE THIS
    [key: string]: any;   // The "Safety Net" - allows any extra properties
  };
    
  let files = $state<FileItem[]>([]);
    // --- Add Chapter/Separator Page ---
    function addChapter() {
      // Use FileItem directly. This tells TS to check the master list above.
      const newChapter: FileItem = {
        id: crypto.randomUUID(),
        type: "chapter",
        title: "New Chapter",
        description: '', 
        name: "Separator Page", 
        selectionType: "all",
        isEditing: false
      };
      
      files = [...files, newChapter];
    }
    
  let activeFileId = $state<string | null>(null);
    /**
     * Synchronizes the sidebar selection with the canvas scroll position.
     * @param {string} fileId - The unique ID of the PDF file.
     */
    function handleSidebarSync(fileId: string) {
      activeFileId = String(fileId);
      const targetElement = document.getElementById(fileId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  let exportHistory = $state<{ name: string; date: string; url: string }[]>([]);
  let searchQuery = $state("");
  let isDragging = $state(false);
  let isExporting = $state(false);
  let exportProgress = $state(0);
  let showSuccess = $state(false);
  let fileInput: HTMLInputElement;
  let isDark = $state(false);
  let sidebarOpen = $state(false);
  let compressEnabled = $state(true);
  let settingsExpanded = $state(false);
  /**
   * Resample an image to ~150 DPI (max 1200px on long side), keeping aspect ratio.
   * @param {Uint8Array|ArrayBuffer} imageBytes - Raw image bytes.
   * @param {string} mimeType - 'image/jpeg' or 'image/png'.
   * @param {number} [maxDpi=150] - Target DPI (not used directly, but maxDim is set for 150 DPI).
   * @returns {Promise<Uint8Array>} - Compressed image bytes.
   */
  async function resampleImage(imageBytes: Uint8Array | ArrayBuffer, mimeType: string, maxDpi = 150) {
    return new Promise((resolve, reject) => {
      // Always convert to ArrayBuffer for Blob compatibility
      let arrayBuffer: ArrayBuffer;
      if (imageBytes instanceof Uint8Array) {
        arrayBuffer = imageBytes.buffer as ArrayBuffer;
      } else if (imageBytes instanceof ArrayBuffer) {
        arrayBuffer = imageBytes;
      } else {
        arrayBuffer = new ArrayBuffer(0);
      }
      const blob = new Blob([arrayBuffer], { type: mimeType });
      const img = new Image();
      img.onload = () => {
        // Target max dimension for 150 DPI (e.g., 8.5in * 150 = 1275px, so 1200px is a good cap)
        const maxDim = 1200;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas 2D context'));
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Always output JPEG for best compression
        canvas.toBlob(async (result) => {
          if (!result) return reject(new Error('Canvas export failed'));
          const buf = await result.arrayBuffer();
          resolve(new Uint8Array(buf));
        }, 'image/jpeg', 0.7);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  /**
   * Optimize PDF metadata and images (downscale images above 150 DPI)
   * Handles JPEG and PNG images. Uses browser canvas for resampling.
   */
  async function optimizeMetadataAndImages(pdfDoc, shouldOptimize) {
    // Metadata is the "Professional" touch
    pdfDoc.setTitle("ArchiveStream Unified Document");
    pdfDoc.setAuthor("ArchiveStream Workstation");
    pdfDoc.setSubject("Consolidated Digital Archive");
    pdfDoc.setProducer("ArchiveStream (Atelier Engine)");
    pdfDoc.setCreator("ArchiveStream Cloud Bridge");
    
    if (!shouldOptimize) return;

    // Additional Phase 3 logic: Force use of Object Streams to compress PDF structure
    // This is handled in the .save() call later, but we can tag it here.
  }

  async function shrinkImage(file, maxWidth = 1600, quality = 0.75) {
    const originalSizeKB = Math.round(file.size / 1024);
    console.group(`%c ArchiveStream Optimizer: ${file.name} `, 'background: #222; color: #bada55');
    console.log(`Original Size: ${originalSizeKB} KB`);

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          console.log(`Original Dimensions: ${width}px x ${height}px`);

          // Maintain aspect ratio while resizing
          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
            console.log(`%c Resizing to: ${Math.round(width)}px x ${Math.round(height)}px`, 'color: #ffa500');
          } else {
            console.log('%c Image width within limits. No resizing needed.', 'color: #888');
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to compressed JPEG
          canvas.toBlob((blob) => {
            const newSizeKB = Math.round(blob.size / 1024);
            const ratio = Math.round((1 - (blob.size / file.size)) * 100);
            
            console.log(`New Size: ${newSizeKB} KB`);
            if (ratio > 0) {
              console.log(`%c Efficiency: Reduced by ${ratio}%`, 'color: #00ff00; font-weight: bold');
            } else {
              console.log(`%c Note: File is ${Math.abs(ratio)}% larger after "optimization".`, 'color: #ff4444');
            }
            
            console.groupEnd();
            resolve(blob.arrayBuffer());
          }, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  import Sidebar from '$lib/components/Sidebar.svelte';
  import Canvas from '$lib/components/Canvas.svelte';
  import ContextMenu from '$lib/components/ContextMenu.svelte';
  import ExportOverlay from '$lib/components/ExportOverlay.svelte';
  import QRModal from '$lib/components/QRModal.svelte';

  import { store, watermarkStyles } from '$lib/stores/archiveState.svelte';
  import { shrinkImage, parsePageRanges, optimizeMetadataAndImages } from '$lib/utils/pdfUtils';
  import type { FileItem } from '$lib/types';

  // ─── File Input ────────────────────────────────────────────────────────────
  let fileInput = $state<HTMLInputElement | undefined>(undefined);

  // ─── Mount ─────────────────────────────────────────────────────────────────
  onMount(async () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') store.isDark = true;

    const savedHistory = localStorage.getItem('export_history');
    if (savedHistory) store.exportHistory = JSON.parse(savedHistory);

    const savedId = localStorage.getItem('activeArchiveId');
    const savedTime = localStorage.getItem('activeArchiveTime');

    if (savedId && savedTime) {
      const expiry = new Date(savedTime).getTime() + 5 * 60 * 60 * 1000;
      if (Date.now() > expiry) {
        await handleSessionExpiry(savedId);
      } else {
        store.currentSessionId = savedId;
        store.activeSessionTimestamp = savedTime;
        updateCountdown();
      }
    }

    store.files = [];
  });

  $effect(() => {
    localStorage.setItem('theme', store.isDark ? 'dark' : 'light');
    localStorage.setItem('export_history', JSON.stringify(store.exportHistory));
  });

  // ─── Context Menu ───────────────────────────────────────────────────────────
  function openContextMenu(e: MouseEvent, index: number) {
    e.preventDefault();
    store.menuPos.x = e.clientX;
    store.menuPos.y = e.clientY;
    store.activeFileIndex = index;
    store.menuVisible = true;
  }

  // ─── File Ingestion ─────────────────────────────────────────────────────────
  async function handleFiles(droppedFiles: File[]) {
    const valid = droppedFiles.filter(
      (f) =>
        f.type === 'application/pdf' ||
        f.type.includes('wordprocessingml') ||
        f.type.includes('presentationml') ||
        f.type.includes('spreadsheetml') ||
        f.type.startsWith('image/') ||
        f.name.endsWith('.docx') ||
        f.name.endsWith('.pptx') ||
        f.name.endsWith('.xlsx')
    );

    const newItems: FileItem[] = [];

    for (const file of valid) {
      const isWord = file.name.endsWith('.docx') || file.type.includes('wordprocessingml');
      const isPPT = file.name.endsWith('.pptx') || file.type.includes('presentationml');
      const isExcel = file.name.endsWith('.xlsx') || file.type.includes('spreadsheetml');
      const isOffice = isWord || isPPT || isExcel;
      const isImage = file.type.startsWith('image/');
      let previewHtml = '';
      let pageCount = 1;

      try {
        if (isWord) {
          const buf = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          previewHtml = result.value;
        } else if (!isImage && !isPPT && !isExcel) {
          const buf = await file.arrayBuffer();
          const pdf = await PDFDocument.load(buf);
          pageCount = pdf.getPageCount();
        }

        newItems.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: isWord ? 'word' : isPPT ? 'ppt' : isExcel ? 'excel' : isImage ? 'image' : 'pdf',
          url: URL.createObjectURL(file),
          previewHtml,
          rawFile: file,
          selectionType: 'all',
          pageCount,
        });
      } catch (e) {
        console.error(`Error processing ${file.name}:`, e);
      }
    }

    store.files = [...store.files, ...newItems];
  }

  // ─── Add Chapter ────────────────────────────────────────────────────────────
  function addChapter() {
    const chapter: FileItem = {
      id: crypto.randomUUID(),
      type: 'chapter',
      title: 'New Chapter',
      description: '',
      name: 'Separator Page',
      selectionType: 'all',
      isEditing: false,
    };
    store.files = [...store.files, chapter];
  }

  // ─── QR Modal ───────────────────────────────────────────────────────────────
  async function openQRModal() {
    if (!store.globalTheme.qrUrl) return;
    const QRCode = await import('qrcode');
    store.qrModalImage = await QRCode.toDataURL(store.globalTheme.qrUrl, {
      width: 600,
      margin: 2,
      color: { dark: '#0c0a09', light: '#ffffff' },
    });
    store.showQRModal = true;
  }

  // ─── Session Countdown ──────────────────────────────────────────────────────
  function updateCountdown() {
    if (!store.activeSessionTimestamp) return;
    const expiry = new Date(store.activeSessionTimestamp).getTime() + 5 * 60 * 60 * 1000;
    const diff = expiry - Date.now();

    if (diff <= 0) {
      store.timeLeft = 'EXPIRED';
      handleSessionExpiry();
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    store.timeLeft = `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
  }

  setInterval(updateCountdown, 30_000);

  async function handleSessionExpiry(sessionId?: string) {
    const id = sessionId || store.currentSessionId || localStorage.getItem('activeArchiveId');
    if (!id) return;

    try {
      await supabase.storage.from('archives').remove([`archive_${id}.pdf`]);
      await supabase.from('sessions').delete().eq('id', id);

      localStorage.removeItem('activeArchiveId');
      localStorage.removeItem('activeArchiveTime');
      store.activeSessionTimestamp = null;
      store.currentSessionId = '';
      store.timeLeft = 'EXPIRED';

      if (document.visibilityState === 'visible') {
        alert('Archive Shredded: The cloud copy and QR code are now gone.');
      }
    } catch (err: any) {
      console.error('Shredding failure:', err.message);
    }
  }

  // ─── Export ─────────────────────────────────────────────────────────────────
  async function handleExport() {
    if (store.files.length === 0 || store.isExporting) return;

    try {
      store.isExporting = true;
      store.showSuccess = false;
      store.exportProgress = 0;

      const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');
      const mergedPdf = await PDFDocument.create();

      // Normalise theme colours from 0-255 to 0-1
      const norm = (v: number) => (v > 1 ? v / 255 : v);
      const themePrimary = rgb(
        norm(store.globalTheme.primaryColor.r),
        norm(store.globalTheme.primaryColor.g),
        norm(store.globalTheme.primaryColor.b)
      );
      const themeAccent = rgb(
        norm(store.globalTheme.accentColor.r),
        norm(store.globalTheme.accentColor.g),
        norm(store.globalTheme.accentColor.b)
      );

      // Fonts — map our font keys to exact StandardFonts enum keys
      // StandardFonts enum: key=TimesRoman, value=Times-Roman (pdf-lib uses key for embedFont)
      const pdfFontMap: Record<string, string> = {
        'Helvetica':         'Helvetica',
        'Helvetica-Bold':    'HelveticaBold',
        'Helvetica-Oblique': 'HelveticaOblique',
        'Times-Roman':       'TimesRoman',
        'Times-Bold':        'TimesRomanBold',
        'Times-Italic':      'TimesRomanItalic',
        'Courier':           'Courier',
        'Courier-Bold':      'CourierBold',
        'Symbol':            'Symbol',
        'ZapfDingbats':      'ZapfDingbats',
      };
      const sf = StandardFonts as Record<string, string>;
      const fontKey = pdfFontMap[store.globalTheme.fontFamily] ?? 'Helvetica';
      const fontRegular = await mergedPdf.embedFont(sf[fontKey] ?? StandardFonts.Helvetica);
      // Bold variant for watermarks/chapter titles
      const boldFontKey = pdfFontMap[store.globalTheme.fontFamily + '-Bold']
        ?? (fontKey.includes('Times') ? 'TimesRomanBold' : 'HelveticaBold');
      const fontBold = await mergedPdf.embedFont(sf[boldFontKey] ?? StandardFonts.HelveticaBold);

      // ── MAIN LOOP ──
      for (let i = 0; i < store.files.length; i++) {
        const file = store.files[i];

        const totalPages = file.pageCount ?? 1;
        const allowedPages =
          file.selectionType === 'custom' && file.pageSelection
            ? parsePageRanges(file.pageSelection, totalPages)
            : Array.from({ length: totalPages }, (_, idx) => idx + 1);

        // ── CHAPTER ──
        if (file.type === 'chapter') {
          const page = mergedPdf.addPage([600, 800]);
          const { width, height } = page.getSize();
          const margin = 60;
          const maxW = width - margin * 2;

          page.drawRectangle({ x: 0, y: 0, width, height, color: themeAccent });

          const titleText = (file.title || 'Section').toUpperCase();
          let titleSize = store.globalTheme.chapterFontSize || 32;
          if (titleText.length > 25) titleSize *= 0.6;
          else if (titleText.length > 15) titleSize *= 0.8;

          page.drawText(titleText, {
            x: margin,
            y: height - 300,
            size: titleSize,
            font: fontBold,
            color: themePrimary,
            maxWidth: maxW,
            lineHeight: titleSize * 1.1,
          });

          const descText = file.description?.trim() ?? '';
          if (descText) {
            const titleLines = Math.ceil((titleText.length * titleSize * 0.6) / maxW);
            page.drawText(descText, {
              x: margin,
              y: height - 300 - titleLines * titleSize - 40,
              size: 16,
              font: fontRegular,
              color: themePrimary,
              maxWidth: maxW,
              lineHeight: 20,
              opacity: 0.75,
            });
          }
        }

        // ── OFFICE FILES (DOCX / PPTX / XLSX) ──
        // Sends file to Supabase Edge Function → ConvertAPI → PDF
        else if (file.type === 'word' || file.type === 'ppt' || file.type === 'excel') {
          if (!file.rawFile) {
            console.warn('Word file missing rawFile, skipping:', file.name);
          } else {
            try {
              const form = new FormData();
              form.append('file', file.rawFile, file.rawFile.name);

              const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;
              const res = await supabase.functions.invoke('docx-to-pdf', {
                body: form,
                headers: { Authorization: `Bearer ${anonKey}` },
              });
              if (res.error) throw new Error(res.error.message);

              const pdfBuf: ArrayBuffer = res.data instanceof ArrayBuffer
                ? res.data
                : await (res.data as Blob).arrayBuffer();

              const wordDoc = await PDFDocument.load(pdfBuf);
              const total = wordDoc.getPageCount();

              // Update the file's real page count now that we know it
              file.pageCount = total;

              // Re-calculate allowedPages using the REAL total, not the old cached 1
              const realIndices = (file.selectionType === 'custom' && file.pageSelection)
                ? parsePageRanges(file.pageSelection, total).map((p) => p - 1).filter((idx) => idx >= 0 && idx < total)
                : Array.from({ length: total }, (_, idx) => idx);

              if (realIndices.length > 0) {
                const pages = await mergedPdf.copyPages(wordDoc, realIndices);
                pages.forEach((p) => mergedPdf.addPage(p));
              }
            } catch (err) {
              console.error('DOCX → PDF conversion failed:', err);
              alert(`Failed to convert "${file.name}".\nError: ${err}`);
            }
          }
        }

        // ── IMAGE ──
        else if (file.type === 'image' || file.rawFile?.type.startsWith('image/')) {
          try {
            let imgBuffer: ArrayBuffer;
            if (store.compressEnabled) {
              imgBuffer = await shrinkImage(file.rawFile!, 1600, 0.8);
            } else {
              imgBuffer = await file.rawFile!.arrayBuffer();
            }

            const isPNG = !store.compressEnabled && file.rawFile?.type === 'image/png';
            const embeddedImg = isPNG
              ? await mergedPdf.embedPng(imgBuffer)
              : await mergedPdf.embedJpg(imgBuffer);

            // ── SIZE MODE ──
            const sizeMode = file.imageSizeMode || 'original';

            let pageW: number;
            let pageH: number;
            let drawW: number;
            let drawH: number;

            if (sizeMode === 'fit') {
              // A4 in points (1pt = 1/72 inch): 595 × 842
              pageW = 595.28;
              pageH = 841.89;
              // Stretch to fill — no letterbox, image fills the whole page
              drawW = pageW;
              drawH = pageH;
            } else if (sizeMode === 'custom') {
              // User-defined px — treat px as pt (close enough for screen/print)
              pageW = file.imageCustomWidth || embeddedImg.width;
              pageH = file.imageCustomHeight || embeddedImg.height;
              drawW = pageW;
              drawH = pageH;
            } else {
              // Original — page = image's natural dimensions
              pageW = embeddedImg.width;
              pageH = embeddedImg.height;
              drawW = embeddedImg.width;
              drawH = embeddedImg.height;
            }

            const page = mergedPdf.addPage([pageW, pageH]);
            page.drawImage(embeddedImg, { x: 0, y: 0, width: drawW, height: drawH });

          } catch (err) {
            console.error('Image processing error:', err);
          }
        }

        // ── STANDARD PDF ──
        else if (file.rawFile) {
          const pdfBytes = await file.rawFile.arrayBuffer();
          const pdf = await PDFDocument.load(pdfBytes);
          const maxPages = pdf.getPageCount();
          const indices =
            file.selectionType === 'custom' && file.pageSelection
              ? parsePageRanges(file.pageSelection, maxPages).map((n) => n - 1)
              : Array.from({ length: maxPages }, (_, idx) => idx);

          if (indices.length > 0) {
            const copied = await mergedPdf.copyPages(pdf, indices);
            copied.forEach((p) => mergedPdf.addPage(p));
          }
        }

        store.exportProgress = Math.round(((i + 1) / store.files.length) * 100);
      }

      // ── WATERMARK ──
      if (store.activeWatermark !== 'NONE') {
        const style = watermarkStyles[store.activeWatermark];
        mergedPdf.getPages().forEach((page) => {
          const { width, height } = page.getSize();
          page.drawText(style.text, {
            x: width / 4,
            y: height / 3,
            size: 70,
            font: fontBold,
            color: themePrimary,
            rotate: degrees(45),
            opacity: style.opacity ?? 0.15,
          });
        });
      }

      // ── METADATA ──
      await optimizeMetadataAndImages(mergedPdf, !!store.compressEnabled);

      // ── LOCAL DOWNLOAD ──
      const mergedBytes = await mergedPdf.save({ useObjectStreams: !!store.compressEnabled });
      const blob = new Blob([mergedBytes.buffer.slice(0) as ArrayBuffer], { type: 'application/pdf' });
      const exportUrl = URL.createObjectURL(blob);
      const fileName = `ArchiveStream_${Date.now()}.pdf`;

      const link = document.createElement('a');
      link.href = exportUrl;
      link.download = fileName;
      link.click();

      // ── CLOUD UPLOAD ──
      try {
        const { data: session } = await supabase.from('sessions').insert({}).select().single();
        if (!session?.id) throw new Error('Session creation failed');

        store.currentSessionId = session.id;
        store.activeSessionTimestamp = session.uploaded_at;
        updateCountdown();

        const queueEntries = store.files.map((f, idx) => ({
          session_id: session.id,
          file_name: f.name || f.title || 'Untitled',
          file_size_kb: Math.round((f.rawFile?.size ?? 0) / 1024),
          sort_order: idx,
        }));
        await supabase.from('document_queue').insert(queueEntries);

        const cloudName = `archive_${session.id}.pdf`;
        const { error: uError } = await supabase.storage.from('archives').upload(cloudName, mergedBytes);
        if (uError) throw uError;

        const { data: { publicUrl } } = supabase.storage.from('archives').getPublicUrl(cloudName);
        store.globalTheme.qrUrl = publicUrl;

        store.exportHistory = [
          { name: fileName, date: new Date().toLocaleTimeString(), url: exportUrl, cloudUrl: publicUrl },
          ...store.exportHistory,
        ].slice(0, 5);
      } catch (cloudErr) {
        console.warn('Cloud sync failed. QR unavailable.', cloudErr);
      }

      store.showSuccess = true;
      setTimeout(() => {
        store.isExporting = false;
        store.showSuccess = false;
      }, 2500);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Check the console for details.');
      store.isExporting = false;
    }
  }
</script>

<!-- Hidden file input -->
<input
  bind:this={fileInput}
  type="file"
  multiple
  accept=".pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp"
  class="hidden"
  onchange={(e) => { if (e.currentTarget.files) handleFiles(Array.from(e.currentTarget.files)); }}
/>

<!-- Overlays -->
<ExportOverlay />
<ContextMenu />
<QRModal onShred={() => handleSessionExpiry()} />

<!-- Layout -->
<div
  class="flex h-screen w-full transition-colors duration-500 font-sans overflow-hidden relative"
  style="background-color: {store.isDark ? 'rgb(12 10 9)' : store.globalTheme.accentColor.hex}; color: {store.isDark ? 'rgb(231 229 228)' : 'rgb(28 25 23)'};"
>
  <Sidebar fileInput={fileInput} onImport={() => fileInput?.click()} />

  <main
    class="flex-1 relative flex flex-col min-w-0 transition-colors duration-500"
    style="background-color: {store.isDark ? '#0c0a09' : '#ffffff'};"
    ondragover={(e) => { e.preventDefault(); store.isDragging = true; }}
    ondragleave={() => (store.isDragging = false)}
    ondrop={(e) => { e.preventDefault(); store.isDragging = false; if (e.dataTransfer) handleFiles(Array.from(e.dataTransfer.files)); }}
  >
    <!-- Mobile sidebar toggle -->
    <button
      class="absolute top-4 left-4 z-30 md:hidden rounded-lg p-2 shadow-md border
             {store.isDark ? 'bg-stone-900/80 border-stone-800' : 'bg-white/80 border-stone-200'}"
      onclick={() => (store.sidebarOpen = true)}
      aria-label="Open sidebar"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 {store.isDark ? 'text-stone-200' : 'text-stone-700'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    {#if store.files.length === 0}
      <!-- Empty state -->
      <div class="flex-1 flex flex-col items-center justify-center opacity-30 px-4">
        <div
          class="w-14 h-14 md:w-16 md:h-16 mb-4 border border-dashed rounded-full flex items-center justify-center cursor-pointer hover:bg-amber-600/10 transition
                 {store.isDark ? 'border-stone-700' : 'border-stone-400'}"
          onclick={() => fileInput?.click()}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput?.click()}
          tabindex="0"
          role="button"
          aria-label="Import PDF"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 {store.isDark ? 'text-stone-400' : 'text-stone-600'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <p class="text-xs font-bold tracking-[0.3em] uppercase text-center {store.isDark ? 'text-stone-400' : 'text-stone-600'}">
          Drop Files to Begin
        </p>
      </div>
    {:else}
      <!-- View mode toggle -->
      <div class="absolute top-4 right-4 z-30 flex gap-2">
        <button
          onclick={() => (store.viewMode = 'stream')}
          class="p-2 rounded-lg transition-all {store.viewMode === 'stream' ? (store.isDark ? 'bg-amber-600 text-white' : 'bg-stone-900 text-white') : (store.isDark ? 'bg-stone-900 text-stone-500' : 'bg-white text-stone-400')}"
          aria-label="Stream view"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          onclick={() => (store.viewMode = 'grid')}
          class="p-2 rounded-lg transition-all {store.viewMode === 'grid' ? (store.isDark ? 'bg-amber-600 text-white' : 'bg-stone-900 text-white') : (store.isDark ? 'bg-stone-900 text-stone-500' : 'bg-white text-stone-400')}"
          aria-label="Grid view"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
        </button>
      </div>

      <!-- Scrollable canvas area -->
      <div class="flex-1 overflow-y-auto p-4 pt-20 md:p-8 md:pt-20 pb-32 custom-scrollbar scroll-smooth">
        {#if viewMode === 'stream'}
          <div class="max-w-4xl mx-auto space-y-12 md:space-y-24">
            {#each files as file, i (file.id)}
              {#if file.type === 'chapter'}
                <section id={file.id ? String(file.id) : undefined} class="max-w-4xl mx-auto my-12 group transition-all">
                  <div class="bg-stone-50 {isDark ? 'bg-stone-900/30' : 'bg-stone-50'} border-2 border-dashed {isDark ? 'border-stone-800' : 'border-stone-200'} rounded-2xl p-12 md:p-20 flex flex-col items-center justify-center">
                    
                    <span class="text-[10px] font-black uppercase tracking-[0.4em] text-amber-600 mb-8">Section Break</span>
                    
                    <textarea 
                      bind:value={file.title}
                      rows="1"
                      class="bg-transparent text-4xl md:text-6xl font-serif text-stone-800 {isDark ? 'text-stone-200' : 'text-stone-800'} text-center w-full outline-none border-b border-transparent focus:border-amber-500/30 pb-4 transition-all resize-none overflow-hidden"
                      placeholder="Enter Title..."
                      oninput={(e) => {
                        e.currentTarget.style.height = 'auto';
                        e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                      }}
                    ></textarea>

                    <textarea 
                      bind:value={file.description}
                      class="mt-6 bg-transparent text-base md:text-xl font-sans text-stone-500 text-center w-full max-w-2xl outline-none resize-none overflow-hidden opacity-70 focus:opacity-100"
                      placeholder="Add a subtitle..."
                      oninput={(e) => {
                        e.currentTarget.style.height = 'auto';
                        e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                      }}
                    ></textarea>

                    <div class="mt-10 flex gap-4">
                      <button 
                        onclick={() => removeFile(typeof file.id === 'number' ? file.id : undefined, i)} 
                        class="px-4 py-2 text-[10px] font-bold text-red-500/70 hover:text-red-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all border border-transparent hover:border-red-500/20 rounded-lg"
                      >
                        Remove Chapter
                      </button>
                    </div>
                  </div>
                </section>
              {:else if file.type === 'word'}
                <section 
                  id={file.id ? String(file.id) : ''} 
                  class="group transition-all duration-300 {activeFileId === String(file.id) ? (isDark ? 'ring-2 ring-amber-500' : 'ring-2 ring-amber-400') : ''}"
                >
                  <div class="flex flex-wrap items-center justify-between gap-4 mb-4 px-4 py-3 bg-stone-50 {isDark ? 'bg-stone-900/50' : 'bg-stone-50'} rounded-lg border {isDark ? 'border-stone-800' : 'border-stone-200'}">
                    <div class="flex items-center gap-3">
                      <span class="text-[10px] font-black uppercase tracking-tighter {isDark ? 'text-stone-400' : 'text-stone-500'}">Scope:</span>
                      <div class="flex bg-stone-200 {isDark ? 'bg-stone-800' : 'bg-stone-200'} p-1 rounded-md">
                        <button 
                          onclick={() => { 
                            file.selectionType = 'all'; 
                            if ('pageSelection' in file) file.pageSelection = 'all'; 
                          }}
                          class="px-3 py-1 text-[10px] font-bold rounded {file.selectionType !== 'custom' ? (isDark ? 'bg-stone-700 text-white' : 'bg-white text-stone-900 shadow-sm') : 'text-stone-500'}">
                          ALL
                        </button>
                        <button 
                          onclick={() => { 
                            file.selectionType = 'custom'; 
                            if ('pageSelection' in file) {
                              if (!file.pageSelection || file.pageSelection === 'all') file.pageSelection = '';
                            }
                          }}
                          class="px-3 py-1 text-[10px] font-bold rounded {file.selectionType === 'custom' ? (isDark ? 'bg-amber-600 text-white' : 'bg-stone-900 text-white shadow-sm') : 'text-stone-500'}">
                          CUSTOM
                        </button>
                      </div>
                    </div>
                    {#if file.selectionType === 'custom'}
                      <div class="flex-1 max-w-xs relative">
                        <input 
                          type="text" 
                          placeholder="e.g. 1, 3-5, 10" 
                          bind:value={file.pageSelection}
                          class="w-full pl-3 pr-10 py-1.5 text-xs font-mono bg-transparent border-b-2 {isDark ? 'border-stone-700 focus:border-amber-500' : 'border-stone-300 focus:border-stone-900'} outline-none transition-colors"
                        />
                        <span class="absolute right-0 top-1.5 text-[9px] font-bold {isDark ? 'text-stone-600' : 'text-stone-400'}">
                          PG. RANGE
                        </span>
                      </div>
                    {/if}
                    <div class="text-[10px] font-bold {isDark ? 'text-amber-500' : 'text-stone-400'}">
                      {file.selectionType === 'custom' ? 'PARTIAL EXPORT' : 'FULL DOCUMENT'}
                    </div>
                  </div>
                  <div class="flex items-center gap-4 mb-4 px-2 md:px-0">
                    <span class="text-[10px] font-bold {isDark ? 'text-stone-500' : 'text-stone-400'} uppercase tracking-[0.2em]">
                      {file.name}
                    </span>
                    <div class="h-px flex-1 {isDark ? 'bg-stone-800' : 'bg-stone-200'}"></div>
                  </div>
                  <div class="bg-white shadow-lg mx-auto p-6 md:p-12.5 w-[92%] md:w-200.75 text-left">
                    {@html file.previewHtml}
                  </div>
                </section>
              {:else}
                <section 
                  id={file.id ? String(file.id) : ''} 
                  class="group transition-all duration-300 {activeFileId === String(file.id) ? (isDark ? 'ring-2 ring-amber-500' : 'ring-2 ring-amber-400') : ''}"
                >
                  <div class="flex flex-wrap items-center justify-between gap-4 mb-4 px-4 py-3 bg-stone-50 {isDark ? 'bg-stone-900/50' : 'bg-stone-50'} rounded-lg border {isDark ? 'border-stone-800' : 'border-stone-200'}">
                    <div class="flex items-center gap-3">
                      <span class="text-[10px] font-black uppercase tracking-tighter {isDark ? 'text-stone-400' : 'text-stone-500'}">Scope:</span>
                      <div class="flex bg-stone-200 {isDark ? 'bg-stone-800' : 'bg-stone-200'} p-1 rounded-md">
                        <button 
                          onclick={() => { 
                            file.selectionType = 'all'; 
                            if ('pageSelection' in file) file.pageSelection = 'all'; 
                          }}
                          class="px-3 py-1 text-[10px] font-bold rounded {file.selectionType !== 'custom' ? (isDark ? 'bg-stone-700 text-white' : 'bg-white text-stone-900 shadow-sm') : 'text-stone-500'}">
                          ALL
                        </button>
                        <button 
                          onclick={() => { 
                            file.selectionType = 'custom'; 
                            if ('pageSelection' in file) {
                              if (!file.pageSelection || file.pageSelection === 'all') file.pageSelection = '';
                            }
                          }}
                          class="px-3 py-1 text-[10px] font-bold rounded {file.selectionType === 'custom' ? (isDark ? 'bg-amber-600 text-white' : 'bg-stone-900 text-white shadow-sm') : 'text-stone-500'}">
                          CUSTOM
                        </button>
                      </div>
                    </div>
                    {#if file.selectionType === 'custom'}
                      <div class="flex-1 max-w-xs relative">
                        <input 
                          type="text" 
                          placeholder="e.g. 1, 3-5, 10" 
                          bind:value={file.pageSelection}
                          class="w-full pl-3 pr-10 py-1.5 text-xs font-mono bg-transparent border-b-2 {isDark ? 'border-stone-700 focus:border-amber-500' : 'border-stone-300 focus:border-stone-900'} outline-none transition-colors"
                        />
                        <span class="absolute right-0 top-1.5 text-[9px] font-bold {isDark ? 'text-stone-600' : 'text-stone-400'}">
                          PG. RANGE
                        </span>
                      </div>
                    {/if}
                    <div class="text-[10px] font-bold {isDark ? 'text-amber-500' : 'text-stone-400'}">
                      {file.selectionType === 'custom' ? 'PARTIAL EXPORT' : 'FULL DOCUMENT'}
                    </div>
                  </div>
                  <div class="flex items-center gap-4 mb-4 px-2 md:px-0">
                    <span class="text-[10px] font-bold {isDark ? 'text-stone-500' : 'text-stone-400'} uppercase tracking-[0.2em]">
                      {file.name}
                    </span>
                    <div class="h-px flex-1 {isDark ? 'bg-stone-800' : 'bg-stone-200'}"></div>
                  </div>
                  <div class="bg-white rounded-xl shadow-2xl overflow-hidden border {isDark ? 'border-stone-800' : 'border-stone-200'}">
                    <iframe src={file.url} title={file.name} class="w-full h-[60vh] md:h-[85vh]"></iframe>
                  </div>
                </section>
              {/if}
            {/each}
          </div>
        {:else}
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 max-w-7xl mx-auto">
            {#each files as file, i (file.id)}
              <div 
                draggable="true"
                role="listitem"
                aria-grabbed={draggedIndex === i}
                ondragstart={() => draggedIndex = i}
                ondragover={(e) => { e.preventDefault(); dragOverIndex = i; }}
                ondrop={() => handleDrop(i)}
                class="group relative aspect-3/4 rounded-2xl border-2 transition-all duration-300 cursor-grab active:cursor-grabbing flex flex-col items-center justify-center p-4 text-center
                {draggedIndex === i ? 'opacity-20 scale-95' : 'opacity-100'}
                {dragOverIndex === i ? 'border-amber-500 bg-amber-500/5' : (isDark ? 'border-stone-800 bg-stone-900/40 hover:border-stone-600' : 'border-stone-200 bg-white shadow-sm hover:border-amber-500')}"
              >
                <div class="absolute top-3 left-3 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold {isDark ? 'bg-stone-800 text-stone-400' : 'bg-stone-100 text-stone-500'}">
                  {i + 1}
                </div>

                <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-4 {isDark ? 'text-stone-700' : 'text-stone-200'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>

                <p class="text-[10px] font-bold uppercase tracking-widest leading-tight px-2 wrap-break-word line-clamp-2 {isDark ? 'text-stone-400 group-hover:text-stone-200' : 'text-stone-600 group-hover:text-black'}">
                  {file.name}
                </p>

                <button 
                  aria-label="Remove file"
                  onclick={(e) => { 
                    e.stopPropagation(); 
                    removeFile(typeof file.id === 'number' ? file.id : undefined, i); 
                  }}
                  class="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {#if showQRModal}
        <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm" onclick={() => showQRModal = false}>
          <div class="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl transform transition-all border border-stone-200" onclick={(e) => e.stopPropagation()}>
            <div class="flex flex-col items-center text-center space-y-6">
              
              <div class="space-y-1">
                <h3 class="text-stone-950 font-black text-xs tracking-[0.3em] uppercase">Digital Archive Bridge</h3>
                <div class="flex items-center justify-center gap-1.5 py-1 px-3 bg-red-50 border border-red-100 rounded-full">
                  <div class="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                  <span class="text-[9px] font-bold text-red-600 uppercase tracking-tighter">Qr will be not availaible in {timeLeft}</span>
                </div>
              </div>
              
              <div class="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                {#if qrModalImage}
                  <img src={qrModalImage} alt="QR Code" class="w-64 h-64" />
                {:else}
                  <div class="w-64 h-64 flex items-center justify-center text-stone-400 text-[10px] italic text-balance">
                    Generate an export first to activate link.
                  </div>
                {/if}
              </div>

              <div class="space-y-2 w-full">
                <p class="text-[10px] text-stone-500 font-medium">Scan this to download your archive directly to any mobile device.</p>
                <p class="text-[9px] text-stone-400 break-all font-mono opacity-60 uppercase">{globalTheme.qrUrl || 'No link generated yet'}</p>
              </div>

              <p class="text-[8px] text-stone-400 italic">
                Files are permanently shredded from the bridge after 5 hours for your privacy.
              </p>

              {#if currentSessionId}
                <button 
                  onclick={() => {
                    if(confirm("ATELIER SECURITY: Permanently shred the cloud archive now?")) handleSessionExpiry();
                  }}
                  class="w-full py-2 bg-white text-red-600 border border-red-200 rounded-xl font-bold text-[9px] tracking-[0.2em] uppercase hover:bg-red-50 transition-colors"
                >
                  🗑️ Shred Cloud Archive
                </button>
              {/if}

              <button 
                onclick={() => showQRModal = false}
                class="w-full py-4 bg-stone-900 text-white rounded-xl font-bold text-[10px] tracking-widest uppercase hover:bg-black transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      {/if}
      <div class="fixed md:absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4 pointer-events-none">
        <div class="flex flex-col items-center gap-4 pointer-events-auto">
          <button 
            onclick={() => compressEnabled = !compressEnabled}
            class="flex items-center gap-3 px-4 py-2 rounded-full border transition-all shadow-sm
            {isDark ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'}">
            <span class="text-[9px] font-black uppercase tracking-widest {isDark ? 'text-stone-500' : 'text-stone-400'}">
              {compressEnabled ? 'Compression On' : 'Original Quality'}
            </span>
            <div class="w-8 h-4 rounded-full relative transition-colors {compressEnabled ? 'bg-amber-600' : 'bg-stone-300'}">
              <div class="absolute top-0.5 transition-all {compressEnabled ? 'right-0.5' : 'left-0.5'} w-3 h-3 bg-white rounded-full"></div>
            </div>
          </button>
          <div class="flex justify-center w-full gap-2">
            <button onclick={addChapter} class="flex-1 py-4 bg-stone-200 hover:bg-amber-100 text-amber-700 rounded-full font-bold text-[10px] tracking-[0.3em] uppercase shadow-xl transition-all border border-stone-300">
              + Chapter
            </button>
            <button onclick={handleExport} disabled={isExporting} class="flex-2 py-4 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 text-white rounded-full font-bold text-[10px] tracking-[0.3em] uppercase shadow-2xl transition-all">
              {isExporting ? 'Compressing...' : 'Export PDF'}
            </button>
            <button 
              onclick={openQRModal}
              class="aspect-square h-[52px] relative flex items-center justify-center bg-stone-950 hover:bg-black text-white rounded-2xl transition-all shadow-xl border border-stone-800 group shrink-0"
              title="View QR Code"
            >
              {#if globalTheme.qrUrl}
                <span class="absolute -top-1 -right-1 flex h-3 w-3">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
              {/if}

              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:rotate-90 transition-transform duration-300">
                <rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    font-family: 'Inter', sans-serif;
  }
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #44403c; border-radius: 10px; }

  :global(.word-preview-container table) {
    width: 100% !important;
    table-layout: fixed;
    border-collapse: collapse;
    margin-bottom: 1rem;
  }
  :global(.word-preview-container td),
  :global(.word-preview-container th) {
    border: 1px solid #ddd;
    padding: 8px;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
</style>