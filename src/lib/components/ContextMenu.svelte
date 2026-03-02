<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { store } from '$lib/stores/archiveState.svelte';

  function clickOutside(node: HTMLElement, callback: () => void) {
    const handleClick = (event: MouseEvent) => {
      if (!node.contains(event.target as Node)) callback();
    };
    document.addEventListener('click', handleClick, true);
    return { destroy() { document.removeEventListener('click', handleClick, true); } };
  }

  function closeMenu() { store.menuVisible = false; }

  async function moveFileToTop() {
    if (store.activeFileIndex === null) return;
    const item = store.files[store.activeFileIndex];
    store.files = [item, ...store.files.filter((_, i) => i !== store.activeFileIndex)];
    await store.syncSortOrder();
    closeMenu();
  }

  function startRename() {
    if (store.activeFileIndex === null) return;
    store.files[store.activeFileIndex].isEditing = true;
    closeMenu();
  }

  async function handleDelete() {
    if (store.activeFileIndex === null) return;
    const file = store.files[store.activeFileIndex];
    if (typeof file.id === 'number') {
      await supabase.from('document_queue').delete().eq('id', file.id);
    }
    if (file.url) URL.revokeObjectURL(file.url);
    store.files = store.files.filter((_, i) => i !== store.activeFileIndex);
    closeMenu();
  }
</script>

{#if store.menuVisible}
  <div
    class="fixed z-100 w-44 rounded-xl border shadow-2xl backdrop-blur-xl p-1.5
           {store.isDark ? 'bg-stone-900/95 border-stone-700 text-stone-300' : 'bg-white/95 border-stone-200 text-stone-600'}"
    style="top: {store.menuPos.y}px; left: {store.menuPos.x}px;"
    use:clickOutside={closeMenu}
  >
    <div class="flex flex-col gap-0.5">
      <button onclick={moveFileToTop}
        class="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors
               {store.isDark ? 'hover:bg-stone-800 hover:text-amber-200' : 'hover:bg-stone-100 hover:text-black'}">
        Move to Top
      </button>
      <button onclick={startRename}
        class="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors
               {store.isDark ? 'hover:bg-stone-800 hover:text-amber-200' : 'hover:bg-stone-100 hover:text-black'}">
        Rename
      </button>
      <div class="h-px my-1 {store.isDark ? 'bg-stone-800' : 'bg-stone-100'}"></div>
      <button onclick={handleDelete}
        class="w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors text-red-500
               {store.isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}">
        Delete
      </button>
    </div>
  </div>
{/if}