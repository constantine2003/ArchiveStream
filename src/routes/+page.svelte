<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  // State management using Svelte 5 runes
  let files = $state<{ name: string; url: string }[]>([]);
  let isDragging = $state(false);

  // Load existing queue from Supabase on startup
  onMount(async () => {
    const { data, error } = await supabase
      .from('document_queue')
      .select('file_name')
      .order('sort_order', { ascending: true });

    if (data) {
      files = data.map((row) => ({ name: row.file_name, url: '' }));
    }
    if (error) console.error("Database Connection Error:", error.message);
  });

  // Handle PDF ingestion
  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    
    if (!event.dataTransfer) return;

    const droppedFiles = Array.from(event.dataTransfer.files);
    const pdfs = droppedFiles.filter(f => f.type === 'application/pdf');

    if (pdfs.length === 0) return;

    // Create local blob URLs for immediate viewing
    const newFiles = pdfs.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file)
    }));

    // Prepare metadata for Supabase
    const inserts = pdfs.map((file, i) => ({
      file_name: file.name,
      sort_order: files.length + i
    }));

    const { error } = await supabase.from('document_queue').insert(inserts);

    if (!error) {
      files = [...files, ...newFiles];
      console.table(inserts); // Engineering debug view
    }
  }

  // Clear everything (Reset button logic)
  async function clearQueue() {
    const { error } = await supabase.from('document_queue').delete().neq('id', 0);
    if (!error) files = [];
  }
</script>

<div class="flex h-screen w-full bg-zinc-950 text-zinc-200 font-sans overflow-hidden">
  
  <aside class="w-80 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
    <div class="p-6 border-b border-zinc-800">
      <h1 class="text-xl font-bold tracking-tighter text-blue-500 italic">ARCHIVE<span class="text-white">STREAM</span></h1>
      <div class="flex items-center gap-2 mt-1">
        <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        <p class="text-[10px] uppercase tracking-widest text-zinc-500">System Online</p>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
      <div class="flex justify-between items-center px-2 mb-4">
        <p class="text-xs font-semibold text-zinc-500 uppercase tracking-tighter">Live Queue</p>
        <button onclick={clearQueue} class="text-[10px] text-zinc-600 hover:text-red-400 transition-colors uppercase">Clear All</button>
      </div>
      
      {#each files as file, i}
        <div class="group flex items-center gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-blue-600/50 transition-all cursor-default">
          <span class="text-[10px] font-mono text-zinc-600">[{i + 1}]</span>
          <p class="text-xs truncate flex-1 font-medium">{file.name}</p>
        </div>
      {/each}
      
      {#if files.length === 0}
        <div class="py-20 text-center opacity-20">
          <p class="text-xs italic">Awaiting document stream...</p>
        </div>
      {/if}
    </div>

    <div class="p-4 bg-zinc-950 border-t border-zinc-800 flex flex-col gap-1">
      <p class="text-[9px] text-zinc-600 font-mono">SUPABASE_INSTANCE: ACTIVE</p>
      <p class="text-[9px] text-zinc-600 font-mono">V4_TAILWIND_ENGINE: STABLE</p>
    </div>
  </aside>

  <main 
    role="region"
    aria-label="PDF Stream"
    class="flex-1 relative flex flex-col transition-all duration-300 {isDragging ? 'bg-blue-600/10' : 'bg-black'}"
    ondragover={(e) => { e.preventDefault(); isDragging = true; }}
    ondragleave={() => isDragging = false}
    ondrop={handleDrop}
  >
    {#if files.length === 0}
      <div class="flex-1 flex flex-col items-center justify-center space-y-6">
        <div class="relative">
          <div class="absolute inset-0 bg-blue-500 blur-3xl opacity-10"></div>
          <div class="w-24 h-24 rounded-2xl bg-zinc-900 flex items-center justify-center border border-zinc-800 rotate-3 transition-transform hover:rotate-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
        </div>
        <div class="text-center">
          <h2 class="text-xl font-bold tracking-tight">Drop Archives to Stream</h2>
          <p class="text-zinc-500 text-sm mt-1">Multi-PDF sequential view active.</p>
        </div>
      </div>
    {:else}
      <div class="flex-1 overflow-y-auto p-12 space-y-24 scroll-smooth custom-scrollbar">
        {#each files as file}
          <div class="max-w-5xl mx-auto">
            <div class="flex items-center gap-4 mb-4 opacity-50 hover:opacity-100 transition-opacity">
              <div class="h-px flex-1 bg-zinc-800"></div>
              <span class="text-[10px] font-mono tracking-widest text-blue-400 uppercase">{file.name}</span>
              <div class="h-px flex-1 bg-zinc-800"></div>
            </div>
            
            {#if file.url}
              <div class="bg-zinc-900 p-1 rounded-xl shadow-2xl border border-zinc-800">
                <iframe src={file.url} title={file.name} class="w-full h-[85vh] rounded-lg bg-zinc-800"></iframe>
              </div>
            {:else}
              <div class="h-[85vh] bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center gap-2">
                <div class="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-blue-500 animate-spin"></div>
                <p class="text-xs text-zinc-600 font-mono italic">Re-drag file to establish memory link</p>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <button class="absolute bottom-10 right-10 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black text-xs tracking-widest uppercase shadow-[0_0_40px_rgba(37,99,235,0.3)] transition-all hover:scale-105 active:scale-95">
      Export Combined Report
    </button>
  </main>
</div>

<style>
  /* Sleek scrollbars for the forensic look */
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #27272a;
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #3f3f46;
  }
</style>