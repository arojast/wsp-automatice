ALTER TABLE `messages` ADD `is_deleted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `deleted_at` integer;