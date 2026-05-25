const mongoose = require('mongoose');
require('dotenv').config();
const userModel = require('../models/user');
const postModel = require('../models/post');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB...');

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get users who have posts
  const users = await userModel.find({}).populate({
    path: 'posts',
    match: { isStory: true, date: { $gte: oneDayAgo } },
    options: { sort: { date: -1 } },
    select: 'image content date isStory'
  });

  console.log('Found users:', users.length);
  for (const u of users) {
    const activePosts = u.posts || [];
    console.log(`User: ${u.username}, Active stories count: ${activePosts.length}`);
    if (activePosts.length > 0) {
      console.log('Stories:', activePosts);
      const slides = activePosts.map(p => ({
        id: p._id.toString(),
        image: p.image ? "/images/uploads/" + encodeURIComponent(p.image) : "",
        content: p.content || ""
      }));
      console.log('Serialized Slides:', JSON.stringify(slides));
    }
  }

  await mongoose.disconnect();
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
