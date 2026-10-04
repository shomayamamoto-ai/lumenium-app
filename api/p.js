export const config = { runtime: 'edge' }

// The pageview beacon, under a name that says nothing.
//
// Content blockers keep lists of URL patterns that look like analytics, and
// '/api/track' is exactly the kind of name those lists contain. Each visitor
// whose blocker drops the request is a visit that never happened as far as
// the report is concerned — and nothing on screen says how many. This is the
// same handler (api/track.js, which keeps answering for pages still cached
// with the old address); only the address is different.

export { POST } from './track.js'
