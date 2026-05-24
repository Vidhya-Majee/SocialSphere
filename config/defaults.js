/** Default profile picture filename (in public/images/uploads/) */
const DEFAULT_PROFILE_PIC = 'Screenshot 2026-05-24 115826.png';

const LEGACY_PROFILE_PICS = ['vm.jpg', ''];

function resolveProfilePic(pic) {
  if (!pic || LEGACY_PROFILE_PICS.includes(pic)) return DEFAULT_PROFILE_PIC;
  return pic;
}

function profilePicUrl(pic) {
  return `/images/uploads/${encodeURIComponent(resolveProfilePic(pic))}`;
}

module.exports = {
  DEFAULT_PROFILE_PIC,
  LEGACY_PROFILE_PICS,
  resolveProfilePic,
  profilePicUrl,
};
