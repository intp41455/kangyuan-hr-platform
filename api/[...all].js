const app = require('../backend_server');

module.exports = async (req, res) => {
  // 在 Vercel Serverless runtime 里把 express 当 handler 用
  return app(req, res);
};
