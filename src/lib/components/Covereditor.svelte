<script lang="ts">
  import { store } from '$lib/stores/archiveState.svelte';
  import { getCssFontFamily, getCssFontStyle, getCssFontWeight } from '$lib/utils/themeUtils';
  import type { FileItem } from '$lib/types';

  type Props = { onConfirm: (cover: FileItem) => void };
  let { onConfirm }: Props = $props();

  let title = $state('');
  let subtitle = $state('');
  let author = $state('');
  let date = $state(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  let logoUrl = $state('');
  let logoFile = $state<File | undefined>(undefined);
  let logoInput: HTMLInputElement | undefined = $state(undefined);

  function handleLogo(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    logoFile = file;
    logoUrl = URL.createObjectURL(file);
  }

  function confirm() {
    const cover: FileItem = {
      id: crypto.randomUUID(),
      name: 'Cover Page',
      type: 'cover',
      selectionType: 'all',
      coverTitle: title,
      coverSubtitle: subtitle,
      coverAuthor: author,
      coverDate: date,
      coverLogoUrl: logoUrl || undefined,
      coverLogoFile: logoFile,
    };
    onConfirm(cover);
    store.showCoverEditor = false;
  }

  function cancel() {
    store.showCoverEditor = false;
  }


</script>

{#if store.showCoverEditor}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4"
       style="background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);">

    <div class="w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col md:flex-row"
         style="background-color: {store.isDark ? '#0c0a09' : '#ffffff'}; border-color: {store.isDark ? '#292524' : '#e7e5e4'}; max-height: 90vh;">

      <!-- Preview panel -->
      <div class="w-full md:w-64 shrink-0 flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r"
           style="background-color: {store.globalTheme.accentColor.hex}; border-color: {store.isDark ? '#292524' : '#e7e5e4'}; min-height: 200px;">
        <div class="w-full aspect-3/4 rounded-xl shadow-2xl flex flex-col items-center justify-center p-6 border"
             style="background-color: {store.globalTheme.accentColor.hex}; border-color: {store.globalTheme.primaryColor.hex}33;">

          {#if logoUrl}
            <img src={logoUrl} alt="Logo" class="w-16 h-16 object-contain mb-4 rounded-lg" />
          {:else}
            <div class="w-12 h-12 rounded-xl border-2 border-dashed mb-4 flex items-center justify-center opacity-20"
                 style="border-color: {store.globalTheme.primaryColor.hex};">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                   style="color: {store.globalTheme.primaryColor.hex};">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          {/if}

          <!-- Divider -->
          <div class="w-8 h-px mb-4 opacity-30" style="background-color: {store.globalTheme.primaryColor.hex};"></div>

          {#if title}
            <p class="text-center font-bold leading-tight mb-2 text-sm"
               style="color: {store.globalTheme.primaryColor.hex}; font-family: {getCssFontFamily(store.globalTheme.fontFamily)}; font-weight: {getCssFontWeight(store.globalTheme.fontFamily)};">
              {title}
            </p>
          {:else}
            <div class="w-3/4 h-2 rounded-full mb-2 opacity-20" style="background-color: {store.globalTheme.primaryColor.hex};"></div>
          {/if}

          {#if subtitle}
            <p class="text-center text-[10px] opacity-70 mb-3"
               style="color: {store.globalTheme.primaryColor.hex}; font-family: {getCssFontFamily(store.globalTheme.fontFamily)};">
              {subtitle}
            </p>
          {:else}
            <div class="w-1/2 h-1.5 rounded-full mb-3 opacity-10" style="background-color: {store.globalTheme.primaryColor.hex};"></div>
          {/if}

          <div class="w-full h-px opacity-10 mb-3" style="background-color: {store.globalTheme.primaryColor.hex};"></div>

          {#if author}
            <p class="text-[9px] opacity-60 text-center"
               style="color: {store.globalTheme.primaryColor.hex}; font-family: {getCssFontFamily(store.globalTheme.fontFamily)};">
              {author}
            </p>
          {/if}
          {#if date}
            <p class="text-[9px] opacity-40 text-center mt-1"
               style="color: {store.globalTheme.primaryColor.hex};">
              {date}
            </p>
          {/if}
        </div>
        <p class="text-[9px] uppercase tracking-widest mt-3 opacity-40"
           style="color: {store.globalTheme.primaryColor.hex};">Live Preview</p>
      </div>

      <!-- Form panel -->
      <div class="flex-1 flex flex-col overflow-y-auto">
        <div class="p-6 border-b" style="border-color: {store.isDark ? '#292524' : '#e7e5e4'};">
          <h2 class="font-serif text-lg mb-0.5" style="color: {store.isDark ? '#ffffff' : '#1c1917'};">Cover Page</h2>
          <p class="text-[11px]" style="color: {store.isDark ? '#57534e' : '#a8a29e'};">Styled with your Design Atelier theme.</p>
        </div>

        <div class="flex-1 p-6 space-y-4 overflow-y-auto">

          <!-- Logo upload -->
          <div>
            <label class="block text-[10px] font-bold uppercase tracking-widest mb-2"
                   style="color: {store.isDark ? '#78716c' : '#a8a29e'};">Logo / Image</label>
            <input bind:this={logoInput} type="file" accept="image/*" class="hidden" onchange={handleLogo} />
            <button onclick={() => logoInput?.click()}
              class="w-full py-3 rounded-xl border-2 border-dashed text-xs font-bold uppercase tracking-widest transition-all"
              style="border-color: {store.isDark ? '#292524' : '#e7e5e4'}; color: {store.isDark ? '#57534e' : '#a8a29e'}; background: transparent;">
              {logoUrl ? '✓ Logo uploaded — click to change' : '+ Upload Logo'}
            </button>
          </div>

          <!-- Title -->
          <div>
            <label class="block text-[10px] font-bold uppercase tracking-widest mb-2"
                   style="color: {store.isDark ? '#78716c' : '#a8a29e'};">Title</label>
            <input type="text" placeholder="Document title..." bind:value={title}
              class="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
              style="background-color: {store.isDark ? '#1c1917' : '#f5f5f4'}; border-color: {store.isDark ? '#292524' : '#e7e5e4'}; color: {store.isDark ? '#e7e5e4' : '#1c1917'};" />
          </div>

          <!-- Subtitle -->
          <div>
            <label class="block text-[10px] font-bold uppercase tracking-widest mb-2"
                   style="color: {store.isDark ? '#78716c' : '#a8a29e'};">Subtitle</label>
            <input type="text" placeholder="Optional subtitle..." bind:value={subtitle}
              class="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
              style="background-color: {store.isDark ? '#1c1917' : '#f5f5f4'}; border-color: {store.isDark ? '#292524' : '#e7e5e4'}; color: {store.isDark ? '#e7e5e4' : '#1c1917'};" />
          </div>

          <!-- Author -->
          <div>
            <label class="block text-[10px] font-bold uppercase tracking-widest mb-2"
                   style="color: {store.isDark ? '#78716c' : '#a8a29e'};">Author</label>
            <input type="text" placeholder="Your name..." bind:value={author}
              class="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
              style="background-color: {store.isDark ? '#1c1917' : '#f5f5f4'}; border-color: {store.isDark ? '#292524' : '#e7e5e4'}; color: {store.isDark ? '#e7e5e4' : '#1c1917'};" />
          </div>

          <!-- Date -->
          <div>
            <label class="block text-[10px] font-bold uppercase tracking-widest mb-2"
                   style="color: {store.isDark ? '#78716c' : '#a8a29e'};">Date</label>
            <input type="text" placeholder="Date..." bind:value={date}
              class="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
              style="background-color: {store.isDark ? '#1c1917' : '#f5f5f4'}; border-color: {store.isDark ? '#292524' : '#e7e5e4'}; color: {store.isDark ? '#e7e5e4' : '#1c1917'};" />
          </div>
        </div>

        <!-- Actions -->
        <div class="p-6 border-t flex gap-3" style="border-color: {store.isDark ? '#292524' : '#e7e5e4'};">
          <button onclick={cancel}
            class="flex-1 py-3 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all"
            style="border-color: {store.isDark ? '#292524' : '#e7e5e4'}; color: {store.isDark ? '#57534e' : '#a8a29e'};">
            Cancel
          </button>
          <button onclick={confirm}
            class="flex-2 py-3 px-6 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-amber-900/20">
            Add Cover Page
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}