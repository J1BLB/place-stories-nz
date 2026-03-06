const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const {
  detectSpam, addFlaggedPost, getFlaggedPostIds,
  loadJSON, saveJSON,
  deleteFlaggedPost: markFlaggedDeleted,
  restoreFlaggedPost: markFlaggedRestored
} = require('../utilities');
const memory = require('../inMemoryStore');
const { authorizeAdmin } = require('../adminAuth');
const path = require('path');

// ─── getPosts ────────────────────────────────────────────────────────────────
app.http('getPosts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const tableName = process.env.TABLE_NAME || 'GeoPosts';

    let flaggedIds = [];
    try { flaggedIds = getFlaggedPostIds(); } catch (e) {
      context.warn('Error loading flagged posts', e && e.message);
    }

    if (!conn) {
      return { status: 200, jsonBody: memory.list().filter(p => !flaggedIds.includes(p.id)) };
    }

    let client;
    try {
      client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
    } catch (e) {
      context.warn('TableClient init failed, using in-memory store', e && e.message);
      return { status: 200, jsonBody: memory.list().filter(p => !flaggedIds.includes(p.id)) };
    }

    try {
      const items = [];
      for await (const entity of client.listEntities()) {
        if (!flaggedIds.includes(entity.rowKey)) {
          items.push({
            id: entity.rowKey,
            text: entity.text || '',
            author: entity.author || 'Anonymous',
            latitude: entity.latitude ? parseFloat(entity.latitude) : null,
            longitude: entity.longitude ? parseFloat(entity.longitude) : null,
            partition: entity.partitionKey
          });
        }
      }
      return { status: 200, jsonBody: items };
    } catch (e) {
      context.warn('Table listing failed, using in-memory store', e && e.message);
      return { status: 200, jsonBody: memory.list().filter(p => !flaggedIds.includes(p.id)) };
    }
  }
});

// ─── addPost ─────────────────────────────────────────────────────────────────
app.http('addPost', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const tableName = process.env.TABLE_NAME || 'GeoPosts';

    let body;
    try { body = await request.json(); } catch (e) { body = {}; }

    if (!body.text) {
      return { status: 400, body: 'Missing required field: text' };
    }

    const detectedKeyword = detectSpam(body.text) || detectSpam(body.author);
    const moderationReason = detectedKeyword
      ? `Pending moderation (keyword detected: "${detectedKeyword}")`
      : 'Pending moderation';

    let client = null;
    try {
      if (conn) {
        client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
        await client.createTable().catch(() => {});
      }
    } catch (e) {
      context.warn('TableClient init failed, using in-memory store', e && e.message);
      client = null;
    }

    const rowKey = Date.now().toString();
    const entity = {
      PartitionKey: body.partition || 'posts',
      RowKey: rowKey,
      text: body.text,
      author: body.author || 'Anonymous',
      latitude: body.latitude != null ? Number(body.latitude).toFixed(3) : undefined,
      longitude: body.longitude != null ? Number(body.longitude).toFixed(3) : undefined
    };

    if (!client) {
      const row = memory.add(entity);
      addFlaggedPost(row.id, moderationReason);
      return { status: 201, jsonBody: { id: row.id, flagged: true, reason: moderationReason } };
    }

    Object.keys(entity).forEach(k => entity[k] === undefined && delete entity[k]);
    await client.createEntity(entity);
    addFlaggedPost(rowKey, moderationReason);
    return { status: 201, jsonBody: { id: rowKey, flagged: true, reason: moderationReason } };
  }
});

// ─── getAllPosts ──────────────────────────────────────────────────────────────
app.http('getAllPosts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const tableName = process.env.TABLE_NAME || 'GeoPosts';

    if (!conn) {
      return { status: 200, jsonBody: memory.list() };
    }

    let client;
    try {
      client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
    } catch (e) {
      context.warn('TableClient init failed, using in-memory store', e && e.message);
      return { status: 200, jsonBody: memory.list() };
    }

    try {
      const items = [];
      for await (const entity of client.listEntities()) {
        items.push({
          id: entity.rowKey,
          text: entity.text || '',
          author: entity.author || 'Anonymous',
          latitude: entity.latitude ? parseFloat(entity.latitude) : null,
          longitude: entity.longitude ? parseFloat(entity.longitude) : null,
          partition: entity.partitionKey
        });
      }
      return { status: 200, jsonBody: items };
    } catch (e) {
      context.warn('Table listing failed, using in-memory store', e && e.message);
      return { status: 200, jsonBody: memory.list() };
    }
  }
});

