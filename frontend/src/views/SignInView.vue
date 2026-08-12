<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GoogleButton from '../components/GoogleButton.vue'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { isLoggedIn } = useAuth()

const next = computed(() => {
  const target = route.query.next
  // only allow in-app paths, never an absolute url from the query string
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
})

const failed = computed(() => route.query.error === 'auth')

// nothing to do here if the session is already live
watch(
  isLoggedIn,
  value => {
    if (value) router.replace(next.value)
  },
  { immediate: true }
)
</script>

<template>
  <div class="page signin">
    <div class="panel signin__card">
      <div class="signin__mark" aria-hidden="true">🍳</div>
      <p class="eyebrow">Welcome to EatHub</p>
      <h1>Sign in to start cooking</h1>
      <p class="muted">
        We use your Google account, so there's no new password to forget. We only read your name,
        email and profile picture.
      </p>

      <p v-if="failed" class="notice notice--error signin__error">
        Google sign-in did not go through. Give it another try.
      </p>

      <GoogleButton :next="next" />

      <p class="signin__fine muted">
        By signing in you agree to be nice about other people's cooking.
      </p>
    </div>
  </div>
</template>

<style scoped>
.signin {
  display: grid;
  place-items: center;
  padding: 72px 20px;
}

.signin__card {
  max-width: 460px;
  text-align: center;
  padding: 44px 38px;
}

.signin__mark {
  font-size: 2.6rem;
  margin-bottom: 12px;
}

.signin__card h1 {
  font-size: 2rem;
}

.signin__card .muted {
  font-size: 0.95rem;
  margin-bottom: 26px;
}

.signin__error {
  margin-bottom: 22px;
  text-align: left;
}

.signin__fine {
  margin: 24px 0 0;
  font-size: 0.8rem;
}
</style>
