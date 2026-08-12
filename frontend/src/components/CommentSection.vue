<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  recipeId: { type: [Number, String], required: true },
  // the recipe author can clear comments off their own recipe
  recipeOwnerId: { type: Number, default: null }
})

const { user, isLoggedIn } = useAuth()
const route = useRoute()
const router = useRouter()

const comments = ref([])
const loading = ref(true)
const failed = ref(false)
const draft = ref('')
const posting = ref(false)
const error = ref('')
const removing = ref(null)

const MAX = 1000

const canRemove = comment =>
  Boolean(user.value) &&
  (user.value.user_id === comment.user_id || user.value.user_id === props.recipeOwnerId)

const when = timestamp => {
  const diff = Date.now() - timestamp
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(timestamp).toLocaleDateString()
}

const load = async () => {
  loading.value = true
  failed.value = false
  try {
    comments.value = await api.getComments(props.recipeId)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

const post = async () => {
  const body = draft.value.trim()
  if (!body) return

  if (!isLoggedIn.value) {
    router.push({ name: 'signin', query: { next: route.fullPath } })
    return
  }

  posting.value = true
  error.value = ''
  try {
    const comment = await api.addComment(props.recipeId, body)
    comments.value.unshift(comment)
    draft.value = ''
  } catch (err) {
    error.value = err.message || 'Could not post the comment.'
  } finally {
    posting.value = false
  }
}

const remove = async comment => {
  removing.value = comment.comment_id
  error.value = ''
  try {
    await api.deleteComment(comment.comment_id)
    comments.value = comments.value.filter(item => item.comment_id !== comment.comment_id)
  } catch (err) {
    error.value = err.message || 'Could not delete the comment.'
  } finally {
    removing.value = null
  }
}

onMounted(load)
watch(() => props.recipeId, load)
</script>

<template>
  <section class="comments">
    <h2>Comments <span class="muted comments__count">{{ comments.length }}</span></h2>

    <form class="comments__form" @submit.prevent="post">
      <textarea
        v-model="draft"
        :maxlength="MAX"
        :placeholder="isLoggedIn ? 'Did you cook it? How did it go?' : 'Sign in to leave a comment'"
        aria-label="Write a comment"
      />
      <div class="comments__form-row">
        <span class="muted comments__count">{{ draft.length }}/{{ MAX }}</span>
        <button type="submit" class="btn btn--sm" :disabled="posting || !draft.trim()">
          {{ posting ? 'Posting…' : 'Post comment' }}
        </button>
      </div>
    </form>

    <p v-if="error" class="notice notice--error comments__error">{{ error }}</p>

    <p v-if="loading" class="muted">Loading comments…</p>
    <p v-else-if="failed" class="notice notice--error">Could not load the comments.</p>
    <p v-else-if="!comments.length" class="muted comments__empty">
      No comments yet. Be the first to say something.
    </p>

    <ul v-else class="comments__list">
      <li v-for="comment in comments" :key="comment.comment_id" class="comments__item">
        <img
          v-if="comment.profile_pic"
          class="comments__avatar"
          :src="comment.profile_pic"
          :alt="comment.username"
          referrerpolicy="no-referrer"
        />
        <span v-else class="comments__avatar comments__avatar--empty">
          {{ (comment.username || '?')[0].toUpperCase() }}
        </span>

        <div class="comments__body">
          <div class="comments__meta">
            <strong>{{ comment.username }}</strong>
            <span class="muted">{{ when(comment.created_at) }}</span>
            <button
              v-if="canRemove(comment)"
              type="button"
              class="comments__remove"
              :disabled="removing === comment.comment_id"
              @click="remove(comment)"
            >
              {{ removing === comment.comment_id ? 'removing…' : 'remove' }}
            </button>
          </div>
          <p class="comments__text">{{ comment.body }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.comments {
  margin-top: 56px;
  padding-top: 34px;
  border-top: 1px solid var(--line);
}

.comments h2 {
  font-size: 1.35rem;
}

.comments__count {
  font-family: var(--sans);
  font-size: 0.85rem;
  font-weight: 500;
}

.comments__form {
  margin-bottom: 26px;
}

.comments__form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.comments__error {
  margin-bottom: 18px;
}

.comments__empty {
  padding: 12px 0;
}

.comments__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comments__item {
  display: flex;
  gap: 14px;
  padding: 16px 18px;
  background: var(--parchment);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.comments__avatar {
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--line);
}

.comments__avatar--empty {
  display: grid;
  place-items: center;
  background: var(--saffron);
  color: #fff;
  font-weight: 700;
}

.comments__body {
  flex: 1;
  min-width: 0;
}

.comments__meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.86rem;
  margin-bottom: 4px;
}

.comments__remove {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.82rem;
  color: var(--crust-soft);
  text-decoration: underline;
  cursor: pointer;
}

.comments__remove:hover:not(:disabled) {
  color: var(--chili);
}

.comments__text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
