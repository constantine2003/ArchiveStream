<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';
  import { PDFDocument } from 'pdf-lib';

  // --- State Management ---
  let files = $state<{ id?: number; name: string; url: string; isEditing?: boolean }[]>([]);
  let exportHistory = $state<{ name: string; date: string; url: string }[]>([]);
  let searchQuery = $state("");
  let isDragging = $state(false);
  let isExporting = $state(false);
  let exportProgress = $state(0);
  let showSuccess = $state(false);
  let fileInput: HTMLInputElement;
  let isDark = $state(false);
  let sidebarOpen = $state(false);

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
    if (savedTheme === 'dark') isDark = true;
    
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
    const pdfs = droppedFiles.filter(f => f.type === 'application/pdf');
    if (pdfs.length === 0) return;

    for (const file of pdfs) {
      const { data, error } = await supabase
        .from('document_queue')
        .insert({ file_name: file.name, sort_order: files.length })
        .select();

      if (!error && data) {
        files = [...files, { 
          id: data[0].id, 
          name: file.name, 
          url: URL.createObjectURL(file),
          isEditing: false
        }];
      }
    }
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
    URL.revokeObjectURL(files[index].url);
    files = files.filter((_, i) => i !== index);
  }

  async function clearQueue() {
    if (!confirm("Clear all documents?")) return;
    await supabase.from('document_queue').delete().neq('id', 0);
    files.forEach(f => URL.revokeObjectURL(f.url));
    files = [];
  }

  async function handleExport() {
    if (files.length === 0 || isExporting) return;
    try {
      isExporting = true; showSuccess = false; exportProgress = 0;
      const mergedPdf = await PDFDocument.create();
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const response = await fetch(file.url);
        const pdfBytes = await response.arrayBuffer();
        const pdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        exportProgress = Math.round(((i + 1) / files.length) * 100);
      }

      const mergedPdfBytes = await mergedPdf.save();
      // Fix: Always convert to ArrayBuffer for Blob compatibility
      const arrayBuffer = mergedPdfBytes instanceof ArrayBuffer ? mergedPdfBytes : new Uint8Array(mergedPdfBytes).buffer;
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const exportUrl = URL.createObjectURL(blob);
      const fileName = `ArchiveStream_${Date.now()}.pdf`;
      
      const link = document.createElement('a');
      link.href = exportUrl;
      link.download = fileName;
      link.click();

      exportHistory = [{
        name: fileName,
        date: new Date().toLocaleDateString(undefined, { 
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
        }),
        url: exportUrl
      }, ...exportHistory].slice(0, 5);

      showSuccess = true;
      setTimeout(() => { 
        isExporting = false; 
        showSuccess = false; 
        exportProgress = 0; 
      }, 2500);
    } catch (err) {
      console.error("Export Failed:", err);
      alert("Error combining documents.");
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
      <button onclick={() => { removeFile(files[activeFileIndex!].id, activeFileIndex!); closeMenu(); }} class="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors text-red-500 {isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}">
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
          class="group flex items-center gap-3 p-3 rounded-xl transition-all cursor-grab active:cursor-grabbing border
               {draggedIndex === i ? 'opacity-30' : 'opacity-100'}
               {dragOverIndex === i 
                 ? 'bg-amber-600/10 border-amber-600/30' 
                 : (isDark 
                    ? 'bg-transparent border-transparent hover:bg-stone-900 hover:border-stone-800' 
                    : 'bg-transparent border-transparent hover:bg-white hover:shadow-sm hover:border-stone-200')}"
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

          <button onclick={() => removeFile(file.id, i)} class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 transition-all px-1" aria-label="Delete file">
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
      <div class="flex-1 overflow-y-auto p-4 pt-20 md:p-8 md:pt-12 pb-32 space-y-12 md:space-y-24 scroll-smooth custom-scrollbar">
        {#each files as file (file.id)}
          <div class="max-w-full md:max-w-4xl mx-auto">
            <div class="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-4 md:mb-6 px-2 md:px-0">
              <span class="text-xs md:text-[10px] font-bold {isDark ? 'text-stone-500' : 'text-stone-400'} uppercase tracking-[0.2em] truncate">{file.name}</span>
              <div class="h-px flex-1 {isDark ? 'bg-stone-800' : 'bg-stone-200'} hidden md:block"></div>
            </div>
            <div class="bg-white rounded-xl md:rounded-2xl shadow-xl md:shadow-2xl overflow-hidden border {isDark ? 'border-stone-800' : 'border-stone-200'}">
                <iframe src={file.url} title={file.name} class="w-full min-h-[50vh] h-[60vw] max-h-[70vh] md:h-[85vh] bg-white"></iframe>
            </div>
          </div>
        {/each}
      </div>

      <div class="fixed md:absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 flex justify-center px-4 z-20 w-full">
        <button 
            onclick={handleExport}
            disabled={isExporting}
            class="w-full max-w-xs md:w-auto md:px-12 py-4 md:py-5 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 text-white rounded-full font-bold text-xs md:text-[10px] tracking-[0.3em] uppercase shadow-2xl transition-all hover:scale-105 active:scale-95"
        >
          {isExporting ? 'Processing...' : 'Export Collection'}
        </button>
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
</style>