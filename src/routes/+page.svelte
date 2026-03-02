<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';
  import { PDFDocument } from 'pdf-lib';
  import mammoth from 'mammoth';

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
        f.type.startsWith('image/') ||
        f.name.endsWith('.docx')
    );

    const newItems: FileItem[] = [];

    for (const file of valid) {
      const isWord = file.name.endsWith('.docx') || file.type.includes('wordprocessingml');
      const isImage = file.type.startsWith('image/');
      let previewHtml = '';
      let pageCount = 1;

      try {
        if (isWord) {
          const buf = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          previewHtml = result.value;
        } else if (!isImage) {
          const buf = await file.arrayBuffer();
          const pdf = await PDFDocument.load(buf);
          pageCount = pdf.getPageCount();
        }

        newItems.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: isWord ? 'word' : isImage ? 'image' : 'pdf',
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

      // Fonts
      const fontName = store.globalTheme.fontFamily || 'Helvetica';
      const fontRegular = await mergedPdf.embedFont(StandardFonts[fontName] ?? StandardFonts.Helvetica);
      let fontBold = fontRegular;
      for (const variant of [`${fontName}Bold`, `${fontName}-Bold`]) {
        if (StandardFonts[variant]) {
          fontBold = await mergedPdf.embedFont(StandardFonts[variant]);
          break;
        }
      }
      if (fontBold === fontRegular) {
        fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
      }

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

        // ── WORD DOC ──
        else if (file.type === 'word') {
          // Requires: npm i html2pdf.js
          const html2pdf = (await import('html2pdf.js')).default;
          const worker = document.createElement('div');

          const isMidnight = store.globalTheme.preset === 'midnight';
          const exportBg = isMidnight ? '#ffffff' : store.globalTheme.accentColor.hex;
          const exportText = isMidnight ? '#1a1a1a' : store.globalTheme.primaryColor.hex;

          Object.assign(worker.style, {
            width: '650px',
            padding: '40px',
            backgroundColor: exportBg,
            color: exportText,
            fontFamily: store.globalTheme.fontFamily || 'serif',
            fontSize: `${store.globalTheme.bodyFontSize || 11}pt`,
            lineHeight: '1.6',
            webkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          });

          worker.innerHTML = file.previewHtml || '';

          worker.querySelectorAll<HTMLElement>('*').forEach((el) => {
            el.style.color = 'inherit';
            el.style.borderColor = 'currentColor';
          });
          worker.querySelectorAll<HTMLTableElement>('table').forEach((t) => {
            t.style.width = '100%';
            t.style.borderCollapse = 'collapse';
            t.style.backgroundColor = 'transparent';
            t.querySelectorAll<HTMLElement>('td, th').forEach((cell) => {
              cell.style.border = `1px solid ${exportText}`;
              cell.style.padding = '8px';
            });
          });
          worker.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.margin = '20px auto';
          });

          document.body.appendChild(worker);
          try {
            const pdfBuf: ArrayBuffer = await html2pdf()
              .set({
                margin: 0.5,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: exportBg },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all'] },
              })
              .from(worker)
              .outputPdf('arraybuffer');

            const wordDoc = await PDFDocument.load(pdfBuf);
            const total = wordDoc.getPageCount();
            const indices = allowedPages.map((p) => p - 1).filter((idx) => idx >= 0 && idx < total);
            if (indices.length > 0) {
              const pages = await mergedPdf.copyPages(wordDoc, indices);
              pages.forEach((p) => mergedPdf.addPage(p));
            }
          } finally {
            document.body.removeChild(worker);
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

            if (allowedPages.includes(1)) {
              const page = mergedPdf.addPage([embeddedImg.width, embeddedImg.height]);
              page.drawImage(embeddedImg, { x: 0, y: 0, width: embeddedImg.width, height: embeddedImg.height });
            }
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
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
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
  accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp"
  class="hidden"
  onchange={(e) => { if (e.currentTarget.files) handleFiles(Array.from(e.currentTarget.files)); }}
/>

<!-- Overlays -->
<ExportOverlay />
<ContextMenu />
<QRModal onShred={() => handleSessionExpiry()} />

<!-- Layout -->
<div
  class="flex h-screen w-full transition-colors duration-500 font-sans overflow-hidden relative
         {store.isDark ? 'bg-stone-950 text-stone-200' : 'bg-stone-50 text-stone-900'}"
>
  <Sidebar fileInput={fileInput} onImport={() => fileInput?.click()} />

  <main
    class="flex-1 relative flex flex-col min-w-0 transition-colors duration-500
           {store.isDragging ? 'bg-amber-600/5' : store.isDark ? 'bg-[#0c0a09]' : 'bg-stone-50'}"
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
        <Canvas
          onOpenContextMenu={openContextMenu}
          onAddChapter={addChapter}
          onExport={handleExport}
          onOpenQR={openQRModal}
        />
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