<template>
  <div class="flex flex-col gap-4">
    <div
      v-for="param in params"
      :key="param.id"
      class="rounded-lg border border-ink-700 bg-ink-800/70 p-3"
    >
      <div class="flex items-center justify-between text-sm font-medium text-surface-100">
        <span>{{ param.label || param.name }}</span>
        <span v-if="!param.required" class="text-xs text-surface-300">optional</span>
      </div>
      <div class="mt-2">
        <n-input
          v-if="param.type === 'string' || param.type === 'secret'"
          :value="draft[param.name] ?? ''"
          :type="param.type === 'secret' ? 'password' : 'text'"
          placeholder="Enter value or binding e.g. ${ENV:VAR}"
          @update:value="updateValue(param.name, $event)"
        />
        <n-input-number
          v-else-if="param.type === 'number'"
          :value="draft[param.name] ? Number(draft[param.name]) : null"
          @update:value="(value) => updateValue(param.name, value?.toString() ?? '')"
        />
        <n-select
          v-else-if="param.type === 'enum'"
          :value="draft[param.name] ?? ''"
          :options="enumOptions(param)"
          placeholder="Select option"
          @update:value="(value) => updateValue(param.name, value as string)"
        />
        <n-switch
          v-else-if="param.type === 'boolean'"
          :value="draft[param.name] === 'true'"
          @update:value="(value) => updateValue(param.name, value ? 'true' : 'false')"
        />
        <p class="mt-2 text-xs text-surface-300">
          Supports bindings: <code>${ENV:VAR}</code>, <code>${SECRET:KEY}</code>, <code>${RAND:hex8}</code>, <code>${DATA:key}</code>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import type { BlockParam } from '@shared/types';
import { NInput, NSelect, NSwitch, NInputNumber } from 'naive-ui';

interface Props {
  params: BlockParam[];
  modelValue: Record<string, string>;
}

const props = defineProps<Props>();
const emit = defineEmits<{ 'update:modelValue': [Record<string, string>] }>();

const draft = ref<Record<string, string>>({ ...props.modelValue });

watch(
  () => props.modelValue,
  (next) => {
    draft.value = { ...next };
  },
  { deep: true },
);

function updateValue(key: string, value: string) {
  draft.value = { ...draft.value, [key]: value };
  emit('update:modelValue', draft.value);
}

function enumOptions(param: BlockParam) {
  if (!param.enumValues) return [];
  try {
    const parsed = JSON.parse(param.enumValues) as string[];
    return parsed.map((value) => ({ label: value, value }));
  } catch (error) {
    console.warn('Failed to parse enum values for param', param.name, error);
    return [];
  }
}
</script>
