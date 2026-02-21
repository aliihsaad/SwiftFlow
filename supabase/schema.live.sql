--
-- PostgreSQL database dump
--

\restrict gArTsQ3fMTpeiBG7eLzWbzje04WRT5x7OjTkxcvVeooU8EXkcNZc7GAWK7XKAUW

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA "public";


ALTER SCHEMA "public" OWNER TO "postgres";

--
-- Name: create_default_settings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_default_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$

BEGIN

    INSERT INTO workspace_settings (workspace_id) VALUES (NEW.id);

    RETURN NEW;

END;

$$;


ALTER FUNCTION "public"."create_default_settings"() OWNER TO "postgres";

--
-- Name: create_default_workspace_settings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_default_workspace_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$

BEGIN

  INSERT INTO workspace_settings (workspace_id)

  VALUES (NEW.id);

  RETURN NEW;

END;

$$;


ALTER FUNCTION "public"."create_default_workspace_settings"() OWNER TO "postgres";

--
-- Name: is_member_of("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_member_of"("_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$

BEGIN

    RETURN EXISTS (

        SELECT 1 

        FROM workspace_members 

        WHERE workspace_id = _workspace_id 

        AND user_id = auth.uid()

    );

END;

$$;


ALTER FUNCTION "public"."is_member_of"("_workspace_id" "uuid") OWNER TO "postgres";

--
-- Name: update_conversation_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_conversation_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$

BEGIN

    NEW.updated_at = now();

    RETURN NEW;

END;

$$;


ALTER FUNCTION "public"."update_conversation_updated_at"() OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$

BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;

$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

--
-- Name: update_workspace_settings_timestamp(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_workspace_settings_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$

  BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

  END;

  $$;


ALTER FUNCTION "public"."update_workspace_settings_timestamp"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: account_analytics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."account_analytics" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "social_account_id" "uuid",
    "date" "date" NOT NULL,
    "followers" integer,
    "following" integer,
    "posts_count" integer,
    "avg_engagement_rate" numeric(5,2),
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."account_analytics" OWNER TO "postgres";

--
-- Name: analytics_snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."analytics_snapshots" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "metrics" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."analytics_snapshots" OWNER TO "postgres";

--
-- Name: automation_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."automation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "event_key" "text",
    "event_type" "text" NOT NULL,
    "source" "text" DEFAULT 'webhook'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "automation_events_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'queued'::"text", 'processed'::"text", 'ignored'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."automation_events" OWNER TO "postgres";

--
-- Name: automation_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."automation_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "automation_id" "uuid",
    "trigger_comment_id" "text" NOT NULL,
    "commenter_id" "text" NOT NULL,
    "commenter_username" "text",
    "comment_reply_sent" boolean DEFAULT false,
    "dm_sent" boolean DEFAULT false,
    "status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "triggered_at" timestamp with time zone DEFAULT "now"(),
    "dm_channel" "text"
);


ALTER TABLE "public"."automation_logs" OWNER TO "postgres";

--
-- Name: automation_node_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."automation_node_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "automation_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "node_id" "text" NOT NULL,
    "node_type" "text" NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "input" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "automation_node_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."automation_node_runs" OWNER TO "postgres";

--
-- Name: automation_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."automation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "automation_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "trigger_type" "text",
    "trigger_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "node_results" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "processed_count" integer DEFAULT 0 NOT NULL,
    "dms_sent_count" integer DEFAULT 0 NOT NULL,
    "error_count" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "automation_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."automation_runs" OWNER TO "postgres";

--
-- Name: automation_scheduled_executions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."automation_scheduled_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "automation_id" "uuid" NOT NULL,
    "execution_id" "uuid" NOT NULL,
    "node_id" "text" NOT NULL,
    "execution_context" "jsonb" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "executed_at" timestamp with time zone,
    CONSTRAINT "automation_scheduled_executions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'executing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."automation_scheduled_executions" OWNER TO "postgres";

--
-- Name: automations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."automations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "social_account_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'comment_to_dm'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "platform_post_id" "text" NOT NULL,
    "post_thumbnail_url" "text",
    "post_caption" "text",
    "trigger_config" "jsonb" DEFAULT '{"keywords": [], "trigger_type": "any_comment"}'::"jsonb" NOT NULL,
    "comment_reply_config" "jsonb" DEFAULT '{"enabled": false, "messages": []}'::"jsonb",
    "dm_config" "jsonb" NOT NULL,
    "total_triggered" integer DEFAULT 0,
    "total_dms_sent" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "workflow_graph" "jsonb",
    "editor_version" "text" DEFAULT 'wizard'::"text"
);


ALTER TABLE "public"."automations" OWNER TO "postgres";

--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."chat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "messages" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."chat_sessions" OWNER TO "postgres";

--
-- Name: comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "social_account_id" "uuid" NOT NULL,
    "published_post_id" "uuid",
    "platform_comment_id" "text" NOT NULL,
    "platform_post_id" "text" NOT NULL,
    "parent_comment_id" "uuid",
    "author_id" "text",
    "author_username" "text",
    "author_profile_picture" "text",
    "message" "text" NOT NULL,
    "is_hidden" boolean DEFAULT false,
    "replied_at" timestamp with time zone,
    "platform_created_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "account_id" "text"
);


