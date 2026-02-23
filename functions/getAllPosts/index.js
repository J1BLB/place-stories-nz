const { TableClient } = require("@azure/data-tables");
const memory = require("../inMemoryStore");

module.exports = async function (context, req) {
  const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  const tableName = process.env.TABLE_NAME || "GeoPosts";

  // If no connection configured, fall back to in-memory store
  if (!conn) {
    const allPosts = memory.list();
    context.res = {
      status: 200,
      body: allPosts
    };
    return;
  }

  let client;
  try {
    client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
  } catch (e) {
    context.log.warn('TableClient init failed, using in-memory store', e && e.message);
    const allPosts = memory.list();
    context.res = {
      status: 200,
      body: allPosts
    };
    return;
  }

  const items = [];
  try {
    for await (const entity of client.listEntities()) {
      items.push({
        id: entity.rowKey,
        text: entity.text || "",
        author: entity.author || "Anonymous",
        latitude: entity.latitude ? parseFloat(entity.latitude) : null,
        longitude: entity.longitude ? parseFloat(entity.longitude) : null,
        partition: entity.partitionKey
      });
    }

    context.res = {
      status: 200,
      body: items
    };
  } catch (err) {
    context.log.warn('Table listing failed, using in-memory store', err && err.message);
    const allPosts = memory.list();
    context.res = {
      status: 200,
      body: allPosts
    };
  }
};
