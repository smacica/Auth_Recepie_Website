const uuid = require('uuid').v4
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs')
const path = require('path')

//the data folder is gitignored, so create it before sqlite tries to open the db file
const dataDir = path.join(__dirname, 'data')
fs.mkdirSync(path.join(dataDir, 'recipes_pics'), { recursive: true })
const dbPath = path.join(dataDir, 'main.db')

const schemaQuerry = `
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    profile_pic TEXT,
    bio TEXT
);
CREATE TABLE IF NOT EXISTS recipes (
    recipe_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name TEXT,
    photo TEXT,
    info TEXT,
    recipe TEXT,
    date TEXT,
    ingredients TEXT
);
CREATE TABLE IF NOT EXISTS ranking (
    recipe_id INTEGER PRIMARY KEY REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    likes INTEGER DEFAULT 0,
    dislikes INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS likes (
    like_id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    rating INTEGER
);`

//sqlite cannot add a UNIQUE column with ALTER TABLE, so google_id is kept unique
//through an index instead - that also lets several rows stay NULL
const indexQuerry = `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);`

//brings a database created before google sign in up to the current shape
function migrateUsers(){
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(users);`,(err, columns)=>{
            if(err){
                return reject(new Error(err))
            }
            const names = columns.map(column => column.name)
            const steps = []
            if(!names.includes('google_id')){
                steps.push(`ALTER TABLE users ADD COLUMN google_id TEXT;`)
            }
            //passwords are gone, everyone signs in through google now
            if(names.includes('password')){
                steps.push(`ALTER TABLE users DROP COLUMN password;`)
            }
            if(!steps.length){
                return resolve()
            }
            db.exec(steps.join('\n'),(err)=>{
                if(err){
                    reject(new Error(err))
                }else{
                    console.log('users table migrated to google sign in')
                    resolve()
                }
            })
        })
    })
}

let db = new sqlite3.Database(dbPath, (err) => {

    if(err)
    {
    console.log("Error Occurred - " + err.message);
    }else{
        console.log('sqlite connected')
        db.get("PRAGMA foreign_keys = ON",(err,data)=>{
            if(err){
                console.log(err)
            }
        })
        db.exec(schemaQuerry,(err)=>{
            if(err){
                return console.log(err)
            }
            migrateUsers().then(()=>{
                db.exec(indexQuerry,(err)=>{
                    if(err){
                        console.log(err)
                    }
                })
            }).catch(err=>console.log(err))
        })
    }
})

function handlelike(recipe_id, user_id, likeStatement){
    return new Promise((resolve, reject) => {
        let rankComlumn = []
        if(likeStatement == 1){
            rankComlumn = ['likes','dislikes']
        }else if(likeStatement == 0){
            rankComlumn = ['dislikes', 'likes']
        }else{
            reject(new Error("user tried to put dum thing into request."))
        }

        const findRecordQuery = `SELECT * FROM likes 
        WHERE recipe_id=? AND user_id=?;`
        db.all(findRecordQuery, [recipe_id, user_id],(err,data)=>{
            if(err){
                reject(new Error(err))
            }else if(data.length>0){
                if(data[0].rating == likeStatement){
                    const delQuerry = `DELETE FROM likes WHERE like_id =?;`
                db.run(delQuerry,[data[0].like_id],(err)=>{
                    if(err){
                        reject(new Error(err)) 
                    }else{
                        dbUpdate('ranking', 'recipe_id', recipe_id, rankComlumn[0], '-1').then(()=>{
                            resolve("cancel")
                        })
                    }
                })
                }else{
                    const updateQuery = `UPDATE likes SET rating = ? WHERE like_id = ?`
                    db.run(updateQuery, [likeStatement, data[0].like_id],(err, data)=>{
                        if(err){
                            reject(new Error(err)) 
                        }else{
                            dbUpdate('ranking', 'recipe_id', recipe_id, rankComlumn[0], '+1').then(()=>{
                                dbUpdate('ranking', 'recipe_id', recipe_id, rankComlumn[1], '-1').then(()=>{
                                    resolve("change")
                                })
                            })
        
                        }
                    })
                }
                      
            }else{
                const createQuery = `INSERT INTO likes(recipe_id, user_id, rating)
                VALUES(?, ?, ?)`
                db.run(createQuery, [recipe_id, user_id, likeStatement],(err)=>{
                    if(err){
                        reject(new Error(err)) 
                    }else{
                        dbUpdate('ranking', 'recipe_id', recipe_id, rankComlumn[0], '+1').then(()=>{
                            resolve("add")
                        })
                    }
                })
            }
        })
    })
}

async function getRecipes(data){
    console.log(data)
    let recipes = []
    return new Promise(async(resolve, reject) => {
        //without this the promise never settles on an empty table and the request hangs
        if(data.length == 0){
            return resolve(recipes)
        }
        for(const rank of data){
            const recipe = await dbFind("recipes","recipe_id",rank.recipe_id)
              let recipeWithLike = recipe
              recipeWithLike.likes = rank.likes
              recipeWithLike.dislikes = rank.dislikes
              recipes.push(recipeWithLike)
              //console.log('afterPush: '+recipeWithLike.likes)
              if(recipes.length==data.length){
                resolve(recipes)
              }
          };
        
    })
}

const mostLikedQuerry = `SELECT * FROM ranking ORDER BY likes DESC;`
function getMostLiked(){
    return new Promise((resolve, reject) => {
        db.all(mostLikedQuerry,(err, data)=>{
            if(err){
                reject(new Error(err))
            }else{
                getRecipes(data).then(recipes=>{
                    resolve(recipes)
                })
                
            }
        })
    })
}

const recipeQuerry = `INSERT INTO 
recipes (recipe_id,user_id, name, photo, info, recipe, date, ingredients)
 VALUES(?,?,?,?,?,?,DATE(?),?);`
const recipeRankingQuerry = `INSERT INTO 
ranking (recipe_id, likes, dislikes, views) 
VALUES(?,?,?,?);`
function insertRecipe(recipe){
    return new Promise((resolve, reject) => {
        const id = parseInt(uuid(),16)
        db.run(recipeQuerry ,[recipe.recipe_id,recipe.user_id, recipe.name, recipe.photo, recipe.info, JSON.stringify(recipe.recipe),recipe.date,JSON.stringify(recipe.ingredients) ], (err , data) => {
            if(err){
                reject(new Error(err))      
            }else{
                db.run(recipeRankingQuerry, [recipe.recipe_id, 0, 0, 0],(err, data)=>{
                    if(err){
                        reject(new Error(err))
                    }else{
                        resolve()
                    }
                })
            }
            });
    })
} 

const likeQuerry = `INSERT INTO
 likes (user_id, recipe_id)
 values(?,?);`
function addLike(user, recipe){
    return new Promise((resolve, reject) => {
        db.run(likeQuerry,[user, recipe],(err, data)=>{
            if(err){
                reject(new Error(err))
            }else{
                resolve()
            }
        })
    })
}

const selectQuery = 'SELECT * FROM recipes;'
function dbRecipes(){
    return new Promise((resolve, reject) => {
        db.all(selectQuery , (err , data) => {
            if(err){
                reject(new Error(err))      
            }else{
                resolve(data)
            }
            });
    })
}

async function addLikesToMyRecipes(data){
    let finalResult = []
    return new Promise(async(resolve, reject) => {
        //without this the promise never settles on an empty table and the request hangs
        if(data.length == 0){
            return resolve(finalResult)
        }
        data.forEach(async(recipe)=>{
            const rating = await dbFind('ranking','recipe_id',recipe.recipe_id)
            recipe.likes = rating.likes
            recipe.dislikes = rating.dislikes
            finalResult.push(recipe)
            if(data.length==finalResult.length){
                resolve(finalResult)
              }
        })
    })
}

function dbMyRecipes(user_id){
    return new Promise((resolve, reject) => {
        console.log("starting function")
        dbFind('recipes', 'user_id', user_id, false, false, 'all').then((data, err)=>{
            if(err){
                reject(new Error(err))
            }else{
                addLikesToMyRecipes(data).then(finalData=>{
                    resolve(finalData)
                })  
            }
        })
    })
}

const userCreateQuery = `INSERT INTO users(google_id, username, email, profile_pic, bio) VALUES(?,?,?,?,?)
`
function dbCreateUser(data){
    return new Promise((resolve, reject) => {
        const values = [data.google_id, data.username, data.email, data.profile_pic, data.bio]
        db.run(userCreateQuery ,values, function(err){
            if(err){
                reject(new Error(err))
            }else{
                resolve(this.lastID)
            }
            });
    })
}

//usernames are unique, so a second "Anna" becomes "Anna2", then "Anna3", ...
async function uniqueUsername(preferred){
    const base = (preferred || 'cook').trim().slice(0, 40) || 'cook'
    let candidate = base
    let suffix = 1
    while(await dbFind('users','username',candidate)){
        suffix += 1
        candidate = `${base}${suffix}`
    }
    return candidate
}

//one entry point for google sign in: match on google_id, fall back to the email
//of an older password account, otherwise create the user
async function dbFindOrCreateGoogleUser(profile){
    const byGoogleId = await dbFind('users','google_id',profile.google_id)
    if(byGoogleId){
        return byGoogleId
    }

    if(profile.email){
        const byEmail = await dbFind('users','email',profile.email)
        if(byEmail){
            //link the existing account to google instead of making a duplicate
            await dbUpdate('users','user_id',byEmail.user_id,'google_id',profile.google_id)
            if(profile.profile_pic){
                await dbUpdate('users','user_id',byEmail.user_id,'profile_pic',profile.profile_pic)
            }
            return dbFind('users','user_id',byEmail.user_id)
        }
    }

    const username = await uniqueUsername(profile.username || (profile.email || '').split('@')[0])
    const user_id = await dbCreateUser({
        google_id: profile.google_id,
        username,
        email: profile.email,
        profile_pic: profile.profile_pic,
        bio: 'Just joined EatHub.'
    })
    return dbFind('users','user_id',user_id)
}

function dbFind(table,column, value, column2=false, value2=false, limit = 1){
    return new Promise((resolve, reject) => {
        let findQuerry = `SELECT * FROM ${table} WHERE ${column}=?`
        let values = [value]
        if (column2 && value2){
            values.push(value2)
            findQuerry = `SELECT * FROM ${table} WHERE ${column}=? AND ${column2}=?`
        }
        if(limit != 'all'){
            findQuerry += ` LIMIT ${limit};`
        }
        db.all(findQuerry ,values, (err , data) => {
            if(err){
                reject(new Error(err))      
            }else{
                if(limit == 1){
                    resolve(data[0])
                }else if(limit != 'all'){
                    resolve(data.slice(0,limit))
                }else{
                    resolve(data)
                }               
            }
            });
    })
}
function dbUpdate(table, conditionColumn, conditionValue, setColumn, setValue){
    return new Promise((resolve, reject) => {
        let updateQuery = `UPDATE ${table} 
        SET ${setColumn}= ?
        WHERE ${conditionColumn} = ?;`

        if (setValue[0] == '+' || setValue[0] == '-'){
            const operator = setValue[0];
            setValue = parseInt(setValue.slice(1))
            updateQuery = `UPDATE ${table} 
            SET ${setColumn}= ${setColumn} ${operator} ?
            WHERE ${conditionColumn} = ?;`
        }

        db.run(updateQuery,[setValue, conditionValue],(err, data)=>{
            if(err){
                reject(new Error(err))
            }else{
                resolve()
            }
        })
    })
}
function dbDel(table,column, value, column2=false, value2=false){
    return new Promise((resolve, reject) => {
        let delQuerry = `DELETE FROM ${table} WHERE ${column}=?;`
        let values = [value]
        if (column2 && value2){
            values.push(value2)
            delQuerry = `SELECT * FROM ${table} WHERE ${column}=? AND ${column2}=?
            LIMIT 1;`
        }
        db.run(delQuerry ,values, (err , data) => {
            if(err){
                reject(new Error(err))      
            }else{
                resolve()
            }
            });
    })
}

module.exports = { dbUpdate, dbDel, dbRecipes, dbFind, dbCreateUser, dbFindOrCreateGoogleUser, insertRecipe, dbMyRecipes, addLike, getMostLiked, handlelike }