// functions/api/community.ts — Community forum API (KV-backed)
// Supports: GET posts, GET single post, POST new post, POST reply, POST vote

import { type Env, makeCors, makeJsonResponse, makeErrorResponse, isAuthorized } from "./_shared";

const CORS_HEADERS = makeCors("GET, POST, OPTIONS");
const jsonResponse = makeJsonResponse(CORS_HEADERS);
const errorResponse = makeErrorResponse(jsonResponse);

// Wrapper: only admin/guardian/app can make system-level community posts
function isSystemAuthorized(request: Request, env: Env) {
  return isAuthorized(request, env, ["admin", "guardian", "app"]);
}

// Generate a short unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Sanitise text - strip control chars, limit length
function sanitize(str: string, maxLen: number): string {
  return (str || "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim()
    .slice(0, maxLen);
}

// KV keys
const POSTS_INDEX_KEY = "community:posts:index"; // stores array of post IDs
function postKey(id: string) {
  return `community:post:${id}`;
}

interface CommunityPost {
  id: string;
  title: string;
  body: string;
  category: "bug" | "feature" | "discussion" | "question" | "announcement" | "security";
  author: string;
  votes: number;
  replies: Reply[];
  createdAt: number;
}

interface Reply {
  id: string;
  author: string;
  body: string;
  createdAt: number;
}

// Rate limit: max posts per user per hour
async function checkPostRateLimit(
  env: Env,
  username: string
): Promise<boolean> {
  const key = `community:rate:post:${username.toLowerCase()}`;
  const data = await env.USAGE_DATA.get(key);
  const now = Date.now();
  let timestamps: number[] = data ? JSON.parse(data) : [];
  timestamps = timestamps.filter((t) => now - t < 3600000);
  if (timestamps.length >= 5) return false; // 5 posts per hour max
  timestamps.push(now);
  await env.USAGE_DATA.put(key, JSON.stringify(timestamps), {
    expirationTtl: 3600,
  });
  return true;
}

// Rate limit: max replies per user per hour
async function checkReplyRateLimit(
  env: Env,
  username: string
): Promise<boolean> {
  const key = `community:rate:reply:${username.toLowerCase()}`;
  const data = await env.USAGE_DATA.get(key);
  const now = Date.now();
  let timestamps: number[] = data ? JSON.parse(data) : [];
  timestamps = timestamps.filter((t) => now - t < 3600000);
  if (timestamps.length >= 20) return false; // 20 replies per hour max
  timestamps.push(now);
  await env.USAGE_DATA.put(key, JSON.stringify(timestamps), {
    expirationTtl: 3600,
  });
  return true;
}

// Get all post IDs
async function getPostIndex(env: Env): Promise<string[]> {
  const data = await env.USAGE_DATA.get(POSTS_INDEX_KEY);
  return data ? JSON.parse(data) : [];
}

// Save post index
async function savePostIndex(env: Env, ids: string[]): Promise<void> {
  await env.USAGE_DATA.put(POSTS_INDEX_KEY, JSON.stringify(ids));
}

// Get a single post
async function getPost(
  env: Env,
  id: string
): Promise<CommunityPost | null> {
  const data = await env.USAGE_DATA.get(postKey(id));
  return data ? JSON.parse(data) : null;
}

// Save a post
async function savePost(env: Env, post: CommunityPost): Promise<void> {
  await env.USAGE_DATA.put(postKey(post.id), JSON.stringify(post));
}

// ========== CORS ==========
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

// ========== GET — list all posts or single post ==========
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const pathParts = url.pathname.replace("/api/community", "").split("/").filter(Boolean);

  // GET /api/community — list all posts (summaries)
  if (pathParts.length === 0) {
    const ids = await getPostIndex(context.env);
    // Load all posts (max 200 for performance)
    const recentIds = ids.slice(-200);
    const posts: any[] = [];
    // Batch load
    for (const id of recentIds) {
      const post = await getPost(context.env, id);
      if (post) {
        posts.push({
          id: post.id,
          title: post.title,
          body: post.body.slice(0, 200),
          category: post.category,
          author: post.author,
          votes: post.votes,
          replies: (post.replies || []).map((r) => ({ id: r.id })), // Just count
          createdAt: post.createdAt,
        });
      }
    }
    return jsonResponse({ success: true, posts });
  }

  // GET /api/community/:id — single post with full data
  if (pathParts.length === 1) {
    const post = await getPost(context.env, pathParts[0]);
    if (!post) return errorResponse("Post not found.", 404);
    return jsonResponse({ success: true, post });
  }

  return errorResponse("Invalid path.", 404);
};