ALTER TABLE "public"."comments" OWNER TO "postgres";

--
-- Name: conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "social_account_id" "uuid" NOT NULL,
    "platform_conversation_id" "text" NOT NULL,
    "participant_id" "text" NOT NULL,
    "participant_username" "text",
    "participant_profile_picture" "text",
    "last_message_at" timestamp with time zone,
    "unread_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";

--
-- Name: external_services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."external_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "service_name" "text" NOT NULL,
    "website" "text",
    "email" "text",
    "password" "text",
    "subscription_tier" "text",
    "price" "text",
    "api_key" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."external_services" OWNER TO "postgres";

--
-- Name: generated_assets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."generated_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "asset_type" "text" NOT NULL,
    "content" "jsonb",
    "image_url" "text",
    "used_in_post_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "source" "text" DEFAULT 'gemini'::"text",
    "unsplash_id" "text",
    "attribution" "jsonb",
    CONSTRAINT "generated_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['content_idea'::"text", 'carousel'::"text", 'image'::"text", 'text'::"text"])))
);


ALTER TABLE "public"."generated_assets" OWNER TO "postgres";

--
-- Name: COLUMN "generated_assets"."source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."generated_assets"."source" IS 'Image source: gemini or unsplash';


--
-- Name: COLUMN "generated_assets"."unsplash_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."generated_assets"."unsplash_id" IS 'Unsplash photo ID for tracking';


--
-- Name: COLUMN "generated_assets"."attribution"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."generated_assets"."attribution" IS 'Photographer attribution data for Unsplash images';


--
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "platform_message_id" "text" NOT NULL,
    "sender_id" "text" NOT NULL,
    "is_from_page" boolean DEFAULT false,
    "message" "text",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb",
    "is_read" boolean DEFAULT false,
    "platform_created_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";

--
-- Name: oauth_page_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."oauth_page_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_access_token" "text" NOT NULL,
    "pages_data" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."oauth_page_sessions" OWNER TO "postgres";

--
-- Name: post_analytics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."post_analytics" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "published_post_id" "uuid" NOT NULL,
    "views" integer DEFAULT 0,
    "likes" integer DEFAULT 0,
    "comments" integer DEFAULT 0,
    "shares" integer DEFAULT 0,
    "saves" integer DEFAULT 0,
    "engagement_rate" numeric(5,2),
    "synced_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."post_analytics" OWNER TO "postgres";

--
-- Name: posts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."posts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "content" "text",
    "media_urls" "jsonb" DEFAULT '[]'::"jsonb",
    "platforms" "jsonb" DEFAULT '[]'::"jsonb",
    "scheduled_for" timestamp with time zone,
    "published_at" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "metrics" "jsonb" DEFAULT '{"likes": 0, "views": 0, "shares": 0, "comments": 0}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "posts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'publishing'::"text", 'published'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";

--
-- Name: processed_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."processed_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "automation_id" "uuid" NOT NULL,
    "comment_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."processed_comments" OWNER TO "postgres";

--
-- Name: published_posts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."published_posts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "post_id" "uuid",
    "platform" character varying(20) NOT NULL,
    "platform_post_id" character varying(255) NOT NULL,
    "permalink" character varying(500),
    "published_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."published_posts" OWNER TO "postgres";

--
-- Name: social_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."social_accounts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "access_token" "text",
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "social_accounts_platform_check" CHECK (("platform" = ANY (ARRAY['facebook'::"text", 'instagram'::"text", 'linkedin'::"text", 'twitter'::"text"])))
);


ALTER TABLE "public"."social_accounts" OWNER TO "postgres";

--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_key" "text" NOT NULL,
    "workspace_id" "uuid",
    "event_type" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";

--
-- Name: workspace_brand_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."workspace_brand_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "business_name" "text",
    "owner_name" "text",
    "email" "text",
    "phone" "text",
    "website" "text",
    "industry" "text",
    "business_description" "text",
    "target_audience" "text",
    "brand_voice" "text",
    "services" "jsonb" DEFAULT '[]'::"jsonb",
    "unique_selling_points" "text"[],
    "logo_url" "text",
    "brand_colors" "jsonb" DEFAULT '{}'::"jsonb",
    "reference_image_urls" "text"[],
    "instagram_handle" "text",
    "facebook_page" "text",
    "content_themes" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "language" "text" DEFAULT 'en'::"text"
);


ALTER TABLE "public"."workspace_brand_profiles" OWNER TO "postgres";

--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."workspace_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "workspace_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";

