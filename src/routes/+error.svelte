<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let isDark = $state(browser ? localStorage.getItem('theme') !== 'light' : true);

	onMount(() => {
		document.body.style.overflow = 'hidden';
		document.documentElement.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = '';
			document.documentElement.style.overflow = '';
		};
	});
</script>

<div
	class="min-h-screen flex items-center justify-center px-6 relative overflow-hidden transition-colors duration-300"
	style="
		background-color: {isDark ? '#0c0a09' : '#fafaf9'};
		color: {isDark ? '#e7e5e4' : '#1c1917'};
	"
>
	<!-- Grid -->
	<div
		class="absolute inset-0 pointer-events-none"
		style="
			opacity:{isDark ? 0.04 : 0.06};
			background-image:
				linear-gradient({isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'} 1px, transparent 1px),
				linear-gradient(90deg,{isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'} 1px, transparent 1px);
			background-size:60px 60px;
		"
	></div>

	<!-- Glow -->
	<div
		class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] rounded-full pointer-events-none"
		style="
			opacity:{isDark ? 0.12 : 0.06};
			filter:blur(120px);
			background:radial-gradient(ellipse,#d97706,transparent 70%);
		"
	></div>

	<div class="relative text-center max-w-2xl">
		<div
			class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-600/30 bg-amber-600/10 text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-8"
		>
			Error 404
		</div>

		<h1
			class="font-serif leading-none mb-6"
			style="font-size:clamp(5rem,18vw,10rem); color:{isDark ? '#fff' : '#1c1917'}"
		>
			404
		</h1>

		<h2
			class="font-serif text-3xl sm:text-4xl mb-4"
			style="color:{isDark ? '#fff' : '#1c1917'}"
		>
			Page not found.
		</h2>

		<p
			class="text-lg max-w-lg mx-auto mb-10"
			style="color:{isDark ? '#a8a29e' : '#57534e'}"
		>
			The document you're looking for has drifted outside the archive.
		</p>

		<div class="flex justify-center gap-4 flex-wrap">
			<a
				href="/"
				class="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm uppercase tracking-widest rounded-full transition-all shadow-lg shadow-amber-900/30"
			>
				Return Home
			</a>

			<a
				href="/app"
				class="px-8 py-4 border rounded-full font-bold text-sm uppercase tracking-widest transition-all"
				style="
					border-color:{isDark ? '#44403c' : '#d6d3d1'};
					color:{isDark ? '#a8a29e' : '#78716c'};
				"
			>
				Open App
			</a>
		</div>

		<p
			class="mt-12 text-[10px] uppercase tracking-[0.3em]"
			style="color:{isDark ? '#44403c' : '#a8a29e'}"
		>
			ArchiveStream<span class="text-amber-600">.</span>
		</p>
	</div>
</div>