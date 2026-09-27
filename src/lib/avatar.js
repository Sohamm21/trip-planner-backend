const supabase = require('./supabase');

const AVATAR_BUCKET = 'avatars';
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

function avatarPublicUrl(path) {
  if (!path) return null;
  // Google (and other OAuth providers) give us a full external URL as the default
  // avatar — pass it through as-is rather than treating it as a storage path.
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

module.exports = { AVATAR_BUCKET, ALLOWED_AVATAR_TYPES, avatarPublicUrl };
