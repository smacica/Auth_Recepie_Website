<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RatingButtons from '../components/RatingButtons.vue'
import DeleteRecipeButton from '../components/DeleteRecipeButton.vue'
import CommentSection from '../components/CommentSection.vue'
import { api } from '../api'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { user } = useAuth()

const isMine = computed(() => Boolean(user.value && recipe.value && user.value.user_id === recipe.value.user_id))
const recipe = ref(null)
const loading = ref(true)
const failed = ref(false)

const broken = ref(false)

const fetchRecipe = async id => {
  loading.value = true
  failed.value = false
  broken.value = false
  try {
    recipe.value = await api.getRecipe(id)
    if (!recipe.value?.recipe_id) failed.value = true
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchRecipe(route.params.id))
watch(() => route.params.id, id => id && fetchRecipe(id))
</script>

<template>
  <div class="page detail">
    <p v-if="loading" class="empty">Fetching the recipe…</p>

    <div v-else-if="failed" class="notice notice--error">
      We could not find that recipe. <RouterLink to="/">Back to all recipes</RouterLink>.
    </div>

    <article v-else>
      <RouterLink to="/" class="detail__back muted">← All recipes</RouterLink>

      <header class="detail__head">
        <div>
          <p class="eyebrow">{{ recipe.date }}</p>
          <h1>{{ recipe.name }}</h1>
          <p class="detail__info">{{ recipe.info }}</p>
          <div class="detail__controls">
            <RatingButtons
              :recipe-id="recipe.recipe_id"
              :likes="recipe.likes"
              :dislikes="recipe.dislikes"
            />
            <DeleteRecipeButton
              v-if="isMine"
              :recipe-id="recipe.recipe_id"
              label="Delete recipe"
              @deleted="router.push('/my-recipes')"
            />
          </div>
        </div>
        <img
          v-if="recipe.photo && !broken"
          class="detail__photo"
          :src="recipe.photo"
          :alt="recipe.name"
          @error="broken = true"
        />
        <div v-else class="detail__photo detail__photo--empty" aria-hidden="true">🍲</div>
      </header>

      <div class="detail__body">
        <aside class="panel detail__ingredients">
          <h2>Ingredients</h2>
          <ul>
            <li v-for="(item, index) in recipe.ingredients" :key="index">{{ item }}</li>
          </ul>
          <p v-if="!recipe.ingredients.length" class="muted">No ingredients listed.</p>
        </aside>

        <section class="detail__steps">
          <h2>Method</h2>
          <ol>
            <li v-for="(step, index) in recipe.steps" :key="index">
              <span class="detail__step-no">{{ index + 1 }}</span>
              <span>{{ step }}</span>
            </li>
          </ol>
          <p v-if="!recipe.steps.length" class="muted">No steps written down yet.</p>
        </section>
      </div>

      <CommentSection :recipe-id="recipe.recipe_id" :recipe-owner-id="recipe.user_id" />
    </article>
  </div>
</template>

<style scoped>
.detail {
  padding-top: 34px;
}

.detail__back {
  display: inline-block;
  margin-bottom: 18px;
}

.detail__head {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 40px;
  align-items: center;
  margin-bottom: 48px;
}

.detail__controls {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.detail__info {
  font-size: 1.05rem;
  color: var(--crust-soft);
  max-width: 50ch;
}

.detail__photo {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-md);
}

.detail__photo--empty {
  display: grid;
  place-items: center;
  font-size: 4.5rem;
  background: linear-gradient(150deg, var(--cream-deep), rgba(232, 163, 61, 0.3));
}

.detail__body {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 40px;
  align-items: start;
}

.detail__ingredients {
  position: sticky;
  top: 92px;
  background: var(--cream-deep);
}

.detail__ingredients h2,
.detail__steps h2 {
  font-size: 1.35rem;
}

.detail__ingredients ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.detail__ingredients li {
  padding: 9px 0 9px 26px;
  border-bottom: 1px dashed var(--line);
  position: relative;
}

.detail__ingredients li::before {
  content: "🥄";
  position: absolute;
  left: 0;
  font-size: 0.85rem;
}

.detail__ingredients li:last-child {
  border-bottom: 0;
}

.detail__steps ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail__steps li {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  background: var(--parchment);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 18px;
}

.detail__step-no {
  flex: 0 0 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--paprika);
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
}

@media (max-width: 860px) {
  .detail__head,
  .detail__body {
    grid-template-columns: 1fr;
    gap: 26px;
  }

  .detail__ingredients {
    position: static;
  }
}
</style>
