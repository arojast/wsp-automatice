ALTER TABLE `jobs` ADD `document_id` integer REFERENCES documents(id);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_type_message_unique` ON `jobs` (`type`,`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_type_document_unique` ON `jobs` (`type`,`document_id`);