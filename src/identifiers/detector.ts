export type IdentifierType = 'RFC' | 'CURP';

export interface DetectedIdentifier {
    value: string;
    type: IdentifierType;
}

const CURP_REGEX =
    /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g;

const RFC_REGEX =
    /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g;

export function detectIdentifiers(text: string): DetectedIdentifier[] {
    const normalizedText = text.toUpperCase();

    const identifiers: DetectedIdentifier[] = [];

    const curps = normalizedText.match(CURP_REGEX) ?? [];

    for (const curp of curps) {
        identifiers.push({
            value: curp,
            type: 'CURP',
        });
    }

    const rfcs = normalizedText.match(RFC_REGEX) ?? [];

    for (const rfc of rfcs) {
        identifiers.push({
            value: rfc,
            type: 'RFC',
        });
    }

    return identifiers;
}