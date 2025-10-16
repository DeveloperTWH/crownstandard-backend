// utils/geocode.js
const NodeGeocoder = require("node-geocoder");

const geocoder = NodeGeocoder({
  provider: "google",
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
});

module.exports = async function geocodeAddress(addressObj) {
  // Build a full address string
  const fullAddress = `${addressObj.line1 || ""} ${addressObj.line2 || ""} ${addressObj.city || ""} ${addressObj.state || ""} ${addressObj.country || ""} ${addressObj.postalCode || ""}`.trim();

  if (!fullAddress) return null;

  const results = await geocoder.geocode(fullAddress);
  if (results && results.length > 0) {
    return {
      lat: results[0].latitude,
      lng: results[0].longitude,
    };
  }

  return null;
};
