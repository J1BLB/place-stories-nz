const { TableClient } = require("@azure/data-tables");
const { loadJSON } = require("../utilities");
const path = require("path");
const memory = require("../inMemoryStore");

module.exports = async function (context, req) {
  try {
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const tableName = process.env.TABLE_NAME || "GeoPosts";

    const dataPath = path.join(__dirname, "..", "reports.json");
    const reports = loadJSON(dataPath, []).filter(r => !r.deleted);

    // Try to get full post details from database
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

    // Enrich reports with post details
    const enrichedReports = reports.map(r => ({
      ...r,
      post: postsMap[r.postId] || null
    }));

    return {
      status: 200,
      body: enrichedReports
    };
  } catch (err) {
    context.log.error("Error getting user reports:", err);
    return {
      status: 500,
      body: "Internal server error: " + (err && err.message ? err.message : "Unknown error")
    };
  }
};
