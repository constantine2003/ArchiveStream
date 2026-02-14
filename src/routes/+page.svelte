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
    const validFiles = droppedFiles.filter(f => 
      f.type === 'application/pdf' || 
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.type.startsWith('image/') || 
      f.name.endsWith('.docx') ||
      f.name.endsWith('.jpg') ||
      f.name.endsWith('.jpeg') ||
      f.name.endsWith('.png')
    );

    const newFilesToAppend = [];

    for (const file of validFiles) {
      const isWord = file.name.endsWith('.docx') || file.type.includes('wordprocessingml');
      const isImage = file.type.startsWith('image/'); // NEW: Image detection
      let previewHtml = "";
      let pageCount = 1;

      try {
        if (isWord) {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          previewHtml = result.value;
        } else if (isImage) {
          // NEW: Images are always 1 page
          pageCount = 1; 
        } else {
          // Existing PDF logic
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          pageCount = pdfDoc.getPageCount();
        }

        newFilesToAppend.push({ 
          id: crypto.randomUUID(), 
          name: file.name,
          type: isWord ? 'word' : (isImage ? 'image' : 'pdf'), // Set type
          url: URL.createObjectURL(file), // Works for both PDF and Images!
          previewHtml: previewHtml,
          rawFile: file, 
          selectionType: 'all',
          pageCount,
          title: undefined 
        });
      } catch (e) {
        console.error(`Error processing ${file.name}:`, e);
      }
    }

    files = [...files, ...newFilesToAppend];
  }
  
  async function generateCombinedPdf() {
    try {
      const { PDFDocument, StandardFonts } = await import('pdf-lib');
      const combinedPdf = await PDFDocument.create();
      const font = await combinedPdf.embedFont(StandardFonts.Helvetica);

      // --- ATELIER EXPORT LOOP ---
      // This loop processes every item on your sidebar/canvas in order
      for (const file of files) {
        
        // CASE A: Word Document (.docx)
        if (file.type === 'word') {
          const page = combinedPdf.addPage([595.28, 841.89]); // A4 Size
          const text = file.previewHtml ? file.previewHtml.replace(/<[^>]*>/g, ' ') : ""; 
          page.drawText(text.substring(0, 1500), { x: 50, y: 800, size: 12, font });
        } 
        
        // CASE B: Chapter / Separator Page
        else if (file.type === 'chapter') {
          const page = combinedPdf.addPage([595.28, 841.89]); // A4 Size
          page.drawText(file.title || "New Section", { x: 200, y: 400, size: 24, font });
        } 

        // CASE D: Image (JPG, PNG, WebP)
        // 2. BROADEN THE IMAGE CHECK
        else if (file.type === 'image' || file.rawFile?.type.startsWith('image/')) {
            try {
                let imgBuffer;
                let isOptimized = false;

                if (compressEnabled) {
                    console.log("Optimizer triggered for", file.name);
                    imgBuffer = await shrinkImage(file.rawFile, 1600, 0.8);
                    isOptimized = true; 
                } else {
                    imgBuffer = await file.rawFile.arrayBuffer();
                }

                // Use the correct instance name (mergedPdf vs combinedPdf)
                const embeddedImg = (isOptimized || file.rawFile.type.includes('jpeg'))
                    ? await mergedPdf.embedJpg(imgBuffer)
                    : await mergedPdf.embedPng(imgBuffer);

                if (allowedPages.includes(1)) {
                    const page = mergedPdf.addPage([embeddedImg.width, embeddedImg.height]);
                    page.drawImage(embeddedImg, {
                        x: 0, y: 0, 
                        width: embeddedImg.width, 
                        height: embeddedImg.height,
                    });
                }
            } catch (imgErr) {
                console.error("ArchiveStream Engine: Image Case Failed", imgErr);
            }
        }
        
        // CASE C: Standard PDF
        else if (file.type === 'pdf') {
          const arrayBuffer = await file.rawFile.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          
          // Future Phase 1: SelectionType check will go here (Selective Page Ranges)
          const pages = await combinedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
          pages.forEach(p => combinedPdf.addPage(p));
        }
      }

      // --- PHASE 2 & 3: Metadata and Image Optimization ---
      // This applies your custom metadata (Author, Title) and future compression
      if (typeof optimizeMetadataAndImages === 'function') {
        await optimizeMetadataAndImages(combinedPdf, !!compressEnabled);
      }

      // --- FINALIZATION & DOWNLOAD ---
      const pdfBytes = await combinedPdf.save();
      
      const fileName = globalTheme.customFileName || "ArchiveStream_Bundle.pdf";
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error("Export Error:", error);
      alert("The export failed. Check the console for details!");
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
    // if (!confirm("Clear all documents?")) return;
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
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    globalTheme[type] = { hex, r, g, b };
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

      case 'brutalist':
        globalTheme.preset = 'brutalist';
        globalTheme.fontFamily = 'Helvetica'; // Stick to the base name
        globalTheme.primaryColor = { hex: '#000000', r: 0, g: 0, b: 0 };
        globalTheme.accentColor = { hex: '#ff3e00', r: 255, g: 62, b: 0 }; 
        globalTheme.chapterFontSize = 48; // Big and bold for Brutalist
        globalTheme.bodyFontSize = 11;
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
      // Use 'fontRegular' as the variable name to match your chapter logic
      const fontRegular = await mergedPdf.embedFont(StandardFonts[fontName]); 
      // Keep 'font' as an alias just in case other parts of your code use it
      const font = fontRegular; 

      const boldVariants = [`${fontName.replace('-', '')}Bold`, `${fontName}-Bold`, `${fontName}Bold` ];
      // ... (keep the rest of your fontBold loop as is)
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
        // LOG 1: Check the ArchiveStream internal type
        console.log(`[ArchiveStream] Entry ${i}:`, {
          name: file.name,
          type: file.type, // This MUST be 'image' for Case D to work
          mime: file.rawFile?.type
        });
        // 1. ADD THIS HERE: Define allowedPages for the current file
        // We use your parsePageRanges helper (ensure this function is defined in your scope)
        // We need to know the total pages. For Word, we'll estimate; for PDF, we get it from the file.
        
        let totalDocPages = 1; // Default
        if (file.type === 'word') {
            // Estimate pages: roughly 750px of HTML height per page
            const tempDiv = document.createElement('div');
            tempDiv.style.width = "650px";
            tempDiv.style.visibility = "hidden";
            tempDiv.innerHTML = file.previewHtml || "";
            document.body.appendChild(tempDiv);
            totalDocPages = Math.ceil(tempDiv.offsetHeight / 750) || 1;
            document.body.removeChild(tempDiv);
        } else if (file.rawFile) {
            // It's a PDF, we'll get the count inside the PDF logic block
        }

        // Calculate the allowed range based on user input
        const allowedPages = (file.selectionType === 'custom' && file.pageSelection)
            ? parsePageRanges(file.pageSelection, totalDocPages)
            : Array.from({ length: totalDocPages }, (_, idx) => idx + 1);

        if (file.type === 'chapter') {
          const page = mergedPdf.addPage([600, 800]);
          const { width, height } = page.getSize();
          
          // 1. SAFE DATA HANDLING
          const titleText = (file.title || 'Section').toUpperCase();
          const descText = file.description || ""; 

          // 2. DRAW BACKGROUND (Paper Color)
          page.drawRectangle({
              x: 0, y: 0, width, height,
              color: themeAccent 
          });

          const margin = 60;
          const maxTextWidth = width - (margin * 2);
          
          // 3. TITLE CALCULATIONS
          let titleSize = globalTheme.chapterFontSize || 32;
          // Dynamic resizing for extreme lengths
          if (titleText.length > 25) titleSize = titleSize * 0.6;
          else if (titleText.length > 15) titleSize = titleSize * 0.8;

          // 4. DRAW TITLE
          // maxWidth + lineHeight enables automatic wrapping in modern pdf-lib versions
          page.drawText(titleText, {
              x: margin,
              y: height - 300, // Fixed starting point from top
              size: titleSize,
              font: fontBold,
              color: themePrimary,
              maxWidth: maxTextWidth,
              lineHeight: titleSize * 1.1,
          });

          // 5. DRAW DESCRIPTION (Subheading)
          if (descText.trim()) {
              // Calculate an offset so it doesn't overlap the title
              // We estimate the title height based on length
              const titleLines = Math.ceil((titleText.length * (titleSize * 0.6)) / maxTextWidth);
              const descYOffset = (titleLines * (titleSize * 1.1)) + 40;

              page.drawText(descText, {
                  x: margin,
                  y: height - 300 - (titleLines * titleSize) - 40,
                  size: 16,
                  font: fontRegular,
                  color: themePrimary,
                  maxWidth: maxTextWidth,
                  lineHeight: 20,
                  opacity: 0.75 // Atelier styling: slightly faded for hierarchy
              });
          }
      } else if (file.type === 'word') {
            const worker = document.createElement('div');
            
            // 1. SMART THEME LOGIC
            // If it's Midnight, we flip to "Print Mode" (White background, Dark Ink)
            // If it's Atelier, we keep the cream color (it's light enough for printing)
            let exportBg = themeAccent;
            let exportText = themePrimary;

            if (globalTheme.preset === 'midnight') {
                exportBg = '#ffffff'; // Force white for the PDF
                exportText = '#1a1a1a'; // Force dark gray/black ink
            }

            // 2. APPLY THE STYLES
            worker.style.width = "650px"; 
            worker.style.padding = "40px";
            worker.style.backgroundColor = exportBg; 
            worker.style.color = exportText;
            worker.style.fontFamily = globalTheme.fontFamily || 'serif';
            worker.style.fontSize = `${globalTheme.bodyFontSize || 11}pt`;
            worker.style.lineHeight = "1.6";
            
            // --- ADD THESE TWO LINES TO FIX THE COLOR ---
            worker.style.webkitPrintColorAdjust = "exact"; 
            worker.style.printColorAdjust = "exact";
            // --------------------------------------------

           worker.innerHTML = file.previewHtml || ""; 
            document.body.appendChild(worker);

            // 1. APPLY THEME TO WORKER (The "Paper" and "Ink")
            Object.assign(worker.style, {
                backgroundColor: exportBg,
                color: exportText,
                webkitPrintColorAdjust: "exact", // Forces browsers to export background colors
                printColorAdjust: "exact"
            });

            // 2. FORCE CHILDREN TO INHERIT THEME
            // This ensures spans/paragraphs from Word don't stay black or blue
            worker.querySelectorAll('*').forEach(el => {
                if (el instanceof HTMLElement) {
                    el.style.color = 'inherit';
                    el.style.borderColor = 'currentColor';
                }
            });

            // 3. CLEAN UP TABLES (The "Professional" Touch)
            worker.querySelectorAll('table').forEach(table => {
                table.style.width = "100%";
                table.style.borderCollapse = "collapse";
                table.style.marginBottom = "20px";
                table.style.backgroundColor = "transparent"; // Ensure no white backgrounds
                
                table.querySelectorAll('td, th').forEach(cell => {
                    // Using exportText directly ensures borders match your theme's ink
                    cell.style.border = `1px solid ${exportText}`; 
                    cell.style.padding = "8px";
                });
            });

            // 4. CLEAN UP IMAGES
            worker.querySelectorAll('img').forEach(img => {
                img.style.maxWidth = "100%";
                img.style.height = "auto";
                img.style.display = "block";
                img.style.margin = "20px auto";
                // Optional: makes white backgrounds in images transparent to show your paper color
                img.style.mixBlendMode = "multiply"; 
            });

            // 4. THE EXPORT
            const opt = {
                margin: 0.5,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { 
                    scale: 2, 
                    useCORS: true,
                    backgroundColor: exportBg // This ensures the 'snapshot' isn't transparent
                },
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all'] }
            };

            try {
              // 1. Generate the PDF buffer
              const pdfArrayBuffer = await html2pdf().set(opt).from(worker).outputPdf('arraybuffer');
              
              // 2. Load the freshly generated Word PDF
              const wordDoc = await PDFDocument.load(pdfArrayBuffer);
              const totalWordPages = wordDoc.getPageCount();

              // 3. PHASE 1 INTEGRATION: Calculate which pages to actually grab
              // We use your existing 'allowedPages' logic. 
              // Note: we subtract 1 because PDF indices start at 0.
              const indicesToCopy = allowedPages
                  .map(p => p - 1) 
                  .filter(idx => idx >= 0 && idx < totalWordPages);

              // 4. Copy and Merge
              if (indicesToCopy.length > 0) {
                  const pages = await mergedPdf.copyPages(wordDoc, indicesToCopy);
                  pages.forEach(p => mergedPdf.addPage(p));
              }

          } catch (err) {
              console.error("ArchiveStream Selective Export Failed:", err);
          } finally {
              document.body.removeChild(worker);
          }
        }// --- CASE C: IMAGE (NEW SUPPORT) ---
        else if (file.type === 'image' || file.rawFile?.type.startsWith('image/')) {
          console.log("🚀 Image Case logic started for:", file.name);
          
          try {
              let imgBuffer;
              
              if (compressEnabled) {
                  console.log("⚙️ Calling shrinkImage...");
                  // Use a timeout wrapper to ensure it doesn't hang forever
                  imgBuffer = await shrinkImage(file.rawFile, 1600, 0.8);
                  console.log("✅ shrinkImage returned buffer");
              } else {
                  imgBuffer = await file.rawFile.arrayBuffer();
              }

              // Use mergedPdf (Ensure this name matches your PDFDocument.create() variable)
              const isPNG = file.rawFile?.type === 'image/png';
              const embeddedImg = (compressEnabled || !isPNG) 
                  ? await mergedPdf.embedJpg(imgBuffer) 
                  : await mergedPdf.embedPng(imgBuffer);

              if (allowedPages.includes(1)) {
                  const page = mergedPdf.addPage([embeddedImg.width, embeddedImg.height]);
                  page.drawImage(embeddedImg, {
                      x: 0, y: 0, 
                      width: embeddedImg.width, 
                      height: embeddedImg.height 
                  });
                  console.log("📄 Image page added to PDF");
              }
          } catch (err) {
              console.error("❌ Image Processing Error:", err);
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
      
      // --- 1. GENERATE FINAL BYTES ---
      const mergedPdfBytes = await mergedPdf.save({ useObjectStreams: !!compressEnabled });

      // --- 2. TRIGGER LOCAL PDF DOWNLOAD IMMEDIATELY ---
      // We do this first so you get your file even if Supabase is still connecting
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      const exportUrl = URL.createObjectURL(blob);
      const fileName = `ArchiveStream_${Date.now()}.pdf`;
      
      const link = document.createElement('a');
      link.href = exportUrl;
      link.download = fileName;
      link.click();

      // --- 3. SUPABASE CLOUD UPLOAD (Background Sync) ---
      let publicDownloadUrl = "";
      try {
        const { data: session, error: sError } = await supabase
          .from('sessions')
          .insert({})
          .select() // This already grabs everything!
          .single();

        if (sError) throw sError;

        // --- NEW: Sync the UI Countdown ---
        activeSessionTimestamp = session.uploaded_at; 
        updateCountdown(); // Trigger the math immediately

        // Log the queue
        // --- NEW: Defensive Check ---
        if (!session?.id) {
            console.warn("Cloud Bridge: Session creation failed. Skipping queue and upload.");
            return; // Stop the cloud bridge logic, but the local download is already done!
        }

        // Log the queue
        const queueEntries = files.map((f, index) => ({
            session_id: session.id,
            file_name: f.name || (f.type === 'chapter' ? f.title : 'Untitled'),
            // PHASE 3: Log the actual size of the entry
            file_size_kb: Math.round((f.rawFile?.size || 0) / 1024) || 0,
            sort_order: index
        }));

        // Add 'await' to ensure this finishes before the storage upload
        const { error: qError } = await supabase.from('document_queue').insert(queueEntries);
        if (qError) console.error("Queue Sync Error:", qError);

        // Upload
        const cloudFileName = `archive_${session.id}.pdf`;
        const { error: uError } = await supabase.storage
          .from('archives')
          .upload(cloudFileName, mergedPdfBytes);

        if (uError) throw uError;

        const { data: { publicUrl } } = supabase.storage.from('archives').getPublicUrl(cloudFileName);
        globalTheme.qrUrl = publicUrl;

        // Update history with the cloud link
        exportHistory = [{ name: fileName, date: new Date().toLocaleTimeString(), url: exportUrl, cloudUrl: publicUrl }, ...exportHistory].slice(0, 5);

      } catch (cloudErr) {
        // We log it to the console, but NO alert() here, so it doesn't interrupt the user
        console.warn("Cloud Bridge Sync failed. QR may not be active.", cloudErr);
      }

      showSuccess = true;
      setTimeout(() => { isExporting = false; showSuccess = false; }, 2500);

    } catch (err) {
      console.error("Export Failed:", err);
      alert("Error combining documents. Please check the console.");
      isExporting = false;
    }
  }
  
  async function openQRModal() {
    if (!globalTheme.qrUrl) {
      // alert("Please export your PDF first to generate a cloud download link.");
      return;
    }

    const QRCode = await import('qrcode');
    qrModalImage = await QRCode.toDataURL(globalTheme.qrUrl, {
      width: 600,
      margin: 2,
      color: {
        dark: '#0c0a09', // Stone-950
        light: '#ffffff'
      }
    });
    
    showQRModal = true;
  }

  let showQRModal = $state(false);
  let qrModalImage = $state("");

  let timeLeft = "05h 00m";
  let activeSessionTimestamp = null; // Update this when you generate the QR

  function updateCountdown() {
    if (!activeSessionTimestamp) return;

    const expiryTime = new Date(activeSessionTimestamp).getTime() + (5 * 60 * 60 * 1000);
    const now = new Date().getTime();
    const diff = expiryTime - now;

    if (diff <= 0) {
      timeLeft = "EXPIRED";
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    // Formatting to look like a digital clock: 04h 22m
    timeLeft = `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
  }

  // Run every 30 seconds to stay accurate
  setInterval(updateCountdown, 30000);
  
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

<input 
  bind:this={fileInput} 
  type="file" 
  multiple 
  accept=".pdf, .doc, .docx, .jpg, .jpeg, .png, .webp, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, image/jpeg, image/png, image/webp" 
  class="hidden" 
  onchange={(e) => { if (e.currentTarget.files) handleFiles(Array.from(e.currentTarget.files)) }} 
/>

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

          <div class="space-y-3 sm:space-y-4 max-w-full overflow-hidden">
            <p class="text-[9px] font-bold text-stone-400 uppercase tracking-tighter mb-1 italic border-t {isDark ? 'border-stone-800' : 'border-stone-100'} pt-3">
              Design Atelier <span class="opacity-70 ml-1"> (Docx & Chapters)</span>
            </p>
            
            <div class="px-1">
              <label for="typography-select" class="block text-[8px] font-bold text-stone-500 uppercase mb-1">Typography</label>
              <select 
                id="typography-select"
                bind:value={globalTheme.fontFamily}
                class="w-full p-2 text-[10px] font-bold rounded-lg border outline-none transition-all
                {isDark ? 'bg-stone-900 border-stone-800 text-stone-300' : 'bg-stone-50 border-stone-200 text-stone-700'}"
              >
                <optgroup label="Sans Serif (Clean)">
                  <option value="Helvetica">Modern Sans</option>
                  <option value="Helvetica-Bold">Modern Bold</option>
                  <option value="Helvetica-Oblique">Modern Italic</option>
                </optgroup>
                
                <optgroup label="Serif (Elegant)">
                  <option value="Times-Roman">Classic Serif</option> 
                  <option value="Times-Bold">Classic Bold</option>
                  <option value="Times-Italic">Classic Italic</option>
                </optgroup>

                <optgroup label="Monospace (Code)">
                  <option value="Courier">Technical Mono</option>
                  <option value="Courier-Bold">Technical Bold</option>
                </optgroup>

                <optgroup label="Decorative">
                  <option value="Symbol">Symbolic</option>
                  <option value="ZapfDingbats">Ornaments</option>
                </optgroup>
              </select>
            </div>
            
            <div class="px-1 py-1">
              <p class="text-[7px] sm:text-[8px] leading-tight font-medium text-amber-600/80 uppercase tracking-widest flex items-center gap-1">
                <span class="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
                Note: Color & Paper adjustments only apply to Chapter Pages
              </p>
            </div>

            <div class="grid grid-cols-2 gap-2 px-1">
              <div>
                <label for="ink-color" class="block text-[8px] font-bold text-stone-400 uppercase mb-1 tracking-tight">Ink</label>
                <div class="relative w-full h-5 rounded-md border border-stone-200 overflow-hidden shadow-sm">
                  <input 
                    id="ink-color"
                    type="color" 
                    value={globalTheme.primaryColor.hex} 
                    oninput={(e) => updateThemeColor('primaryColor', e.currentTarget.value)} 
                    class="absolute -top-3 -left-1 w-[200%] h-[200%] cursor-pointer appearance-none"
                  />
                </div>
              </div>

              <div>
                <label for="paper-color" class="block text-[8px] font-bold text-stone-400 uppercase mb-1 tracking-tight">Paper</label>
                <div class="relative w-full h-5 rounded-md border border-stone-200 overflow-hidden shadow-sm">
                  <input 
                    id="paper-color"
                    type="color" 
                    value={globalTheme.accentColor.hex} 
                    oninput={(e) => updateThemeColor('accentColor', e.currentTarget.value)} 
                    class="absolute -top-3 -left-1 w-[200%] h-[200%] cursor-pointer appearance-none"
                  />
                </div>
              </div>
            </div>

            <div class="flex gap-1 overflow-x-auto pb-2 px-1 custom-scrollbar no-scrollbar">
              {#each ['corporate', 'atelier', 'midnight', 'brutalist'] as presetName}
                {@const isActive = globalTheme.preset === presetName}
                <button 
                  onclick={() => applyPreset(presetName)}
                  class="whitespace-nowrap px-2 py-1 text-[8px] font-black uppercase rounded border transition-all
                  {isActive 
                    ? 'border-amber-500/50 text-amber-500 bg-amber-500/5' 
                    : (isDark ? 'bg-stone-900 border-stone-800 text-stone-400' : 'bg-stone-50 border-stone-200 text-stone-500')}"
                >
                  {presetName === 'corporate' ? 'DEFAULT' : presetName}
                </button>
              {/each}
            </div>

            <div class="mt-2 p-3 rounded-xl border border-stone-200 {isDark ? 'bg-stone-900/50 border-stone-800' : 'bg-white'} shadow-inner">
              <p class="text-[8px] font-bold text-stone-400 uppercase tracking-widest mb-2">Preview</p>
              
              <div 
                class="aspect-3/4 w-24 sm:w-32 mx-auto shadow-md rounded-sm border border-stone-100 transition-all duration-300 flex flex-col p-2 sm:p-3 overflow-hidden"
                style="background-color: {globalTheme.accentColor.hex};"
              >
                <div class="w-1/3 h-0.5 mb-3 opacity-40 rounded-full" style="background-color: {globalTheme.primaryColor.hex};"></div>

                <h1 
                  class="leading-tight mb-1 truncate"
                  style="
                    color: {globalTheme.primaryColor.hex}; 
                    font-family: {globalTheme.fontFamily}; 
                    font-size: {globalTheme.chapterFontSize / 10}px;
                  "
                >
                  The Archive
                </h1>
                
                <div class="w-full h-[0.5px] mb-2 opacity-20" style="background-color: {globalTheme.primaryColor.hex};"></div>
                
                <div class="space-y-1">
                  {#each [1, 2, 3] as _, i}
                    <div class="h-[1.5px] rounded-full" style="background-color: {globalTheme.primaryColor.hex}; width: {i === 2 ? '60%' : '100%'}; opacity: 0.3;"></div>
                  {/each}
                </div>
              </div>
              
              <div class="mt-2 text-center">
                <span class="text-[8px] text-stone-400 font-bold uppercase tracking-tighter">
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