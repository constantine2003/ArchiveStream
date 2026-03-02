<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { store } from '$lib/stores/archiveState.svelte';

  type Props = {
    onOpenContextMenu: (e: MouseEvent, index: number) => void;
    onAddChapter: () => void;
    onExport: () => void;
    onOpenQR: () => void;
  };
  let { onOpenContextMenu, onAddChapter, onExport, onOpenQR }: Props = $props();

  async function handleDrop(targetIndex: number) {
    if (store.draggedIndex === null || store.draggedIndex === targetIndex) {
      store.draggedIndex = null;
      store.dragOverIndex = null;
      return;
    }
    const updated = [...store.files];
    const [moved] = updated.splice(store.draggedIndex, 1);
    updated.splice(targetIndex, 0, moved);
    store.files = updated;
    store.draggedIndex = null;
    store.dragOverIndex = null;
    await store.syncSortOrder();
  }

  async function removeFile(id: number | string | undefined, index: number) {
    if (typeof id === 'number') {
      await supabase.from('document_queue').delete().eq('id', id);
    }
    const file = store.files[index];
    if (file?.url) URL.revokeObjectURL(file.url);
    store.files = store.files.filter((_, i) => i !== index);
  }
</script>

<!-- Stream View -->
{#if store.viewMode === 'stream'}
  <div class="max-w-4xl mx-auto space-y-12 md:space-y-24">
    {#each store.files as file, i (file.id)}

      {#if file.type === 'chapter'}
        <section id={file.id ? String(file.id) : undefined} class="max-w-4xl mx-auto my-12 group transition-all">
          <div class="border-2 border-dashed rounded-2xl p-12 md:p-20 flex flex-col items-center justify-center
                      {store.isDark ? 'bg-stone-900/30 border-stone-800' : 'bg-stone-50 border-stone-200'}">
            <span class="text-[10px] font-black uppercase tracking-[0.4em] text-amber-600 mb-8">Section Break</span>
            <textarea bind:value={file.title} rows="1"
              class="bg-transparent text-4xl md:text-6xl font-serif text-center w-full outline-none border-b border-transparent focus:border-amber-500/30 pb-4 transition-all resize-none overflow-hidden
                     {store.isDark ? 'text-stone-200' : 'text-stone-800'}"
              placeholder="Enter Title..."
              oninput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
            ></textarea>
            <textarea bind:value={file.description}
              class="mt-6 bg-transparent text-base md:text-xl font-sans text-stone-500 text-center w-full max-w-2xl outline-none resize-none overflow-hidden opacity-70 focus:opacity-100"
              placeholder="Add a subtitle..."
              oninput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
            ></textarea>
            <div class="mt-10">
              <button onclick={() => removeFile(typeof file.id === 'number' ? file.id : undefined, i)}
                class="px-4 py-2 text-[10px] font-bold text-red-500/70 hover:text-red-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all border border-transparent hover:border-red-500/20 rounded-lg">
                Remove Chapter
              </button>
            </div>
          </div>
        </section>

      {:else if file.type === 'word'}
        <section id={file.id ? String(file.id) : ''}
          class="group transition-all duration-300 {store.activeFileId === String(file.id) ? (store.isDark ? 'ring-2 ring-amber-500' : 'ring-2 ring-amber-400') : ''}">
          <!-- Scope bar -->
          <div class="flex flex-wrap items-center justify-between gap-4 mb-4 px-4 py-3 rounded-lg border
                      {store.isDark ? 'bg-stone-900/50 border-stone-800' : 'bg-stone-50 border-stone-200'}">
            <div class="flex items-center gap-3">
              <span class="text-[10px] font-black uppercase tracking-tighter {store.isDark ? 'text-stone-400' : 'text-stone-500'}">Scope:</span>
              <div class="flex p-1 rounded-md {store.isDark ? 'bg-stone-800' : 'bg-stone-200'}">
                <button onclick={() => { file.selectionType = 'all'; file.pageSelection = 'all'; }}
                  class="px-3 py-1 text-[10px] font-bold rounded {file.selectionType !== 'custom' ? (store.isDark ? 'bg-stone-700 text-white' : 'bg-white text-stone-900 shadow-sm') : 'text-stone-500'}">ALL</button>
                <button onclick={() => { file.selectionType = 'custom'; if (!file.pageSelection || file.pageSelection === 'all') file.pageSelection = ''; }}
                  class="px-3 py-1 text-[10px] font-bold rounded {file.selectionType === 'custom' ? (store.isDark ? 'bg-amber-600 text-white' : 'bg-stone-900 text-white shadow-sm') : 'text-stone-500'}">CUSTOM</button>
              </div>
            </div>
            {#if file.selectionType === 'custom'}
              <div class="flex-1 max-w-xs relative">
                <input type="text" placeholder="e.g. 1, 3-5, 10" bind:value={file.pageSelection}
                  class="w-full pl-3 pr-10 py-1.5 text-xs font-mono bg-transparent border-b-2 outline-none transition-colors
                         {store.isDark ? 'border-stone-700 focus:border-amber-500' : 'border-stone-300 focus:border-stone-900'}" />
                <span class="absolute right-0 top-1.5 text-[9px] font-bold {store.isDark ? 'text-stone-600' : 'text-stone-400'}">PG. RANGE</span>
              </div>
            {/if}
            <div class="text-[10px] font-bold {store.isDark ? 'text-amber-500' : 'text-stone-400'}">
              {file.selectionType === 'custom' ? 'PARTIAL EXPORT' : 'FULL DOCUMENT'}
            </div>
          </div>
          <div class="flex items-center gap-4 mb-4 px-2 md:px-0">
            <span class="text-[10px] font-bold uppercase tracking-[0.2em] {store.isDark ? 'text-stone-500' : 'text-stone-400'}">{file.name}</span>
            <div class="h-px flex-1 {store.isDark ? 'bg-stone-800' : 'bg-stone-200'}"></div>
          </div>
          <div class="bg-white shadow-lg mx-auto p-6 md:p-12 w-[92%] text-left word-preview-container">
            {@html file.previewHtml}
          </div>
        </section>

      {:else}
        <section id={file.id ? String(file.id) : ''}
          class="group transition-all duration-300 {store.activeFileId === String(file.id) ? (store.isDark ? 'ring-2 ring-amber-500' : 'ring-2 ring-amber-400') : ''}">
          <!-- Scope bar -->
          <div class="flex flex-wrap items-center justify-between gap-4 mb-4 px-4 py-3 rounded-lg border
                      {store.isDark ? 'bg-stone-900/50 border-stone-800' : 'bg-stone-50 border-stone-200'}">
            <div class="flex items-center gap-3">
              <span class="text-[10px] font-black uppercase tracking-tighter {store.isDark ? 'text-stone-400' : 'text-stone-500'}">Scope:</span>
              <div class="flex p-1 rounded-md {store.isDark ? 'bg-stone-800' : 'bg-stone-200'}">
                <button onclick={() => { file.selectionType = 'all'; file.pageSelection = 'all'; }}
                  class="px-3 py-1 text-[10px] font-bold rounded {file.selectionType !== 'custom' ? (store.isDark ? 'bg-stone-700 text-white' : 'bg-white text-stone-900 shadow-sm') : 'text-stone-500'}">ALL</button>
                <button onclick={() => { file.selectionType = 'custom'; if (!file.pageSelection || file.pageSelection === 'all') file.pageSelection = ''; }}
                  class="px-3 py-1 text-[10px] font-bold rounded {file.selectionType === 'custom' ? (store.isDark ? 'bg-amber-600 text-white' : 'bg-stone-900 text-white shadow-sm') : 'text-stone-500'}">CUSTOM</button>
              </div>
            </div>
            {#if file.selectionType === 'custom'}
              <div class="flex-1 max-w-xs relative">
                <input type="text" placeholder="e.g. 1, 3-5, 10" bind:value={file.pageSelection}
                  class="w-full pl-3 pr-10 py-1.5 text-xs font-mono bg-transparent border-b-2 outline-none transition-colors
                         {store.isDark ? 'border-stone-700 focus:border-amber-500' : 'border-stone-300 focus:border-stone-900'}" />
                <span class="absolute right-0 top-1.5 text-[9px] font-bold {store.isDark ? 'text-stone-600' : 'text-stone-400'}">PG. RANGE</span>
              </div>
            {/if}
            <div class="text-[10px] font-bold {store.isDark ? 'text-amber-500' : 'text-stone-400'}">
              {file.selectionType === 'custom' ? 'PARTIAL EXPORT' : 'FULL DOCUMENT'}
            </div>
          </div>
          <div class="flex items-center gap-4 mb-4 px-2 md:px-0">
            <span class="text-[10px] font-bold uppercase tracking-[0.2em] {store.isDark ? 'text-stone-500' : 'text-stone-400'}">{file.name}</span>
            <div class="h-px flex-1 {store.isDark ? 'bg-stone-800' : 'bg-stone-200'}"></div>
          </div>
          {#if file.type === 'image'}
            <div class="rounded-xl shadow-2xl overflow-hidden border flex items-center justify-center p-4
                        {store.isDark ? 'border-stone-800 bg-stone-900' : 'border-stone-200 bg-white'}">
              <img src={file.url} alt={file.name} class="max-w-full max-h-[85vh] object-contain rounded-lg" />
            </div>
          {:else}
            <div class="bg-white rounded-xl shadow-2xl overflow-hidden border {store.isDark ? 'border-stone-800' : 'border-stone-200'}">
              <iframe src={file.url} title={file.name} class="w-full h-[60vh] md:h-[85vh]"></iframe>
            </div>
          {/if}
        </section>
      {/if}
    {/each}
  </div>

<!-- Grid View -->
{:else}
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 max-w-7xl mx-auto">
    {#each store.files as file, i (file.id)}
      <div
        draggable="true" role="listitem"
        aria-grabbed={store.draggedIndex === i}
        ondragstart={() => (store.draggedIndex = i)}
        ondragover={(e) => { e.preventDefault(); store.dragOverIndex = i; }}
        ondrop={() => handleDrop(i)}
        class="group relative aspect-3/4 rounded-2xl border-2 transition-all duration-300 cursor-grab active:cursor-grabbing flex flex-col items-center justify-center p-4 text-center
               {store.draggedIndex === i ? 'opacity-20 scale-95' : 'opacity-100'}
               {store.dragOverIndex === i ? 'border-amber-500 bg-amber-500/5' : store.isDark ? 'border-stone-800 bg-stone-900/40 hover:border-stone-600' : 'border-stone-200 bg-white shadow-sm hover:border-amber-500'}"
      >
        <div class="absolute top-3 left-3 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                    {store.isDark ? 'bg-stone-800 text-stone-400' : 'bg-stone-100 text-stone-500'}">{i + 1}</div>
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-4 {store.isDark ? 'text-stone-700' : 'text-stone-200'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p class="text-[10px] font-bold uppercase tracking-widest leading-tight px-2 line-clamp-2
                  {store.isDark ? 'text-stone-400 group-hover:text-stone-200' : 'text-stone-600 group-hover:text-black'}">{file.name}</p>
        <button aria-label="Remove file"
          onclick={(e) => { e.stopPropagation(); removeFile(typeof file.id === 'number' ? file.id : undefined, i); }}
          class="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

<!-- Floating action bar -->
<div class="fixed md:absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4 pointer-events-none">
  <div class="flex flex-col items-center gap-4 pointer-events-auto">
    <button onclick={() => (store.compressEnabled = !store.compressEnabled)}
      class="flex items-center gap-3 px-4 py-2 rounded-full border transition-all shadow-sm
             {store.isDark ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200'}">
      <span class="text-[9px] font-black uppercase tracking-widest {store.isDark ? 'text-stone-500' : 'text-stone-400'}">
        {store.compressEnabled ? 'Compression On' : 'Original Quality'}
      </span>
      <div class="w-8 h-4 rounded-full relative transition-colors {store.compressEnabled ? 'bg-amber-600' : 'bg-stone-300'}">
        <div class="absolute top-0.5 transition-all w-3 h-3 bg-white rounded-full {store.compressEnabled ? 'right-0.5' : 'left-0.5'}"></div>
      </div>
    </button>
    <div class="flex justify-center w-full gap-2">
      <button onclick={onAddChapter}
        class="flex-1 py-4 bg-stone-200 hover:bg-amber-100 text-amber-700 rounded-full font-bold text-[10px] tracking-[0.3em] uppercase shadow-xl transition-all border border-stone-300">
        + Chapter
      </button>
      <button onclick={onExport} disabled={store.isExporting}
        class="flex-[2] py-4 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 text-white rounded-full font-bold text-[10px] tracking-[0.3em] uppercase shadow-2xl transition-all">
        {store.isExporting ? 'Compressing...' : 'Export PDF'}
      </button>
      <button onclick={onOpenQR} title="View QR Code"
        class="aspect-square h-[52px] relative flex items-center justify-center bg-stone-950 hover:bg-black text-white rounded-2xl transition-all shadow-xl border border-stone-800 group shrink-0">
        {#if store.globalTheme.qrUrl}
          <span class="absolute -top-1 -right-1 flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
        {/if}
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:rotate-90 transition-transform duration-300">
          <rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/>
          <rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/>
          <path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/>
          <path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/>
          <path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>
        </svg>
      </button>
    </div>
  </div>
</div>