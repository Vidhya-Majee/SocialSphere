const mongoose=require('mongoose')

mongoose.connect('mongodb+srv://vidhyamajee:vm2616@cluster10.o1uj7ay.mongodb.net')

const userSchema=mongoose.Schema({
    username:String,
    name:String,
    email:String,
    password:String,
    age:Number,
    posts:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:'post'
        }
    ],
    profilepic:{
        type:String,
        default:"vm.jpg"
    }
   
})

module.exports=mongoose.model('user',userSchema)