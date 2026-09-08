PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'CREATING' NOT NULL,
	`created_at` text NOT NULL,
	`sent_at` text,
	`zip_received_at` text,
	`completed_at` text
);
--> statement-breakpoint
INSERT INTO `__new_batches`("id", "number", "status", "created_at", "sent_at", "zip_received_at", "completed_at") SELECT "id", "number", "status", datetime("created_at", 'unixepoch'), datetime("sent_at", 'unixepoch'), datetime("zip_received_at", 'unixepoch'), datetime("completed_at", 'unixepoch') FROM `batches`;--> statement-breakpoint
DROP TABLE `batches`;--> statement-breakpoint
ALTER TABLE `__new_batches` RENAME TO `batches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`whatsapp_chat_id` text NOT NULL,
	`name` text,
	`is_group` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_chats`("id", "whatsapp_chat_id", "name", "is_group", "created_at", "updated_at") SELECT "id", "whatsapp_chat_id", "name", "is_group", datetime("created_at", 'unixepoch'), datetime("updated_at", 'unixepoch') FROM `chats`;--> statement-breakpoint
DROP TABLE `chats`;--> statement-breakpoint
ALTER TABLE `__new_chats` RENAME TO `chats`;--> statement-breakpoint
CREATE UNIQUE INDEX `chats_whatsapp_chat_id_unique` ON `chats` (`whatsapp_chat_id`);--> statement-breakpoint
CREATE TABLE `__new_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifier_id` integer NOT NULL,
	`filename` text NOT NULL,
	`file_path` text NOT NULL,
	`received_at` text,
	`sent_at` text,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	FOREIGN KEY (`identifier_id`) REFERENCES `identifiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_documents`("id", "identifier_id", "filename", "file_path", "received_at", "sent_at", "status") SELECT "id", "identifier_id", "filename", "file_path", datetime("received_at", 'unixepoch'), datetime("sent_at", 'unixepoch'), "status" FROM `documents`;--> statement-breakpoint
DROP TABLE `documents`;--> statement-breakpoint
ALTER TABLE `__new_documents` RENAME TO `documents`;--> statement-breakpoint
CREATE TABLE `__new_identifiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` integer NOT NULL,
	`chat_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`value` text NOT NULL,
	`type` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_identifiers`("id", "message_id", "chat_id", "batch_id", "value", "type", "created_at") SELECT "id", "message_id", "chat_id", "batch_id", "value", "type", datetime("created_at", 'unixepoch') FROM `identifiers`;--> statement-breakpoint
DROP TABLE `identifiers`;--> statement-breakpoint
ALTER TABLE `__new_identifiers` RENAME TO `identifiers`;--> statement-breakpoint
CREATE TABLE `__new_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`message_id` integer NOT NULL,
	`document_id` integer,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`scheduled_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`processed_at` text,
	`error` text,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_jobs`("id", "type", "message_id", "document_id", "status", "scheduled_at", "attempts", "created_at", "processed_at", "error") SELECT "id", "type", "message_id", "document_id", "status", datetime("scheduled_at", 'unixepoch'), "attempts", datetime("created_at", 'unixepoch'), datetime("processed_at", 'unixepoch'), "error" FROM `jobs`;--> statement-breakpoint
DROP TABLE `jobs`;--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_type_message_unique` ON `jobs` (`type`,`message_id`) WHERE type = 'REACT_MESSAGE';--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_type_document_unique` ON `jobs` (`type`,`document_id`);--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`whatsapp_message_id` text NOT NULL,
	`chat_id` integer NOT NULL,
	`sender_name` text,
	`sender_id` text,
	`body` text NOT NULL,
	`message_datetime` text NOT NULL,
	`created_at` text NOT NULL,
	`processing_status` text DEFAULT 'pending' NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "whatsapp_message_id", "chat_id", "sender_name", "sender_id", "body", "message_datetime", "created_at", "processing_status", "is_deleted", "deleted_at") SELECT "id", "whatsapp_message_id", "chat_id", "sender_name", "sender_id", "body", datetime("message_datetime", 'unixepoch'), datetime("created_at", 'unixepoch'), "processing_status", "is_deleted", datetime("deleted_at", 'unixepoch') FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_whatsapp_message_id_unique` ON `messages` (`whatsapp_message_id`);