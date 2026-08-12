<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const { user, isLoggedIn, logout } = useAuth()
const router = useRouter()
const open = ref(false)

const signOut = async () => {
  open.value = false
  await logout()
  router.push('/')
}
</script>

<template>
  <header class="nav">
    <div class="page nav__inner">
      <RouterLink to="/" class="brand" @click="open = false">
        <span class="brand__mark" aria-hidden="true">🍳</span>
        <span class="brand__text">EatHub</span>
      </RouterLink>

      <button class="nav__toggle" :aria-expanded="open" aria-label="Toggle menu" @click="open = !open">
        <span></span><span></span><span></span>
      </button>

      <nav class="nav__links" :class="{ 'nav__links--open': open }" @click="open = false">
        <RouterLink to="/">Recipes</RouterLink>
        <RouterLink v-if="isLoggedIn" to="/my-recipes">My kitchen</RouterLink>
        <RouterLink v-if="isLoggedIn" to="/new">Add recipe</RouterLink>
        <RouterLink v-if="isLoggedIn" to="/generate" class="nav__ai">✨ AI recipe</RouterLink>

        <template v-if="isLoggedIn">
          <RouterLink to="/profile" class="nav__me">
            <img v-if="user?.profile_pic" :src="user.profile_pic" :alt="user.username" referrerpolicy="no-referrer" />
            <span v-else class="nav__avatar-fallback">{{ (user?.username || '?')[0].toUpperCase() }}</span>
            <span>{{ user?.username }}</span>
          </RouterLink>
          <button class="btn btn--ghost btn--sm" @click="signOut">Sign out</button>
        </template>

        <RouterLink v-else to="/signin" class="btn btn--sm">Sign in</RouterLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(253, 246, 236, 0.88);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}

.nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 68px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--crust);
  font-family: var(--serif);
  font-size: 1.45rem;
  font-weight: 600;
}
.brand:hover {
  text-decoration: none;
}

.brand__mark {
  font-size: 1.5rem;
  line-height: 1;
}

.nav__links {
  display: flex;
  align-items: center;
  gap: 22px;
  font-weight: 500;
}

.nav__links a {
  color: var(--crust);
}

.nav__links a.router-link-exact-active:not(.btn):not(.nav__me) {
  color: var(--paprika);
  text-decoration: underline;
  text-underline-offset: 6px;
  text-decoration-thickness: 2px;
}

.nav__ai {
  color: var(--paprika-dark);
  font-weight: 600;
}

.nav__me {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.nav__me img,
.nav__avatar-fallback {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--line);
}

.nav__avatar-fallback {
  display: grid;
  place-items: center;
  background: var(--saffron);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
}

.nav__toggle {
  display: none;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: none;
  border: 0;
  cursor: pointer;
}

.nav__toggle span {
  width: 22px;
  height: 2px;
  background: var(--crust);
  border-radius: 2px;
}

@media (max-width: 760px) {
  .nav__toggle {
    display: flex;
  }

  .nav__links {
    display: none;
    position: absolute;
    top: 68px;
    left: 0;
    right: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
    padding: 20px;
    background: var(--parchment);
    border-bottom: 1px solid var(--line);
    box-shadow: var(--shadow-md);
  }

  .nav__links--open {
    display: flex;
  }
}
</style>
