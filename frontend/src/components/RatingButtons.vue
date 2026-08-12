<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  recipeId: { type: [Number, String], required: true },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 }
})

const { isLoggedIn } = useAuth()
const router = useRouter()

const likes = ref(props.likes)
const dislikes = ref(props.dislikes)
const myRating = ref(null)
const busy = ref(false)

// the api answers with what it did: "add", "cancel" or "change"
const applyAction = (action, rating) => {
  const counter = rating === 1 ? likes : dislikes
  const other = rating === 1 ? dislikes : likes

  if (action === 'add') {
    counter.value += 1
    myRating.value = rating
  } else if (action === 'cancel') {
    counter.value -= 1
    myRating.value = null
  } else if (action === 'change') {
    counter.value += 1
    other.value = Math.max(0, other.value - 1)
    myRating.value = rating
  }
}

const rate = async rating => {
  if (!isLoggedIn.value) {
    router.push({ name: 'signin', query: { next: `/recipe/${props.recipeId}` } })
    return
  }
  if (busy.value) return

  busy.value = true
  try {
    const result = await api.rate(props.recipeId, rating)
    if (result.action) applyAction(result.action, rating)
  } catch {
    // leave the counters untouched if the request failed
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="rate">
    <button
      class="rate__btn"
      :class="{ 'rate__btn--on': myRating === 1 }"
      :disabled="busy"
      @click="rate(1)"
    >
      👍 <strong>{{ likes }}</strong>
    </button>
    <button
      class="rate__btn"
      :class="{ 'rate__btn--down': myRating === 0 }"
      :disabled="busy"
      @click="rate(0)"
    >
      👎 <strong>{{ dislikes }}</strong>
    </button>
  </div>
</template>

<style scoped>
.rate {
  display: inline-flex;
  gap: 10px;
}

.rate__btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--parchment);
  font: inherit;
  color: var(--crust);
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.rate__btn:hover:not(:disabled) {
  border-color: var(--saffron);
  background: var(--cream-deep);
}

.rate__btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.rate__btn--on {
  border-color: var(--basil);
  background: rgba(79, 122, 58, 0.12);
}

.rate__btn--down {
  border-color: var(--chili);
  background: rgba(192, 46, 46, 0.1);
}
</style>
