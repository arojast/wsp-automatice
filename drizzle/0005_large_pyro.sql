PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`whatsapp_message_id` text NOT NULL,
	`chat_id` integer NOT NULL,
	`sender_name` text,
	`sender_id` text,
	`body` text NOT NULL,
	`message_datetime` integer NOT NULL,
	`created_at` integer NOT NULL,
	`processing_status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_messages`("id", "whatsapp_message_id", "chat_id", "sender_name", "sender_id", "body", "message_datetime", "created_at", "processing_status") SELECT "id", "whatsapp_message_id", "chat_id", "sender_name", "sender_id", "body", "message_datetime", "created_at", "processing_status" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_whatsapp_message_id_unique` ON `messages` (`whatsapp_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chats_whatsapp_chat_id_unique` ON `chats` (`whatsapp_chat_id`);