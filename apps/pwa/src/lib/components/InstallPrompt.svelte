<script lang="ts">
  import { onMount } from 'svelte';
  import { getFavorites } from '$lib/favorites';

  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }

  let deferredPrompt: BeforeInstallPromptEvent | null = $state(null);
  let showPrompt = $state(false);
  let platform = $state<'chromium' | 'ios' | 'firefox' | 'other'>('other');
  let hasFavorites = $state(false);
  let dismissed = $state(false);
  let isStandalone = $state(false);

  function checkPlatform() {
    if (typeof navigator === 'undefined') return 'other';
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isFirefox = /firefox/.test(ua);
    const isAndroid = /android/.test(ua);

    if (isIOS) return 'ios'; // iOS (Safari, Chrome, etc. all use Share -> Add to HS)
    if (isFirefox && isAndroid) return 'firefox';
    // 'beforeinstallprompt' is the feature check, but we also check UA for completeness
    if ('BeforeInstallPromptEvent' in window || /chrome|crios/.test(ua)) return 'chromium';
    return 'other';
  }

  onMount(() => {
    // 1. Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      isStandalone = true;
      return;
    }

    // 2. Check dismissal state
    if (localStorage.getItem('transit-install-dismissed')) {
      dismissed = true;
      return;
    }

    // 3. Check favorites
    hasFavorites = getFavorites().length > 0;

    // 4. Determine platform
    platform = checkPlatform();

    // 5. Listen for Chromium prompt
    const onBeforeInstallPrompt = (e: Event) => {
      deferredPrompt = e as BeforeInstallPromptEvent;
      // Only suppress the native banner if we're actually ready to show ours.
      // Calling preventDefault() is what triggers the Chrome console log.
      if (hasFavorites) {
        e.preventDefault();
        updateVisibility();
      }
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    // 6. Listen for favorite toggles
    const onFavoriteToggled = ((e: CustomEvent) => {
      hasFavorites = e.detail.hasFavorites;
      updateVisibility();
    }) as EventListener;
    window.addEventListener('transit:favorite-toggled', onFavoriteToggled);

    // Initial check
    updateVisibility();

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('transit:favorite-toggled', onFavoriteToggled);
    };
  });

  function updateVisibility() {
    if (isStandalone || dismissed || !hasFavorites) {
      showPrompt = false;
      return;
    }

    // Chromium needs the event
    if (platform === 'chromium') {
      showPrompt = !!deferredPrompt;
    } else if (platform === 'ios' || platform === 'firefox') {
      // iOS / Firefox show immediately if conditions met
      showPrompt = true;
    }
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      dismiss();
    }
    deferredPrompt = null;
  }

  function dismiss() {
    dismissed = true;
    showPrompt = false;
    localStorage.setItem('transit-install-dismissed', 'true');
  }
</script>

{#if showPrompt}
  <div
    class="fixed bottom-[env(safe-area-inset-bottom,_1rem)] left-4 right-4 z-[100] flex flex-col items-center justify-center p-4 bg-transit-surface-card border border-transit-border-subtle rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 mb-4"
    role="dialog"
    aria-labelledby="install-title"
  >
    <div class="flex items-start justify-between w-full mb-3">
      <div class="flex items-center gap-3">
        <!-- Icon placeholder - in a real app this would be the app icon -->
        <div
          class="w-10 h-10 rounded-lg bg-gradient-to-br from-transit-brand to-transit-brand-strong flex items-center justify-center text-transit-text-primary font-bold text-lg"
        >
          C
        </div>
        <div>
          <h3 id="install-title" class="font-bold text-transit-text-primary text-lg leading-tight">
            Install App
          </h3>
          <p class="text-transit-text-tertiary text-sm">Offline access & fullscreen</p>
        </div>
      </div>
      <button
        onclick={dismiss}
        class="text-transit-tooltip-node hover:text-transit-text-primary p-1 transition-colors"
        aria-label="Close"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="w-5 h-5"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    {#if platform === 'chromium'}
      <button
        onclick={install}
        class="w-full bg-transit-brand hover:bg-transit-brand-strong text-transit-text-primary font-semibold py-3 px-4 rounded-lg transition-colors cursor-pointer"
      >
        Install
      </button>
    {:else if platform === 'ios'}
      <div
        class="bg-transit-surface-elevated p-3 rounded-lg w-full text-sm text-transit-text-secondary"
      >
        <p class="flex items-center gap-2 mb-2">
          1. Tap the <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            class="text-transit-brand stroke-current stroke-2"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            ><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path
              d="m16 6-4-4-4 4M12 2v13"
            /></svg
          > Share button
        </p>
        <p class="flex items-center gap-2">
          2. Select <span class="font-semibold text-transit-text-primary">Add to Home Screen</span>
        </p>
      </div>
      <!-- Pointing arrow for iOS bottom bar -->
      <div
        class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-transit-surface-card border-b border-r border-transit-border-subtle rotate-45"
      ></div>
    {:else if platform === 'firefox'}
      <div
        class="bg-transit-surface-elevated p-3 rounded-lg w-full text-sm text-transit-text-secondary"
      >
        <p class="mb-1">1. Tap the menu button (⋮)</p>
        <p>2. Select <span class="font-semibold text-transit-text-primary">Install</span></p>
      </div>
    {/if}
  </div>
{/if}
