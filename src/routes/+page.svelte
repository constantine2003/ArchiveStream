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
    type?: 'pdf' | 'word' | 'chapter'; // Refined type
    previewHtml?: string; // New: for Word previews
    rawFile?: File; // New: to keep the original for merging
    title?: string; // For chapter pages
  };
    
  let files = $state<FileItem[]>([]);
    // --- Add Chapter/Separator Page ---
    function addChapter() {
      const newChapter: { id: string; type: "chapter"; title: string; name: string; selectionType: "all"; isEditing?: boolean } = {
        id: crypto.randomUUID(),
        type: "chapter",
        title: "New Chapter",
        name: "Separator Page", // for sidebar sync
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
  async function optimizeMetadataAndImages(pdfDoc: PDFDocument, shouldOptimize: boolean) {
    if (!shouldOptimize) return;
    // pdf-lib does not expose direct image access, so we can only optimize images added via Svelte/browser
    // This is a placeholder for future pdf-lib support. For now, no-op.
    // If you embed images manually, you can optimize before embedding.
    // If pdf-lib exposes image access in future, add logic here.
    // For now, this function is a stub.
    return;
  }

  // --- View Mode State ---
  let viewMode = $state<'stream' | 'grid'>('stream');

  // --- Drag & Drop / Context Menu State ---
  let draggedIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let menuVisible = $state(false);
  let menuPos = $state({ x: 0, y: 0 });
  let activeFileIndex = $state<number | null>(null);

  // --- Derived State ---
  let filteredFiles = $derived(
    files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  onMount(async () => {
    const savedTheme = localStorage.getItem('theme');
    if
     (savedTheme === 'dark') isDark = true;
    
    const savedHistory = localStorage.getItem('export_history');
    if (savedHistory) exportHistory = JSON.parse(savedHistory);

    await supabase.from('document_queue').delete().neq('id', 0);
    files = [];
  });

  $effect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    localStorage.setItem('export_history', JSON.stringify(exportHistory));
  });

  // --- Helper Functions ---
  async function syncSortOrder() {
    const updates = files.map((f, index) => ({ 
      id: f.id, 
      file_name: f.name, 
      sort_order: index 
    }));
    await supabase.from('document_queue').upsert(updates);
  }

  function clickOutside(node: HTMLElement, callback: () => void) {
    const handleClick = (event: MouseEvent) => {
      if (!node.contains(event.target as Node)) callback();
    };
    document.addEventListener('click', handleClick, true);
    return { 
      destroy() { document.removeEventListener('click', handleClick, true); } 
    };
  }

  // --- Actions ---
  async function handleFiles(droppedFiles: File[]) {
  // 1. Filter for supported types
  const validFiles = droppedFiles.filter(f => 
    f.type === 'application/pdf' || 
    f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    f.name.endsWith('.docx') // Extra safety check
  );

  const newFilesToAppend = [];

  for (const file of validFiles) {
    const isWord = file.name.endsWith('.docx') || file.type.includes('wordprocessingml');
    let previewHtml = "";
    let pageCount = 1;

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      if (isWord) {
        // Use the imported mammoth, not window.mammoth
        const result = await mammoth.convertToHtml({ arrayBuffer });
        previewHtml = result.value;
      } else {
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        pageCount = pdfDoc.getPageCount();
      }

      newFilesToAppend.push({ 
        id: crypto.randomUUID(), 
        name: file.name,
        type: isWord ? 'word' : 'pdf',
        url: !isWord ? URL.createObjectURL(file) : undefined,
        previewHtml: previewHtml,
        rawFile: file, 
        selectionType: 'all',
        pageCount,
        title: isWord ? undefined : undefined // Ensure title property exists
      });
    } catch (e) {
      console.error(`Error processing ${file.name}:`, e);
    }
  }

    // 2. Update the state once at the end
    files = [...files, ...newFilesToAppend];
  }
  
  async function generateCombinedPdf() {
  try {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const combinedPdf = await PDFDocument.create();
    const font = await combinedPdf.embedFont(StandardFonts.Helvetica);

    // This loop goes through every item on your sidebar/canvas
    for (const file of files) {
      
      // CASE A: It's a Word Document
      if (file.type === 'word') {
        const page = combinedPdf.addPage([595.28, 841.89]); // Create blank page
        const text = file.previewHtml.replace(/<[^>]*>/g, ' '); // Strip HTML
        page.drawText(text.substring(0, 1500), { x: 50, y: 800, size: 12, font });
      } 
      
      // CASE B: It's a Chapter Separator
      else if (file.type === 'chapter') {
        const page = combinedPdf.addPage([595.28, 841.89]);
        page.drawText(file.title || "New Section", { x: 200, y: 400, size: 24, font });
      } 
      
      // CASE C: It's a PDF
      else {
        const arrayBuffer = await file.rawFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = await combinedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        pages.forEach(p => combinedPdf.addPage(p));
      }
    }

    // Trigger the Download
    const pdfBytes = await combinedPdf.save();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
    link.download = "ArchiveStream_Bundle.pdf";
    link.click();

  } catch (error) {
    console.error("Export Error:", error);
    alert("The export failed. Check the console!");
  }
}
  /**
   * Converts strings like "1, 3-5" into [1, 3, 4, 5]
   */
  function parsePageRanges(input: string, maxPages: number): number[] {
    if (!input || input.toLowerCase() === 'all') return Array.from({length: maxPages}, (_, i) => i + 1);
    const pages = new Set<number>();
    const parts = input.split(',');
    parts.forEach(part => {
      const range = part.trim().split('-');
      if (range.length === 2) {
        const start = Math.max(1, parseInt(range[0]));
        const end = Math.min(maxPages, parseInt(range[1]));
        for (let i = start; i <= end; i++) pages.add(i);
      } else {
        const page = parseInt(part.trim());
        if (page > 0 && page <= maxPages) pages.add(page);
      }
    });
    return Array.from(pages).sort((a, b) => a - b);
  }

  function openContextMenu(e: MouseEvent, index: number) {
    e.preventDefault();
    menuPos = { x: e.clientX, y: e.clientY };
    activeFileIndex = index;
    menuVisible = true;
  }

  function closeMenu() {
    menuVisible = false;
  }

  async function moveFileToTop() {
    if (activeFileIndex === null) return;
    const item = files[activeFileIndex];
    files = [item, ...files.filter((_, i) => i !== activeFileIndex)];
    await syncSortOrder();
    closeMenu();
  }

  function startRename() {
    if (activeFileIndex === null) return;
    files[activeFileIndex].isEditing = true;
    closeMenu();
  }

  async function saveRename(index: number, newName: string) {
    files[index].isEditing = false;
    if (!newName || newName === files[index].name) return;

    const sanitizedName = newName.endsWith('.pdf') ? newName : newName + '.pdf';
    files[index].name = sanitizedName;

    await supabase.from('document_queue')
      .update({ file_name: sanitizedName })
      .eq('id', files[index].id);
  }

  async function handleDrop(targetIndex: number) {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      draggedIndex = null; dragOverIndex = null; return;
    }
    const updatedFiles = [...files];
    const [movedItem] = updatedFiles.splice(draggedIndex, 1);
    updatedFiles.splice(targetIndex, 0, movedItem);
    files = updatedFiles;
    draggedIndex = null; dragOverIndex = null;
    await syncSortOrder();
  }

  async function removeFile(id: number | undefined, index: number) {
    if (id) await supabase.from('document_queue').delete().eq('id', id);
    const file = files[index];
    if ('url' in file && file.url) {
      URL.revokeObjectURL(file.url);
    }
    files = files.filter((_, i) => i !== index);
  }

  async function clearQueue() {
    if (!confirm("Clear all documents?")) return;
    await supabase.from('document_queue').delete().neq('id', 0);
    files.forEach(f => {
      if ('url' in f && f.url) {
        URL.revokeObjectURL(f.url);
      }
    });
    files = [];
  }

  // Define our available watermark types
  type WatermarkType = 'NONE' | 'DRAFT' | 'CONFIDENTIAL' | 'APPROVED';

  let activeWatermark = $state<WatermarkType>('NONE');

  const watermarkStyles = {
      DRAFT: { text: 'DRAFT', color: 'rgb(0.7, 0.7, 0.7)', opacity: 0.3 },
      CONFIDENTIAL: { text: 'CONFIDENTIAL', color: 'rgb(0.8, 0.2, 0.2)', opacity: 0.3 },
      APPROVED: { text: 'APPROVED', color: 'rgb(0.2, 0.6, 0.2)', opacity: 0.3 }
  };
  
  async function applyWatermarks(pdfDoc: PDFDocument) {
    if (activeWatermark === 'NONE') return;

    const style = watermarkStyles[activeWatermark];
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    pages.forEach((page) => {
        const { width, height } = page.getSize();
        
        page.drawText(style.text, {
            x: width / 4,
            y: height / 3,
            size: 80,
            font: font,
            color: rgb(0.5, 0.5, 0.5), // Subtle gray
            rotate: degrees(45),
            opacity: style.opacity,
        });
    });
  }
  
  function resetToDefault() {
  applyPreset('corporate');
  // Optional: Force a UI refresh if your framework needs it
  console.log("Theme reset to Corporate baseline");
  }
  
  let globalTheme = $state({
    preset: 'corporate',
    fontFamily: 'Helvetica', 
    // Added 'hex' for the UI color pickers
    // Updated R,G,B to 255-scale for easier conversion
    primaryColor: { hex: '#000000', r: 0, g: 0, b: 0 },
    accentColor: { hex: '#FFFFFF', r: 255, g: 255, b: 255 }, 
    chapterFontSize: 32,
    bodyFontSize: 11,
    lineHeight: 16
  });
  
  function updateThemeColor(type, hex) {
    // 1. Convert Hex (#ffffff) to 0-255 RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    // 2. Update the state so handleExport sees it
    // We keep the hex string too so the color picker stays synced
    globalTheme[type] = { hex, r, g, b };
    
    // 3. Clear the preset name since we are now "Custom"
    globalTheme.preset = 'custom';
  }

  function applyPreset(presetName) {
    globalTheme.preset = presetName;

    switch (presetName) {
      case 'corporate':
      case 'default':
        globalTheme.fontFamily = 'Helvetica';
        globalTheme.primaryColor = { hex: '#000000', r: 0, g: 0, b: 0 };
        globalTheme.accentColor = { hex: '#FFFFFF', r: 255, g: 255, b: 255 }; // Pure White
        globalTheme.chapterFontSize = 32;
        globalTheme.bodyFontSize = 11;
        break;

      case 'atelier':
        globalTheme.fontFamily = 'TimesRoman';
        // Added Hex + R,G,B (Stone-600 / Stone-50)
        globalTheme.primaryColor = { hex: '#78716c', r: 120, g: 113, b: 108 };
        globalTheme.accentColor = { hex: '#fafaf9', r: 250, g: 250, b: 249 };
        globalTheme.chapterFontSize = 40;
        globalTheme.bodyFontSize = 12;
        break;

      case 'midnight':
        globalTheme.fontFamily = 'Courier';
        // Added Hex + R,G,B (Zinc-950 / Lime-200)
        globalTheme.primaryColor = { hex: '#09090b', r: 9, g: 9, b: 11 };
        globalTheme.accentColor = { hex: '#d9f99d', r: 217, g: 249, b: 157 };
        globalTheme.chapterFontSize = 36;
        globalTheme.bodyFontSize = 10;
        break;
    }
  }

  async function handleExport() {
  if (files.length === 0 || isExporting) return;
  
  try {
    isExporting = true;
    showSuccess = false;
    exportProgress = 0;

    const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');
    const mergedPdf = await PDFDocument.create();
    
    // --- BRANDING SETUP ---
    // Helper to ensure colors are 0-1 range
    const norm = (val) => (val > 1 ? val / 255 : val);
    
    const themePrimary = rgb(
      norm(globalTheme.primaryColor.r), 
      norm(globalTheme.primaryColor.g), 
      norm(globalTheme.primaryColor.b)
    );
    const themeAccent = rgb(
      norm(globalTheme.accentColor.r), 
      norm(globalTheme.accentColor.g), 
      norm(globalTheme.accentColor.b)
    );

    // Font Handling
    const fontName = globalTheme.fontFamily || 'Helvetica';
    const font = await mergedPdf.embedFont(StandardFonts[fontName]);
    
    const boldVariants = [`${fontName.replace('-', '')}Bold`, `${fontName}-Bold`, `${fontName}Bold` ];
    let fontBold;
    for (const variant of boldVariants) {
      if (StandardFonts[variant]) {
        fontBold = await mergedPdf.embedFont(StandardFonts[variant]);
        break; 
      }
    }
    if (!fontBold) fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);

    // --- MAIN PROCESSING LOOP ---
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.type === 'chapter') {
        /**
         * CHAPTER LOGIC (Phase 2: Professional Export)
         * Purpose: Acts as a high-impact brand separator.
         */
        const page = mergedPdf.addPage([600, 800]);
        const { width, height } = page.getSize();
        const title = typeof file.title === 'string' ? file.title : 'Section';
        
        // Background = Brand Accent (Paper)
        page.drawRectangle({
          x: 0, y: 0, width, height,
          color: themeAccent 
        });

        // Text = Brand Primary (Ink)
        page.drawText(title.toUpperCase(), {
          x: 50,
          y: height / 2,
          size: globalTheme.chapterFontSize || 32,
          font: fontBold,
          color: themePrimary 
        });

      } else if (file.type === 'word') {
        /**
         * WORD/HTML LOGIC (Phase 4: Expansion)
         * Purpose: Renders editable content with consistent branding.
         */
        const container = document.createElement('div');
        container.innerHTML = file.previewHtml || "";
        
        const fontSize = globalTheme.bodyFontSize || 11;
        const lineHeight = globalTheme.lineHeight || 16; 
        const margin = 50;
        const pageHeight = 841.89; 
        const pageWidth = 595.28; 
        const maxWidth = pageWidth - (margin * 2);
        const printableHeight = pageHeight - (margin * 2);

        // 1. Text Wrapping Logic
        const allContentObjects = [];
        const elements = Array.from(container.querySelectorAll('p, img, h1, h2, li, div'));

        for (const el of elements) {
          if (el.tagName === 'IMG') {
            allContentObjects.push({ type: 'image', src: el.src, height: 160 });
          } else {
            const text = el.textContent?.trim() || "";
            if (!text) continue;
            const words = text.split(/\s+/);
            let currentLine = "";
            words.forEach(word => {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              const width = font.widthOfTextAtSize(testLine, fontSize);
              if (width < maxWidth) { 
                currentLine = testLine; 
              } else {
                allContentObjects.push({ type: 'text', content: currentLine, height: lineHeight });
                currentLine = word;
              }
            });
            allContentObjects.push({ type: 'text', content: currentLine, height: lineHeight + 10 }); 
          }
        }

        // 2. Pagination Logic
        let virtualPages = [[]];
        let currentPageHeight = 0;
        let pageIdx = 0;
        for (const item of allContentObjects) {
          if (currentPageHeight + item.height > printableHeight) {
            virtualPages.push([]);
            pageIdx++;
            currentPageHeight = 0;
          }
          virtualPages[pageIdx].push(item);
          currentPageHeight += item.height;
        }

        // 3. Selective Range (Phase 1)
        const allowedPages = (file.selectionType === 'custom' && file.pageSelection)
          ? parsePageRanges(file.pageSelection, virtualPages.length)
          : Array.from({ length: virtualPages.length }, (_, idx) => idx + 1);

        // 4. Draw to PDF
        for (let j = 0; j < virtualPages.length; j++) {
          if (allowedPages.includes(j + 1)) {
            const page = mergedPdf.addPage([pageWidth, pageHeight]);
            
            // Draw "Digital Paper" Background (Except for Corporate)
            if (globalTheme.preset !== 'corporate') {
              page.drawRectangle({ 
                x: 0, y: 0, width: pageWidth, height: pageHeight, 
                color: themeAccent 
              });
            }

            let currentY = pageHeight - margin;
            for (const item of virtualPages[j]) {
              if (item.type === 'image') {
                try {
                  const imgData = await fetch(item.src).then(res => res.arrayBuffer());
                  const image = item.src.includes('png') ? await mergedPdf.embedPng(imgData) : await mergedPdf.embedJpg(imgData);
                  const dims = image.scaleToFit(maxWidth, 150);
                  page.drawImage(image, {
                    x: margin, y: currentY - dims.height,
                    width: dims.width, height: dims.height,
                  });
                  currentY -= (dims.height + 20); 
                } catch (e) { console.error("Image export failed", e); }
              } else if (item.content.trim()) {
                page.drawText(item.content, {
                  x: margin, y: currentY - fontSize,
                  size: fontSize, font: font,
                  color: themePrimary, // Brand Ink
                });
                const spacing = (globalTheme.preset === 'atelier') ? 2 : 0;
                currentY -= (item.height > lineHeight) ? item.height + spacing : lineHeight + spacing;
              }
            }
          }
        }
      } else {
        /**
         * STANDARD PDF LOGIC (Phase 1: Organization)
         * Purpose: Merges existing PDF files with range selection.
         */
        if (file.rawFile) {
          const pdfBytes = await file.rawFile.arrayBuffer();
          const pdf = await PDFDocument.load(pdfBytes);
          const maxPages = pdf.getPageCount();
          let indices = (file.selectionType === 'custom' && file.pageSelection)
            ? parsePageRanges(file.pageSelection, maxPages).map(n => n - 1)
            : Array.from({length: maxPages}, (_, idx) => idx);

          if (indices.length > 0) {
            const copiedPages = await mergedPdf.copyPages(pdf, indices);
            copiedPages.forEach((page) => mergedPdf.addPage(page));
          }
        }
      }
      exportProgress = Math.round(((i + 1) / files.length) * 100);
    }

    // --- WATERMARK OVERLAYS ---
    if (activeWatermark !== 'NONE') {
      const style = watermarkStyles[activeWatermark];
      const pages = mergedPdf.getPages();
      pages.forEach((page) => {
        const { width, height } = page.getSize();
        page.drawText(style.text, {
          x: width / 4, y: height / 3,
          size: 70, font: fontBold,
          color: themePrimary, // Watermark uses Brand Primary
          rotate: degrees(45),
          opacity: style.opacity || 0.15,
        });
      });
    }

    // --- FINAL EXPORT & DOWNLOAD ---
    // Metadata Optimization (Phase 3)
    if (typeof optimizeMetadataAndImages === 'function') {
      await optimizeMetadataAndImages(mergedPdf, !!compressEnabled);
    }
    
    const mergedPdfBytes = await mergedPdf.save({ useObjectStreams: !!compressEnabled });
    const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
    const exportUrl = URL.createObjectURL(blob);
    const fileName = `ArchiveStream_${Date.now()}.pdf`;
    
    const link = document.createElement('a');
    link.href = exportUrl;
    link.download = fileName;
    link.click();

    // Export History (Phase 3)
    exportHistory = [{
      name: fileName,
      date: new Date().toLocaleDateString(undefined, { 
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      }),
      url: exportUrl
    }, ...exportHistory].slice(0, 5);

    showSuccess = true;
    setTimeout(() => { isExporting = false; showSuccess = false; }, 2500);

  } catch (err) {
    console.error("Export Failed:", err);
    alert("Error combining documents. Please check the console.");
    isExporting = false;
  }
}

