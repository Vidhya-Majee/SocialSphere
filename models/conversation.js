const mongoose = require('mongoose');

const conversationSchema = mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true }],
  participantKey: { type: String, unique: true, required: true },
  lastMessageAt: { type: Date, default: Date.now },
  lastPreview: { type: String, default: '' },
});

conversationSchema.statics.keyFor = function (idA, idB) {
  const ids = [idA.toString(), idB.toString()].sort();
  return `${ids[0]}_${ids[1]}`;
};

conversationSchema.statics.findOrCreate = async function (userIdA, userIdB) {
  const key = this.keyFor(userIdA, userIdB);
  let conv = await this.findOne({ participantKey: key });
  if (!conv) {
    conv = await this.create({
      participants: [userIdA, userIdB],
      participantKey: key,
    });
  }
  return conv;
};

module.exports = mongoose.model('conversation', conversationSchema);
