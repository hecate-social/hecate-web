<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		active?: boolean;
		initialFocus?: string;
		children: import('svelte').Snippet;
	}

	let { active = true, initialFocus, children }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let observer: MutationObserver | undefined;

	const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function getFocusable(): HTMLElement[] {
		if (!container) return [];
		return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
			(el) => el.offsetParent !== null
		);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!active || e.key !== 'Tab') return;

		const focusable = getFocusable();
		if (focusable.length === 0) {
			e.preventDefault();
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		if (e.shiftKey) {
			if (document.activeElement === first || !container?.contains(document.activeElement)) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (document.activeElement === last || !container?.contains(document.activeElement)) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	function setInitialFocus() {
		if (!active || !container) return;
		if (initialFocus) {
			const target = container.querySelector<HTMLElement>(initialFocus);
			if (target) {
				target.focus();
				return;
			}
		}
		const focusable = getFocusable();
		if (focusable.length > 0) focusable[0].focus();
	}

	onMount(() => {
		// Small delay to ensure children are rendered
		requestAnimationFrame(setInitialFocus);

		observer = new MutationObserver(() => {
			// Re-check focusable elements on DOM changes
		});
		if (container) {
			observer.observe(container, { childList: true, subtree: true });
		}
	});

	onDestroy(() => {
		observer?.disconnect();
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={container} onkeydown={handleKeydown}>
	{@render children()}
</div>
