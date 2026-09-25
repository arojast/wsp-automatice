DROP INDEX `jobs_type_message_unique`;--> statement-breakpoint
DROP INDEX `jobs_type_document_unique`;--> statement-breakpoint
ALTER TABLE `jobs` ADD `file_path` text;