<template>
  <div class="list-surface" :class="{ 'list-surface--row-menu-open': rowMenuOpen }">
    <div v-if="$slots.toolbar" class="list-surface__toolbar">
      <slot name="toolbar" />
    </div>
    <div>
      <div v-if="hasItems" class="list-surface__table-wrap">
        <slot />
      </div>
      <div v-else class="list-surface__empty">
        <slot name="empty" />
      </div>
    </div>
    <slot name="pagination" />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  hasItems: boolean
  rowMenuOpen?: boolean
}>(), {
  rowMenuOpen: false,
})
</script>

<style>
.list-surface {
  overflow: visible;
  background: #ffffff;
  border: 0;
  border-radius: 6px;
  box-shadow: none;
}

.list-surface__toolbar {
  position: relative;
  z-index: 40;
  padding: 8px 10px;
  background: #ffffff;
  border-bottom: 0;
  border-radius: 6px 6px 0 0;
}

.list-surface__toolbar > div {
  min-height: 30px;
}

.list-surface__table-wrap {
  position: relative;
  z-index: 1;
  overflow: visible;
}

.list-surface__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
  color: #94a3b8;
}

.list-table-head {
  height: 44px;
  padding: 0 16px;
  color: #334155;
  font-size: 13px;
  font-weight: 400;
  text-align: center;
  white-space: nowrap;
}

.list-table-row {
  --env-row-bg: #ffffff;
  position: relative;
  z-index: 0;
  background: var(--env-row-bg);
}

.list-table-row:hover,
.list-table-row--actions-open {
  --env-row-bg: #f8fafc;
  background: var(--env-row-bg);
}

.list-table-row:hover {
  z-index: 10;
}

.list-table-row--actions-open {
  z-index: 20;
}

.list-table-row > td {
  position: relative;
  border-top: 1px solid #f1f5f9;
}

.list-table-row--actions-open > td {
  z-index: 20;
}

.list-table-row:hover > td {
  z-index: 10;
}

.list-table-row--selected,
.list-table-row--selected:hover {
  --env-row-bg: #eff6ff;
  background: var(--env-row-bg);
}
</style>
