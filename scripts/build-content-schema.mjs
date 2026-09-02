// Emits public/content-schema.json: every editable string on the site, with
// its dotted path, current default and a human label. The admin page renders
// this list as a form — it cannot import the app's ES modules itself.
import { writeFileSync, readFileSync } from 'node:fs'
import { REGISTRY, GROUP_LABELS, collectPaths, applyOverrides } from '../src/lib/content-registry.js'

// Defaults must be the code's values, not whatever is currently overridden,
// so the admin can always see and restore the original wording.
const defaults = Object.fromEntries(collectPaths().map((e) => [e.path, e.value]))

// Group by the label that makes sense to a person: the registry group, or
// the group plus collection for the site.* buckets.
function groupOf(path) {
  const parts = path.split('.')
  const two = parts.slice(0, 2).join('.')
  if (GROUP_LABELS[two]) return two
  return parts[0]
}

const groups = {}
for (const { path, value } of collectPaths()) {
  const g = groupOf(path)
  ;(groups[g] ||= { key: g, label: GROUP_LABELS[g] || g, fields: [] }).fields.push({ path, value })
}

const schema = {
  generatedAt: new Date().toISOString(),
  count: Object.keys(defaults).length,
  groups: Object.values(groups),
}
writeFileSync('public/content-schema.json', JSON.stringify(schema, null, 2) + '\n')
console.log(`content schema: ${schema.count} editable strings in ${schema.groups.length} groups`)

// Sanity: the overrides currently committed must all still resolve, otherwise
// a rename in the code would silently drop the admin's edits.
try {
  const overrides = JSON.parse(readFileSync('public/content.json', 'utf8'))
  const keys = Object.keys(overrides)
  if (keys.length) {
    const unknown = keys.filter((k) => !(k in defaults))
    const applied = applyOverrides(overrides, REGISTRY)
    console.log(`content overrides: ${applied}/${keys.length} applied` +
      (unknown.length ? ` — ${unknown.length} stale key(s): ${unknown.slice(0, 5).join(', ')}` : ''))
  }
} catch (e) {
  console.warn('content.json unreadable, using built-in copy:', e.message)
}
