// geocoding.js — Reverse Geocoding Utility
const cache = new Map();
const stateCache = new Map();

/**
 * Reverse geocodes coordinates to a "near City, ST" string.
 * Uses Nominatim (OpenStreetMap).
 */
export async function reverseGeocode(lat, lon) {
  // Rough key for caching (to 3 decimal places is ~110m accuracy, good enough for "near")
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);

  try {
    // Nominatim reverse geocoding
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`;
    const res = await fetch(url);

    if (!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    
    if (data && data.address) {
      const addr = data.address;
      // Preference: city -> town -> village -> hamlet -> suburb -> county
      const city = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || '';
      const county = addr.county || '';
      
      // State code (e.g. OK, TX)
      let state = '';
      if (addr['ISO3166-2-lvl4']) {
        const parts = addr['ISO3166-2-lvl4'].split('-');
        state = parts[parts.length - 1];
      } else {
        state = addr.state || '';
      }
      
      // Cache state code separately for alert use
      if (state) stateCache.set(key, state);

      let result = '';
      if (city && state) {
        result = `near ${city}, ${state}`;
      } else if (county && state) {
        result = `near ${county}, ${state}`;
      } else if (city) {
        result = `near ${city}`;
      } else if (county) {
        result = `near ${county}`;
      } else if (state) {
        result = `in ${state}`;
      }

      if (result) {
        cache.set(key, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('Geocoding error:', err);
  }
  return null;
}

/**
 * Returns the 2-letter US state abbreviation for the given coordinates.
 * Uses a cached Nominatim lookup.
 */
export async function getStateCode(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (stateCache.has(key)) return stateCache.get(key);

  // Trigger a full geocode which populates stateCache
  await reverseGeocode(lat, lon);
  return stateCache.get(key) || null;
}

