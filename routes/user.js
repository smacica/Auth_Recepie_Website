const express = require('express');
const passport = require('passport');
const router = express.Router()
const { isLoggedIn, addLikesToUser } = require('../google_strategy')

//in dev the vue app runs on :5173, in prod it is served from this same origin
const clientUrl = process.env.CLIENT_URL || ''

//never send the browser to an address someone put in the query string
function safeNext(value){
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

router.get('/auth', isLoggedIn, function(req, res) {
    res.json({message: 'you are authorized'});
});

//step 1 - hand the browser over to google
router.get('/auth/google', function(req, res, next){
    //remember where the user wanted to go, google only gives us the callback back
    req.session.returnTo = safeNext(req.query.next)
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next)
});

//step 2 - google sends the browser back here with a code
router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: `${clientUrl}/signin?error=auth` }),
    function(req, res) {
        const returnTo = safeNext(req.session.returnTo)
        delete req.session.returnTo
        res.redirect(clientUrl + returnTo)
    }
);

router.post('/logout', function(req, res, next){
    req.logout(function(err) {
        if (err) {
            console.log(err)
            return next(err);
        }
        //drop the session row too, otherwise the old cookie still resolves
        req.session.destroy(function(err) {
            if (err) {
                console.log(err)
            }
            res.clearCookie('connect.sid')
            res.json({message: "you have been logged out"})
        })
    });
});

router.get('/getProfileInfo', isLoggedIn, function(req,res){
    addLikesToUser(req.user).then(user_object=>{
        res.json(user_object)
    }).catch(err=>{
        console.log(err)
        res.status(500).json({message: "could not load the profile"})
    })
})

module.exports = router
