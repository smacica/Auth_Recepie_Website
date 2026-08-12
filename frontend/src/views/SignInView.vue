<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GoogleButton from '../components/GoogleButton.vue'
import { api } from '../api'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { isLoggedIn, signIn } = useAuth()

const mode = ref('signin') // or 'signup'
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const unverified = ref(false)

const next = computed(() => {
  const target = route.query.next
  // only allow in-app paths, never an absolute url from the query string
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
})

// the /verify-email route bounces back here with the outcome
const verifyMessage = computed(() => {
  const messages = {
    ok: 'Address confirmed. Sign in below.',
    expired: 'That link had expired. Sign in to get a fresh one.',
    invalid: 'That link is no longer valid. Sign in to get a fresh one.'
  }
  return messages[route.query.verify] || ''
})

const googleFailed = computed(() => route.query.error === 'auth')

const switchTo = target => {
  mode.value = target
  error.value = ''
  notice.value = ''
  unverified.value = false
}

const submit = async () => {
  error.value = ''
  notice.value = ''
  unverified.value = false
  busy.value = true

  try {
    if (mode.value === 'signup') {
      const result = await api.signup(email.value.trim(), password.value)
      notice.value = result.delivered
        ? result.message
        : `${result.message} (No mail server configured — the link is in the server console.)`
      password.value = ''
    } else {
      await signIn(email.value.trim(), password.value)
      router.replace(next.value)
    }
  } catch (err) {
    error.value = err.message || 'Something went wrong.'
    unverified.value = err.code === 'unverified'
  } finally {
    busy.value = false
  }
}

const resend = async () => {
  busy.value = true
  error.value = ''
  try {
    const result = await api.resendVerification(email.value.trim())
    notice.value = result.message
    unverified.value = false
  } catch {
    error.value = 'Could not send the link.'
  } finally {
    busy.value = false
  }
}

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
      <h1>{{ mode === 'signup' ? 'Create your account' : 'Sign in to start cooking' }}</h1>

      <div class="signin__tabs" role="tablist">
        <button
          class="signin__tab"
          :class="{ 'signin__tab--on': mode === 'signin' }"
          role="tab"
          :aria-selected="mode === 'signin'"
          @click="switchTo('signin')"
        >
          Sign in
        </button>
        <button
          class="signin__tab"
          :class="{ 'signin__tab--on': mode === 'signup' }"
          role="tab"
          :aria-selected="mode === 'signup'"
          @click="switchTo('signup')"
        >
          Create account
        </button>
      </div>

      <p v-if="verifyMessage" class="notice notice--ok signin__msg">{{ verifyMessage }}</p>
      <p v-if="googleFailed" class="notice notice--error signin__msg">
        Google sign-in did not go through. Give it another try.
      </p>

      <form class="signin__form" @submit.prevent="submit">
        <div>
          <label for="email">Email</label>
          <input id="email" v-model="email" type="text" autocomplete="email" placeholder="you@example.com" />
        </div>

        <div>
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
            :placeholder="mode === 'signup' ? 'At least 8 characters' : '••••••••'"
          />
        </div>

        <p v-if="error" class="notice notice--error signin__msg">
          {{ error }}
          <button v-if="unverified" type="button" class="signin__link" @click="resend">
            Send the link again
          </button>
        </p>
        <p v-if="notice" class="notice notice--ok signin__msg">{{ notice }}</p>

        <button type="submit" class="btn signin__submit" :disabled="busy">
          {{ busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in' }}
        </button>
      </form>

      <div class="signin__or"><span>or</span></div>

      <GoogleButton :next="next" :label="mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'" />

      <p class="signin__fine muted">
        {{
          mode === 'signup'
            ? 'We send a confirmation link before the account can be used.'
            : 'By signing in you agree to be nice about other people\'s cooking.'
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.signin {
  display: grid;
  place-items: center;
  padding: 56px 20px;
}

.signin__card {
  max-width: 460px;
  width: 100%;
  text-align: center;
  padding: 40px 38px;
}

.signin__mark {
  font-size: 2.6rem;
  margin-bottom: 12px;
}

.signin__card h1 {
  font-size: 1.85rem;
}

.signin__tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  margin: 8px 0 22px;
  border-radius: 999px;
  background: var(--cream-deep);
  border: 1px solid var(--line);
}

.signin__tab {
  padding: 8px 20px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--crust-soft);
  cursor: pointer;
}

.signin__tab--on {
  background: var(--parchment);
  color: var(--crust);
  box-shadow: var(--shadow-sm);
}

.signin__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: left;
}

.signin__submit {
  width: 100%;
  margin-top: 4px;
}

.signin__msg {
  margin: 0;
}

.signin__link {
  display: block;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 600;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.signin__or {
  position: relative;
  margin: 22px 0;
  font-size: 0.82rem;
  color: var(--crust-soft);
}

.signin__or::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--line);
}

.signin__or span {
  position: relative;
  padding: 0 12px;
  background: var(--parchment);
}

.signin__fine {
  margin: 22px 0 0;
  font-size: 0.8rem;
}
</style>
