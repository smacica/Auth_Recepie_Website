const LocalStrategy = require("passport-local").Strategy;
const { dbFind, dbCreateUser} = require('./db')
const passport = require('passport');
const bcrypt = require('bcrypt');

const hashPassword = (password) => {
  return new Promise((resolve, reject) => {
    bcrypt.hash(password, 10).then((res)=>resolve(res))
  })
}

const strategy = new LocalStrategy(
    {
       usernameField: "username",
       passwordField: "password",
    },
    async function(username, password, done) {
      try{
        const results = await dbFind("users", "username", username)
        console.log(results)
        if (!results){
            return done(null, false, { message: "User does not exist" });
        }
        const isMatch = await bcrypt.compare(password, results.password);
        if (!isMatch){
            return done(null, false, { message: "Password is not valid." });
        }
        console.log("found and verified user")
        return done(null, results);
      }catch(err){
        console.log(err)
      }
    }  
  )

//the vue app calls these as an api, so answer with a status it can act on
//instead of redirecting into the html shell
function isLoggedIn(request, response, done) {
  if (request.user) {
    return done();
  }
  return response.status(401).json({ message: "you are not signed in" })
}

function passportMiddle(req, res, next){
    passport.authenticate("local",
    function(err, user, info){
    if (err){
      return next(err)
    }
    if (info){
        return res.json(info)
    }
    
    req.login(user, next)
    })(req, res, next);
}

function signUpMiddle(req, res, next){
      dbFind('users','username',req.body.email).then(username => {
        if(username){
          res.json({message: "user already exist"})
          res.end()
        }else{
          hashPassword(req.body.password).then(hashedPassword =>{
            console.log(req.body.password+": "+hashedPassword)
            dbCreateUser({
              email: req.body.email,
              password: hashedPassword,
              username: req.body.username,
              prof_pic: req.body.profile_pic,
              bio: "im a web developer who likes cooking"}).then(
              success => {
                next()
              }
            ).catch(err=> console.log(err))
          })      
        }
})           
}
  function addLikesToUser(user){
    return new Promise((resolve, reject) => {
      dbFind('likes','user_id',user.user_id, false, false, 'all').then(givenLikes=>{
        resolve({ 
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          profile_pic: user.profile_pic,
          bio: user.bio,
          likes: givenLikes
        })
      }).catch(err=>{reject(new Error(err))})   
    })
  }

module.exports = {strategy, passportMiddle, signUpMiddle, isLoggedIn, addLikesToUser}