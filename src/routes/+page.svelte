<script lang="ts">
  import { onMount } from 'svelte';

  let mounted = $state(false);
  let scrollY = $state(0);
  let isDark = $state(true);

  onMount(() => {
    mounted = true;
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    isDark = localStorage.getItem('theme') !== 'light';
    const onScroll = () => (scrollY = window.scrollY);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  });

  function toggleTheme() {
    isDark = !isDark;
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }

  const features = [
    { icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />`, label: 'Multi-Format', desc: 'PDF, DOCX, PPTX, XLSX, and images — all merged into one clean PDF.' },
    { icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />`, label: 'Privacy First', desc: 'PDF and image processing runs entirely in your browser. No uploads, no tracking.' },
    { icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />`, label: 'Edge Powered', desc: 'Office conversion via Supabase Edge Functions. Server-grade fidelity, serverless speed.' },
    { icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5a.5.5 0 11-1 0 .5.5 0 011 0z" />`, label: 'QR Sharing', desc: 'Instantly share your merged PDF via QR code. Auto-shredded after 5 hours.' },
    { icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />`, label: 'Design Atelier', desc: 'Custom chapter pages with themes, ink & paper colors, and typography.' },
    { icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />`, label: 'Page Control', desc: 'Select exact page ranges per file. "1-3, 5, 8-10" — precise, surgical exports.' },
  ];

  const formats = [
    { ext: 'PDF',  color: '#dc2626', darkText: '#f87171', lightText: '#dc2626' },
    { ext: 'DOCX', color: '#2563eb', darkText: '#60a5fa', lightText: '#2563eb' },
    { ext: 'PPTX', color: '#ea580c', darkText: '#fb923c', lightText: '#ea580c' },
    { ext: 'XLSX', color: '#16a34a', darkText: '#34d399', lightText: '#16a34a' },
    { ext: 'PNG',  color: '#7c3aed', darkText: '#a78bfa', lightText: '#7c3aed' },
    { ext: 'JPG',  color: '#0891b2', darkText: '#22d3ee', lightText: '#0891b2' },
  ];

  const chips = [
    { label: 'DOCX', textColor: 'text-blue-400', pos: 'top-32 left-[8%]', anim: 'animate-float-1' },
    { label: 'PPTX', textColor: 'text-orange-400', pos: 'top-44 right-[10%]', anim: 'animate-float-2' },
    { label: 'XLSX', textColor: 'text-emerald-400', pos: 'bottom-40 left-[12%]', anim: 'animate-float-3' },
    { label: 'PDF', textColor: 'text-red-400', pos: 'bottom-52 right-[8%]', anim: 'animate-float-1' },
    { label: 'PNG', textColor: 'text-violet-400', pos: 'top-64 left-[20%]', anim: 'animate-float-2' },
  ];
</script>

<svelte:head>
  <title>ArchiveStream — Document Assembly Workstation</title>
  <meta name="description" content="Privacy-first PDF workstation. Merge PDFs, Word docs, PowerPoints, Excel sheets and images into one perfect PDF." />
</svelte:head>

