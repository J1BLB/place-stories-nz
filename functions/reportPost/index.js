const { loadJSON, saveJSON } = require("../utilities");
const path = require("path");

module.exports = async function (context, req) {
  try {
    const body = req.body || {};
    const { postId, reason } = body;

    if (!postId || !reason) {
      return { status: 400, body: "Missing required fields: postId, reason" };
    }

    const dataPath = path.join(__dirname, "..", "reports.json");
    const reports = loadJSON(dataPath, []);

    const reportId = Date.now().toString();
    reports.push({
      id: reportId,
      postId: postId,
      reason: reason,
      reportedAt: new Date().toISOString(),
      deleted: false
    });

    saveJSON(dataPath, reports);

    return {
      status: 201,
      body: { reportId: reportId }
    };
  } catch (err) {
    context.log.error("Error reporting post:", err);
    return {
      status: 500,
      body: "Internal server error: " + (err && err.message ? err.message : "Unknown error")
    };
  }
};
