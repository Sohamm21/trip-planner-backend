const supabase = require('./supabase');

const AVATAR_BUCKET = 'avatars';
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

function avatarPublicUrl(path) {
  if (!path) return null;
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

module.exports = { AVATAR_BUCKET, ALLOWED_AVATAR_TYPES, avatarPublicUrl };
