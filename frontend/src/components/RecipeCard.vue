<script setup>
import { ref } from 'vue'

const props = defineProps({
  recipe: { type: Object, required: true }
})

// recipes posted without a photo (or with a missing file) get a drawn placeholder
const broken = ref(false)
</script>

<template>
  <RouterLink :to="`/recipe/${props.recipe.recipe_id}`" class="rcard card">
    <div class="rcard__media">
      <img
        v-if="props.recipe.photo && !broken"
        :src="props.recipe.photo"
        :alt="props.recipe.name"
        loading="lazy"
        @error="broken = true"
      />
      <div v-else class="rcard__placeholder" aria-hidden="true">🍲</div>
      <span class="rcard__score" :title="`${props.recipe.likes} likes / ${props.recipe.dislikes} dislikes`">
        👍 {{ props.recipe.likes }}
      </span>
    </div>

    <div class="rcard__body">
      <h3 class="rcard__title">{{ props.recipe.name }}</h3>
      <p class="rcard__info">{{ props.recipe.info }}</p>
      <div class="rcard__meta muted">
        <span>🧂 {{ props.recipe.ingredients.length }} ingredients</span>
        <span>{{ props.recipe.date }}</span>
      </div>
    </div>
  </RouterLink>
</template>

<style scoped>
.rcard {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: inherit;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.rcard:hover {
  text-decoration: none;
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.rcard__media {
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--cream-deep);
}

.rcard__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rcard__placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 3rem;
  background: linear-gradient(150deg, var(--cream-deep), rgba(232, 163, 61, 0.3));
}

.rcard__score {
  position: absolute;
  left: 12px;
  bottom: 12px;
  padding: 5px 11px;
  border-radius: 999px;
  background: rgba(255, 253, 250, 0.94);
  font-size: 0.82rem;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.rcard__body {
  padding: 18px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.rcard__title {
  margin: 0;
}

.rcard__info {
  margin: 0;
  color: var(--crust-soft);
  font-size: 0.94rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.rcard__meta {
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.8rem;
}
</style>
