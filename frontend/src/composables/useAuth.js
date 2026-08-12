import { ref, computed } from 'vue'
import { api } from '../api'

// single shared session state - the module scope keeps it a singleton
const user = ref(null)
const ready = ref(false)
let inFlight = null

export const useAuth = () => {
  // resolves once per page load, later callers reuse the same promise
  const load = () => {
    if (!inFlight) {
      inFlight = api
        .getProfile()
        .then(profile => {
          user.value = profile
        })
        .catch(() => {
          user.value = null
        })
        .finally(() => {
          ready.value = true
        })
    }
    return inFlight
  }

  const logout = async () => {
    await api.logout().catch(() => {})
    user.value = null
  }

  // the login response is the profile, so the session starts without a second request
  const signIn = async (email, password) => {
    user.value = await api.login(email, password)
    ready.value = true
    inFlight = Promise.resolve()
    return user.value
  }

  return {
    user,
    ready,
    isLoggedIn: computed(() => Boolean(user.value)),
    load,
    signIn,
    logout
  }
}
