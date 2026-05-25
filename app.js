const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const userModel = require('./models/user');
const postModel = require('./models/post');
const upload = require('./config/multerconfig');
const { DEFAULT_PROFILE_PIC, LEGACY_PROFILE_PICS, profilePicUrl } = require('./config/defaults');
const registerMessages = require('./routes/messages');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'polopolopolo';
const PORT = process.env.PORT || 5000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

async function isloggedIn(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login');
  try {
    req.user = jwt.verify(token, JWT_SECRET);

    // Calculate unread messages count for notifications
    try {
      const conversationModel = require('./models/conversation');
      const messageModel = require('./models/message');
      const myConvos = await conversationModel.find({ participants: req.user.userid }).select('_id');
      res.locals.unreadMessagesCount = await messageModel.countDocuments({
        conversation: { $in: myConvos.map((c) => c._id) },
        sender: { $ne: req.user.userid },
        read: false,
      });
    } catch (err) {
      console.error('Error getting unread count:', err);
      res.locals.unreadMessagesCount = 0;
    }

    next();
  } catch {
    res.clearCookie('token');
    res.redirect('/login');
  }
}

async function loadCurrentUser(req) {
  return userModel
    .findOne({ email: req.user.email })
    .populate('followers following', 'username name profilepic')
    .populate('savedPosts');
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString();
}

app.locals.timeAgo = timeAgo;
app.locals.profileImg = profilePicUrl;

function handleUpload(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err.message);
        const dest = (req.body && req.body.redirect) || '/feed?error=upload';
        if (req.path.includes('/messages')) return res.status(400).json({ error: err.message });
        return res.redirect(dest);
      }
      next();
    });
  };
}

// ——— Auth ———
app.get('/', (req, res) => {
  if (req.cookies.token) return res.redirect('/feed');
  res.render('index', { title: 'Join SocialSphere' });
});

app.get('/login', (req, res) => {
  if (req.cookies.token) return res.redirect('/feed');
  res.render('login', { title: 'Log in', error: null });
});