--
-- Name: workspace_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."workspace_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "ai_provider" "text" DEFAULT 'gemini'::"text",
    "gemini_api_key" "text",
    "openai_api_key" "text",
    "ai_model_name" "text" DEFAULT 'gemini-1.5-flash'::"text",
    "ai_temperature" numeric DEFAULT 0.7,
    "ai_max_tokens" integer DEFAULT 2048,
    "timezone" "text" DEFAULT 'UTC'::"text",
    "default_language" "text" DEFAULT 'en'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "meta_app_id" "text",
    "meta_app_secret" "text",
    "instagram_app_id" "text",
    "instagram_app_secret" "text"
);


ALTER TABLE "public"."workspace_settings" OWNER TO "postgres";

--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."workspaces" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";

--
-- Name: account_analytics account_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."account_analytics"
    ADD CONSTRAINT "account_analytics_pkey" PRIMARY KEY ("id");


--
-- Name: account_analytics account_analytics_social_account_date_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."account_analytics"
    ADD CONSTRAINT "account_analytics_social_account_date_unique" UNIQUE ("social_account_id", "date");


--
-- Name: account_analytics account_analytics_social_account_id_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."account_analytics"
    ADD CONSTRAINT "account_analytics_social_account_id_date_key" UNIQUE ("social_account_id", "date");


--
-- Name: analytics_snapshots analytics_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."analytics_snapshots"
    ADD CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id");


--
-- Name: analytics_snapshots analytics_snapshots_workspace_id_platform_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."analytics_snapshots"
    ADD CONSTRAINT "analytics_snapshots_workspace_id_platform_date_key" UNIQUE ("workspace_id", "platform", "date");


--
-- Name: automation_events automation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_events"
    ADD CONSTRAINT "automation_events_pkey" PRIMARY KEY ("id");


--
-- Name: automation_logs automation_logs_automation_id_trigger_comment_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_logs"
    ADD CONSTRAINT "automation_logs_automation_id_trigger_comment_id_key" UNIQUE ("automation_id", "trigger_comment_id");


--
-- Name: automation_logs automation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_logs"
    ADD CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id");


--
-- Name: automation_node_runs automation_node_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_node_runs"
    ADD CONSTRAINT "automation_node_runs_pkey" PRIMARY KEY ("id");


--
-- Name: automation_node_runs automation_node_runs_run_id_node_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_node_runs"
    ADD CONSTRAINT "automation_node_runs_run_id_node_id_key" UNIQUE ("run_id", "node_id");


--
-- Name: automation_runs automation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id");


--
-- Name: automation_scheduled_executions automation_scheduled_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_scheduled_executions"
    ADD CONSTRAINT "automation_scheduled_executions_pkey" PRIMARY KEY ("id");


--
-- Name: automations automations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automations"
    ADD CONSTRAINT "automations_pkey" PRIMARY KEY ("id");


--
-- Name: chat_sessions chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");


--
-- Name: comments comments_workspace_id_platform_comment_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_workspace_id_platform_comment_id_key" UNIQUE ("workspace_id", "platform_comment_id");


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");


--
-- Name: conversations conversations_workspace_id_platform_conversation_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_workspace_id_platform_conversation_id_key" UNIQUE ("workspace_id", "platform_conversation_id");


--
-- Name: external_services external_services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."external_services"
    ADD CONSTRAINT "external_services_pkey" PRIMARY KEY ("id");


--
-- Name: generated_assets generated_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_pkey" PRIMARY KEY ("id");


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");


--
-- Name: messages messages_workspace_id_platform_message_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_workspace_id_platform_message_id_key" UNIQUE ("workspace_id", "platform_message_id");


--
-- Name: oauth_page_sessions oauth_page_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_page_sessions"
    ADD CONSTRAINT "oauth_page_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: post_analytics post_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."post_analytics"
    ADD CONSTRAINT "post_analytics_pkey" PRIMARY KEY ("id");


--
-- Name: post_analytics post_analytics_published_post_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."post_analytics"
    ADD CONSTRAINT "post_analytics_published_post_id_key" UNIQUE ("published_post_id");


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");


--
-- Name: processed_comments processed_comments_automation_id_comment_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."processed_comments"
    ADD CONSTRAINT "processed_comments_automation_id_comment_id_key" UNIQUE ("automation_id", "comment_id");


--
-- Name: processed_comments processed_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."processed_comments"
    ADD CONSTRAINT "processed_comments_pkey" PRIMARY KEY ("id");


--
-- Name: published_posts published_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."published_posts"
    ADD CONSTRAINT "published_posts_pkey" PRIMARY KEY ("id");


--
-- Name: published_posts published_posts_platform_platform_post_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."published_posts"
    ADD CONSTRAINT "published_posts_platform_platform_post_id_key" UNIQUE ("platform", "platform_post_id");


--
-- Name: social_accounts social_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id");


--
-- Name: social_accounts social_accounts_platform_account_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_platform_account_id_unique" UNIQUE ("platform", "account_id");


--
-- Name: social_accounts social_accounts_workspace_platform_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_workspace_platform_unique" UNIQUE ("workspace_id", "platform");


--
-- Name: webhook_events webhook_events_event_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_event_key_key" UNIQUE ("event_key");


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");