</script>

{#if menuVisible}
  <div 
    class="fixed z-100 w-44 rounded-xl border shadow-2xl backdrop-blur-xl p-1.5 transition-all
           {isDark ? 'bg-stone-900/95 border-stone-700 text-stone-300' : 'bg-white/95 border-stone-200 text-stone-600'}"
    style="top: {menuPos.y}px; left: {menuPos.x}px;"
    use:clickOutside={closeMenu}
  >
    <div class="flex flex-col gap-0.5">
      <button onclick={moveFileToTop} class="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors {isDark ? 'hover:bg-stone-800 hover:text-amber-200' : 'hover:bg-stone-100 hover:text-black'}">
        Move to Top
      </button>
      <button onclick={startRename} class="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors {isDark ? 'hover:bg-stone-800 hover:text-amber-200' : 'hover:bg-stone-100 hover:text-black'}">
        Rename
      </button>
      <div class="h-px my-1 {isDark ? 'bg-stone-800' : 'bg-stone-100'}"></div>
      <button onclick={() => { 
        const id = files[activeFileIndex!].id;
        removeFile(typeof id === 'number' ? id : undefined, activeFileIndex!); 
        closeMenu(); 
      }} class="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors text-red-500 {isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}">
        Delete
      </button>
    </div>
  </div>
{/if}

{#if isExporting}
<div class="fixed inset-0 z-60 {isDark ? 'bg-stone-950/90' : 'bg-white/90'} backdrop-blur-md flex flex-col items-center justify-center transition-all duration-500">
    <div class="w-full max-w-sm px-8 text-center">
        {#if !showSuccess}
            <div class="relative mb-8 flex justify-center">
                <div class="w-20 h-20 border-2 border-amber-900/30 border-t-amber-500 rounded-full animate-spin"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-xs font-serif italic text-amber-500">{exportProgress}%</span>
                </div>
            </div>
            <h2 class="text-sm font-light tracking-[0.3em] {isDark ? 'text-stone-300' : 'text-stone-600'} uppercase mb-4">Compiling Collection</h2>
            <div class="w-full h-px {isDark ? 'bg-stone-800' : 'bg-stone-200'} rounded-full overflow-hidden">
                <div class="h-full bg-amber-600 transition-all duration-300" style="width: {exportProgress}%"></div>
            </div>
        {:else}
            <div class="mb-8 flex justify-center scale-110">
                <div class="w-20 h-20 bg-emerald-500/10 border border-emerald-500/50 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            </div>
            <h2 class="text-sm font-medium tracking-widest text-emerald-500 uppercase">Archive Ready</h2>
        {/if}
    </div>
</div>
{/if}

<input bind:this={fileInput} type="file" multiple accept="application/pdf" class="hidden" onchange={(e) => { if (e.currentTarget.files) handleFiles(Array.from(e.currentTarget.files)) }} />

<div class="flex h-screen w-full transition-colors duration-500 {isDark ? 'bg-stone-950 text-stone-200' : 'bg-stone-50 text-stone-900'} font-sans overflow-hidden relative">

  {#if sidebarOpen}
    <div
      class="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-sm"
      role="button"
      tabindex="0"
      aria-label="Close sidebar"
      onclick={() => sidebarOpen = false}
      onkeydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}
    ></div>
  {/if}

  <aside class="fixed md:static top-0 left-0 h-full w-72 max-w-[85vw] border-r {isDark ? 'border-stone-800 bg-stone-950' : 'border-stone-200 bg-white'} flex flex-col transition-transform duration-500 shadow-xl z-50 md:z-20
    {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:w-80 md:max-w-xs"
  >
    <div class="p-6 pb-4 flex justify-between items-start md:p-8 md:pb-6">
      <div class="flex items-center gap-2">
        <h1 class="text-lg md:text-2xl font-serif tracking-tight {isDark ? 'text-white' : 'text-black'}">ArchiveStream<span class="text-amber-600">.</span></h1>
        <span class="w-1.5 h-1.5 rounded-full {files.length > 0 ? 'bg-amber-500 animate-pulse' : 'bg-stone-400'}"></span>
      </div>
      <div class="flex gap-2 items-center">
        <button onclick={() => isDark = !isDark} class="p-2 rounded-lg hover:bg-stone-500/10 transition-colors" title="Toggle Theme">
          {#if isDark}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
          {/if}
        </button>
        <button class="md:hidden p-2 rounded-lg hover:bg-stone-500/10 transition-colors" onclick={() => sidebarOpen = false} aria-label="Close sidebar">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>

    <div class="px-4 mb-4 md:px-6 md:mb-6">
      <input 
        bind:value={searchQuery}
        type="text" 
        placeholder="Filter documents..." 
        class="w-full {isDark ? 'bg-stone-900 text-white placeholder-stone-500' : 'bg-stone-100 text-stone-900'} border-none rounded-lg py-2 px-3 md:py-2.5 md:px-4 text-xs focus:ring-1 focus:ring-amber-600/50 transition-all outline-none"
      />
    </div>

    <div class="flex-1 overflow-y-auto px-2 md:px-4 space-y-1 custom-scrollbar">
      <div class="flex justify-between items-center px-2 mb-4">
        <p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Library ({filteredFiles.length})</p>
        <button onclick={clearQueue} class="text-[10px] text-stone-500 hover:text-amber-600 transition-colors uppercase font-bold">Clear</button>
      </div>
      
      {#each filteredFiles as file, i (file.id)}
        <div 
          draggable="true"
          role="listitem"
          oncontextmenu={(e) => openContextMenu(e, i)}
          ondragstart={() => draggedIndex = i}
          ondragover={(e) => { e.preventDefault(); dragOverIndex = i; }}
          ondragleave={() => dragOverIndex = null}
          ondrop={() => handleDrop(i)}
          onclick={() => handleSidebarSync(file.id)}
          class="group flex items-center gap-3 p-3 rounded-xl transition-all cursor-grab active:cursor-grabbing border {[
            draggedIndex === i ? 'opacity-20 scale-95' : 'opacity-100',
            dragOverIndex === i 
              ? 'bg-amber-600/10 border-amber-600/30' 
              : (isDark 
                  ? 'bg-transparent border-transparent hover:bg-stone-900 hover:border-stone-800' 
                  : 'bg-transparent border-transparent hover:bg-white hover:shadow-sm hover:border-stone-200'),
            activeFileId === String(file.id) ? (isDark ? 'ring-2 ring-amber-500' : 'ring-2 ring-amber-400') : ''
          ].join(' ')}"
        >
          <div class="text-stone-500 opacity-30 group-hover:opacity-100 transition-opacity">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            {#if file.isEditing}
              <input 
                class="w-full text-xs px-1 py-0.5 rounded border outline-none
                  {isDark 
                    ? 'bg-amber-600/10 border-amber-600/30 text-amber-200' 
                    : 'bg-stone-100 border-stone-300 text-black'}"
                value={file.name}
                onmousedown={(e) => e.stopPropagation()} 
                onclick={(e) => e.stopPropagation()}
                ondragstart={(e) => e.preventDefault()} 
                onblur={(e) => saveRename(i, e.currentTarget.value)}
                onkeydown={(e) => { 
                  if (e.key === 'Enter') saveRename(i, e.currentTarget.value); 
                  if (e.key === 'Escape') file.isEditing = false; 
                }}
              />
            {:else}
              <p class="text-xs truncate font-medium {isDark ? 'text-stone-300 group-hover:text-amber-200' : 'text-stone-700 group-hover:text-black'} transition-colors">
                {file.name}
              </p>
            {/if}
          </div>
          <button onclick={() => removeFile(typeof file.id === 'number' ? file.id : undefined, i)} class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 transition-all px-1" aria-label="Delete file">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      {/each}

      {#if exportHistory.length > 0}
        <div class="pt-8 pb-4">
          <div class="flex justify-between items-center px-2 mb-4">
            <p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Recent Exports</p>
            <button onclick={() => exportHistory = []} class="text-[10px] text-stone-500 hover:text-red-500 transition-colors uppercase font-bold">Clear</button>
          </div>

          {#each exportHistory as item}
            <div class="group flex items-center gap-3 p-3 rounded-xl border border-transparent {isDark ? 'hover:bg-stone-900/50 hover:border-stone-800' : 'hover:bg-stone-100 hover:border-stone-200'} transition-all mb-1">
              <div class="text-amber-600/40 group-hover:text-amber-600">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <div class="flex-1 min-w-0">
                <a href={item.url} download={item.name} class="text-[10px] block truncate font-medium {isDark ? 'text-stone-400 group-hover:text-stone-200' : 'text-stone-600 group-hover:text-stone-900'} transition-colors">
                  {item.name}
                </a>
                <p class="text-[8px] text-stone-500 uppercase tracking-tighter">{item.date}</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    
    <div class="border-t {isDark ? 'border-stone-800' : 'border-stone-100'}">
      <button 
        onclick={() => settingsExpanded = !settingsExpanded}
        class="w-full px-4 py-4 flex justify-between items-center group transition-colors {isDark ? 'hover:bg-stone-900' : 'hover:bg-stone-50'}"
      >
        <p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
          Design & Overlays
        </p>
        <div class="transition-transform duration-300 {settingsExpanded ? 'rotate-0' : 'rotate-180'}">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {#if settingsExpanded}
        <div 
        transition:slide={{ duration: 400, easing: quintOut }}
        class="px-4 pb-3 space-y-6 overflow-hidden"
        >
          
          <div>
            <p class="text-[9px] font-bold text-stone-400 uppercase tracking-tighter mb-2 italic">Template Overlays</p>
            <div class="grid grid-cols-2 gap-2">
              {#each ['NONE', 'DRAFT', 'CONFIDENTIAL', 'APPROVED'] as type}
                <button 
                  onclick={() => activeWatermark = type}
                  class="py-2 px-1 rounded-lg border text-[9px] font-black uppercase tracking-tighter transition-all
                  {activeWatermark === type 
                    ? 'bg-amber-600 border-amber-600 text-white shadow-lg' 
                    : (isDark ? 'bg-stone-900 border-stone-800 text-stone-500 hover:border-stone-600' : 'bg-white border-stone-200 text-stone-400 hover:border-stone-300')}"
                >
                  {type}
                </button>
              {/each}
            </div>
          </div>

          <div class="space-y-4">
            <p class="text-[9px] font-bold text-stone-400 uppercase tracking-tighter mb-2 italic border-t {isDark ? 'border-stone-800' : 'border-stone-100'} pt-4">
               Design Atelier <span class="opacity-70 ml-1"> (Only works for docx and chapter)</span>
            </p>
            
            <div>
              <label class="block text-[9px] font-bold text-stone-500 uppercase mb-1">Typography</label>
              <select 
                bind:value={globalTheme.fontFamily}
                class="w-full p-2 text-[10px] font-bold rounded-lg border outline-none transition-all
                {isDark ? 'bg-stone-900 border-stone-800 text-stone-300' : 'bg-stone-50 border-stone-200 text-stone-700'}"
              >
                <option value="Helvetica">Modern Sans</option>
                <option value="TimesRoman">Classic Serif</option> 
                <option value="Courier">Technical Mono</option>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[8px] font-bold text-stone-400 uppercase mb-1 tracking-tight">Ink</label>
                <div class="relative w-full h-6 rounded-md border border-stone-200 overflow-hidden group shadow-sm hover:border-stone-400 transition-colors">
                  <input 
                    type="color" 
                    value={globalTheme.primaryColor.hex} 
                    oninput={(e) => updateThemeColor('primaryColor', e.currentTarget.value)} 
                    class="absolute -top-3 -left-1 w-[200%] h-[200%] cursor-pointer bg-transparent border-none outline-none appearance-none"
                  />
                </div>
              </div>

              <div>
                <label class="block text-[8px] font-bold text-stone-400 uppercase mb-1 tracking-tight">Paper</label>
                <div class="relative w-full h-6 rounded-md border border-stone-200 overflow-hidden group shadow-sm hover:border-stone-400 transition-colors">
                  <input 
                    type="color" 
                    value={globalTheme.accentColor.hex} 
                    oninput={(e) => updateThemeColor('accentColor', e.currentTarget.value)} 
                    class="absolute -top-3 -left-1 w-[200%] h-[200%] cursor-pointer bg-transparent border-none outline-none appearance-none"
                  />
                </div>
              </div>
            </div>

           <div class="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
              {#each ['corporate', 'atelier', 'midnight'] as presetName}
                {@const isActive = globalTheme.preset === presetName}
                <button 
                  onclick={() => applyPreset(presetName)}
                  class="whitespace-nowrap px-2 py-1 text-[9px] font-black uppercase rounded-md border transition-all
                  {isActive 
                    ? 'border-amber-500/50 text-amber-500 bg-amber-500/5' 
                    : (isDark ? 'bg-stone-900 border-stone-800 text-stone-400 hover:text-amber-500' : 'bg-stone-50 border-stone-200 text-stone-500 hover:text-amber-600')}"
                >
                  {presetName === 'corporate' ? 'DEFAULT' : presetName}
                </button>
              {/each}
            </div>
            <div class="mt-4 p-4 rounded-xl border border-stone-200 bg-white shadow-inner">
              <p class="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-3">Live Export Preview</p>
              
              <div 
                class="aspect-[3/4] w-full max-w-[180px] mx-auto shadow-lg rounded-sm border border-stone-100 transition-all duration-300 flex flex-col p-4 overflow-hidden"
                style="background-color: {globalTheme.accentColor.hex};"
              >
                <div 
                  class="w-1/2 h-1 mb-6 opacity-40 rounded-full" 
                  style="background-color: {globalTheme.primaryColor.hex};"
                ></div>

                <h1 
                  class="leading-tight transition-colors duration-300 mb-2"
                  style="
                    color: {globalTheme.primaryColor.hex}; 
                    font-family: {globalTheme.fontFamily}; 
                    font-size: {globalTheme.chapterFontSize / 5}px;
                  "
                >
                  The Archive
                </h1>
                
                <div 
                  class="w-full h-[0.5px] mb-4 opacity-20" 
                  style="background-color: {globalTheme.primaryColor.hex};"
                ></div>
                
                <div class="space-y-1.5">
                  {#each [1, 2, 3, 4, 5] as _, i}
                    <div 
                      class="h-[2px] rounded-full" 
                      style="
                        background-color: {globalTheme.primaryColor.hex}; 
                        width: {i === 4 ? '60%' : '100%'};
                        opacity: 0.5;
                      "
                    ></div>
                  {/each}
                </div>
              </div>
              
              <div class="mt-3 text-center">
                <span class="text-[10px] text-stone-400 font-medium">
                  {globalTheme.fontFamily} — {globalTheme.bodyFontSize}pt
                </span>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
    
    <div class="p-4 md:p-6">
      <button onclick={() => fileInput.click()} class="w-full py-3 {isDark ? 'bg-stone-900 hover:bg-stone-800 text-stone-200 border-stone-800' : 'bg-white hover:bg-stone-50 text-stone-900 border-stone-200'} rounded-xl text-[10px] uppercase tracking-widest font-bold border transition-all">
        Import PDF
      </button>
    </div>
  </aside>

  <main 
    class="flex-1 relative flex flex-col transition-colors duration-500 {isDragging ? 'bg-amber-600/5' : (isDark ? 'bg-[#0c0a09]' : 'bg-stone-50')} min-w-0"
    ondragover={(e) => { e.preventDefault(); isDragging = true; }}
    ondragleave={() => isDragging = false}
    ondrop={(e) => { e.preventDefault(); isDragging = false; if (e.dataTransfer) handleFiles(Array.from(e.dataTransfer.files)); }}
  >
    <button class="absolute top-4 left-4 z-30 md:hidden bg-white/80 dark:bg-stone-900/80 rounded-lg p-2 shadow-md border border-stone-200 dark:border-stone-800" onclick={() => sidebarOpen = true} aria-label="Open sidebar">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-stone-700 dark:text-stone-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>

    {#if files.length === 0}
      <div class="flex-1 flex flex-col items-center justify-center opacity-30 px-4">       
        <div class="w-14 h-14 md:w-16 md:h-16 mb-4 md:mb-6 border border-dashed {isDark ? 'border-stone-700' : 'border-stone-400'} rounded-full flex items-center justify-center cursor-pointer hover:bg-amber-600/10 transition" onclick={() => fileInput.click()} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { fileInput.click(); } }} tabindex="0" role="button" aria-label="Import PDF">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 {isDark ? 'text-stone-400' : 'text-stone-600'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" /></svg>
        </div>
        <p class="text-xs md:text-[10px] {isDark ? 'text-stone-400' : 'text-stone-600'} font-bold tracking-[0.3em] uppercase text-center">Drop Files to Begin</p>
      </div>
    {:else}
      <div class="absolute top-4 right-4 z-30 flex gap-2">
        <button 
          onclick={() => viewMode = 'stream'} 
          class="p-2 rounded-lg transition-all {viewMode === 'stream' ? (isDark ? 'bg-amber-600 text-white' : 'bg-stone-900 text-white') : (isDark ? 'bg-stone-900 text-stone-500' : 'bg-white text-stone-400')}"
          aria-label="Stream view"
          title="Stream view"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <button 
          onclick={() => viewMode = 'grid'} 
          class="p-2 rounded-lg transition-all {viewMode === 'grid' ? (isDark ? 'bg-amber-600 text-white' : 'bg-stone-900 text-white') : (isDark ? 'bg-stone-900 text-stone-500' : 'bg-white text-stone-400')}"
          aria-label="Grid view"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 pt-20 md:p-8 md:pt-20 pb-32 custom-scrollbar scroll-smooth">
        {#if viewMode === 'stream'}
          <div class="max-w-4xl mx-auto space-y-12 md:space-y-24">
            {#each files as file, i (file.id)}
              {#if file.type === 'chapter'}
                <section id={file.id ? String(file.id) : undefined} class="max-w-4xl mx-auto my-12 group transition-all">
                  <div class="bg-stone-50 {isDark ? 'bg-stone-900/30' : 'bg-stone-50'} border-2 border-dashed {isDark ? 'border-stone-800' : 'border-stone-200'} rounded-2xl p-20 flex flex-col items-center justify-center">
                    <span class="text-[10px] font-black uppercase tracking-[0.4em] text-amber-600 mb-8">Section Break</span>
                    <input 
                      bind:value={file.title}
                      class="bg-transparent text-4xl md:text-6xl font-serif text-stone-800 {isDark ? 'text-stone-200' : 'text-stone-800'} text-center w-full outline-none border-b border-transparent focus:border-amber-500/30 pb-4 transition-all"
                      placeholder="Enter Title..."
                    />
                    <div class="mt-8 flex gap-4">
                      <button onclick={() => removeFile(typeof file.id === 'number' ? file.id : undefined, i)} class="text-[10px] font-bold text-red-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
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
                  <div class="bg-white shadow-lg mx-auto p-[50px] min-h-[841px] w-[595px] text-left">
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
  .font-serif { font-family: 'Playfair Display', serif; }

  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #44403c; border-radius: 10px; }
    /* Target the container where you render {@html file.previewHtml} */
  .word-preview-container :global(table) {
    width: 100% !important;
    table-layout: fixed; /* This forces columns to stay within the width */
    border-collapse: collapse;
    margin-bottom: 1rem;
  }

  .word-preview-container :global(td), 
  .word-preview-container :global(th) {
    border: 1px solid #ddd;
    padding: 8px;
    word-wrap: break-word; /* Forces long text to wrap instead of pushing the wall */
    overflow-wrap: break-word;
  }
</style>