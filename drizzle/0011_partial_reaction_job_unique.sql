DROP INDEX `jobs_type_message_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_type_message_unique` ON `jobs` (`type`,`message_id`) WHERE type = 'REACT_MESSAGE';