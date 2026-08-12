<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const router = useRouter()

const name = ref('')
const info = ref('')
const ingredients = ref([''])
const steps = ref([''])
const image = ref(null)
const preview = ref(null)

const error = ref('')
const saving = ref(false)

const addRow = list => list.value.push('')
const removeRow = (list, index) => {
  list.value.splice(index, 1)
  if (!list.value.length) list.value.push('')
}

const onFile = event => {
  const file = event.target.files?.[0] || null
  image.value = file
  preview.value = file ? URL.createObjectURL(file) : null
}

const submit = async () => {
  error.value = ''

  const cleanIngredients = ingredients.value.map(item => item.trim()).filter(Boolean)
  const cleanSteps = steps.value.map(step => step.trim()).filter(Boolean)

  if (!name.value.trim()) return (error.value = 'Give the dish a name.')
  if (!cleanIngredients.length) return (error.value = 'Add at least one ingredient.')
  if (!cleanSteps.length) return (error.value = 'Add at least one step.')

  const form = new FormData()
  form.append('name', name.value.trim())
  form.append('info', info.value.trim())
  // the api stores these as json text columns
  form.append('ingredients', JSON.stringify(cleanIngredients))
  form.append('recipe', JSON.stringify(cleanSteps))
  if (image.value) form.append('image', image.value)

  saving.value = true
  try {
    await api.createRecipe(form)
    router.push('/my-recipes')
  } catch (err) {
    error.value = err.status === 401 ? 'Your session expired, sign in again.' : 'Could not save the recipe.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page create">
    <p class="eyebrow">New recipe</p>
    <h1>What are we cooking?</h1>
    <p class="muted create__lead">Keep it short. Ingredients, steps, done.</p>

    <form class="create__form" @submit.prevent="submit">
      <div class="panel stack">
        <div>
          <label for="name">Dish name</label>
          <input id="name" v-model="name" type="text" placeholder="Burnt garlic butter noodles" />
        </div>

        <div>
          <label for="info">Short description</label>
          <textarea id="info" v-model="info" placeholder="Ten minutes, one pan, embarrassingly good." />
        </div>

        <div>
          <label for="photo">Photo</label>
          <input id="photo" type="file" accept="image/*" @change="onFile" />
          <img v-if="preview" :src="preview" alt="Preview" class="create__preview" />
        </div>
      </div>

      <div class="panel">
        <h2>Ingredients</h2>
        <div v-for="(item, index) in ingredients" :key="`ing-${index}`" class="create__row">
          <input v-model="ingredients[index]" type="text" placeholder="200 g spaghetti" />
          <button type="button" class="create__remove" title="Remove" @click="removeRow(ingredients, index)">✕</button>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" @click="addRow(ingredients)">+ Ingredient</button>
      </div>

      <div class="panel">
        <h2>Steps</h2>
        <div v-for="(step, index) in steps" :key="`step-${index}`" class="create__row">
          <span class="create__no">{{ index + 1 }}</span>
          <textarea v-model="steps[index]" placeholder="Boil the water, salt it like the sea." />
          <button type="button" class="create__remove" title="Remove" @click="removeRow(steps, index)">✕</button>
        </div>
        <button type="button" class="btn btn--ghost btn--sm" @click="addRow(steps)">+ Step</button>
      </div>

      <p v-if="error" class="notice notice--error">{{ error }}</p>

      <div class="create__actions">
        <button type="submit" class="btn" :disabled="saving">
          {{ saving ? 'Saving…' : 'Publish recipe' }}
        </button>
        <RouterLink to="/" class="btn btn--ghost">Cancel</RouterLink>
      </div>
    </form>
  </div>
</template>

<style scoped>
.create {
  padding-top: 40px;
  max-width: 780px;
}

.create__lead {
  margin-bottom: 28px;
}

.create__form {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.create__form h2 {
  font-size: 1.25rem;
  margin-bottom: 14px;
}

.create__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.create__no {
  flex: 0 0 30px;
  height: 30px;
  margin-top: 6px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--cream-deep);
  font-weight: 700;
  font-size: 0.85rem;
}

.create__remove {
  flex: 0 0 auto;
  margin-top: 4px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--parchment);
  color: var(--crust-soft);
  cursor: pointer;
  font-size: 0.85rem;
}

.create__remove:hover {
  border-color: var(--chili);
  color: var(--chili);
}

.create__preview {
  margin-top: 12px;
  width: 220px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--radius);
  border: 1px solid var(--line);
}

.create__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
