
/* =========================================================
   LENS CIRCLE — COMMUNITY MODULE
   File: assets/js/community.js

   FEATURES
   - Community feed
   - Create photography posts
   - Like and unlike posts
   - Comments and discussions
   - Delete own posts
   - Report inappropriate content
   - Member profile links
   - Feed pagination
   - Safe DOM rendering

   EXPECTED SUPABASE RPC CONTRACTS
   - get_community_feed
   - create_community_post
   - delete_community_post
   - toggle_community_reaction
   - get_post_comments
   - create_post_comment
   - delete_post_comment
   - report_community_content

   STORAGE
   Bucket: community-posts

   SECURITY
   - Backend derives user identity using auth.uid().
   - RLS controls post, comment and reaction access.
   - Users may delete only their own content.
   - Moderators use separate authorised moderation functions.
   - Never expose the Supabase service-role key.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Community = {};

  const CONFIG = {
    bucket: "community-posts",
    maxImageSize: 10 * 1024 * 1024,
    allowedImageTypes: [
      "image/jpeg",
      "image/png",
      "image/webp"
    ],
    pageSize: 12,
    maxPostLength: 2000,
    maxCommentLength: 1000
  };

  const state = {
    authorised: false,
    user: null,
    posts: [],
    comments: [],
    page: 0,
    hasMore: true,
    loading: false,
    currentPostId: null,
    filters: {
      search: "",
      category: "all"
    }
  };

  /* ---------------------------------------------------------
     HELPERS
  --------------------------------------------------------- */

  function clean(value, maxLength) {
    return String(value == null ? "" : value)
      .trim()
      .slice(0, maxLength || 500);
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function client() {
    if (LC.db) return LC.db;

    if (
      LC.supabase &&
      typeof LC.supabase.rpc === "function"
    ) {
      return LC.supabase;
    }

    throw new Error("Supabase client is unavailable.");
  }

  function notify(message, type) {
    if (
      LC.forms &&
      typeof LC.forms.notify === "function"
    ) {
      LC.forms.notify(message, type || "info");
    } else {
      console.info("[Lens Circle Community]", message);
    }
  }

  function makeElement(tag, className, content) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (content !== undefined) {
      node.textContent = clean(content, 3000);
    }

    return node;
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function setButtonLoading(button, loading) {
    if (!button) return;

    button.disabled = Boolean(loading);
    button.setAttribute(
      "aria-busy",
      String(Boolean(loading))
    );
  }

  function uuid() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    throw new Error(
      "Secure ID generation is unavailable in this browser."
    );
  }

  /* ---------------------------------------------------------
     AUTHENTICATION
  --------------------------------------------------------- */

  Community.verifyAccess = async function () {
    const { data, error } = await client()
      .auth.getSession();

    if (error) throw error;

    const session = data && data.session;

    if (!session) {
      state.authorised = false;
      return false;
    }

    state.user = session.user;
    state.authorised = true;

    return true;
  };

  Community.requireAccess = async function () {
    const allowed = await Community.verifyAccess();

    if (!allowed) {
      window.location.assign(
        "/member/login.html"
      );

      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     CENTRAL RPC
  --------------------------------------------------------- */

  Community.rpc = async function (name, params) {
    const { data, error } = await client().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error(
        "[Community RPC]",
        name,
        error
      );

      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     IMAGE VALIDATION AND UPLOAD
  --------------------------------------------------------- */

  Community.validateImage = function (file) {
    if (!file) {
      throw new Error("Please select a photograph.");
    }

    if (!CONFIG.allowedImageTypes.includes(file.type)) {
      throw new Error(
        "Use a JPEG, PNG or WebP photograph."
      );
    }

    if (file.size > CONFIG.maxImageSize) {
      throw new Error(
        "The maximum image size is 10 MB."
      );
    }

    return true;
  };

  Community.uploadImage = async function (file) {
    if (!state.authorised || !state.user) {
      throw new Error("Please sign in first.");
    }

    Community.validateImage(file);

    const extensionMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    const extension = extensionMap[file.type];

    const path =
      state.user.id +
      "/" +
      uuid() +
      "." +
      extension;

    const { data, error } = await client()
      .storage
      .from(CONFIG.bucket)
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });

    if (error) throw error;

    return {
      path: data.path,
      bucket: CONFIG.bucket
    };
  };

  Community.getImageUrl = function (path) {
    if (!path) return null;

    const { data } = client()
      .storage
      .from(CONFIG.bucket)
      .getPublicUrl(path);

    return data && data.publicUrl
      ? data.publicUrl
      : null;
  };

  /* ---------------------------------------------------------
     FEED
  --------------------------------------------------------- */

  Community.loadFeed = async function (options) {
    if (state.loading || !state.hasMore) {
      return state.posts;
    }

    state.loading = true;

    const settings = options || {};

    if (settings.reset) {
      state.page = 0;
      state.hasMore = true;
      state.posts = [];
    }

    try {
      const data = await Community.rpc(
        "get_community_feed",
        {
          p_page: state.page,
          p_page_size: CONFIG.pageSize,
          p_category:
            state.filters.category === "all"
              ? null
              : state.filters.category,
          p_search:
            state.filters.search || null
        }
      );

      const records = safeArray(data);

      if (settings.reset) {
        state.posts = records;
      } else {
        state.posts = state.posts.concat(records);
      }

      state.hasMore = records.length === CONFIG.pageSize;

      if (records.length) {
        state.page += 1;
      }

      Community.renderFeed(state.posts);

      return state.posts;

    } finally {
      state.loading = false;
    }
  };

  Community.refreshFeed = function () {
    return Community.loadFeed({
      reset: true
    });
  };

  Community.setCategory = function (category) {
    state.filters.category =
      clean(category, 50).toLowerCase() || "all";

    return Community.refreshFeed();
  };

  Community.setSearch = function (search) {
    state.filters.search = clean(search, 100);

    return Community.refreshFeed();
  };

  /* ---------------------------------------------------------
     CREATE POST
  --------------------------------------------------------- */

  Community.createPost = async function (payload) {
    if (!state.authorised) {
      throw new Error("Please sign in to publish.");
    }

    const title = clean(payload.title, 120);
    const content = clean(
      payload.content,
      CONFIG.maxPostLength
    );

    const category = clean(
      payload.category,
      50
    ).toLowerCase();

    const allowedCategories = [
      "photography",
      "discussion",
      "tips",
      "behind_the_shot",
      "equipment",
      "editing",
      "inspiration"
    ];

    if (!content) {
      throw new Error("Write something before publishing.");
    }

    if (!allowedCategories.includes(category)) {
      throw new Error("Select a valid post category.");
    }

    let imagePath = null;

    if (payload.file) {
      const uploaded = await Community.uploadImage(
        payload.file
      );

      imagePath = uploaded.path;
    }

    try {
      const result = await Community.rpc(
        "create_community_post",
        {
          p_title: title || null,
          p_content: content,
          p_category: category,
          p_image_path: imagePath
        }
      );

      notify("Your post has been published.", "success");

      await Community.refreshFeed();

      return result;

    } catch (error) {
      /*
       * If post creation fails after upload, the uploaded
       * file may remain in Storage. A trusted cleanup
       * process should remove unreferenced uploads.
       */
      throw error;
    }
  };

  /* ---------------------------------------------------------
     DELETE OWN POST
  --------------------------------------------------------- */

  Community.deletePost = async function (postId) {
    const id = clean(postId, 100);

    if (!id) {
      throw new Error("Post ID is required.");
    }

    if (!window.confirm(
      "Delete this post permanently?"
    )) {
      return false;
    }

    await Community.rpc(
      "delete_community_post",
      {
        p_post_id: id
      }
    );

    notify("Post deleted.", "success");

    await Community.refreshFeed();

    return true;
  };

  /* ---------------------------------------------------------
     REACTIONS
  --------------------------------------------------------- */

  Community.toggleReaction = async function (
    postId,
    reaction
  ) {
    const id = clean(postId, 100);
    const type = clean(
      reaction || "like",
      30
    ).toLowerCase();

    const allowed = [
      "like",
      "love",
      "inspiring"
    ];

    if (!id || !allowed.includes(type)) {
      throw new Error("Invalid reaction.");
    }

    const result = await Community.rpc(
      "toggle_community_reaction",
      {
        p_post_id: id,
        p_reaction: type
      }
    );

    const post = state.posts.find(function (item) {
      return String(item.id) === id;
    });

    if (post && result && typeof result === "object") {
      post.reaction_count = result.reaction_count;
      post.viewer_reaction = result.viewer_reaction;
    }

    Community.renderFeed(state.posts);

    return result;
  };

  /* ---------------------------------------------------------
     COMMENTS
  --------------------------------------------------------- */

  Community.getComments = async function (postId) {
    const id = clean(postId, 100);

    if (!id) {
      throw new Error("Post ID is required.");
    }

    state.currentPostId = id;

    const data = await Community.rpc(
      "get_post_comments",
      {
        p_post_id: id
      }
    );

    state.comments = safeArray(data);

    Community.renderComments(state.comments);

    return state.comments;
  };

  Community.addComment = async function (
    postId,
    content
  ) {
    const id = clean(postId, 100);
    const message = clean(
      content,
      CONFIG.maxCommentLength
    );

    if (!id || !message) {
      throw new Error(
        "Enter a comment before submitting."
      );
    }

    await Community.rpc(
      "create_post_comment",
      {
        p_post_id: id,
        p_content: message
      }
    );

    notify("Comment added.", "success");

    await Community.getComments(id);

    return true;
  };

  Community.deleteComment = async function (
    commentId
  ) {
    const id = clean(commentId, 100);

    if (!id) {
      throw new Error("Comment ID is required.");
    }

    if (!window.confirm("Delete this comment?")) {
      return false;
    }

    await Community.rpc(
      "delete_post_comment",
      {
        p_comment_id: id
      }
    );

    if (state.currentPostId) {
      await Community.getComments(
        state.currentPostId
      );
    }

    notify("Comment deleted.", "success");

    return true;
  };

  Community.renderComments = function (records) {
    const container = document.querySelector(
      "[data-community-comments]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      const empty = makeElement(
        "p",
        "community-empty",
        "Start the discussion with the first comment."
      );

      container.appendChild(empty);
      return;
    }

    records.forEach(function (record) {
      const card = makeElement(
        "article",
        "community-comment"
      );

      const author = makeElement(
        "strong",
        "community-comment-author",
        record.author_name || "Member"
      );

      const content = makeElement(
        "p",
        "community-comment-content",
        record.content
      );

      const date = makeElement(
        "small",
        "community-comment-date",
        formatDate(record.created_at)
      );

      card.append(author, content, date);

      if (
        state.user &&
        record.user_id === state.user.id
      ) {
        const remove = makeElement(
          "button",
          "community-comment-delete",
          "Delete"
        );

        remove.type = "button";

        remove.addEventListener("click", function () {
          Community.deleteComment(record.id)
            .catch(function (error) {
              notify(error.message, "error");
            });
        });

        card.appendChild(remove);
      }

      container.appendChild(card);
    });
  };

  /* ---------------------------------------------------------
     REPORT CONTENT
  --------------------------------------------------------- */

  Community.reportContent = async function (
    targetType,
    targetId,
    reason,
    details
  ) {
    const type = clean(targetType, 30).toLowerCase();
    const id = clean(targetId, 100);
    const explanation = clean(details, 1000);

    const allowedTypes = [
      "post",
      "comment"
    ];

    const allowedReasons = [
      "spam",
      "harassment",
      "copyright",
      "inappropriate",
      "misinformation",
      "other"
    ];

    const selectedReason = clean(
      reason,
      40
    ).toLowerCase();

    if (
      !allowedTypes.includes(type) ||
      !id ||
      !allowedReasons.includes(selectedReason)
    ) {
      throw new Error("Invalid report information.");
    }

    await Community.rpc(
      "report_community_content",
      {
        p_target_type: type,
        p_target_id: id,
        p_reason: selectedReason,
        p_details: explanation || null
      }
    );

    notify(
      "Thank you. Your report has been submitted for review.",
      "success"
    );

    return true;
  };

  /* ---------------------------------------------------------
     POST RENDERING
  --------------------------------------------------------- */

  Community.renderFeed = function (records) {
    const container = document.querySelector(
      "[data-community-feed]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      const empty = makeElement(
        "p",
        "community-empty",
        "No community posts found. Be the first to share something."
      );

      container.appendChild(empty);
      return;
    }

    records.forEach(function (post) {
      container.appendChild(
        Community.createPostCard(post)
      );
    });
  };

  Community.createPostCard = function (post) {
    const card = makeElement(
      "article",
      "community-post-card"
    );

    card.dataset.searchable = "true";

    const header = makeElement(
      "div",
      "community-post-header"
    );

    const author = makeElement(
      "strong",
      "community-post-author",
      post.author_name || "Lens Circle Member"
    );

    const date = makeElement(
      "small",
      "community-post-date",
      formatDate(post.created_at)
    );

    header.append(author, date);

    const category = makeElement(
      "span",
      "community-post-category",
      clean(post.category, 50).replace(/_/g, " ")
    );

    card.append(header, category);

    if (post.title) {
      card.appendChild(
        makeElement(
          "h3",
          "community-post-title",
          post.title
        )
      );
    }

    card.appendChild(
      makeElement(
        "p",
        "community-post-content",
        post.content
      )
    );

    const imageUrl =
      post.image_url ||
      Community.getImageUrl(post.image_path);

    if (imageUrl) {
      const image = document.createElement("img");

      image.src = imageUrl;
      image.alt = clean(
        post.title || "Community photograph",
        150
      );
      image.loading = "lazy";
      image.className = "community-post-image";

      image.addEventListener("error", function () {
        image.hidden = true;
      });

      card.appendChild(image);
    }

    const footer = makeElement(
      "div",
      "community-post-footer"
    );

    const likes = Number(post.reaction_count) || 0;
    const comments = Number(post.comment_count) || 0;

    const likeButton = makeElement(
      "button",
      "community-like-button",
      (post.viewer_reaction ? "Unlike" : "Like") +
      " · " + likes
    );

    likeButton.type = "button";
    likeButton.setAttribute(
      "aria-pressed",
      String(Boolean(post.viewer_reaction))
    );

    likeButton.addEventListener("click", async function () {
      setButtonLoading(likeButton, true);

      try {
        await Community.toggleReaction(
          post.id,
          "like"
        );
      } catch (error) {
        notify(error.message, "error");
      } finally {
        setButtonLoading(likeButton, false);
      }
    });

    const commentButton = makeElement(
      "button",
      "community-comment-button",
      "Comments · " + comments
    );

    commentButton.type = "button";

    commentButton.addEventListener("click", async function () {
      try {
        await Community.getComments(post.id);

        const panel = document.querySelector(
          "[data-community-comment-panel]"
        );

        if (panel) {
          panel.hidden = false;
        }
      } catch (error) {
        notify(error.message, "error");
      }
    });

    footer.append(likeButton, commentButton);

    if (
      state.user &&
      post.user_id === state.user.id
    ) {
      const removeButton = makeElement(
        "button",
        "community-delete-button",
        "Delete post"
      );

      removeButton.type = "button";

      removeButton.addEventListener("click", function () {
        Community.deletePost(post.id)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      footer.appendChild(removeButton);
    } else {
      const reportButton = makeElement(
        "button",
        "community-report-button",
        "Report"
      );

      reportButton.type = "button";

      reportButton.addEventListener("click", function () {
        Community.promptReport("post", post.id);
      });

      footer.appendChild(reportButton);
    }

    card.appendChild(footer);

    return card;
  };

  /* ---------------------------------------------------------
     REPORT PROMPT
 