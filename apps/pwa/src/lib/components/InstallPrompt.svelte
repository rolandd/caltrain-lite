<script lang="ts">
  // SPDX-License-Identifier: MIT
  // Copyright 2026 Roland Dreier <roland@rolandd.dev>

  import { onMount } from 'svelte';
  import ShareIcon from '@lucide/svelte/icons/share';
  import XIcon from '@lucide/svelte/icons/x';
  import { getFavorites } from '#lib/favorites.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Card } from '#lib/components/ui/card/index.js';

  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  }

  interface NavigatorStandalone extends Navigator {
    standalone?: boolean;
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

    // Standard iOS check
    const isIOS = /iphone|ipad|ipod/.test(ua);
    // iPadOS 13+ on iPad Pro/Air reports as "Macintosh" but has touch support.
    // We check for 'Mac' and more than one touch point.
    const isIPadOS =
      navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !/iphone/.test(ua);

    const isFirefox = /firefox/.test(ua);
    const isAndroid = /android/.test(ua);

    if (isIOS || isIPadOS) return 'ios'; // Both use the Share -> Add to Home Screen flow
    if (isFirefox && isAndroid) return 'firefox';
    // 'beforeinstallprompt' is the feature check, but we also check UA for completeness
    if ('BeforeInstallPromptEvent' in window || /chrome|crios/.test(ua)) return 'chromium';
    return 'other';
  }

  onMount(() => {
    // 1. Check if already installed
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as NavigatorStandalone).standalone
    ) {
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
      // Always suppress the native banner to take control of the install UI.
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      updateVisibility();
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    // 6. Listen for app installation (manual or via prompt)
    const onAppInstalled = () => {
      isStandalone = true;
      deferredPrompt = null;
      updateVisibility();
    };
    window.addEventListener('appinstalled', onAppInstalled);

    // 7. Listen for favorite toggles
    const onFavoriteToggled = ((e: CustomEvent) => {
      hasFavorites = e.detail.hasFavorites;
      updateVisibility();
    }) as EventListener;
    window.addEventListener('transit:favorite-toggled', onFavoriteToggled);

    // Initial check
    updateVisibility();

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
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
  <Card
    class="fixed bottom-[env(safe-area-inset-bottom,_1rem)] left-4 right-4 max-w-[568px] mx-auto z-[100] flex flex-col items-center justify-center p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 mb-4"
    role="dialog"
    aria-labelledby="install-title"
  >
    <div class="flex items-start justify-between w-full mb-3">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0 p-1.5"
        >
          <img src="/icon.svg" alt="" class="w-full h-full object-contain" width="28" height="28" />
        </div>
        <div>
          <h3 id="install-title" class="font-bold text-foreground text-base leading-tight">
            Install App
          </h3>
          <p class="text-transit-text-tertiary text-sm">Offline access & fullscreen</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        class="-mt-1 -mr-1"
        onclick={dismiss}
        aria-label="Close"
        title="Close"
      >
        <XIcon class="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>

    {#if platform === 'chromium'}
      <Button variant="default" size="default" class="w-full" onclick={install}>Install</Button>
    {:else if platform === 'ios'}
      <div class="bg-muted p-3 rounded-lg w-full text-sm text-transit-text-secondary">
        <p class="flex items-center gap-2 mb-2">
          1. Tap the <ShareIcon
            class="h-4 w-4 text-transit-brand inline shrink-0"
            aria-hidden="true"
          />
          Share button
        </p>
        <p class="flex items-center gap-2">
          2. Select <span class="font-semibold text-foreground">Add to Home Screen</span>
        </p>
      </div>
      <!-- Pointing arrow for iOS bottom bar -->
      <div
        class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-card border-b border-r border-border rotate-45"
        aria-hidden="true"
      ></div>
    {:else if platform === 'firefox'}
      <div class="bg-muted p-3 rounded-lg w-full text-sm text-transit-text-secondary">
        <p class="mb-1">1. Tap the menu button (⋮)</p>
        <p>2. Select <span class="font-semibold text-foreground">Install</span></p>
      </div>
    {/if}
  </Card>
{/if}
