const mongoose = require('mongoose');

const messageSchema = mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
  type: { type: String, enum: ['text', 'image', 'link', 'post'], default: 'text' },
  text: { type: String, default: '', maxlength: 2000 },
  image: { type: String, default: '' },
  linkUrl: { type: String, default: '' },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'post' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('message', messageSchema);
