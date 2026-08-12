const express = require('express')
const router = express.Router()
const {dbFind, dbRecipes, dbMyRecipes, insertRecipe, handlelike, getMostLiked} = require('../db');
const { isLoggedIn } = require('../google_strategy');
const {upload}  = require('../file_uploud')
const uuid = require('uuid').v4
const path = require('path')
const date = require('../aditional_functions/get_current_date')


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

router.post('/createRecipe',isLoggedIn,generateRecipeId, upload.single('image'), function (req, res) {
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
    ingredients: parseList(req.body.ingredients)
  }

  insertRecipe(recipe).then(()=>{
    res.status(201).json({recipe_id: recipe.recipe_id})
  }).catch(err=>{
    console.log(err)
    res.status(500).json({message: "could not save the recipe"})
  })
})


router.post('/like/:recipe_id',isLoggedIn,(req,res)=>{
  handlelike(req.params.recipe_id, req.user.user_id, req.body.like).then((success)=>{
    if(success){
      res.json({action: success})
    }else{
      res.json({err: "unseccessful"})
    }
  })
})

const picsDir = path.join(__dirname, '..', 'data', 'recipes_pics')
router.get('/data/recipes_pics/:filename', (req, res) => {
    //basename keeps a crafted filename from walking out of the pictures folder
    res.sendFile(path.join(picsDir, path.basename(req.params.filename)), err => {
      if(err){
        res.status(404).end()
      }
    });
  });
router.get('/recipe/:id',(req,res)=>{
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
router.get('/recipes', (req, res) => {
    
    getMostLiked().then((data=>{
      res.json(data)
    }))


  });
router.get('/myRecipes',isLoggedIn,(req,res)=>{
  if(req.user){
    const myId = req.user.user_id
    dbMyRecipes(myId).then((data)=>{
      res.json(data)
    })
  }else{
    res.end()
  }
    
})



module.exports = router