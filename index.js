require('dotenv').config()
const express = require('express');
var cors = require('cors')
const session = require('express-session')
const passport = require('passport')
const {strategy: googleStrategy} = require('./google_strategy')
const {strategy: localStrategy} = require('./local_strategy')
const app = express();
const {dbFind} = require('./db')
const {sessionConf} = require('./session_config')
const bodyParser = require('body-parser');
const path = require('path');
//routes
const user = require('./routes/user')
const recipe = require('./routes/recipe')

//vite writes the vue app here, `npm run build` inside frontend/
const clientDir = path.join(__dirname, 'frontend', 'dist')
//in dev the vue app runs on its own port, in prod it is served from clientDir
const clientUrl = process.env.CLIENT_URL || ''

passport.use(googleStrategy)
passport.use(localStrategy)
passport.serializeUser((user, done) => {
  done(null, user.user_id);
});
passport.deserializeUser((id, done) => {
  dbFind('users', 'user_id', id)
  .then(user => done(null, user))
  .catch(err => console.log(err))});

//middleware
app.use(cors({ origin: clientUrl || true, credentials: true }))
app.options('*', cors({ origin: clientUrl || true, credentials: true }));
app.use(session(sessionConf));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(clientDir));
app.use('/',user)
app.use('/',recipe)

//an unknown /api path is a mistake, not a page - never answer it with the html shell
app.use('/api', function(req, res) {
  res.status(404).json({ message: 'no such endpoint' });
});

//vue router owns the rest of the urls, so everything else gets index.html
app.get('*', function(req, res) {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.listen(process.env.PORT || 4000, () => {
    console.log('Listening on localhost:4000')
  })
