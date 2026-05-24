const mongoose = require('mongoose');

const commentSchema = mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  text: { type: String, required: true, maxlength: 500 },
  date: { type: Date, default: Date.now },
});

const postSchema = mongoose.Schema({
  content: { type: String, required: true, maxlength: 2200 },
  image: { type: String, default: '' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  date: { type: Date, default: Date.now },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
  comments: [commentSchema],
});

module.exports = mongoose.model('post', postSchema);
