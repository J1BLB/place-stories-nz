const { loadJSON, saveJSON } = require("../utilities");
const path = require("path");

module.exports = async function (context, req) {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    const provided = (req.query && req.query.adminPassword) || null;

    if (provided !== adminPassword) {
      return { status: 401, body: "Unauthorized" };
    }

    const reportId = req.params.reportId;
    const dataPath = path.join(__dirname, "..", "reports.json");
    const reports = loadJSON(dataPath, []);

    const report = reports.find(r => r.id === reportId);
    if (!report) {
      return { status: 404, body: "Report not found" };
    }

    report.deleted = true;
    saveJSON(dataPath, reports);

    return {
      status: 200,
      body: { success: true }
    };
  } catch (err) {
    context.log.error("Error deleting report:", err);
    return {
      status: 500,
      body: "Internal server error: " + (err && err.message ? err.message : "Unknown error")
    };
  }
};
