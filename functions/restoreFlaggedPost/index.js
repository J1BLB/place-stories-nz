const { restoreFlaggedPost } = require("../utilities");

module.exports = async function (context, req) {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    const provided = (req.query && req.query.adminPassword) || null;

    if (provided !== adminPassword) {
      return { status: 401, body: "Unauthorized" };
    }

    const postId = req.params.postId;
    const success = restoreFlaggedPost(postId);

    if (!success) {
      return { status: 404, body: "Flagged post not found" };
    }

    return {
      status: 200,
      body: { success: true }
    };
  } catch (err) {
    context.log.error("Error restoring flagged post:", err);
    return {
      status: 500,
      body: "Internal server error: " + (err && err.message ? err.message : "Unknown error")
    };
  }
};
