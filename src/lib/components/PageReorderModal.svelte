<script lang="ts">
  import { store } from '$lib/stores/archiveState.svelte';
  import { PDFDocument } from 'pdf-lib';

  type Props = { onConfirm: (fileId: string, newOrder: number[]) => void };
  let { onConfirm }: Props = $props();

  let pages = $state<{ index: number; dataUrl: string }[]>([]);
  let loading = $state(true);
  let draggedIdx = $state<number | null>(null);
  let dragOverIdx = $state<number | null>(null);

  const file = $derived(store.files.find(f => f.id === store.pageReorderFile));

  async function renderPages() {
    if (!file?.rawFile) return;
    loading = true;
    pages = [];

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

      const arrayBuffer = await file.rawFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const total = pdf.numPages;

      const rendered: { index: number; dataUrl: string }[] = [];
      for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise;
        rendered.push({ index: i - 1, dataUrl: canvas.toDataURL() });
      }
      pages = rendered;
    } catch (err) {
      console.error('Failed to render pages:', err);
    }
    loading = false;
  }

  $effect(() => {
    if (store.pageReorderFile) renderPages();
  });

  function handleDragStart(i: number) { draggedIdx = i; }
  function handleDragOver(i: number) { dragOverIdx = i; }

  function handleDrop(targetIdx: number) {
    if (draggedIdx === null || draggedIdx === targetIdx) { draggedIdx = null; dragOverIdx = null; return; }
    const updated = [...pages];
    const [moved] = updated.splice(draggedIdx, 1);
    updated.splice(targetIdx, 0, moved);
    pages = updated;
    draggedIdx = null;
    dragOverIdx = null;
  }

  function confirm() {
    if (!file) return;
    onConfirm(String(file.id), pages.map(p => p.index));
    store.pageReorderFile = null;
  }

  function close() { store.pageReorderFile = null; }
</script>

{#if store.pageReorderFile}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
       style="background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);"
       role="dialog" aria-modal="true" aria-label="Reorder pages">

    <div class="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
         style="background-color: {store.isDark ? '#0c0a09' : '#ffffff'}; border-color: {store.isDark ? '#292524' : '#e7e5e4'}; max-height: 90vh;">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b shrink-0"
           style="border-color: {store.isDark ? '#292524' : '#e7e5e4'};">
        <div>
          <h2 class="font-serif text-lg" style="color: {store.isDark ? '#ffffff' : '#1c1917'};">Reorder Pages</h2>
          <p class="text-[11px]" style="color: {store.isDark ? '#57534e' : '#a8a29e'};">{file?.name} — drag to reorder</p>
        </div>
        <button onclick={close} aria-label="Close"
          class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                 {store.isDark ? 'text-stone-600 hover:text-stone-400 hover:bg-stone-900' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-100'}">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Pages grid -->
      <div class="flex-1 overflow-y-auto p-6">
        {#if loading}
          <div class="flex flex-col items-center justify-center py-20 gap-4">
            <div class="w-8 h-8 rounded-full border-2 border-amber-600 border-t-transparent animate-spin"></div>
            <p class="text-[11px] uppercase tracking-widest" style="color: {store.isDark ? '#57534e' : '#a8a29e'};">Rendering pages...</p>
          </div>
        {:else}
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {#each pages as page, i (page.index)}
              <div
                draggable="true"
                ondragstart={() => handleDragStart(i)}
                ondragover={(e) => { e.preventDefault(); handleDragOver(i); }}
                ondrop={() => handleDrop(i)}
                ondragend={() => { draggedIdx = null; dragOverIdx = null; }}
                class="group relative cursor-grab active:cursor-grabbing rounded-xl overflow-hidden border-2 transition-all duration-200"
                style="border-color: {dragOverIdx === i ? '#d97706' : (store.isDark ? '#292524' : '#e7e5e4')}; opacity: {draggedIdx === i ? 0.3 : 1}; background-color: {dragOverIdx === i ? '#d9770610' : 'transparent'};">
                <img src={page.dataUrl} alt="Page {i + 1}" class="w-full object-cover" />
                <div class="absolute bottom-0 left-0 right-0 py-1 text-center text-[9px] font-bold uppercase tracking-widest"
                     style="background-color: {store.isDark ? 'rgba(12,10,9,0.85)' : 'rgba(255,255,255,0.9)'}; color: {store.isDark ? '#57534e' : '#a8a29e'};">
                  {i + 1}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Actions -->
      <div class="flex gap-3 px-6 py-4 border-t shrink-0"
           style="border-color: {store.isDark ? '#292524' : '#e7e5e4'};">
        <button onclick={close}
          class="flex-1 py-3 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all"
          style="border-color: {store.isDark ? '#292524' : '#e7e5e4'}; color: {store.isDark ? '#57534e' : '#a8a29e'};">
          Cancel
        </button>
        <button onclick={confirm} disabled={loading}
          class="flex-2 py-3 px-6 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-widest transition-all">
          Apply Order
        </button>
      </div>
    </div>
  </div>
{/if}