const express = require('express');
const { dbFind } = require('../db');
const router = express.Router()
const {strategy, passportMiddle, signUpMiddle, isLoggedIn, addLikesToUser} = require('../local_strategy')

// middleware that is specific to this router
router.get('/auth',isLoggedIn, function(req, res) {
    res.json({message: 'you are authorized'});
  });
  
router.post('/signUp',signUpMiddle,passportMiddle, function(req, res) {
    try{
        addLikesToUser(req.user).then(user_object=>{
            console.log(user_object)
            res.json(user_object)
        })
    }catch(err){
        console.log(err)
    }
});

router.post('/logout', function(req, res){ 
    req.logout(function(err) {
        console.log('logout')
        if (err) { 
        console.log(err)
        return next(err); 
        }
    });
    res.json({message: "you have been logged out"})
});

router.post('/login',passportMiddle,
function(req, res) {
    try{
    console.log(req.user)
    addLikesToUser(req.user).then(user_object=>{
        res.json(user_object)
    })
    }catch(err){
    console.log(err)
    }
}
);
router.get('/getProfileInfo', isLoggedIn, function(req,res){
    addLikesToUser(req.user).then(user_object=>{
        res.json(user_object)
    }).catch(err=>{
        console.log(err)
        res.status(500).json({message: "could not load the profile"})
    })
})

module.exports = router
