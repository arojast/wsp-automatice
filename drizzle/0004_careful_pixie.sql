CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifier_id` integer NOT NULL,
	`filename` text NOT NULL,
	`file_path` text NOT NULL,
	`received_at` integer,
	`sent_at` integer,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	FOREIGN KEY (`identifier_id`) REFERENCES `identifiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_identifiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` integer NOT NULL,
	`chat_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`value` text NOT NULL,
	`type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_identifiers`("id", "message_id", "chat_id", "batch_id", "value", "type", "created_at") SELECT "id", "message_id", "chat_id", "batch_id", "value", "type", "created_at" FROM `identifiers`;--> statement-breakpoint
DROP TABLE `identifiers`;--> statement-breakpoint
ALTER TABLE `__new_identifiers` RENAME TO `identifiers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;