// ========== POST — create post, reply, or vote ==========
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const pathParts = url.pathname.replace("/api/community", "").split("/").filter(Boolean);

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse("Invalid JSON body.");
  }

  // POST /api/community — create a new post
  if (pathParts.length === 0) {
    const username = sanitize(body.username || "", 50);
    const title = sanitize(body.title || "", 120);
    const postBody = sanitize(body.body || "", 5000);
    const category = body.category || "discussion";

    // System (guardian/admin) auto-posts use "Network Guardian" as author
    const { authorized: sysAuth, role: sysRole } = isSystemAuthorized(context.request, context.env);
    const effectiveUsername = (sysAuth && category === "security") ? "Network Guardian" : username;

    if (!effectiveUsername) return errorResponse("You must be logged in to post.");
    if (title.length < 3) return errorResponse("Title must be at least 3 characters.");
    if (postBody.length < 10) return errorResponse("Details must be at least 10 characters.");

    const validCategories = ["bug", "feature", "discussion", "question", "security"];
    // Only system tokens (guardian/admin) can post in the 'security' category
    if (category === "security") {
      const { authorized } = isSystemAuthorized(context.request, context.env);
      if (!authorized) {
        return errorResponse("Only the Guardian system can post security bulletins.");
      }
    }
    if (!validCategories.includes(category)) {
      return errorResponse("Invalid category.");
    }

    // Rate limit — skip for system auto-posts
    if (!sysAuth) {
      const allowed = await checkPostRateLimit(context.env, effectiveUsername);
      if (!allowed) {
        return errorResponse("Rate limit reached. Please wait before posting again.");
      }
    }

    const newPost: CommunityPost = {
      id: generateId(),
      title,
      body: postBody,
      category,
      author: effectiveUsername,
      votes: 0,
      replies: [],
      createdAt: Date.now(),
    };

    await savePost(context.env, newPost);
    const ids = await getPostIndex(context.env);
    ids.push(newPost.id);
    await savePostIndex(context.env, ids);

    return jsonResponse({ success: true, post: { id: newPost.id } });
  }

  // POST /api/community/:id/reply
  if (pathParts.length === 2 && pathParts[1] === "reply") {
    const postId = pathParts[0];
    const post = await getPost(context.env, postId);
    if (!post) return errorResponse("Post not found.", 404);

    const username = sanitize(body.username || "", 50);
    const replyBody = sanitize(body.body || "", 3000);

    if (!username) return errorResponse("You must be logged in to reply.");
    if (replyBody.length < 3) return errorResponse("Reply is too short.");

    // Rate limit
    const allowed = await checkReplyRateLimit(context.env, username);
    if (!allowed) {
      return errorResponse("Rate limit reached. Please wait before replying again.");
    }

    // Max 500 replies per post
    if ((post.replies || []).length >= 500) {
      return errorResponse("This post has reached the maximum number of replies.");
    }

    const reply: Reply = {
      id: generateId(),
      author: username,
      body: replyBody,
      createdAt: Date.now(),
    };

    post.replies = post.replies || [];
    post.replies.push(reply);
    await savePost(context.env, post);

    return jsonResponse({ success: true, reply: { id: reply.id } });
  }

  // POST /api/community/:id/vote
  if (pathParts.length === 2 && pathParts[1] === "vote") {
    const postId = pathParts[0];
    const post = await getPost(context.env, postId);
    if (!post) return errorResponse("Post not found.", 404);

    post.votes = (post.votes || 0) + 1;
    await savePost(context.env, post);

    return jsonResponse({ success: true, votes: post.votes });
  }

  return errorResponse("Invalid path.", 404);
};
