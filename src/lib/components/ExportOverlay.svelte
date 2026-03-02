<script lang="ts">
  import { store } from '$lib/stores/archiveState.svelte';
</script>

{#if store.isExporting}
  <div
    class="fixed inset-0 z-60 backdrop-blur-md flex flex-col items-center justify-center transition-all duration-500
           {store.isDark ? 'bg-stone-950/90' : 'bg-white/90'}"
  >
    <div class="w-full max-w-sm px-8 text-center">
      {#if !store.showSuccess}
        <div class="relative mb-8 flex justify-center">
          <div class="w-20 h-20 border-2 border-amber-900/30 border-t-amber-500 rounded-full animate-spin"></div>
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="text-xs font-serif italic text-amber-500">{store.exportProgress}%</span>
          </div>
        </div>
        <h2 class="text-sm font-light tracking-[0.3em] uppercase mb-4 {store.isDark ? 'text-stone-300' : 'text-stone-600'}">
          Compiling Collection
        </h2>
        <div class="w-full h-px rounded-full overflow-hidden {store.isDark ? 'bg-stone-800' : 'bg-stone-200'}">
          <div class="h-full bg-amber-600 transition-all duration-300" style="width: {store.exportProgress}%"></div>
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