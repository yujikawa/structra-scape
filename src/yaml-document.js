import YAML, { isCollection, isMap, isScalar, isSeq } from 'yaml';

// Rewrite YAML text so that it represents `value`, touching only the nodes whose value changed.
// Comments, key order, flow style ({ a: 1 }) and block scalars (|) survive on everything else.
// Lists of entities are matched by `id`, so reordering or inserting keeps each entry's comments.
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const keyOf = pair => isScalar(pair.key) ? pair.key.value : pair.key;

function create(doc, value, { flow = false, like } = {}) {
  const node = doc.createNode(value);
  if (isCollection(node)) node.flow = like && isCollection(like) ? like.flow : flow;
  if (isScalar(node) && typeof value === 'string') {
    if (isScalar(like) && /^BLOCK_/.test(like.type)) node.type = like.type;
    else if (value.includes('\n')) node.type = 'BLOCK_LITERAL';
  }
  if (like?.commentBefore) node.commentBefore = like.commentBefore;
  if (like?.comment) node.comment = like.comment;
  return node;
}

function sync(doc, node, value) {
  if (node && typeof node.toJSON === 'function' && same(node.toJSON(), value)) return node;
  if (isMap(node) && plain(value)) {
    for (const pair of [...node.items]) if (!Object.hasOwn(value, keyOf(pair))) node.delete(keyOf(pair));
    for (const [key, item] of Object.entries(value)) {
      const pair = node.items.find(p => keyOf(p) === key);
      if (pair) pair.value = sync(doc, pair.value, item);
      else node.add(doc.createPair(key, create(doc, item, { flow: node.flow })));
    }
    return node;
  }
  if (isSeq(node) && Array.isArray(value)) {
    const id = item => isMap(item) ? item.get('id') : undefined;
    // Entries written inline (`- { source: A, target: B }`) stay inline when new ones are added.
    const flow = node.flow || (node.items.length > 0 && node.items.every(item => isCollection(item) && item.flow));
    const keyed = value.every(item => plain(item) && typeof item.id === 'string') && node.items.every(item => typeof id(item) === 'string');
    if (keyed) {
      const byId = new Map(node.items.map(item => [id(item), item]));
      node.items = value.map(item => byId.has(item.id) ? sync(doc, byId.get(item.id), item) : create(doc, item, { flow }));
    } else {
      node.items = value.map((item, i) => i < node.items.length ? sync(doc, node.items[i], item) : create(doc, item, { flow }));
    }
    return node;
  }
  return create(doc, value, { like: node });
}

// Returns the updated text, or null when the original cannot be edited in place.
export function updateYamlText(text, value) {
  const doc = YAML.parseDocument(text);
  if (doc.errors.length) return null;
  doc.contents = sync(doc, doc.contents, value);
  // The serializer pads all inline collections alike ({ a: 1 } or {a: 1}); follow the file's majority.
  const padded = (text.match(/[[{] /g) || []).length, tight = (text.match(/[[{][^\s\]}]/g) || []).length;
  const result = doc.toString({ lineWidth: 0, flowCollectionPadding: padded >= tight });
  return same(YAML.parse(result), value) ? result : null;
}
