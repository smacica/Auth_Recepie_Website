<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { EMOJI_PALETTE } from '@shared/ingredients.mjs'

const props = defineProps({
  modelValue: { type: String, default: '🥄' }
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const root = ref(null)

const pick = emoji => {
  emit('update:modelValue', emoji)
  open.value = false
}

// close when the click lands anywhere else on the page
const onDocumentClick = event => {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

const toggle = () => {
  open.value = !open.value
  if (open.value) {
    document.addEventListener('click', onDocumentClick)
  } else {
    document.removeEventListener('click', onDocumentClick)
  }
}

onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="pick">
    <button
      type="button"
      class="pick__current"
      :aria-expanded="open"
      aria-label="Choose an emoji for this ingredient"
      @click="toggle"
    >
      {{ props.modelValue }}
    </button>

    <div v-if="open" class="pick__menu">
      <button
        v-for="emoji in EMOJI_PALETTE"
        :key="emoji"
        type="button"
        class="pick__option"
        :class="{ 'pick__option--on': emoji === props.modelValue }"
        @click="pick(emoji)"
      >
        {{ emoji }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.pick {
  position: relative;
  flex: 0 0 auto;
}

.pick__current {
  width: 46px;
  height: 46px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--cream);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.pick__current:hover {
  border-color: var(--saffron);
}

.pick__menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  width: 268px;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  background: var(--parchment);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

.pick__option {
  aspect-ratio: 1;
  border: 0;
  border-radius: 8px;
  background: none;
  font-size: 1.05rem;
  line-height: 1;
  cursor: pointer;
}

.pick__option:hover {
  background: var(--cream-deep);
}

.pick__option--on {
  background: var(--saffron);
}
</style>
