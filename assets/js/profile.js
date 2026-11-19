
/**
 * LENS CIRCLE — PROFILE MODULE
 * File: assets/js/profile.js
 *
 * Features:
 * - Retrieve authenticated user's profile
 * - Update personal profile information
 * - Upload and update profile avatar
 * - Retrieve public photographer profiles
 * - Render profile information safely
 * - Validate profile fields
 *
 * REQUIRED SUPABASE TABLE:
 * public.profiles
 *
 * Suggested columns:
 * id UUID PRIMARY KEY REFERENCES auth.users(id)
 * full_name TEXT
 * username TEXT UNIQUE
 * bio TEXT
 * location TEXT
 * website TEXT
 * photography_interests TEXT[]
 * avatar_url TEXT
 * is_public BOOLEAN DEFAULT TRUE
 * created_at TIMESTAMPTZ
 * updated_at TIMESTAMPTZ
 *
 * REQUIRED STORAGE BUCKET:
 * profile-images
 *
 * SECURITY:
 * - Users can update only their own profiles.
 * - Username uniqueness must be enforced by a database constraint.
 * - Profile URLs and metadata are not role permissions.
 * - Storage policies must restrict uploads to the authenticated owner.
 * - Public profile reads must follow the visibility policy.
 */

(function () {
  "use strict";

  const CONFIG = {
    table: "profiles",
    bucket: "profile-images",
    maxAvatarSize: 5 * 1024 * 1024,

    allowedAvatarTypes: [
      "image/jpeg",
      "image/png",
      "image/webp"
    ],

    usernameMinLength: 3,
    usernameMaxLength: 24,
    bioMaxLength: 500,
    nameMaxLength: 80
  };

  const state = {
    profile: null,
    loading: false,
    uploading: false
  };

  function client() {
    if (window.LensCircle?.db) {
      return window.LensCircle.db;
    }

    if (window.supabaseClient) {
      return window.supabaseClient;
    }

    throw new Error(
      "Lens Circle Supabase client is unavailable."
    );
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
    );
  }

  function validateUsername(username) {
    const value = String(username || "").trim();

    if (
      value.length < CONFIG.usernameMinLength ||
      value.length > CONFIG.usernameMaxLength
    ) {
      throw new Error(
        `Username must be ${CONFIG.usernameMinLength}–${CONFIG.usernameMaxLength} characters long.`
      );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      throw new Error(
        "Username may contain only letters, numbers and underscores."
      );
    }

    return value.toLowerCase();
  }

  function validateProfile(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Profile information is required.");
    }

    const fullName = String(
      payload.full_name || ""
    ).trim();

    const bio = String(payload.bio || "").trim();

    if (!fullName) {
      throw new Error("Please enter your full name.");
    }

    if (fullName.length > CONFIG.nameMaxLength) {
      throw new Error("Your name is too long.");
    }

    if (bio.length > CONFIG.bioMaxLength) {
      throw new Error(
        `Bio cannot exceed ${CONFIG.bioMaxLength} characters.`
      );
    }

    return {
      full_name: fullName,
      username: validateUsername(payload.username),
      bio,
      location: String(payload.location || "").trim(),
      website: normaliseWebsite(payload.website || ""),
      photography_interests: Array.isArray(
        payload.photography_interests
      )
        ? payload.photography_interests
            .map(item => String(item).trim())
            .filter(Boolean)
            .slice(0, 20)
        : [],
      is_public: payload.is_public !== false
    };
  }

  function normaliseWebsite(value) {
    const website = String(value || "").trim();

    if (!website) return null;

    let parsed;

    try {
      parsed = new URL(
        /^https?:\/\//i.test(website)
          ? website
          : `https://${website}`
      );
    } catch {
      throw new Error("Please enter a valid website URL.");
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only HTTP and HTTPS websites are allowed.");
    }

    return parsed.href;
  }

  async function getCurrentUser() {
    const { data, error } = await client().auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      throw new Error("Please sign in to continue.");
    }

    return data.user;
  }

  async function getMine() {
    state.loading = true;

    try {
      const user = await getCurrentUser();

      const { data, error } = await client()
        .from(CONFIG.table)
        .select(
          "id, full_name, username, bio, location, website, photography_interests, avatar_url, is_public, created_at, updated_at"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      state.profile = data || {
        id: user.id,
        full_name: user.user_metadata?.full_name || "",
        username: user.user_metadata?.username || "",
        bio: "",
        location: "",
        website: "",
        photography_interests: [],
        avatar_url: "",
        is_public: true
      };

      return {
        success: true,
        data: state.profile
      };

    } catch (error) {
      console.error("Profile retrieval failed:", error);

      return {
        success: false,
        data: null,
        error: error.message || "Unable to load profile."
      };

    } finally {
      state.loading = false;
    }
  }

  async function update(payload) {
    const user = await getCurrentUser();
    const profile = validateProfile(payload);

    const { data, error } = await client()
      .from(CONFIG.table)
      .upsert(
        {
          id: user.id,
          ...profile,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "id"
        }
      )
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error(
          "This username is already taken. Please choose another."
        );
      }

      throw error;
    }

    state.profile = data;

    return {
      success: true,
      data
    };
  }

  function validateAvatar(file) {
    if (!file) {
      throw new Error("Please choose an image.");
    }

    if (!CONFIG.allowedAvatarTypes.includes(file.type)) {
      throw new Error(
        "Choose a JPG, PNG or WebP image."
      );
    }

    if (file.size > CONFIG.maxAvatarSize) {
      throw new Error(
        "Profile image must be smaller than 5 MB."
      );
    }

    return true;
  }

  function getExtension(file) {
    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    return extensions[file.type];
  }

  async function uploadAvatar(file) {
    validateAvatar(file);

    const user = await getCurrentUser();

    state.uploading = true;

    try {
      const extension = getExtension(file);
      const path = `${user.id}/avatar.${extension}`;

      const { error: uploadError } = await client()
        .storage
        .from(CONFIG.bucket)
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600"
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = client()
        .storage
        .from(CONFIG.bucket)
        .getPublicUrl(path);

      const avatarUrl = urlData?.publicUrl;

      if (!avatarUrl) {
        throw new Error(
          "Could not retrieve the uploaded image URL."
        );
      }

      const { data, error } = await client()
        .from(CONFIG.table)
        .upsert(
          {
            id: user.id,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: "id"
          }
        )
        .select()
        .single();

      if (error) throw error;

      state.profile = data;

      return {
        success: true,
        data,
        avatarUrl
      };

    } finally {
      state.uploading = false;
    }
  }

  async function getPublic(username) {
    const value = validateUsername(username);

    const { data, error } = await client()
      .from(CONFIG.table)
      .select(
        "full_name, username, bio, location, website, photography_interests, avatar_url, created_at"
      )
      .eq("username", value)
      .eq("is_public", true)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("Photographer profile not found.");
    }

    return {
      success: true,
      data
    };
  }

  function renderProfile(container, profile) {
    if (!container || !profile) return;

    const avatar = profile.avatar_url
      ? `
        <img
          src="${escapeHTML(profile.avatar_url)}"
          alt="${escapeHTML(profile.full_name || "Photographer")}"
        >
      `
      : `
        <div class="lc-profile-avatar-placeholder">
          ${escapeHTML(
            (profile.full_name || "L").charAt(0).toUpperCase()
          )}
        </div>
      `;

    const interests = Array.isArray(
      profile.photography_interests
    )
      ? profile.photography_interests
      : [];

    container.innerHTML = `
      <section class="lc-profile-view">

        <div class="lc-profile-view__avatar">
          ${avatar}
        </div>

        <div class="lc-profile-view__information">
          <h2>${escapeHTML(profile.full_name || "Photographer")}</h2>

          <p class="lc-profile-username">
            @${escapeHTML(profile.username || "")}
          </p>

          <p>${escapeHTML(profile.bio || "")}</p>

          <p class="lc-profile-location">
            ${escapeHTML(profile.location || "")}
          </p>

          ${
            profile.website
              ? `<a href="${escapeHTML(profile.website)}"
                   target="_blank"
                   rel="noopener noreferrer">
                   Visit website
                 </a>`
              : ""
          }

          <div class="lc-profile-interests">
            ${interests.map(item => `
              <span>${escapeHTML(item)}</span>
            `).join("")}
          </div>
        </div>

      </section>
    `;
  }

  function fillForm(form, profile) {
    if (!form || !profile) return;

    const fields = [
      "full_name",
      "username",
      "bio",
      "location",
      "website"
    ];

    fields.forEach(name => {
      const input = form.elements.namedItem(name);

      if (input) {
        input.value = profile[name] || "";
      }
    });

    const publicField = form.elements.namedItem("is_public");

    if (publicField) {
      publicField.checked = profile.is_public !== false;
    }

    const interestsField = form.elements.namedItem(
      "photography_interests"
    );

    if (interestsField) {
      interestsField.value = Array.isArray(
        profile.photography_interests
      )
        ? profile.photography_interests.join(", ")
        : "";
    }

    const avatar = form.querySelector("[data-profile-avatar]");

    if (avatar && profile.avatar_url) {
      avatar.src = profile.avatar_url;
    }
  }

  function getFormPayload(form) {
    const interests = String(
      form.elements.namedItem("photography_interests")?.value || ""
    )
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);

    return {
      full_name: form.elements.namedItem("full_name")?.value,
      username: form.elements.namedItem("username")?.value,
      bio: form.elements.namedItem("bio")?.value,
      location: form.elements.namedItem("location")?.value,
      website: form.elements.namedItem("website")?.value,
      photography_interests: interests,
      is_public:
        form.elements.namedItem("is_public")?.checked !== false
    };
  }

  function bindForm(form, options = {}) {
    if (!form) return;

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const button = form.querySelector(
        '[type="submit"]'
      );

      if (button) button.disabled = true;

      try {
        const result = await update(
          getFormPayload(form)
        );

        if (options.onSuccess) {
          options.onSuccess(result.data);
        }

        window.dispatchEvent(
          new CustomEvent("lenscircle:profile-updated", {
            detail: result.data
          })
        );

      } catch (error) {
        console.error("Profile update failed:", error);

        if (options.onError) {
          options.onError(error);
        } else {
          window.alert(error.message || "Unable to save profile.");
        }

      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  function bindAvatarInput(input, options = {}) {
    if (!input) return;

    input.addEventListener("change", async () => {
      const file = input.files?.[0];

      if (!file) return;

      try {
        const result = await uploadAvatar(file);

        if (options.preview) {
          const preview = document.querySelector(options.preview);

          if (preview) {
            preview.src = result.avatarUrl;
          }
        }

        if (options.onSuccess) {
          options.onSuccess(result);
        }

      } catch (error) {
        console.error("Avatar upload failed:", error);

        if (options.onError) {
          options.onError(error);
        } else {
          window.alert(error.message || "Unable to upload image.");
        }

      } finally {
        input.value = "";
      }
    });
  }

  async function initialise(options = {}) {
    const form = document.querySelector(
      options.form || "[data-profile-form]"
    );

    const avatarInput = document.querySelector(
      options.avatarInput || "[data-profile-avatar-input]"
    );

    const result = await getMine();

    if (!result.success) {
      return result;
    }

    if (form) {
      fillForm(form, result.data);
      bindForm(form, options);
    }

    if (avatarInput) {
      bindAvatarInput(avatarInput, {
        preview: options.preview || "[data-profile-avatar]",
        onSuccess: options.onAvatarSuccess,
        onError: options.onError
      });
    }

    return result;
  }

  window.LensCircleProfile = {
    config: CONFIG,
    state,
    getCurrentUser,
    getMine,
    update,
    uploadAvatar,
    getPublic,
    validateProfile,
    validateUsername,
    renderProfile,
    fillForm,
    bindForm,
    bindAvatarInput,
    initialise
  };

})();
