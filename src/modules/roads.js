import { state, setNearbyRoads, addLogEntry } from './state.js';

/**
 * Fetches major road network data from the Overpass API within a 30km radius.
 */
export async function fetchNearbyRoads(lat, lon) {
  if (!lat || !lon) return;

  const query = `
    [out:json][timeout:30];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](around:30000, ${lat}, ${lon});
    );
    out body;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    });

    if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);

    const data = await res.json();
    const roads = processRawRoads(data.elements || []);
    setNearbyRoads(roads);
    
    if (roads.length > 0) {
      const topRoads = roads.slice(0, 5).map(r => r.ref || r.name).join(', ');
      addLogEntry('system', `Road network data acquired: ${topRoads}…`);
    }
  } catch (err) {
    console.warn('Failed to fetch road data:', err);
    // Continue with existing data if available
  }
}

function processRawRoads(elements) {
  const uniqueRoads = new Map();

  elements.forEach(el => {
    if (el.tags) {
      const name = el.tags.name || '';
      const ref = el.tags.ref || '';
      const surface = el.tags.surface || 'unknown';
      const type = el.tags.highway || '';
      
      const key = ref || name;
      if (key && !uniqueRoads.has(key)) {
        uniqueRoads.set(key, { name, ref, surface, type });
      }
    }
  });

  return Array.from(uniqueRoads.values());
}

/**
 * Generates a concise text summary of the road network for AI context.
 */
export function getRoadContext() {
  if (!state.nearbyRoads || state.nearbyRoads.length === 0) {
    return 'Nearby Road Network: Information unavailable or currently loading.';
  }

  const highways = state.nearbyRoads
    .filter(r => ['motorway', 'trunk', 'primary'].includes(r.type))
    .map(r => r.ref || r.name)
    .slice(0, 8);

  const unpavedCount = state.nearbyRoads.filter(r => 
    ['unpaved', 'gravel', 'dirt', 'ground'].includes(r.surface.toLowerCase())
  ).length;

  let context = `Nearby Major Roads: ${highways.join(', ') || 'Various local highways'}.`;
  
  if (unpavedCount > 0) {
    context += ` Warning: ${unpavedCount} unpaved or dirt roads identified in the nearby network.`;
  } else {
    context += ` Surface: Majority of major routes are paved.`;
  }

  return context;
}
