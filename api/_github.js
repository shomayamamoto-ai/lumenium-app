// Reading and writing the two JSON files the admin edits, in the repository
// where they actually live.
//
// news-post.js and content-save.js each had their own copy of this. They also
// each wrote to GitHub and let the admin page read the *deployed* file back,
// which are not the same thing: a commit is instant and the redeploy that
// publishes it takes a minute or two. Reload the admin inside that window and
// the post you just made is missing from the list — saved, but invisible, with
// nothing on screen to say which.
//
// So the endpoints now answer GET from here, and the admin compares that with
// what is deployed instead of trusting the deployed copy alone.
//
// Files starting with "_" in /api are not exposed as endpoints by Vercel.

const enc = new TextEncoder()

export function b64encodeUtf8(str) {
  const bytes = enc.encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function b64decodeUtf8(b64) {
  const bin = atob(String(b64 || '').replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function repoName() {
  return process.env.GITHUB_REPO || 'shomayamamoto-ai/lumenium-app'
}

export function gh(token, repo, path, init = {}) {
  return fetch(`https://api.github.com/repos/${repo}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lumenium-admin',
      ...(init.headers || {}),
    },
  })
}

export function ghFile(token, repo, path, init) {
  return gh(token, repo, `contents/${path}`, init)
}

/** A human message for a GitHub status, so every caller says the same thing. */
export function ghDetail(status) {
  return status === 401 || status === 403
    ? 'トークンの権限を確認してください。'
    : `GitHub応答: ${status}`
}

/** When the file was last committed, for "saved at". Best effort — the file
 *  contents are the point, and a missing timestamp is not worth failing over. */
export async function lastCommit(token, repo, path) {
  try {
    const res = await gh(token, repo, `commits?path=${encodeURIComponent(path)}&per_page=1`)
    if (!res.ok) return null
    const list = await res.json()
    const c = Array.isArray(list) && list[0]
    if (!c) return null
    return {
      sha: String(c.sha || '').slice(0, 7),
      at: c.commit && c.commit.committer && c.commit.committer.date,
      message: (c.commit && c.commit.message) || '',
    }
  } catch (_) {
    return null
  }
}