--
-- Name: workspace_brand_profiles workspace_brand_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_brand_profiles"
    ADD CONSTRAINT "workspace_brand_profiles_pkey" PRIMARY KEY ("id");


--
-- Name: workspace_brand_profiles workspace_brand_profiles_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_brand_profiles"
    ADD CONSTRAINT "workspace_brand_profiles_workspace_id_key" UNIQUE ("workspace_id");


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id");


--
-- Name: workspace_members workspace_members_workspace_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id");


--
-- Name: workspace_settings workspace_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_settings"
    ADD CONSTRAINT "workspace_settings_pkey" PRIMARY KEY ("id");


--
-- Name: workspace_settings workspace_settings_workspace_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_settings"
    ADD CONSTRAINT "workspace_settings_workspace_id_key" UNIQUE ("workspace_id");


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");


--
-- Name: workspaces workspaces_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_slug_key" UNIQUE ("slug");


--
-- Name: idx_automation_events_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_events_status" ON "public"."automation_events" USING "btree" ("status");


--
-- Name: idx_automation_events_unique_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_automation_events_unique_key" ON "public"."automation_events" USING "btree" ("workspace_id", "event_key") WHERE ("event_key" IS NOT NULL);


--
-- Name: idx_automation_events_workspace_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_events_workspace_created" ON "public"."automation_events" USING "btree" ("workspace_id", "created_at" DESC);


--
-- Name: idx_automation_logs_automation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_logs_automation" ON "public"."automation_logs" USING "btree" ("automation_id");


--
-- Name: idx_automation_logs_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_logs_status" ON "public"."automation_logs" USING "btree" ("status");


--
-- Name: idx_automation_logs_triggered_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_logs_triggered_at" ON "public"."automation_logs" USING "btree" ("triggered_at");


--
-- Name: idx_automation_node_runs_automation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_node_runs_automation" ON "public"."automation_node_runs" USING "btree" ("automation_id");


--
-- Name: idx_automation_node_runs_run; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_node_runs_run" ON "public"."automation_node_runs" USING "btree" ("run_id");


--
-- Name: idx_automation_node_runs_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_node_runs_status" ON "public"."automation_node_runs" USING "btree" ("status");


--
-- Name: idx_automation_node_runs_workspace_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_node_runs_workspace_created" ON "public"."automation_node_runs" USING "btree" ("workspace_id", "created_at" DESC);


--
-- Name: idx_automation_runs_automation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_runs_automation" ON "public"."automation_runs" USING "btree" ("automation_id");


--
-- Name: idx_automation_runs_event; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_runs_event" ON "public"."automation_runs" USING "btree" ("event_id");


--
-- Name: idx_automation_runs_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_runs_status" ON "public"."automation_runs" USING "btree" ("status");


--
-- Name: idx_automation_runs_workspace_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automation_runs_workspace_created" ON "public"."automation_runs" USING "btree" ("workspace_id", "created_at" DESC);


--
-- Name: idx_automations_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automations_active" ON "public"."automations" USING "btree" ("is_active") WHERE ("is_active" = true);


--
-- Name: idx_automations_platform_post; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automations_platform_post" ON "public"."automations" USING "btree" ("platform_post_id");


--
-- Name: idx_automations_social_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automations_social_account" ON "public"."automations" USING "btree" ("social_account_id");


--
-- Name: idx_automations_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_automations_workspace" ON "public"."automations" USING "btree" ("workspace_id");


--
-- Name: idx_brand_profiles_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_brand_profiles_workspace" ON "public"."workspace_brand_profiles" USING "btree" ("workspace_id");


--
-- Name: idx_comments_account_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_comments_account_id" ON "public"."comments" USING "btree" ("account_id");


--
-- Name: idx_comments_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_comments_parent" ON "public"."comments" USING "btree" ("parent_comment_id");


--
-- Name: idx_comments_platform_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_comments_platform_created" ON "public"."comments" USING "btree" ("platform_created_at" DESC);


--
-- Name: idx_comments_published_post; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_comments_published_post" ON "public"."comments" USING "btree" ("published_post_id");


--
-- Name: idx_comments_social_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_comments_social_account" ON "public"."comments" USING "btree" ("social_account_id");


--
-- Name: idx_comments_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_comments_workspace" ON "public"."comments" USING "btree" ("workspace_id");


--
-- Name: idx_conversations_last_message; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_conversations_last_message" ON "public"."conversations" USING "btree" ("last_message_at" DESC);


--
-- Name: idx_conversations_social_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_conversations_social_account" ON "public"."conversations" USING "btree" ("social_account_id");


--
-- Name: idx_conversations_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_conversations_unread" ON "public"."conversations" USING "btree" ("unread_count") WHERE ("unread_count" > 0);


--
-- Name: idx_conversations_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_conversations_workspace" ON "public"."conversations" USING "btree" ("workspace_id");


--
-- Name: idx_messages_conversation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id");


