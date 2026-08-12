// thin wrapper around fetch - every call carries the session cookie
const request = async (url, options = {}) => {
  const response = await fetch(url, { credentials: 'include', ...options })

  const body = await response.text()
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    parsed = body
  }

  if (!response.ok) {
    // carry the server's own wording through, the forms show it verbatim
    throw Object.assign(new Error(parsed?.message || `Request to ${url} failed`), {
      status: response.status,
      code: parsed?.code
    })
  }

  return parsed
}

const asJson = body => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
})

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

  signup: (email, password) => request('/signup', asJson({ email, password })),
  login: (email, password) => request('/login', asJson({ email, password })),
  resendVerification: email => request('/resend-verification', asJson({ email })),

  getRecipes: async () => (await request('/recipes')).map(normaliseRecipe),
  getMyRecipes: async () => (await request('/myRecipes')).map(normaliseRecipe),
  getRecipe: async id => normaliseRecipe(await request(`/recipe/${id}`)),

  createRecipe: formData => request('/createRecipe', { method: 'POST', body: formData }),
  deleteRecipe: id => request(`/recipe/${id}`, { method: 'DELETE' }),

  rate: (recipeId, like) => request(`/like/${recipeId}`, asJson({ like }))
}
