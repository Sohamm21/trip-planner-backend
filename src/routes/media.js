const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');
const { requireMembership } = require('../lib/tripAccess');
const { epochFromDate } = require('../lib/dateUtils');
const { parseJsonQuery, applyFilters } = require('../lib/queryFilters');

const MEDIA_MAX_FILES = 10;
const MEDIA_MAX_PER_USER = 20; // per trip
const MEDIA_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour, matches trip-covers
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MEDIA_FILTER_FIELDS = { uploadedBy: 'uploaded_by' }; // public key -> real column

router.use(authenticate);

const MEDIA_SELECT = 'id, trip_id, storage_path, caption, content_type, file_size_bytes, uploaded_by, created_at, profiles(name, email)';

// uploaded_by is a user id, but the frontend's filter UI shows members by
// email, so `uploadedBy` filter values arrive as emails. Resolves them to
// the matching profile's id before applyFilters compares them against the
// raw column. An email with no matching profile is left as-is — it can
// never equal a real uuid, so that filter just degrades to "no match"
// rather than erroring the whole request.
async function resolveUploadedByEmails(filters) {
  if (!Array.isArray(filters) || filters.length === 0) return filters;

  const emails = new Set();
  filters.forEach((f) => {
    if (f.key !== 'uploadedBy') return;
    (Array.isArray(f.value) ? f.value : [f.value]).forEach((v) => {
      if (typeof v === 'string') emails.add(v);
    });
  });

  if (emails.size === 0) return filters;

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email')
    .in('email', Array.from(emails));

  if (error) throw new Error(error.message);

  const idByEmail = new Map((profiles || []).map((p) => [p.email, p.id]));

  return filters.map((f) => {
    if (f.key !== 'uploadedBy') return f;

    if (Array.isArray(f.value)) {
      return { ...f, value: f.value.map((v) => idByEmail.get(v)).filter(Boolean) };
    }

    return { ...f, value: idByEmail.get(f.value) ?? f.value };
  });
}

function shapeMedia(row, signedUrl) {
  return {
    id: row.id,
    tripId: row.trip_id,
    url: signedUrl,
    caption: row.caption,
    contentType: row.content_type,
    fileSizeBytes: row.file_size_bytes,
    uploadedBy: row.uploaded_by
      ? { id: row.uploaded_by, name: row.profiles?.name ?? null, email: row.profiles?.email ?? null }
      : null, // account deleted
    createdAt: epochFromDate(row.created_at),
  };
}

