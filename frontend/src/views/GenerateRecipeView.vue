<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const router = useRouter()

const ingredients = ref('')
const description = ref('')
const busy = ref(false)
const error = ref('')
const quota = ref(null)

const INGREDIENTS_MAX = 400
const DESCRIPTION_MAX = 200

const canSubmit = computed(() => Boolean(ingredients.value.trim() || description.value.trim()))
const outOfQuota = computed(() => quota.value && quota.value.user <= 0)
const unavailable = computed(() => quota.value && !quota.value.configured)

const loadQuota = async () => {
  try {
    quota.value = await api.getAiQuota()
  } catch {
    quota.value = null
  }
}

const generate = async () => {
  if (!canSubmit.value || busy.value) return

  busy.value = true
  error.value = ''
  try {
    const result = await api.generateRecipe(ingredients.value.trim(), description.value.trim())
    router.push(`/recipe/${result.recipe_id}`)
  } catch (err) {
    error.value = err.message || 'Could not generate the recipe.'
    // a rejected attempt still counts against the daily budget
    loadQuota()
  } finally {
    busy.value = false
  }
}

onMounted(loadQuota)
</script>

<template>
  <div class="page gen">
    <p class="eyebrow">AI kitchen</p>
    <h1>Let the robot cook</h1>
    <p class="muted gen__lead">
      Say what is in your fridge, or describe the dish you are after. You get a full recipe
      saved straight to your kitchen.
    </p>

    <div v-if="unavailable" class="notice notice--error gen__msg">
      AI generation is not set up on this server yet.
    </div>

    <form class="gen__form" @submit.prevent="generate">
      <div class="panel stack">
        <div>
          <label for="ing">What have you got?</label>
          <textarea
            id="ing"
            v-model="ingredients"
            :maxlength="INGREDIENTS_MAX"
            placeholder="half a cabbage, two eggs, leftover rice, soy sauce"
          />
          <span class="muted gen__count">{{ ingredients.length }}/{{ INGREDIENTS_MAX }}</span>
        </div>

        <div>
          <label for="desc">What are you in the mood for?</label>
          <input
            id="desc"
            v-model="description"
            type="text"
            :maxlength="DESCRIPTION_MAX"
            placeholder="something quick and spicy for one"
          />
          <span class="muted gen__count">{{ description.length }}/{{ DESCRIPTION_MAX }}</span>
        </div>

        <p class="muted gen__fine">
          Fill in either one, or both. Anything that is not about food gets turned down.
        </p>
      </div>

      <p v-if="error" class="notice notice--error gen__msg">{{ error }}</p>

      <div class="gen__actions">
        <button type="submit" class="btn" :disabled="busy || !canSubmit || outOfQuota || unavailable">
          {{ busy ? 'Cooking it up…' : '✨ Generate recipe' }}
        </button>
        <RouterLink to="/new" class="btn btn--ghost">Write one myself</RouterLink>

        <span v-if="quota && quota.configured" class="muted gen__quota">
          <template v-if="outOfQuota">No generations left today.</template>
          <template v-else>{{ quota.user }} of {{ quota.userLimit }} left today.</template>
        </span>
      </div>
    </form>

    <p v-if="busy" class="muted gen__waiting">The model is writing — this takes a few seconds.</p>
  </div>
</template>

<style scoped>
.gen {
  padding-top: 40px;
  max-width: 720px;
}

.gen__lead {
  margin-bottom: 28px;
}

.gen__form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.gen__count {
  display: block;
  margin-top: 6px;
  font-size: 0.78rem;
  text-align: right;
}

.gen__fine {
  margin: 0;
  font-size: 0.86rem;
}

.gen__msg {
  margin: 0;
}

.gen__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.gen__quota {
  font-size: 0.86rem;
}

.gen__waiting {
  margin-top: 16px;
  font-size: 0.9rem;
}
</style>
