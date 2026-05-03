CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flowise_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"question" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"connect_ms" integer NOT NULL,
	"ttft_ms" integer NOT NULL,
	"total_ms" integer NOT NULL,
	"tokens" integer NOT NULL,
	"chars" integer NOT NULL,
	"nodes" integer NOT NULL,
	"tools" integer NOT NULL,
	"unknown_events" integer NOT NULL,
	"status" text NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "tts_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"text_preview" text NOT NULL,
	"chars" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"cache_hit" boolean NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_session_id_conversation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."conversation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conv_msg_session_idx" ON "conversation_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "flowise_traces_started_at_idx" ON "flowise_traces" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "tts_traces_started_at_idx" ON "tts_traces" USING btree ("started_at");