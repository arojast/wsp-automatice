import { customType } from 'drizzle-orm/sqlite-core';

function formatDate(value: Date): string {
    const pad = (part: number) => String(part).padStart(2, '0');

    return [
        value.getUTCFullYear(),
        pad(value.getUTCMonth() + 1),
        pad(value.getUTCDate()),
    ].join('-') + ` ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

export const datetime = customType<{
    data: Date;
    driverData: string;
}>({
    dataType() {
        return 'text';
    },
    toDriver(value) {
        return formatDate(value);
    },
    fromDriver(value) {
        return new Date(`${value.replace(' ', 'T')}Z`);
    },
});