--
-- Name: idx_messages_platform_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_messages_platform_created" ON "public"."messages" USING "btree" ("platform_created_at" DESC);


--
-- Name: idx_messages_unread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_messages_unread" ON "public"."messages" USING "btree" ("is_read") WHERE ("is_read" = false);


--
-- Name: idx_messages_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_messages_workspace" ON "public"."messages" USING "btree" ("workspace_id");


--
-- Name: idx_processed_comments_automation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_processed_comments_automation" ON "public"."processed_comments" USING "btree" ("automation_id");


--
-- Name: idx_processed_comments_comment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_processed_comments_comment" ON "public"."processed_comments" USING "btree" ("comment_id");


--
-- Name: idx_processed_comments_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_processed_comments_workspace" ON "public"."processed_comments" USING "btree" ("workspace_id");


--
-- Name: idx_scheduled_exec_automation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scheduled_exec_automation" ON "public"."automation_scheduled_executions" USING "btree" ("automation_id");


--
-- Name: idx_scheduled_exec_pending; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scheduled_exec_pending" ON "public"."automation_scheduled_executions" USING "btree" ("scheduled_for") WHERE ("status" = 'pending'::"text");


--
-- Name: idx_scheduled_exec_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scheduled_exec_status" ON "public"."automation_scheduled_executions" USING "btree" ("status");


--
-- Name: idx_webhook_events_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_webhook_events_key" ON "public"."webhook_events" USING "btree" ("event_key");


--
-- Name: idx_webhook_events_received_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_webhook_events_received_at" ON "public"."webhook_events" USING "btree" ("received_at");


--
-- Name: workspaces on_workspace_created; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "on_workspace_created" AFTER INSERT ON "public"."workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_settings"();


--
-- Name: conversations trigger_conversation_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trigger_conversation_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_conversation_updated_at"();


--
-- Name: posts update_posts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_posts_updated_at" BEFORE UPDATE ON "public"."posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: social_accounts update_social_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_social_accounts_updated_at" BEFORE UPDATE ON "public"."social_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: workspace_settings update_workspace_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_workspace_settings_updated_at" BEFORE UPDATE ON "public"."workspace_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: workspaces update_workspaces_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_workspaces_updated_at" BEFORE UPDATE ON "public"."workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: analytics_snapshots analytics_snapshots_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."analytics_snapshots"
    ADD CONSTRAINT "analytics_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: automation_events automation_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_events"
    ADD CONSTRAINT "automation_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: automation_logs automation_logs_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_logs"
    ADD CONSTRAINT "automation_logs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE CASCADE;


--
-- Name: automation_node_runs automation_node_runs_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_node_runs"
    ADD CONSTRAINT "automation_node_runs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE CASCADE;


--
-- Name: automation_node_runs automation_node_runs_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_node_runs"
    ADD CONSTRAINT "automation_node_runs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."automation_runs"("id") ON DELETE CASCADE;


--
-- Name: automation_node_runs automation_node_runs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_node_runs"
    ADD CONSTRAINT "automation_node_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: automation_runs automation_runs_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE CASCADE;


--
-- Name: automation_runs automation_runs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."automation_events"("id") ON DELETE SET NULL;


--
-- Name: automation_runs automation_runs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: automation_scheduled_executions automation_scheduled_executions_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automation_scheduled_executions"
    ADD CONSTRAINT "automation_scheduled_executions_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE CASCADE;


--
-- Name: automations automations_social_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automations"
    ADD CONSTRAINT "automations_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE CASCADE;


--
-- Name: automations automations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."automations"
    ADD CONSTRAINT "automations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: chat_sessions chat_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: chat_sessions chat_sessions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: comments comments_parent_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id");


--
-- Name: comments comments_published_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_published_post_id_fkey" FOREIGN KEY ("published_post_id") REFERENCES "public"."published_posts"("id") ON DELETE CASCADE;


--
-- Name: comments comments_social_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE CASCADE;


--
-- Name: comments comments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: conversations conversations_social_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE CASCADE;


--
-- Name: conversations conversations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: external_services external_services_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."external_services"
    ADD CONSTRAINT "external_services_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: generated_assets generated_assets_used_in_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_used_in_post_id_fkey" FOREIGN KEY ("used_in_post_id") REFERENCES "public"."posts"("id") ON DELETE SET NULL;


--
-- Name: generated_assets generated_assets_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."generated_assets"
    ADD CONSTRAINT "generated_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;


--
-- Name: messages messages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: oauth_page_sessions oauth_page_sessions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oauth_page_sessions"
    ADD CONSTRAINT "oauth_page_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: post_analytics post_analytics_published_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."post_analytics"
    ADD CONSTRAINT "post_analytics_published_post_id_fkey" FOREIGN KEY ("published_post_id") REFERENCES "public"."published_posts"("id") ON DELETE CASCADE;


--
-- Name: posts posts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: processed_comments processed_comments_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."processed_comments"
    ADD CONSTRAINT "processed_comments_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE CASCADE;


