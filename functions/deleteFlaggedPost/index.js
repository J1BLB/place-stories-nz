const { TableClient } = require("@azure/data-tables");
const { loadJSON, saveJSON, deleteFlaggedPost } = require("../utilities");
const memory = require("../inMemoryStore");
const path = require("path");

module.exports = async function (context, req) {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    const provided = (req.query && req.query.adminPassword) || null;

    if (provided !== adminPassword) {
      return { status: 401, body: "Unauthorized" };
    }

    const postId = req.params.postId;
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const tableName = process.env.TABLE_NAME || "GeoPosts";

    context.log(`Attempting to delete post: ${postId}`);

    // Try to delete from database
    let deleted = false;
    if (conn) {
      try {
        const client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
        await client.deleteEntity("posts", postId);
        context.log(`Successfully deleted post ${postId} from table`);
        deleted = true;
      } catch (err) {
        context.log.warn(`Failed to delete from table: ${err.message}`);
      }
    }

    // Also try in-memory store
    try {
      memory.delete(postId);
      context.log(`Deleted post ${postId} from in-memory store`);
    } catch (err) {
      context.log.warn(`Failed to delete from in-memory: ${err.message}`);
    }

    // Mark in flaggedPosts as deleted (regardless of whether table delete succeeded)
    try {
      deleteFlaggedPost(postId);
      context.log(`Marked post ${postId} as deleted in flaggedPosts`);
    } catch (err) {
      context.log.warn(`Failed to mark post as deleted: ${err.message}`);
    }

    return {
      status: 200,
      body: { success: true, message: `Deleted post ${postId}` }
    };
  } catch (err) {
    context.log.error("Error deleting flagged post:", err);
    return {
      status: 500,
      body: "Internal server error: " + (err && err.message ? err.message : "Unknown error")
    };
  }
};
