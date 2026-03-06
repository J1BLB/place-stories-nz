const crypto = require("crypto");

function getProvidedPassword(req) {
  const headers = (req && req.headers) || {};
  const headerPassword =
    headers["x-admin-password"] ||
    headers["X-Admin-Password"] ||
    null;

  if (typeof headerPassword === "string" && headerPassword.length > 0) {
    return headerPassword;
  }

  const queryPassword = req && req.query ? req.query.adminPassword : null;
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
