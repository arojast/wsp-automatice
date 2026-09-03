CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'CREATING' NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`zip_received_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batches_number_unique` ON `batches` (`number`);