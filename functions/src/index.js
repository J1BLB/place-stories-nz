const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const { detectSpam } = require('../utilities');
const memory = require('../inMemoryStore');
const { authorizeAdmin } = require('../adminAuth');

const REPORTS_TABLE = 'GeoPostReports';

function postsClient(conn) {
  const tableName = process.env.TABLE_NAME || 'GeoPosts';
  return TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
}

function reportsClient(conn) {
  return TableClient.fromConnectionString(conn, REPORTS_TABLE, { allowInsecureConnection: true });
}

function entityToPost(entity) {
  return {
    id: entity.rowKey,
    text: entity.text || '',
    author: entity.author || 'Anonymous',
    latitude: entity.latitude != null ? parseFloat(entity.latitude) : null,
    longitude: entity.longitude != null ? parseFloat(entity.longitude) : null,
    partition: entity.partitionKey
  };
}

// ─── getPosts — public feed, excludes flagged/deleted ────────────────────────
app.http('getPosts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;

    if (!conn) {
      return { status: 200, jsonBody: memory.list().filter(p => !p.isFlagged) };
    }

    try {
      const client = postsClient(conn);
      const items = [];
      for await (const entity of client.listEntities()) {
        if (entity.isFlagged === true || entity.isDeleted === true) continue;
        items.push(entityToPost(entity));
      }
      return { status: 200, jsonBody: items };
    } catch (e) {
      context.warn('getPosts table error, falling back to memory', e && e.message);
      return { status: 200, jsonBody: memory.list().filter(p => !p.isFlagged) };
    }
  }
});

// ─── addPost — marks every new post as isFlagged for moderation ───────────────
app.http('addPost', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;

    let body;
    try { body = await request.json(); } catch (e) { body = {}; }

    if (!body.text) {
      return { status: 400, body: 'Missing required field: text' };
    }

    const detectedKeyword = detectSpam(body.text) || detectSpam(body.author);
    const moderationReason = detectedKeyword
      ? `Pending moderation (keyword detected: "${detectedKeyword}")`
      : 'Pending moderation';

    const rowKey = Date.now().toString();

    if (!conn) {
      const row = memory.add({
        PartitionKey: body.partition || 'posts',
        RowKey: rowKey,
        text: body.text,
        author: body.author || 'Anonymous',
        latitude: body.latitude,
        longitude: body.longitude,
        isFlagged: true
      });
      return { status: 201, jsonBody: { id: row.id, flagged: true, reason: moderationReason } };
    }

    try {
      const client = postsClient(conn);
      await client.createTable().catch(() => {});

      const entity = {
        PartitionKey: body.partition || 'posts',
        RowKey: rowKey,
        text: body.text,
        author: body.author || 'Anonymous',
        isFlagged: true,
        moderationReason
      };
      if (body.latitude != null) entity.latitude = Number(body.latitude).toFixed(6);
      if (body.longitude != null) entity.longitude = Number(body.longitude).toFixed(6);

      await client.createEntity(entity);
      return { status: 201, jsonBody: { id: rowKey, flagged: true, reason: moderationReason } };
    } catch (e) {
      context.error('addPost error', e && e.message);
      return { status: 500, body: 'Internal server error: ' + (e && e.message) };
    }
  }
});

// ─── getAllPosts — admin view, all posts including flagged ────────────────────
app.http('getAllPosts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;

    if (!conn) {
      return { status: 200, jsonBody: memory.list() };
    }

    try {
      const client = postsClient(conn);
      const items = [];
      for await (const entity of client.listEntities()) {
        items.push(entityToPost(entity));
      }
      return { status: 200, jsonBody: items };
    } catch (e) {
      context.warn('getAllPosts table error, falling back to memory', e && e.message);
      return { status: 200, jsonBody: memory.list() };
    }
  }
});

// ─── getFlaggedPosts — admin: posts where isFlagged=true, not deleted ─────────
app.http('getFlaggedPosts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const auth = authorizeAdmin(request);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;

    if (!conn) {
      return { status: 200, jsonBody: memory.list().filter(p => p.isFlagged) };
    }

    try {
      const client = postsClient(conn);
      const items = [];
      for await (const entity of client.listEntities()) {
        if (entity.isFlagged === true && entity.isDeleted !== true) {
          items.push({
            postId: entity.rowKey,
            moderationReason: entity.moderationReason || 'Pending moderation',
            flaggedAt: entity.timestamp,
            post: entityToPost(entity)
          });
        }
      }
      return { status: 200, jsonBody: items };
    } catch (e) {
      context.error('getFlaggedPosts error', e && e.message);
      return { status: 500, body: 'Internal server error' };
    }
  }
});

