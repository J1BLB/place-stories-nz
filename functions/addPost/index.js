const { TableClient } = require("@azure/data-tables");
const { getClientIP, checkRateLimit, recordPost, detectSpam, addFlaggedPost } = require("../utilities");

module.exports = async function (context, req) {
  try {
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const tableName = process.env.TABLE_NAME || "GeoPosts";

    if (!conn) {
      context.res = { status: 500, body: "TABLE_CONNECTION_STRING not configured" };
      return;
    }

    let client;
    const memory = require("../inMemoryStore");
    try {
      client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
      // Ensure table exists
      await client.createTable().catch(() => {}); // Ignore if table already exists
    } catch (e) {
      context.log.warn('TableClient init failed, using in-memory store', e && e.message);
      client = null;
    }

    const body = req.body || {};
    if (!body.text) {
      context.res = { status: 400, body: "Missing required field: text" };
      return;
    }

    // Check rate limit (disabled for local development)
    // const ip = getClientIP(req);
    // if (checkRateLimit(ip)) {
    //   context.res = { status: 429, body: "Rate limit exceeded: maximum 1 post per day per IP" };
    //   return;
    // }

    // Check for spam
    const detectedKeyword = detectSpam(body.text) || detectSpam(body.author);

    const rowKey = Date.now().toString();
    const entity = {
      PartitionKey: body.partition || "posts",
      RowKey: rowKey,
      text: body.text,
      author: body.author || "Anonymous",
      latitude:
        body.latitude != null ? Number(body.latitude).toFixed(3) : undefined,
      longitude:
        body.longitude != null ? Number(body.longitude).toFixed(3) : undefined
    };

    if (!client) {
      const row = memory.add(entity);
      if (detectedKeyword) {
        addFlaggedPost(row.id, `Spam keyword detected: "${detectedKeyword}"`);
      }
      // recordPost(ip); // Disabled for local development
      const responseBody = { id: row.id };
      if (detectedKeyword) {
        responseBody.flagged = true;
        responseBody.reason = `Spam keyword detected: "${detectedKeyword}"`;
      }
      context.res = {
        status: 201,
        body: responseBody
      };
      return;
    }

    // remove undefined props
    Object.keys(entity).forEach(k => entity[k] === undefined && delete entity[k]);

    await client.createEntity(entity);
    // recordPost(ip); // Disabled for local development

    const responseBody = { id: rowKey };
    if (detectedKeyword) {
      responseBody.flagged = true;
      responseBody.reason = `Spam keyword detected: "${detectedKeyword}"`;
    }
    context.res = {
      status: 201,
      body: responseBody
    };
  } catch (err) {
    context.log.error('Unhandled error in addPost:', err);
    context.res = {
      status: 500,
      body: "Internal server error: " + (err && err.message ? err.message : "Unknown error")
    };
  }
};
