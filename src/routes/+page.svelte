<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';
  import { PDFDocument } from 'pdf-lib'; 

  let files = $state<{ id?: number; name: string; url: string }[]>([]);
  let searchQuery = $state(""); 
  let isDragging = $state(false);
  let isExporting = $state(false);
  let exportProgress = $state(0);
  let showSuccess = $state(false); // New: Success state toggle
  let fileInput: HTMLInputElement;

  let draggedIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  let filteredFiles = $derived(
    files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  onMount(async () => {
    await supabase.from('document_queue').delete().neq('id', 0);
    files = [];
  });

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
          url: URL.createObjectURL(file) 
        }];
      }
    }
  }

  async function handleDrop(targetIndex: number) {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      draggedIndex = null;
      dragOverIndex = null;
      return;
    }

    const updatedFiles = [...files];
    const [movedItem] = updatedFiles.splice(draggedIndex, 1);
    updatedFiles.splice(targetIndex, 0, movedItem);
    files = updatedFiles;

    draggedIndex = null;
    dragOverIndex = null;

    const updates = files.map((f, index) => ({
      id: f.id,
      file_name: f.name,
      sort_order: index
    }));
    await supabase.from('document_queue').upsert(updates);
  }

  async function removeFile(id: number | undefined, index: number) {
    if (id) await supabase.from('document_queue').delete().eq('id', id);
    URL.revokeObjectURL(files[index].url);
    files = files.filter((_, i) => i !== index);
  }

  async function clearQueue() {
    await supabase.from('document_queue').delete().neq('id', 0);
    files.forEach(f => URL.revokeObjectURL(f.url));
    files = [];
  }

  function onFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) handleFiles(Array.from(target.files));
  }

  async function handleExport() {
    if (files.length === 0 || isExporting) return;
    
    try {
      isExporting = true;
      showSuccess = false;
      exportProgress = 0;
      
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
      const blob = new Blob([mergedPdfBytes as any], { type: 'application/pdf' });
      const exportUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = exportUrl;
      link.download = `ArchiveStream_Combined_${Date.now()}.pdf`;
      link.click();
      
      // Trigger Success UI
      showSuccess = true;
      
      // Auto-hide after 2.5 seconds
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

{#if isExporting}
<div class="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center transition-all duration-500">
    <div class="w-full max-w-sm px-8 text-center">
        
        {#if !showSuccess}
            <div class="relative mb-8 flex justify-center">
                <div class="w-24 h-24 border-[3px] border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-sm font-mono font-bold text-blue-400">{exportProgress}%</span>
                </div>
            </div>
            <h2 class="text-lg font-black tracking-[0.2em] text-white uppercase mb-2">Splicing Data</h2>
            <div class="w-full h-1 bg-zinc-900 rounded-full overflow-hidden mb-4">
                <div class="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_15px_#3b82f6]" style="width: {exportProgress}%"></div>
            </div>
        {:else}
            <div class="mb-8 flex justify-center animate-bounce">
                <div class="w-24 h-24 bg-green-500/20 border-2 border-green-500 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            </div>
            <h2 class="text-lg font-black tracking-[0.2em] text-green-500 uppercase mb-2">Stream Compiled</h2>
            <p class="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Download Initiated • Archive Validated</p>
        {/if}
    </div>
</div>
{/if}

<input bind:this={fileInput} type="file" multiple accept="application/pdf" class="hidden" onchange={onFileSelect} />

<div class="flex h-screen w-full bg-zinc-950 text-zinc-200 font-sans overflow-hidden">
  <aside class="w-80 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
    <div class="p-6 border-b border-zinc-800">
      <h1 class="text-xl font-bold tracking-tighter text-blue-500 italic">ARCHIVE<span class="text-white">STREAM</span></h1>
      <div class="flex items-center gap-2 mt-1">
        <span class="w-2 h-2 rounded-full {files.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}"></span>
        <p class="text-[10px] uppercase tracking-widest text-zinc-500">
          {files.length > 0 ? 'Active Stream' : 'Ready'}
        </p>
      </div>
    </div>

    <div class="p-4 border-b border-zinc-800">
      <div class="relative group">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input 
          bind:value={searchQuery}
          type="text" 
          placeholder="SEARCH ARCHIVES..." 
          class="w-full bg-black border border-zinc-800 rounded-md py-2 pl-9 pr-3 text-[10px] font-mono focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
      <div class="flex justify-between items-center px-2 mb-4">
        <p class="text-xs font-semibold text-zinc-500 uppercase tracking-tighter">Live Queue ({filteredFiles.length})</p>
        <button onclick={clearQueue} class="text-[10px] text-zinc-600 hover:text-red-400 transition-colors uppercase">Wipe All</button>
      </div>
      
      {#each filteredFiles as file, i (file.id)}
        <div 
          draggable="true"
          role="listitem"
          ondragstart={() => draggedIndex = i}
          ondragover={(e) => { e.preventDefault(); dragOverIndex = i; }}
          ondragleave={() => dragOverIndex = null}
          ondrop={() => handleDrop(i)}
          class="group flex items-center gap-3 p-3 rounded-lg bg-zinc-900 border transition-all cursor-grab active:cursor-grabbing
                 {draggedIndex === i ? 'opacity-20' : 'opacity-100'}
                 {dragOverIndex === i ? 'border-blue-500 bg-zinc-800 scale-[1.02]' : 'border-zinc-800 hover:border-blue-600/50'}"
        >
          <span class="text-[10px] font-mono text-zinc-600 group-hover:text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
            </svg>
          </span>
          <p class="text-xs truncate flex-1 font-medium">{file.name}</p>
          <button onclick={() => removeFile(file.id, i)} aria-label="Remove file" class="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-500 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      {/each}
    </div>

    <div class="p-4 bg-zinc-950 border-t border-zinc-800">
        <button onclick={() => fileInput.click()} class="w-full py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all">
            + Add Document
        </button>
    </div>
  </aside>

  <main 
    class="flex-1 relative flex flex-col {isDragging ? 'bg-blue-600/10' : 'bg-black'}"
    ondragover={(e) => { e.preventDefault(); isDragging = true; }}
    ondragleave={() => isDragging = false}
    ondrop={(e) => { e.preventDefault(); isDragging = false; if (e.dataTransfer) handleFiles(Array.from(e.dataTransfer.files)); }}
  >
    {#if files.length === 0}
      <div class="flex-1 flex flex-col items-center justify-center">
        <button onclick={() => fileInput.click()} class="group flex flex-col items-center">
          <div class="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 group-hover:border-blue-500 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-zinc-600 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p class="mt-4 text-sm text-zinc-500 font-medium tracking-tight uppercase">Drop PDFs to initialize</p>
        </button>
      </div>
    {:else}
      <div class="flex-1 overflow-y-auto p-12 space-y-32 scroll-smooth custom-scrollbar">
        {#each files as file (file.url)}
          <div class="max-w-5xl mx-auto">
            <div class="flex items-center gap-4 mb-6 opacity-40">
              <span class="text-[10px] font-mono text-blue-400 uppercase tracking-[0.3em]">{file.name}</span>
              <div class="h-px flex-1 bg-linear-to-r from-blue-500/50 to-transparent"></div>
            </div>
            <div class="bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 overflow-hidden">
                <iframe src={file.url} title={file.name} class="w-full h-[85vh] bg-zinc-800"></iframe>
            </div>
          </div>
        {/each}
      </div>

      <div class="absolute bottom-10 right-10">
        <button 
            onclick={handleExport}
            disabled={isExporting}
            class="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white px-8 py-4 rounded-2xl font-black text-xs tracking-widest uppercase shadow-[0_0_40px_rgba(37,99,235,0.2)] transition-all hover:scale-105"
        >
          {isExporting ? 'Processing...' : 'Export Stream'}
        </button>
      </div>
    {/if}
  </main>
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
</style>