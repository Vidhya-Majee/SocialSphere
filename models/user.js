const mongoose = require('mongoose');
const { DEFAULT_PROFILE_PIC } = require('../config/defaults');

const userSchema = mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: String,
  age: Number,
  gender: { type: String, default: 'Not specified' },
  bio: { type: String, default: '', maxlength: 160 },
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'post' }],
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
  savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'post' }],
  profilepic: { type: String, default: DEFAULT_PROFILE_PIC },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('user', userSchema);
