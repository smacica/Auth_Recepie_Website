<script setup>
import { computed, onMounted, ref } from 'vue'
import RecipeCard from '../components/RecipeCard.vue'
import { api } from '../api'
import { useAuth } from '../composables/useAuth'

const { isLoggedIn } = useAuth()

const recipes = ref([])
const loading = ref(true)
const failed = ref(false)
const search = ref('')

const visible = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return recipes.value

  return recipes.value.filter(recipe =>
    // ingredients are {emoji, text}, so pull the text out - stringifying the whole
    // object turned every one of them into "[object Object]" and matched nothing
    [recipe.name, recipe.info, ...recipe.ingredients.map(item => item.text)]
      .filter(Boolean)
      .some(field => String(field).toLowerCase().includes(term))
  )
})

onMounted(async () => {
  try {
    recipes.value = await api.getRecipes()
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <section class="hero">
      <div class="page hero__inner">
        <div class="hero__copy">
          <p class="eyebrow">Cooked, rated, shared</p>
          <h1>Recipes from people who&nbsp;actually cook them.</h1>
          <p class="hero__lead">
            No twelve paragraphs about someone's grandmother. Just the ingredients, the steps, and an
            honest thumbs up or down from everyone who tried it.
          </p>
          <div class="hero__actions">
            <RouterLink v-if="isLoggedIn" to="/new" class="btn">Add your recipe</RouterLink>
            <RouterLink v-else to="/signin" class="btn">Sign in to cook along</RouterLink>
            <RouterLink v-if="isLoggedIn" to="/generate" class="btn btn--ghost">✨ Generate one</RouterLink>
            <a v-else href="#browse" class="btn btn--ghost">Browse the pot</a>
          </div>
        </div>
        <div class="hero__plate" aria-hidden="true">
          <div class="hero__plate-inner">🥘</div>
        </div>
      </div>
    </section>

    <section id="browse" class="page browse">
      <div class="browse__head">
        <div>
          <h2>Top of the pot</h2>
          <p class="muted">Sorted by the ones people liked most.</p>
        </div>
        <input
          v-model="search"
          type="text"
          class="browse__search"
          placeholder="Search a dish or an ingredient…"
          aria-label="Search recipes"
        />
      </div>

      <p v-if="loading" class="empty">Warming up the kitchen…</p>

      <div v-else-if="failed" class="notice notice--error">
        Could not reach the kitchen. Is the API running on port 4000?
      </div>

      <div v-else-if="!recipes.length" class="empty">
        <div class="empty__icon">🍽️</div>
        <p>Nothing on the menu yet. Be the first to post a recipe.</p>
      </div>

      <div v-else-if="!visible.length" class="empty">
        <div class="empty__icon">🔍</div>
        <p>No recipe matches “{{ search }}”.</p>
      </div>

      <div v-else class="recipe-grid">
        <RecipeCard v-for="recipe in visible" :key="recipe.recipe_id" :recipe="recipe" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  background: linear-gradient(160deg, var(--cream-deep), rgba(232, 163, 61, 0.18));
  border-bottom: 1px solid var(--line);
  padding: 64px 0 72px;
  margin-bottom: 56px;
}

.hero__inner {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  align-items: center;
  gap: 48px;
}

.hero__lead {
  font-size: 1.08rem;
  color: var(--crust-soft);
  max-width: 46ch;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}

.hero__plate {
  display: grid;
  place-items: center;
}

.hero__plate-inner {
  width: min(260px, 100%);
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 6rem;
  background: var(--parchment);
  border: 10px solid rgba(255, 253, 250, 0.75);
  box-shadow: var(--shadow-lg);
}

.browse__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 28px;
}

.browse__head h2 {
  margin-bottom: 2px;
}

.browse__search {
  max-width: 320px;
  background: var(--parchment);
}

@media (max-width: 820px) {
  .hero__inner {
    grid-template-columns: 1fr;
  }

  .hero__plate {
    order: -1;
  }

  .hero {
    padding: 40px 0 48px;
    margin-bottom: 40px;
  }
}
</style>