// ─── getFlaggedPosts ──────────────────────────────────────────────────────────
app.http('getFlaggedPosts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const auth = authorizeAdmin(request);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const tableName = process.env.TABLE_NAME || 'GeoPosts';
    const flaggedPath = path.join(__dirname, '..', 'flaggedPosts.json');
    const flaggedList = loadJSON(flaggedPath, []).filter(f => !f.deleted && !f.restored);

    let postsMap = {};
    if (conn) {
      try {
        const client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
        await client.createTable().catch(() => {});
        for await (const entity of client.listEntities()) {
          const rowKey = String(entity.rowKey ?? '');
          if (rowKey) {
            postsMap[rowKey] = {
              text: entity.text || '', author: entity.author || 'Anonymous',
              latitude: entity.latitude ? parseFloat(entity.latitude) : null,
              longitude: entity.longitude ? parseFloat(entity.longitude) : null
            };
          }
        }
      } catch (e) {
        context.warn('Failed to fetch from table, using in-memory', e && e.message);
        memory.list().forEach(p => { postsMap[p.id] = p; });
      }
    } else {
      memory.list().forEach(p => { postsMap[p.id] = p; });
    }

    return {
      status: 200,
      jsonBody: flaggedList.map(f => ({ ...f, post: postsMap[String(f.postId)] || null }))
    };
  }
});

// ─── getUserReports ───────────────────────────────────────────────────────────
app.http('getUserReports', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const auth = authorizeAdmin(request);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const tableName = process.env.TABLE_NAME || 'GeoPosts';
    const dataPath = path.join(__dirname, '..', 'reports.json');
    const reports = loadJSON(dataPath, []).filter(r => !r.deleted);

    let postsMap = {};
    if (conn) {
      try {
        const client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
        await client.createTable().catch(() => {});
        for await (const entity of client.listEntities()) {
          const rowKey = String(entity.rowKey ?? '');
          if (rowKey) {
            postsMap[rowKey] = {
              text: entity.text || '', author: entity.author || 'Anonymous',
              latitude: entity.latitude ? parseFloat(entity.latitude) : null,
              longitude: entity.longitude ? parseFloat(entity.longitude) : null
            };
          }
        }
      } catch (e) {
        context.warn('Failed to fetch from table, using in-memory', e && e.message);
        memory.list().forEach(p => { postsMap[p.id] = p; });
      }
    } else {
      memory.list().forEach(p => { postsMap[p.id] = p; });
    }

    return {
      status: 200,
      jsonBody: reports.map(r => ({ ...r, post: postsMap[String(r.postId)] || null }))
    };
  }
});

// ─── deleteFlaggedPost ────────────────────────────────────────────────────────
app.http('deleteFlaggedPost', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'deleteFlaggedPost/{postId}',
  handler: async (request, context) => {
    const auth = authorizeAdmin(request);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const postId = request.params.postId;
    const conn = process.env.TABLE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
    const tableName = process.env.TABLE_NAME || 'GeoPosts';

    if (conn) {
      try {
        const client = TableClient.fromConnectionString(conn, tableName, { allowInsecureConnection: true });
        await client.deleteEntity('posts', postId);
      } catch (e) {
        context.warn(`Failed to delete from table: ${e && e.message}`);
      }
    }
    try { memory.delete(postId); } catch (e) {}
    try { markFlaggedDeleted(postId); } catch (e) {}

    return { status: 200, jsonBody: { success: true, message: `Deleted post ${postId}` } };
  }
});

// ─── deleteReport ─────────────────────────────────────────────────────────────
app.http('deleteReport', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'deleteReport/{reportId}',
  handler: async (request, context) => {
    const auth = authorizeAdmin(request);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const reportId = request.params.reportId;
    const dataPath = path.join(__dirname, '..', 'reports.json');
    const reports = loadJSON(dataPath, []);

    const report = reports.find(r => r.id === reportId);
    if (!report) return { status: 404, body: 'Report not found' };

    report.deleted = true;
    saveJSON(dataPath, reports);
    return { status: 200, jsonBody: { success: true } };
  }
});

// ─── restoreFlaggedPost ───────────────────────────────────────────────────────
app.http('restoreFlaggedPost', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'restoreFlaggedPost/{postId}',
  handler: async (request, context) => {
    const auth = authorizeAdmin(request);
    if (!auth.ok) return { status: auth.status, body: auth.body };

    const postId = request.params.postId;
    const success = markFlaggedRestored(postId);
    if (!success) return { status: 404, body: 'Flagged post not found' };
    return { status: 200, jsonBody: { success: true } };
  }
});

// ─── reportPost ───────────────────────────────────────────────────────────────
app.http('reportPost', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    let body;
    try { body = await request.json(); } catch (e) { body = {}; }

    const { postId, reason } = body;
    if (!postId || !reason) {
      return { status: 400, body: 'Missing required fields: postId, reason' };
    }

    const dataPath = path.join(__dirname, '..', 'reports.json');
    const reports = loadJSON(dataPath, []);
    const reportId = Date.now().toString();
    reports.push({ id: reportId, postId, reason, reportedAt: new Date().toISOString(), deleted: false });
    saveJSON(dataPath, reports);

    return { status: 201, jsonBody: { reportId } };
  }
});
