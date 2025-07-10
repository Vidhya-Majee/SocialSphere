const express=require('express')
const app=express()
const dotenv = require('dotenv');
//require('dotenv').config({ silent: true });

const path=require('path')
const userModel=require('./models/user')
const postModel=require('./models/post')
const user = require('./models/user')
const post = require('./models/post')
const upload=require('./config/multerconfig')

const bcrypt=require('bcrypt')
const jwt=require('jsonwebtoken')
const cookieParser = require('cookie-parser')

app.set('view engine','ejs')
app.use(express.json())
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,'public')));
app.use(cookieParser())



app.get('/',function (req,res) {
    
    res.render('index')
 
})


app.get('/profile/upload',function (req,res) {
    
    res.render('profileupload')
})

app.post('/upload',isloggedIn,upload.single('image'),async function (req,res) {
    
  let user=  await userModel.findOne({email: req.user.email})
  user.profilepic=req.file.filename;
  await user.save();
   res.redirect('/profile');
})

app.get('/login',function (req,res) {
    
    res.render('login')
})

app.get('/profile', isloggedIn,async  (req, res) =>{
 let user=  await userModel.findOne({email: req.user.email}).populate('posts')
   
    res.render('profile',{user})
});

app.get('/like/:id', isloggedIn,async  (req, res) =>{
 let post=  await postModel.findOne({_id: req.params.id}).populate('user')



 if (post.likes.indexOf(req.user.userid) === -1) {
    post.likes.push(req.user.userid);
  } else {
    post.likes.splice(post.likes.indexOf(req.user.userid), 1);
  }

  await post.save();
  res.redirect('/profile');



});



app.get('/edit/:id', isloggedIn,async  (req, res) =>{
 let post=  await postModel.findOne({_id: req.params.id}).populate('user')

res.render("edit",{post})
});

app.post('/update/:id', isloggedIn,async  (req, res) =>{
 let post=  await postModel.findOneAndUpdate({_id: req.params.id},{content: req.body.content})

res.redirect('/profile')
});

app.get('/delete/:id', isloggedIn,async  (req, res) =>{
 let post=  await postModel.findOneAndDelete({_id: req.params.id})

res.redirect('/profile')
});



app.post('/post', isloggedIn,async  (req, res) =>{
 let user=  await userModel.findOne({email: req.user.email})
 let {content}=req.body
 let post=await postModel.create({
    user:user._id,
   content,
   
 })
  user.posts.push(post._id)
  await user.save();
  res.redirect('/profile')
});



app.post('/register',async (req,res) =>{
   let {name,username,email,password,age}=req.body
 
    let user=await userModel.findOne({email})
    if(user) return res.status(500).send("User already registered")
     

        bcrypt.genSalt(10,(err,salt)=>{
             bcrypt.hash(password,salt,async (err,hash)=>{
                  let user=   await userModel.create({
                username,
                name,
                email,
                age,
                password:hash,
             });
           let token=  jwt.sign({email:email,userid:user._id},'polopolopolo')
           res.cookie('token',token)
           //res.send('registered...')
           res.redirect('/login')

        })
    })
})
        
app.post('/login',async (req,res) =>{
       let {email,password}=req.body
  
        let user=await userModel.findOne({email})
    if(!user) return res.status(500).send("Something went wrong...")

        bcrypt.compare(password,user.password,function (err,result) {
            if(result){ 
                let token=  jwt.sign({email:email,userid:user._id},'polopolopolo')
           res.cookie('token',token)
           res.status(200).redirect('/profile')
            }
                else res.redirect('/login')
        })
})            

app.get('/logout',function (req,res) {
    res.cookie('token','')
    res.redirect('/login')
})

function isloggedIn(req,res,next) {
  if(req.cookies.token==="") res.send('You must be logged in')
    
    else{
      let data=  jwt.verify(req.cookies.token,'polopolopolo')
      req.user=data

    }
    next()
}
// function isloggedIn(req, res, next) {
//     const token = req.cookies.token;

//     if (!token || token === "") {
//         return res.status(401).send('You must be logged in');
//     }

//     try {
//         const data = jwt.verify(token, 'polopolopolo');
//         req.user = data;
//         next();
//     } catch (err) {
//         return res.status(403).send('Invalid token');
//     }
// }




//app.listen(5000) 



const mongoose = require('mongoose');
require('dotenv').config({ silent: true });


// Use environment variables
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Connect to MongoDB
mongoose.connect(MONGODB_URI, 
  { useNewUrlParser: true, 
    useUnifiedTopology: true
   })
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error(err));

// Rest of your app code...
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
