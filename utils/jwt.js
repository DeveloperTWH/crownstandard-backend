const jwt = require('jsonwebtoken');
exports.signJWT = ({ id, _id, role }) => {
  const sub = (id || _id).toString();
  return jwt.sign({ sub, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};
