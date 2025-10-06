<template>
  <div class="flex flex-wrap gap-2">
    <n-tag
      v-for="(tag, index) in modelValue"
      :key="`${tag}-${index}`"
      closable
      type="info"
      size="small"
      @close="removeTag(index)"
    >
      {{ tag }}
    </n-tag>
    <n-input
      ref="inputRef"
      v-model:value="inputValue"
      size="small"
      class="w-32"
      placeholder="Add tag"
      :disabled="disabled"
      @keyup.enter.prevent="addTag"
      @blur="handleBlur"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  modelValue: string[];
  disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [string[]] }>();

const inputValue = ref('');
const inputRef = ref();

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      inputValue.value = '';
    }
  },
);

function addTag() {
  if (!inputValue.value.trim()) return;
  const next = Array.from(new Set([...props.modelValue, inputValue.value.trim()]));
  emit('update:modelValue', next);
  inputValue.value = '';
}

function removeTag(index: number) {
  const next = [...props.modelValue];
  next.splice(index, 1);
  emit('update:modelValue', next);
}

function handleBlur() {
  addTag();
}
</script>