// Mints signed upload URLs — files go straight to Storage, never through this server.
router.post('/:id/media/upload-urls', requireMembership(['admin', 'editor']), async (req, res) => {
  const { id } = req.params;
  const count = parseInt(req.body.count, 10);

  if (!count || count < 1 || count > MEDIA_MAX_FILES) {
    return res.status(400).json({ error: `count must be between 1 and ${MEDIA_MAX_FILES}` });
  }

  try {
    const { count: existingCount, error: countError } = await supabase
      .from('media')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', id)
      .eq('uploaded_by', req.user.id);

    if (countError) return res.status(400).json({ error: countError.message });

    if ((existingCount ?? 0) + count > MEDIA_MAX_PER_USER) {
      const remaining = Math.max(MEDIA_MAX_PER_USER - (existingCount ?? 0), 0);
      return res.status(400).json({
        error: `You can upload up to ${MEDIA_MAX_PER_USER} images per trip. You have ${remaining} left.`,
      });
    }

    const uploads = [];

    for (let i = 0; i < count; i++) {
      const storagePath = `${id}/${Date.now()}-${i}`; // no extension needed, Storage keys off Content-Type

      const { data, error } = await supabase.storage.from('trip-media').createSignedUploadUrl(storagePath);

      if (error) return res.status(400).json({ error: error.message });

      uploads.push({ storagePath: data.path, signedUrl: data.signedUrl, token: data.token });
    }

    res.json({ uploads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Records files the client already uploaded to Storage. Size/type come from Storage's
// own listing, not the client, so a caller can't lie about what it actually uploaded.
router.post('/:id/media/confirm', requireMembership(['admin', 'editor']), async (req, res) => {
  const { id } = req.params;
  const { storagePaths, caption } = req.body;

  if (!Array.isArray(storagePaths) || storagePaths.length === 0) {
    return res.status(400).json({ error: 'storagePaths is required' });
  }

  // block confirming a path that belongs to a different trip
  const invalidPath = storagePaths.find((p) => !p.startsWith(`${id}/`));
  if (invalidPath) {
    return res.status(400).json({ error: `storagePath does not belong to this trip: ${invalidPath}` });
  }

  try {
    const { data: listing, error: listError } = await supabase.storage.from('trip-media').list(id); // one call for the whole batch

    if (listError) return res.status(400).json({ error: listError.message });

    const byName = new Map((listing || []).map((f) => [`${id}/${f.name}`, f]));

    const uploaded = [];
    const failed = [];

    for (const storagePath of storagePaths) {
      const file = byName.get(storagePath);

      if (!file) {
        failed.push({ storagePath, error: 'Upload not found in storage' });
        continue;
      }

      const { data: row, error: insertError } = await supabase
        .from('media')
        .insert({
          trip_id: id,
          storage_path: storagePath,
          caption: caption || null,
          content_type: file.metadata?.mimetype || 'application/octet-stream',
          file_size_bytes: file.metadata?.size || 0,
          uploaded_by: req.user.id,
        })
        .select(MEDIA_SELECT)
        .single();

      if (insertError) {
        failed.push({ storagePath, error: insertError.message });
        continue;
      }

      uploaded.push(row);
    }

    if (uploaded.length === 0) {
      return res.status(400).json({ error: 'All uploads failed to confirm', failed });
    }

    // batch-sign all paths in one call rather than one createSignedUrl per row
    const paths = uploaded.map((r) => r.storage_path);
    const { data: signed } = await supabase.storage.from('trip-media').createSignedUrls(paths, MEDIA_URL_EXPIRY_SECONDS);
    const urlByPath = new Map((signed || []).map((s) => [s.path, s.error ? null : s.signedUrl]));

    res.status(201).json({
      media: uploaded.map((row) => shapeMedia(row, urlByPath.get(row.storage_path) ?? null)),
      ...(failed.length ? { failed } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips/:id/media — any member (including viewer). Paginated + filterable via
// ?jsonQuery={"page":1,"limit":20,"filters":[{"key":"uploadedBy","operator":"eq","value":"someone@example.com"}]}
// (see lib/queryFilters.js) — uploadedBy takes an email; resolved to the underlying user id below.
router.get('/:id/media', requireMembership(), async (req, res) => {
  const { id } = req.params;

  const { jsonQuery, error: queryError } = parseJsonQuery(req);
  if (queryError) return res.status(400).json({ error: queryError });

  const page = Math.max(parseInt(jsonQuery.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(jsonQuery.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  try {
    let query = supabase.from('media').select(MEDIA_SELECT, { count: 'exact' }).eq('trip_id', id);

    try {
      const resolvedFilters = await resolveUploadedByEmails(jsonQuery.filters);
      query = applyFilters(query, resolvedFilters, MEDIA_FILTER_FIELDS);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const from = (page - 1) * limit;
    const { data: rows, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) return res.status(400).json({ error: error.message });

    // batch-sign this page's paths in one call
    const paths = rows.map((r) => r.storage_path);
    const { data: signed } = paths.length
      ? await supabase.storage.from('trip-media').createSignedUrls(paths, MEDIA_URL_EXPIRY_SECONDS)
      : { data: [] };
    const urlByPath = new Map((signed || []).map((s) => [s.path, s.error ? null : s.signedUrl]));

    const total = count ?? 0;
    res.json({
      media: rows.map((row) => shapeMedia(row, urlByPath.get(row.storage_path) ?? null)),
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id/media/:mediaId — the uploader, or any trip admin.
router.delete('/:id/media/:mediaId', requireMembership(), async (req, res) => {
  const { id, mediaId } = req.params;

  try {
    const { data: media, error } = await supabase
      .from('media')
      .select('id, storage_path, uploaded_by')
      .eq('id', mediaId)
      .eq('trip_id', id)
      .single();

    if (error || !media) return res.status(404).json({ error: 'Media not found' });

    // only the uploader or a trip admin may delete
    const isUploader = media.uploaded_by === req.user.id;
    const isAdmin = req.membership.role === 'admin';

    if (!isUploader && !isAdmin) {
      return res.status(403).json({ error: 'Only the uploader or a trip admin can delete this image' });
    }

    const { error: deleteError } = await supabase.from('media').delete().eq('id', mediaId);

    if (deleteError) return res.status(400).json({ error: deleteError.message });

    // best-effort — the DB row is already gone either way
    const { error: storageError } = await supabase.storage.from('trip-media').remove([media.storage_path]);
    if (storageError) {
      console.warn(`media.js: failed to remove storage object ${media.storage_path}: ${storageError.message}`);
    }

    res.status(200).json({ message: 'Media deleted', id: mediaId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
