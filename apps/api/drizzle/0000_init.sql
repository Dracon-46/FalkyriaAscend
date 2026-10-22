CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'Consistência' NOT NULL,
	"icon" text DEFAULT 'trophy' NOT NULL,
	"rarity" text DEFAULT 'common' NOT NULL,
	"criteria" jsonb NOT NULL,
	"secret" boolean DEFAULT false NOT NULL,
	"reward_xp" integer DEFAULT 0 NOT NULL,
	"reward_coins" integer DEFAULT 0 NOT NULL,
	"reward_item_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"title" text,
	"local_date" date NOT NULL,
	"started_at" timestamp with time zone,
	"duration_min" integer NOT NULL,
	"distance_km" numeric,
	"elevation_m" integer,
	"avg_heart_rate" integer,
	"perceived_effort" integer,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"deleted_at" timestamp with time zone,
	"grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_duration_range" CHECK ("activities"."duration_min" > 0 and "activities"."duration_min" <= 1440),
	CONSTRAINT "activity_effort_range" CHECK ("activities"."perceived_effort" is null or ("activities"."perceived_effort" between 1 and 10))
);
--> statement-breakpoint
CREATE TABLE "activity_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"set_index" integer NOT NULL,
	"reps" integer NOT NULL,
	"weight_kg" numeric,
	"rir" integer
);
--> statement-breakpoint
CREATE TABLE "activity_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"icon" text DEFAULT 'activity' NOT NULL,
	"skill_id" uuid,
	"intensity" real DEFAULT 1 NOT NULL,
	"attribute_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"local_date" date NOT NULL,
	"score" numeric NOT NULL,
	"max_score" numeric NOT NULL,
	"notes" text,
	"grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'geral' NOT NULL,
	"color" text DEFAULT '#c9a84c' NOT NULL,
	"icon" text DEFAULT 'shield' NOT NULL,
	"progression_criteria" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attributes_xp_nonneg" CHECK ("attributes"."xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#c9a84c' NOT NULL,
	"icon" text DEFAULT 'circle' NOT NULL,
	"is_basic_need" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "character_progress" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"lifetime_xp" bigint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_xp_nonneg" CHECK ("character_progress"."lifetime_xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "coin_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"reason" text NOT NULL,
	"grant_id" uuid,
	"purchase_id" uuid,
	"penalty_id" uuid,
	"reversal_of" uuid,
	"balance_after" integer NOT NULL,
	"local_date" date NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coin_tx_balance_nonneg" CHECK ("coin_transactions"."balance_after" >= 0),
	CONSTRAINT "coin_tx_nonzero" CHECK ("coin_transactions"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"muscle_group" text DEFAULT 'geral' NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_dependencies" (
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"depends_on_id" uuid NOT NULL,
	CONSTRAINT "goal_dependencies_goal_id_depends_on_id_pk" PRIMARY KEY("goal_id","depends_on_id"),
	CONSTRAINT "goal_dep_self" CHECK ("goal_dependencies"."goal_id" <> "goal_dependencies"."depends_on_id")
);
--> statement-breakpoint
CREATE TABLE "goal_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"title" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"due_date" date,
	"done_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"priority" text DEFAULT 'medium' NOT NULL,
	"difficulty" text DEFAULT 'hard' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" date,
	"deadline" date,
	"progress_mode" text DEFAULT 'milestones' NOT NULL,
	"metric" text,
	"metric_ref_id" uuid,
	"metric_start" numeric,
	"metric_target" numeric,
	"metric_current" numeric,
	"unit" text,
	"completed_at" timestamp with time zone,
	"grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grant_attribute_xp" (
	"grant_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "grant_attribute_xp_grant_id_attribute_id_pk" PRIMARY KEY("grant_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "grant_skill_xp" (
	"grant_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "grant_skill_xp_grant_id_skill_id_pk" PRIMARY KEY("grant_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "habit_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"source" text DEFAULT 'user' NOT NULL,
	"grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habit_penalty_rules" (
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	CONSTRAINT "habit_penalty_rules_habit_id_rule_id_pk" PRIMARY KEY("habit_id","rule_id")
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"difficulty" text DEFAULT 'routine' NOT NULL,
	"frequency" text DEFAULT 'daily' NOT NULL,
	"weekdays_mask" integer DEFAULT 127 NOT NULL,
	"times_per_week" integer DEFAULT 3 NOT NULL,
	"time_of_day" text,
	"completion_criteria" text DEFAULT '' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"tolerance_per_week" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"paused_until" date,
	"is_basic_need" boolean DEFAULT false NOT NULL,
	"attribute_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"external_account_id" text,
	"scopes" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"external_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"purchase_id" uuid,
	"source" text NOT NULL,
	"slot" text,
	"state" text DEFAULT 'owned' NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'gem' NOT NULL,
	"category" text DEFAULT 'Recompensas pessoais' NOT NULL,
	"kind" text NOT NULL,
	"rarity" text DEFAULT 'common' NOT NULL,
	"price" integer,
	"active" boolean DEFAULT true NOT NULL,
	"available_from" timestamp with time zone,
	"available_until" timestamp with time zone,
	"min_level" integer,
	"required_achievement_id" uuid,
	"purchase_limit" integer,
	"cooldown_days" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_price_nonneg" CHECK ("items"."price" is null or "items"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#6b7fd7' NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "level_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"reached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"grant_id" uuid,
	"config_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"description" text NOT NULL,
	"item_id" uuid,
	"coins" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "level_rewards_coins" CHECK ("level_rewards"."coins" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mission_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"data" jsonb,
	"actor" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"title" text NOT NULL,
	"metric" text DEFAULT 'manual' NOT NULL,
	"metric_ref_id" uuid,
	"target" numeric NOT NULL,
	"current" numeric DEFAULT 0 NOT NULL,
	"unit" text,
	"optional" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mission_penalty_rules" (
	"user_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	CONSTRAINT "mission_penalty_rules_mission_id_rule_id_pk" PRIMARY KEY("mission_id","rule_id")
);
--> statement-breakpoint
CREATE TABLE "mission_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"difficulty" text NOT NULL,
	"category_id" uuid,
	"recurrence" text DEFAULT 'none' NOT NULL,
	"weekdays_mask" integer DEFAULT 127 NOT NULL,
	"duration_days" integer DEFAULT 1 NOT NULL,
	"attribute_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"penalty_rule_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid,
	"period_key" text,
	"goal_id" uuid,
	"season_id" uuid,
	"category_id" uuid,
	"parent_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"difficulty" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"status_reason" text,
	"start_date" date,
	"due_date" date,
	"completion_mode" text DEFAULT 'manual' NOT NULL,
	"reward_xp_override" integer,
	"reward_coins_override" integer,
	"is_secret" boolean DEFAULT false NOT NULL,
	"evidence_required" boolean DEFAULT false NOT NULL,
	"evidence" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attribute_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_on" date,
	"grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_visits" (
	"user_id" uuid NOT NULL,
	"page" text NOT NULL,
	"first_visit_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_visits_user_id_page_pk" PRIMARY KEY("user_id","page")
);
--> statement-breakpoint
CREATE TABLE "penalty_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rule_id" uuid,
	"rule_snapshot" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"source_title" text NOT NULL,
	"local_date" date NOT NULL,
	"type" text NOT NULL,
	"step" integer NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"duration_days" integer,
	"reduction_pct" real,
	"expires_on" date,
	"target_item_id" uuid,
	"target_skill_id" uuid,
	"explanation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "penalty_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"base_amount" integer DEFAULT 0 NOT NULL,
	"escalation_step" integer DEFAULT 0 NOT NULL,
	"max_amount" integer DEFAULT 0 NOT NULL,
	"duration_days" integer,
	"reduction_pct" real,
	"target_item_id" uuid,
	"target_skill_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"exercise_id" uuid,
	"value" numeric NOT NULL,
	"unit" text NOT NULL,
	"activity_id" uuid,
	"achieved_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"total" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"item_snapshot" jsonb NOT NULL,
	"refunded_at" timestamp with time zone,
	"refund_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_qty" CHECK ("purchases"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "quick_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"normalized_key" text NOT NULL,
	"category_id" uuid,
	"attribute_id" uuid,
	"local_date" date NOT NULL,
	"grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"min_level" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "reward_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"xp_source" text NOT NULL,
	"category_id" uuid,
	"title" text NOT NULL,
	"xp" integer NOT NULL,
	"coins" integer NOT NULL,
	"local_date" date NOT NULL,
	"config_version" integer NOT NULL,
	"explanation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reversal_of" uuid,
	"reversed_at" timestamp with time zone,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"title" text NOT NULL,
	"threshold_xp" integer NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"item_id" uuid,
	"claimed_at" timestamp with time zone,
	"grant_id" uuid
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"theme" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"summary" jsonb,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_range" CHECK ("seasons"."end_date" >= "seasons"."start_date")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attribute_id" uuid,
	"parent_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'sparkles' NOT NULL,
	"unlock_level" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_xp_nonneg" CHECK ("skills"."xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "study_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"total_units" integer DEFAULT 1 NOT NULL,
	"completed_units" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"resource_id" uuid,
	"local_date" date NOT NULL,
	"minutes" integer NOT NULL,
	"activity_type" text DEFAULT 'reading' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"result" text,
	"notes" text,
	"evidence_url" text,
	"units_completed" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_minutes_range" CHECK ("study_sessions"."minutes" > 0 and "study_sessions"."minutes" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "study_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"area_id" uuid,
	"skill_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#6b7fd7' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"evidence_url" text,
	"achieved_on" date NOT NULL,
	"grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_prerequisites" (
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"prerequisite_id" uuid NOT NULL,
	CONSTRAINT "subject_prerequisites_subject_id_prerequisite_id_pk" PRIMARY KEY("subject_id","prerequisite_id"),
	CONSTRAINT "subject_prereq_self" CHECK ("subject_prerequisites"."subject_id" <> "subject_prerequisites"."prerequisite_id")
);
--> statement-breakpoint
CREATE TABLE "unavailability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"category_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unavailability_range" CHECK ("unavailability"."end_date" >= "unavailability"."start_date")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"grant_id" uuid,
	"snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"theme" text DEFAULT 'medieval' NOT NULL,
	"custom_theme" jsonb,
	"reduced_motion" text DEFAULT 'system' NOT NULL,
	"dashboard_widgets" jsonb,
	"notification_prefs" jsonb,
	"penalties_enabled" boolean DEFAULT true NOT NULL,
	"penalties_suspended_until" date,
	"recovery_mode_until" date,
	"allow_skill_xp_penalty" boolean DEFAULT false NOT NULL,
	"last_evaluated_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"display_name" text NOT NULL,
	"character_class" text,
	"bio" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"total_earned" integer DEFAULT 0 NOT NULL,
	"total_spent" integer DEFAULT 0 NOT NULL,
	"total_penalties" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_balance_nonneg" CHECK ("wallets"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_reward_item_id_items_id_fk" FOREIGN KEY ("reward_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_type_id_activity_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_sets" ADD CONSTRAINT "activity_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_sets" ADD CONSTRAINT "activity_sets_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_sets" ADD CONSTRAINT "activity_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_types" ADD CONSTRAINT "activity_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_types" ADD CONSTRAINT "activity_types_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_study_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."study_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_progress" ADD CONSTRAINT "character_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_penalty_id_penalty_applications_id_fk" FOREIGN KEY ("penalty_id") REFERENCES "public"."penalty_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_reversal_of_coin_transactions_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."coin_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_configs" ADD CONSTRAINT "game_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_dependencies" ADD CONSTRAINT "goal_dependencies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_dependencies" ADD CONSTRAINT "goal_dependencies_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_dependencies" ADD CONSTRAINT "goal_dependencies_depends_on_id_goals_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_milestones" ADD CONSTRAINT "goal_milestones_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_attribute_xp" ADD CONSTRAINT "grant_attribute_xp_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_attribute_xp" ADD CONSTRAINT "grant_attribute_xp_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_attribute_xp" ADD CONSTRAINT "grant_attribute_xp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_skill_xp" ADD CONSTRAINT "grant_skill_xp_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_skill_xp" ADD CONSTRAINT "grant_skill_xp_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_skill_xp" ADD CONSTRAINT "grant_skill_xp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_penalty_rules" ADD CONSTRAINT "habit_penalty_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_penalty_rules" ADD CONSTRAINT "habit_penalty_rules_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_penalty_rules" ADD CONSTRAINT "habit_penalty_rules_rule_id_penalty_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."penalty_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_required_achievement_id_achievements_id_fk" FOREIGN KEY ("required_achievement_id") REFERENCES "public"."achievements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_areas" ADD CONSTRAINT "knowledge_areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_history" ADD CONSTRAINT "level_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_history" ADD CONSTRAINT "level_history_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_rewards" ADD CONSTRAINT "level_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_rewards" ADD CONSTRAINT "level_rewards_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_events" ADD CONSTRAINT "mission_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_events" ADD CONSTRAINT "mission_events_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_objectives" ADD CONSTRAINT "mission_objectives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_objectives" ADD CONSTRAINT "mission_objectives_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_penalty_rules" ADD CONSTRAINT "mission_penalty_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_penalty_rules" ADD CONSTRAINT "mission_penalty_rules_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_penalty_rules" ADD CONSTRAINT "mission_penalty_rules_rule_id_penalty_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."penalty_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_templates" ADD CONSTRAINT "mission_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_templates" ADD CONSTRAINT "mission_templates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_template_id_mission_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."mission_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_parent_id_missions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_visits" ADD CONSTRAINT "page_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_applications" ADD CONSTRAINT "penalty_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_applications" ADD CONSTRAINT "penalty_applications_rule_id_penalty_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."penalty_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_applications" ADD CONSTRAINT "penalty_applications_target_item_id_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_applications" ADD CONSTRAINT "penalty_applications_target_skill_id_skills_id_fk" FOREIGN KEY ("target_skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_rules" ADD CONSTRAINT "penalty_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_rules" ADD CONSTRAINT "penalty_rules_target_item_id_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penalty_rules" ADD CONSTRAINT "penalty_rules_target_skill_id_skills_id_fk" FOREIGN KEY ("target_skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_logs" ADD CONSTRAINT "quick_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_logs" ADD CONSTRAINT "quick_logs_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_logs" ADD CONSTRAINT "quick_logs_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_logs" ADD CONSTRAINT "quick_logs_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranks" ADD CONSTRAINT "ranks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_reversal_of_reward_grants_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."reward_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_rewards" ADD CONSTRAINT "season_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_rewards" ADD CONSTRAINT "season_rewards_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_rewards" ADD CONSTRAINT "season_rewards_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_rewards" ADD CONSTRAINT "season_rewards_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_parent_id_skills_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_resources" ADD CONSTRAINT "study_resources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_resources" ADD CONSTRAINT "study_resources_subject_id_study_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."study_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_resources" ADD CONSTRAINT "study_resources_parent_id_study_resources_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."study_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_subject_id_study_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."study_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_resource_id_study_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."study_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_subjects" ADD CONSTRAINT "study_subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_subjects" ADD CONSTRAINT "study_subjects_area_id_knowledge_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."knowledge_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_subjects" ADD CONSTRAINT "study_subjects_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_milestones" ADD CONSTRAINT "subject_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_milestones" ADD CONSTRAINT "subject_milestones_subject_id_study_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."study_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_milestones" ADD CONSTRAINT "subject_milestones_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_subject_id_study_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."study_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_prerequisites" ADD CONSTRAINT "subject_prerequisites_prerequisite_id_study_subjects_id_fk" FOREIGN KEY ("prerequisite_id") REFERENCES "public"."study_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_grant_id_reward_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."reward_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_key_uq" ON "achievements" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "activities_user_date_idx" ON "activities" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_ext_uq" ON "activities" USING btree ("user_id","source","external_id") WHERE "activities"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "attributes_code_uq" ON "attributes" USING btree ("user_id","code");--> statement-breakpoint
CREATE INDEX "audit_user_created_idx" ON "audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_uq" ON "categories" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "coin_tx_user_created_idx" ON "coin_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "coin_tx_seq_uq" ON "coin_transactions" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "coin_tx_reversal_uq" ON "coin_transactions" USING btree ("reversal_of");--> statement-breakpoint
CREATE UNIQUE INDEX "game_configs_version_uq" ON "game_configs" USING btree ("user_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "game_configs_active_uq" ON "game_configs" USING btree ("user_id") WHERE "game_configs"."active";--> statement-breakpoint
CREATE INDEX "gax_user_idx" ON "grant_attribute_xp" USING btree ("user_id","attribute_id");--> statement-breakpoint
CREATE INDEX "gsx_user_idx" ON "grant_skill_xp" USING btree ("user_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_checkins_uq" ON "habit_checkins" USING btree ("habit_id","local_date");--> statement-breakpoint
CREATE INDEX "habit_checkins_user_date_idx" ON "habit_checkins" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_conn_uq" ON "integration_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_events_dedupe_uq" ON "integration_events" USING btree ("provider","dedupe_key");--> statement-breakpoint
CREATE INDEX "inventory_user_idx" ON "inventory_items" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_equipped_slot_uq" ON "inventory_items" USING btree ("user_id","slot") WHERE "inventory_items"."state" = 'equipped';--> statement-breakpoint
CREATE UNIQUE INDEX "level_history_uq" ON "level_history" USING btree ("user_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "level_rewards_uq" ON "level_rewards" USING btree ("user_id","level");--> statement-breakpoint
CREATE INDEX "mission_events_mission_idx" ON "mission_events" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "missions_user_status_idx" ON "missions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_template_period_uq" ON "missions" USING btree ("template_id","period_key");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "penalty_idem_uq" ON "penalty_applications" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "penalty_user_date_idx" ON "penalty_applications" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "pr_user_kind_idx" ON "personal_records" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_idem_uq" ON "purchases" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "quick_logs_user_date_idx" ON "quick_logs" USING btree ("user_id","local_date","normalized_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ranks_level_uq" ON "ranks" USING btree ("user_id","min_level");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_grants_idem_uq" ON "reward_grants" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_grants_reversal_uq" ON "reward_grants" USING btree ("reversal_of");--> statement-breakpoint
CREATE INDEX "reward_grants_user_date_idx" ON "reward_grants" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "reward_grants_source_idx" ON "reward_grants" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skills_user_idx" ON "skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_sessions_user_date_idx" ON "study_sessions" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "study_sessions_ext_uq" ON "study_sessions" USING btree ("user_id","source","external_id") WHERE "study_sessions"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_uq" ON "user_achievements" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));