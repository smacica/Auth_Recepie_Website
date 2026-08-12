<script setup>
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const { user, logout } = useAuth()
const router = useRouter()

const signOut = async () => {
  await logout()
  router.push('/')
}
</script>

<template>
  <div class="page profile">
    <div v-if="user" class="panel profile__card">
      <img
        v-if="user.profile_pic"
        class="profile__avatar"
        :src="user.profile_pic"
        :alt="user.username"
        referrerpolicy="no-referrer"
      />
      <div v-else class="profile__avatar profile__avatar--empty">
        {{ (user.username || '?')[0].toUpperCase() }}
      </div>

      <div class="profile__meta">
        <p class="eyebrow">Signed in with Google</p>
        <h1>{{ user.username }}</h1>
        <p class="muted">{{ user.email }}</p>
        <p v-if="user.bio" class="profile__bio">{{ user.bio }}</p>

        <div class="profile__actions">
          <RouterLink to="/my-recipes" class="btn">My recipes</RouterLink>
          <button class="btn btn--ghost" @click="signOut">Sign out</button>
        </div>
      </div>
    </div>

    <div v-if="user" class="profile__stats">
      <div class="mine__stat panel">
        <strong>{{ user.likes?.length || 0 }}</strong>
        <span class="muted">recipes you rated</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile {
  padding-top: 48px;
  max-width: 780px;
}

.profile__card {
  display: flex;
  gap: 30px;
  align-items: center;
  flex-wrap: wrap;
}

.profile__avatar {
  width: 108px;
  height: 108px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid var(--saffron);
}

.profile__avatar--empty {
  display: grid;
  place-items: center;
  background: var(--saffron);
  color: #fff;
  font-family: var(--serif);
  font-size: 2.4rem;
}

.profile__meta {
  flex: 1;
  min-width: 240px;
}

.profile__meta h1 {
  font-size: 2rem;
  margin-bottom: 2px;
}

.profile__bio {
  margin-top: 12px;
}

.profile__actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}

.profile__stats {
  margin-top: 22px;
}

.mine__stat {
  display: inline-flex;
  flex-direction: column;
  padding: 16px 26px;
}

.mine__stat strong {
  font-family: var(--serif);
  font-size: 1.8rem;
  line-height: 1.1;
}

.mine__stat span {
  font-size: 0.85rem;
}
</style>
