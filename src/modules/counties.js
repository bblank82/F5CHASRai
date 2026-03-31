// src/modules/counties.js — Highlighting specific Kansas counties
import { addLogEntry } from './state.js';

const HIGHLIGHTED_COUNTIES = [
  'Barber', 'Barton', 'Butler', 'Chase', 'Cheyenne', 'Clark', 'Comanche', 'Cowley', 
  'Decatur', 'Dickinson', 'Edwards', 'Elk', 'Ellis', 'Ellsworth', 'Finney', 'Ford', 
  'Gove', 'Graham', 'Grant', 'Gray', 'Greeley', 'Greenwood', 'Hamilton', 'Harper', 
  'Harvey', 'Haskell', 'Hodgeman', 'Jewell', 'Kearny', 'Kingman', 'Kiowa', 'Lane', 
  'Lincoln', 'Logan', 'Marion', 'McPherson', 'Meade', 'Mitchell', 'Morris', 'Morton', 
  'Ness', 'Norton', 'Osborne', 'Ottawa', 'Pawnee', 'Phillips', 'Pratt', 'Rawlins', 
  'Reno', 'Rice', 'Rooks', 'Rush', 'Russell', 'Saline', 'Scott', 'Sedgwick', 'Seward', 
  'Sheridan', 'Sherman', 'Smith', 'Stafford', 'Stanton', 'Stevens', 'Sumner', 'Thomas', 
  'Trego', 'Wallace', 'Wichita'
];

/**
 * Initializes the county highlighting layer.
 * @param {L.Map} map - The Leaflet map instance.
 */
export async function initCounties(map) {
  try {
    // US Counties GeoJSON (High quality Plotly source)
    const response = await fetch('https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json');
    if (!response.ok) throw new Error('Failed to fetch county GeoJSON');
    
    const data = await response.json();

    // Filter for Kansas (FIPS 20) and the specific target list
    const kansasFeatures = data.features.filter(f => {
      const isKansas = f.properties.STATE === '20';
      const isTarget = HIGHLIGHTED_COUNTIES.includes(f.properties.NAME);
      return isKansas && isTarget;
    });

    if (kansasFeatures.length === 0) {
      console.warn('No matching Kansas counties found in GeoJSON.');
      return;
    }

    const geoJsonLayer = L.geoJSON({ type: 'FeatureCollection', features: kansasFeatures }, {
      style: {
        fillColor: '#38bdf8', // Subtle Sky Blue
        fillOpacity: 0.15,
        color: 'transparent', // No border emphasis
        weight: 0,
        interactive: false // Don't block map clicks
      },
      pane: 'tilePane' // Keep it at the tile level so it's under radar/overlays
    });

    addLogEntry('system', `Highlighted ${kansasFeatures.length} Kansas target counties.`);
    return geoJsonLayer;
  } catch (error) {
    console.error('Error initializing county highlights:', error);
    addLogEntry('system', '⚠️ Failed to load county boundary highlights.');
  }
}
