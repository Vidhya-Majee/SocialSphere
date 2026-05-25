const conversationModel = require('../models/conversation');
const messageModel = require('../models/message');
const userModel = require('../models/user');
const postModel = require('../models/post');

function linkFromText(text) {
  const match = (text || '').trim().match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : '';
}

module.exports = function registerMessages(app, deps) {
  const { isloggedIn, loadCurrentUser, handleUpload, timeAgo, profilePicUrl } = deps;

  async function getMe(req) {
    return userModel.findOne({ email: req.user.email });
  }

  app.get('/messages', isloggedIn, async (req, res) => {
    try {
      const user = await loadCurrentUser(req);
      if (!user) return res.redirect('/login');

      const convos = await conversationModel
        .find({ participants: user._id })
        .sort({ lastMessageAt: -1 })
        .populate('participants', 'username name profilepic');

      const threads = (await Promise.all(
        convos.map(async (c) => {
          const other = c.participants.find((p) => p && p._id.toString() !== user._id.toString());
          if (!other) return null;
          const unreadCount = await messageModel.countDocuments({
            conversation: c._id,
            sender: other._id,
            read: false,
          });
          return { conversation: c, other, unreadCount };
        })
      )).filter(Boolean);

      const friends = await userModel
        .find({
          _id: { $ne: user._id },
          username: { $exists: true, $nin: ['', null] },
          email: { $exists: true, $nin: ['', null] },
        })
        .select('username name profilepic')
        .sort({ username: 1 })
        .limit(50);

      res.render('messages/inbox', {
        title: 'Messages',
        user,
        threads,
        friends,
        active: 'messages',
        query: req.query,
      });
    } catch (err) {
      console.error('Messages inbox error:', err);
      res.status(500).send('Could not load messages. Please restart the server and try again.');
    }
  });

  app.get('/messages/with/:username', isloggedIn, async (req, res) => {
    try {
      const user = await loadCurrentUser(req);
      if (!user) return res.redirect('/login');

      const other = await userModel.findOne({ username: req.params.username });
      if (!other) return res.status(404).send('User not found');
      if (other._id.toString() === user._id.toString()) return res.redirect('/messages');

      const conversation = await conversationModel.findOrCreate(user._id, other._id);

      // Mark received messages in this conversation as read
      await messageModel.updateMany(
        { conversation: conversation._id, sender: other._id, read: false },
        { $set: { read: true } }
      );

      const messages = await messageModel
        .find({ conversation: conversation._id })
        .sort({ createdAt: 1 })
        .populate('sender', 'username profilepic')
        .populate({ path: 'post', populate: { path: 'user', select: 'username profilepic' } })
        .limit(200);

      let sharePost = null;
      if (req.query.share) {
        sharePost = await postModel
          .findById(req.query.share)
          .populate('user', 'username profilepic');
      }

      res.render('messages/chat', {
        title: other.username,
        user,
        other,
        conversation,
        messages,
        sharePost,
        active: 'messages',
        timeAgo,
        profileImg: profilePicUrl,
      });
    } catch (err) {
      console.error('Chat error:', err);
      res.status(500).send('Could not open chat. Please restart the server and try again.');
    }
  });

  app.get('/api/messages/:conversationId', isloggedIn, async (req, res) => {
    const me = await getMe(req);
    const conv = await conversationModel.findById(req.params.conversationId);
    if (!conv || !conv.participants.some((p) => p.toString() === me._id.toString())) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Mark incoming messages as read during polling
    const otherId = conv.participants.find((p) => p.toString() !== me._id.toString());
    if (otherId) {
      await messageModel.updateMany(
        { conversation: conv._id, sender: otherId, read: false },
        { $set: { read: true } }
      );
    }

    const after = req.query.after ? new Date(req.query.after) : null;
    const query = { conversation: conv._id };
    if (after && !isNaN(after.getTime())) query.createdAt = { $gt: after };

    const messages = await messageModel
      .find(query)
      .sort({ createdAt: 1 })
      .populate('sender', 'username profilepic')
      .populate({ path: 'post', populate: { path: 'user', select: 'username profilepic' } });

    res.json({
      messages: messages.map((m) => ({
        _id: m._id,
        type: m.type,
        text: m.text,
        image: m.image,
        linkUrl: m.linkUrl,
        post: m.post,
        sender: m.sender,
        createdAt: m.createdAt,
      })),
    });
  });

  app.post('/messages/send', isloggedIn, handleUpload('image'), async (req, res) => {
    try {
      const me = await getMe(req);
      const { conversationId, toUsername, text, postId } = req.body;
      let conv;
      let other;

      if (conversationId) {
        conv = await conversationModel.findById(conversationId);
        if (!conv || !conv.participants.some((p) => p.toString() === me._id.toString())) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        other = await userModel.findOne({
          _id: { $in: conv.participants, $ne: me._id },
        });
      } else if (toUsername) {
        other = await userModel.findOne({ username: toUsername });
        if (!other) return res.status(404).json({ error: 'User not found' });
        conv = await conversationModel.findOrCreate(me._id, other._id);
      } else {
        return res.status(400).json({ error: 'Missing recipient' });
      }

      const body = (text || '').trim();
      let type = 'text';
      let linkUrl = '';
      let post = null;
      let image = '';

      if (postId) {
        type = 'post';
        post = await postModel.findById(postId);
        if (!post) return res.status(404).json({ error: 'Post not found' });
      } else if (req.file) {
        type = 'image';
        image = req.file.filename;
      } else if (linkFromText(body)) {
        type = 'link';
        linkUrl = linkFromText(body);
      } else if (!body) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
          return res.status(400).json({ error: 'Empty message' });
        }
        return res.redirect(`/messages/with/${other.username}`);
      }

      const preview =
        type === 'image'
          ? '📷 Photo'
          : type === 'post'
            ? '📎 Shared a post'
            : type === 'link'
              ? '🔗 Link'
              : body.slice(0, 80);

      const msg = await messageModel.create({
        conversation: conv._id,
        sender: me._id,
        type,
        text: body,
        image,
        linkUrl,
        post: post ? post._id : undefined,
      });

      await conversationModel.updateOne(
        { _id: conv._id },
        { lastMessageAt: new Date(), lastPreview: preview }
      );

      const wantsJson =
        req.headers.accept && req.headers.accept.includes('application/json');
      if (wantsJson || req.xhr) {
        const populated = await messageModel
          .findById(msg._id)
          .populate('sender', 'username profilepic')
          .populate({ path: 'post', populate: { path: 'user', select: 'username profilepic' } });
        return res.json({ ok: true, message: populated });
      }
      res.redirect(`/messages/with/${other.username}`);
    } catch (err) {
      console.error('Send message error:', err);
      res.status(500).json({ error: 'Could not send message' });
    }
  });
};
