const fs = require('fs');
const path = require('path');

/**
 * Get client IP from request
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-client-ip'] ||
         req.headers['cf-connecting-ip'] ||
         (req.connection && req.connection.remoteAddress) ||
         (req.socket && req.socket.remoteAddress) ||
         'unknown';
}

/**
 * Load JSON file, return default if not found
 */
function loadJSON(filePath, defaultValue = null) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn(`Failed to load ${filePath}:`, e.message);
  }
  return defaultValue;
}

/**
 * Save JSON file
 */
function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.warn(`Failed to save ${filePath}:`, e.message);
    return false;
  }
}

/**
 * Check if user has exceeded rate limit (1 post per day per IP)
 */
function checkRateLimit(ip) {
  const dataPath = path.join(__dirname, 'rateLimits.json');
  const limits = loadJSON(dataPath, []);

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const entry = limits.find(l => l.ipAddress === ip && l.date === today);

  return entry && entry.count >= 1; // true = exceeded
}

/**
 * Record a post by IP
 */
function recordPost(ip) {
  const dataPath = path.join(__dirname, 'rateLimits.json');
  const limits = loadJSON(dataPath, []);

  const today = new Date().toISOString().split('T')[0];
  const entry = limits.find(l => l.ipAddress === ip && l.date === today);

  if (entry) {
    entry.count++;
  } else {
    limits.push({ ipAddress: ip, date: today, count: 1 });
  }

  // Clean up old entries (older than 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

  const filtered = limits.filter(l => l.date >= cutoffDate);
  saveJSON(dataPath, filtered);
}

/**
 * Check if text contains spam keywords
 */
function detectSpam(text) {
  if (!text) return null;

  const keywordsPath = path.join(__dirname, 'spamKeywords.json');
  const keywords = loadJSON(keywordsPath, []);

  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return keyword; // Return the keyword that was detected
    }
  }

  return null; // No spam detected
}

/**
 * Record a flagged post
 */
function addFlaggedPost(postId, reason) {
  const dataPath = path.join(__dirname, 'flaggedPosts.json');
  const flagged = loadJSON(dataPath, []);

  // Check if already flagged
  if (!flagged.find(f => f.postId === postId)) {
    flagged.push({
      postId: postId,
      reason: reason,
      flaggedAt: new Date().toISOString(),
      deleted: false,
      restored: false
    });
    saveJSON(dataPath, flagged);
  }
}

/**
 * Get all flagged post IDs
 */
function getFlaggedPostIds() {
  const dataPath = path.join(__dirname, 'flaggedPosts.json');
  const flagged = loadJSON(dataPath, []);
  return flagged
    .filter(f => !f.deleted && !f.restored)
    .map(f => f.postId);
}

/**
 * Get flagged post info
 */
function getFlaggedPostInfo(postId) {
  const dataPath = path.join(__dirname, 'flaggedPosts.json');
  const flagged = loadJSON(dataPath, []);
  return flagged.find(f => f.postId === postId && !f.deleted);
}

/**
 * Delete flagged post record
 */
function deleteFlaggedPost(postId) {
  const dataPath = path.join(__dirname, 'flaggedPosts.json');
  const flagged = loadJSON(dataPath, []);

  const entry = flagged.find(f => f.postId === postId);
  if (entry) {
    entry.deleted = true;
    saveJSON(dataPath, flagged);
    return true;
  }
  return false;
}

/**
 * Restore flagged post (make visible again)
 */
function restoreFlaggedPost(postId) {
  const dataPath = path.join(__dirname, 'flaggedPosts.json');
  const flagged = loadJSON(dataPath, []);

  const entry = flagged.find(f => f.postId === postId);
  if (entry) {
    entry.restored = true;
    saveJSON(dataPath, flagged);
    return true;
  }
  return false;
}

module.exports = {
  getClientIP,
  loadJSON,
  saveJSON,
  checkRateLimit,
  recordPost,
  detectSpam,
  addFlaggedPost,
  getFlaggedPostIds,
  getFlaggedPostInfo,
  deleteFlaggedPost,
  restoreFlaggedPost
};
