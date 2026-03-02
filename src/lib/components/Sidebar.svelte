<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { slide } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { store } from '$lib/stores/archiveState.svelte';
  import { updateThemeColor, applyPreset } from '$lib/utils/themeUtils';
  import type { WatermarkType } from '$lib/types';

  type Props = {
    fileInput: HTMLInputElement | undefined;
    onImport: () => void;
  };
  let { fileInput, onImport }: Props = $props();

  function handleSidebarSync(fileId: string | number) {
    store.activeFileId = String(fileId);
    const el = document.getElementById(String(fileId));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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

  async function clearQueue() {
    await supabase.from('document_queue').delete().neq('id', 0);
    store.files.forEach((f) => { if (f.url) URL.revokeObjectURL(f.url); });
    store.files = [];
  }

  async function saveRename(index: number, newName: string) {
    store.files[index].isEditing = false;
    if (!newName || newName === store.files[index].name) return;
    const sanitized = newName.endsWith('.pdf') ? newName : newName + '.pdf';
    store.files[index].name = sanitized;
    await supabase.from('document_queue').update({ file_name: sanitized }).eq('id', store.files[index].id);
  }

  function openContextMenu(e: MouseEvent, index: number) {
    e.preventDefault();
    store.menuPos.x = e.clientX;
    store.menuPos.y = e.clientY;
    store.activeFileIndex = index;
    store.menuVisible = true;
  }
</script>

{#if store.sidebarOpen}
  <div
    class="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-sm"
    role="button" tabindex="0" aria-label="Close sidebar"
    onclick={() => (store.sidebarOpen = false)}
    onkeydown={(e) => e.key === 'Escape' && (store.sidebarOpen = false)}
  ></div>
{/if}

<aside
  class="fixed md:static top-0 left-0 h-full w-72 max-w-[85vw] border-r flex flex-col transition-transform duration-500 shadow-xl z-50 md:z-20
         {store.isDark ? 'border-stone-800 bg-stone-950' : 'border-stone-200 bg-white'}
         {store.sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:w-80 md:max-w-xs"
>
  <!-- Header -->
  <div class="p-6 pb-4 flex justify-between items-start md:p-8 md:pb-6">
    <div class="flex items-center gap-2">
      <h1 class="text-lg md:text-2xl font-serif tracking-tight {store.isDark ? 'text-white' : 'text-black'}">
        ArchiveStream<span class="text-amber-600">.</span>
      </h1>
      <span class="w-1.5 h-1.5 rounded-full {store.files.length > 0 ? 'bg-amber-500 animate-pulse' : 'bg-stone-400'}"></span>
    </div>
    <div class="flex gap-2 items-center">
      <button onclick={() => (store.isDark = !store.isDark)} class="p-2 rounded-lg hover:bg-stone-500/10 transition-colors" title="Toggle Theme">
        {#if store.isDark}
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        {/if}
      </button>
      <button class="md:hidden p-2 rounded-lg hover:bg-stone-500/10" onclick={() => (store.sidebarOpen = false)} aria-label="Close sidebar">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Search -->
  <div class="px-4 mb-4 md:px-6 md:mb-6">
    <input
      bind:value={store.searchQuery}
      type="text" placeholder="Filter documents..."
      class="w-full border-none rounded-lg py-2 px-3 md:py-2.5 md:px-4 text-xs focus:ring-1 focus:ring-amber-600/50 outline-none transition-all
             {store.isDark ? 'bg-stone-900 text-white placeholder-stone-500' : 'bg-stone-100 text-stone-900'}"
    />
  </div>

  <!-- File List -->
  <div class="flex-1 overflow-y-auto px-2 md:px-4 space-y-1 custom-scrollbar" role="listbox" aria-label="Document library">
    <div class="flex justify-between items-center px-2 mb-4">
      <p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Library ({store.filteredFiles.length})</p>
      <button onclick={clearQueue} class="text-[10px] text-stone-500 hover:text-amber-600 transition-colors uppercase font-bold">Clear</button>
    </div>

    {#each store.filteredFiles as file, i (file.id)}
      <div
        draggable="true"
        role="option"
        aria-selected={store.activeFileId === String(file.id)}
        tabindex="0"
        oncontextmenu={(e) => openContextMenu(e, i)}
        ondragstart={() => (store.draggedIndex = i)}
        ondragover={(e) => { e.preventDefault(); store.dragOverIndex = i; }}
        ondragleave={() => (store.dragOverIndex = null)}
        ondrop={() => handleDrop(i)}
        onclick={() => handleSidebarSync(file.id)}
        onkeydown={(e) => e.key === 'Enter' && handleSidebarSync(file.id)}
        class="group flex items-center gap-3 p-3 rounded-xl transition-all cursor-grab active:cursor-grabbing border {[
          store.draggedIndex === i ? 'opacity-20 scale-95' : 'opacity-100',
          store.dragOverIndex === i
            ? 'bg-amber-600/10 border-amber-600/30'
            : store.isDark
              ? 'bg-transparent border-transparent hover:bg-stone-900 hover:border-stone-800'
              : 'bg-transparent border-transparent hover:bg-white hover:shadow-sm hover:border-stone-200',
          store.activeFileId === String(file.id) ? (store.isDark ? 'ring-2 ring-amber-500' : 'ring-2 ring-amber-400') : '',
        ].join(' ')}"
      >
        <div class="text-stone-500 opacity-30 group-hover:opacity-100 transition-opacity">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/>
            <circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          {#if file.isEditing}
            <input
              class="w-full text-xs px-1 py-0.5 rounded border outline-none
                     {store.isDark ? 'bg-amber-600/10 border-amber-600/30 text-amber-200' : 'bg-stone-100 border-stone-300 text-black'}"
              value={file.name}
              onmousedown={(e) => e.stopPropagation()}
              onclick={(e) => e.stopPropagation()}
              ondragstart={(e) => e.preventDefault()}
              onblur={(e) => saveRename(i, e.currentTarget.value)}
              onkeydown={(e) => {
                if (e.key === 'Enter') saveRename(i, e.currentTarget.value);
                if (e.key === 'Escape') (file.isEditing = false);
              }}
            />
          {:else}
            <p class="text-xs truncate font-medium transition-colors
                      {store.isDark ? 'text-stone-300 group-hover:text-amber-200' : 'text-stone-700 group-hover:text-black'}">
              {file.name}
            </p>
          {/if}
        </div>
        <button
          onclick={(e) => { e.stopPropagation(); removeFile(file.id, i); }}
          class="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 transition-all px-1"
          aria-label="Delete file"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/each}

    <!-- Recent Exports -->
    {#if store.exportHistory.length > 0}
      <div class="pt-8 pb-4">
        <div class="flex justify-between items-center px-2 mb-4">
          <p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Recent Exports</p>
          <button onclick={() => (store.exportHistory = [])} class="text-[10px] text-stone-500 hover:text-red-500 transition-colors uppercase font-bold">Clear</button>
        </div>
        {#each store.exportHistory as item}
          <div class="group flex items-center gap-3 p-3 rounded-xl border border-transparent transition-all mb-1
                      {store.isDark ? 'hover:bg-stone-900/50 hover:border-stone-800' : 'hover:bg-stone-100 hover:border-stone-200'}">
            <div class="text-amber-600/40 group-hover:text-amber-600">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <a href={item.url} download={item.name}
                class="text-[10px] block truncate font-medium transition-colors
                       {store.isDark ? 'text-stone-400 group-hover:text-stone-200' : 'text-stone-600 group-hover:text-stone-900'}">
                {item.name}
              </a>
              <p class="text-[8px] text-stone-500 uppercase tracking-tighter">{item.date}</p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Design & Overlays Panel -->
  <div class="border-t {store.isDark ? 'border-stone-800' : 'border-stone-100'}">
    <button
      onclick={() => (store.settingsExpanded = !store.settingsExpanded)}
      class="w-full px-4 py-4 flex justify-between items-center transition-colors {store.isDark ? 'hover:bg-stone-900' : 'hover:bg-stone-50'}"
    >
      <p class="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Design & Overlays</p>
      <div class="transition-transform duration-300 {store.settingsExpanded ? 'rotate-0' : 'rotate-180'}">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </button>

    {#if store.settingsExpanded}
      <div transition:slide={{ duration: 400, easing: quintOut }} class="px-4 pb-3 space-y-6 overflow-hidden">

        <!-- Watermarks -->
        <div>
          <p class="text-[9px] font-bold text-stone-400 uppercase tracking-tighter mb-2 italic">Template Overlays</p>
          <div class="grid grid-cols-2 gap-2">
            {#each ['NONE', 'DRAFT', 'CONFIDENTIAL', 'APPROVED'] as type}
              <button
                onclick={() => (store.activeWatermark = type as WatermarkType)}
                class="py-2 px-1 rounded-lg border text-[9px] font-black uppercase tracking-tighter transition-all
                       {store.activeWatermark === type
                         ? 'bg-amber-600 border-amber-600 text-white shadow-lg'
                         : store.isDark ? 'bg-stone-900 border-stone-800 text-stone-500 hover:border-stone-600' : 'bg-white border-stone-200 text-stone-400 hover:border-stone-300'}"
              >{type}</button>
            {/each}
          </div>
        </div>

        <!-- Typography & Theme -->
        <div class="space-y-3 max-w-full overflow-hidden">
          <p class="text-[9px] font-bold text-stone-400 uppercase tracking-tighter mb-1 italic border-t pt-3
                    {store.isDark ? 'border-stone-800' : 'border-stone-100'}">
            Design Atelier <span class="opacity-70 ml-1">(Docx & Chapters)</span>
          </p>

          <div class="px-1">
            <label for="typography-select" class="block text-[8px] font-bold text-stone-500 uppercase mb-1">Typography</label>
            <select
              id="typography-select"
              bind:value={store.globalTheme.fontFamily}
              class="w-full p-2 text-[10px] font-bold rounded-lg border outline-none transition-all
                     {store.isDark ? 'bg-stone-900 border-stone-800 text-stone-300' : 'bg-stone-50 border-stone-200 text-stone-700'}"
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
            <p class="text-[7px] font-medium text-amber-600/80 uppercase tracking-widest flex items-center gap-1">
              <span class="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
              Note: Color & Paper adjustments only apply to Chapter Pages
            </p>
          </div>

          <div class="grid grid-cols-2 gap-2 px-1">
            <div>
              <label for="ink-color" class="block text-[8px] font-bold text-stone-400 uppercase mb-1 tracking-tight">Ink</label>
              <div class="relative w-full h-5 rounded-md border border-stone-200 overflow-hidden shadow-sm">
                <input id="ink-color" type="color"
                  value={store.globalTheme.primaryColor.hex}
                  oninput={(e) => {
                    const updated = updateThemeColor(store.globalTheme, 'primaryColor', e.currentTarget.value);
                    store.globalTheme.primaryColor = updated.primaryColor;
                  }}
                  class="absolute -top-3 -left-1 w-[200%] h-[200%] cursor-pointer appearance-none"
                />
              </div>
            </div>
            <div>
              <label for="paper-color" class="block text-[8px] font-bold text-stone-400 uppercase mb-1 tracking-tight">Paper</label>
              <div class="relative w-full h-5 rounded-md border border-stone-200 overflow-hidden shadow-sm">
                <input id="paper-color" type="color"
                  value={store.globalTheme.accentColor.hex}
                  oninput={(e) => {
                    const updated = updateThemeColor(store.globalTheme, 'accentColor', e.currentTarget.value);
                    store.globalTheme.accentColor = updated.accentColor;
                  }}
                  class="absolute -top-3 -left-1 w-[200%] h-[200%] cursor-pointer appearance-none"
                />
              </div>
            </div>
          </div>

          <!-- Presets -->
          <div class="flex gap-1 overflow-x-auto pb-2 px-1 no-scrollbar">
            {#each ['corporate', 'atelier', 'midnight', 'brutalist'] as presetName}
              {@const isActive = store.globalTheme.preset === presetName}
              <button
                onclick={() => { const updated = applyPreset(store.globalTheme, presetName); Object.assign(store.globalTheme, updated); }}
                class="whitespace-nowrap px-2 py-1 text-[8px] font-black uppercase rounded border transition-all
                       {isActive ? 'border-amber-500/50 text-amber-500 bg-amber-500/5' : store.isDark ? 'bg-stone-900 border-stone-800 text-stone-400' : 'bg-stone-50 border-stone-200 text-stone-500'}"
              >
                {presetName === 'corporate' ? 'DEFAULT' : presetName}
              </button>
            {/each}
          </div>

          <!-- Preview -->
          <div class="mt-2 p-3 rounded-xl border shadow-inner {store.isDark ? 'bg-stone-900/50 border-stone-800' : 'bg-white border-stone-200'}">
            <p class="text-[8px] font-bold text-stone-400 uppercase tracking-widest mb-2">Preview</p>
            <div
              class="aspect-3/4 w-24 sm:w-32 mx-auto shadow-md rounded-sm border border-stone-100 transition-all duration-300 flex flex-col p-2 sm:p-3 overflow-hidden"
              style="background-color: {store.globalTheme.accentColor.hex};"
            >
              <div class="w-1/3 h-0.5 mb-3 opacity-40 rounded-full" style="background-color: {store.globalTheme.primaryColor.hex};"></div>
              <h1 class="leading-tight mb-1 truncate"
                style="color: {store.globalTheme.primaryColor.hex}; font-family: {store.globalTheme.fontFamily}; font-size: {store.globalTheme.chapterFontSize / 10}px;">
                The Archive
              </h1>
              <div class="w-full h-[0.5px] mb-2 opacity-20" style="background-color: {store.globalTheme.primaryColor.hex};"></div>
              <div class="space-y-1">
                {#each [1, 2, 3] as _, idx}
                  <div class="h-[1.5px] rounded-full" style="background-color: {store.globalTheme.primaryColor.hex}; width: {idx === 2 ? '60%' : '100%'}; opacity: 0.3;"></div>
                {/each}
              </div>
            </div>
            <div class="mt-2 text-center">
              <span class="text-[8px] text-stone-400 font-bold uppercase tracking-tighter">
                {store.globalTheme.fontFamily} — {store.globalTheme.bodyFontSize}pt
              </span>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Import Button -->
  <div class="p-4 md:p-6">
    <button onclick={onImport}
      class="w-full py-3 rounded-xl text-[10px] uppercase tracking-widest font-bold border transition-all
             {store.isDark ? 'bg-stone-900 hover:bg-stone-800 text-stone-200 border-stone-800' : 'bg-white hover:bg-stone-50 text-stone-900 border-stone-200'}"
    >
      Import PDF
    </button>
  </div>
</aside>