<div class="min-h-screen overflow-x-hidden transition-colors duration-300 font-sans"
     style="background-color: {isDark ? '#0c0a09' : '#fafaf9'}; color: {isDark ? '#e7e5e4' : '#1c1917'};">

  <!-- NAV -->
  <nav class="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
       style="background: {scrollY > 40 ? (isDark ? 'rgba(12,10,9,0.95)' : 'rgba(250,250,249,0.95)') : 'transparent'};
              backdrop-filter: {scrollY > 40 ? 'blur(16px)' : 'none'};
              border-bottom: {scrollY > 40 ? `1px solid ${isDark ? 'rgba(68,64,60,0.4)' : 'rgba(214,211,209,0.6)'}` : '1px solid transparent'};">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <span class="font-serif text-xl tracking-tight" style="color: {isDark ? '#ffffff' : '#1c1917'};">
        ArchiveStream<span class="text-amber-500">.</span>
      </span>
      <div class="flex items-center gap-3">
        <button onclick={toggleTheme}
          class="p-2 rounded-lg transition-all hover:bg-stone-500/10"
          style="color: {isDark ? '#a8a29e' : '#78716c'};"
          title="Toggle theme">
          {#if isDark}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14A7 7 0 0012 5z" />
            </svg>
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          {/if}
        </button>
        <a href="https://github.com/constantine2003/ArchiveStream" target="_blank"
           class="hidden sm:block px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full border transition-all"
           style="border-color: {isDark ? '#44403c' : '#d6d3d1'}; color: {isDark ? '#a8a29e' : '#78716c'};">
          GitHub
        </a>
        <a href="/app"
           class="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-widest rounded-full transition-all shadow-lg shadow-amber-900/30 hover:-translate-y-px">
          Launch App
        </a>
      </div>
    </div>
  </nav>

  <!-- HERO -->
  <section class="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-32 overflow-hidden">

    <!-- Grid bg -->
    <div class="absolute inset-0 pointer-events-none"
         style="opacity: {isDark ? 0.04 : 0.06}; background-image: linear-gradient({isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'} 1px, transparent 1px), linear-gradient(90deg, {isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'} 1px, transparent 1px); background-size: 60px 60px;"></div>

    <!-- Amber glow -->
    <div class="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full pointer-events-none"
         style="opacity: {isDark ? 0.12 : 0.06}; filter: blur(120px); background: radial-gradient(ellipse, #d97706, transparent 70%);"></div>

    <!-- Floating chips — now dark mode aware -->
    {#each chips as chip}
      <div class="absolute {chip.pos} {chip.anim}">
        <div class="px-3 py-1.5 rounded-lg border text-[10px] font-bold backdrop-blur-sm transition-colors duration-300 {chip.textColor}"
             style="border-color: {isDark ? 'rgba(68,64,60,0.6)' : 'rgba(214,211,209,0.8)'}; background-color: {isDark ? 'rgba(28,25,23,0.85)' : 'rgba(255,255,255,0.85)'}; box-shadow: 0 4px 12px rgba(0,0,0,{isDark ? '0.4' : '0.08'});">
          {chip.label}
        </div>
      </div>
    {/each}

    <!-- Hero content -->
    <div class="relative text-center max-w-4xl mx-auto transition-all duration-700"
         style="opacity: {mounted ? 1 : 0}; transform: {mounted ? 'translateY(0)' : 'translateY(28px'};">

      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-600/30 bg-amber-600/10 text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-10">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        Privacy-First · Serverless · Open Source
      </div>

      <h1 class="font-serif leading-[0.88] tracking-tight mb-8"
          style="font-size: clamp(3rem, 10vw, 6rem); color: {isDark ? '#ffffff' : '#1c1917'};">
        Every file.<br/>
        <span class="text-amber-500">One PDF.</span>
      </h1>

      <p class="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed mb-12"
         style="color: {isDark ? '#a8a29e' : '#57534e'};">
        Merge PDFs, Word docs, PowerPoints, Excel sheets, and images into a single perfect PDF —
        processed in your browser, no accounts required.
      </p>

      <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
        <a href="/app"
           class="w-full sm:w-auto px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm uppercase tracking-widest rounded-full transition-all shadow-2xl shadow-amber-900/30 hover:-translate-y-0.5 hover:shadow-amber-800/40">
          Start Merging — Free
        </a>
        <a href="https://github.com/constantine2003/ArchiveStream" target="_blank"
           class="w-full sm:w-auto px-8 py-4 font-bold text-sm uppercase tracking-widest rounded-full transition-all border"
           style="border-color: {isDark ? '#44403c' : '#d6d3d1'}; color: {isDark ? '#a8a29e' : '#78716c'};">
          View Source →
        </a>
      </div>

      <!-- Stats row -->
      <div class="flex items-center justify-center gap-8 mt-16 flex-wrap">
        {#each [['6+', 'File Formats'], ['100%', 'Client-Side'], ['5hr', 'Auto-Shred'], ['0', 'Cost']] as [val, label]}
          <div class="text-center">
            <div class="font-serif text-2xl text-amber-500 mb-1">{val}</div>
            <div class="text-[9px] font-bold uppercase tracking-widest" style="color: {isDark ? '#57534e' : '#a8a29e'};">{label}</div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Scroll hint -->
    <div class="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-25">
      <span class="text-[9px] uppercase tracking-widest" style="color: {isDark ? '#57534e' : '#a8a29e'};">Scroll</span>
      <div class="w-px h-8" style="background: linear-gradient(to bottom, {isDark ? '#57534e' : '#a8a29e'}, transparent);"></div>
    </div>
  </section>

  <!-- FORMATS STRIP -->
  <section class="py-10 border-y transition-colors duration-300"
           style="border-color: {isDark ? 'rgba(68,64,60,0.4)' : 'rgba(214,211,209,0.6)'};">
    <div class="max-w-6xl mx-auto px-6">
      <p class="text-center text-[10px] font-bold uppercase tracking-[0.3em] mb-8"
         style="color: {isDark ? '#57534e' : '#a8a29e'};">Supported Formats</p>
      <div class="flex flex-wrap justify-center gap-3">
        {#each formats as f}
          <div class="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-colors duration-300"
               style="border-color: {isDark ? f.darkText + '33' : f.lightText + '33'}; background-color: {isDark ? f.darkText + '12' : f.lightText + '10'};">
            <div class="w-2 h-2 rounded-full" style="background-color: {isDark ? f.darkText : f.lightText};"></div>
            <span class="text-xs font-bold" style="color: {isDark ? f.darkText : f.lightText};">{f.ext}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- FEATURES -->
  <section class="py-32 px-6">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-20">
        <p class="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-600 mb-4">What it does</p>
        <h2 class="font-serif text-4xl sm:text-5xl" style="color: {isDark ? '#ffffff' : '#1c1917'};">Built for the real workflow.</h2>
        <p class="mt-4 text-sm" style="color: {isDark ? '#57534e' : '#a8a29e'};">Everything you need. Nothing you don't.</p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 rounded-2xl overflow-hidden border"
           style="border-color: {isDark ? 'rgba(68,64,60,0.4)' : 'rgba(214,211,209,0.6)'}; gap: 1px; background-color: {isDark ? 'rgba(68,64,60,0.3)' : 'rgba(214,211,209,0.4)'};">
        {#each features as f}
          <div class="p-8 transition-colors duration-300 group cursor-default"
               style="background-color: {isDark ? '#0c0a09' : '#fafaf9'};"
               onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? '#141210' : '#f5f5f4'; }}
               onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? '#0c0a09' : '#fafaf9'; }}>
            <div class="w-10 h-10 rounded-xl flex items-center justify-center mb-6 transition-all border"
                 style="border-color: {isDark ? '#292524' : '#e7e5e4'}; background-color: {isDark ? '#1c1917' : '#ffffff'};">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {@html f.icon}
              </svg>
            </div>
            <p class="text-xs font-bold uppercase tracking-widest mb-2" style="color: {isDark ? '#78716c' : '#a8a29e'};">{f.label}</p>
            <p class="text-sm leading-relaxed" style="color: {isDark ? '#a8a29e' : '#78716c'};">{f.desc}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="py-32 px-6 border-t transition-colors duration-300"
           style="border-color: {isDark ? 'rgba(68,64,60,0.3)' : 'rgba(214,211,209,0.5)'};">
    <div class="max-w-4xl mx-auto">
      <div class="text-center mb-20">
        <p class="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-600 mb-4">How it works</p>
        <h2 class="font-serif text-4xl sm:text-5xl" style="color: {isDark ? '#ffffff' : '#1c1917'};">Four steps to one file.</h2>
      </div>

      <div class="space-y-2">
        {#each [
          { n: '01', title: 'Drop your files', desc: 'Drag in PDFs, Word docs, PowerPoints, Excel sheets, or images in any order.' },
          { n: '02', title: 'Organize', desc: 'Reorder files, add chapter separators, select exact page ranges per file.' },
          { n: '03', title: 'Customize', desc: 'Apply themes, watermarks, and typography to your chapter pages.' },
          { n: '04', title: 'Export', desc: 'Get a merged PDF instantly. Share via QR code — auto-shredded after 5 hours.' },
        ] as step}
          <div class="flex items-start gap-8 p-8 rounded-2xl border transition-all duration-300 cursor-default group"
               style="border-color: transparent;"
               onmouseenter={(e) => {
                 const el = e.currentTarget as HTMLElement;
                 el.style.borderColor = isDark ? 'rgba(68,64,60,0.5)' : 'rgba(214,211,209,0.8)';
                 el.style.backgroundColor = isDark ? 'rgba(28,25,23,0.4)' : 'rgba(245,245,244,0.8)';
               }}
               onmouseleave={(e) => {
                 const el = e.currentTarget as HTMLElement;
                 el.style.borderColor = 'transparent';
                 el.style.backgroundColor = 'transparent';
               }}>
            <span class="font-serif text-4xl shrink-0 transition-colors duration-300 group-hover:text-amber-600/50"
                  style="color: {isDark ? '#292524' : '#d6d3d1'};">{step.n}</span>
            <div class="pt-2">
              <h3 class="font-bold mb-2 transition-colors" style="color: {isDark ? '#e7e5e4' : '#1c1917'};">{step.title}</h3>
              <p class="text-sm leading-relaxed" style="color: {isDark ? '#57534e' : '#a8a29e'};">{step.desc}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="py-32 px-6 border-t transition-colors duration-300"
           style="border-color: {isDark ? 'rgba(68,64,60,0.3)' : 'rgba(214,211,209,0.5)'};">
    <div class="max-w-3xl mx-auto text-center">
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-600/20 bg-amber-600/5 text-amber-500/80 text-[10px] font-bold uppercase tracking-widest mb-8">
        Free · Open Source · No Sign-up
      </div>
      <h2 class="font-serif text-4xl sm:text-6xl leading-tight mb-8" style="color: {isDark ? '#ffffff' : '#1c1917'};">
        Stop converting<br/>one file at a time.
      </h2>
      <p class="text-lg mb-12 max-w-xl mx-auto" style="color: {isDark ? '#57534e' : '#a8a29e'};">
        ArchiveStream runs in your browser. No accounts. No limits. No nonsense.
      </p>
      <a href="/app"
         class="inline-flex items-center gap-3 px-10 py-5 bg-amber-600 hover:bg-amber-500 text-white font-bold uppercase tracking-widest rounded-full transition-all text-sm shadow-2xl shadow-amber-900/40 hover:-translate-y-0.5">
        Open ArchiveStream
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </a>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="border-t py-10 px-6 transition-colors duration-300"
          style="border-color: {isDark ? 'rgba(68,64,60,0.3)' : 'rgba(214,211,209,0.5)'};">
    <div class="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
      <span class="font-serif" style="color: {isDark ? '#44403c' : '#a8a29e'};">
        ArchiveStream<span class="text-amber-600">.</span>
      </span>
      <p class="text-[10px] uppercase tracking-widest" style="color: {isDark ? '#44403c' : '#c4c0bc'};">
        Built by Daniel Montesclaros · MIT License
      </p>
      <a href="https://github.com/constantine2003/ArchiveStream" target="_blank"
         class="text-[10px] uppercase tracking-widest transition-colors hover:text-amber-500"
         style="color: {isDark ? '#44403c' : '#a8a29e'};">
        GitHub →
      </a>
    </div>
  </footer>
</div>

<style>
  @keyframes float-1 {
    0%   { opacity: 0; transform: translateY(12px); }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { opacity: 0; transform: translateY(-12px); }
  }
  @keyframes float-2 {
    0%   { opacity: 0; transform: translateY(-10px); }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { opacity: 0; transform: translateY(10px); }
  }
  @keyframes float-3 {
    0%   { opacity: 0; transform: translateY(8px) rotate(-2deg); }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { opacity: 0; transform: translateY(-8px) rotate(2deg); }
  }
  .animate-float-1 { animation: float-1 7s ease-in-out 0.5s infinite; }
  .animate-float-2 { animation: float-2 8s ease-in-out 1.5s infinite; }
  .animate-float-3 { animation: float-3 9s ease-in-out 0.9s infinite; }
</style>