--
-- Name: processed_comments processed_comments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."processed_comments"
    ADD CONSTRAINT "processed_comments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: published_posts published_posts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."published_posts"
    ADD CONSTRAINT "published_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;


--
-- Name: social_accounts social_accounts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: webhook_events webhook_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: workspace_brand_profiles workspace_brand_profiles_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_brand_profiles"
    ADD CONSTRAINT "workspace_brand_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: workspace_settings workspace_settings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_settings"
    ADD CONSTRAINT "workspace_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: workspaces workspaces_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: workspaces Create workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Create workspaces" ON "public"."workspaces" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));


--
-- Name: workspace_members Manage members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Manage members" ON "public"."workspace_members" FOR INSERT WITH CHECK (((("user_id" = "auth"."uid"()) AND ("role" = 'owner'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."workspaces"
  WHERE (("workspaces"."id" = "workspace_members"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspaces"
  WHERE (("workspaces"."id" = "workspace_members"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"()))))));


--
-- Name: workspaces Manage workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Manage workspaces" ON "public"."workspaces" USING (("auth"."uid"() = "owner_id"));


--
-- Name: analytics_snapshots Member access analytics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Member access analytics" ON "public"."analytics_snapshots" USING ("public"."is_member_of"("workspace_id"));


--
-- Name: posts Member access posts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Member access posts" ON "public"."posts" USING ("public"."is_member_of"("workspace_id"));


--
-- Name: workspace_settings Member access settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Member access settings" ON "public"."workspace_settings" USING ("public"."is_member_of"("workspace_id"));


--
-- Name: social_accounts Member access social_accounts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Member access social_accounts" ON "public"."social_accounts" USING ("public"."is_member_of"("workspace_id"));


--
-- Name: workspace_members Owner delete members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owner delete members" ON "public"."workspace_members" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."workspaces"
  WHERE (("workspaces"."id" = "workspace_members"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"())))) OR ("user_id" = "auth"."uid"())));


--
-- Name: workspace_members Owner manage members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Owner manage members" ON "public"."workspace_members" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."workspaces"
  WHERE (("workspaces"."id" = "workspace_members"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"())))));


--
-- Name: webhook_events Service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access" ON "public"."webhook_events" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: automation_scheduled_executions Service role full access on scheduled executions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access on scheduled executions" ON "public"."automation_scheduled_executions" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));


--
-- Name: account_analytics Service role has full access to account_analytics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to account_analytics" ON "public"."account_analytics" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: automation_events Service role has full access to automation events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to automation events" ON "public"."automation_events" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: automation_node_runs Service role has full access to automation node runs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to automation node runs" ON "public"."automation_node_runs" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: automation_runs Service role has full access to automation runs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to automation runs" ON "public"."automation_runs" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: automation_logs Service role has full access to automation_logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to automation_logs" ON "public"."automation_logs" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: automations Service role has full access to automations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to automations" ON "public"."automations" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: external_services Service role has full access to external_services; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to external_services" ON "public"."external_services" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: oauth_page_sessions Service role has full access to oauth_page_sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to oauth_page_sessions" ON "public"."oauth_page_sessions" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: post_analytics Service role has full access to post_analytics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to post_analytics" ON "public"."post_analytics" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: processed_comments Service role has full access to processed_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to processed_comments" ON "public"."processed_comments" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: published_posts Service role has full access to published_posts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to published_posts" ON "public"."published_posts" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: automation_scheduled_executions Service role has full access to scheduled executions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to scheduled executions" ON "public"."automation_scheduled_executions" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: automation_logs Users can create automation logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create automation logs" ON "public"."automation_logs" FOR INSERT WITH CHECK (("automation_id" IN ( SELECT "automations"."id"
   FROM "public"."automations"
  WHERE ("automations"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE ("workspace_members"."user_id" = "auth"."uid"()))))));


--
-- Name: automations Users can create automations in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create automations in their workspaces" ON "public"."automations" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: workspace_brand_profiles Users can create brand profiles for their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create brand profiles for their workspaces" ON "public"."workspace_brand_profiles" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: external_services Users can create external services in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create external services in their workspaces" ON "public"."external_services" FOR INSERT WITH CHECK ("public"."is_member_of"("workspace_id"));


--
-- Name: processed_comments Users can create processed comments in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create processed comments in their workspaces" ON "public"."processed_comments" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: automation_scheduled_executions Users can create scheduled executions in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create scheduled executions in their workspaces" ON "public"."automation_scheduled_executions" FOR INSERT WITH CHECK (("automation_id" IN ( SELECT "automations"."id"
   FROM "public"."automations"
  WHERE ("automations"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE ("workspace_members"."user_id" = "auth"."uid"()))))));


--
-- Name: automations Users can delete automations in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete automations in their workspaces" ON "public"."automations" FOR DELETE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: comments Users can delete comments in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete comments in their workspace" ON "public"."comments" FOR DELETE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: conversations Users can delete conversations in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete conversations in their workspace" ON "public"."conversations" FOR DELETE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: external_services Users can delete external services in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete external services in their workspaces" ON "public"."external_services" FOR DELETE USING ("public"."is_member_of"("workspace_id"));


--
-- Name: messages Users can delete messages in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete messages in their workspace" ON "public"."messages" FOR DELETE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: automation_scheduled_executions Users can delete scheduled executions in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete scheduled executions in their workspaces" ON "public"."automation_scheduled_executions" FOR DELETE USING (("automation_id" IN ( SELECT "automations"."id"
   FROM "public"."automations"
  WHERE ("automations"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE ("workspace_members"."user_id" = "auth"."uid"()))))));


