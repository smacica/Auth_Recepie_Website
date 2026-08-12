<script setup>
import { ref } from 'vue'
import { api } from '../api'

const props = defineProps({
  recipeId: { type: [Number, String], required: true },
  label: { type: String, default: 'Delete' }
})

const emit = defineEmits(['deleted'])

// two-step in the page rather than a window.confirm, which blocks the whole tab
const confirming = ref(false)
const busy = ref(false)
const error = ref('')

const remove = async () => {
  busy.value = true
  error.value = ''
  try {
    await api.deleteRecipe(props.recipeId)
    emit('deleted', props.recipeId)
  } catch (err) {
    error.value = err.message || 'Could not delete the recipe.'
    confirming.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="del">
    <button v-if="!confirming" type="button" class="btn btn--ghost btn--danger btn--sm" @click="confirming = true">
      🗑 {{ props.label }}
    </button>

    <div v-else class="del__confirm">
      <span>Delete for good?</span>
      <button type="button" class="btn btn--sm btn--solid-danger" :disabled="busy" @click="remove">
        {{ busy ? 'Deleting…' : 'Yes, delete' }}
      </button>
      <button type="button" class="btn btn--ghost btn--sm" :disabled="busy" @click="confirming = false">
        Keep it
      </button>
    </div>

    <p v-if="error" class="notice notice--error del__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.del__confirm {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.92rem;
  font-weight: 600;
}

.del__error {
  margin-top: 10px;
}
</style>