app.post('/register', async (req, res) => {
  const { name, username, email, password, age } = req.body;
  try {
    const existing = await userModel.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      return res.render('index', {
        title: 'Join SocialSphere',
        error: 'Email or username already taken',
        values: req.body,
      });
    }
    const hash = await bcrypt.hash(password, 10);
    await userModel.create({ username, name, email, age, password: hash });
    res.redirect('/login');
  } catch {
    res.render('index', { title: 'Join SocialSphere', error: 'Registration failed', values: req.body });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await userModel.findOne({ email });
  if (!user) return res.render('login', { title: 'Log in', error: 'Invalid email or password' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.render('login', { title: 'Log in', error: 'Invalid email or password' });
  const token = jwt.sign({ email: user.email, userid: user._id }, JWT_SECRET);
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.redirect('/feed');
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

// ——— Feed (everyone's posts — Instagram / Facebook style) ———
app.get('/feed', isloggedIn, async (req, res) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Clean up story posts older than 24 hours
  try {
    const expiredStories = await postModel.find({ isStory: true, date: { $lt: oneDayAgo } });
    if (expiredStories.length > 0) {
      const expiredIds = expiredStories.map(s => s._id);
      await postModel.deleteMany({ _id: { $in: expiredIds } });
      await userModel.updateMany({}, { $pull: { posts: { $in: expiredIds } } });
      console.log(`Cleaned up ${expiredIds.length} expired stories.`);
    }
  } catch (err) {
    console.error('Error cleaning up expired stories:', err);
  }

  const user = await userModel
    .findOne({ email: req.user.email })
    .populate('followers following', 'username name profilepic')
    .populate('savedPosts')
    .populate({
      path: 'posts',
      match: { isStory: true, date: { $gte: oneDayAgo } },
      options: { sort: { date: -1 } },
      select: 'image content date isStory'
    });

  const posts = await postModel
    .find({ isStory: { $ne: true } })
    .sort({ date: -1 })
    .limit(50)
    .populate('user', 'username name profilepic')
    .populate('comments.user', 'username profilepic')
    .populate('likes', 'username');

  const storyUsers = await userModel
    .find({ username: { $exists: true, $nin: ['', null] }, email: { $nin: ['', null] } })
    .select('username name profilepic posts')
    .populate({
      path: 'posts',
      match: { isStory: true, date: { $gte: oneDayAgo } },
      options: { sort: { date: -1 } },
      select: 'image content date isStory'
    })
    .sort({ createdAt: -1 })
    .limit(15);

  const suggestions = await userModel
    .find({
      _id: { $ne: user._id },
      username: { $exists: true, $nin: ['', null] },
    })
    .limit(5)
    .select('username name profilepic followers');

  res.render('feed', {
    title: 'Home',
    user,
    posts,
    storyUsers,
    suggestions,
    active: 'feed',
    query: req.query,
  });
});

// ——— Explore ———
app.get('/explore', isloggedIn, async (req, res) => {
  const user = await loadCurrentUser(req);
  const posts = await postModel
    .find({ isStory: { $ne: true } })
    .sort({ date: -1 })
    .limit(30)
    .populate('user', 'username name profilepic');

  const trending = await userModel
    .find({ _id: { $ne: user._id } })
    .sort({ followers: -1 })
    .limit(12)
    .select('username name profilepic followers');

  res.render('explore', { title: 'Explore', user, posts, trending, active: 'explore' });
});

// ——— Search ———
app.get('/search', isloggedIn, async (req, res) => {
  const user = await loadCurrentUser(req);
  const q = (req.query.q || '').trim();
  let users = [];
  let posts = [];
  if (q.length >= 1) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    users = await userModel
      .find({ $or: [{ username: regex }, { name: regex }] })
      .limit(20)
      .select('username name profilepic bio followers');
    posts = await postModel
      .find({ content: regex, isStory: { $ne: true } })
      .sort({ date: -1 })
      .limit(15)
      .populate('user', 'username name profilepic');
  }
  res.render('search', { title: 'Search', user, q, users, posts, active: 'search' });
});

// ——— Profile ———
app.get('/profile', isloggedIn, async (req, res) => {
  const user = await userModel
    .findOne({ email: req.user.email })
    .populate({
      path: 'posts',
      match: { isStory: { $ne: true } },
      options: { sort: { date: -1 } },
      populate: { path: 'user', select: 'username name profilepic' },
    })
    .populate('followers following', 'username name profilepic')
    .populate('savedPosts');
  res.render('profile', { title: user.username, user, profileUser: user, isOwn: true, active: 'profile' });
});

app.get('/profile/saved', isloggedIn, async (req, res) => {
  const user = await userModel
    .findOne({ email: req.user.email })
    .populate({
      path: 'savedPosts',
      options: { sort: { date: -1 } },
      populate: [
        { path: 'user', select: 'username name profilepic' },
      ],
    });
  const posts = await postModel
    .find({ _id: { $in: user.savedPosts || [] }, isStory: { $ne: true } })
    .sort({ date: -1 })
    .populate('user', 'username name profilepic')
    .populate('comments.user', 'username profilepic')
    .populate('likes', 'username');
  res.render('profile/saved', { title: 'Saved', user, posts, active: 'profile' });
});

app.get('/save/:id', isloggedIn, async (req, res) => {
  const me = await userModel.findOne({ email: req.user.email });
  const postId = req.params.id;
  const exists = me.savedPosts.some((id) => id.toString() === postId);
  if (exists) {
    await userModel.updateOne({ _id: me._id }, { $pull: { savedPosts: postId } });
  } else {
    await userModel.updateOne({ _id: me._id }, { $addToSet: { savedPosts: postId } });
  }
  res.redirect(req.query.next || '/feed');
});

app.get('/u/:username', isloggedIn, async (req, res) => {
  const user = await loadCurrentUser(req);
  const profileUser = await userModel
    .findOne({ username: req.params.username })
    .populate({
      path: 'posts',
      match: { isStory: { $ne: true } },
      options: { sort: { date: -1 } },
      populate: { path: 'user', select: 'username name profilepic' },
    })
    .populate('followers following', 'username name profilepic');
  if (!profileUser) return res.status(404).send('User not found');
  const isOwn = profileUser._id.toString() === user._id.toString();
  const isFollowing = user.following.some(
    (f) => (f._id || f).toString() === profileUser._id.toString()
  );
  res.render('profile', {
    title: profileUser.username,
    user,
    profileUser,
    isOwn,
    isFollowing,
    active: 'profile',
  });
});

app.post('/profile/bio', isloggedIn, async (req, res) => {
  await userModel.findOneAndUpdate({ email: req.user.email }, { bio: (req.body.bio || '').slice(0, 160) });
  res.redirect('/profile');
});

app.post('/profile/personal-info', isloggedIn, async (req, res) => {
  const { age, gender } = req.body;
  await userModel.findOneAndUpdate(
    { email: req.user.email },
    { age: parseInt(age) || undefined, gender: gender || 'Not specified' }
  );
  res.redirect('/about?success=1');
});

app.post('/profile/delete-account', isloggedIn, async (req, res) => {
  try {
    const userId = req.user.userid;
    
    const postModel = require('./models/post');
    const conversationModel = require('./models/conversation');
    const messageModel = require('./models/message');

    // 1. Delete all posts created by the user
    await postModel.deleteMany({ user: userId });

    // 2. Remove user comments on all other posts
    await postModel.updateMany(
      {},
      { $pull: { comments: { user: userId } } }
    );

    // 3. Remove user likes on all other posts
    await postModel.updateMany(
      {},
      { $pull: { likes: userId } }
    );

    // 4. Remove user from followers and following lists of all other users
    await userModel.updateMany(
      {},
      { $pull: { followers: userId, following: userId } }
    );

    // 5. Delete all conversations involving the user and their messages
    const myConvos = await conversationModel.find({ participants: userId }).select('_id');
    const convoIds = myConvos.map(c => c._id);
    await messageModel.deleteMany({ conversation: { $in: convoIds } });
    await conversationModel.deleteMany({ participants: userId });

    // 6. Finally delete the user document
    await userModel.findByIdAndDelete(userId);

    // 7. Clear authentication cookie and redirect
    res.clearCookie('token');
    res.redirect('/');
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).send('Could not delete account. Please try again.');
  }
});

app.get('/profile/upload', isloggedIn, async (req, res) => {
  const user = await loadCurrentUser(req);
  res.render('profileupload', { title: 'Edit photo', user, active: 'profile' });
});

app.get('/settings', isloggedIn, async (req, res) => {
  const user = await loadCurrentUser(req);
  res.render('profile/settings', { title: 'Settings', user, active: 'profile' });
});

app.get('/about', isloggedIn, async (req, res) => {
  const user = await loadCurrentUser(req);
  res.render('about', { title: 'About SocialSphere', user, active: 'profile' });
});

app.post('/upload', isloggedIn, handleUpload('image'), async (req, res) => {
  if (!req.file) return res.redirect('/profile/upload');
  await userModel.findOneAndUpdate({ email: req.user.email }, { profilepic: req.file.filename });
  res.redirect('/profile');
});

// ——— Posts ———
app.post('/post', isloggedIn, handleUpload('image'), async (req, res) => {
  try {
    const author = await userModel.findOne({ email: req.user.email });
    if (!author) return res.redirect('/login');

    const content = (req.body.content || '').trim();
    if (!content && !req.file) {
      return res.redirect((req.body.redirect || '/feed') + '?error=empty');
    }

    const post = await postModel.create({
      user: author._id,
      content: content || 'Shared a photo',
      image: req.file ? req.file.filename : '',
      filter: req.body.filter || 'filter-normal',
      isStory: req.body.isStory === 'true',
    });

    await userModel.updateOne({ _id: author._id }, { $push: { posts: post._id } });
    res.redirect(req.body.redirect || '/feed');
  } catch (err) {
    console.error('Post error:', err);
    res.redirect((req.body.redirect || '/feed') + '?error=post');
  }
});

app.get('/like/:id', isloggedIn, async (req, res) => {
  const post = await postModel.findById(req.params.id);
  if (!post) {
    if (req.query.ajax === '1') return res.status(404).json({ error: 'Post not found' });
    return res.redirect('/feed');
  }
  const uid = req.user.userid.toString();
  const idx = post.likes.findIndex((id) => (id._id || id).toString() === uid);
  if (idx === -1) post.likes.push(req.user.userid);
  else post.likes.splice(idx, 1);
  await post.save();

  if (req.query.ajax === '1') {
    return res.json({
      success: true,
      liked: idx === -1,
      likesCount: post.likes.length,
    });
  }
  res.redirect(req.query.next || '/feed');
});

app.post('/comment/:id', isloggedIn, async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.redirect(req.body.redirect || '/feed');
  await postModel.findByIdAndUpdate(req.params.id, {
    $push: { comments: { user: req.user.userid, text } },
  });
  res.redirect(req.body.redirect || '/feed');
});

