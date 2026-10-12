import { profileAliasesSchema } from "./profile-aliases.js";
import { randomUUID } from "node:crypto";
import { backfillDefaultFriend } from "./default-friend.js";
import { isReservedProfileUsername } from "./profile-paths.js";
import { hashPassword } from "./security.js";
import { isMemoryDatabase, query, transaction } from "./db.js";
import { backfillWishGroupSpaces } from "./wish-groups.js";
import { externalCatalogBrandsSchema } from "./external-catalog-brands.js";
import { rollsSchema } from "./rolls.js";
import { businessMarketplaceSchema } from "./business-marketplace.js";
import { planningSchema } from "./planning.js";

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'personal' CHECK (account_type IN ('personal', 'business')),
    bio TEXT NOT NULL DEFAULT '',
    birthday DATE,
    avatar_url TEXT NOT NULL DEFAULT '',
    phone_hash TEXT,
    phone_last4 TEXT,
    phone_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  ${profileAliasesSchema}

  ${rollsSchema}

  ${businessMarketplaceSchema}

  ${planningSchema}

  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_hash TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_last4 TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'personal';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_hash_unique
    ON users(phone_hash) WHERE phone_hash IS NOT NULL;

  CREATE TABLE IF NOT EXISTS telegram_identities (
    telegram_user_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    photo_url TEXT NOT NULL DEFAULT '',
    language_code TEXT NOT NULL DEFAULT '',
    linked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_telegram_identities_user
    ON telegram_identities(user_id);

  CREATE TABLE IF NOT EXISTS yandex_identities (
    yandex_user_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    login TEXT NOT NULL DEFAULT '',
    default_email TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    linked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_yandex_identities_user
    ON yandex_identities(user_id);

  CREATE TABLE IF NOT EXISTS user_ai_credentials (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    encrypted_secret TEXT NOT NULL,
    secret_hint TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider)
  );

  ALTER TABLE user_ai_credentials ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT '';

  CREATE TABLE IF NOT EXISTS yandex_oauth_attempts (
    state_hash TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    next_path TEXT NOT NULL,
    purpose TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_yandex_oauth_attempts_expires
    ON yandex_oauth_attempts(expires_at);

  CREATE TABLE IF NOT EXISTS default_follow_targets (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sphere_section_shares (
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sphere TEXT NOT NULL,
    section TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (owner_user_id, viewer_user_id, sphere, section),
    CHECK (owner_user_id <> viewer_user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sphere_section_shares_viewer
    ON sphere_section_shares(viewer_user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS sphere_access_requests (
    id TEXT PRIMARY KEY,
    requester_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sphere TEXT NOT NULL,
    section TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMPTZ,
    UNIQUE (requester_user_id, owner_user_id, sphere, section),
    CHECK (requester_user_id <> owner_user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sphere_access_requests_owner
    ON sphere_access_requests(owner_user_id, status, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_sphere_access_requests_requester
    ON sphere_access_requests(requester_user_id, status, created_at DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    provider_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS phone_auth_challenges (
    id TEXT PRIMARY KEY,
    phone_hash TEXT NOT NULL,
    phone_last4 TEXT NOT NULL,
    purpose TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    request_ip_hash TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    provider_message_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wishlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    privacy TEXT NOT NULL DEFAULT 'public',
    occasion_date DATE,
    color TEXT NOT NULL DEFAULT 'coral',
    share_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  ALTER TABLE wishlists ADD COLUMN IF NOT EXISTS space TEXT NOT NULL DEFAULT 'products';

  CREATE TABLE IF NOT EXISTS wishes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    vehicle_make TEXT NOT NULL DEFAULT '',
    vehicle_model TEXT NOT NULL DEFAULT '',
    price NUMERIC(12, 2),
    currency TEXT NOT NULL DEFAULT 'RUB',
    priority INTEGER NOT NULL DEFAULT 2,
    privacy TEXT NOT NULL DEFAULT 'inherit',
    allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  ALTER TABLE wishes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE wishes ADD COLUMN IF NOT EXISTS event_date DATE;
  ALTER TABLE wishes ADD COLUMN IF NOT EXISTS space TEXT;
  ALTER TABLE wishes ADD COLUMN IF NOT EXISTS fundraising_url TEXT NOT NULL DEFAULT '';
  ALTER TABLE wishes ADD COLUMN IF NOT EXISTS vehicle_make TEXT NOT NULL DEFAULT '';
  ALTER TABLE wishes ADD COLUMN IF NOT EXISTS vehicle_model TEXT NOT NULL DEFAULT '';
  ALTER TABLE wishes ADD COLUMN IF NOT EXISTS source_wish_id TEXT REFERENCES wishes(id) ON DELETE SET NULL;
  ALTER TABLE wishes ADD COLUMN IF NOT EXISTS catalog_item_key TEXT;

  CREATE TABLE IF NOT EXISTS external_catalog_items (
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    price NUMERIC(12, 2),
    currency TEXT NOT NULL DEFAULT 'RUB',
    space TEXT NOT NULL DEFAULT 'products',
    source_label TEXT NOT NULL,
    source_home_url TEXT NOT NULL,
    source_logo_url TEXT NOT NULL DEFAULT '',
    categories_json TEXT NOT NULL DEFAULT '[]',
    source_rank INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source, external_id)
  );

  CREATE INDEX IF NOT EXISTS idx_external_catalog_items_space
    ON external_catalog_items(space, active, source_rank);

  ${externalCatalogBrandsSchema}

  CREATE TABLE IF NOT EXISTS catalog_preserved_items (
    id TEXT PRIMARY KEY,
    space TEXT NOT NULL,
    snapshot JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_catalog_preserved_items_space ON catalog_preserved_items(space);

  CREATE TABLE IF NOT EXISTS catalog_item_likes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, item_key)
  );

  CREATE INDEX IF NOT EXISTS idx_catalog_item_likes_item
    ON catalog_item_likes(item_key, created_at DESC);

  CREATE TABLE IF NOT EXISTS wish_marketplace_offer_snapshots (
    wish_id TEXT PRIMARY KEY REFERENCES wishes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    offers_json TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    searched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_wish_marketplace_offer_snapshots_user
    ON wish_marketplace_offer_snapshots(user_id, searched_at DESC);

  CREATE TABLE IF NOT EXISTS wish_book_notes (
    wish_id TEXT PRIMARY KEY REFERENCES wishes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary TEXT NOT NULL DEFAULT '',
    key_ideas TEXT NOT NULL DEFAULT '',
    quotes TEXT NOT NULL DEFAULT '',
    applications TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_wish_book_notes_user_updated
    ON wish_book_notes(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS wish_images (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime_type TEXT NOT NULL,
    image_data BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lab_report_uploads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    pdf_data BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL,
    file_hash TEXT NOT NULL,
    report_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, file_hash)
  );

  CREATE TABLE IF NOT EXISTS lab_report_deletions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_key TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, report_key)
  );

  CREATE TABLE IF NOT EXISTS education_lists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section TEXT NOT NULL CHECK (section IN ('courses','conferences','coaching','workouts')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  ALTER TABLE education_lists DROP CONSTRAINT IF EXISTS education_lists_section_check;
  ALTER TABLE education_lists
    ADD CONSTRAINT education_lists_section_check
    CHECK (section IN ('courses','conferences','coaching','workouts'));

  CREATE TABLE IF NOT EXISTS education_courses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed')),
    url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    started_on DATE,
    completed_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (started_on IS NULL OR completed_on IS NULL OR completed_on >= started_on)
  );

  ALTER TABLE education_courses
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

  ALTER TABLE education_courses
    ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '';

  ALTER TABLE education_courses
    ADD COLUMN IF NOT EXISTS list_id TEXT REFERENCES education_lists(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS education_course_groups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_id TEXT REFERENCES education_lists(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Группа',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS education_course_group_members (
    group_id TEXT NOT NULL REFERENCES education_course_groups(id) ON DELETE CASCADE,
    course_id TEXT PRIMARY KEY REFERENCES education_courses(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS education_item_groups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section TEXT NOT NULL CHECK (section IN ('conferences','coaching')),
    list_id TEXT REFERENCES education_lists(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Группа',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id,section)
  );

  CREATE TABLE IF NOT EXISTS education_item_group_members (
    group_id TEXT NOT NULL,
    section TEXT NOT NULL CHECK (section IN ('conferences','coaching')),
    item_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (section,item_id),
    FOREIGN KEY (group_id,section) REFERENCES education_item_groups(id,section) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS education_conferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','registered','attended')),
    role TEXT NOT NULL DEFAULT 'attendee' CHECK (role IN ('attendee','speaker','organizer')),
    format TEXT NOT NULL DEFAULT 'offline' CHECK (format IN ('offline','online','hybrid')),
    location TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    starts_on DATE,
    ends_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)
  );

  ALTER TABLE education_conferences
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

  ALTER TABLE education_conferences
    ADD COLUMN IF NOT EXISTS list_id TEXT REFERENCES education_lists(id) ON DELETE SET NULL;

  ALTER TABLE education_conferences
    ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '';

  CREATE TABLE IF NOT EXISTS education_coaching_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    coach TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
    format TEXT NOT NULL DEFAULT 'online' CHECK (format IN ('online','offline')),
    location TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    session_on DATE,
    session_time TIME,
    duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 15 AND 480),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  ALTER TABLE education_coaching_sessions
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

  ALTER TABLE education_coaching_sessions
    ADD COLUMN IF NOT EXISTS list_id TEXT REFERENCES education_lists(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS health_workouts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    workout_type TEXT NOT NULL DEFAULT 'strength'
      CHECK (workout_type IN ('strength','running','walking','cycling','swimming','mobility','team_sport','other')),
    status TEXT NOT NULL DEFAULT 'completed'
      CHECK (status IN ('planned','completed','skipped')),
    workout_on DATE NOT NULL,
    start_time TIME,
    duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 720),
    intensity TEXT NOT NULL DEFAULT 'moderate'
      CHECK (intensity IN ('light','moderate','high')),
    distance_km NUMERIC(8, 2) CHECK (distance_km IS NULL OR (distance_km > 0 AND distance_km <= 1000)),
    calories INTEGER CHECK (calories IS NULL OR calories BETWEEN 1 AND 20000),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  ALTER TABLE health_workouts
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

  ALTER TABLE health_workouts
    ADD COLUMN IF NOT EXISTS list_id TEXT REFERENCES education_lists(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS health_medication_groups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS health_medications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES health_medication_groups(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    medication_form TEXT NOT NULL DEFAULT 'tablet'
      CHECK (medication_form IN ('tablet','capsule','solution','drops','spray','injection','cream','other')),
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active','planned','paused','completed')),
    dosage TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL DEFAULT 'once_daily'
      CHECK (frequency IN ('once_daily','twice_daily','three_times_daily','weekly','as_needed','custom')),
    schedule_times_json TEXT NOT NULL DEFAULT '[]',
    purpose TEXT NOT NULL DEFAULT '',
    prescriber TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    start_on DATE,
    end_on DATE,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (start_on IS NULL OR end_on IS NULL OR end_on >= start_on)
  );

  ALTER TABLE health_medications
    ADD COLUMN IF NOT EXISTS group_id TEXT REFERENCES health_medication_groups(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS wishlist_wishes (
    wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
    PRIMARY KEY (wishlist_id, wish_id)
  );

  CREATE TABLE IF NOT EXISTS wish_groups (
    id TEXT PRIMARY KEY,
    wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    space TEXT NOT NULL DEFAULT 'products',
    title TEXT NOT NULL DEFAULT 'Группа',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  ALTER TABLE wish_groups ADD COLUMN IF NOT EXISTS space TEXT NOT NULL DEFAULT 'products';

  CREATE TABLE IF NOT EXISTS wish_group_members (
    group_id TEXT NOT NULL REFERENCES wish_groups(id) ON DELETE CASCADE,
    wishlist_id TEXT NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    space TEXT NOT NULL DEFAULT 'products',
    wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, wish_id)
  );

  ALTER TABLE wish_group_members ADD COLUMN IF NOT EXISTS space TEXT NOT NULL DEFAULT 'products';
  ALTER TABLE wish_group_members DROP CONSTRAINT IF EXISTS wish_group_members_wishlist_id_wish_id_key;

  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'reserved',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (wish_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id)
  );

  CREATE TABLE IF NOT EXISTS contact_overrides (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL,
    name TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    links_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    deleted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, contact_id)
  );

  ALTER TABLE contact_overrides
    ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';

  ALTER TABLE contact_overrides
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

  CREATE TABLE IF NOT EXISTS contact_favorites (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, contact_id)
  );

  CREATE TABLE IF NOT EXISTS career_content (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section TEXT NOT NULL CHECK (section IN ('about','cv','performance','development','domain')),
    content_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, section)
  );

  ALTER TABLE career_content DROP CONSTRAINT IF EXISTS career_content_section_check;
  ALTER TABLE career_content
    ADD CONSTRAINT career_content_section_check
    CHECK (section IN ('about','cv','performance','development','domain'));

  CREATE TABLE IF NOT EXISTS identity_content (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section TEXT NOT NULL CHECK (section IN ('four-questions','theses','principles','values','character','mission','ideal-state','life-strategy')),
    content_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, section)
  );

  ALTER TABLE identity_content DROP CONSTRAINT IF EXISTS identity_content_section_check;
  ALTER TABLE identity_content
    ADD CONSTRAINT identity_content_section_check
    CHECK (section IN ('four-questions','theses','principles','values','character','mission','ideal-state','life-strategy'));

  CREATE TABLE IF NOT EXISTS identity_generated_reports (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section TEXT NOT NULL CHECK (section IN ('hogan','gallup')),
    status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','empty')),
    report_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, section)
  );

  CREATE TABLE IF NOT EXISTS identity_report_uploads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section TEXT NOT NULL CHECK (section IN ('hogan','gallup')),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    pdf_data BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL,
    file_hash TEXT NOT NULL,
    document_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, section, file_hash)
  );

  CREATE TABLE IF NOT EXISTS rollapp_data_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);
  CREATE INDEX IF NOT EXISTS idx_phone_auth_phone_created ON phone_auth_challenges(phone_hash,created_at);
  CREATE INDEX IF NOT EXISTS idx_phone_auth_ip_created ON phone_auth_challenges(request_ip_hash,created_at);
  CREATE INDEX IF NOT EXISTS idx_phone_auth_expires ON phone_auth_challenges(expires_at);
  CREATE INDEX IF NOT EXISTS idx_password_reset_user_created ON password_reset_tokens(user_id,created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);
  CREATE INDEX IF NOT EXISTS idx_wishes_user ON wishes(user_id);
  CREATE INDEX IF NOT EXISTS idx_wishes_user_sort ON wishes(user_id,status,sort_order);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wishes_user_source
  ON wishes(user_id,source_wish_id) WHERE source_wish_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wishes_user_catalog_item
  ON wishes(user_id,catalog_item_key) WHERE catalog_item_key IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_wishlist_wishes_wish ON wishlist_wishes(wish_id);
  CREATE INDEX IF NOT EXISTS idx_wish_groups_list ON wish_groups(wishlist_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wish_group_members_list_space_wish
    ON wish_group_members(wishlist_id,space,wish_id);
  CREATE INDEX IF NOT EXISTS idx_wish_images_user ON wish_images(user_id,created_at);
  CREATE INDEX IF NOT EXISTS idx_lab_report_uploads_user_created
    ON lab_report_uploads(user_id,created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_identity_report_uploads_user_section_created
    ON identity_report_uploads(user_id,section,created_at);
  CREATE INDEX IF NOT EXISTS idx_education_courses_user_updated
    ON education_courses(user_id,updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_education_courses_user_sort
    ON education_courses(user_id,sort_order);
  CREATE INDEX IF NOT EXISTS idx_education_courses_user_list_sort
    ON education_courses(user_id,list_id,sort_order);
  CREATE INDEX IF NOT EXISTS idx_education_course_groups_user_list
    ON education_course_groups(user_id,list_id,created_at);
  CREATE INDEX IF NOT EXISTS idx_education_course_group_members_group_sort
    ON education_course_group_members(group_id,sort_order);
  CREATE INDEX IF NOT EXISTS idx_education_item_groups_user_section_list
    ON education_item_groups(user_id,section,list_id,created_at);
  CREATE INDEX IF NOT EXISTS idx_education_item_group_members_group_sort
    ON education_item_group_members(group_id,section,sort_order);
  CREATE INDEX IF NOT EXISTS idx_education_lists_user_section_sort
    ON education_lists(user_id,section,sort_order,created_at);
  CREATE INDEX IF NOT EXISTS idx_education_conferences_user_updated
    ON education_conferences(user_id,updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_education_conferences_user_sort
    ON education_conferences(user_id,sort_order);
  CREATE INDEX IF NOT EXISTS idx_education_conferences_user_list_sort
    ON education_conferences(user_id,list_id,sort_order);
  CREATE INDEX IF NOT EXISTS idx_education_coaching_sessions_user_updated
    ON education_coaching_sessions(user_id,updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_education_coaching_sessions_user_sort
    ON education_coaching_sessions(user_id,sort_order);
  CREATE INDEX IF NOT EXISTS idx_education_coaching_sessions_user_list_sort
    ON education_coaching_sessions(user_id,list_id,sort_order);
  CREATE INDEX IF NOT EXISTS idx_health_workouts_user_date
    ON health_workouts(user_id,workout_on DESC,updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_health_workouts_user_list_sort
    ON health_workouts(user_id,list_id,sort_order);
  CREATE INDEX IF NOT EXISTS idx_health_medications_user_status
    ON health_medications(user_id,status,updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_health_medications_user_group
    ON health_medications(user_id,group_id,updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_health_medication_groups_user_sort
    ON health_medication_groups(user_id,sort_order,created_at);
  CREATE INDEX IF NOT EXISTS idx_reservations_wish ON reservations(wish_id);
  CREATE INDEX IF NOT EXISTS idx_follows_follower_created ON follows(follower_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_follows_following_created ON follows(following_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_contact_overrides_user_updated ON contact_overrides(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_contact_favorites_user_created ON contact_favorites(user_id, created_at DESC);
  UPDATE reservations
  SET status='multiple'
  WHERE status='reserved' AND wish_id IN (SELECT id FROM wishes WHERE allow_multiple=TRUE);
  UPDATE wishes
  SET space = src.space
  FROM (
    SELECT DISTINCT ON (ww.wish_id) ww.wish_id, l.space
    FROM wishlist_wishes ww
    JOIN wishlists l ON l.id = ww.wishlist_id
    ORDER BY ww.wish_id, l.created_at, l.id
  ) src
  WHERE wishes.id = src.wish_id AND wishes.space IS NULL;
`;

const example-ownerWishOrder = [];

const dataMigrations = [
{
    id: "2026-08-19-wish-group-space-members-v2",
    run: backfillWishGroupSpaces,
  }
];

async function runDataMigrations(client) {
  for (const migration of dataMigrations) {
    const applied = await client.query("SELECT 1 FROM rollapp_data_migrations WHERE id = $1", [migration.id]);
    if (applied.rowCount) continue;
    const result = await migration.run(client);
    if (migration.requireMatch && result.rowCount < (migration.requiredRows || 1)) continue;
    await client.query(
      "INSERT INTO rollapp_data_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
      [migration.id],
    );
  }
}

async function seedDemo(client) {
  const existing = await client.query("SELECT id FROM users WHERE email = $1", ["demo@rollapp.test"]);
  if (existing.rowCount) return;

  const passwordHash = await hashPassword("demo1234");
  const people = [
    { id: randomUUID(), email: "demo@rollapp.test", username: "alisa", name: "Алиса Морозова", bio: "Собираю поводы радоваться и красивые вещи с историей.", birthday: "1996-08-14", avatar: "" },
    { id: randomUUID(), email: "max@rollapp.test", username: "max", name: "Макс Ветров", bio: "Музыка, горы и хороший кофе.", birthday: "1994-09-03", avatar: "" },
    { id: randomUUID(), email: "sonya@rollapp.test", username: "sonya", name: "Соня Левина", bio: "Делаю дом уютнее, а выходные — длиннее.", birthday: "1997-11-21", avatar: "" },
    { id: randomUUID(), email: "lev@rollapp.test", username: "lev", name: "Лев Орлов", bio: "Не дарите носки. Если только очень красивые.", birthday: "1993-12-07", avatar: "" }
  ];

  for (const person of people) {
    await client.query(
      `INSERT INTO users (id,email,username,name,password_hash,bio,birthday,avatar_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [person.id, person.email, person.username, person.name, passwordHash, person.bio, person.birthday, person.avatar],
    );
  }

  const [alisa, max, sonya, lev] = people;
  const alisaGeneralList = [randomUUID(), alisa.id, "Мои желания", "Всё, чему я буду рад", "public", null, "coral", "alisa-all"];
  const lists = [
    [randomUUID(), alisa.id, "День рождения", "То, чему я точно обрадуюсь в августе", "public", "2026-08-14", "coral", "alisa-birthday"],
    [randomUUID(), alisa.id, "Когда-нибудь", "Большие и маленькие мечты без дедлайна", "public", null, "blue", "alisa-someday"],
    [randomUUID(), max.id, "Для музыки и дорог", "Подарки, которые поедут со мной", "public", null, "lime", "max-road"],
    [randomUUID(), sonya.id, "Тёплый дом", "Красивые повседневные вещи", "public", null, "sun", "sonya-home"],
    [randomUUID(), lev.id, "Новый год", "Можно бронировать, я не подглядываю", "public", "2026-12-31", "ink", "lev-new-year"]
  ];
  for (const list of [alisaGeneralList, ...lists]) {
    await client.query(`INSERT INTO wishlists (id,user_id,title,description,privacy,occasion_date,color,share_token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, list);
  }

  const wishRows = [
    ["demo-wish-camera", alisa.id, "Компактная плёночная камера", "Хочу снимать друзей без сотни дублей. Подойдёт рабочая б/у.", "", "/art/camera.svg", 8990, "RUB", 3, "inherit", false, "active", lists[0][0]],
    ["demo-wish-ceramics", alisa.id, "Мастер-класс по керамике", "Лучше сертификат на двоих — пойдём вместе.", "", "/art/pottery.svg", 4500, "RUB", 2, "inherit", true, "active", lists[0][0]],
    ["demo-wish-player", alisa.id, "Виниловый проигрыватель", "Минималистичный, с Bluetooth и прозрачной крышкой.", "", "/art/vinyl.svg", 21990, "RUB", 3, "inherit", false, "active", lists[1][0]],
    ["demo-wish-book", alisa.id, "Альбом про Баухаус", "Любое красивое издание на русском или английском.", "", "/art/book.svg", 3490, "RUB", 1, "inherit", false, "active", lists[1][0]],
    [randomUUID(), max.id, "Хорошие походные наушники", "С шумоподавлением и долгой батареей.", "", "/art/tech.svg", 17990, "RUB", 3, "inherit", false, "active", lists[2][0]],
    [randomUUID(), max.id, "Термос цвета хвои", "0,7–1 литр, без кружки сверху.", "", "/art/thermos.svg", 4200, "RUB", 2, "inherit", false, "active", lists[2][0]],
    [randomUUID(), sonya.id, "Льняное постельное бельё", "Натуральный небелёный оттенок, размер евро.", "", "/art/cozy.svg", 14900, "RUB", 3, "inherit", false, "active", lists[3][0]],
    [randomUUID(), sonya.id, "Большая монстера", "Можно совсем маленькую — выращу.", "", "/art/plant.svg", 3200, "RUB", 1, "inherit", true, "active", lists[3][0]],
    [randomUUID(), lev.id, "Красивые шерстяные носки", "Ладно, всё-таки носки. Яркие и очень тёплые.", "", "/art/style.svg", 1600, "RUB", 2, "inherit", true, "active", lists[4][0]]
  ];

  for (const wish of wishRows) {
    await client.query(
      `INSERT INTO wishes (id,user_id,title,description,url,image_url,price,currency,priority,privacy,allow_multiple,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      wish.slice(0, 12),
    );
    await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [wish[12], wish[0]]);
    if (wish[1] === alisa.id) {
      await client.query("INSERT INTO wishlist_wishes (wishlist_id,wish_id) VALUES ($1,$2)", [alisaGeneralList[0], wish[0]]);
    }
  }

  await client.query("INSERT INTO follows (follower_id,following_id) VALUES ($1,$2),($1,$3),($2,$1),($3,$1)", [alisa.id, max.id, sonya.id]);
}

export async function initializeDatabase() {
  await query(schema);
  const existingUsernames = await query("SELECT username FROM users");
  const reservedConflicts = existingUsernames.rows
    .map((row) => row.username)
    .filter(isReservedProfileUsername);
  if (reservedConflicts.length) {
    throw new Error(`Reserved profile usernames already exist: ${reservedConflicts.join(", ")}`);
  }
  const exclusiveReservations = await query(
    `SELECT id,wish_id FROM reservations
     WHERE status='reserved' ORDER BY wish_id,created_at,id`,
  );
  const occupiedWishIds = new Set();
  for (const reservation of exclusiveReservations.rows) {
    if (!occupiedWishIds.has(reservation.wish_id)) {
      occupiedWishIds.add(reservation.wish_id);
      continue;
    }
    await query("DELETE FROM reservations WHERE id=$1", [reservation.id]);
  }
  await query(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_one_exclusive ON reservations(wish_id) WHERE status='reserved'",
  );
  await transaction(async (client) => {
    if (isMemoryDatabase || process.env.SEED_DEMO === "true") {
      await seedDemo(client);
    }
    await runDataMigrations(client);
  });
}
