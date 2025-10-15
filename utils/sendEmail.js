// Plug in SES/SendGrid later
exports.sendEmail = async ({ to, subject, html }) => {
  console.log('Email ->', to, subject);
  return true;
};
