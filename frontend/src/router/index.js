import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: '/signin', name: 'signin', component: () => import('../views/SignInView.vue') },
  { path: '/recipe/:id', name: 'recipe', component: () => import('../views/RecipeView.vue') },
  {
    path: '/new',
    name: 'new-recipe',
    component: () => import('../views/CreateRecipeView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/generate',
    name: 'generate',
    component: () => import('../views/GenerateRecipeView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/my-recipes',
    name: 'my-recipes',
    component: () => import('../views/MyRecipesView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/ProfileView.vue'),
    meta: { requiresAuth: true }
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach(async to => {
  const { load, isLoggedIn } = useAuth()
  await load()

  if (to.meta.requiresAuth && !isLoggedIn.value) {
    return { name: 'signin', query: { next: to.fullPath } }
  }
  return true
})

export default router
