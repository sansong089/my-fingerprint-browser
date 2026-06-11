<template>
  <div class="split-icon-button" :class="rootClasses" @click.stop>
    <button
      type="button"
      class="split-icon-button__main"
      :class="{ 'split-icon-button__main--open': open }"
      :disabled="disabled"
      :aria-label="mainAriaLabel || mainLabel"
      :data-label="mainLabel"
      @click.stop="emit('main-click')"
    >
      <slot name="main-icon" />
    </button>
    <button
      type="button"
      class="split-icon-button__toggle"
      :class="{ 'split-icon-button__toggle--open': open }"
      :disabled="disabled"
      :title="toggleTitle"
      :aria-label="toggleAriaLabel || toggleTitle"
      @click.stop="emit('toggle-click')"
    >
      <slot name="toggle-icon" />
    </button>
    <div v-if="open" class="row-menu" :class="menuClass">
      <slot name="menu" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  size?: 'toolbar' | 'row'
  variant?: 'default' | 'start' | 'shortcut'
  open?: boolean
  disabled?: boolean
  mainLabel: string
  mainAriaLabel?: string
  toggleTitle: string
  toggleAriaLabel?: string
  menuClass?: string | string[] | Record<string, boolean>
}>(), {
  size: 'toolbar',
  variant: 'default',
  open: false,
  disabled: false,
  mainAriaLabel: '',
  toggleAriaLabel: '',
  menuClass: '',
})

const emit = defineEmits<{
  (event: 'main-click'): void
  (event: 'toggle-click'): void
}>()

const rootClasses = computed(() => [
  `split-icon-button--${props.size}`,
  `split-icon-button--${props.variant}`,
  {
    'split-icon-button--open': props.open,
    'split-icon-button--disabled': props.disabled,
  },
])
</script>

<style>
.split-icon-button {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  overflow: visible;
}

.split-icon-button__main,
.split-icon-button__toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: #111827;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease, filter 120ms ease;
  z-index: 1;
}

.split-icon-button__main:disabled,
.split-icon-button__toggle:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  filter: grayscale(1);
}

.split-icon-button__main:hover:not(:disabled),
.split-icon-button__toggle:hover:not(:disabled),
.split-icon-button__main--open,
.split-icon-button__toggle--open {
  background: #f2f2f2;
  color: #000000;
  z-index: 2;
}

.split-icon-button__main:hover:not(:disabled),
.split-icon-button__toggle:hover:not(:disabled) {
  z-index: 3;
}

.split-icon-button--start .split-icon-button__main:hover:not(:disabled),
.split-icon-button--start .split-icon-button__toggle:hover:not(:disabled),
.split-icon-button--start .split-icon-button__main--open,
.split-icon-button--start .split-icon-button__toggle--open {
  background: #f2f2f2;
  color: #16a34a;
}

.split-icon-button__main::after {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  top: calc(100% + 6px);
  left: 50%;
  z-index: 140;
  padding: 0 6px;
  border-radius: 4px;
  background: #0f172a;
  color: #ffffff;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -2px);
  transition: opacity 120ms ease, transform 120ms ease;
  content: attr(data-label);
}

.split-icon-button__main:hover:not(:disabled)::after,
.split-icon-button__main:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

.split-icon-button--toolbar .split-icon-button__main,
.split-icon-button--toolbar .split-icon-button__toggle {
  height: 30px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.split-icon-button--toolbar .split-icon-button__main {
  min-width: 30px;
  padding: 0 2px 0 8px;
  border-radius: 6px 0 0 6px;
}

.split-icon-button--toolbar .split-icon-button__toggle {
  width: auto;
  min-width: 0;
  margin-left: 0;
  padding: 0 8px 0 2px;
  border-radius: 0 6px 6px 0;
}

.split-icon-button--toolbar svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: currentColor;
}

.split-icon-button--row {
  align-items: center;
  --split-row-bg: var(--env-row-bg, #ffffff);
  --split-row-main-left-padding: 8px;
  --split-row-main-right-padding: 2px;
  --split-row-toggle-left-padding: 2px;
  --split-row-toggle-shift: 0px;
}

.split-icon-button--row .split-icon-button__main,
.split-icon-button--row .split-icon-button__toggle {
  height: 28px;
  background: var(--split-row-bg);
  font-size: 12px;
  font-weight: 400;
}

.split-icon-button--row .split-icon-button__main {
  width: auto;
  padding: 0 var(--split-row-main-right-padding) 0 var(--split-row-main-left-padding);
  border-radius: 4px 0 0 4px;
}

.split-icon-button--row .split-icon-button__toggle {
  width: auto;
  margin-left: calc(-1 * var(--split-row-toggle-shift));
  padding: 0 7.5px 0 var(--split-row-toggle-left-padding);
  border-radius: 0 4px 4px 0;
}

.split-icon-button--row .split-icon-button__main:focus-visible,
.split-icon-button--row .split-icon-button__toggle:focus-visible {
  outline: 2px solid #cbd5e1;
  outline-offset: 1px;
}

.split-icon-button--row svg {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  color: currentColor;
}

.split-icon-button--open .split-icon-button__main,
.split-icon-button--open .split-icon-button__toggle {
  background: #f2f2f2;
  color: #000000;
}

.split-icon-button--start.split-icon-button--open .split-icon-button__main,
.split-icon-button--start.split-icon-button--open .split-icon-button__toggle {
  background: #f2f2f2;
  color: #16a34a;
}

.split-icon-button--open .split-icon-button__main,
.split-icon-button--open .split-icon-button__toggle {
  z-index: 2;
}

.row-menu {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: auto;
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  width: auto;
  min-width: 0;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
  isolation: isolate;
  overflow: hidden;
  z-index: 100;
}

.row-menu--compact {
  min-width: 0;
}

.row-menu--toolbar .row-menu__item {
  color: #334155;
}

.row-menu--toolbar .row-menu__item:hover {
  background: #f2f2f2;
  color: #0f172a;
}

.row-menu__item {
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 0;
  background: #ffffff;
  color: #64748b;
  font-size: 12px;
  font-weight: 400;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.row-menu__item:hover,
.row-menu__item--debug:hover {
  background: #f2f2f2;
  color: #0f172a;
}
</style>
