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
  import PasswordModal from '$lib/components/PasswordModal.svelte';
  import CoverEditor from '$lib/components/CoverEditor.svelte';
  import PageReorderModal from '$lib/components/PageReorderModal.svelte';

  import { store, watermarkStyles } from '$lib/stores/archiveState.svelte';
  import { shrinkImage, parsePageRanges, optimizeMetadataAndImages } from '$lib/utils/pdfUtils';
  import type { FileItem } from '$lib/types';

  // ─── File Input ────────────────────────────────────────────────────────────
  let fileInput = $state<HTMLInputElement | undefined>(undefined);

  // ─── Password Protection ───────────────────────────────────────────────────
  let showPassword = $state(false);
  // ─── Mount ─────────────────────────────────────────────────────────────────
  onMount(() => {
    // Lock scroll for app, restore on unmount
    document.body.style.overflow = 'hidden';

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') store.isDark = true;

    const savedHistory = localStorage.getItem('export_history');
    if (savedHistory) store.exportHistory = JSON.parse(savedHistory);

    const savedId = localStorage.getItem('activeArchiveId');
    const savedTime = localStorage.getItem('activeArchiveTime');

    if (savedId && savedTime) {
      const expiry = new Date(savedTime).getTime() + 5 * 60 * 60 * 1000;
      if (Date.now() > expiry) {
        handleSessionExpiry(savedId);
      } else {
        store.currentSessionId = savedId;
        store.activeSessionTimestamp = savedTime ?? undefined;
        updateCountdown();
      }
    }

    store.files = [];

    return () => { document.body.style.overflow = ''; };
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
  function handleExport() {
    if (store.files.length === 0 || store.isExporting) return;
    store.exportPassword = '';
    store.showPasswordModal = true;
  }

  async function runExport() {
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

        // ── COVER PAGE ──
        if (file.type === 'cover') {
          const page = mergedPdf.addPage([600, 800]);
          const { width, height } = page.getSize();
          page.drawRectangle({ x: 0, y: 0, width, height, color: themeAccent });

          let logoY = height - 160;
          if (file.coverLogoFile) {
            try {
              const logoBytes = await file.coverLogoFile.arrayBuffer();
              const isLogoPng = file.coverLogoFile.type === 'image/png';
              const logoImg = isLogoPng ? await mergedPdf.embedPng(logoBytes) : await mergedPdf.embedJpg(logoBytes);
              const logoSize = 80;
              page.drawImage(logoImg, { x: (width - logoSize) / 2, y: height - 160, width: logoSize, height: logoSize });
              logoY = height - 200;
            } catch {}
          }

          page.drawLine({ start: { x: width / 2 - 30, y: logoY - 20 }, end: { x: width / 2 + 30, y: logoY - 20 }, thickness: 1, color: themePrimary, opacity: 0.2 });

          if (file.coverTitle) {
            let titleSize = 36;
            const maxW = width - 120;
            if (file.coverTitle.length > 20) titleSize = 28;
            if (file.coverTitle.length > 35) titleSize = 22;
            const titleWidth = fontBold.widthOfTextAtSize(file.coverTitle, titleSize);
            page.drawText(file.coverTitle, { x: (width - Math.min(titleWidth, maxW)) / 2, y: logoY - 80, size: titleSize, font: fontBold, color: themePrimary, maxWidth: maxW, lineHeight: titleSize * 1.2 });
          }

          if (file.coverSubtitle) {
            const subWidth = fontRegular.widthOfTextAtSize(file.coverSubtitle, 16);
            page.drawText(file.coverSubtitle, { x: (width - Math.min(subWidth, width - 120)) / 2, y: logoY - 140, size: 16, font: fontRegular, color: themePrimary, opacity: 0.65, maxWidth: width - 120, lineHeight: 22 });
          }

          page.drawLine({ start: { x: 60, y: 140 }, end: { x: width - 60, y: 140 }, thickness: 0.5, color: themePrimary, opacity: 0.15 });

          if (file.coverAuthor) {
            page.drawText(file.coverAuthor, { x: 60, y: 110, size: 13, font: fontRegular, color: themePrimary, opacity: 0.6 });
          }
          if (file.coverDate) {
            const dateWidth = fontRegular.widthOfTextAtSize(file.coverDate, 11);
            page.drawText(file.coverDate, { x: width - 60 - dateWidth, y: 110, size: 11, font: fontRegular, color: themePrimary, opacity: 0.4 });
          }
        }

        // ── CHAPTER ──
        else if (file.type === 'chapter') {
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

          // Use custom page order if set, otherwise use selection/all
          let indices: number[];
          if (file.pageReorderMap && file.pageReorderMap.length > 0) {
            indices = file.pageReorderMap.filter(i => i >= 0 && i < maxPages);
          } else {
            indices = file.selectionType === 'custom' && file.pageSelection
              ? parsePageRanges(file.pageSelection, maxPages).map((n) => n - 1)
              : Array.from({ length: maxPages }, (_, idx) => idx);
          }

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

      // ── PAGE NUMBERING ──
      if (store.globalTheme.pageNumbering) {
        const pages = mergedPdf.getPages();
        const total = pages.length;
        pages.forEach((page, idx) => {
          const { width } = page.getSize();
          const label = `${idx + 1} / ${total}`;
          const labelWidth = fontRegular.widthOfTextAtSize(label, 9);
          page.drawText(label, {
            x: width - 40 - labelWidth,
            y: 20,
            size: 9,
            font: fontRegular,
            color: themePrimary,
            opacity: 0.4,
          });
        });
      }

      // ── METADATA ──
      await optimizeMetadataAndImages(mergedPdf, !!store.compressEnabled);

      // ── LOCAL DOWNLOAD ──
      const mergedBytes = await mergedPdf.save({ useObjectStreams: !!store.compressEnabled });

      // ── PASSWORD ENCRYPT via edge function ──
      let finalBytes: Uint8Array = mergedBytes;
      if (store.exportPassword.trim()) {
        try {
          const pwForm = new FormData();
          pwForm.append('file', new Blob([mergedBytes.buffer.slice(0) as ArrayBuffer], { type: 'application/pdf' }), 'doc.pdf');
          pwForm.append('password', store.exportPassword.trim());
          const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;
          const pwRes = await supabase.functions.invoke('encrypt-pdf', {
            body: pwForm,
            headers: { Authorization: `Bearer ${anonKey}` },
          });
          if (!pwRes.error && pwRes.data) {
            const buf: ArrayBuffer = pwRes.data instanceof ArrayBuffer
              ? pwRes.data
              : await (pwRes.data as Blob).arrayBuffer();
            finalBytes = new Uint8Array(buf);
          }
        } catch (encErr) {
          console.warn('Encryption failed, exporting without password:', encErr);
        }
      }

      const blob = new Blob([finalBytes.buffer.slice(0) as ArrayBuffer], { type: 'application/pdf' });
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

        // ── E2E ENCRYPTION ──
        let uploadBytes: ArrayBuffer = finalBytes.buffer.slice(0) as ArrayBuffer;
        let encryptionKey = '';

        if (store.e2eEncrypt) {
          // Generate AES-256-GCM key
          const cryptoKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
          const iv = crypto.getRandomValues(new Uint8Array(12));

          // Encrypt
          const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, uploadBytes);

          // Prepend IV to encrypted bytes
          const combined = new Uint8Array(iv.length + encrypted.byteLength);
          combined.set(iv, 0);
          combined.set(new Uint8Array(encrypted), iv.length);
          uploadBytes = combined.buffer;

          // Export key as base64 for URL fragment
          const rawKey = await crypto.subtle.exportKey('raw', cryptoKey);
          encryptionKey = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
        }

        const { error: uError } = await supabase.storage.from('archives').upload(cloudName, uploadBytes);
        if (uError) throw uError;

        const { data: { publicUrl } } = supabase.storage.from('archives').getPublicUrl(cloudName);

        // Embed key in URL fragment — never sent to server
        store.globalTheme.qrUrl = encryptionKey
          ? `${window.location.origin}/decrypt#url=${encodeURIComponent(publicUrl)}&key=${encodeURIComponent(encryptionKey)}`
          : publicUrl;

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

<PasswordModal onConfirm={runExport} />
<PageReorderModal onConfirm={(fileId, newOrder) => {
  store.files = store.files.map(f => {
    if (String(f.id) !== fileId) return f;
    return { ...f, pageReorderMap: newOrder };
  });
}} />
<CoverEditor onConfirm={(cover) => {
  // Insert cover at position 0, or replace existing cover
  const existing = store.files.findIndex(f => f.type === 'cover');
  if (existing >= 0) {
    store.files = store.files.map((f, i) => i === existing ? cover : f);
  } else {
    store.files = [cover, ...store.files];
  }
}} />

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
        <Canvas
          onOpenContextMenu={openContextMenu}
          onAddChapter={addChapter}
          onAddCover={() => { store.showCoverEditor = true; }}
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