
/* =========================================================
   LENS CIRCLE — MESSAGING MODULE
   File: assets/js/messaging.js

   FEATURES
   - Private member conversations
   - Conversation list
   - Message history
   - Send and receive messages
   - Unread message counts
   - Mark messages as read
   - Start conversations with members
   - Block and unblock members
   - Report inappropriate messages
   - Realtime message updates

   EXPECTED SUPABASE RPC CONTRACTS
   - get_my_conversations
   - get_conversation_messages
   - send_private_message
   - start_member_conversation
   - mark_conversation_read
   - get_my_unread_message_count
   - block_member
   - unblock_member
   - report_private_message

   EXPECTED TABLES
   - conversations
   - conversation_members
   - private_messages
   - blocked_members

   SECURITY
   - Only conversation participants can read messages.
   - Backend derives sender identity using auth.uid().
   - Users cannot send messages as another member.
   - Blocked users cannot initiate or continue prohibited contact.
   - Message access and reporting are enforced by RLS/RPC.
   - Never expose the Supabase service-role key.
   ========================================================= */

(function (window, document) {
  "use strict";

  const LC = window.LensCircle = window.LensCircle || {};
  const Messaging = {};

  const CONFIG = {
    pageSize: 40,
    maxMessageLength: 5000,
    realtimeEnabled: true
  };

  const state = {
    authorised: false,
    user: null,
    conversations: [],
    messages: [],
    activeConversationId: null,
    currentPage: 0,
    hasMore: true,
    loading: false,
    channel: null,
    realtimeCallback: null,
    unreadCount: 0,
    blockedMembers: []
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
      console.info("[Lens Circle Messaging]", message);
    }
  }

  function makeElement(tag, className, content) {
    const node = document.createElement(tag);

    if (className) node.className = className;

    if (content !== undefined) {
      node.textContent = clean(content, 5000);
    }

    return node;
  }

  function formatTime(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function setLoading(button, loading) {
    if (!button) return;

    button.disabled = Boolean(loading);
    button.setAttribute(
      "aria-busy",
      String(Boolean(loading))
    );
  }

  function currentConversation() {
    return state.conversations.find(function (item) {
      return String(item.id) ===
        String(state.activeConversationId);
    }) || null;
  }

  /* ---------------------------------------------------------
     AUTHENTICATION
  --------------------------------------------------------- */

  Messaging.verifyAccess = async function () {
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

  Messaging.requireAccess = async function () {
    const allowed = await Messaging.verifyAccess();

    if (!allowed) {
      window.location.assign(
        "/member/login.html"
      );

      return false;
    }

    return true;
  };

  /* ---------------------------------------------------------
     RPC WRAPPER
  --------------------------------------------------------- */

  Messaging.rpc = async function (name, params) {
    if (!state.authorised) {
      throw new Error("Please sign in to use messaging.");
    }

    const { data, error } = await client().rpc(
      name,
      params || {}
    );

    if (error) {
      console.error(
        "[Messaging RPC]",
        name,
        error
      );

      throw error;
    }

    return data;
  };

  /* ---------------------------------------------------------
     CONVERSATIONS
  --------------------------------------------------------- */

  Messaging.getConversations = async function () {
    const data = await Messaging.rpc(
      "get_my_conversations"
    );

    state.conversations = safeArray(data);

    Messaging.renderConversations(
      state.conversations
    );

    return state.conversations;
  };

  Messaging.startConversation = async function (
    memberId,
    initialMessage
  ) {
    const recipientId = clean(memberId, 100);
    const message = clean(
      initialMessage,
      CONFIG.maxMessageLength
    );

    if (!recipientId) {
      throw new Error("Select a member first.");
    }

    if (recipientId === state.user.id) {
      throw new Error(
        "You cannot start a conversation with yourself."
      );
    }

    const result = await Messaging.rpc(
      "start_member_conversation",
      {
        p_member_id: recipientId,
        p_initial_message: message || null
      }
    );

    await Messaging.getConversations();

    const conversationId =
      typeof result === "string"
        ? result
        : result && result.conversation_id;

    if (conversationId) {
      await Messaging.openConversation(conversationId);
    }

    return result;
  };

  Messaging.openConversation = async function (
    conversationId
  ) {
    const id = clean(conversationId, 100);

    if (!id) {
      throw new Error("Conversation ID is required.");
    }

    state.activeConversationId = id;
    state.currentPage = 0;
    state.hasMore = true;
    state.messages = [];

    Messaging.renderActiveConversation();

    await Messaging.loadMessages({
      reset: true
    });

    await Messaging.markRead(id);

    await Messaging.subscribeToConversation(id);

    return state.messages;
  };

  Messaging.renderConversations = function (records) {
    const container = document.querySelector(
      "[data-message-conversations]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        makeElement(
          "p",
          "message-empty",
          "You have no conversations yet."
        )
      );

      return;
    }

    records.forEach(function (conversation) {
      const button = makeElement(
        "button",
        "message-conversation"
      );

      button.type = "button";

      const name = makeElement(
        "strong",
        "message-conversation-name",
        conversation.other_member_name || "Member"
      );

      const preview = makeElement(
        "p",
        "message-conversation-preview",
        conversation.last_message || "Start a conversation"
      );

      const time = makeElement(
        "small",
        "message-conversation-time",
        formatTime(conversation.last_message_at)
      );

      button.append(name, preview, time);

      const unread = Number(
        conversation.unread_count
      ) || 0;

      if (unread > 0) {
        button.appendChild(
          makeElement(
            "span",
            "message-unread-badge",
            unread > 99 ? "99+" : String(unread)
          )
        );
      }

      if (
        String(conversation.id) ===
        String(state.activeConversationId)
      ) {
        button.classList.add("active");
      }

      button.addEventListener("click", function () {
        Messaging.openConversation(conversation.id)
          .catch(function (error) {
            notify(error.message, "error");
          });
      });

      container.appendChild(button);
    });
  };

  Messaging.renderActiveConversation = function () {
    const conversation = currentConversation();

    const title = document.querySelector(
      "[data-message-recipient]"
    );

    if (title) {
      title.textContent = conversation
        ? clean(
            conversation.other_member_name || "Conversation",
            150
          )
        : "Select a conversation";
    }

    const container = document.querySelector(
      "[data-message-history]"
    );

    if (container) container.replaceChildren();
  };

  /* ---------------------------------------------------------
     MESSAGE HISTORY
  --------------------------------------------------------- */

  Messaging.loadMessages = async function (options) {
    const settings = options || {};
    const conversationId = state.activeConversationId;

    if (!conversationId || state.loading) {
      return state.messages;
    }

    state.loading = true;

    if (settings.reset) {
      state.currentPage = 0;
      state.hasMore = true;
      state.messages = [];
    }

    try {
      const data = await Messaging.rpc(
        "get_conversation_messages",
        {
          p_conversation_id: conversationId,
          p_page: state.currentPage,
          p_page_size: CONFIG.pageSize
        }
      );

      const records = safeArray(data);

      if (settings.reset) {
        state.messages = records;
      } else {
        state.messages = records.concat(state.messages);
      }

      state.hasMore =
        records.length === CONFIG.pageSize;

      if (records.length) {
        state.currentPage += 1;
      }

      Messaging.renderMessages(state.messages);

      return state.messages;

    } finally {
      state.loading = false;
    }
  };

  Messaging.loadOlderMessages = function () {
    if (!state.hasMore) return Promise.resolve([]);

    return Messaging.loadMessages();
  };

  Messaging.renderMessages = function (records) {
    const container = document.querySelector(
      "[data-message-history]"
    );

    if (!container) return;

    container.replaceChildren();

    if (!records.length) {
      container.appendChild(
        makeElement(
          "p",
          "message-empty",
          "This is the beginning of your conversation."
        )
      );

      return;
    }

    records.forEach(function (message) {
      const mine =
        message.sender_id === state.user.id;

      const wrapper = makeElement(
        "article",
        mine
          ? "private-message mine"
          : "private-message received"
      );

      const sender = makeElement(
        "strong",
        "private-message-sender",
        mine
          ? "You"
          : message.sender_name || "Member"
      );

      const content = makeElement(
        "p",
        "private-message-content",
        message.content
      );

      const timestamp = makeElement(
        "small",
        "private-message-time",
        formatTime(message.created_at)
      );

      wrapper.append(sender, content, timestamp);

      if (mine && message.id) {
        wrapper.dataset.messageId = message.id;
      }

      container.appendChild(wrapper);
    });

    container.scrollTop = container.scrollHeight;
  };

  /* ---------------------------------------------------------
     SEND MESSAGE
  --------------------------------------------------------- */

  Messaging.sendMessage = async function (content) {
    const conversationId = state.activeConversationId;
    const message = clean(
      content,
      CONFIG.maxMessageLength
    );

    if (!conversationId) {
      throw new Error("Open a conversation first.");
    }

    if (!message) {
      throw new Error("Enter a message.");
    }

    await Messaging.rpc(
      "send_private_message",
      {
        p_conversation_id: conversationId,
        p_content: message
      }
    );

    await Messaging.loadMessages({
      reset: true
    });

    await Messaging.getConversations();

    return true;
  };

  Messaging.bindMessageForm = function () {
    const form = document.querySelector(
      "[data-message-form]"
    );

    if (!form || form.dataset.bound === "true") return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const input = form.querySelector(
        '[name="message"]'
      );

      if (!input) return;

      const button = form.querySelector(
        '[type="submit"]'
      );

      setLoading(button, true);

      try {
        await Messaging.sendMessage(input.value);
        input.value = "";
      } catch (error) {
        notify(error.message, "error");
      } finally {
        setLoading(button, false);
      }
    });
  };

  /* ---------------------------------------------------------
     MARK AS READ
  --------------------------------------------------------- */

  Messaging.markRead = async function (conversationId) {
    const id = clean(
      conversationId || state.activeConversationId,
      100
    );

    if (!id) return false;

    await Messaging.rpc(
      "mark_conversation_read",
      {
        p_conversation_id: id
      }
    );

    await Messaging.getUnreadCount();

    return true;
  };

  /* ---------------------------------------------------------
     UNREAD COUNTS
  --------------------------------------------------------- */

  Messaging.getUnreadCount = async function () {
    const data = await Messaging.rpc(
      "get_my_unread_message_count"
    );

    const value = Number(
      typeof data === "object" && data !== null
        ? data.unread_count
        : data
    ) || 0;

    state.unreadCount = value;

    document.querySelectorAll(
      "[data-message-unread-count]"
    ).forEach(function (node) {
      node.textContent = String(value);
      node.hidden = value === 0;
    });

    return value;
  };

  /* ---------------------------------------------------------
     BLOCK MEMBER
  --------------------------------------------------------- */

  Messaging.blockMember = async function (memberId) {
    const id = clean(memberId, 100);

    if (!id || id === state.user.id) {
      throw new Error("Invalid member selection.");
    }

    if (!window.confirm(
      "Block this member? They may no longer be able to contact you."
    )) {
      return false;
    }

    await Messaging.rpc(
      "block_member",
      {
        p_member_id: id
      }
    );

    notify("Member blocked.", "success");

    await Messaging.getConversations();

    return true;
  };

  Messaging.unblockMember = async function (memberId) {
    const id = clean(memberId, 100);

    if (!id) {
      throw new Error("Member ID is required.");
    }

    await Messaging.rpc(
      "unblock_member",
      {
        p_member_id: id
      }
    );

    notify("Member unblocked.", "success");

    return true;
  };

  /* ---------------------------------------------------------
     REPORT MESSAGE
  --------------------------------------------------------- */

  Messaging.reportMessage = async function (
    messageId,
    reason,
    details
  ) {
    const id = clean(messageId, 100);
    const selectedReason = clean(reason, 40).toLowerCase();

    const allowedReasons = [
      "harassment",
      "spam",
      "inappropriate",
      "threats",
      "other"
    ];

    if (
      !id ||
      !allowedReasons.includes(selectedReason)
    ) {
      throw new Error("Invalid report information.");
    }

    await Messaging.rpc(
      "report_private_message",
      {
        p_message_id: id,
        p_reason: selectedReason,
        p_details: clean(details, 1000) || null
      }
    );

    notify(
      "Your report has been submitted.",
      "success"
    );

    return true;
  };

  /* ---------------------------------------------------------
     REALTIME UPDATES
  --------------------------------------------------------- */

  Messaging.unsubscribe = async function () {
    if (!state.channel) return;

    await client().removeChannel(state.channel);

    state.channel = null;
  };

  Messaging.subscribeToConversation = async function (
    conversationId
  ) {
    if (!CONFIG.realtimeEnabled) return;

    await Messaging.unsubscribe();

    const id = clean(conversationId, 100);

    if (!id) return;

    /*
     * This subscription assumes private_messages is
     * configured for Supabase Realtime.
     *
     * RLS must restrict visible rows to participants.
     */
    state.channel = client()
      .channel("private-messages-" + id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_messages",
          filter: "conversation_id=eq." + id
        },
        async function (payload) {
          const incoming = payload.new;

          if (
            !incoming ||
            incoming.sender_id === state.user.id
          ) {
            return;
          }

          if (
            String(state.activeConversationId) !==
            String(id)
          ) {
            return;
          }

          try {
            await Messaging.loadMessages({
              reset: true
            });

            await Messaging.markRead(id);

            await Messaging.getConversations();

          } catch (error) {
            console.error(
              "Realtime message refresh failed:",
              error
            );
          }
        }
      )
      .subscribe();
  };

  /* ---------------------------------------------------------
     FORM BINDINGS
  --------------------------------------------------------- */

  Messaging.bindConversationStartForm = function () {
    const form = document.querySelector(
      "[data-start-conversation-form]"
    );

    if (!form || form.dataset.bound === "true") return;

    form.dataset.bound = "true";

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const memberInput = form.querySelector(
        '[name="member_id"]'
      );

      const messageInput = form.querySelector(
        '[name="initial_message"]'
      );

      const button = form.querySelector(
        '[type="submit"]'
      );

      if (!memberInput) return;

      setLoading(button, true);

      try {
        await Messaging.startConversation(
          memberInput.value,
          messageInput ? messageInput.value : ""
        );

        form.reset();

      } catch (error) {
        notify(error.message, "error");
      } finally {
        setLoading(button, false);
      }
    });
  };

  /* ---------------------------------------------------------
     INITIALISATION
  --------------------------------------------------------- */

  Messaging.init = async function () {
    const allowed = await Messaging.requireAccess();

    if (!allowed) return false;

    Messaging.bindMessageForm();
    Messaging.bindConversationStartForm();

    await Promise.all([
      Messaging.getConversations(),
      Messaging.getUnreadCount()
    ]);

    return true;
  };

  /* ---------------------------------------------------------
     CLEANUP
  --------------------------------------------------------- */

  Messaging.destroy = async function () {
    await Messaging.unsubscribe();

    state.activeConversationId = null;
    state.messages = [];
    state.realtimeCallback = null;
  };

  /* -----------------------