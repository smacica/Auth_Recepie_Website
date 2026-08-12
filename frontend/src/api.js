// thin wrapper around fetch - every call carries the session cookie
const request = async (url, options = {}) => {
  const response = await fetch(url, { credentials: 'include', ...options })

  if (response.status === 401) {
    throw Object.assign(new Error('Not signed in'), { status: 401 })
  }
  if (!response.ok) {
    throw Object.assign(new Error(`Request to ${url} failed`), { status: response.status })
  }

  const body = await response.text()
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

// recipe + ingredients come back as JSON strings from sqlite. rows written before
// the upload fix are encoded twice, so unwrap until an array falls out.
const parseList = (value, depth = 0) => {
  if (Array.isArray(value)) return value
  if (!value) return []
  if (depth > 2) return [String(value)]

  try {
    return parseList(JSON.parse(value), depth + 1)
  } catch {
    return [String(value)]
  }
}

const normaliseRecipe = recipe => ({
  ...recipe,
  steps: parseList(recipe.recipe),
  ingredients: parseList(recipe.ingredients),
  likes: recipe.likes ?? 0,
  dislikes: recipe.dislikes ?? 0
})

export const api = {
  getProfile: () => request('/getProfileInfo'),
  logout: () => request('/logout', { method: 'POST' }),

  getRecipes: async () => (await request('/recipes')).map(normaliseRecipe),
  getMyRecipes: async () => (await request('/myRecipes')).map(normaliseRecipe),
  getRecipe: async id => normaliseRecipe(await request(`/recipe/${id}`)),

  createRecipe: formData => request('/createRecipe', { method: 'POST', body: formData }),

  rate: (recipeId, like) =>
    request(`/like/${recipeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ like })
    })
}
