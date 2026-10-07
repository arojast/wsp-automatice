ALTER TABLE `jobs` ADD `chat_id` integer REFERENCES chats(id);
ALTER TABLE `jobs` ADD `message_body` text;
