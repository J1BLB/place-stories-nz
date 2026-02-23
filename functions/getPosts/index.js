const { TableClient } = require("@azure/data-tables");
const memory = require("../inMemoryStore");
const { getFlaggedPostIds } = require("../utilities");

module.exports = async function (context, req) {
  const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  const tableName = process.env.TABLE_NAME || "GeoPosts";

  // Get flagged post IDs to filter them out
  let flaggedIds = [];
  try {
    flaggedIds = getFlaggedPostIds();
  } catch (err) {
    context.log.warn('Error loading flagged posts, proceeding without filtering', err && err.message);
  }

  // If no connection configured, or if Table operations fail, fall back to in-memory store
  if (!conn) {
    const allPosts = memory.list();
    const filtered = allPosts.filter(p => !flaggedIds.includes(p.id));
    context.res = {
      status: 200,
      body: filtered
    };
    return;
  }

  let client;
  try {
    client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
  } catch (e) {
    context.log.warn('TableClient init failed, using in-memory store', e && e.message);
    const allPosts = memory.list();
    const filtered = allPosts.filter(p => !flaggedIds.includes(p.id));
    context.res = {
      status: 200,
      body: filtered
    };
    return;
  }

  const items = [];
  try {
    for await (const entity of client.listEntities()) {
      // Skip flagged posts
      if (!flaggedIds.includes(entity.rowKey)) {
        items.push({
          id: entity.rowKey,
          text: entity.text || "",
          author: entity.author || "Anonymous",
          latitude: entity.latitude ? parseFloat(entity.latitude) : null,
          longitude: entity.longitude ? parseFloat(entity.longitude) : null,
          partition: entity.partitionKey
        });
      }
    }

    context.res = {
      status: 200,
      body: items
    };
  } catch (err) {
    context.log.warn('Table listing failed, using in-memory store', err && err.message);
    const allPosts = memory.list();
    const filtered = allPosts.filter(p => !flaggedIds.includes(p.id));
    context.res = {
      status: 200,
      body: filtered
    };
  }
};
