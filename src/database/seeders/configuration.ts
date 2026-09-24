import { db } from "../client.js";
import { configuration } from "../schema/configuration.js";

const configurations = [
    {
        id: 1,
        name: "reaction_active",
        value: "1",
    },
    {
        id: 2,
        name: "last_scheduled_at",
        value: "",
    },
];

for (const config of configurations) {
    await db
        .insert(configuration)
        .values(config)
        .onConflictDoNothing({
            target: configuration.id,
        });
}

console.log("Configuration seeded successfully.");