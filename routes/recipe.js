const express = require('express')
const router = express.Router()
const {dbFind, dbRecipes, dbMyRecipes, insertRecipe, dbDeleteRecipe, dbComments, dbAddComment, dbDeleteComment, handlelike, getMostLiked} = require('../db');
const { isLoggedIn } = require('../google_strategy');
const {upload}  = require('../file_uploud')
const uuid = require('uuid').v4
const path = require('path')
const fs = require('fs')
const date = require('../aditional_functions/get_current_date')
const { normaliseIngredients } = require('../shared/ingredients.mjs')

const picsDir = path.join(__dirname, '..', 'data', 'recipes_pics')


function generateRecipeId(req, res, next){
  const id = parseInt(uuid(),16)
  req.recipeId = id
  next()
}

//the form sends steps and ingredients as a json array in a multipart field
function parseList(value){
  if(Array.isArray(value)){
    return value
  }
  if(!value){
    return []
  }
  try{
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : [String(parsed)]
  }catch(err){
    return [String(value)]
  }
}

router.post('/api/recipes',isLoggedIn,generateRecipeId, upload.single('image'), function (req, res) {
  if(!req.body.name){
    return res.status(400).json({message: "a recipe needs a name"})
  }

  const recipe  = {
    recipe_id: req.recipeId,
    user_id: req.user.user_id,
    name: req.body.name,
    //no photo means the client draws its own placeholder
    photo: req.file ? "/data/recipes_pics/" + req.file.filename : null,
    info: req.body.info,
    recipe: parseList(req.body.recipe),
    date: date(),
    //accepts plain strings too, and fills in an emoji when none was picked
    ingredients: normaliseIngredients(parseList(req.body.ingredients))
  }

  insertRecipe(recipe).then(()=>{
    res.status(201).json({recipe_id: recipe.recipe_id})
  }).catch(err=>{
    console.log(err)
    res.status(500).json({message: "could not save the recipe"})
  })
})


router.delete('/api/recipes/:id',isLoggedIn,(req,res)=>{
  const id = parseInt(req.params.id)
  if(Number.isNaN(id)){
    return res.status(400).json({message: "bad recipe id"})
  }

  dbDeleteRecipe(id, req.user.user_id).then(result=>{
    if(!result.deleted){
      const status = result.reason === 'forbidden' ? 403 : 404
      const message = result.reason === 'forbidden' ? "that is not your recipe" : "recipe not found"
      return res.status(status).json({message})
    }

    //the row is gone either way, a leftover file is not worth failing the request over
    if(result.photo){
      fs.unlink(path.join(picsDir, path.basename(result.photo)),(err)=>{
        if(err && err.code !== 'ENOENT'){
          console.log(err)
        }
      })
    }
    res.json({message: "recipe deleted"})
  }).catch(err=>{
    console.log(err)
    res.status(500).json({message: "could not delete the recipe"})
  })
})

const COMMENT_MAX = 1000

router.get('/api/recipes/:id/comments',(req,res)=>{
  const id = parseInt(req.params.id)
  if(Number.isNaN(id)){
    return res.status(400).json({message: "bad recipe id"})
  }
  dbComments(id).then(comments=>{
    res.json(comments)
  }).catch(err=>{
    console.log(err)
    res.status(500).json({message: "could not load the comments"})
  })
})

router.post('/api/recipes/:id/comments',isLoggedIn,(req,res)=>{
  const id = parseInt(req.params.id)
  const body = String(req.body.body || '').trim()

  if(Number.isNaN(id)){
    return res.status(400).json({message: "bad recipe id"})
  }
  if(!body){
    return res.status(400).json({message: "write something first"})
  }
  if(body.length > COMMENT_MAX){
    return res.status(400).json({message: `keep it under ${COMMENT_MAX} characters`})
  }

  dbFind('recipes','recipe_id',id).then(recipe=>{
    if(!recipe){
      return res.status(404).json({message: "recipe not found"})
    }
    dbAddComment(id, req.user.user_id, body).then(comment=>{
      res.status(201).json(comment)
    }).catch(err=>{
      console.log(err)
      res.status(500).json({message: "could not save the comment"})
    })
  }).catch(err=>{
    console.log(err)
    res.status(500).json({message: "could not save the comment"})
  })
})

router.delete('/api/comments/:comment_id',isLoggedIn,(req,res)=>{
  const id = parseInt(req.params.comment_id)
  if(Number.isNaN(id)){
    return res.status(400).json({message: "bad comment id"})
  }

  dbDeleteComment(id, req.user.user_id).then(result=>{
    if(!result.deleted){
      const status = result.reason === 'forbidden' ? 403 : 404
      const message = result.reason === 'forbidden' ? "that is not your comment" : "comment not found"
      return res.status(status).json({message})
    }
    res.json({message: "comment deleted"})
  }).catch(err=>{
    console.log(err)
    res.status(500).json({message: "could not delete the comment"})
  })
})

router.post('/api/recipes/:recipe_id/like',isLoggedIn,(req,res)=>{
  handlelike(req.params.recipe_id, req.user.user_id, req.body.like).then((success)=>{
    if(success){
      res.json({action: success})
    }else{
      res.json({err: "unseccessful"})
    }
  })
})

router.get('/data/recipes_pics/:filename', (req, res) => {
    //basename keeps a crafted filename from walking out of the pictures folder
    res.sendFile(path.join(picsDir, path.basename(req.params.filename)), err => {
      if(err){
        res.status(404).end()
      }
    });
  });
router.get('/api/recipes', (req, res) => {

    getMostLiked().then((data=>{
      res.json(data)
    }))


  });

//has to stay above /api/recipes/:id, otherwise "mine" is read as an id
router.get('/api/recipes/mine',isLoggedIn,(req,res)=>{
    dbMyRecipes(req.user.user_id).then((data)=>{
      res.json(data)
    }).catch(err=>{
      console.log(err)
      res.status(500).json({message: "could not load your recipes"})
    })
})

router.get('/api/recipes/:id',(req,res)=>{
    const id = parseInt(req.params.id)
    if(Number.isNaN(id)){
      return res.status(400).json({message: "bad recipe id"})
    }
    dbFind('recipes','recipe_id',id).then(recipe => {
        if(!recipe){
          return res.status(404).json({message: "recipe not found"})
        }
        res.json(recipe)
    }).catch(err=>{
      console.log(err)
      res.status(500).json({message: "could not load the recipe"})
    })
})



module.exports = router