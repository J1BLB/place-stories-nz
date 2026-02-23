const { TableClient } = require("@azure/data-tables");
const { loadJSON } = require("../utilities");
const path = require("path");
const memory = require("../inMemoryStore");

module.exports = async function (context, req) {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    const provided = (req.query && req.query.adminPassword) || null;

    if (provided !== adminPassword) {
      return { status: 401, body: "Unauthorized" };
    }

    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const tableName = process.env.TABLE_NAME || "GeoPosts";

    const flaggedPath = path.join(__dirname, "..", "flaggedPosts.json");
    const flaggedList = loadJSON(flaggedPath, []).filter(f => !f.deleted && !f.restored);

    // Get details of flagged posts
    let postsMap = {};
    if (conn) {
      try {
        const client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
        await client.createTable().catch(() => {}); // Ensure table exists
        for await (const entity of client.listEntities()) {
          postsMap[entity.RowKey] = {
            text: entity.text || "",
            author: entity.author || "Anonymous",
            latitude: entity.latitude ? parseFloat(entity.latitude) : null,
            longitude: entity.longitude ? parseFloat(entity.longitude) : null
          };
        }
      } catch (err) {
        context.log.warn("Failed to fetch posts from table, using in-memory", err.message);
        const inMemoryPosts = memory.list();
        inMemoryPosts.forEach(p => {
          postsMap[p.id] = p;
        });
      }
    } else {
      const inMemoryPosts = memory.list();
      inMemoryPosts.forEach(p => {
        postsMap[p.id] = p;
      });
    }

    // Enrich flagged posts with details
    const enrichedFlagged = flaggedList.map(f => ({
      ...f,
      post: postsMap[f.postId] || null
    }));

    return {
      status: 200,
      body: enrichedFlagged
    };
  } catch (err) {
    context.log.error("Error getting flagged posts:", err);
    return {
      status: 500,
      body: "Internal server error: " + (err && err.message ? err.message : "Unknown error")
    };
  }
};
