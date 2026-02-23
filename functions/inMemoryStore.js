// Simple in-memory store for development fallback when Table Storage is unavailable
const items = [
  { id: '1', text: "Beautiful Milford Sound view", author: 'Sarah', latitude: -44.6719, longitude: 168.7626, partition: 'posts' },
  { id: '2', text: "Enjoying Auckland's waterfront", author: 'Mike', latitude: -37.0082, longitude: 174.7850, partition: 'posts' },
  { id: '3', text: "Hiking in Tongariro National Park", author: 'Emma', latitude: -38.7870, longitude: 175.5470, partition: 'posts' },
  { id: '4', text: "Wellington's creative district", author: 'James', latitude: -41.2865, longitude: 174.7762, partition: 'posts' },
  { id: '5', text: "Queenstown adventure capital", author: 'Lisa', latitude: -41.3033, longitude: 168.7383, partition: 'posts' }
];

function list() {
  return items.slice();
}

function add(entity) {
  const id = (Date.now()).toString();
  const row = {
    id,
    text: entity.text || '',
    author: entity.author || 'Anonymous',
    latitude: entity.latitude != null ? Number(entity.latitude) : null,
    longitude: entity.longitude != null ? Number(entity.longitude) : null,
    partition: entity.partition || 'posts'
  };
  items.push(row);
  return row;
}

function deleteItem(id) {
  const index = items.findIndex(item => item.id === id);
  if (index !== -1) {
    items.splice(index, 1);
    return true;
  }
  return false;
}

module.exports = { list, add, delete: deleteItem };
