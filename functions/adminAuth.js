const crypto = require("crypto");

function getProvidedPassword(req) {
  // v4: request.headers is a Headers object with .get()
  let headerPassword = null;
  if (req && req.headers && typeof req.headers.get === 'function') {
    headerPassword = req.headers.get("x-admin-password");
  } else if (req && req.headers) {
    headerPassword = req.headers["x-admin-password"] || req.headers["X-Admin-Password"] || null;
  }

  if (typeof headerPassword === "string" && headerPassword.length > 0) {
    return headerPassword;
  }

  // v4: request.query is URLSearchParams with .get()
  let queryPassword = null;
  if (req && req.query && typeof req.query.get === 'function') {
    queryPassword = req.query.get("adminPassword");
  } else if (req && req.query) {
    queryPassword = req.query.adminPassword || null;
  }
  return typeof queryPassword === "string" ? queryPassword : null;
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}

function authorizeAdmin(req) {
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (typeof expectedPassword !== "string" || expectedPassword.length === 0) {
    return {
      ok: false,
      status: 500,
      body: "Admin authentication is not configured"
    };
  }

  const providedPassword = getProvidedPassword(req);

  if (!providedPassword || !safeEqual(providedPassword, expectedPassword)) {
    return {
      ok: false,
      status: 401,
      body: "Unauthorized"
    };
  }

  return { ok: true };
}

module.exports = {
  authorizeAdmin
};
