import { db } from '../client.js';
import { configuration } from '../schema/index.js';
import { eq } from 'drizzle-orm';

const REACTION_ACTIVE = 'reaction_active';

export async function getReactionActive(): Promise<boolean> {
    const config = await db
        .select()
        .from(configuration)
        .where(eq(configuration.name, REACTION_ACTIVE))
        .get();

    if (!config) {
        return true;
    }

    return config.value === 'true';
}

export async function setReactionActive(
    active: boolean,
): Promise<void> {
    const existing = await db
        .select()
        .from(configuration)
        .where(eq(configuration.name, REACTION_ACTIVE))
        .get();

    if (existing) {
        await db
            .update(configuration)
            .set({
                value: active ? 'true' : 'false',
                updatedAt: new Date(),
            })
            .where(eq(configuration.id, existing.id));

        return;
    }

    await db
        .insert(configuration)
        .values({
            name: REACTION_ACTIVE,
            value: active ? 'true' : 'false',
        });
}