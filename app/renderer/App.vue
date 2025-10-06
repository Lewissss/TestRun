<template>
  <n-config-provider :theme="theme">
    <n-message-provider>
      <div :class="['h-screen w-screen overflow-hidden', rootClasses]">
        <div class="grid h-full" :class="mainGrid">
          <aside :class="['border-r backdrop-blur', sidebarClasses]">
            <section class="flex h-full flex-col">
              <div class="flex items-center gap-2 px-4 pb-3 pt-4 text-lg font-semibold tracking-wide">
                <span
                  class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400 shadow-inner shadow-brand-800"
                >
                  TR
                </span>
                <span>TestRun</span>
              </div>
              <nav class="flex flex-1 flex-col gap-1 px-2 pb-4">
                <RouterLink
                  v-for="link in primaryLinks"
                  :key="link.to"
                  :to="link.to"
                  :class="[linkBaseClass, linkHoverClass]"
                  :active-class="activeLinkClass"
                >
                  <component :is="link.icon" class="h-4 w-4" />
                  <span>{{ link.label }}</span>
                </RouterLink>
              </nav>
              <footer class="px-2 pb-4">
                <RouterLink
                  to="/settings/llm"
                  :class="[linkBaseClass, linkHoverClass, 'px-3 py-2']"
                  :active-class="activeLinkClass"
                >
                  <Settings class="h-4 w-4" />
                  <span>Settings</span>
                </RouterLink>
                <button
                  class="mt-2 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition"
                  :class="toggleButtonClasses"
                  type="button"
                  @click="toggleTheme"
                >
                  <div class="flex items-center gap-2">
                    <component :is="themeIcon" class="h-4 w-4" />
                    <span>{{ isDark ? 'Dark Mode' : 'Light Mode' }}</span>
                  </div>
                  <span class="text-xs uppercase tracking-wide" :class="toggleSublabelClass">Toggle</span>
                </button>
              </footer>
            </section>
          </aside>
          <section class="overflow-auto bg-transparent">
            <div v-if="showAiReminder" :class="[bannerBaseClass, bannerVariantClass]">
              <div class="flex items-center gap-2">
                <Sparkles class="h-4 w-4" />
                <span>AI assistance is off — enter your OpenUI API key in Settings → LLM to enable it.</span>
              </div>
              <RouterLink to="/settings/llm" :class="settingsLinkClass">
                Open Settings
              </RouterLink>
            </div>
            <RouterView />
          </section>
        </div>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import {
  Blocks,
  Book,
  FolderGit2,
  PlayCircle,
  Server,
  Settings,
  Sparkles,
  Tags,
  Workflow,
  MoonStar,
  Sun,
} from 'lucide-vue-next';
import { useAiStore } from '@renderer/stores/ai';
import { NConfigProvider, NMessageProvider, darkTheme, lightTheme } from 'naive-ui';

const aiStore = useAiStore();
const isDark = ref(true);

onMounted(() => {
  void aiStore.fetchSettings();
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    isDark.value = false;
  }
});

const theme = computed(() => (isDark.value ? darkTheme : lightTheme));
const themeIcon = computed(() => (isDark.value ? MoonStar : Sun));
const themeClass = computed(() => (isDark.value ? 'theme-dark' : 'theme-light'));

watch(
  themeClass,
  (next, prev) => {
    const root = document.documentElement;
    if (prev) root.classList.remove(prev);
    root.classList.add(next);
  },
  { immediate: true },
);

const primaryLinks = computed(() => [
  { to: '/', label: 'Recordings', icon: Book },
  { to: '/blocks', label: 'Blocks', icon: Blocks },
  { to: '/api', label: 'API Console', icon: Server },
  { to: '/composer', label: 'Composer', icon: Workflow },
  { to: '/tests/flow', label: 'Flowchart', icon: Workflow },
  { to: '/datasets', label: 'Data Sets', icon: FolderGit2 },
  { to: '/suites', label: 'Suites', icon: Tags },
  { to: '/runner', label: 'Runner', icon: PlayCircle },
]);

const mainGrid = computed(() => {
  if (typeof window === 'undefined') {
    return 'grid-cols-[16rem_auto]';
  }
  return window.innerWidth >= 1024 ? 'grid-cols-[16rem_auto]' : 'grid-cols-[14rem_auto]';
});
const rootClasses = computed(() => (isDark.value ? 'bg-ink-900 text-surface-50' : 'bg-surface-50 text-ink-700'));
const sidebarClasses = computed(() => (isDark.value ? 'border-ink-700 bg-ink-800/90' : 'border-surface-200 bg-surface-100/90'));
const linkBaseClass = 'flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition';
const linkHoverClass = computed(() => (isDark.value ? 'hover:bg-ink-700/70 text-surface-200' : 'hover:bg-surface-200/80 text-ink-700'));
const activeLinkClass = computed(() => (isDark.value ? 'bg-ink-700 text-brand-100' : 'bg-brand-500/10 text-brand-700'));
const bannerBaseClass = 'flex items-center justify-between px-6 py-3 text-sm border-b';
const bannerVariantClass = computed(() => (isDark.value ? 'border-brand-500/40 bg-brand-500/10 text-brand-100' : 'border-brand-500/40 bg-brand-500/15 text-brand-700'));
const settingsLinkClass = computed(() =>
  isDark.value
    ? 'rounded border border-brand-400 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-brand-100'
    : 'rounded border border-brand-500 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700',
);
const toggleButtonClasses = computed(() =>
  isDark.value
    ? 'border-ink-700 bg-ink-800 text-surface-200 hover:border-brand-400 hover:text-brand-100'
    : 'border-surface-300 bg-surface-100 text-ink-700 hover:border-brand-500 hover:text-brand-700',
);
const toggleSublabelClass = computed(() => (isDark.value ? 'text-surface-400' : 'text-surface-500'));

const showAiReminder = computed(() => !aiStore.enabled);

function toggleTheme() {
  isDark.value = !isDark.value;
}
</script>
