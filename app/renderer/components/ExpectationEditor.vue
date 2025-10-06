<template>
  <div class="space-y-3">
    <div v-for="(expectation, index) in localExpectations" :key="expectation.id" class="rounded-lg border border-ink-700 bg-ink-800/70 p-3">
      <div class="flex flex-wrap items-center gap-2">
        <n-select
          class="w-32"
          size="small"
          :options="operatorOptions"
          :value="expectation.operator"
          @update:value="(value) => update(index, { operator: value as Operator })"
        />
        <n-select
          class="min-w-[180px] flex-1"
          size="small"
          filterable
          tag
          :options="selectorOptionsComputed"
          :value="expectation.selector"
          placeholder="Selector"
          @update:value="(value) => update(index, { selector: value as string })"
        />
        <n-input
          v-if="requiresValue(expectation.operator)"
          class="flex-1"
          size="small"
          placeholder="Expected value"
          :value="expectation.value ?? ''"
          @update:value="(value) => update(index, { value })"
        />
        <n-button size="tiny" tertiary type="error" @click="remove(index)">Remove</n-button>
      </div>
    </div>
    <n-button size="tiny" dashed block type="primary" @click="add">Add Expectation</n-button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NSelect, NInput, NButton } from 'naive-ui';
import type { Expectation } from '@shared/types';

const operatorOptions = [
  { label: 'Equals', value: 'equals' },
  { label: 'Contains', value: 'contains' },
  { label: 'Exists', value: 'exists' },
  { label: 'Not Exists', value: 'notExists' },
];

const requiresValue = (operator: Operator) => operator === 'equals' || operator === 'contains';

type Operator = Expectation['operator'];

const props = defineProps<{
  modelValue: Expectation[];
  selectorOptions?: string[];
}>();

const emit = defineEmits<{ 'update:modelValue': [Expectation[]] }>();

const localExpectations = ref<Expectation[]>([...props.modelValue]);

watch(
  () => props.modelValue,
  (value) => {
    localExpectations.value = [...value];
  },
  { deep: true },
);

const selectorOptionsComputed = computed(() => {
  return (props.selectorOptions ?? [])
    .map((value) => ({ label: value, value }))
    .concat(
      localExpectations.value
        .map((item) => item.selector)
        .filter((selector) => selector && !(props.selectorOptions ?? []).includes(selector))
        .map((selector) => ({ label: selector!, value: selector! })),
    );
});

function add() {
  const expectation: Expectation = {
    id: crypto.randomUUID(),
    type: 'assert',
    operator: 'exists',
    selector: '',
  };
  const next = [...localExpectations.value, expectation];
  updateValue(next);
}

function remove(index: number) {
  const next = localExpectations.value.filter((_, idx) => idx !== index);
  updateValue(next);
}

function update(index: number, patch: Partial<Expectation>) {
  const next = localExpectations.value.map((item, idx) => (idx === index ? { ...item, ...patch } : item));
  updateValue(next);
}

function updateValue(next: Expectation[]) {
  localExpectations.value = next;
  emit('update:modelValue', next);
}
</script>