--
-- Name: chat_sessions Users can delete their own chat sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own chat sessions" ON "public"."chat_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: generated_assets Users can insert assets in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert assets in their workspace" ON "public"."generated_assets" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: comments Users can insert comments in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert comments in their workspace" ON "public"."comments" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: conversations Users can insert conversations in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert conversations in their workspace" ON "public"."conversations" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: messages Users can insert messages in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert messages in their workspace" ON "public"."messages" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: chat_sessions Users can insert their own chat sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own chat sessions" ON "public"."chat_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: automation_logs Users can update automation logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update automation logs" ON "public"."automation_logs" FOR UPDATE USING (("automation_id" IN ( SELECT "automations"."id"
   FROM "public"."automations"
  WHERE ("automations"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE ("workspace_members"."user_id" = "auth"."uid"()))))));


--
-- Name: automations Users can update automations in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update automations in their workspaces" ON "public"."automations" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: workspace_brand_profiles Users can update brand profiles of their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update brand profiles of their workspaces" ON "public"."workspace_brand_profiles" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: comments Users can update comments in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update comments in their workspace" ON "public"."comments" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: conversations Users can update conversations in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update conversations in their workspace" ON "public"."conversations" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: external_services Users can update external services in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update external services in their workspaces" ON "public"."external_services" FOR UPDATE USING ("public"."is_member_of"("workspace_id")) WITH CHECK ("public"."is_member_of"("workspace_id"));


--
-- Name: messages Users can update messages in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update messages in their workspace" ON "public"."messages" FOR UPDATE USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: automation_scheduled_executions Users can update scheduled executions in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update scheduled executions in their workspaces" ON "public"."automation_scheduled_executions" FOR UPDATE USING (("automation_id" IN ( SELECT "automations"."id"
   FROM "public"."automations"
  WHERE ("automations"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE ("workspace_members"."user_id" = "auth"."uid"()))))));


--
-- Name: chat_sessions Users can update their own chat sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own chat sessions" ON "public"."chat_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: account_analytics Users can view account analytics in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view account analytics in their workspaces" ON "public"."account_analytics" FOR SELECT USING (("social_account_id" IN ( SELECT "sa"."id"
   FROM "public"."social_accounts" "sa"
  WHERE "public"."is_member_of"("sa"."workspace_id"))));


--
-- Name: generated_assets Users can view assets in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view assets in their workspace" ON "public"."generated_assets" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: automation_events Users can view automation events in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view automation events in their workspaces" ON "public"."automation_events" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: automation_logs Users can view automation logs in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view automation logs in their workspaces" ON "public"."automation_logs" FOR SELECT USING (("automation_id" IN ( SELECT "automations"."id"
   FROM "public"."automations"
  WHERE ("automations"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE ("workspace_members"."user_id" = "auth"."uid"()))))));


--
-- Name: automation_node_runs Users can view automation node runs in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view automation node runs in their workspaces" ON "public"."automation_node_runs" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: automation_runs Users can view automation runs in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view automation runs in their workspaces" ON "public"."automation_runs" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: automations Users can view automations in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view automations in their workspaces" ON "public"."automations" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: workspace_brand_profiles Users can view brand profiles of their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view brand profiles of their workspaces" ON "public"."workspace_brand_profiles" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: comments Users can view comments in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view comments in their workspace" ON "public"."comments" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: conversations Users can view conversations in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view conversations in their workspace" ON "public"."conversations" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: external_services Users can view external services in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view external services in their workspaces" ON "public"."external_services" FOR SELECT USING ("public"."is_member_of"("workspace_id"));


--
-- Name: messages Users can view messages in their workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view messages in their workspace" ON "public"."messages" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: post_analytics Users can view post analytics in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view post analytics in their workspaces" ON "public"."post_analytics" FOR SELECT USING (("published_post_id" IN ( SELECT "pp"."id"
   FROM ("public"."published_posts" "pp"
     JOIN "public"."posts" "p" ON (("p"."id" = "pp"."post_id")))
  WHERE "public"."is_member_of"("p"."workspace_id"))));


--
-- Name: processed_comments Users can view processed comments in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view processed comments in their workspaces" ON "public"."processed_comments" FOR SELECT USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: published_posts Users can view published posts in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view published posts in their workspaces" ON "public"."published_posts" FOR SELECT USING (("post_id" IN ( SELECT "p"."id"
   FROM "public"."posts" "p"
  WHERE "public"."is_member_of"("p"."workspace_id"))));


