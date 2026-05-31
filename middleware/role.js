module.exports = {
  requireSuperAdmin(req, res, next) {
    if (req.user && req.user.role === 'super-admin') return next();
    return res.status(403).json({ error: 'Forbidden: super-admin only' });
  },
  requireOwnerOrAbove(req, res, next) {
    if (req.user && ['super-admin', 'agency-owner'].includes(req.user.role)) return next();
    return res.status(403).json({ error: 'Forbidden: agency owner or above required' });
  }
};