// ─── getUserReports — admin: all reports with post detail ─────────────────────
app.http('getUserReports', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const auth = authorizeAdmin(request);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;

    if (!conn) {
      return { status: 200, jsonBody: [] };
    }

    try {
      const rClient = reportsClient(conn);
      await rClient.createTable().catch(() => {});

      const pClient = postsClient(conn);
      const postsMap = {};
      for await (const entity of pClient.listEntities()) {
        postsMap[entity.rowKey] = entityToPost(entity);
      }

      const reports = [];
      for await (const entity of rClient.listEntities()) {
        if (entity.isDeleted === true) continue;
        reports.push({
          id: entity.rowKey,
          postId: entity.postId,
          reason: entity.reason,
          reportedAt: entity.reportedAt,
          post: postsMap[entity.postId] || null
        });
      }
      return { status: 200, jsonBody: reports };
    } catch (e) {
      context.error('getUserReports error', e && e.message);
      return { status: 500, body: 'Internal server error' };
    }
  }
});

// ─── deleteFlaggedPost — admin: marks isDeleted=true on the GeoPosts entity ───
app.http('deleteFlaggedPost', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'deleteFlaggedPost/{postId}',
  handler: async (request, context) => {
    const auth = authorizeAdmin(request);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const postId = request.params.postId;
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;

    if (!conn) {
      memory.delete(postId);
      return { status: 200, jsonBody: { success: true } };
    }

    try {
      const client = postsClient(conn);
      await client.updateEntity(
        { partitionKey: 'posts', rowKey: postId, isDeleted: true },
        'Merge'
      );
    } catch (e) {
      context.warn(`Failed to mark post ${postId} as deleted: ${e && e.message}`);
    }

    return { status: 200, jsonBody: { success: true, message: `Deleted post ${postId}` } };
  }
});

// ─── restoreFlaggedPost — admin: clears isFlagged so post appears publicly ────
app.http('restoreFlaggedPost', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'restoreFlaggedPost/{postId}',
  handler: async (request, context) => {
    const auth = authorizeAdmin(request);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const postId = request.params.postId;
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;

    if (!conn) {
      return { status: 404, body: 'No storage configured' };
    }

    try {
      const client = postsClient(conn);
      await client.updateEntity(
        { partitionKey: 'posts', rowKey: postId, isFlagged: false },
        'Merge'
      );
      return { status: 200, jsonBody: { success: true } };
    } catch (e) {
      context.error(`restoreFlaggedPost error for ${postId}: ${e && e.message}`);
      return { status: 404, body: 'Post not found' };
    }
  }
});

// ─── reportPost — writes report to GeoPostReports table ──────────────────────
app.http('reportPost', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;

    let body;
    try { body = await request.json(); } catch (e) { body = {}; }

    const { postId, reason } = body;
    if (!postId || !reason) {
      return { status: 400, body: 'Missing required fields: postId, reason' };
    }

    if (!conn) {
      return { status: 201, jsonBody: { reportId: Date.now().toString() } };
    }

    try {
      const client = reportsClient(conn);
      await client.createTable().catch(() => {});

      const reportId = Date.now().toString();
      await client.createEntity({
        PartitionKey: 'reports',
        RowKey: reportId,
        postId,
        reason,
        reportedAt: new Date().toISOString(),
        isDeleted: false
      });

      return { status: 201, jsonBody: { reportId } };
    } catch (e) {
      context.error('reportPost error', e && e.message);
      return { status: 500, body: 'Internal server error' };
    }
  }
});

// ─── deleteReport — admin: marks isDeleted=true in GeoPostReports ─────────────
app.http('deleteReport', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'deleteReport/{reportId}',
  handler: async (request, context) => {
    const auth = authorizeAdmin(request);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const reportId = request.params.reportId;
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;

    if (!conn) {
      return { status: 200, jsonBody: { success: true } };
    }

    try {
      const client = reportsClient(conn);
      await client.updateEntity(
        { partitionKey: 'reports', rowKey: reportId, isDeleted: true },
        'Merge'
      );
      return { status: 200, jsonBody: { success: true } };
    } catch (e) {
      context.error(`deleteReport error for ${reportId}: ${e && e.message}`);
      return { status: 404, body: 'Report not found' };
    }
  }
});