--
-- Name: automation_scheduled_executions Users can view scheduled executions in their workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view scheduled executions in their workspaces" ON "public"."automation_scheduled_executions" FOR SELECT USING (("automation_id" IN ( SELECT "automations"."id"
   FROM "public"."automations"
  WHERE ("automations"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE ("workspace_members"."user_id" = "auth"."uid"()))))));


--
-- Name: chat_sessions Users can view their own chat sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own chat sessions" ON "public"."chat_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: automation_scheduled_executions Users can view their workspace scheduled executions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their workspace scheduled executions" ON "public"."automation_scheduled_executions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."automations" "a"
     JOIN "public"."workspace_members" "wm" ON (("wm"."workspace_id" = "a"."workspace_id")))
  WHERE (("a"."id" = "automation_scheduled_executions"."automation_id") AND ("wm"."user_id" = "auth"."uid"())))));


--
-- Name: workspace_members View members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View members" ON "public"."workspace_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_member_of"("workspace_id")));


--
-- Name: workspaces View workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "View workspaces" ON "public"."workspaces" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR "public"."is_member_of"("id")));


--
-- Name: account_analytics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."account_analytics" ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_snapshots; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."analytics_snapshots" ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."automation_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."automation_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_node_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."automation_node_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."automation_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_scheduled_executions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."automation_scheduled_executions" ENABLE ROW LEVEL SECURITY;

--
-- Name: automations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."automations" ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."chat_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;

--
-- Name: external_services; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."external_services" ENABLE ROW LEVEL SECURITY;

--
-- Name: generated_assets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."generated_assets" ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauth_page_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."oauth_page_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: post_analytics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."post_analytics" ENABLE ROW LEVEL SECURITY;

--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: processed_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."processed_comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: published_posts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."published_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: social_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."social_accounts" ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: automations workspace_automations_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace_automations_policy" ON "public"."automations" USING (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"())))) WITH CHECK (("workspace_id" IN ( SELECT "workspace_members"."workspace_id"
   FROM "public"."workspace_members"
  WHERE ("workspace_members"."user_id" = "auth"."uid"()))));


--
-- Name: workspace_brand_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workspace_brand_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workspace_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT ALL ON SCHEMA "public" TO PUBLIC;


--
-- Name: TABLE "account_analytics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."account_analytics" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."account_analytics" TO "authenticated";


--
-- Name: TABLE "analytics_snapshots"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."analytics_snapshots" TO "service_role";
GRANT ALL ON TABLE "public"."analytics_snapshots" TO "authenticated";


--
-- Name: TABLE "automation_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."automation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_events" TO "service_role";


--
-- Name: TABLE "automation_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."automation_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_logs" TO "service_role";


--
-- Name: TABLE "automation_node_runs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."automation_node_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_node_runs" TO "service_role";


--
-- Name: TABLE "automation_runs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT ON TABLE "public"."automation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_runs" TO "service_role";


--
-- Name: TABLE "automation_scheduled_executions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."automation_scheduled_executions" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_scheduled_executions" TO "service_role";


--
-- Name: TABLE "automations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."automations" TO "authenticated";
GRANT ALL ON TABLE "public"."automations" TO "service_role";


--
-- Name: TABLE "chat_sessions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_sessions" TO "service_role";


--
-- Name: TABLE "comments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";


--
-- Name: TABLE "conversations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";


--
-- Name: TABLE "external_services"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."external_services" TO "authenticated";
GRANT ALL ON TABLE "public"."external_services" TO "service_role";


--
-- Name: TABLE "messages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";


--
-- Name: TABLE "oauth_page_sessions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."oauth_page_sessions" TO "service_role";


--
-- Name: TABLE "post_analytics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."post_analytics" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."post_analytics" TO "authenticated";


--
-- Name: TABLE "posts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."posts" TO "service_role";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";


--
-- Name: TABLE "processed_comments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."processed_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."processed_comments" TO "service_role";


--
-- Name: TABLE "published_posts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."published_posts" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."published_posts" TO "authenticated";


--
-- Name: TABLE "social_accounts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."social_accounts" TO "service_role";
GRANT ALL ON TABLE "public"."social_accounts" TO "authenticated";


--
-- Name: TABLE "webhook_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";


--
-- Name: TABLE "workspace_brand_profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workspace_brand_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_brand_profiles" TO "service_role";


--
-- Name: TABLE "workspace_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";


--
-- Name: TABLE "workspace_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workspace_settings" TO "service_role";
GRANT ALL ON TABLE "public"."workspace_settings" TO "authenticated";


--
-- Name: TABLE "workspaces"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workspaces" TO "service_role";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";


--
-- PostgreSQL database dump complete
--

\unrestrict gArTsQ3fMTpeiBG7eLzWbzje04WRT5x7OjTkxcvVeooU8EXkcNZc7GAWK7XKAUW

