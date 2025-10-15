const router = require('express').Router();
const auth = require('../middleware/auth');
const { register, login, me, updateMe, updateProviderOnboarding,
        forgotPassword, resetPassword, oauthGoogle, oauthApple } = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, me);
router.put('/me', auth, updateMe);
router.put('/me/provider-onboarding', auth, updateProviderOnboarding);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Social
router.post('/oauth/google', oauthGoogle);

module.exports = router;
