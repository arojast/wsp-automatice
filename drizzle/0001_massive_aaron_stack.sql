CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`whatsapp_message_id` text NOT NULL,
	`chat_id` integer NOT NULL,
	`sender_name` text,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`message_datetime` integer NOT NULL,
	`created_at` integer NOT NULL,
	`processing_status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_whatsapp_message_id_unique` ON `messages` (`whatsapp_message_id`);