app.post('/comment/:postId/delete/:commentId', isloggedIn, async (req, res) => {
  const me = await userModel.findOne({ email: req.user.email });
  const post = await postModel.findById(req.params.postId);
  if (!post) return res.redirect(req.body.redirect || '/feed');
  const comment = post.comments.id(req.params.commentId);
  if (comment && comment.user.toString() === me._id.toString()) {
    comment.deleteOne();
    await post.save();
  }
  res.redirect(req.body.redirect || '/feed');
});

app.get('/edit/:id', isloggedIn, async (req, res) => {
  const user = await loadCurrentUser(req);
  const post = await postModel.findOne({ _id: req.params.id, user: user._id });
  if (!post) return res.redirect('/feed');
  const redirect = req.query.next || '/feed';
  res.render('edit', { title: 'Edit post', user, post, redirect, active: 'feed' });
});

app.post('/update/:id', isloggedIn, handleUpload('image'), async (req, res) => {
  const user = await userModel.findOne({ email: req.user.email });
  const post = await postModel.findOne({ _id: req.params.id, user: user._id });
  if (!post) return res.redirect('/feed');
  const content = (req.body.content || '').trim();
  const updates = { content: content || post.content };
  if (req.file) updates.image = req.file.filename;
  if (req.body.removeImage === '1') updates.image = '';
  await postModel.updateOne({ _id: post._id }, updates);
  res.redirect(req.body.redirect || '/feed');
});

