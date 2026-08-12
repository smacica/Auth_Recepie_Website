<script setup>
import { onMounted } from 'vue'
import AppNav from './components/AppNav.vue'
import AppFooter from './components/AppFooter.vue'
import { useAuth } from './composables/useAuth'

const { load } = useAuth()
onMounted(load)
</script>

<template>
  <div class="shell">
    <AppNav />
    <main class="shell__main">
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.shell__main {
  flex: 1;
  padding-bottom: 72px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
