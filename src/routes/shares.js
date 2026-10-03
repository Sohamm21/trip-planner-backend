const crypto = require("crypto");
const express = require("express");
const supabase = require("../lib/supabase");
const authenticate = require("../middleware/authenticate");
const { createShareRateLimiter } = require("../middleware/rateLimiter");
const { requireMembership } = require("../lib/tripAccess");
const { epochFromDate } = require("../lib/dateUtils");

// Links never grant admin; only admins manage them.
const SHARE_ROLES = ["viewer", "editor"];

const tripShareRouter = express.Router();
tripShareRouter.use(authenticate);

const shareRouter = express.Router();

function generateShareToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function shapeShareSettings(trip) {
  return {
    enabled: trip.share_enabled,
    role: trip.share_role,
    expiresAt: epochFromDate(trip.share_expires_at),
    token: trip.share_enabled ? trip.share_token : null,
  };
}

// Unknown, disabled and expired tokens all return null.
async function findUsableTrip(token) {
  if (!token) return null;

  const { data: trip } = await supabase
    .from("trips")
    .select(
      "id, name, start_date, end_date, cover_image, created_by, share_role, share_expires_at, share_enabled",
    )
    .eq("share_token", token)
    .eq("share_enabled", true)
    .single();

  if (!trip) return null;
  if (trip.share_expires_at && new Date(trip.share_expires_at) < new Date())
    return null;

  return trip;
}

// GET /api/trips/:id/share — current share settings (admin only)
tripShareRouter.get(
  "/:id/share",
  requireMembership(["admin"]),
  async (req, res) => {
    const { id } = req.params;

    try {
      const { data: trip, error } = await supabase
        .from("trips")
        .select("share_token, share_enabled, share_role, share_expires_at")
        .eq("id", id)
        .single();

      if (error || !trip)
        return res.status(404).json({ error: "Trip not found" });

      res.json({ share: shapeShareSettings(trip) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// PATCH /api/trips/:id/share — enabled, role, expiresAt, regenerate
tripShareRouter.patch(
  "/:id/share",
  requireMembership(["admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { enabled, role, expiresAt, regenerate } = req.body;

    if (role !== undefined && !SHARE_ROLES.includes(role)) {
      return res
        .status(400)
        .json({ error: "role must be 'viewer' or 'editor'" });
    }

    if (
      expiresAt !== undefined &&
      expiresAt !== null &&
      !Number.isFinite(Number(expiresAt))
    ) {
      return res
        .status(400)
        .json({ error: "expiresAt must be an epoch timestamp in ms, or null" });
    }

    try {
      const updates = {};
      if (typeof enabled === "boolean") updates.share_enabled = enabled;
      if (role !== undefined) updates.share_role = role;
      if (expiresAt !== undefined) {
        updates.share_expires_at =
          expiresAt === null ? null : new Date(Number(expiresAt)).toISOString();
      }
      // A token is created the first time a link is enabled, and replaced only on request.
      const { data: current, error: currentError } = await supabase
        .from("trips")
        .select("share_token")
        .eq("id", id)
        .single();

      if (currentError || !current)
        return res.status(404).json({ error: "Trip not found" });

      if (regenerate || (updates.share_enabled && !current.share_token)) {
        updates.share_token = generateShareToken();
      }

      const { data: trip, error } = await supabase
        .from("trips")
        .update(updates)
        .eq("id", id)
        .select("share_token, share_enabled, share_role, share_expires_at")
        .single();

      if (error) return res.status(400).json({ error: error.message });

      res.json({ share: shapeShareSettings(trip) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// Storage paths become public URLs; external URLs pass through.
function publicCoverUrl(path) {
  if (!path || /^https?:\/\//i.test(path)) return path ?? null;
  return supabase.storage.from("trip-covers").getPublicUrl(path).data.publicUrl;
}

// Returns the signed-in user's id from the cookie, or null. Never rejects.
async function optionalUserId(req) {
  const token = req.cookies.access_token;
  if (!token) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  return user?.id ?? null;
}

// GET /api/shares/:token — preview fields, plus isMember for a signed-in caller.
shareRouter.get("/:token", createShareRateLimiter(), async (req, res) => {
  try {
    const trip = await findUsableTrip(req.params.token);
    if (!trip)
      return res
        .status(404)
        .json({ error: "This link is invalid or has expired" });

    const { count } = await supabase
      .from("trip_members")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", trip.id);

    const { data: creator } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", trip.created_by)
      .maybeSingle();

    const userId = await optionalUserId(req);
    let isMember = false;
    if (userId) {
      const { data: membership } = await supabase
        .from("trip_members")
        .select("id")
        .eq("trip_id", trip.id)
        .eq("user_id", userId)
        .maybeSingle();
      isMember = !!membership;
    }

    res.json({
      trip: {
        id: trip.id,
        isMember,
        name: trip.name,
        start_date: epochFromDate(trip.start_date),
        end_date: epochFromDate(trip.end_date),
        cover_image: publicCoverUrl(trip.cover_image),
        role: trip.share_role,
        memberCount: count ?? 0,
        sharedBy: creator?.name ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shares/:token/join — existing members keep their role.
shareRouter.post(
  "/:token/join",
  authenticate,
  createShareRateLimiter(),
  async (req, res) => {
    try {
      const trip = await findUsableTrip(req.params.token);
      if (!trip)
        return res
          .status(404)
          .json({ error: "This link is invalid or has expired" });

      const { data: existing } = await supabase
        .from("trip_members")
        .select("role")
        .eq("trip_id", trip.id)
        .eq("user_id", req.user.id)
        .maybeSingle();

      if (existing) {
        return res.json({
          message: "Already a member",
          tripId: trip.id,
          role: existing.role,
        });
      }

      const { error: memberError } = await supabase
        .from("trip_members")
        .insert({
          trip_id: trip.id,
          user_id: req.user.id,
          role: trip.share_role,
        });

      // 23505: a concurrent join already added this user.
      if (memberError && memberError.code !== "23505") {
        return res.status(400).json({ error: memberError.message });
      }

      res.json({
        message: "Joined trip",
        tripId: trip.id,
        role: trip.share_role,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

module.exports = { tripShareRouter, shareRouter };