app.post('/delete/:id', isloggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    if (!user) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.redirect('/login');
    }
    const post = await postModel.findOneAndDelete({ _id: req.params.id, user: user._id });
    if (post) {
      await userModel.updateOne({ _id: user._id }, { $pull: { posts: post._id } });
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true });
    }
    res.redirect(req.body.redirect || req.query.next || '/feed');
  } catch (err) {
    console.error('Delete post error:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ error: 'Could not delete post' });
    }
    res.redirect((req.body.redirect || '/feed') + '?error=delete');
  }
});

app.get('/delete/:id', isloggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ email: req.user.email });
    if (!user) return res.redirect('/login');
    const post = await postModel.findOneAndDelete({ _id: req.params.id, user: user._id });
    if (post) {
      await userModel.updateOne({ _id: user._id }, { $pull: { posts: post._id } });
    }
  } catch (err) {
    console.error('Delete post error:', err);
  }
  res.redirect(req.query.next || '/feed');
});

registerMessages(app, { isloggedIn, loadCurrentUser, handleUpload, timeAgo, profilePicUrl });

// ——— Social ———
app.get('/follow/:id', isloggedIn, async (req, res) => {
  const me = await userModel.findOne({ email: req.user.email });
  const targetId = req.params.id;
  if (targetId === me._id.toString()) return res.redirect('/profile');
  const target = await userModel.findById(targetId);
  if (!target) return res.redirect('/feed');

  const iFollow = me.following.some((id) => id.toString() === targetId);
  if (iFollow) {
    me.following = me.following.filter((id) => id.toString() !== targetId);
    target.followers = target.followers.filter((id) => id.toString() !== me._id.toString());
  } else {
    me.following.push(target._id);
    target.followers.push(me._id);
  }
  await me.save();
  await target.save();
  res.redirect(req.query.next || `/u/${target.username}`);
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB connected...');
    const result = await userModel.updateMany(
      {
        $or: [
          { profilepic: { $in: LEGACY_PROFILE_PICS } },
          { profilepic: null },
          { profilepic: { $exists: false } },
        ],
      },
      { $set: { profilepic: DEFAULT_PROFILE_PIC } }
    );
    if (result.modifiedCount) {
      console.log(`Updated ${result.modifiedCount} profile(s) to new default avatar`);
    }
  })
  .catch((err) => console.error(err));

const server = app.listen(PORT, () => console.log(`SocialSphere running on http://localhost:${PORT}`));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Error: Port ${PORT} is already in use. Please terminate the process using this port and restart.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
