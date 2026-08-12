<script setup>
import { computed, onMounted, ref } from 'vue'
import RecipeCard from '../components/RecipeCard.vue'
import DeleteRecipeButton from '../components/DeleteRecipeButton.vue'
import { api } from '../api'

const recipes = ref([])
const loading = ref(true)
const failed = ref(false)

const totals = computed(() => ({
  recipes: recipes.value.length,
  likes: recipes.value.reduce((sum, recipe) => sum + recipe.likes, 0),
  dislikes: recipes.value.reduce((sum, recipe) => sum + recipe.dislikes, 0)
}))

const onDeleted = id => {
  recipes.value = recipes.value.filter(recipe => recipe.recipe_id !== id)
}

onMounted(async () => {
  try {
    recipes.value = await api.getMyRecipes()
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page mine">
    <header class="mine__head">
      <div>
        <p class="eyebrow">My kitchen</p>
        <h1>Everything you've posted</h1>
      </div>
      <RouterLink to="/new" class="btn">+ New recipe</RouterLink>
    </header>

    <div v-if="!loading && !failed && recipes.length" class="mine__stats">
      <div class="mine__stat">
        <strong>{{ totals.recipes }}</strong>
        <span class="muted">recipes</span>
      </div>
      <div class="mine__stat">
        <strong>{{ totals.likes }}</strong>
        <span class="muted">likes earned</span>
      </div>
      <div class="mine__stat">
        <strong>{{ totals.dislikes }}</strong>
        <span class="muted">dislikes survived</span>
      </div>
    </div>

    <p v-if="loading" class="empty">Checking your kitchen…</p>

    <div v-else-if="failed" class="notice notice--error">Could not load your recipes.</div>

    <div v-else-if="!recipes.length" class="empty">
      <div class="empty__icon">👨‍🍳</div>
      <p>Nothing here yet — post the thing you cook every week.</p>
      <RouterLink to="/new" class="btn">Add your first recipe</RouterLink>
    </div>

    <div v-else class="recipe-grid">
      <div v-for="recipe in recipes" :key="recipe.recipe_id" class="mine__item">
        <RecipeCard :recipe="recipe" />
        <DeleteRecipeButton :recipe-id="recipe.recipe_id" @deleted="onDeleted" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mine {
  padding-top: 40px;
}

.mine__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 26px;
}

.mine__head h1 {
  margin-bottom: 0;
}

.mine__stats {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 34px;
}

.mine__stat {
  display: flex;
  flex-direction: column;
  padding: 14px 24px;
  border-radius: var(--radius);
  background: var(--cream-deep);
  border: 1px solid var(--line);
  min-width: 130px;
}

.mine__stat strong {
  font-family: var(--serif);
  font-size: 1.8rem;
  line-height: 1.1;
}

.mine__stat span {
  font-size: 0.85rem;
}

.mine__item {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}

.mine__item > :first-child {
  width: 100%;
}
</style>
