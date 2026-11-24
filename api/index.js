const { handle } = require('../lib/handler');

module.exports = async (req, res) => {
  const route = String(req.query.route || '').replace(/^\/+|\/+$/g, '');
  const [code, data] = await handle(req.method, route, req.body);
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).json(data);
};
